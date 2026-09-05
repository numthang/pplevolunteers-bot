// เตรียมข้อมูลสำหรับหน้าคัดกระทู้เข้า KANBAN — ดึงเนื้อกระทู้จาก Discord + ให้ AI ช่วยเดา
//
//   node scripts/kanban/prepForumImport.mjs --org 1 [--channel <id>] [--limit N] [--no-ai] [--refresh] [--dry]
//
// ⭐ รันซ้ำได้ปลอดภัย — แถวที่ status != 'pending' (นำเข้าแล้ว/กดไม่เอาแล้ว) ถูกข้ามเสมอ
//    และค่าที่คนเคาะเอง (pick_*) ไม่เคยถูกเขียนทับ · --refresh = ยิง AI ใหม่ทับของเดิมที่ยัง pending
//
// ⛔ ไม่โหลดรูปเก็บที่นี่ — 256 กระทู้ × 4 รูปเป็นหลาย GB ทั้งที่ส่วนใหญ่จะถูกปัดทิ้ง
//    หน้าคัดดูรูปผ่าน proxy สดๆ · โหลดเก็บจริงตอนกด "นำเข้า" (ก้อน 3)
import '../smoke/_envload.mjs'   // ⚠️ ต้องเป็น import แรกเสมอ — โหลด .env ทับค่าที่ค้างใน shell ก่อนโมดูลอื่นถูกประเมิน
import { createRequire } from 'module'
import pool from '../../web/db/index.js'

// ⚠️ ห้าม import web/lib/ai.js ตรงๆ — มันไล่ไปถึง aiCreds.js ที่ใช้ alias `@/db` ซึ่งมีเฉพาะใน Next
//    สคริปต์จึงใช้ตัวแก้ credential ฝั่งบอท (db/aiConfig.js) ที่ทำงานนอก Next ได้ แล้วยิง SDK เอง
const require = createRequire(import.meta.url)
const { getAgentConfig } = require('../../db/aiConfig.js')

const AI_MODEL = 'claude-haiku-4-5'

/** ยิง Claude แล้วบังคับให้ผลเป็น JSON (โมเดลชอบห่อ ```json → ปอกก่อน parse) */
async function askAiJson(system, user, { orgId, maxTokens = 1200 }) {
  const creds = await getAgentConfig({ orgId, task: 'light' })
  if (creds.provider !== 'claude') throw new Error(`งานนี้รองรับเฉพาะ Claude (ตอนนี้ตั้งไว้ที่ ${creds.provider})`)
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: creds.apiKey, timeout: 120000 })
  const res = await client.messages.create({
    model: AI_MODEL,
    max_tokens: maxTokens,
    // system prompt เหมือนกันทุกกระทู้ → cache ไว้ ไม่ต้องจ่ายค่า input ซ้ำ 256 รอบ
    system: [{ type: 'text', text: `${system}\n\nตอบเป็น JSON ล้วนเท่านั้น ห้ามมีข้อความอื่นนอก JSON`, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  })
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try { return JSON.parse(cleaned) } catch { throw new Error('AI ตอบกลับมาไม่ใช่ JSON') }
}

const TOKEN = process.env.DISCORD_BOT_TOKEN
const API = 'https://discord.com/api/v10'

// ห้องที่ user เคาะ — 3 ห้องแรก 2026-09-04 · เพิ่ม "เลือกตั้ง" 2026-09-05 (ดู md/PENDING.md)
// ⚠️ เพิ่มห้องที่นี่แล้วต้องไปเพิ่มใน web/components/kanban/ForumImportHome.jsx (CHANNELS)
//    + คีย์ channel.<key> ใน web/locales/{th,en}.json ด้วย ไม่งั้นชิปกรองห้องในหน้าคัดไม่มีให้กด
const CHANNELS = {
  '1126210980045664346': 'คณะทำงาน',
  '1223929014998274128': 'อำเภอ',
  '1126491108004855878': 'สมาชิกพรรค',
  '1258076247700013146': 'เลือกตั้ง',
}

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1] }
const has = (n) => process.argv.includes(`--${n}`)

const orgId = Number(arg('org', 1))
const onlyChannel = arg('channel', null)
const limit = Number(arg('limit', 0)) || null
const useAi = !has('no-ai')
const refresh = has('refresh')
const dry = has('dry')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** ── Discord ─────────────────────────────────────────────────────── */

