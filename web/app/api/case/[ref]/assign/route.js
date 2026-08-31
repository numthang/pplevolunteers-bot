import { gateCase } from '@/lib/caseGate.js'
import { assignCase, unassignCase } from '@/lib/caseAssign.js'
import { userIdByDiscord } from '@/db/guilds.js'

/**
 * ⛔ ห้ามเรียก addAssignee/removeAssignee จาก db/cases.js ตรงๆ ที่นี่
 *    ทุกการเปลี่ยนผู้รับผิดชอบต้องผ่าน lib/caseAssign.js เพื่อให้ sync การ์ด kanban + ping Discord + audit
 *    ครบทุกทางเข้า (บอร์ด kanban ก็เรียก service ตัวเดียวกัน)
 */

/** POST /api/case/[ref]/assign — รับเรื่อง (default = ตัวเอง) หรือ assign คนอื่น { discordId } */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, orgId, caseRow } = gate

  let discordId = session.user.discordId
  let userId = session.user.userId
  try {
    const body = await req.json().catch(() => ({}))
    if (body.discordId) {
      discordId = String(body.discordId)
      userId = await userIdByDiscord(discordId)
    }
  } catch { /* default self */ }

  await assignCase(orgId, caseRow, userId, {
    actorUserId: session.user.userId, targetDiscordId: discordId,
  })

  return Response.json({ ok: true })
}

/** DELETE /api/case/[ref]/assign — ถอนตัว (default = ตัวเอง) หรือถอนคนอื่น { discordId } */
export async function DELETE(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, orgId, caseRow } = gate

  let discordId = session.user.discordId
  let userId = session.user.userId
  try {
    const body = await req.json().catch(() => ({}))
    if (body.discordId) {
      discordId = String(body.discordId)
      userId = await userIdByDiscord(discordId)
    }
  } catch { /* default self */ }

  await unassignCase(orgId, caseRow, userId, {
    actorUserId: session.user.userId, targetDiscordId: discordId,
  })

  return Response.json({ ok: true })
}
