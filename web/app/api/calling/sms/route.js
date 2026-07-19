import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { normalizeAccess } from '@/lib/roleAccess.js'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'
import { createLog } from '@/db/calling/logs.js'
import { sendSms, normalizePhone, smsConfigured } from '@/lib/sendSms.js'

// กรรมการจังหวัด (district_coordinator) ส่ง SMS ไม่ได้ — เฉพาะ ผู้ประสานงานจังหวัด (province_coordinator) ขึ้นไป
function canSendSms(access) {
  const { permissions } = normalizeAccess(access)
  return permissions.has('admin') || permissions.has('secretary_general')
      || permissions.has('regional_coordinator') || permissions.has('province_coordinator')
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!smsConfigured()) {
    return Response.json({ error: 'SMS gateway not configured' }, { status: 503 })
  }

  const { access } = await getEffectiveIdentity(session)
  const guildId = await getGuildId(session)
  const hasSmsRole = canSendSms(access)

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
    let phoneMap = {}

    if (contact_type === 'contact') {
      const { rows } = await pool.query(
        `SELECT id, phone FROM calling_contacts WHERE id = ANY($1)`,
        [member_ids.map(Number)]
      )
      for (const r of rows) {
        if (r.phone) phoneMap[r.id] = r.phone
      }
    } else {
      const { rows } = await pool.query(
        `SELECT source_id, mobile_number FROM cache_pple_member WHERE source_id = ANY($1) AND guild_id = $2`,
        [member_ids, guildId]
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

    for (let i = 0; i < validIds.length; i += BATCH) {
      const batch  = validIds.slice(i, i + BATCH)
      const msisdn = batch.map(id => phoneMap[id]).join(',')

      const apiData = await sendSms({ msisdn, message })

      if (apiData.error) {
        // Whole batch failed — log each as sms_failed
        for (const id of batch) {
          await createLog(guildId, { campaign_id: campaign_id || 0, member_id: id, contact_type, called_by: calledBy, caller_name: callerName, status: 'sms_failed', note: message, extra: { reason: apiData.error.description } })
          results.failed++
        }
        continue
      }

      for (const item of (apiData.phone_number_list || [])) {
        const id = phoneToId[normalizePhone(item.number)]
        if (!id) continue
        await createLog(guildId, { campaign_id: campaign_id || 0, member_id: id, contact_type, called_by: calledBy, caller_name: callerName, status: 'sms_sent', note: message, extra: { message_id: item.message_id, used_credit: item.used_credit } })
        results.sent++
      }

      for (const item of (apiData.bad_phone_number_list || [])) {
        const id = phoneToId[normalizePhone(item.number)]
        if (!id) continue
        await createLog(guildId, { campaign_id: campaign_id || 0, member_id: id, contact_type, called_by: calledBy, caller_name: callerName, status: 'sms_failed', note: message, extra: { reason: item.message } })
        results.failed++
      }
    }

    return Response.json({ success: true, ...results })
  } catch (error) {
    console.error('[POST /api/calling/sms]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
