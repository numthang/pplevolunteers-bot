/**
 * แจ้งผู้รับว่าโอนเบี้ยเลี้ยงให้แล้ว — ตัวประกอบข้อความ + กติกาว่าใครแจ้งได้ (pure ทั้งไฟล์)
 *
 * แยกออกมาเป็น pure function เพราะ:
 *   - เทสข้อความได้โดยไม่ต้องยิง Discord จริง (web/lib/__tests__/payoutNotify.test.js)
 *   - วันที่ทำปุ่ม "แจ้งทุกคนที่จ่ายแล้ว" ทีเดียว จะเรียกตัวเดียวกันนี้วน loop ไม่ต้องเขียนใหม่
 *
 * ⚠️ ข้อมูลผู้รับต้องมาจาก listItems() เท่านั้น — ค่าที่นั่น COALESCE เอา snapshot ตอน export
 *    มาก่อนทะเบียนสด ข้อความจึงตรงกับเลขบัญชีที่โอนจริง ไม่ใช่เลขที่เขาเพิ่งมาแก้ทีหลัง
 * ⚠️ เลขบัญชีในข้อความ mask เหลือ 4 ตัวท้ายเสมอ — DM ไปอยู่บนเซิร์ฟเวอร์ Discord ถาวร
 *    ผู้รับดูแค่ 4 ตัวท้ายก็พอรู้ว่าเข้าบัญชีไหนของตัวเอง
 */

import { bankByCode, digitsOnly } from '@/config/banks.js'
import { formatThaiDateTime } from './dateFormat.js'

/** '3392177492' → '••••7492' · ไม่มีเลข → null */
export function maskTail(v) {
  const d = digitsOnly(v)
  if (!d) return null
  return `••••${d.slice(-4)}`
}

/**
 * DM ถึงคนนี้ได้ไหม — **ไม่สนว่าติ๊กจ่ายหรือยัง** เป็นคุณสมบัติของตัวคน ไม่ใช่ของจังหวะ
 *
 * แยกออกมาจาก canNotify() เพราะสถานะรอบต้องนับว่า "รอบนี้แจ้งได้กี่คน" ตั้งแต่ก่อนติ๊กครบ
 * (ถ้าใช้ canNotify นับ จะได้ not_paid ปนมาแล้วนับคนที่ยังไม่ติ๊กเป็น "แจ้งไม่ได้" ทั้งที่แค่ยังไม่ถึงคิว)
 *
 * @returns {string|null} เหตุผลที่ DM ไม่ถึง · null = ถึงได้
 *   external   = คนนอก ไม่มี user account → DM ไม่ได้ (docs_external_payees)
 *   no_discord = สมาชิกที่ยังไม่ผูก Discord (email-only)
 *   no_account = ไม่มีทั้งเลขบัญชีและพร้อมเพย์ → ข้อความบอกไม่ได้ว่าเงินเข้าไหน แจ้งไปก็เช็คไม่ได้
 */
export function unreachableReason(item) {
  if (!item) return 'no_account'
  if (item.external_payee_id) return 'external'
  if (!item.discord_id) return 'no_discord'

  const dest = item.payment_method === 'promptpay' ? item.promptpay_id : item.account_no
  if (!digitsOnly(dest)) return 'no_account'

  return null
}

/**
 * แจ้งคนนี้ตอนนี้ได้ไหม = DM ถึง + ติ๊กจ่ายแล้ว
 * @returns {{ok: boolean, reason: string|null}}
 *   not_paid = ยังไม่ติ๊กจ่าย → ยังไม่มีอะไรให้แจ้ง (ข้อความขึ้นต้นว่า "โอนให้แล้ว")
 *   ที่เหลือดู unreachableReason()
 */
export function canNotify(item) {
  const unreachable = unreachableReason(item)
  if (unreachable) return { ok: false, reason: unreachable }
  if (!item.paid_at) return { ok: false, reason: 'not_paid' }

  return { ok: true, reason: null }
}

/** ปลายทาง — "พร้อมเพย์ ••••4567" / "กสิกรไทย ••••7492" */
function destText(item, t) {
  if (item.payment_method === 'promptpay') {
    return `${t('payouts.kindPromptpay')} ${maskTail(item.promptpay_id)}`
  }
  const bank = bankByCode(item.bank_code)
  return `${bank?.name || t('payouts.noBank')} ${maskTail(item.account_no)}`
}

/**
 * ชื่อกิจกรรมในข้อความ — ผูก event ไว้ใช้ชื่อ event · ไม่ได้ผูกใช้ชื่อรอบที่คนกรอกเอง
 * (user เคาะ 2026-09-19 · รอบรายเดือนไม่มี event ก็ตกมาใช้ชื่อรอบตัวเดียวกันนี้)
 */
function activityText(round) {
  return round?.event_name || round?.title || '—'
}

/**
 * ข้อความ DM — **หัวข้อ 1 บรรทัด + เนื้อความรวบเป็นประโยคเดียว** (user เคาะรูปแบบนี้ 2026-09-19)
 * ห้ามแตกกลับเป็นบรรทัดละหัวข้อ — ของเดิมเป็นแบบนั้นแล้ว user ขอให้ย่อ
 *
 * @param {object} p
 * @param {object} p.round    แถวจาก getRoundById (title, event_name)
 * @param {object} p.item     แถวจาก listItems
 * @param {object} p.account  บัญชีต้นทาง (name, bank)
 * @param {string|null} p.senderMention  ข้อความแทนคนกดปุ่ม เช่น `<@123>` — ไม่มีก็ตัดท่อน "ทักกลับ …" ทิ้ง
 * @param {function} p.t      translator namespace 'finance' — **ต้องล็อกภาษาไทย** ดู route
 */
export function buildNotifyMessage({ round, item, account, senderMention = null, t }) {
  const vars = {
    activity: activityText(round),
    amount: Number(item.amount || 0).toLocaleString('th-TH'),
    dest: destText(item, t),
    when: formatThaiDateTime(item.paid_at),
    from: [account?.name, account?.bank].filter(Boolean).join(' · ') || '—',
  }

  const body = senderMention
    ? t('payouts.notify.body', { ...vars, sender: senderMention })
    : t('payouts.notify.bodyNoSender', vars)

  return `${t('payouts.notify.heading')}\n${body}`
}
