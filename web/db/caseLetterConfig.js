import pool from '@/db/index.js'

export async function getLetterConfig(orgId, province) {
  const { rows } = await pool.query(
    `SELECT * FROM case_letter_config WHERE org_id = $1 AND province = $2`,
    [orgId, province],
  )
  return rows[0] || null
}

/**
 * หัวจดหมายทุกจังหวัดของ org — หน้า /org/settings/letter
 *
 * signer_name/signer_position ยังอยู่ที่นี่แม้ผู้ลงนามจริงจะเก็บในร่างแล้ว เพราะเป็น **ค่าเริ่มต้น**:
 * ตำแหน่งใช้ตั้งต้นทุกใบ · ชื่อใช้ตอนคนร่างไม่ได้กรอกชื่อ-สกุลในโปรไฟล์ (1,273/6,751 เท่านั้นที่กรอก)
 * และเป็นคอลัมน์ NOT NULL — ถ้าหน้าตั้งค่าไม่ให้กรอก จะเพิ่มจังหวัดใหม่ไม่ได้เลย
 */
export async function listLetterConfigs(orgId) {
  const { rows } = await pool.query(
    `SELECT province, org_name, address, signer_name, signer_position,
            coordinator_name, coordinator_phone, updated_at
       FROM case_letter_config WHERE org_id = $1 ORDER BY province`,
    [orgId],
  )
  return rows
}

export async function upsertLetterConfig(orgId, province, data) {
  const { org_name, address, signer_name, signer_position, coordinator_name, coordinator_phone } = data
  await pool.query(
    `INSERT INTO case_letter_config (org_id, province, org_name, address, signer_name, signer_position, coordinator_name, coordinator_phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (org_id, province) DO UPDATE SET
       org_name = EXCLUDED.org_name, address = EXCLUDED.address,
       signer_name = EXCLUDED.signer_name, signer_position = EXCLUDED.signer_position,
       coordinator_name = EXCLUDED.coordinator_name, coordinator_phone = EXCLUDED.coordinator_phone,
       updated_at = NOW()`,
    [orgId, province, org_name, address, signer_name, signer_position, coordinator_name || null, coordinator_phone || null],
  )
}
