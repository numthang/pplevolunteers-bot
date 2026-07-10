import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

// /cooking เข้าใช้ได้โดยไม่ต้อง login — owner = discord id ถ้า login, ไม่งั้น = anonymous cookie id.
// เรียกได้เฉพาะใน Route Handler / Server Action (ต้อง set cookie ได้ตอน anon ครั้งแรก).
const COOKIE = 'cooking_uid'
const YEAR = 60 * 60 * 24 * 365

export async function resolveOwner() {
  const session = await getServerSession(authOptions)
  if (session?.user?.discordId) {
    return { owner: session.user.discordId, isAnon: false }
  }
  const store = await cookies()
  let uid = store.get(COOKIE)?.value
  if (!uid) {
    uid = 'anon-' + randomUUID()
    store.set(COOKIE, uid, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: YEAR,
      path: '/',
    })
  }
  return { owner: uid, isAnon: true }
}

// อ่าน anon uid ที่มีอยู่ (ไม่สร้างใหม่) — ใช้ตอน login เพื่อ merge state เดิมเข้า discord id
export async function readAnonUid() {
  const store = await cookies()
  return store.get(COOKIE)?.value || null
}
