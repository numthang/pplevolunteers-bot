import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin, isRegionalCoordinator } from '@/lib/callingAccess.js'
import pool from '@/db/index.js'
import { createLog } from '@/db/calling/logs.js'

// กรรมการจังหวัด ส่ง SMS ไม่ได้ — เฉพาะ ผู้ประสานงานจังหวัด ขึ้นไป
function canSendSms(roles = []) {
  return isAdmin(roles) || isRegionalCoordinator(roles) || roles.includes('ผู้ประสานงานจังหวัด')
}

const API_KEY    = process.env.THAIBULKSMS_API_KEY
const API_SECRET = process.env.THAIBULKSMS_API_SECRET
const SENDER     = process.env.THAIBULKSMS_SENDER
const FORCE      = process.env.THAIBULKSMS_FORCE || 'corporate'

function normalizePhone(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('66')) return '0' + digits.slice(2)
  return digits
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!API_KEY || !API_SECRET) {
    return Response.json({ error: 'SMS gateway not configured' }, { status: 503 })
  }

  const hasSmsRole = canSendSms(session.user.roles || [])

  try {
    const { campaign_id, contact_type = 'member', member_ids, message } = await req.json()

    if (!member_ids?.length || !message?.trim()) {
      return Response.json({ error: 'member_ids and message are required' }, { status: 400 })
    }

    // bulk → role required; single → anyone with page access can send
    if (member_ids.length > 1 && !hasSmsRole) {
      return Response.json({ error: 'ไม่มีสิทธิ์ส่ง SMS — เฉพาะ Admin, เลขาธิการ, ผู้ประสานงานภาค, รองเลขาธิการ, ผู้ประสานงานจังหวัด' }, { status: 403 })
    }

    // Fetch phones for all member_ids
    const placeholders = member_ids.map(() => '?').join(',')
    let phoneMap = {}

    if (contact_type === 'contact') {
      const [rows] = await pool.query(
        `SELECT id, phone FROM calling_contacts WHERE id IN (${placeholders})`,
        member_ids
      )
      for (const r of rows) {
        if (r.phone) phoneMap[r.id] = r.phone
      }
    } else {
      const [rows] = await pool.query(
        `SELECT source_id, mobile_number FROM ngs_member_cache WHERE source_id IN (${placeholders})`,
        member_ids
      )
      for (const r of rows) {
        if (r.mobile_number) phoneMap[r.source_id] = r.mobile_number
      }
    }

    const validIds  = member_ids.filter(id => phoneMap[id])
    const noPhoneIds = member_ids.filter(id => !phoneMap[id])

    if (validIds.length === 0) {
      return Response.json({ error: 'No valid phone numbers', no_phone: noPhoneIds.length }, { status: 400 })
    }

    // Build reverse map: normalized phone → member_id
    const phoneToId = {}
    for (const id of validIds) {
      const n = normalizePhone(phoneMap[id])
      if (n) phoneToId[n] = id
    }

    const callerName = session.user.nickname || session.user.name || null
    const calledBy   = session.user.discordId
    const results    = { sent: 0, failed: 0, no_phone: noPhoneIds.length }

    // Send in batches of 500 (ThaiBulkSMS limit)
    const BATCH = 500
    const auth  = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')

    for (let i = 0; i < validIds.length; i += BATCH) {
      const batch  = validIds.slice(i, i + BATCH)
      const msisdn = batch.map(id => phoneMap[id]).join(',')

      const apiRes = await fetch('https://api-v2.thaibulksms.com/sms', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ msisdn, message, sender: SENDER, force: FORCE, Shorten_url: false }),
      })

      const apiData = await apiRes.json()

      if (apiData.error) {
        // Whole batch failed — log each as sms_failed
        for (const id of batch) {
          await createLog({ campaign_id: campaign_id || 0, member_id: id, contact_type, called_by: calledBy, caller_name: callerName, status: 'sms_failed', note: message, extra: { reason: apiData.error.description } })
          results.failed++
        }
        continue
      }

      for (const item of (apiData.phone_number_list || [])) {
        const id = phoneToId[normalizePhone(item.number)]
        if (!id) continue
        await createLog({ campaign_id: campaign_id || 0, member_id: id, contact_type, called_by: calledBy, caller_name: callerName, status: 'sms_sent', note: message, extra: { message_id: item.message_id, used_credit: item.used_credit } })
        results.sent++
      }

      for (const item of (apiData.bad_phone_number_list || [])) {
        const id = phoneToId[normalizePhone(item.number)]
        if (!id) continue
        await createLog({ campaign_id: campaign_id || 0, member_id: id, contact_type, called_by: calledBy, caller_name: callerName, status: 'sms_failed', note: message, extra: { reason: item.message } })
        results.failed++
      }
    }

    return Response.json({ success: true, ...results })
  } catch (error) {
    console.error('[POST /api/calling/sms]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
