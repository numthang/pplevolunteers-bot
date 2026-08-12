import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isSuperAdmin, isEditor } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import pool from '@/db/index.js'

// AI prompt modes ของบอท — backoffice แก้ **ชุดกลาง** (org_ai_prompts ที่ org_id IS NULL)
// superadmin/editor เท่านั้น (กระทบทุก org ที่ไม่ได้แก้ทับ)
//
// ⚠️ ย้ายจาก dc_ai_modes → org_ai_prompts แล้ว (2026-08-12) · ตารางเดียวเก็บ prompt 2 ชนิด
//    **ทุก query ที่นี่ต้องมี kind = 'mode' เสมอ** — หน้านี้เป็น CRUD ที่ลบแถวได้
//    ถ้าหลุดไปโดนแถว kind='slot' = ลบ prompt ที่ /api/posts/ai/* ต้องใช้ทิ้ง แล้ว route นั้นตกไปใช้
//    ค่าโค้ดเงียบๆ (ไม่พัง แต่ค่าที่ org แก้ไว้หายหมดโดยไม่มีใครรู้)
const VALUE_RE = /^[a-z0-9_]{2,50}$/ // mode key เป็น snake_case — bot ใช้อ้างอิง ต้องนิ่ง

async function authAdmin() {
  const session = await getServerSession(authOptions)
  if (!session) return { error: 'Unauthorized', status: 401 }
  const { access, discordId } = await getEffectiveIdentity(session)
  const ok = isSuperAdmin(discordId) || isEditor(access)
  if (!ok) return { error: 'Forbidden', status: 403 }
  return { ok: true }
}

// GET → { modes: [{ id, value, label, prompt, sort_order, enabled }] }
export async function GET() {
  const a = await authAdmin()
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const { rows } = await pool.query(
    `SELECT id, value, label, prompt, sort_order, enabled
     FROM org_ai_prompts WHERE org_id IS NULL AND kind = 'mode'
     ORDER BY sort_order ASC, id ASC`
  )
  return Response.json({ modes: rows })
}

// POST body: { value, label, prompt } → สร้าง mode ใหม่ (ต่อท้าย)
export async function POST(req) {
  const a = await authAdmin()
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const body = await req.json().catch(() => ({}))
  const value  = String(body.value || '').trim()
  const label  = String(body.label || '').trim()
  const prompt = String(body.prompt || '').trim()
  if (!VALUE_RE.test(value)) return Response.json({ error: 'value ต้องเป็น a-z 0-9 _ (2–50 ตัว)' }, { status: 400 })
  if (!label)  return Response.json({ error: 'label ว่าง' }, { status: 400 })
  if (!prompt) return Response.json({ error: 'prompt ว่าง' }, { status: 400 })

  const { rows: maxRows } = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM org_ai_prompts WHERE org_id IS NULL AND kind = 'mode'`
  )
  const sort = Number(maxRows[0].m) + 1
  try {
    const { rows } = await pool.query(
      `INSERT INTO org_ai_prompts (org_id, kind, value, label, prompt, sort_order, enabled)
       VALUES (NULL, 'mode', $1, $2, $3, $4, TRUE)
       RETURNING id, value, label, prompt, sort_order, enabled`,
      [value, label, prompt, sort]
    )
    return Response.json({ mode: rows[0] })
  } catch (err) {
    // unique index ครอบทั้งตารางฝั่ง org_id IS NULL → ชนกับ slot ที่ชื่อซ้ำได้ด้วย
    if (err.code === '23505') return Response.json({ error: 'value ซ้ำกับ prompt ที่มีอยู่' }, { status: 409 })
    throw err
  }
}

// PATCH — สองโหมด:
//   { action: 'reorder', order: [id, ...] }  → จัดลำดับใหม่
//   { id, label?, prompt?, enabled? }         → แก้ mode เดียว (value แก้ไม่ได้ — bot อ้างอิง)
export async function PATCH(req) {
  const a = await authAdmin()
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const body = await req.json().catch(() => ({}))

  if (body.action === 'reorder') {
    const order = Array.isArray(body.order) ? body.order.map(Number).filter(Number.isInteger) : []
    if (!order.length) return Response.json({ error: 'order ว่าง' }, { status: 400 })
    for (let i = 0; i < order.length; i++) {
      await pool.query(
        `UPDATE org_ai_prompts SET sort_order = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND org_id IS NULL AND kind = 'mode'`, [i + 1, order[i]]
      )
    }
    return Response.json({ ok: true })
  }

  const id = Number(body.id)
  if (!Number.isInteger(id)) return Response.json({ error: 'invalid id' }, { status: 400 })

  const sets = [], vals = []
  if (body.label !== undefined) {
    const label = String(body.label).trim()
    if (!label) return Response.json({ error: 'label ว่าง' }, { status: 400 })
    vals.push(label); sets.push(`label = $${vals.length}`)
  }
  if (body.prompt !== undefined) {
    const prompt = String(body.prompt).trim()
    if (!prompt) return Response.json({ error: 'prompt ว่าง' }, { status: 400 })
    vals.push(prompt); sets.push(`prompt = $${vals.length}`)
  }
  if (body.enabled !== undefined) {
    vals.push(!!body.enabled); sets.push(`enabled = $${vals.length}`)
  }
  if (!sets.length) return Response.json({ error: 'ไม่มีอะไรให้แก้' }, { status: 400 })

  vals.push(id)
  await pool.query(
    `UPDATE org_ai_prompts SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${vals.length} AND org_id IS NULL AND kind = 'mode'`, vals
  )
  return Response.json({ ok: true })
}

// DELETE ?id=...
export async function DELETE(req) {
  const a = await authAdmin()
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id)) return Response.json({ error: 'invalid id' }, { status: 400 })
  // kind='mode' ใน WHERE = ด่านสุดท้ายกัน slot ถูกลบผ่านหน้านี้
  await pool.query(`DELETE FROM org_ai_prompts WHERE id = $1 AND org_id IS NULL AND kind = 'mode'`, [id])
  return Response.json({ ok: true })
}
