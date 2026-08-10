// GET/PATCH /api/profile/quote — ค่าตั้งการ์ดคำคม **ของฉัน** (ชนะค่าขององค์กร)
//
// ค่าพวกนี้อยู่ใน user_config มาตลอดและถูกอ่านอยู่จริง (lib/quoteAccent.js ฝั่งเว็บ ·
// db/configResolver.js ฝั่งบอท resolve personal > guild > global) แต่ UI หายไปตอนลบ
// /bot/media/quote + QuotePanel.jsx (2026-08-10) → route นี้คือการคืนที่แก้ให้มัน
//
// ⚠️ user_config.value เป็น json → เก็บด้วย JSON.stringify เสมอ (เหมือน api/watermark/personal)
import { getOrgSession } from '@/lib/orgAuth.js'
import { QUOTE_STYLE_KEYS, normalizeStyle } from '@/lib/quoteStyles.js'
import pool from '@/db/index.js'

const KEYS = ['quote_ci_accent', 'quote_default_template']
const HEX = /^#[0-9a-fA-F]{6}$/

async function me() {
  const session = await getOrgSession()
  return session?.user?.userId ?? null
}

const unwrap = v => {
  if (typeof v !== 'string') return v ?? null
  try { const p = JSON.parse(v); return typeof p === 'string' ? p : v } catch { return v }
}

export async function GET() {
  const userId = await me()
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { rows } = await pool.query(
    `SELECT "key", value FROM user_config WHERE user_id = $1 AND "key" = ANY($2)`,
    [userId, KEYS]
  )
  const out = {}
  for (const r of rows) out[r.key] = unwrap(r.value)
  return Response.json({ ...out, styles: QUOTE_STYLE_KEYS })
}

/** { quote_ci_accent?: '#rrggbb'|'' , quote_default_template?: '<style>'|'' } — ค่าว่าง = ล้างทิ้ง */
export async function PATCH(req) {
  const userId = await me()
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  for (const key of KEYS) {
    if (body[key] === undefined) continue
    const v = String(body[key] || '').trim()

    if (!v) {
      await pool.query(`DELETE FROM user_config WHERE user_id = $1 AND "key" = $2`, [userId, key])
      continue
    }
    if (key === 'quote_ci_accent' && !HEX.test(v)) {
      return Response.json({ error: 'สีต้องเป็น #rrggbb' }, { status: 400 })
    }
    if (key === 'quote_default_template' && !QUOTE_STYLE_KEYS.includes(normalizeStyle(v))) {
      return Response.json({ error: 'ไม่รู้จักสไตล์นี้' }, { status: 400 })
    }
    await pool.query(
      `INSERT INTO user_config (user_id, "key", value)
       VALUES ($1, $2, $3::json)
       ON CONFLICT (user_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [userId, key, JSON.stringify(v)]
    )
  }

  return Response.json({ ok: true })
}
