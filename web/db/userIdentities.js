import pool from '@/db/index.js'

export async function linkIdentity(discordId, provider, providerId, credential = null) {
  if (provider === 'passkey') {
    // passkey: user สามารถมีได้หลาย device, แต่ credential_id ต้องไม่ซ้ำข้าม user
    await pool.query(
      `INSERT INTO dc_user_identities (discord_id, provider, provider_id, credential)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider, provider_id) DO NOTHING`,
      [discordId, provider, providerId, credential ? JSON.stringify(credential) : null]
    )
    return
  }

  // line/google: ป้องกัน account ถูกขโมย
  const { rows } = await pool.query(
    `SELECT discord_id FROM dc_user_identities WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId]
  )
  if (rows[0] && rows[0].discord_id !== discordId) {
    throw Object.assign(new Error('already_taken'), { code: 'already_taken' })
  }

  // ลบ link เก่า (ถ้า user นี้ผูก provider นี้กับ account อื่นอยู่แล้ว) แล้ว insert ใหม่
  await pool.query(
    `DELETE FROM dc_user_identities WHERE discord_id = $1 AND provider = $2 AND provider_id != $3`,
    [discordId, provider, providerId]
  )
  await pool.query(
    `INSERT INTO dc_user_identities (discord_id, provider, provider_id, credential)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_id) DO NOTHING`,
    [discordId, provider, providerId, credential ? JSON.stringify(credential) : null]
  )
}

export async function unlinkIdentity(discordId, provider, providerId = null) {
  if (providerId) {
    await pool.query(
      `DELETE FROM dc_user_identities WHERE discord_id = $1 AND provider = $2 AND provider_id = $3`,
      [discordId, provider, providerId]
    )
  } else {
    await pool.query(
      `DELETE FROM dc_user_identities WHERE discord_id = $1 AND provider = $2`,
      [discordId, provider]
    )
  }
}

export async function findDiscordIdByProvider(provider, providerId) {
  const { rows } = await pool.query(
    `SELECT discord_id FROM dc_user_identities WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId]
  )
  return rows[0]?.discord_id ?? null
}

export async function getUserIdentities(discordId) {
  const { rows } = await pool.query(
    `SELECT provider, provider_id, created_at FROM dc_user_identities WHERE discord_id = $1 ORDER BY created_at`,
    [discordId]
  )
  return rows
}

export async function getPasskeyCredential(credentialId) {
  const { rows } = await pool.query(
    `SELECT discord_id, credential FROM dc_user_identities
     WHERE provider = 'passkey' AND provider_id = $1`,
    [credentialId]
  )
  if (!rows[0]) return null
  return { discordId: rows[0].discord_id, credential: rows[0].credential }
}

export async function updatePasskeyCounter(credentialId, counter) {
  await pool.query(
    `UPDATE dc_user_identities SET credential = credential || $1
     WHERE provider = 'passkey' AND provider_id = $2`,
    [JSON.stringify({ counter }), credentialId]
  )
}
