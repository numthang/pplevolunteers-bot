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

// ผูก identity เข้ากับ users.id ตรงๆ — แกนของ link flow ใหม่ (ใครก็ตามที่ login อยู่)
// single-account provider (line/google) → แทนที่ link เก่า · passkey → เพิ่มได้หลาย device
export async function linkIdentityByUser(userId, provider, providerId, credential = null) {
  const { rows } = await pool.query(
    `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_id = $2`,
    [provider, providerId]
  )
  if (rows[0] && rows[0].user_id !== userId) {
    throw Object.assign(new Error('already_taken'), { code: 'already_taken' })
  }
  const { rows: ur } = await pool.query(`SELECT discord_id FROM users WHERE id = $1`, [userId])
  const discordId = ur[0]?.discord_id ?? null

  if (provider !== 'passkey') {
    await pool.query(
      `DELETE FROM user_identities WHERE user_id = $1 AND provider = $2 AND provider_id != $3`,
      [userId, provider, providerId]
    )
  }
  await pool.query(
    `INSERT INTO user_identities (user_id, discord_id, provider, provider_id, credential)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider, provider_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [userId, discordId, provider, providerId, credential ? JSON.stringify(credential) : null]
  )
}

// ผูก Discord เข้ากับ user ที่ login อยู่ (ทุกวิธี login) — merge policy = BLOCK ไม่ auto-merge
// snowflake ผูกกับ user อื่นอยู่แล้ว (identity row หรือ users.discord_id) → โยน already_taken
export async function linkDiscordToUser(userId, snowflake, username = null) {
  const { rows: idRows } = await pool.query(
    `SELECT user_id FROM user_identities WHERE provider = 'discord' AND provider_id = $1`,
    [snowflake]
  )
  if (idRows[0] && idRows[0].user_id !== userId) {
    throw Object.assign(new Error('already_taken'), { code: 'already_taken' })
  }
  const { rows: uRows } = await pool.query(`SELECT id FROM users WHERE discord_id = $1`, [snowflake])
  if (uRows[0] && uRows[0].id !== userId) {
    throw Object.assign(new Error('already_taken'), { code: 'already_taken' })
  }
  // user นี้ผูก discord อื่นอยู่แล้ว → block (1 user ผูกได้ 1 discord)
  const { rows: curRows } = await pool.query(`SELECT discord_id FROM users WHERE id = $1`, [userId])
  if (curRows[0]?.discord_id && curRows[0].discord_id !== snowflake) {
    throw Object.assign(new Error('already_linked_other'), { code: 'already_linked_other' })
  }
  await pool.query(
    `UPDATE users SET discord_id = $1, username = COALESCE(username, $2), updated_at = NOW() WHERE id = $3`,
    [snowflake, username, userId]
  )
  await pool.query(
    `INSERT INTO user_identities (user_id, discord_id, provider, provider_id)
     VALUES ($1, $2, 'discord', $2)
     ON CONFLICT (provider, provider_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [userId, snowflake]
  )
}

// list identities ของ user (แกน user_id — ใช้ได้กับ email-only ที่ไม่มี discord_id)
export async function getUserIdentitiesByUser(userId) {
  const { rows } = await pool.query(
    `SELECT provider, provider_id, credential, created_at
       FROM user_identities WHERE user_id = $1 ORDER BY created_at`,
    [userId]
  )
  return rows
}

// unlink keyed by user_id
export async function unlinkIdentityByUser(userId, provider, providerId = null) {
  if (providerId) {
    await pool.query(
      `DELETE FROM user_identities WHERE user_id = $1 AND provider = $2 AND provider_id = $3`,
      [userId, provider, providerId]
    )
  } else {
    await pool.query(
      `DELETE FROM user_identities WHERE user_id = $1 AND provider = $2`,
      [userId, provider]
    )
  }
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
    `SELECT user_id, discord_id, credential FROM user_identities
     WHERE provider = 'passkey' AND provider_id = $1`,
    [credentialId]
  )
  if (!rows[0]) return null
  return { userId: rows[0].user_id, discordId: rows[0].discord_id, credential: rows[0].credential }
}

export async function updatePasskeyCounter(credentialId, counter) {
  await pool.query(
    `UPDATE user_identities SET credential = credential || $1
     WHERE provider = 'passkey' AND provider_id = $2`,
    [JSON.stringify({ counter }), credentialId]
  )
}
