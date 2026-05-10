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
  return (
    <div className="space-y-3 text-sm text-gray-700 dark:text-disc-text">
      <label className="block">
        ชื่อบัญชี
        <input className={cls} value={form.name || ''} onChange={e => onChange({ name: e.target.value })} />
      </label>
      {guilds.length > 0 && (
        <label className="block">
          Guild (Server)
          <select className={cls} value={form.guild_id || ''} onChange={e => onChange({ guild_id: e.target.value })}>
            <option value="">-- ค่าเริ่มต้น --</option>
            {guilds.map(g => <option key={g.guild_id} value={g.guild_id}>{g.name}</option>)}
          </select>
        </label>
      )}
      <label className="block">
        ธนาคาร
        <select className={cls} value={form.bank || ''} onChange={e => onChange({ bank: e.target.value })}>
          <option value="">-- เลือกธนาคาร --</option>
          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <label className="block">
        เลขบัญชี
        <input className={cls} value={form.account_no || ''} onChange={e => onChange({ account_no: e.target.value })} placeholder="ใส่ได้ทั้งมี - และไม่มี" />
      </label>
      <label className="block">
        จังหวัด/ทีม <span className="text-gray-400 text-xs">(กำหนดสิทธิ์การเข้าถึง)</span>
        <select className={cls} value={form.province || ''} onChange={e => onChange({ province: e.target.value })}>
          <option value="">ส่วนกลาง (Admin เท่านั้น)</option>
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="block">
        การมองเห็น
        <select className={cls} value={form.visibility || 'private'} onChange={e => onChange({ visibility: e.target.value })}>
          <option value="private">ส่วนตัว — เห็นแค่เจ้าของ</option>
          <option value="internal">ภายใน — เห็นทุกคนในองค์กร</option>
          <option value="public">สาธารณะ — เห็นได้จากภายนอก</option>
        </select>
      </label>
      <label className="block">
        Email Inbox (optional)
        <input className={cls} value={form.email_inbox || ''} onChange={e => onChange({ email_inbox: e.target.value })} />
      </label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.notify_income} onChange={e => onChange({ notify_income: e.target.checked ? 1 : 0 })} />
          แจ้งรายรับ
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.notify_expense} onChange={e => onChange({ notify_expense: e.target.checked ? 1 : 0 })} />
          แจ้งรายจ่าย
        </label>
      </div>
    </div>
  )
}
