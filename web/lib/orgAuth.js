// web/lib/orgAuth.js — server helper สำหรับ /org session
// หลัง unify auth = instance เดียว → ใช้ authOptions หลัก (เดิมเป็น orgAuthOptions instance ที่ 2)
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from './auth-options.js'

export function getOrgSession() {
  return getServerSession(authOptions)
}

// ใช้ใน server component ของ /org/* — ยังไม่ login → เด้ง login
export async function requireOrgUser() {
  const session = await getOrgSession()
  if (!session?.user?.userId) redirect('/org/login')
  return session
}
