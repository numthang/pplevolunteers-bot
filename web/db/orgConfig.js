// web/db/orgConfig.js — org-level KV config (org_config table)
// setting ระดับ org จริงๆ: appoint_policy (+ enabled_features ตอน migrate feature-toggle มา org)
// ⚠️ ต่างจาก dc_guild_config: นั่นคือ config/artifact ของ Discord server (channel/msg/role) คง guild-keyed
import pool from './index.js'

// ใครแต่งตั้งยศได้บ้าง (นอกจาก owner ที่ได้เสมอ) — permission keys · default ถ้า org ไม่ตั้งเอง
export const DEFAULT_APPOINT_POLICY = ['admin', 'secretary_general']

export async function getOrgConfig(orgId, key) {
  const { rows } = await pool.query(
    `SELECT value FROM org_config WHERE org_id = $1 AND key = $2`,
    [orgId, key]
  )
  return rows[0]?.value ?? null
}

export async function setOrgConfig(orgId, key, value) {
  await pool.query(
    `INSERT INTO org_config (org_id, key, value, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (org_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [orgId, key, value]
  )
}

export async function deleteOrgConfig(orgId, key) {
  await pool.query(`DELETE FROM org_config WHERE org_id = $1 AND key = $2`, [orgId, key])
}

// appoint_policy = permission keys ที่แต่งตั้งได้ (นอกจาก owner) · เก็บเป็น JSON array ใน value
export async function getAppointPolicy(orgId) {
  const raw = await getOrgConfig(orgId, 'appoint_policy')
  if (raw === null) return DEFAULT_APPOINT_POLICY   // ยังไม่ตั้ง = default
  try {
    const arr = JSON.parse(raw)
    // ตั้งเป็น [] ตั้งใจได้ (owner-only — gate ยังปล่อย owner/admin เสมอ)
    return Array.isArray(arr) ? arr : DEFAULT_APPOINT_POLICY
  } catch {
    return DEFAULT_APPOINT_POLICY
  }
}

// docs_sign_policy — ใครเซ็นใบสำคัญรับเงินแทนใครได้บ้าง
//   'strict'   (ค่าตั้งต้น) สมาชิกเซ็นได้เฉพาะใบของตัวเอง · คนนอกให้คนในทีมเซ็นแทนได้
//   'flexible' ใครที่ล็อกอินแล้วถือลิงก์ก็เซ็นได้ทุกใบ — เหมือนส่งกระดาษต่อกันหน้างาน
//   'open'     ถือลิงก์ = เซ็นได้ **ไม่ต้องล็อกอิน** — เหมือนส่งกระดาษไปให้เซ็นถึงมือ
//
// ⚠️ strict/flexible ≠ ไม่รู้ว่าใครเซ็น — สองโหมดนี้บันทึก signed_by_user_id + signed_on_behalf เสมอ
//    (ไม่ขึ้นบนใบสำคัญฯ · งัดมาดูได้ตอนมีเรื่อง)
// ⚠️ open = **ยอมทิ้ง audit trail โดยตั้งใจ** — ไม่มีบัญชีให้ผูก เหลือแค่ IP + เวลา + ตัวลิงก์
//    แลกกับอัตราการเซ็นสำเร็จ (ผู้รับเงินส่วนใหญ่ไม่ได้ใช้เว็บนี้เป็นประจำ) · ชดเชยด้วยกฎ
//    "เซ็นแล้วล็อก" — ใบที่เซ็นผ่านลิงก์แล้วเซ็นทับไม่ได้ ต้องให้ผู้ดูแลปลดก่อน (ไม่งั้นคนที่
//    ได้ลิงก์ต่อทับลายเซ็นเดิมได้ตลอดกาล และไม่มีร่องรอยว่าใครทับ)
export const DOCS_SIGN_POLICIES = ['strict', 'flexible', 'open']
export const DEFAULT_DOCS_SIGN_POLICY = 'strict'

export async function getDocsSignPolicy(orgId) {
  const raw = await getOrgConfig(orgId, 'docs_sign_policy')
  return DOCS_SIGN_POLICIES.includes(raw) ? raw : DEFAULT_DOCS_SIGN_POLICY
}
