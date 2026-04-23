'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

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

const EMPTY = { name: '', bank: '', account_no: '', visibility: 'private', province: '', notify_income: 1, notify_expense: 1, email_inbox: '' }
const selectCls = "block w-full border dark:border-gray-600 rounded px-2 py-1 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"

export default function AddAccountButton() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY)

  async function save() {
    if (!form.name?.trim()) return alert('กรุณาใส่ชื่อบัญชี')
    const res = await fetch('/api/finance/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) { setShowModal(false); setForm(EMPTY); router.refresh() }
  }

  return (
    <>
      <button
        onClick={() => { setForm(EMPTY); setShowModal(true) }}
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
      >
        + เพิ่มบัญชี
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">เพิ่มบัญชี</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <label className="block">ชื่อบัญชี<input className={selectCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
              <label className="block">ธนาคาร
                <select className={selectCls} value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))}>
                  <option value="">-- เลือกธนาคาร --</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="block">เลขบัญชี<input className={selectCls} value={form.account_no} onChange={e => setForm(f => ({ ...f, account_no: e.target.value }))} /></label>
              <label className="block">
                จังหวัด/ทีม <span className="text-gray-400 text-xs">(กำหนดสิทธิ์การเข้าถึง)</span>
                <select className={selectCls} value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))}>
                  <option value="">ส่วนกลาง (Admin เท่านั้น)</option>
                  {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="block">การมองเห็น
                <select className={selectCls} value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}>
                  <option value="private">ส่วนตัว — เห็นแค่เจ้าของ</option>
                  <option value="internal">ภายใน — เห็นทุกคนในองค์กร</option>
                  <option value="public">สาธารณะ — เห็นได้จากภายนอก</option>
                </select>
              </label>
              <label className="block">Email Inbox (optional)<input className={selectCls} value={form.email_inbox} onChange={e => setForm(f => ({ ...f, email_inbox: e.target.value }))} /></label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.notify_income} onChange={e => setForm(f => ({ ...f, notify_income: e.target.checked ? 1 : 0 }))} />แจ้งรายรับ</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.notify_expense} onChange={e => setForm(f => ({ ...f, notify_expense: e.target.checked ? 1 : 0 }))} />แจ้งรายจ่าย</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-1.5 rounded border dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">ยกเลิก</button>
              <button onClick={save} className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
