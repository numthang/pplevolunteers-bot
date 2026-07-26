import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { unlinkIdentityByUser, getUserIdentitiesByUser } from '@/db/userIdentities.js'
import pool from '@/db/index.js'

// phone = column บน users (ไม่ใช่ identity row) → จัดการแยก
// discord = identity row + users.discord_id (feature เยอะ key ด้วยตัวนี้) → ถอดต้องเคลียร์ทั้งคู่
const IDENTITY_PROVIDERS = ['line', 'google', 'passkey', 'discord']

export async function DELETE(req) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { provider, provider_id } = await req.json()
  const isPhone = provider === 'phone'
  if (!isPhone && !IDENTITY_PROVIDERS.includes(provider)) {
    return Response.json({ error: 'invalid provider' }, { status: 400 })
  }

  // ห้ามถอด "วิธี login สุดท้าย" — ไม่งั้น lock ตัวเองออกจากระบบ
  // นับทุกทางที่ resolve กลับมาเป็น user นี้ได้: identity rows + เบอร์ verified + email (magic-link)
  const identities = await getUserIdentitiesByUser(userId)
  const { rows } = await pool.query('SELECT email, phone_verified_at FROM users WHERE id = $1', [userId])
  const totalMethods = identities.length + (rows[0]?.phone_verified_at ? 1 : 0) + (rows[0]?.email ? 1 : 0)
  if (totalMethods <= 1) {
    return Response.json({ error: 'ต้องเหลือวิธี login อย่างน้อย 1 วิธี — ผูกวิธีอื่นก่อนถึงจะถอดอันนี้ได้' }, { status: 400 })
  }

  if (isPhone) {
    // ถอดเบอร์ = เลิก verified (เก็บเบอร์ไว้เป็น contact) → login ด้วยเบอร์ไม่ได้จนกว่าจะ verify ใหม่
    await pool.query('UPDATE users SET phone_verified_at = NULL, updated_at = NOW() WHERE id = $1', [userId])
  } else {
    await unlinkIdentityByUser(userId, provider, provider_id || null)
    // discord: เคลียร์ users.discord_id ด้วย (session/feature key ด้วยตัวนี้) → เข้า Discord-keyed feature ไม่ได้จนผูกใหม่
    if (provider === 'discord') {
      await pool.query('UPDATE users SET discord_id = NULL, updated_at = NOW() WHERE id = $1', [userId])
    }
  }
  return Response.json({ ok: true })
}
