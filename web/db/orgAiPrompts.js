// web/db/orgAiPrompts.js — อ่าน/เขียน prompt ฝั่ง **เว็บ** (ESM) จาก org_ai_prompts
// คู่แฝดฝั่งบอทคือ db/aiPrompts.js (CommonJS) — แก้ที่นึงต้องดูอีกที่ด้วยเสมอ
//
// สายการอ่าน: แถวของ org → แถวกลาง (org_id IS NULL) → ค่าใน config/aiPrompts.js
// DB ล่ม/ตารางว่าง → ค่าโค้ด (AI ต้องไม่พังเพราะ config เสีย)
import pool from './index.js'
import aiPrompts from '@/../config/aiPrompts.js'

const { AI_PROMPTS, defaultPrompt } = aiPrompts

/**
 * prompt ของช่องที่ผูกกับโค้ด (kind='slot')
 * @returns {Promise<string|null>} null = ไม่รู้จักช่องนี้ (สะกดผิด)
 */
export async function getPrompt(value, orgId = null) {
  const fallback = defaultPrompt(value)?.prompt ?? null
  try {
    const { rows } = await pool.query(
      // org_id ASC NULLS LAST → แถวของ org มาก่อนแถวกลางเสมอ · orgId=null แมตช์เฉพาะแถวกลาง
      `SELECT prompt FROM org_ai_prompts
        WHERE value = $1 AND kind = 'slot' AND (org_id = $2 OR org_id IS NULL)
        ORDER BY org_id ASC NULLS LAST
        LIMIT 1`,
      [value, orgId]
    )
    return rows[0]?.prompt ?? fallback
  } catch (err) {
    console.error('[orgAiPrompts] getPrompt failed, fallback to code:', err.message)
    return fallback
  }
}

/**
 * ทุกช่องพร้อมสถานะ สำหรับหน้า backoffice
 * `prompt` = ค่าที่ใช้จริงตอนนี้ · `isDefault` = ยังไม่เคยแก้ทับ (ปุ่ม "คืนค่าเดิม" ควรจาง)
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
      requiredKeys: p.requiredKeys,
      defaultPrompt: p.prompt,
      prompt: row?.prompt ?? p.prompt,
      isDefault: !row,
      updatedAt: row?.updated_at ?? null,
    }
  })
}

/**
 * แก้ทับ prompt ของ org นี้
 * ⛔ ต้องเช็ค requiredKeys ก่อนเสมอ — ผู้ใช้ลบบรรทัด "รูปแบบ JSON: {...}" ทิ้งเมื่อไหร่
 *    route ที่ parse ผลลัพธ์จะพังทั้งเส้น โดยขึ้น error ว่า "AI ตอบกลับมาไม่ใช่ JSON ที่อ่านได้"
 *    ซึ่งไม่มีทางเดาได้เลยว่าสาเหตุมาจากที่นี่ → กันตั้งแต่ตอนเซฟ ไม่ใช่ตอนยิง AI
 * @returns {Promise<{ok:true} | {ok:false, missing:string[]}>}
 */
export async function setPrompt(orgId, value, prompt, userId = null) {
  const def = defaultPrompt(value)
  if (!def) return { ok: false, missing: [], unknown: true }

  const missing = def.requiredKeys.filter(k => !prompt.includes(k))
  if (missing.length) return { ok: false, missing }

  await pool.query(
    `INSERT INTO org_ai_prompts (org_id, kind, value, label, prompt, updated_by, updated_at)
     VALUES ($1, 'slot', $2, $3, $4, $5, now())
     ON CONFLICT (org_id, value) WHERE org_id IS NOT NULL
     DO UPDATE SET prompt = EXCLUDED.prompt, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [orgId, value, def.label, prompt, userId]
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
