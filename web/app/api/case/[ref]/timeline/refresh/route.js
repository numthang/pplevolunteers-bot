import { gateCase } from '@/lib/caseGate.js'
import { addTimelineEvents, getTimeline } from '@/db/cases.js'
import pool from '@/db/index.js'

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

const AI_TIMELINE_SYSTEM = `วิเคราะห์บทสนทนา Discord แล้วสกัด event สำคัญออกมาเป็น timeline เรื่องร้องเรียน

กฎการสกัด:
- สกัดเฉพาะ event ที่เกิดขึ้นจริงหรือพูดถึงในบทสนทนา ห้ามแต่งเติม
- event ที่ควรสกัด: แจ้งปัญหา / นัดหมาย / ลงพื้นที่ / ส่งเรื่องต่อ / ติดตามผล / แก้ไขแล้ว / คำตอบจากหน่วยงาน
- ถ้าไม่มี event ที่ชัดเจนพอ ให้ return array ว่าง []
- occurred_at: ถ้าบทสนทนาระบุวันที่ให้แปลงเป็น ISO 8601 ไม่งั้นใส่ null

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
  while (true) {
    const qs = after ? `?after=${after}&limit=100` : '?limit=100'
    const batch = await discordFetch(`/channels/${threadId}/messages${qs}`)
    if (!batch.length) break
    msgs.push(...batch)
    if (batch.length < 100) break
    after = batch.at(-1).id
  }
  return msgs.sort((a, b) => a.id.localeCompare(b.id))
}

async function callAI(system, userContent) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: userContent }],
  })
  return res.content.find(b => b.type === 'text')?.text ?? ''
}

/** POST /api/case/[ref]/timeline/refresh — ดึง Discord message ใหม่ → AI generate timeline */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { guildId, caseRow } = gate

  if (!caseRow.discord_thread_id) {
    return Response.json({ error: 'เคสนี้ไม่มี Discord thread' }, { status: 400 })
  }

  const msgs = await fetchMessagesAfter(caseRow.discord_thread_id, caseRow.last_synced_message_id)
  if (!msgs.length) return Response.json({ ok: true, added: 0, entries: await getTimeline(caseRow.id) })

  const text = msgs
    .filter(m => m.content?.trim() && !m.author?.bot)
    .map(m => `[${new Date(m.timestamp).toLocaleString('th-TH')}] ${m.author?.username}: ${m.content}`)
    .join('\n')

  let added = 0
  if (text.trim()) {
    const prompt = `หัวข้อเรื่องร้องเรียน: ${caseRow.title}\n\nบทสนทนาใหม่:\n${text}`
    const raw = await callAI(AI_TIMELINE_SYSTEM, prompt)
    const json = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
    try {
      const events = JSON.parse(json)
      if (Array.isArray(events) && events.length) {
        await addTimelineEvents(caseRow.id, guildId, events.filter(e => e?.body?.trim()).map(e => ({
          body: String(e.body).trim(),
          is_public: e.is_public === true,
          occurred_at: e.occurred_at || null,
        })), 'ai')
        added = events.length
      }
    } catch { /* ไม่มี event */ }
  }

  // อัปเดต last_synced_message_id
  const lastMsgId = msgs.at(-1)?.id
  if (lastMsgId) {
    await pool.query(`UPDATE cases SET last_synced_message_id = $2 WHERE id = $1`, [caseRow.id, lastMsgId])
  }

  const entries = await getTimeline(caseRow.id)
  return Response.json({ ok: true, added, entries })
}
