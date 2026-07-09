'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Pencil, Trash2, Archive, ArchiveRestore } from 'lucide-react'
import BankBadge from '@/components/BankBadge'
import AccountFormFields from '@/components/finance/AccountFormFields'
import { canEditAccount } from '@/lib/financeAccess.js'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'

const EMPTY = { name: '', bank: '', account_no: '', visibility: 'private', province: '', notify_income: 1, notify_expense: 1, email_inbox: '', guild_id: '' }

export default function AccountsPage() {
  const t = useTranslations('finance')
  const { data: session } = useSession()
  const { discordId: effectiveDiscordId, access: effectiveAccess } = useEffectiveRoles(session)
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
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
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
    if (!confirm(t('accounts.confirmDelete'))) return
    await fetch(`/api/finance/accounts/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('accounts.title')}</h1>
        <button onClick={openNew} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
          + {t('accounts.addAccount')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {accounts.map(a => {
          const canEdit = canEditAccount({ owner_id: a.owner_id, visibility: a.visibility, province: a.province }, effectiveDiscordId, effectiveAccess)
          return (
            <div key={a.id} className={`bg-card-bg rounded-xl shadow px-5 py-4 flex items-center justify-between gap-3 ${a.archived ? 'opacity-50' : ''}`}>
              <BankBadge bank={a.bank} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-gray-900 dark:text-disc-text flex items-center gap-2">
                  {a.name}
                  {!!a.archived && <span className="text-xs text-gray-400 font-normal">{t('accounts.archivedSuffix')}</span>}
                </p>
                <p className="text-sm text-gray-500 dark:text-disc-muted">{[a.bank, a.account_no].filter(Boolean).join(' · ')}</p>
                <p className="text-xs text-gray-400 dark:text-disc-muted mt-0.5">
                  {a.province || t('common.central')} · {a.visibility === 'private' ? `🔒 ${t('visibility.private')}` : a.visibility === 'internal' ? `👥 ${t('visibility.internal')}` : `🌐 ${t('visibility.public')}`}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <button onClick={() => openEdit(a)} className="p-1.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"><Pencil size={16} /></button>
                  <button onClick={() => toggleArchive(a)} title={a.archived ? t('accounts.unhideLabel') : t('accounts.hideLabel')} className="p-1.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-disc-hover">
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
        <Modal title={editing.id ? t('accounts.editAccount') : t('accounts.addAccount')} onClose={close} onSave={save}>
          <AccountFormFields form={form} onChange={v => setForm(f => ({ ...f, ...v }))} guilds={guilds} />
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, onSave, children }) {
  const t = useTranslations('finance')
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card-bg rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-disc-text">{title}</h2>
        {children}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-1.5 rounded border dark:border-disc-border text-sm text-gray-700 dark:text-disc-text">{t('common.cancel')}</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">{t('common.save')}</button>
        </div>
      </div>
    </div>
  )
}