async function discord(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API + path, { headers: { Authorization: `Bot ${TOKEN}` } })
    if (res.status === 429) {                       // โดนเบรก → รอตามที่มันบอก แล้วลองใหม่
      const body = await res.json().catch(() => ({}))
      await sleep(Math.ceil((body.retry_after ?? 1) * 1000) + 250)
      continue
    }
    if (!res.ok) return null
    return res.json()
  }
  return null
}

/**
 * เนื้อกระทู้ที่ต้องใช้ — ข้อความเปิด + คนที่ร่วมคุย + จำนวนรูปในข้อความเปิด
 * ⚠️ ข้อความเปิดของกระทู้ฟอรัมมี id เท่ากับ id ของกระทู้เอง (ไม่ต้องไล่หา)
 */
async function fetchThread(threadId) {
  const [starter, recent] = await Promise.all([
    discord(`/channels/${threadId}/messages/${threadId}`),
    discord(`/channels/${threadId}/messages?limit=100`),
  ])
  const msgs = Array.isArray(recent) ? recent : []

  const people = new Map()
  for (const m of msgs) {
    if (!m.author || m.author.bot) continue
    const cur = people.get(m.author.id) || { discord_id: m.author.id, name: m.author.global_name || m.author.username, msgs: 0 }
    cur.msgs++
    people.set(m.author.id, cur)
  }

  const images = (starter?.attachments || []).filter((a) => (a.content_type || '').startsWith('image/'))

  // ข้อความที่ส่งให้ AI: ข้อความเปิด + ที่คุยกันต่อ (เรียงเก่า→ใหม่) ตัดที่ 6000 ตัวอักษร
  const convo = [...msgs].reverse()
    .filter((m) => !m.author?.bot && (m.content || '').trim())
    .map((m) => `${m.author.global_name || m.author.username}: ${m.content.replace(/\s+/g, ' ').trim()}`)
    .join('\n')

  return {
    first_message: (starter?.content || '').trim() || null,
    message_count: msgs.length,
    image_count: images.length,
    participants: [...people.values()].sort((a, b) => b.msgs - a.msgs),
    convo: convo.slice(0, 6000),
  }
}

/** ── เทียบชื่อกับการ์ดที่มีอยู่ (ธง "น่าจะซ้ำ") ────────────────────── */

// การ์ด 1,261 ใบมี source_url แค่ 14 ใบ → เทียบชื่อเป็นทางหลัก ไม่ใช่ทางรอง
// (pg_trgm ไม่ได้ติดตั้งในฐานนี้ — ให้คะแนนเองด้วย bigram ในหน่วยความจำ เร็วกว่าลง extension บน prod)
const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-_"'`()[\]{}.,:;!?ๆๅ]/g, '')
const bigrams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g }
function similarity(a, b) {
  const A = bigrams(norm(a)); const B = bigrams(norm(b))
  if (!A.size || !B.size) return 0
  let hit = 0; for (const g of A) if (B.has(g)) hit++
  return (2 * hit) / (A.size + B.size)
}

/** ── AI ──────────────────────────────────────────────────────────── */

const AI_SYSTEM = `คุณช่วยคัดกระทู้จาก Discord ของพรรคการเมืองระดับจังหวัด เข้าเป็น "การ์ดงาน" ในระบบ KANBAN

ตอบเป็น JSON object เดียว ฟิลด์ตามนี้เท่านั้น:
{
  "is_project": true|false,      // true = เป็นงาน/โครงการ/กิจกรรมที่มีคนลงมือทำ · false = กระทู้พูดคุย ถาม-ตอบ แจ้งข่าว ไม่มีงานให้ทำ
  "reason": "เหตุผลสั้นๆ ไม่เกิน 100 ตัวอักษร",
  "summary": "สรุปว่ากระทู้นี้ทำอะไร 1-3 ประโยค ภาษาไทย ห้ามเกิน 400 ตัวอักษร",
  "workstreams": ["ชื่อสายงานที่ตรง"],   // เลือกจากรายการที่ให้เท่านั้น เลือกได้หลายอัน ไม่ตรงเลย = []
  "areas": ["ชื่อพื้นที่ที่ตรง"],          // เลือกจากรายการที่ให้เท่านั้น ไม่ระบุพื้นที่ = []
  "assignee": "ชื่อคนที่รับผิดชอบงานนี้"|null,  // เลือกจากรายชื่อคนที่คุยในกระทู้เท่านั้น ไม่ชัดเจน = null
  "event_date": "YYYY-MM-DD"|null    // วันที่ "งานจัดจริง" ถ้ามีเขียนไว้ในกระทู้
}

กฎเหล็ก:
- ห้ามคิดชื่อสายงาน/พื้นที่/คนขึ้นเอง — ต้องคัดลอกจากรายการที่ให้มาแบบตรงตัวอักษรเท่านั้น
- workstreams: เลือกไม่เกิน 2 อันที่ตรงที่สุด (ไม่ใช่ทุกอันที่พอเกี่ยว)
- event_date: แปลงปี พ.ศ. เป็น ค.ศ. เสมอ (68 = 2025, 69 = 2026, 2569 = 2026) ถ้าเป็นช่วงวันให้เอาวันแรก
  **ถ้าในกระทู้เขียนแค่วันกับเดือนโดยไม่มีปี ให้ใช้ปีที่ทำให้วันงานอยู่หลังวันตั้งกระทู้** (คนตั้งกระทู้เพื่อเตรียมงานที่ยังไม่เกิด)
  ถ้าในกระทู้ไม่ได้เขียนวันไว้เลย ให้ตอบ null ห้ามเดาจากบริบท`

