// web/db/orgAiPrompts.js — อ่าน/เขียน prompt ฝั่ง **เว็บ** (ESM) จาก org_ai_prompts
// คู่แฝดฝั่งบอทคือ db/aiPrompts.js (CommonJS) — แก้ที่นึงต้องดูอีกที่ด้วยเสมอ
//
// ⛔ แถวใน DB เก็บแค่ **head** (ส่วนที่ org แก้ได้) · **format ต่อท้ายจากโค้ดเสมอ**
//    ประกาศรูปแบบ JSON ที่ route ไป parse จึงลบทิ้งไม่ได้ไม่ว่า org จะทำอะไร —
//    ไม่ใช่เพราะ validate ผ่าน แต่เพราะ **ไม่มีที่ให้เก็บทับตั้งแต่แรก**
//
// สายการอ่าน: head ของ org → head ในโค้ด · แล้วต่อ format จากโค้ดท้ายสุด
// DB ล่ม/ตารางว่าง → ค่าโค้ดทั้งหมด (AI ต้องไม่พังเพราะ config เสีย)
import pool from './index.js'
import aiPrompts from '@/../config/aiPrompts.js'

const { AI_PROMPTS, defaultParts, assemble } = aiPrompts

/**
 * prompt ของช่องที่ผูกกับโค้ด — ประกอบเสร็จพร้อมยิง AI
 * @returns {Promise<string|null>} null = ไม่รู้จักช่องนี้ (สะกดผิด)
 */
export async function getPrompt(value, orgId = null) {
  const def = defaultParts(value)
  if (!def) return null

  let head = def.head
  try {
    const { rows } = await pool.query(
      // org_id ASC NULLS LAST → แถวของ org มาก่อนแถวกลางเสมอ · orgId=null แมตช์เฉพาะแถวกลาง
      `SELECT prompt FROM org_ai_prompts
        WHERE value = $1 AND kind = 'slot' AND (org_id = $2 OR org_id IS NULL)
        ORDER BY org_id ASC NULLS LAST
        LIMIT 1`,
      [value, orgId]
    )
    if (rows[0]?.prompt) head = rows[0].prompt
  } catch (err) {
    console.error('[orgAiPrompts] getPrompt failed, fallback to code:', err.message)
  }
  return assemble(head, def.format)
}

/**
 * ทุกช่องพร้อมสถานะ สำหรับหน้า backoffice
 * `head` = ที่แก้ได้ (ค่าปัจจุบัน) · `format` = ที่ล็อก ส่งไปโชว์อย่างเดียว ไม่รับกลับ
 * `isDefault` = ยังไม่เคยแก้ทับ (ปุ่ม "คืนค่าเดิม" ควรซ่อน)
 */
export async function listPrompts(orgId) {
  let overrides = new Map()
  try {
    const { rows } = await pool.query(
      `SELECT value, prompt, updated_at FROM org_ai_prompts
        WHERE kind = 'slot' AND org_id = $1`,
      [orgId]
    )
    overrides = new Map(rows.map(r => [r.value, r]))
  } catch (err) {
    // อ่านไม่ได้ = โชว์ค่าตั้งต้นไปก่อน ดีกว่าหน้าพัง
    console.error('[orgAiPrompts] listPrompts failed:', err.message)
  }

  return AI_PROMPTS.map(p => {
    const row = overrides.get(p.value)
    return {
      value: p.value,
      label: p.label,
      surface: p.surface,
      defaultHead: p.head,
      head: row?.prompt ?? p.head,
      format: p.format || '',     // '' = slot ที่คืนข้อความล้วน ไม่มีอะไรล็อก
      isDefault: !row,
      updatedAt: row?.updated_at ?? null,
    }
  })
}

/**
 * แก้ทับ **head** ของ org นี้ (format แก้ไม่ได้ — ไม่มีคอลัมน์เก็บ)
 *
 * ⛔ ไม่เช็ค requiredKeys ที่นี่โดยตั้งใจ — คีย์พวกนั้นอยู่ใน format ซึ่งล็อกอยู่แล้ว
 *    ถ้าเผลอเช็ค จะไปปฏิเสธการแก้ head ที่ถูกต้องทุกครั้งที่ผู้ใช้ไม่ได้พิมพ์ชื่อคีย์ลงในกฎ
 */
export async function setPrompt(orgId, value, head, userId = null) {
  const def = defaultParts(value)
  if (!def) return { ok: false, unknown: true }

  await pool.query(
    `INSERT INTO org_ai_prompts (org_id, kind, value, label, prompt, updated_by, updated_at)
     VALUES ($1, 'slot', $2, $3, $4, $5, now())
     ON CONFLICT (org_id, value) WHERE org_id IS NOT NULL
     DO UPDATE SET prompt = EXCLUDED.prompt, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [orgId, value, def.label, head, userId]
  )
  return { ok: true }
}

/** คืนค่าตั้งต้น = ลบแถว override ทิ้ง (ไม่ใช่เขียนค่า default ลงไป — ไม่งั้นค่าจะค้างตอนโค้ดอัปเดต) */
export async function resetPrompt(orgId, value) {
  await pool.query(
    `DELETE FROM org_ai_prompts WHERE org_id = $1 AND value = $2 AND kind = 'slot'`,
    [orgId, value]
  )
}
