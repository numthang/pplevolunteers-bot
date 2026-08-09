// web/lib/socialOAuthScope.js — resolve scope ของ OAuth flow ทั้ง 3 แพลตฟอร์ม (Meta / Threads / X)
//
// **org เป็นเจ้าของบัญชี · guild เป็น metadata ที่เลือกได้** (2026-08-09)
// เดิมทั้ง 3 เส้น start บังคับ `guild_id` → org ที่ไม่มี Discord กด Connect ไม่ได้เลย
// (creds ย้ายขึ้น org_config ตั้งแต่ 2026-07-29 แล้ว แต่ OAuth ยังค้างผูก guild — งานครึ่งทาง)
//
// scope มาจาก session เสมอ ไม่รับ org จาก client (กันยัดบัญชีเข้าองค์กรอื่น — pattern เดียวกับ
// POST /api/social/accounts) · guild_id ที่ client ส่งมาต้องเป็น guild ขององค์กรตัวเองเท่านั้น
import { orgIdOfGuild } from '@/db/guilds.js'
import { getOrgId } from './orgContext.js'

/**
 * @returns {{ orgId: number, guildId: string|null } | { error: string, status: number }}
 */
export async function resolveOAuthScope(session, rawGuildId) {
  const guildId = rawGuildId || null

  const orgId = await getOrgId(session)
  if (!orgId) {
    return { error: 'ยังไม่มีองค์กรที่ใช้งานอยู่ — เลือกองค์กรก่อนเชื่อมบัญชี', status: 400 }
  }

  if (guildId && (await orgIdOfGuild(guildId)) !== orgId) {
    return { error: 'guild ไม่ได้อยู่ในองค์กรนี้', status: 403 }
  }

  return { orgId, guildId }
}

// callback ที่ยิงมาจาก state/cookie ที่ออกก่อน deploy จะไม่มี orgId → derive จาก guild เหมือนเดิม
// (flow ค้างกลางทางตอน deploy ต้องไม่พัง · ลบ fallback ได้เมื่อพ้น 10 นาทีหลัง deploy)
export async function orgIdFromState({ orgId = null, guildId = null } = {}) {
  return orgId ?? (guildId ? await orgIdOfGuild(guildId) : null)
}
