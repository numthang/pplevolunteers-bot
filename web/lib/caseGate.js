/**
 * Gate helper สำหรับ caseworker action APIs — รวม auth + permission + scope ไว้ที่เดียว
 * คืน { error } (Response) ถ้าไม่ผ่าน · คืน { session, access, guildId, caseRow } ถ้าผ่าน
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getOrgGuildIds } from '@/lib/org.js'
import { canManageCases, canAccessCaseProvince } from '@/lib/caseAccess.js'
import { getCaseByRefFull } from '@/db/cases.js'

export async function gateCase(ref) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { access } = await getEffectiveIdentity(session)
  if (!canManageCases(access)) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }

  const sessionGuildId = await getGuildId(session)
  const orgGuildIds = await getOrgGuildIds(sessionGuildId)
  const caseRow = await getCaseByRefFull(orgGuildIds, ref)
  if (!caseRow) return { error: Response.json({ error: 'Not found' }, { status: 404 }) }

  if (!canAccessCaseProvince(caseRow.province, access)) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  // guildId เจ้าของเคสจริง (ไม่ใช่ guild ที่ session กำลัง browse) — ทุก write/config lookup ต่อจากนี้ต้องยึดตัวนี้
  // กัน dangling pointer แบบเดียวกับ verifyHandler (ดู decision_tenant_anchor_guild)
  return { session, access, guildId: caseRow.guild_id, caseRow }
}
