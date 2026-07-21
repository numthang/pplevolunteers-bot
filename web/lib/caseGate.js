/**
 * Gate helper สำหรับ caseworker action APIs — รวม auth + permission + scope ไว้ที่เดียว
 * คืน { error } (Response) ถ้าไม่ผ่าน · คืน { session, access, orgId, guildId, caseRow } ถ้าผ่าน
 *
 * - `orgId`   = scope จริงของเคส (cases.org_id) — ใช้กับทุก query/write ของ cases
 * - `guildId` = **Discord artifact** (cases.discord_guild_id) — guild ที่ thread ของเคสนี้อยู่
 *   ใช้เฉพาะตอนคุยกับ Discord (case_config / forum thread) · **NULL ได้** ถ้าเคสไม่มี Discord
 *
 * ⚠️ guildId ต้องมาจากตัวเคสเสมอ ห้ามเดาจาก session ที่กำลัง browse — org เดียวมีได้หลาย guild
 *    (org 1 มี 3) เดาผิด = ไปยิง forum ผิดเซิร์ฟเวอร์ · กัน dangling pointer แบบเดียวกับ
 *    verifyHandler (ดู decision_tenant_anchor_guild)
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { canManageCases, canAccessCaseProvince } from '@/lib/caseAccess.js'
import { getCaseByRefFull } from '@/db/cases.js'

export async function gateCase(ref) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { access } = await getEffectiveIdentity(session)
  if (!canManageCases(access)) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }

  const orgId = await getOrgId(session)
  if (!orgId) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }

  const caseRow = await getCaseByRefFull(orgId, ref)
  if (!caseRow) return { error: Response.json({ error: 'Not found' }, { status: 404 }) }

  if (!canAccessCaseProvince(caseRow.province, access)) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { session, access, orgId, guildId: caseRow.discord_guild_id ?? null, caseRow }
}
