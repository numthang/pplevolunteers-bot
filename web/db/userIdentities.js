import pool from '@/db/index.js'

// discord_id → users.id (identity layer ผูก user_id เป็น NOT NULL แล้ว)
async function userIdByDiscord(discordId, client = pool) {
  const { rows } = await client.query(`SELECT id FROM users WHERE discord_id = $1`, [discordId])
  return rows[0]?.id ?? null
}

export async function linkIdentity(discordId, provider, providerId, credential = null) {
  const userId = await userIdByDiscord(discordId)
  if (userId == null) throw Object.assign(new Error('no_user'), { code: 'no_user' })

  if (provider === 'passkey') {
    // passkey: user สามารถมีได้หลาย device, แต่ credential_id ต้องไม่ซ้ำข้าม user
    await pool.query(
      `INSERT INTO user_identities (user_id, discord_id, provider, provider_id, credential)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_id) DO NOTHING`,
      [userId, discordId, provider, providerId, credential ? JSON.stringify(credential) : null]
    )
    return
  }

  // line/google: ป้องกัน account ถูกขโมย
  const { rows } = await pool.query(
    `SELECT discord_id FROM user_identities WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId]
  )
  if (rows[0] && rows[0].discord_id !== discordId) {
    throw Object.assign(new Error('already_taken'), { code: 'already_taken' })
  }

  // ลบ link เก่า (ถ้า user นี้ผูก provider นี้กับ account อื่นอยู่แล้ว) แล้ว insert ใหม่
  await pool.query(
    `DELETE FROM user_identities WHERE discord_id = $1 AND provider = $2 AND provider_id != $3`,
    [discordId, provider, providerId]
  )
  await pool.query(
    `INSERT INTO user_identities (user_id, discord_id, provider, provider_id, credential)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider, provider_id) DO NOTHING`,
    [userId, discordId, provider, providerId, credential ? JSON.stringify(credential) : null]
  )
}

export async function unlinkIdentity(discordId, provider, providerId = null) {
  if (providerId) {
    await pool.query(
      `DELETE FROM user_identities WHERE discord_id = $1 AND provider = $2 AND provider_id = $3`,
      [discordId, provider, providerId]
    )
  } else {
    await pool.query(
      `DELETE FROM user_identities WHERE discord_id = $1 AND provider = $2`,
      [discordId, provider]
    )
  }
}

export async function findDiscordIdByProvider(provider, providerId) {
  const { rows } = await pool.query(
    `SELECT discord_id FROM user_identities WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId]
  )
  return rows[0]?.discord_id ?? null
}

// ผูก identity เข้ากับ users.id ตรงๆ (ประตูสมัครที่ไม่มี discord เช่น google signup)
export async function linkIdentityByUser(userId, provider, providerId) {
  const { rows } = await pool.query(
    `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId]
  )
  if (rows[0] && rows[0].user_id !== userId) {
    throw Object.assign(new Error('already_taken'), { code: 'already_taken' })
  }
  const { rows: ur } = await pool.query(`SELECT discord_id FROM users WHERE id = $1`, [userId])
  await pool.query(
    `INSERT INTO user_identities (user_id, discord_id, provider, provider_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [userId, ur[0]?.discord_id ?? null, provider, providerId]
  )
}

// userId → discord_id (ถ้าคนนั้นมี discord ผูก) · feature code ยัง key ด้วย discordId
export async function discordIdByUserId(userId) {
  const { rows } = await pool.query(`SELECT discord_id FROM users WHERE id = $1`, [userId])
  return rows[0]?.discord_id ?? null
}

// ประตูใหม่: identity ใดๆ → users.id (แกนหลัง unify auth)
export async function findUserIdByProvider(provider, providerId) {
  const { rows } = await pool.query(
    `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId]
  )
  return rows[0]?.user_id ?? null
}

// discord login: หา users.id จาก snowflake · ไม่มี = สร้าง users + identity (create-on-login)
export async function resolveUserByDiscord(discordId, username = null) {
  const found = await findUserIdByProvider('discord', discordId)
  if (found) return found
  const { rows } = await pool.query(
    `INSERT INTO users (discord_id, username) VALUES ($1, $2)
     ON CONFLICT (discord_id) WHERE discord_id IS NOT NULL
       DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [discordId, username]
  )
  const userId = rows[0].id
  await pool.query(
    `INSERT INTO user_identities (user_id, discord_id, provider, provider_id)
     VALUES ($1, $2, 'discord', $2)
     ON CONFLICT (provider, provider_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [userId, discordId]
  )
  return userId
}

export async function getUserIdentities(discordId) {
  const { rows } = await pool.query(
    `SELECT provider, provider_id, created_at FROM user_identities WHERE discord_id = $1 ORDER BY created_at`,
    [discordId]
  )
  return rows
}

export async function getPasskeyCredential(credentialId) {
  const { rows } = await pool.query(
    `SELECT discord_id, credential FROM user_identities
     WHERE provider = 'passkey' AND provider_id = $1`,
    [credentialId]
  )
  if (!rows[0]) return null
  return { discordId: rows[0].discord_id, credential: rows[0].credential }
}

export async function updatePasskeyCounter(credentialId, counter) {
  await pool.query(
    `UPDATE user_identities SET credential = credential || $1
     WHERE provider = 'passkey' AND provider_id = $2`,
    [JSON.stringify({ counter }), credentialId]
  )
}
