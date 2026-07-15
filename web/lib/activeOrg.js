// web/lib/activeOrg.js — active org ต่อ session (เก็บใน cookie 'active_org')
// N org → picker/switcher · resolve: cookie ที่ valid membership > org แรก · 0 org = null
import { cookies } from 'next/headers'
import { listUserOrgs } from '@/db/orgMembers.js'

const COOKIE = 'active_org'

// คืน { activeOrg, orgs } — activeOrg = org ที่ active อยู่ (หรือ null ถ้ายังไม่มี org)
export async function resolveActiveOrg(userId) {
  const orgs = await listUserOrgs(userId)
  const active = orgs.filter(o => o.status === 'active')
  if (active.length === 0) return { activeOrg: null, orgs }

  const jar = await cookies()
  const wanted = Number(jar.get(COOKIE)?.value || 0)
  const activeOrg = active.find(o => o.id === wanted) || active[0]
  return { activeOrg, orgs }
}

export const ACTIVE_ORG_COOKIE = COOKIE
