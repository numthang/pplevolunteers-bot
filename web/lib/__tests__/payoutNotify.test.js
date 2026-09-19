import { describe, it, expect } from 'vitest'
import { buildNotifyMessage, canNotify, maskTail } from '../payoutNotify.js'

// translator ปลอม — คืนคีย์ + ค่าที่แทน เพื่อเช็คว่าเรียกคีย์ไหนด้วยค่าอะไร
// (ข้อความจริงอยู่ locales/th.json · เทสนี้ดูโครงสร้าง ไม่ใช่สำนวน)
const t = (key, vars = {}) => {
  const short = key.replace('payouts.notify.', '').replace('payouts.', '')
  const parts = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')
  return parts ? `${short}(${parts})` : short
}

const round = { title: 'รอบ ก.ย.', source_type: 'event', event_name: 'แกะงบราชบุรี 70', period_ym: null }
const account = { name: 'บัญชีจังหวัด (หลัก) ราชบุรี', bank: 'กสิกรไทย' }
const item = {
  id: 2, member_user_id: 1, external_payee_id: null, discord_id: '1098111730015543386',
  amount: '200.00', paid_at: '2026-09-18T19:13:25.138Z',
  payment_method: 'bank', bank_code: '004', account_no: '3392177492', promptpay_id: null,
}

describe('maskTail', () => {
  it('เหลือ 4 ตัวท้าย', () => expect(maskTail('3392177492')).toBe('••••7492'))
  it('ตัดอักขระที่ไม่ใช่ตัวเลขก่อน', () => expect(maskTail('089-123-4567')).toBe('••••4567'))
  it('ไม่มีเลข → null', () => {
    expect(maskTail('')).toBeNull()
    expect(maskTail(null)).toBeNull()
    expect(maskTail('—')).toBeNull()
  })
})

describe('canNotify', () => {
  it('สมาชิกที่จ่ายแล้วและมีเลขบัญชี → ผ่าน', () => {
    expect(canNotify(item)).toEqual({ ok: true, reason: null })
  })
  it('คนนอกไม่มี user account → external', () => {
    expect(canNotify({ ...item, member_user_id: null, external_payee_id: 9, discord_id: null }).reason).toBe('external')
  })
  it('สมาชิกที่ยังไม่ผูก Discord → no_discord', () => {
    expect(canNotify({ ...item, discord_id: null }).reason).toBe('no_discord')
  })
  it('ยังไม่ติ๊กจ่าย → not_paid', () => {
    expect(canNotify({ ...item, paid_at: null }).reason).toBe('not_paid')
  })
  it('ไม่มีเลขบัญชี → no_account', () => {
    expect(canNotify({ ...item, account_no: null }).reason).toBe('no_account')
  })
  it('พร้อมเพย์ดูช่อง promptpay_id ไม่ใช่ account_no', () => {
    const pp = { ...item, payment_method: 'promptpay', account_no: null, promptpay_id: '089-123-4567' }
    expect(canNotify(pp).ok).toBe(true)
    expect(canNotify({ ...pp, promptpay_id: null }).reason).toBe('no_account')
  })
  // ⛔ กฎที่ user เคาะ: เคยแจ้งแล้วต้องยังกดซ้ำได้ ห้ามเอา notified_at มาบล็อก
  it('เคยแจ้งแล้วยังแจ้งซ้ำได้', () => {
    expect(canNotify({ ...item, notified_at: '2026-09-19T00:00:00Z', notify_count: 5 }).ok).toBe(true)
  })
})

describe('buildNotifyMessage', () => {
  it('หัวข้อ 1 บรรทัด + เนื้อความรวบเป็นประโยคเดียว', () => {
    const msg = buildNotifyMessage({ round, item, account, senderMention: '<@99>', t })
    expect(msg.split('\n')).toHaveLength(2)
    expect(msg.split('\n')[0]).toBe('heading')
    expect(msg).toContain('activity=แกะงบราชบุรี 70')
    expect(msg).toContain('amount=200')
    expect(msg).toContain('dest=กสิกรไทย ••••7492')
    expect(msg).toContain('from=บัญชีจังหวัด (หลัก) ราชบุรี · กสิกรไทย')
    expect(msg).toContain('sender=<@99>')
    // เลขบัญชีเต็มต้องไม่หลุดไปในข้อความ
    expect(msg).not.toContain('3392177492')
  })

  it('ไม่ผูก event → ใช้ชื่อรอบที่คนกรอกเองแทน', () => {
    const msg = buildNotifyMessage({ round: { ...round, event_name: null }, item, account, t })
    expect(msg).toContain('activity=รอบ ก.ย.')
  })

  it('คนกดไม่มี Discord → ใช้คีย์ที่ไม่มีท่อน "ทักกลับ @…"', () => {
    const msg = buildNotifyMessage({ round, item, account, senderMention: null, t })
    expect(msg).toContain('bodyNoSender')
    expect(msg).not.toContain('sender=')
  })

  it('พร้อมเพย์ → ปลายทางเป็นพร้อมเพย์', () => {
    const msg = buildNotifyMessage({
      round,
      item: { ...item, payment_method: 'promptpay', account_no: null, promptpay_id: '089-123-4567' },
      account, t,
    })
    expect(msg).toContain('dest=kindPromptpay ••••4567')
  })

  it('ไม่มีบัญชีต้นทาง → ไม่พัง', () => {
    expect(buildNotifyMessage({ round, item, account: null, t })).toContain('from=—')
  })

  it('ยาวไม่เกินลิมิต DM ของ Discord', () => {
    expect(buildNotifyMessage({ round, item, account, senderMention: '<@99>', t }).length).toBeLessThan(2000)
  })
})
