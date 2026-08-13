import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getGuildId } from '@/lib/guildContext.js'
import { isAdmin } from '@/lib/callingAccess.js'
import { parseCallingXlsx } from '@/lib/calling/parseXlsxImport.js'
import { runCallingImport } from '@/db/calling/importXlsx.js'

// นำเข้า calling log จากไฟล์ xlsx (backoffice ของ scripts/calling/import-calling-xlsx.js)
// สิทธิ์ = admin เท่านั้น เพราะเขียนตรงเข้า cache_pple_member (ข้าม sync ปกติ) + calling_logs จำนวนมาก
// mode=preview: parse อย่างเดียว ไม่แตะ DB (ให้ preview ก่อนกดยืนยันตามกฎ Create ต้องมีปุ่มบันทึก)
// mode=commit: เขียนจริงใน transaction เดียว
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!isAdmin(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const orgId = await getOrgId(session)
  const guildId = await getGuildId(session)
  if (!orgId || !guildId) return Response.json({ error: 'องค์กรนี้ยังไม่ผูก Discord server — นำเข้าไม่ได้' }, { status: 403 })

  let form
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'อ่านฟอร์มไม่สำเร็จ' }, { status: 400 })
  }

  const file = form.get('file')
  const province = String(form.get('province') || '').trim()
  const campaignId = parseInt(form.get('campaignId'), 10)
  const dateStr = String(form.get('date') || '').trim()
  const mode = String(form.get('mode') || 'preview')

  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'กรุณาเลือกไฟล์ .xlsx' }, { status: 400 })
  }
  if (!province) return Response.json({ error: 'กรุณาระบุจังหวัด' }, { status: 400 })
  if (!campaignId || isNaN(campaignId)) return Response.json({ error: 'campaign_id ไม่ถูกต้อง' }, { status: 400 })

  const calledAt = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? `${dateStr} 00:00:00`
    : `${new Date().toISOString().slice(0, 10)} 00:00:00`

  let parsed
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    parsed = parseCallingXlsx(buffer, province)
  } catch (error) {
    console.error('[POST /api/calling/campaigns/import] parse', error)
    return Response.json({ error: `อ่านไฟล์ไม่สำเร็จ: ${error.message}` }, { status: 400 })
  }

  if (parsed.members.length === 0 && parsed.logs.length === 0) {
    return Response.json({ error: 'ไม่พบข้อมูลในไฟล์ (ไม่มีคอลัมน์ลิงก์สมาชิกที่ระบุได้)' }, { status: 400 })
  }

  if (mode === 'preview') {
    return Response.json({
      success: true,
      preview: {
        campaignName: parsed.campaignName,
        memberCount: parsed.members.length,
        logCount: parsed.logs.length,
        tierCount: parsed.tiers.length,
        warnings: parsed.warnings,
        sampleMembers: parsed.members.slice(0, 5),
        sampleLogs: parsed.logs.slice(0, 5),
      },
    })
  }

  try {
    const result = await runCallingImport(orgId, guildId, campaignId, parsed.campaignName, province, calledAt, parsed)
    return Response.json({ success: true, data: { ...result, campaignId } })
  } catch (error) {
    console.error('[POST /api/calling/campaigns/import] commit', error)
    return Response.json({ error: `นำเข้าไม่สำเร็จ: ${error.message}` }, { status: 500 })
  }
}
