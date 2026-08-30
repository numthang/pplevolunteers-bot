import { gateCase } from '@/lib/caseGate.js'
import { addTimelineEvents, getTimeline, advanceSyncWatermark, advanceAttachmentWatermark } from '@/db/cases.js'
import { importThreadAttachments } from '@/lib/caseAttachmentSync.js'
import { askAi } from '@/lib/ai.js'
import pool from '@/db/index.js'
import { getPrompt } from '@/db/orgAiPrompts.js'

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

/** กันเธรดยาวมาก (sync ครั้งแรก) ยัดเข้า prompt ก้อนเดียวจนเกิน context/ค่า AI พุ่ง */
const MAX_SYNC_MESSAGES = 500
/** จำนวน event เดิมที่ส่งให้ AI ดูเพื่อกันสกัดซ้ำ */
const DEDUP_CONTEXT_ENTRIES = 30
/**
 * ข้อความต่อ 1 รอบสกัด — เลื่อน watermark ทีละก้อน ไม่ใช่ทีเดียวจบ
 * 80 = เธรดปกติจบใน 1-2 รอบ ส่วนเธรดยาวสุด (500) ใช้ 7 รอบ โดยแต่ละรอบ
 * คายไม่เกินไม่กี่ event = ไม่มีทางชน max_tokens จนเคสตันซ่อมไม่ได้
 */
const CHUNK_MESSAGES = 80
/**
 * เพดานคำตอบต่อรอบ — เดิม 1024 ทั้งเธรด ทำให้ได้แค่ 4-6 event แล้วสรุปสั้นจนอ่านไม่รู้เรื่อง
 * (ไทยกิน ~1 token/ตัวอักษร ดู web/lib/ai.js) 8000 = เหลือเฟือสำหรับ 1 ก้อน
 */
const TIMELINE_MAX_TOKENS = 8000

async function discordFetch(path) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  })
  if (!res.ok) throw new Error(`Discord ${res.status}: ${path}`)
  return res.json()
}

async function fetchMessagesAfter(threadId, afterId) {
  const msgs = []
  let after = afterId
  while (msgs.length < MAX_SYNC_MESSAGES) {
    const qs = after ? `?after=${after}&limit=100` : '?limit=100'
    const batch = await discordFetch(`/channels/${threadId}/messages${qs}`)
    if (!batch.length) break
    msgs.push(...batch)
    if (batch.length < 100) break
    after = batch.at(-1).id
  }
  // เกิน cap → ตัดท้ายทิ้ง แล้วปล่อยให้ watermark หยุดตรงนั้น (กดซ้ำเพื่อ sync ต่อได้)
  return msgs.sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_SYNC_MESSAGES)
}

/** งานเบา — สกัด event สั้นๆ ไม่ต้องใช้โมเดลตัวใหญ่ (posts ถึงจะปัก AI_MODEL) */
const TIMELINE_MODEL = 'claude-haiku-4-5-20251001'

