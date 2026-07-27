/**
 * Live check (ต่อ DB จริง) — resolveUserByDiscord + phone login resolution
 * รัน: cd web && npm run test:live
 *
 * ทำไมต้อง live: bug-059 (inconsistent types deduced for parameter $2) พังเฉพาะตอนวิ่งผ่าน
 * node-postgres จริง (extended protocol) — replay ด้วย plpgsql จับไม่ได้ เพราะ typed vars มี implicit cast
 * เทสนี้จึงเรียกฟังก์ชันตัวจริงผ่าน pool จริง → เป็นตาข่ายกันบั๊กชนิดนี้ ไม่ต้อง login/logout เองอีก
 *
 * ⚠️ เขียน DB จริง — ใช้ข้อมูลสมมติ prefix 'vitest' ทั้งหมด + ลบทิ้งใน before/afterAll
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pool from '@/db/index.js'
import { resolveUserByDiscord, findUserIdByProvider } from '@/db/userIdentities.js'
import { findOwnerByVerifiedPhone } from '@/lib/phoneLoginOtp.js'

const P = 'vitest' // prefix ข้อมูลทดสอบ (discord_id/email/phone) → ลบทิ้งได้หมด

async function cleanup() {
  await pool.query(
    `DELETE FROM org_members WHERE user_id IN
       (SELECT id FROM users WHERE discord_id LIKE $1 OR email LIKE $2 OR phone LIKE $3)`,
    [`${P}%`, `${P}+%`, `${P}%`]
  )
  await pool.query(
    `DELETE FROM user_identities WHERE provider_id LIKE $1 OR user_id IN
       (SELECT id FROM users WHERE discord_id LIKE $2 OR email LIKE $3 OR phone LIKE $4)`,
    [`${P}%`, `${P}%`, `${P}+%`, `${P}%`]
  )
  await pool.query(
    `DELETE FROM users WHERE discord_id LIKE $1 OR email LIKE $2 OR phone LIKE $3`,
    [`${P}%`, `${P}+%`, `${P}%`]
  )
}

beforeAll(cleanup)
afterAll(cleanup)

describe('resolveUserByDiscord (DB จริง)', () => {
  it('user เดิม login ซ้ำ → คืน id เดิม ไม่ throw [regression bug-059]', async () => {
    const sf = `${P}00000001`
    const id1 = await resolveUserByDiscord(sf, 'vt-user1')       // create-on-login
    expect(typeof id1).toBe('number')
    // รอบสองวิ่ง step 5 (identity upsert) บน identity ที่มีอยู่แล้ว = path ที่ $2 เคยพัง
    const id2 = await resolveUserByDiscord(sf, 'vt-user1')
    expect(id2).toBe(id1)
    // identity row มีจริง 1 แถว
    const uid = await findUserIdByProvider('discord', sf)
    expect(uid).toBe(id1)
  })

  it('user ใหม่ (ไม่มี email) → สร้าง users + identity', async () => {
    const sf = `${P}00000002`
    const id = await resolveUserByDiscord(sf, 'vt-user2')
    expect(typeof id).toBe('number')
    const { rows } = await pool.query(`SELECT discord_id, email FROM users WHERE id = $1`, [id])
    expect(rows[0].discord_id).toBe(sf)
    expect(rows[0].email).toBeNull()
  })

  it('email verified ตรงบัญชีเดิม → merge เข้าบัญชีนั้น (ไม่แตกบัญชีใหม่)', async () => {
    const email = `${P}+merge@example.test`
    const { rows } = await pool.query(
      `INSERT INTO users (email, username) VALUES ($1, 'vt-mergee') RETURNING id`, [email]
    )
    const emailUserId = rows[0].id
    const sf = `${P}00000003`
    const resolved = await resolveUserByDiscord(sf, 'vt-user3', email, true)
    expect(resolved).toBe(emailUserId)                 // merge ไม่ใช่สร้างใหม่
    const { rows: r2 } = await pool.query(`SELECT discord_id FROM users WHERE id = $1`, [emailUserId])
    expect(r2[0].discord_id).toBe(sf)
  })

  it('email verified แต่บัญชีนั้นผูก discord อื่นแล้ว → ไม่ทับ สร้างใหม่แทน', async () => {
    const email = `${P}+guard@example.test`
    const existingSf = `${P}00000099`
    const { rows } = await pool.query(
      `INSERT INTO users (email, username, discord_id) VALUES ($1, 'vt-guard', $2) RETURNING id`,
      [email, existingSf]
    )
    const guardUserId = rows[0].id
    const newSf = `${P}00000004`
    const resolved = await resolveUserByDiscord(newSf, 'vt-user4', email, true)
    expect(resolved).not.toBe(guardUserId)             // ไม่ merge (กัน clobber)
    const { rows: r2 } = await pool.query(`SELECT discord_id FROM users WHERE id = $1`, [guardUserId])
    expect(r2[0].discord_id).toBe(existingSf)           // discord เดิมไม่ถูกแตะ
  })

  it('email ยังไม่ verified → ไม่ merge ไม่เก็บ email', async () => {
    const email = `${P}+unverified@example.test`
    const sf = `${P}00000005`
    const id = await resolveUserByDiscord(sf, 'vt-user5', email, false)
    const { rows } = await pool.query(`SELECT email FROM users WHERE id = $1`, [id])
    expect(rows[0].email).toBeNull()
  })
})

describe('phone login resolution (DB จริง)', () => {
  it('email-only user (ไม่มี discord) ที่ verify เบอร์แล้ว → findOwnerByVerifiedPhone คืน id [regression: phone decouple]', async () => {
    const phone = `${P}5550001`.slice(0, 20)
    const { rows } = await pool.query(
      `INSERT INTO users (email, username, phone, phone_verified_at)
       VALUES ($1, 'vt-phone', $2, NOW()) RETURNING id`,
      [`${P}+phone@example.test`, phone]
    )
    const owner = await findOwnerByVerifiedPhone(phone)
    expect(owner).toBe(rows[0].id)
  })
})
