'use client'

import { useTranslations } from 'next-intl'
import { BANKS } from '@/config/banks.js'

/**
 * ช่องข้อมูลรับเงินของผู้รับคนนอก — ใช้ร่วมกัน 3 ที่
 * (ฟอร์มเพิ่มคนนอก · หน้าตั้งค่า docs · หน้ารอบจ่าย) อย่าแยกเขียนซ้ำ
 *
 * value = { payment_method, bank_code, account_no, account_holder, promptpay_id }
 * onChange(patch) — ส่งเฉพาะช่องที่เปลี่ยน
 */
export default function PayeeBankFields({ value, onChange, inputCls, labelCls, className = '' }) {
  const t = useTranslations('finance.payeeBank')
  const isPP = value.payment_method === 'promptpay'

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className}`}>
      <div>
        <label className={labelCls}>{t('method')}</label>
        <select className={inputCls} value={isPP ? 'promptpay' : 'bank'}
          onChange={e => onChange({ payment_method: e.target.value })}>
          <option value="bank">{t('methodBank')}</option>
          <option value="promptpay">{t('methodPromptpay')}</option>
        </select>
      </div>

      {isPP ? (
        <div>
          <label className={labelCls}>{t('promptpayId')}</label>
          <input type="text" inputMode="numeric" className={inputCls} value={value.promptpay_id || ''}
            onChange={e => onChange({ promptpay_id: e.target.value })} />
        </div>
      ) : (
        <>
          <div>
            <label className={labelCls}>{t('bank')}</label>
            <select className={inputCls} value={value.bank_code || ''}
              onChange={e => onChange({ bank_code: e.target.value })}>
              <option value="">{t('selectBank')}</option>
              {BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('accountNo')}</label>
            <input type="text" inputMode="numeric" className={inputCls} value={value.account_no || ''}
              onChange={e => onChange({ account_no: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>{t('accountHolder')}</label>
            <input type="text" className={inputCls} value={value.account_holder || ''}
              onChange={e => onChange({ account_holder: e.target.value })} />
          </div>
        </>
      )}
    </div>
  )
}
