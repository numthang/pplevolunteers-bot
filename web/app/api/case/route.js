import { logAction } from '@/db/auditLog.js'
import { orgIdOfGuild } from '@/db/guilds.js'
import { isValidProvince } from '@/lib/provinceCode.js'
import { CASE_CATEGORIES } from '@/lib/caseOptions.js'
import {
  createCase, insertAttachment, getCaseConfig, setDiscordThreadId,
  countRecentByPhone, countRecentByIp,
} from '@/db/cases.js'
import { saveCaseFile, isAllowedMime, MAX_FILE_SIZE, MAX_FILES } from '@/lib/caseUploads.js'
import { sendSms, normalizePhone, smsConfigured } from '@/lib/sendSms.js'
import { createForumThread } from '@/lib/caseDiscord.js'

const RATE_PER_PHONE = 3   // เคส/24ชม. ต่อเบอร์
const RATE_PER_IP = 10     // เคส/24ชม. ต่อ IP (เผื่อ NAT/มือถือ)

function clientIp(req) {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || null
}

function baseUrl(req) {
  return process.env.NEXTAUTH_URL || new URL(req.url).origin
}

/**
 * POST /api/case — public intake (ไม่ต้อง login)
 * multipart: province, title, category, detail, name, phone, line_id, consent, website(honeypot), files[]
 */
export async function POST(req) {
  let form
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 })
  }

  // honeypot — bot กรอก → ตอบ 200 เงียบ ไม่สร้าง row
  if ((form.get('website') || '').toString().trim()) {
    return Response.json({ ok: true })
  }

  const province = (form.get('province') || '').toString().trim()
  const title = (form.get('title') || '').toString().trim()
  const detail = (form.get('detail') || '').toString().trim()
  const name = (form.get('name') || '').toString().trim()
  const phoneRaw = (form.get('phone') || '').toString().trim()
  const lineId = (form.get('line_id') || '').toString().trim() || null
  const consent = (form.get('consent') || '').toString().trim()
  let category = (form.get('category') || '').toString().trim() || null

  // validation
  if (!isValidProvince(province)) return Response.json({ error: 'จังหวัดไม่ถูกต้อง' }, { status: 400 })
  if (!title) return Response.json({ error: 'กรุณาใส่หัวข้อเรื่อง' }, { status: 400 })
  if (!detail) return Response.json({ error: 'กรุณาใส่รายละเอียด' }, { status: 400 })
  if (!name) return Response.json({ error: 'กรุณาใส่ชื่อ' }, { status: 400 })
  if (!consent) return Response.json({ error: 'ต้องยินยอมให้เก็บข้อมูลก่อนส่งเรื่อง' }, { status: 400 })
  if (category && !CASE_CATEGORIES.includes(category)) category = null

  const phone = normalizePhone(phoneRaw)
  if (!phone || phone.length < 9) return Response.json({ error: 'เบอร์โทรไม่ถูกต้อง' }, { status: 400 })

  // ไฟล์แนบ — validate ฝั่ง server (อย่าเชื่อ client)
  const files = form.getAll('files').filter(f => typeof f === 'object' && f.size > 0)
  if (files.length > MAX_FILES) return Response.json({ error: `แนบได้ไม่เกิน ${MAX_FILES} ไฟล์` }, { status: 400 })
  for (const f of files) {
    if (!isAllowedMime(f.type)) return Response.json({ error: `ชนิดไฟล์ไม่รองรับ: ${f.type}` }, { status: 400 })
    if (f.size > MAX_FILE_SIZE) return Response.json({ error: `ไฟล์เกิน 10MB` }, { status: 400 })
  }

  // rate limit
  const ip = clientIp(req)
  try {
    if (await countRecentByPhone(phone, 24) >= RATE_PER_PHONE) {
      return Response.json({ error: 'ส่งเรื่องบ่อยเกินไป' }, { status: 429 })
    }
    if (ip && await countRecentByIp(ip, 24) >= RATE_PER_IP) {
      return Response.json({ error: 'ส่งเรื่องบ่อยเกินไป' }, { status: 429 })
    }
  } catch (e) {
    console.error('[POST /api/case] rate check', e.message)
  }

  const guildId = process.env.GUILD_ID  // public intake → guild หลัก (อาสาประชาชน)

  let row
  try {
    row = await createCase(guildId, {
      province, category, title, detail, source: 'web',
      complainant_name: name, complainant_phone: phone, complainant_line_id: lineId,
      consent_at: new Date(), intake_ip: ip,
    })
  } catch (e) {
    console.error('[POST /api/case] createCase', e.message)
    return Response.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 })
  }

  // เก็บไฟล์แนบ (best-effort ต่อไฟล์ — ไฟล์พังไม่ทำให้ทั้งเคสล้ม)
  for (const f of files) {
    try {
      const meta = await saveCaseFile(row.id, f)
      await insertAttachment(row.id, guildId, meta)
    } catch (e) {
      console.error('[POST /api/case] attachment', e.message)
    }
  }

  const trackUrl = `${baseUrl(req)}/case/${row.ref}`

  // SMS tracking link (best-effort)
  if (smsConfigured()) {
    try {
      await sendSms({ msisdn: phone, message: `รับเรื่องร้องเรียนของคุณแล้ว รหัส ${row.ref}\nติดตามสถานะ: ${trackUrl}` })
    } catch (e) {
      console.error('[POST /api/case] sms', e.message)
    }
  }

  // สร้าง forum thread (1 case = 1 thread) — best-effort
  try {
    const cfg = await getCaseConfig(guildId)
    if (cfg?.forum_channel_id) {
      const content = [
        `**${row.ref}** · ${province}${category ? ` · ${category}` : ''}`,
        ``,
        `**${title}**`,
        detail,
        ``,
        `ติดตามสาธารณะ: ${trackUrl}`,
      ].join('\n')
      const threadId = await createForumThread(cfg.forum_channel_id, { name: `[${row.ref}] ${title}`, content })
      if (threadId) await setDiscordThreadId(row.id, threadId)
    }
  } catch (e) {
    console.error('[POST /api/case] forum thread', e.message)
  }

  logAction({ orgId: await orgIdOfGuild(guildId), app: 'cases', action: 'case.submitted', targetId: row.ref, meta: { province, category, source: 'web' } })

  return Response.json({ ok: true, ref: row.ref })
}
