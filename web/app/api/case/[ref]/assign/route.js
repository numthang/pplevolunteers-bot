import { gateCase } from '@/lib/caseGate.js'
import { assignCase, unassignCase } from '@/lib/caseAssign.js'
import { userIdByDiscord } from '@/db/guilds.js'

/**
 * ⛔ ห้ามเรียก addAssignee/removeAssignee จาก db/cases.js ตรงๆ ที่นี่
 *    ทุกการเปลี่ยนผู้รับผิดชอบต้องผ่าน lib/caseAssign.js เพื่อให้ sync การ์ด kanban + ping Discord + audit
 *    ครบทุกทางเข้า (บอร์ด kanban ก็เรียก service ตัวเดียวกัน)
 */

/** POST /api/case/[ref]/assign — รับเรื่อง (default = ตัวเอง) หรือ assign คนอื่น { userId } / { discordId } */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, orgId, caseRow } = gate

  let discordId = session.user.discordId
  let userId = session.user.userId
  try {
    const body = await req.json().catch(() => ({}))
    // ⭐ { userId } มาจากตัวเลือก "ผู้รับผิดชอบ" ในหน้าเคส (ค้นคนใน org ด้วย /api/kanban/people
    //    ซึ่งตั้งใจไม่คืน discord_id — PII) → เช็คก่อน discordId เสมอ ไม่ต้องเสีย round trip lookup
    if (body.userId) {
      userId = Number(body.userId)
      discordId = null   // ไม่รู้ discordId ของเป้าหมาย — audit meta/mention ไปตาม targetDiscordId=null
    } else if (body.discordId) {
      discordId = String(body.discordId)
      userId = await userIdByDiscord(discordId)
    }
  } catch { /* default self */ }

  await assignCase(orgId, caseRow, userId, {
    actorUserId: session.user.userId, targetDiscordId: discordId,
  })

  return Response.json({ ok: true })
}

/** DELETE /api/case/[ref]/assign — ถอนตัว (default = ตัวเอง) หรือถอนคนอื่น { userId } / { discordId } */
export async function DELETE(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, orgId, caseRow } = gate

  let discordId = session.user.discordId
  let userId = session.user.userId
  try {
    const body = await req.json().catch(() => ({}))
    if (body.userId) {
      userId = Number(body.userId)
      discordId = null
    } else if (body.discordId) {
      discordId = String(body.discordId)
      userId = await userIdByDiscord(discordId)
    }
  } catch { /* default self */ }

  await unassignCase(orgId, caseRow, userId, {
    actorUserId: session.user.userId, targetDiscordId: discordId,
  })

  return Response.json({ ok: true })
}
