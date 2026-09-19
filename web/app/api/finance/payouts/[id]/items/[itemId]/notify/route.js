import { createTranslator } from 'next-intl'
import { listItems, markNotified } from '@/db/finance/payouts.js'
import { buildNotifyMessage, canNotify } from '@/lib/payoutNotify.js'
import { sendDm } from '@/lib/discordDm.js'
import { getUserById } from '@/db/orgMembers.js'
import { requireRound } from '../../../../_guard.js'
import thMessages from '@/locales/th.json'

/**
 * แจ้งผู้รับทาง Discord DM ว่าโอนเงินให้แล้ว — กดซ้ำได้ไม่จำกัด (user เคาะ 2026-09-19)
 *
 * ⚠️ allowPaid: true — รอบที่ปิดแล้ว (`status='paid'`) คือจังหวะที่ต้องแจ้งพอดี
 *    _guard ปกติตอบ 409 กับทุก write · route นี้ไม่แตะตัวเงิน เขียนแค่ร่องรอยการแจ้ง
 * ⚠️ ภาษาของ DM ล็อกเป็นไทยเสมอ ไม่ใช้ getTranslations() — locale ของ request มาจาก
 *    cookie ของ "คนกดปุ่ม" (i18n/request.js) แอดมินสลับเว็บเป็น EN แล้วกด
 *    อาสาจะได้ DM ภาษาอังกฤษทั้งที่ไม่ได้เลือกเอง
 * ⚠️ ท้ายข้อความมี mention ของคนกดปุ่มให้ผู้รับทักกลับถูกคน — mention คนที่ไม่ได้อยู่ในห้อง DM
 *    ไม่ ping ใคร แค่ render เป็นชื่อที่กดได้ · คนกดไม่มี discord_id (บัญชีอีเมลล้วน หรือ
 *    debug mode ที่ getEffectiveIdentity คืน discordId = null) → ตัดท่อนนั้นทิ้ง ไม่ใช่โชว์ id ดิบ
 */
export async function POST(req, { params }) {
  const { id, itemId } = await params
  const ctx = await requireRound(id, { write: true, allowPaid: true })
  if (ctx.error) return ctx.error

  const items = await listItems(ctx.orgId, ctx.round.id)
  const item = items.find(x => String(x.id) === String(itemId))
  if (!item) return Response.json({ error: 'Not found' }, { status: 404 })

  const gate = canNotify(item)
  if (!gate.ok) return Response.json({ error: 'cannot_notify', reason: gate.reason }, { status: 400 })

  const sender = await getUserById(ctx.userId)
  const senderMention = sender?.discord_id ? `<@${sender.discord_id}>` : null

  const t = createTranslator({ locale: 'th', messages: thMessages, namespace: 'finance' })
  const content = buildNotifyMessage({ round: ctx.round, item, account: ctx.account, senderMention, t })

  const sent = await sendDm(item.discord_id, content)
  // ส่งไม่ผ่าน = ไม่เขียน notified_at (ไม่งั้นได้ log ที่โกหกว่าแจ้งแล้ว)
  if (!sent.ok) return Response.json({ error: 'send_failed', reason: sent.reason }, { status: 502 })

  const marked = await markNotified(ctx.orgId, ctx.round.id, item.id, ctx.userId)
  return Response.json({
    ok: true,
    notified_at: marked?.notified_at || new Date().toISOString(),
    notify_count: marked?.notify_count ?? (item.notify_count || 0) + 1,
  })
}
