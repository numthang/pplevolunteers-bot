import { listItems, snapshotItems, setRoundStatus } from '@/db/finance/payouts.js'
import { buildExport, validateItems } from '@/lib/payoutExport/index.js'
import { requireRound } from '../../_guard.js'

/**
 * ออกไฟล์โอนกลุ่ม
 *
 * บล็อกที่นี่ ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ — ไฟล์ที่ข้อมูลไม่ครบพอเอาไปอัปโหลดใน K BIZ
 * จะโดนตีกลับทั้งไฟล์ ซึ่งรู้ตอนนั้นสายไปแล้ว → ตอบเป็นรายชื่อคนที่ขาดกลับไปขึ้นธงแดงรายบรรทัด
 */
export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await requireRound(id, { write: false })
  if (ctx.error) return ctx.error

  const format = new URL(req.url).searchParams.get('format') || 'generic-csv'
  const items = await listItems(ctx.orgId, ctx.round.id)

  const check = validateItems(items)
  if (!check.ok) return Response.json({ error: 'incomplete', problems: check.problems }, { status: 422 })

  const file = buildExport(format, { round: ctx.round, items, account: ctx.account })

  // ยิงไฟล์แล้วค่อยล็อกข้อมูลรับเงินไว้กับรอบ — ทะเบียนแก้ทีหลัง ประวัติรอบนี้ไม่เปลี่ยนตาม
  await snapshotItems(ctx.orgId, ctx.round.id, items)
  if (ctx.round.status === 'draft') await setRoundStatus(ctx.orgId, ctx.round.id, 'exported')

  return new Response(file.content, {
    headers: {
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    },
  })
}
