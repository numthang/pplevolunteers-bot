import { gateCase } from '@/lib/caseGate.js'
import { addTimelineEvents, getTimeline, advanceSyncWatermark, advanceAttachmentWatermark } from '@/db/cases.js'
import { importThreadAttachments } from '@/lib/caseAttachmentSync.js'
import { askAi } from '@/lib/ai.js'
import pool from '@/db/index.js'

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

/** กันเธรดยาวมาก (sync ครั้งแรก) ยัดเข้า prompt ก้อนเดียวจนเกิน context/ค่า AI พุ่ง */
const MAX_SYNC_MESSAGES = 500
/** จำนวน event เดิมที่ส่งให้ AI ดูเพื่อกันสกัดซ้ำ */
const DEDUP_CONTEXT_ENTRIES = 30

const AI_TIMELINE_SYSTEM = `วิเคราะห์บทสนทนา Discord แล้วสกัด event สำคัญออกมาเป็น timeline เรื่องร้องเรียน

กฎการสกัด:
- สกัดเฉพาะ event ที่เกิดขึ้นจริงหรือพูดถึงในบทสนทนา ห้ามแต่งเติม
- event ที่ควรสกัด: แจ้งปัญหา / นัดหมาย / ลงพื้นที่ / ส่งเรื่องต่อ / ติดตามผล / แก้ไขแล้ว / คำตอบจากหน่วยงาน
- ถ้าไม่มี event ที่ชัดเจนพอ ให้ return array ว่าง []
- occurred_at: ถ้าบทสนทนาระบุวันที่ให้แปลงเป็น ISO 8601 **ปี ค.ศ. (Gregorian) เท่านั้น** ไม่งั้นใส่ null
- body: สรุปให้ครบใจความ (เหตุ → ดำเนินการ → ผลลัพธ์) ไม่ต้องรวบสั้นจนขาดบริบทที่จำเป็น เขียนได้ 1-3 ประโยคถ้าเรื่องซับซ้อน

กฎกันซ้ำ (สำคัญ):
- ถ้ามีหัวข้อ "timeline ที่บันทึกไว้แล้ว" ให้ถือว่า event เหล่านั้นบันทึกแล้ว **ห้ามสกัดออกมาซ้ำ**
- บทสนทนามักพูดถึงเรื่องเดิมซ้ำ ("ตามที่ลงพื้นที่ไปเมื่อวาน…") — นั่นคือการอ้างถึง ไม่ใช่ event ใหม่
- สกัดเฉพาะความคืบหน้าที่ยังไม่เคยถูกบันทึกเท่านั้น

กฎ is_public:
- true: ความคืบหน้าทั่วไป เช่น ลงพื้นที่ตรวจสอบแล้ว / ส่งเรื่องให้หน่วยงาน / แก้ไขแล้ว
- false: ชื่อ/เบอร์/ที่อยู่เต็มของบุคคล / นัดหมายภายในทีม / ข้อมูลที่กระทบบุคคลที่สาม

ตอบเป็น JSON array เท่านั้น ห้ามมี markdown หรือข้อความอื่น:
[{"body":"...","is_public":true,"occurred_at":null}]`

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

  const text = msgs
    .filter(m => m.content?.trim() && !m.author?.bot)
    // calendar: 'gregory' กันปี พ.ศ. หลุดเข้าไปในข้อความที่ป้อนให้ AI (default th-TH ใช้ปี พ.ศ.
    // AI เห็นเลขปีนั้นแล้วเข้าใจว่าเป็น ค.ศ. ตรงๆ → occurred_at ที่สกัดออกมาเพี้ยน +543 ปี)
    .map(m => `[${new Date(m.timestamp).toLocaleString('th-TH', { calendar: 'gregory' })}] ${m.author?.username}: ${m.content}`)
    .join('\n')

  // ส่ง event เดิมไปด้วย ไม่งั้น AI สกัดเรื่องที่บันทึกแล้วซ้ำทุกครั้งที่ในเธรดพูดถึงอีก
  const existing = await getTimeline(caseRow.id)
  const dedupContext = existing.slice(-DEDUP_CONTEXT_ENTRIES).map(e => `- ${e.body}`).join('\n')

  let events = []
  if (text.trim()) {
    const prompt = [
      `หัวข้อเรื่องร้องเรียน: ${caseRow.title}`,
      dedupContext && `\ntimeline ที่บันทึกไว้แล้ว (ห้ามสกัดซ้ำ):\n${dedupContext}`,
      `\nบทสนทนาใหม่:\n${text}`,
    ].filter(Boolean).join('\n')
    // AI ล่ม → ต้องเด้งออกก่อนถึงท่อน watermark เสมอ ห้ามกลืนเป็น events = []
    // (กลืน = watermark เลื่อนต่อทั้งที่ยังไม่ได้สกัด → ข้อความชุดนั้นหายถาวร กดซ้ำก็ไม่กลับมา)
    let raw
    try {
      raw = await askAi(AI_TIMELINE_SYSTEM, prompt, { model: TIMELINE_MODEL, maxTokens: 1024, orgId })
    } catch (e) {
      console.error('[case/timeline/refresh] AI ล่ม', { ref }, e.message)
      return Response.json({ error: 'AI ประมวลผลไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 })
    }
    const json = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
    try {
      const parsed = JSON.parse(json)
      // ⚠️ try ครอบเฉพาะ JSON.parse — ถ้าครอบ DB write ด้วย insert ที่พังจะถูกกลืน
      //    แล้ว watermark เลื่อนต่อ = ข้อความชุดนั้นหายถาวร (กดซ้ำก็ไม่กลับมา)
      if (Array.isArray(parsed)) events = parsed
    } catch {
      console.error('[case/timeline/refresh] AI คืนค่าที่ไม่ใช่ JSON', { ref, raw: raw.slice(0, 200) })
    }
  }

  // body อาจไม่ใช่ string (AI คืนตัวเลข/object ได้) — String() ก่อนเสมอ ไม่งั้น .trim() โยน
  const toInsert = events
    .map(e => ({ body: e?.body == null ? '' : String(e.body).trim(), is_public: e?.is_public === true, occurred_at: e?.occurred_at || null }))
    .filter(e => e.body)

  // insert + เลื่อน watermark ต้อง atomic:
  //   insert พัง → rollback → watermark ไม่ขยับ → กดซ้ำได้ข้อความเดิมกลับมา
  //   คนที่ 2 กดพร้อมกัน → watermark ไม่ตรง → rollback → ไม่เกิด timeline ซ้ำ
  const lastMsgId = msgs.at(-1)?.id
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (lastMsgId) {
      const ok = await advanceSyncWatermark(caseRow.id, caseRow.last_synced_message_id, lastMsgId, client)
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

  const entries = await getTimeline(caseRow.id)
  return Response.json({ ok: true, added: toInsert.length, files, entries })
}
