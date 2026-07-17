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

// appoint_policy = permission keys ที่แต่งตั้งได้ (นอกจาก owner) · เก็บเป็น JSON array ใน value
export async function getAppointPolicy(orgId) {
  const raw = await getOrgConfig(orgId, 'appoint_policy')
  if (!raw) return DEFAULT_APPOINT_POLICY
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) && arr.length ? arr : DEFAULT_APPOINT_POLICY
  } catch {
    return DEFAULT_APPOINT_POLICY
  }
}
