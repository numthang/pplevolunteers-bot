'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Pencil, Trash2, Archive, ArchiveRestore } from 'lucide-react'
import BankBadge from '@/components/BankBadge'
import { canEditAccount } from '@/lib/financeAccess.js'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'

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

export default function AccountsPage() {
  const { data: session } = useSession()
  const { roles: effectiveRoles, discordId: effectiveDiscordId } = useEffectiveRoles(session)
  const [accounts, setAccounts] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    const res = await fetch('/api/finance/accounts?all=1')
    if (res.ok) setAccounts(await res.json())
  }

  async function toggleArchive(a) {
    await fetch(`/api/finance/accounts/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !a.archived }),
    })
    load()
  }

  useEffect(() => { load() }, [])

  function openNew()   { setForm(EMPTY); setEditing({}) }
  function openEdit(a) { setForm({ ...a }); setEditing(a) }
  function close()     { setEditing(null) }

  async function save() {
    const isNew = !editing?.id
    const res = await fetch(isNew ? '/api/finance/accounts' : `/api/finance/accounts/${editing.id}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) { close(); load() }
  }

  async function remove(id) {
    if (!confirm('ลบบัญชีนี้?')) return
    await fetch(`/api/finance/accounts/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">บัญชี</h1>
        <button onClick={openNew} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
          + เพิ่มบัญชี
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {accounts.map(a => {
          const canEdit = canEditAccount({ owner_id: a.owner_id, visibility: a.visibility, province: a.province }, effectiveDiscordId, effectiveRoles)
          return (
            <div key={a.id} className={`bg-card-bg rounded-xl shadow px-5 py-4 flex items-center justify-between gap-3 ${a.archived ? 'opacity-50' : ''}`}>
              <BankBadge bank={a.bank} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {a.name}
                  {!!a.archived && <span className="text-xs text-gray-400 font-normal">(ซ่อน)</span>}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{[a.bank, a.account_no].filter(Boolean).join(' · ')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {a.province || 'ส่วนกลาง'} · {a.visibility === 'private' ? '🔒 ส่วนตัว' : a.visibility === 'internal' ? '👥 ภายใน' : '🌐 สาธารณะ'}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <button onClick={() => openEdit(a)} className="p-1.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"><Pencil size={16} /></button>
                  <button onClick={() => toggleArchive(a)} title={a.archived ? 'เลิกซ่อน' : 'ซ่อน'} className="p-1.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                    {a.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </button>
                  <button onClick={() => remove(a.id)} className="p-1.5 rounded text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40"><Trash2 size={16} /></button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editing !== null && (
        <Modal title={editing.id ? 'แก้ไขบัญชี' : 'เพิ่มบัญชี'} onClose={close} onSave={save}>
          <AccountForm form={form} onChange={v => setForm(f => ({ ...f, ...v }))} />
        </Modal>
      )}
    </div>
  )
}

function AccountForm({ form, onChange }) {
  const selectCls = "block w-full border dark:border-gray-600 rounded px-2 py-1 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
  return (
    <div className="space-y-3 text-gray-700 dark:text-gray-300">
      <Field label="ชื่อบัญชี" value={form.name} onChange={v => onChange({ name: v })} />
      <label className="block text-sm">
        ธนาคาร
        <select
          className={selectCls}
          value={form.bank || ''}
          onChange={e => onChange({ bank: e.target.value })}
        >
          <option value="">-- เลือกธนาคาร --</option>
          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <Field label="เลขบัญชี" value={form.account_no} onChange={v => onChange({ account_no: v })} placeholder="ใส่ได้ทั้งมี - และไม่มี" />
      <label className="block text-sm">
        จังหวัด/ทีม <span className="text-gray-400 text-xs">(กำหนดสิทธิ์การเข้าถึง)</span>
        <select className={selectCls} value={form.province || ''} onChange={e => onChange({ province: e.target.value })}>
          <option value="">ส่วนกลาง (Admin เท่านั้น)</option>
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="text-sm">
        การมองเห็น
        <select className={selectCls} value={form.visibility} onChange={e => onChange({ visibility: e.target.value })}>
          <option value="private">ส่วนตัว — เห็นแค่เจ้าของ</option>
          <option value="internal">ภายใน — เห็นทุกคนในองค์กร</option>
          <option value="public">สาธารณะ — เห็นได้จากภายนอก</option>
        </select>
      </label>
      <Field label="Email Inbox (optional)" value={form.email_inbox} onChange={v => onChange({ email_inbox: v })} />
      <div className="flex gap-4 text-sm">
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

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block text-sm">
      {label}
      <input
        className="block w-full border dark:border-gray-600 rounded px-2 py-1 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        value={value || ''}
        placeholder={placeholder || ''}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}

function Modal({ title, onClose, onSave, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card-bg rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">{title}</h2>
        {children}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-1.5 rounded border dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">ยกเลิก</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">บันทึก</button>
        </div>
      </div>
    </div>
  )
}