/** POST /api/case/[ref]/timeline/refresh — ดึง Discord message ใหม่ → AI generate timeline */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { orgId, caseRow } = gate

  if (!caseRow.discord_thread_id) {
    return Response.json({ error: 'เคสนี้ไม่มี Discord thread' }, { status: 400 })
  }

  // ── ① ไฟล์แนบ (watermark เส้นที่ 2) ──
  // ต้องทำ **ก่อน** early-return ของ timeline: เคสเก่าที่ timeline sync ครบแล้วจะไม่มีข้อความใหม่
  // ถ้าวางไว้ทีหลังจะไม่มีวัน backfill รูปเก่าที่เส้นแรกเลยไปแล้ว
  // best-effort — ไฟล์พังไม่ควรทำให้ timeline sync ล้มทั้งยวง
  let files = { imported: 0, skipped: 0, failed: 0 }
  try {
    const r = await importThreadAttachments({
      threadId: caseRow.discord_thread_id,
      caseId: caseRow.id,
      orgId,
      afterId: caseRow.last_attachment_message_id,
    })
    files = { imported: r.imported, skipped: r.skipped, failed: r.failed }
    // มีไฟล์ที่พลาดชั่วคราว → ไม่เลื่อน watermark ปล่อยให้กดรอบหน้าเก็บตก
    // (insert มี unique index กันซ้ำอยู่แล้ว กวาดทับของเดิมไม่เกิด duplicate)
    if (r.lastMessageId && r.failed === 0) {
      await advanceAttachmentWatermark(caseRow.id, caseRow.last_attachment_message_id, r.lastMessageId)
    }
  } catch (e) {
    console.error('[case/timeline/refresh] นำเข้าไฟล์แนบไม่สำเร็จ', { ref }, e.message)
  }

  // ── ② timeline (watermark เส้นแรก) ──
  const msgs = await fetchMessagesAfter(caseRow.discord_thread_id, caseRow.last_synced_message_id)
  if (!msgs.length) return Response.json({ ok: true, added: 0, files, entries: await getTimeline(caseRow.id) })

  // สกัดทีละก้อน แล้วเลื่อน watermark ทุกก้อนที่สำเร็จ — กันเธรดยาว "ตันถาวร":
  // ถ้ายิงรวดเดียว 500 ข้อความแล้ว AI ตอบยาวเกิน max_tokens มันจะ throw ทุกครั้งที่กด
  // (watermark ไม่ขยับ → รอบหน้าดึงชุดเดิม → พังซ้ำเหมือนเดิมตลอดไป) เคสนั้นจะซ่อมไม่ได้เลย
  // แบ่งก้อนแล้วกดซ้ำ = คืบหน้าทีละก้อนเสมอ
  const chunks = []
  for (let i = 0; i < msgs.length; i += CHUNK_MESSAGES) chunks.push(msgs.slice(i, i + CHUNK_MESSAGES))

  let watermark = caseRow.last_synced_message_id
  let added = 0
  let stopped = null // หยุดกลางคัน — ก้อนที่เหลือยังไม่ sync กดซ้ำเพื่อไปต่อได้

  for (const chunk of chunks) {
    const text = chunk
      .filter(m => m.content?.trim() && !m.author?.bot)
      // calendar: 'gregory' กันปี พ.ศ. หลุดเข้าไปในข้อความที่ป้อนให้ AI (default th-TH ใช้ปี พ.ศ.
      // AI เห็นเลขปีนั้นแล้วเข้าใจว่าเป็น ค.ศ. ตรงๆ → occurred_at ที่สกัดออกมาเพี้ยน +543 ปี)
      .map(m => `[${new Date(m.timestamp).toLocaleString('th-TH', { calendar: 'gregory' })}] ${m.author?.username}: ${m.content}`)
      .join('\n')

    let events = []
    // text ว่าง = ก้อนนี้มีแต่รูป/ข้อความบอท → ไม่มีอะไรให้สกัด แต่ **ยังต้องเลื่อน watermark**
    // ไม่งั้นก้อนรูปล้วนจะขวางทางถาวร กดกี่ครั้งก็ไม่ผ่านไปก้อนถัดไป
    if (text.trim()) {
      // อ่าน timeline สดทุกก้อน — ก้อนก่อนหน้าเพิ่ง insert ไป ต้องให้ AI เห็นด้วยถึงจะกันสกัดซ้ำได้
      const existing = await getTimeline(caseRow.id)
      const dedupContext = existing.slice(-DEDUP_CONTEXT_ENTRIES).map(e => `- ${e.body}`).join('\n')
      const prompt = [
        `หัวข้อเรื่องร้องเรียน: ${caseRow.title}`,
        dedupContext && `\ntimeline ที่บันทึกไว้แล้ว (ห้ามสกัดซ้ำ):\n${dedupContext}`,
        `\nบทสนทนาใหม่:\n${text}`,
      ].filter(Boolean).join('\n')

      // AI ล่ม → หยุดทั้งลูปก่อนถึงท่อน watermark เสมอ ห้ามกลืนเป็น events = []
      // (กลืน = watermark เลื่อนต่อทั้งที่ยังไม่ได้สกัด → ข้อความก้อนนั้นหายถาวร กดซ้ำก็ไม่กลับมา)
      let raw
      try {
        raw = await askAi(await getPrompt('case.timeline', orgId), prompt, { model: TIMELINE_MODEL, maxTokens: TIMELINE_MAX_TOKENS, orgId, task: 'light' })
      } catch (e) {
        console.error('[case/timeline/refresh] AI ล่ม', { ref }, e.message)
        stopped = {
          status: e?.code === 'quota' ? 429 : 502,
          // ข้อความของ askAi ตอน max_tokens เขียนไว้สำหรับโมดูล posts ("ลดจำนวนตอน") อ่านไม่รู้เรื่องในหน้าเคส
          error: e?.code === 'max_tokens'
            ? 'บทสนทนาช่วงนี้ยาวเกินกว่าที่ AI สรุปได้ในรอบเดียว — กดอีกครั้งเพื่อสกัดส่วนที่เหลือ'
            : (e?.message || 'AI ประมวลผลไม่สำเร็จ ลองใหม่อีกครั้ง'),
        }
        break
      }

      const json = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
      try {
        const parsed = JSON.parse(json)
        if (!Array.isArray(parsed)) throw new Error('ไม่ใช่ array')
        events = parsed
      } catch {
        // ⚠️ ห้ามกลืนแล้วไปต่อ — ของเดิม catch ตรงนี้แล้วปล่อย events = [] แต่ watermark ยังเลื่อน
        //    = ข้อความก้อนนั้นหายถาวร (เป็นบั๊กจริงที่เจอตอน review 2026-08-30)
        console.error('[case/timeline/refresh] AI คืนค่าที่ไม่ใช่ JSON', { ref, raw: raw.slice(0, 200) })
        stopped = { status: 502, error: 'AI ตอบกลับมาในรูปแบบที่อ่านไม่ได้ ลองใหม่อีกครั้ง' }
        break
      }
    }

    // body อาจไม่ใช่ string (AI คืนตัวเลข/object ได้) — String() ก่อนเสมอ ไม่งั้น .trim() โยน
    const toInsert = events
      .map(e => ({ body: e?.body == null ? '' : String(e.body).trim(), is_public: e?.is_public === true, occurred_at: e?.occurred_at || null }))
      .filter(e => e.body)

    // insert + เลื่อน watermark ต้อง atomic:
    //   insert พัง → rollback → watermark ไม่ขยับ → กดซ้ำได้ข้อความเดิมกลับมา
    //   คนที่ 2 กดพร้อมกัน → watermark ไม่ตรง → rollback → ไม่เกิด timeline ซ้ำ
    const lastMsgId = chunk.at(-1)?.id
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      if (lastMsgId) {
        // CAS เทียบกับ watermark ที่ขยับมาจากก้อนก่อนหน้า ไม่ใช่ค่าตอนเข้า route
        const ok = await advanceSyncWatermark(caseRow.id, watermark, lastMsgId, client)
        if (!ok) {
          await client.query('ROLLBACK')
          return Response.json({ error: 'มีคนกำลัง sync เคสนี้อยู่ ลองใหม่อีกครั้ง' }, { status: 409 })
        }
      }
      if (toInsert.length) await addTimelineEvents(caseRow.id, orgId, toInsert, 'ai', client)
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('[case/timeline/refresh] บันทึก timeline ไม่สำเร็จ', { ref }, e.message)
      return Response.json({ error: 'บันทึก timeline ไม่สำเร็จ' }, { status: 500 })
    } finally {
      client.release()
    }

    if (lastMsgId) watermark = lastMsgId
    added += toInsert.length
  }

  // พังตั้งแต่ก้อนแรกโดยยังไม่ได้ commit อะไรเลย → ตอบ error ตรงๆ ให้ user เห็นสาเหตุ
  if (stopped && watermark === caseRow.last_synced_message_id) {
    return Response.json({ error: stopped.error }, { status: stopped.status })
  }

  const entries = await getTimeline(caseRow.id)
  return Response.json({ ok: true, added, files, entries, partial: !!stopped, partialReason: stopped?.error || null })
}