function aiUserPrompt({ title, createdAt, workstreams, areas, participants, convo }) {
  return [
    `ชื่อกระทู้: ${title}`,
    `วันที่ตั้งกระทู้: ${createdAt.toISOString().slice(0, 10)}`,
    ``,
    `สายงานที่เลือกได้: ${workstreams.join(' | ')}`,
    `พื้นที่ที่เลือกได้: ${areas.join(' | ')}`,
    `คนที่คุยในกระทู้: ${participants.map((p) => `${p.name} (${p.msgs} ข้อความ)`).join(' | ') || '(ไม่มี)'}`,
    ``,
    `เนื้อหากระทู้:`,
    convo || '(ไม่มีข้อความ)',
  ].join('\n')
}

/**
 * วันที่ AI ตอบมาต้องสมเหตุสมผล — ด่านนี้ทำ 2 อย่าง
 *
 * 1) **ซ่อมปี** — กรณีจริงที่เจอ: กระทู้ตั้ง 25 ส.ค. 2026 เขียนว่า "ศุกร์ที่ 4 กันยายน" (ไม่มีปี)
 *    AI ตอบ 2025-09-04 = ปีก่อนหน้ากระทู้ 1 ปี · ทิ้งไปเฉยๆ = เสียวันที่ใช้ได้ฟรีๆ
 *    → ลองเลื่อนปีไปเป็นปีของกระทู้ / ปีถัดไป ถ้าเข้าช่วงพอดีก็ใช้ตัวนั้น
 * 2) **ตีตกของที่ยังมั่วอยู่** — นอกช่วง (วันตั้งกระทู้ −30 วัน ถึง +2 ปี) ทิ้งทันที
 *    กันปี พ.ศ. ถูกอ่านเป็น ค.ศ. (68 → 2068) ซึ่งเป็นความผิดพลาดที่ "ดูเหมือนถูก" ที่สุดของงานนี้
 */
function saneEventDate(raw, threadDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw || ''))) return null
  const lo = new Date(threadDate); lo.setDate(lo.getDate() - 30)
  const hi = new Date(threadDate); hi.setFullYear(hi.getFullYear() + 2)

  // ⚠️ ต้องหยิบกลุ่มที่ 2 — กลุ่มที่ 1 คือปี (เคยพลาดตรงนี้: `const [, mmdd] = match` ได้ "2025" มาเป็นเดือน-วัน
  //    แล้วประกอบเป็น "20262025" ซึ่งเป็นวันที่ไม่มีจริง → ตัวซ่อมปีไม่เคยทำงานเลยสักครั้ง)
  const m = String(raw).match(/^(\d{4})(-\d{2}-\d{2})$/)
  const mmdd = m?.[2]                 // ⚠️ กลุ่มที่ 2 — กลุ่มที่ 1 คือปี (เคยหยิบผิดจนตัวซ่อมไม่เคยทำงาน)
  const rawYear = Number(m?.[1])
  const candidates = [raw]
  if (mmdd) {
    const y = threadDate.getFullYear()
    // ⛔ ซ่อมได้เฉพาะ "ปีเพี้ยนไป 1 ปี" (คนเขียนแค่วัน-เดือน แล้ว AI เติมปีข้างเคียงผิด — อาการจริงที่เจอ)
    //    ห้ามซ่อมกว้างกว่านี้ — เคสจริงตอนเทส: 2024-01-05 (งานเก่าจริงๆ) ถูกดันเป็น 2027-01-05
    //    = แต่งวันอนาคตขึ้นมาเองจากข้อมูลที่ผิดอยู่แล้ว · ปี พ.ศ. ที่หลุดมา (2068) ก็ตกด่านนี้ด้วย
    //    ซึ่งถูกแล้ว: เดาไม่ได้ว่าเจ้าตัวหมายถึงปีไหน ปล่อยว่างดีกว่าเดา
    for (const cy of [y, y + 1]) {
      if (Math.abs(cy - rawYear) <= 1) candidates.push(`${cy}${mmdd}`)
    }
  }
  for (const c of candidates) {
    const d = new Date(`${c}T00:00:00+07:00`)
    if (!Number.isNaN(d.getTime()) && d >= lo && d <= hi) return c
  }
  return null
}

