import pool from '@/db/index.js'

export async function getLetterConfig(guildId, province) {
  const { rows } = await pool.query(
    `SELECT * FROM case_letter_config WHERE guild_id = $1 AND province = $2`,
    [guildId, province],
  )
  return rows[0] || null
}

export async function upsertLetterConfig(guildId, province, data) {
  const { org_name, address, signer_name, signer_position, coordinator_name, coordinator_phone } = data
  await pool.query(
    `INSERT INTO case_letter_config (guild_id, province, org_name, address, signer_name, signer_position, coordinator_name, coordinator_phone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (guild_id, province) DO UPDATE SET
       org_name = EXCLUDED.org_name, address = EXCLUDED.address,
       signer_name = EXCLUDED.signer_name, signer_position = EXCLUDED.signer_position,
       coordinator_name = EXCLUDED.coordinator_name, coordinator_phone = EXCLUDED.coordinator_phone,
       updated_at = NOW()`,
    [guildId, province, org_name, address, signer_name, signer_position, coordinator_name || null, coordinator_phone || null],
  )
}
