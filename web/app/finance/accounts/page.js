'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Pencil, Trash2, Archive, ArchiveRestore } from 'lucide-react'
import BankBadge from '@/components/BankBadge'
import AccountFormFields from '@/components/finance/AccountFormFields'
import { canEditAccount } from '@/lib/financeAccess.js'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'

const EMPTY = { name: '', bank: '', account_no: '', visibility: 'private', province: '', notify_income: 1, notify_expense: 1, email_inbox: '', guild_id: '' }

export default function AccountsPage() {
  const { data: session } = useSession()
  const { roles: effectiveRoles, discordId: effectiveDiscordId } = useEffectiveRoles(session)
  const [accounts, setAccounts] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [guilds, setGuilds] = useState([])

  async function load() {
    const res = await fetch('/api/finance/accounts?all=1')
    if (res.ok) setAccounts(await res.json())
  }

  useEffect(() => {
    load()
    fetch('/api/admin/guilds').then(r => r.ok ? r.json() : []).then(setGuilds)
  }, [])

  async function toggleArchive(a) {
    await fetch(`/api/finance/accounts/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !a.archived }),
    })
    load()
  }

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
          <AccountFormFields form={form} onChange={v => setForm(f => ({ ...f, ...v }))} guilds={guilds} />
        </Modal>
      )}
    </div>
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
