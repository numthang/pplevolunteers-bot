// web/lib/orgAuth.js — server helper สำหรับ org session (คู่กับ lib/auth.js ของ PPLE)
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { orgAuthOptions } from './org-auth-options.js'

export function getOrgSession() {
  return getServerSession(orgAuthOptions)
}

// ใช้ใน server component ของ /org/* — ยังไม่ login → เด้ง login
export async function requireOrgUser() {
  const session = await getOrgSession()
  if (!session?.user?.userId) redirect('/org/login')
  return session
}
