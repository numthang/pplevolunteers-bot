import { useTranslations } from 'next-intl'

const BANKS = [
  'กสิกรไทย', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงไทย', 'กรุงศรีอยุธยา',
  'ทหารไทยธนชาต', 'ออมสิน', 'ธ.ก.ส.',
]

const PROVINCES = [
  'กรุงเทพชั้นใน','กรุงเทพธนบุรี','กรุงเทพตะวันออก','กรุงเทพเหนือ',
  'นนทบุรี','สมุทรปราการ','สมุทรสาคร','ปทุมธานี','ราชบุรี','นครปฐม',
  'กาญจนบุรี','เพชรบุรี','สุพรรณบุรี','สมุทรสงคราม','ประจวบคีรีขันธ์',
  'อุทัยธานี','อ่างทอง','สระบุรี','อยุธยา','นครนายก','ลพบุรี','ชัยนาท','สิงห์บุรี',
  'เชียงใหม่','เชียงราย','แม่ฮ่องสอน','ลำพูน','ลำปาง','แพร่','พะเยา','น่าน',
  'กำแพงเพชร','ตาก','นครสวรรค์','พิจิตร','พิษณุโลก','เพชรบูรณ์','สุโขทัย','อุตรดิตถ์',
  'ตราด','จันทบุรี','ระยอง','ชลบุรี','ฉะเชิงเทรา','ปราจีนบุรี','สระแก้ว',
  'อุดรธานี','หนองคาย','บึงกาฬ','สกลนคร','มุกดาหาร','นครพนม','อำนาจเจริญ',
  'เลย','ชัยภูมิ','ขอนแก่น','กาฬสินธุ์','ยโสธร','หนองบัวลำภู','มหาสารคาม',
  'ร้อยเอ็ด','อุบลราชธานี','ศรีสะเกษ','สุรินทร์','บุรีรัมย์','นครราชสีมา',
  'ชุมพร','พังงา','ระนอง','ภูเก็ต','สุราษฎร์ธานี','นครศรีธรรมราช',
  'ตรัง','กระบี่','สงขลา','พัทลุง','สตูล','ปัตตานี','ยะลา','นราธิวาส',
]

const cls = "block w-full border dark:border-disc-border rounded px-2 py-1 mt-1 bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text text-sm"

export default function AccountFormFields({ form, onChange, guilds = [] }) {
  const t = useTranslations('finance')
  return (
    <div className="space-y-3 text-sm text-gray-700 dark:text-disc-text">
      <label className="block">
        {t('accountForm.nameLabel')}
        <input className={cls} value={form.name || ''} onChange={e => onChange({ name: e.target.value })} />
      </label>
      {guilds.length > 0 && (
        <label className="block">
          {t('accountForm.guildLabel')}
          <select className={cls} value={form.guild_id || ''} onChange={e => onChange({ guild_id: e.target.value })}>
            <option value="">{t('accountForm.defaultGuildOption')}</option>
            {guilds.map(g => <option key={g.guild_id} value={g.guild_id}>{g.name}</option>)}
          </select>
        </label>
      )}
      <label className="block">
        {t('accountForm.bankLabel')}
        <select className={cls} value={form.bank || ''} onChange={e => onChange({ bank: e.target.value })}>
          <option value="">{t('accountForm.selectBankOption')}</option>
          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <label className="block">
        {t('accountForm.accountNoLabel')}
        <input className={cls} value={form.account_no || ''} onChange={e => onChange({ account_no: e.target.value })} placeholder={t('accountForm.accountNoPlaceholder')} />
      </label>
      <label className="block">
        {t('accountForm.provinceLabel')} <span className="text-gray-400 text-xs">{t('accountForm.provinceHint')}</span>
        <select className={cls} value={form.province || ''} onChange={e => onChange({ province: e.target.value })}>
          <option value="">{t('accountForm.centralOption')}</option>
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="block">
        {t('accountForm.visibilityLabel')}
        <select className={cls} value={form.visibility || 'private'} onChange={e => onChange({ visibility: e.target.value })}>
          <option value="private">{t('visibility.privateDesc')}</option>
          <option value="internal">{t('visibility.internalDesc')}</option>
          <option value="public">{t('visibility.publicDesc')}</option>
        </select>
      </label>
      <label className="block">
        {t('accountForm.emailInboxLabel')}
        <input className={cls} value={form.email_inbox || ''} onChange={e => onChange({ email_inbox: e.target.value })} />
      </label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.notify_income} onChange={e => onChange({ notify_income: e.target.checked ? 1 : 0 })} />
          {t('accountForm.notifyIncomeLabel')}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.notify_expense} onChange={e => onChange({ notify_expense: e.target.checked ? 1 : 0 })} />
          {t('accountForm.notifyExpenseLabel')}
        </label>
      </div>
    </div>
  )
}
