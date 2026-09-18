import { findOverlappingFund } from '@/db/finance/funds.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * ตรวจช่วงวันที่ของกองเงินก่อนบันทึก
 * คืน { startsAt, endsAt } หรือ { error: Response } (UI แปล code เป็นข้อความเอง)
 */
export async function checkFundRange(accountId, { startsAt, endsAt }, excludeId = null) {
  startsAt = startsAt || null
  endsAt = endsAt || null
  const bad = (code, extra = {}) => ({ error: Response.json({ error: code, ...extra }, { status: 400 }) })

  if ((startsAt && !DATE_RE.test(startsAt)) || (endsAt && !DATE_RE.test(endsAt))) return bad('invalid_date')
  if (endsAt && !startsAt) return bad('ends_without_start')
  if (startsAt && endsAt && endsAt < startsAt) return bad('ends_before_start')

  const clash = await findOverlappingFund(accountId, startsAt, endsAt, excludeId)
  if (clash) return bad('overlap', { fundName: clash.name })

  return { startsAt, endsAt }
}
