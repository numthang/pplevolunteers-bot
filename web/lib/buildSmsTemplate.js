const THAI_MONTHS   = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const THAI_DAYS_FULL = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์']
const MAX_2_SMS = 140

// eventDate format: '2026-05-09T13:00' or '2026-05-09' or null
export function buildSmsTemplate(campaignName, eventDate, campaignId) {
  const url = `act.pplethai.org/event/${campaignId}`
  const registerLine = `ลงทะเบียน ${url}`

  let dateLine = ''
  if (eventDate) {
    const [datePart, timePart] = eventDate.split('T')
    const [year, month, day] = datePart.split('-').map(Number)
    const dow = THAI_DAYS_FULL[new Date(`${datePart}T${timePart || '00:00'}`).getDay()]
    dateLine = `${dow} ${day} ${THAI_MONTHS[month - 1]} ${(year + 543) % 100}`
    if (timePart && timePart !== '00:00') dateLine += ` ${timePart} น.`
  }

  const parts = [dateLine, campaignName || '', registerLine].filter(Boolean)
  const full = parts.join('\n')
  if (full.length <= MAX_2_SMS) return full
  // ตัดชื่อถ้าเกิน 2 SMS
  const fixed = [dateLine, registerLine].filter(Boolean).join('\n')
  const maxName = MAX_2_SMS - fixed.length - 1
  return [dateLine, (campaignName || '').slice(0, maxName), registerLine].filter(Boolean).join('\n')
}