/** ── main ────────────────────────────────────────────────────────── */

async function main() {
  const channels = onlyChannel ? [onlyChannel] : Object.keys(CHANNELS)
  if (onlyChannel && !CHANNELS[onlyChannel]) { console.error('ไม่รู้จักห้องนี้'); process.exit(1) }

  // ตัวเลือกจริงของ field "สายงาน" / "พื้นที่" — AI ต้องเลือกจากนี้เท่านั้น
  const { rows: opts } = await pool.query(
    `SELECT o.id, o.name, f.label FROM kanban_field_options o
       JOIN kanban_field_defs f ON f.id = o.field_id
      WHERE f.org_id = $1 AND o.archived_at IS NULL AND f.archived_at IS NULL
        AND f.label IN ('สายงาน', 'พื้นที่')`, [orgId]
  )
  const wsOpts = opts.filter((o) => o.label === 'สายงาน')
  const arOpts = opts.filter((o) => o.label === 'พื้นที่')
  const byName = (list, name) => list.find((o) => o.name === name) || null

  // คนในระบบ (จับคู่จาก discord_id) + ชื่อการ์ดที่มีอยู่ (เทียบซ้ำ)
  const { rows: users } = await pool.query(`SELECT id, discord_id FROM users WHERE discord_id IS NOT NULL`)
  const userByDiscord = new Map(users.map((u) => [u.discord_id, u.id]))
  const { rows: cards } = await pool.query(`SELECT id, title FROM kanban_cards WHERE org_id = $1`, [orgId])

  const { rows: doneRows } = await pool.query(
    `SELECT thread_id FROM kanban_forum_import WHERE org_id = $1 AND status <> 'pending'`, [orgId]
  )
  const settled = new Set(doneRows.map((r) => r.thread_id))

  for (const channelId of channels) {
    const { rows: threads } = await pool.query(
      `SELECT f.post_id, f.post_name, f.post_url, f.author_id, f.created_at, f.guild_id
         FROM dc_forum_posts f
        WHERE f.channel_id = $1
        ORDER BY f.created_at DESC ${limit ? `LIMIT ${limit}` : ''}`, [channelId]
    )
    console.log(`\n📂 ${CHANNELS[channelId]} — ${threads.length} กระทู้`)

    let done = 0, skipped = 0, failed = 0
    for (const th of threads) {
      process.stdout.write(`\r  ${++done}/${threads.length} (ข้าม ${skipped} · พลาด ${failed})   `)
      if (settled.has(th.post_id)) { skipped++; continue }

      if (!refresh) {
        const { rows: exist } = await pool.query(
          `SELECT ai_at FROM kanban_forum_import WHERE thread_id = $1`, [th.post_id])
        if (exist[0]?.ai_at) { skipped++; continue }     // เตรียมไว้แล้ว ไม่ต้องยิงซ้ำ (AI = เงิน)
      }

      try {
        const info = await fetchThread(th.post_id)
        for (const p of info.participants) p.user_id = userByDiscord.get(p.discord_id) ?? null

        let ai = {}
        if (useAi) {
          ai = await askAiJson(AI_SYSTEM, aiUserPrompt({
            title: th.post_name,
            createdAt: new Date(th.created_at),
            workstreams: wsOpts.map((o) => o.name),
            areas: arOpts.map((o) => o.name),
            participants: info.participants,
            convo: info.convo,
          }), { orgId, maxTokens: 1200 })
        }

        // ⚠️ ตรวจซ้ำทุกค่าที่ AI ตอบ — มันคิดชื่อใหม่เองได้เสมอแม้สั่งห้ามแล้ว
        const wsIds = (ai.workstreams || []).map((n) => byName(wsOpts, n)?.id).filter(Boolean)
        const arIds = (ai.areas || []).map((n) => byName(arOpts, n)?.id).filter(Boolean)
        const picked = info.participants.find((p) => p.name === ai.assignee) || null
        const eventDate = saneEventDate(ai.event_date, new Date(th.created_at))

        // ธง "น่าจะซ้ำ" — การ์ดที่ชื่อใกล้เคียงที่สุด (0.55 ขึ้นไปถึงจะขึ้นธง)
        let best = null
        for (const c of cards) {
          const s = similarity(th.post_name, c.title)
          if (!best || s > best.s) best = { id: c.id, s }
        }
        const dup = best && best.s >= 0.55 ? best : null

        if (dry) { console.log('\n', th.post_name, '→', JSON.stringify({ ...ai, wsIds, arIds, eventDate, dup })); continue }

        await pool.query(
          `INSERT INTO kanban_forum_import
             (org_id, guild_id, channel_id, thread_id, title, url, thread_created_at,
              author_discord_id, author_user_id, first_message, message_count, image_count, participants,
              ai_summary, ai_is_project, ai_reason, ai_workstreams, ai_areas, ai_assignee_user_id,
              ai_event_date, ai_model, ai_at, dup_card_id, dup_score)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17::jsonb,$18::jsonb,$19,
                   $20::date,$21::text,$22::timestamptz,$23,$24)
           ON CONFLICT (thread_id) DO UPDATE SET
             title = EXCLUDED.title, url = EXCLUDED.url, thread_created_at = EXCLUDED.thread_created_at,
             first_message = EXCLUDED.first_message, message_count = EXCLUDED.message_count,
             image_count = EXCLUDED.image_count, participants = EXCLUDED.participants,
             ai_summary = EXCLUDED.ai_summary, ai_is_project = EXCLUDED.ai_is_project,
             ai_reason = EXCLUDED.ai_reason, ai_workstreams = EXCLUDED.ai_workstreams,
             ai_areas = EXCLUDED.ai_areas, ai_assignee_user_id = EXCLUDED.ai_assignee_user_id,
             ai_event_date = EXCLUDED.ai_event_date, ai_model = EXCLUDED.ai_model, ai_at = EXCLUDED.ai_at,
             dup_card_id = EXCLUDED.dup_card_id, dup_score = EXCLUDED.dup_score,
             updated_at = CURRENT_TIMESTAMP`,
          // ⚠️ ai_at ส่งเป็นพารามิเตอร์ที่ cast ชัดเจน ห้ามเขียนเป็น CASE WHEN $n IS NULL … ใน VALUES
          //    (เจ็บมาแล้ว 2026-09-04: pg เดาชนิดไม่ได้ → "could not determine data type of parameter $21"
          //     ทุกแถวพังเงียบๆ ทั้ง 256 ใบ ทั้งที่สคริปต์ขึ้นว่าทำงานจนจบ)
          [orgId, th.guild_id, channelId, th.post_id, th.post_name.slice(0, 255), th.post_url, th.created_at,
           th.author_id, userByDiscord.get(th.author_id) ?? null, info.first_message, info.message_count,
           info.image_count, JSON.stringify(info.participants),
           ai.summary?.slice(0, 1000) ?? null, ai.is_project ?? null, ai.reason?.slice(0, 500) ?? null,
           JSON.stringify(wsIds), JSON.stringify(arIds), picked?.user_id ?? null,
           eventDate, useAi ? AI_MODEL : null, useAi ? new Date() : null,
           dup?.id ?? null, dup ? dup.s.toFixed(3) : null]
        )
      } catch (e) {
        failed++
        console.error(`\n  ⚠️  ${th.post_name.slice(0, 40)}: ${e.message}`)
      }
      await sleep(250)   // เกรงใจ Discord + ไม่ยิง AI รัวเกินไป
    }
    console.log(`\n  ✅ ${done - skipped - failed} ใบ · ข้าม ${skipped} · พลาด ${failed}`)
  }

  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
