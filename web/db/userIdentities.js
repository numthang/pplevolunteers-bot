import pool from '@/db/index.js'

// email → lowercase/trim (inline เลี่ยง circular import กับ orgMembers.js)
const normEmail = (e) => String(e || '').trim().toLowerCase() || null

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
     VALUES ($1, $2, 'discord', $3)
     ON CONFLICT (provider, provider_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [userId, snowflake, snowflake]
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

// discord login: หา users.id จาก snowflake · ไม่มี = สร้าง/รวมบัญชี (create-on-login)
// email (verified) → รวมเข้าบัญชี email เดิม เพื่อไม่ให้คนเดียวแตกหลายบัญชี (เหมือนประตู Google)
// atomic: users upsert + identity insert อยู่ใน transaction เดียว → ไม่เกิด orphan (users มี discord_id แต่ไม่มี identity)
export async function resolveUserByDiscord(discordId, username = null, email = null, emailVerified = false) {
  const em = emailVerified ? normEmail(email) : null
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. identity เดิม (index provider,provider_id) → 2. users.discord_id (uq_users_discord) — ทั้งคู่ indexed
    let userId = null
    const idRes = await client.query(
      `SELECT user_id FROM user_identities WHERE provider = 'discord' AND provider_id = $1`,
      [discordId]
    )
    userId = idRes.rows[0]?.user_id ?? null
    if (!userId) {
      const uRes = await client.query(`SELECT id FROM users WHERE discord_id = $1`, [discordId])
      userId = uRes.rows[0]?.id ?? null
    }

    // 3. ยังไม่มี discord anchor → รวมเข้าบัญชี email เดิม (เฉพาะ email verified + บัญชีนั้นยังไม่ผูก discord อื่น)
    if (!userId && em) {
      const { rows: er } = await client.query(
        `SELECT id FROM users WHERE email = $1 AND discord_id IS NULL`,
        [em]
      )
      if (er[0]) {
        userId = er[0].id
        await client.query(
          `UPDATE users SET discord_id = $1, username = COALESCE(username, $2), updated_at = NOW() WHERE id = $3`,
          [discordId, username, userId]
        )
      }
    }

    // 4. ไม่เจอเลย → สร้างใหม่ (เก็บ email verified ไปด้วยถ้ามีและยังไม่มีใครถือ)
    if (!userId) {
      const { rows: nr } = await client.query(
        `INSERT INTO users (discord_id, username, email) VALUES ($1, $2, $3)
         ON CONFLICT (discord_id) WHERE discord_id IS NOT NULL
           DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [discordId, username, em && !(await emailTaken(client, em)) ? em : null]
      )
      userId = nr[0].id
    }

    // 5. identity row (atomic กับข้างบน)
    // $2/$3 แยกกันแม้ค่าเดียวกัน (discordId ซ้ำ) — ใช้ $2 ซ้ำ 2 คอลัมน์ที่ type ต่างกัน (varchar vs text)
    // ทำให้ Postgres deduce type ไม่ได้ ("inconsistent types deduced for parameter $2")
    await client.query(
      `INSERT INTO user_identities (user_id, discord_id, provider, provider_id)
       VALUES ($1, $2, 'discord', $3)
       ON CONFLICT (provider, provider_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [userId, discordId, discordId]
    )

    // 6. enrich: เติม email ให้บัญชีที่ยังว่าง (guard uq_users_email กัน login ล่ม)
    if (em) {
      await client.query(
        `UPDATE users SET email = $1, updated_at = NOW()
          WHERE id = $2 AND email IS NULL
            AND NOT EXISTS (SELECT 1 FROM users WHERE email = $1 AND id <> $2)`,
        [em, userId]
      )
    }

    // 7. claim invite ที่ค้าง (invited→active) — เชิญเข้า org ด้วย email แล้ว login discord ที่ email ตรง
    //    (ประตู google/magic ทำผ่าน resolveOrgUser อยู่แล้ว · discord ต้องทำเองตรงนี้)
    await client.query(
      `UPDATE org_members SET status = 'active' WHERE user_id = $1 AND status = 'invited'`,
      [userId]
    )

    await client.query('COMMIT')
    return userId
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function emailTaken(client, em) {
  const { rows } = await client.query(`SELECT 1 FROM users WHERE email = $1 LIMIT 1`, [em])
  return rows.length > 0
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
