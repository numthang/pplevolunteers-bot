'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, Pencil, Archive, ArchiveRestore, Trash2, X } from 'lucide-react'
import BankBadge from '@/components/BankBadge'

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

function fmt(n) {
  return Math.abs(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00A0฿'
}

const selectCls = "block w-full border dark:border-gray-600 rounded px-2 py-1 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"

function AccountForm({ form, onChange }) {
  return (
    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
      <label className="block">
        ชื่อบัญชี
        <input className={selectCls} value={form.name || ''} onChange={e => onChange({ name: e.target.value })} />
      </label>
      <label className="block">
        ธนาคาร
        <select className={selectCls} value={form.bank || ''} onChange={e => onChange({ bank: e.target.value })}>
          <option value="">-- เลือกธนาคาร --</option>
          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <label className="block">
        เลขบัญชี
        <input className={selectCls} value={form.account_no || ''} onChange={e => onChange({ account_no: e.target.value })} />
      </label>
      <label className="block">
        จังหวัด/ทีม <span className="text-gray-400 text-xs">(กำหนดสิทธิ์การเข้าถึง)</span>
        <select className={selectCls} value={form.province || ''} onChange={e => onChange({ province: e.target.value })}>
          <option value="">ส่วนกลาง (Admin เท่านั้น)</option>
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="block">
        การมองเห็น
        <select className={selectCls} value={form.visibility || 'private'} onChange={e => onChange({ visibility: e.target.value })}>
          <option value="private">ส่วนตัว — เห็นแค่เจ้าของ</option>
          <option value="internal">ภายใน — เห็นทุกคนในองค์กร</option>
          <option value="public">สาธารณะ — เห็นได้จากภายนอก</option>
        </select>
      </label>
      <label className="block">
        Email Inbox (optional)
        <input className={selectCls} value={form.email_inbox || ''} onChange={e => onChange({ email_inbox: e.target.value })} />
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

export default function AccountCard({ account, canEdit = false }) {
  const { balance } = account
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({})

  function copyAll(e) {
    e.preventDefault()
    e.stopPropagation()
    const parts = [account.name, account.bank, account.account_no].filter(Boolean)
    navigator.clipboard.writeText(parts.join(' ')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function openEdit(e) {
    e.preventDefault()
    e.stopPropagation()
    setForm({ ...account })
    setShowModal(true)
  }

  async function save() {
    const res = await fetch(`/api/finance/accounts/${account.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) { setShowModal(false); router.refresh() }
  }

  async function toggleArchive() {
    await fetch(`/api/finance/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !account.archived }),
    })
    setShowModal(false)
    router.refresh()
  }

  async function remove() {
    if (!confirm('ลบบัญชีนี้?')) return
    await fetch(`/api/finance/accounts/${account.id}`, { method: 'DELETE' })
    setShowModal(false)
    router.refresh()
  }

  return (
    <>
      <Link href={`/finance/transactions?accountId=${account.id}`}>
        <div className={`bg-white dark:bg-gray-800 rounded-xl shadow p-4 hover:shadow-md transition cursor-pointer flex items-center gap-3 ${account.archived ? 'opacity-50' : ''}`}>
          <BankBadge bank={account.bank} size={40} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-gray-100 leading-snug">
              {account.name}
              {!!account.archived && <span className="text-xs text-gray-400 font-normal ml-1">(ซ่อน)</span>}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {account.bank || 'เงินสด'}
              {account.account_no && <span className="font-mono ml-1">{account.account_no}</span>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <p className={`font-mono font-bold ${balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {balance < 0 ? '-' : ''}{fmt(balance)}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={copyAll}
                className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition"
                title="คัดลอกชื่อ ธนาคาร เลขบัญชี"
              >
                {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
              </button>
              {canEdit && (
                <button onClick={openEdit}
                  className="flex items-center gap-1 text-[11px] text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition"
                  title="แก้ไขบัญชี"
                >
                  <Pencil size={11} /> แก้ไข
                </button>
              )}
            </div>
          </div>
        </div>
      </Link>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">แก้ไขบัญชี</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <AccountForm form={form} onChange={v => setForm(f => ({ ...f, ...v }))} />
            <div className="flex items-center justify-between mt-5 gap-2">
              <div className="flex gap-1">
                <button onClick={toggleArchive}
                  title={account.archived ? 'เลิกซ่อน' : 'ซ่อน'}
                  className="p-2 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {account.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </button>
                <button onClick={remove} className="p-2 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowModal(false)} className="px-4 py-1.5 rounded border dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">ยกเลิก</button>
                <button onClick={save} className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">บันทึก</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
