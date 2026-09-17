'use client'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Download, Trash2, AlertTriangle, Copy, Check, UserPlus, Pencil, X } from 'lucide-react'
import { resolveBank, digitsOnly } from '@/config/banks.js'
import { chunkIntoGroups } from '@/lib/payoutExport/shared.js'
import { buildPlainText } from '@/lib/payoutExport/plainText.js'
import ExternalPayeeModal from '@/components/docs/ExternalPayeeModal'
import PayeeBankFields from '@/components/finance/PayeeBankFields'

const INPUT = 'h-11 px-3 text-base rounded-lg w-full border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal'
const LABEL = 'block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1'
const BTN   = 'bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2 disabled:opacity-50'
const BTN2  = 'border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-base font-medium px-4 py-2 disabled:opacity-50'

export default function PayoutRoundPage({ params }) {
  const { id } = use(params)
  const t = useTranslations('finance')

  const [round, setRound] = useState(null)
  const [account, setAccount] = useState(null)
  const [items, setItems] = useState([])
  const [otherRounds, setOtherRounds] = useState([])
  const [saveStatus, setSaveStatus] = useState('idle')   // idle | saving | saved | error
  const [problems, setProblems] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [copied, setCopied] = useState('')
  const [loading, setLoading] = useState(true)
  const [newPayeeName, setNewPayeeName] = useState(null)   // null = ปิด · string = เปิดพร้อมชื่อที่พิมพ์ค้าง
  const [bankEdit, setBankEdit] = useState(null)           // บรรทัดคนนอกที่กำลังใส่บัญชี

  const saveTimer = useRef(null)
  const locked = round?.status === 'paid'

  const load = useCallback(async () => {
    const res = await fetch(`/api/finance/payouts/${id}`)
    if (!res.ok) { setLoading(false); return }
    const d = await res.json()
    setRound(d.round); setAccount(d.account); setItems(d.items); setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/finance/payouts').then(r => r.ok && r.json())
      .then(rs => rs && setOtherRounds(rs.filter(r => String(r.id) !== String(id) && r.item_count > 0)))
  }, [id])

  // ── autosave (กฎ CLAUDE.md: หน้า Update ห้ามมีปุ่มบันทึก ต้องมีป้ายสถานะ + beforeunload)
  function queueSave(fn) {
    setSaveStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const ok = await fn()
      setSaveStatus(ok ? 'saved' : 'error')
    }, 600)
  }

  function patchRound(patch) {
    setRound(r => ({ ...r, ...patch }))
    queueSave(async () => (await fetch(`/api/finance/payouts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })).ok)
  }

  function patchItem(itemId, patch) {
    setItems(list => list.map(it => it.id === itemId ? { ...it, ...patch } : it))
    queueSave(async () => (await fetch(`/api/finance/payouts/${id}/items`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, ...patch }),
    })).ok)
  }

  // ติ๊กจ่ายแล้ว — ยิงทันที ไม่ debounce (เป็นการกดยืนยัน ไม่ใช่การพิมพ์)
  async function togglePaid(it) {
    const paid = !it.paid_at
    setItems(list => list.map(x => x.id === it.id ? { ...x, paid_at: paid ? new Date().toISOString() : null } : x))
    setSaveStatus('saving')
    const res = await fetch(`/api/finance/payouts/${id}/items`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: it.id, paid }),
    })
    setSaveStatus(res.ok ? 'saved' : 'error')
  }

  useEffect(() => {
    if (saveStatus !== 'saving') return
    const onBeforeUnload = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [saveStatus])

  // ── ค้นคนเข้ารอบ
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/finance/payouts/payees?q=${encodeURIComponent(query)}`)
      if (res.ok) setResults(await res.json())
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  async function addPayee(p) {
    const body = p.kind === 'member' ? { member_user_id: p.id } : { external_payee_id: p.id }
    const res = await fetch(`/api/finance/payouts/${id}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) setItems((await res.json()).items)
    setQuery(''); setResults([])
  }

  async function copyFrom(sourceId) {
    if (!sourceId) return
    const res = await fetch(`/api/finance/payouts/${id}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copyFromRoundId: Number(sourceId) }),
    })
    if (res.ok) setItems((await res.json()).items)
  }

  async function removeItem(itemId) {
    await fetch(`/api/finance/payouts/${id}/items?itemId=${itemId}`, { method: 'DELETE' })
    setItems(list => list.filter(it => it.id !== itemId))
  }

  async function copyText(text, key) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* คลิปบอร์ดถูกบล็อก (http หรือ permission) — เงียบไว้ ผู้ใช้ลากเลือกเองได้ */ }
  }

  // ── ออกไฟล์: ไม่ครบ API ตอบ 422 พร้อมรายชื่อ → ขึ้นธงแดงรายบรรทัด
  async function download() {
    setProblems([])
    const res = await fetch(`/api/finance/payouts/${id}/export`)
    if (res.status === 422) { setProblems((await res.json()).problems || []); return }
    if (!res.ok) return
    const blob = await res.blob()
    const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'payout.csv'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    URL.revokeObjectURL(url)
    load()
  }

  async function closeRound() {
    if (!confirm(t('payouts.confirmPaid'))) return
    await fetch(`/api/finance/payouts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paid' }),
    })
    load()
  }

  if (loading) return <p className="text-base text-warm-500 dark:text-disc-muted">{t('common.loading')}</p>
  if (!round)  return <p className="text-base text-warm-500 dark:text-disc-muted">{t('payouts.notFound')}</p>

  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
  const paidCount = items.filter(it => it.paid_at).length
  const groups = chunkIntoGroups(items)
  const problemIds = new Set(problems.map(p => p.id))
  const allPaid = items.length > 0 && paidCount === items.length

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link href="/finance/payouts" aria-label={t('payouts.back')}
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text min-w-0 flex-1 truncate">{round.title}</h1>
        <SaveIndicator status={saveStatus} t={t} />
      </div>

      <p className="text-sm text-warm-500 dark:text-disc-muted mb-4">
        {[account?.name, account?.bank, account?.account_no].filter(Boolean).join(' · ')}
        {round.event_name ? ` · ${round.event_name}` : ''}
        {round.period_ym ? ` · ${round.period_ym}` : ''}
      </p>

      {/* สรุปรอบ — ยอดรวมคือสิ่งที่ user ต้องการเห็นก่อนอย่างอื่น */}
      <div className="rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg px-4 py-3 mb-4">
        <p className="text-2xl font-bold text-warm-900 dark:text-disc-text">
          {total.toLocaleString('th-TH')} <span className="text-base font-normal text-warm-500 dark:text-disc-muted">{t('payouts.baht')}</span>
        </p>
        <p className="text-base text-warm-500 dark:text-disc-muted">
          {t('payouts.progress', { paid: paidCount, count: items.length, groups: groups.length })}
        </p>
      </div>

      {locked && <p className="text-base text-teal mb-4">{t('payouts.lockedNotice')}</p>}

      {/* หัวรอบ — autosave */}
      {!locked && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div>
            <label className={LABEL}>{t('payouts.fieldTitle')}</label>
            <input className={INPUT} value={round.title}
              onChange={e => patchRound({ title: e.target.value })} />
          </div>
          <div>
            <label className={LABEL}>{t('payouts.fieldDefaultAmount')}</label>
            <input type="number" inputMode="decimal" className={INPUT}
              value={round.default_amount ?? ''}
              onChange={e => patchRound({ default_amount: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
        </div>
      )}

      {/* เพิ่มคนเข้ารอบ */}
      {!locked && (
        <div className="mb-4">
          <label className={LABEL}>{t('payouts.addPayee')}</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <input className={INPUT} value={query} placeholder={t('payouts.searchPlaceholder')}
                onChange={e => setQuery(e.target.value)} />
              {!!results.length && (
                <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg shadow-lg">
                  {results.map(p => (
                    <li key={`${p.kind}-${p.id}`}>
                      <button onClick={() => addPayee(p)}
                        className="w-full text-left px-3 py-2 text-base text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover">
                        {p.name || '—'}
                        <span className="text-sm text-warm-500 dark:text-disc-muted">
                          {' '}· {p.kind === 'member' ? t('payouts.kindMember') : t('payouts.kindExternal')}
                          {p.province ? ` · ${p.province}` : ''}
                          {!p.account_no && !p.promptpay_id ? ` · ${t('payouts.noBankInfo')}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" onClick={() => { setNewPayeeName(query); setResults([]) }}
              className={`${BTN2} h-11 shrink-0 flex items-center justify-center gap-1.5`}>
              <UserPlus size={16} /> {t('payouts.addExternal')}
            </button>
            {!!otherRounds.length && (
              <select className={`${INPUT} sm:w-64`} value="" onChange={e => copyFrom(e.target.value)}>
                <option value="">{t('payouts.copyFrom')}</option>
                {otherRounds.map(r => <option key={r.id} value={r.id}>{r.title} ({r.item_count})</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      {/* รายการ แบ่งกลุ่มละ 10 ตามเพดานของแอปธนาคาร */}
      {groups.map(g => (
        <div key={g.label} className="mb-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h2 className="text-lg font-medium text-warm-900 dark:text-disc-text">
              {t('payouts.groupHeading', { label: g.label })}
            </h2>
            <span className="text-sm text-warm-500 dark:text-disc-muted">
              {t('payouts.groupMeta', { count: g.rows.length, total: g.total.toLocaleString('th-TH') })}
            </span>
            <button onClick={() => copyText(buildPlainText({ ...round, title: `${round.title} — ${t('payouts.groupHeading', { label: g.label })}` }, g.rows, account), `g-${g.label}`)}
              className="text-sm text-teal font-medium">
              {copied === `g-${g.label}` ? t('common.copied') : t('payouts.copyGroup')}
            </button>
          </div>

          <div className="space-y-2">
            {g.rows.map(it => {
              const isPP = it.payment_method === 'promptpay'
              const bank = isPP ? null : resolveBank({ bank_code: it.bank_code })
              const dest = digitsOnly(isPP ? it.promptpay_id : it.account_no)
              const missing = problemIds.has(it.id)
              const paid = !!it.paid_at
              return (
                <div key={it.id}
                  className={`rounded-lg border bg-card-bg px-3 py-2 flex flex-wrap items-center gap-2 ${missing ? 'border-red-400' : 'border-warm-200 dark:border-disc-border'} ${paid ? 'opacity-60' : ''}`}>
                  <input type="checkbox" checked={paid} disabled={locked}
                    onChange={() => togglePaid(it)}
                    aria-label={t('payouts.paidAria')}
                    className="h-5 w-5 shrink-0 accent-teal" />

                  <div className="min-w-0 flex-1">
                    <p className={`text-base text-warm-900 dark:text-disc-text truncate ${paid ? 'line-through' : ''}`}>
                      {it.payee_name || '—'}
                    </p>
                    <p className="text-sm text-warm-500 dark:text-disc-muted truncate">
                      {isPP ? t('payouts.kindPromptpay') : (bank?.name || t('payouts.noBank'))} {dest || '—'}
                    </p>
                    {missing && (
                      <p className="text-sm text-red-500 flex items-center gap-1">
                        <AlertTriangle size={16} /> {t(`payouts.problem_${problems.find(p => p.id === it.id)?.reason}`)}
                      </p>
                    )}
                  </div>

                  {!locked && it.external_payee_id && !it.snapshot_at && (
                    <button onClick={() => setBankEdit(it)} aria-label={t('payouts.editBankAria')}
                      className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover">
                      <Pencil size={16} />
                    </button>
                  )}

                  {!!dest && (
                    <button onClick={() => copyText(dest, `a-${it.id}`)} aria-label={t('payouts.copyAccountAria')}
                      className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover">
                      {copied === `a-${it.id}` ? <Check size={16} className="text-teal" /> : <Copy size={16} />}
                    </button>
                  )}

                  <input type="number" inputMode="decimal" disabled={locked}
                    className={`${INPUT} flex-1 min-w-0 sm:flex-none sm:w-28 sm:shrink-0`} value={it.amount ?? ''}
                    aria-label={t('payouts.amountAria')}
                    onChange={e => patchItem(it.id, { amount: e.target.value })} />

                  {!locked && (
                    <button onClick={() => removeItem(it.id)} aria-label={t('payouts.removeItemAria')}
                      className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {!items.length && <p className="text-base text-warm-500 dark:text-disc-muted">{t('payouts.noItems')}</p>}

      {/* ส่งต่อ / ปิดรอบ */}
      {!!items.length && (
        <div className="mt-6 flex flex-wrap gap-2">
          <button onClick={() => copyText(buildPlainText(round, items, account), 'all')} className={BTN2}>
            <span className="inline-flex items-center gap-2">
              <Copy size={16} /> {copied === 'all' ? t('common.copied') : t('payouts.copyAll')}
            </span>
          </button>
          <button onClick={download} className={BTN2}>
            <span className="inline-flex items-center gap-2"><Download size={16} /> {t('payouts.download')}</span>
          </button>
          {!locked && (
            <button onClick={closeRound} className={BTN} disabled={!allPaid} title={allPaid ? '' : t('payouts.closeHint')}>
              {t('payouts.closeRound')}
            </button>
          )}
        </div>
      )}
      {!locked && !!items.length && !allPaid && (
        <p className="text-sm text-warm-500 dark:text-disc-muted mt-2">{t('payouts.closeHint')}</p>
      )}

      {newPayeeName !== null && (
        <ExternalPayeeModal
          initialName={newPayeeName}
          createUrl={`/api/finance/payouts/${id}/payees`}
          allowCard={false}
          onClose={() => setNewPayeeName(null)}
          onCreated={(payee, res) => {
            setNewPayeeName(null)
            setQuery('')
            // สร้างใหม่ = route ใส่เข้ารอบให้แล้ว · เลือก "ใช้คนเดิม" = ยังไม่ได้ใส่ ต้องยิงเพิ่มเอง
            if (res?.items) setItems(res.items)
            else addPayee({ kind: 'external', id: payee.id })
          }}
        />
      )}

      {bankEdit && (
        <BankEditModal
          item={bankEdit} roundId={id} t={t}
          onClose={() => setBankEdit(null)}
          onSaved={next => {
            setItems(next)
            setProblems(ps => ps.filter(p => p.id !== bankEdit.id))
            setBankEdit(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * ใส่/แก้บัญชีของคนนอกจากหน้ารอบจ่าย — แก้ทะเบียนคนนอกจริง (ครั้งหน้าค้นเจอพร้อมบัญชี)
 * ไม่มี autosave → มีปุ่มบันทึก (กฎ Update ใน CLAUDE.md)
 */
function BankEditModal({ item, roundId, t, onClose, onSaved }) {
  const [form, setForm] = useState({
    payment_method: item.payment_method || 'bank',
    bank_code: item.bank_code || '',
    account_no: item.account_no || '',
    account_holder: item.account_holder || '',
    promptpay_id: item.promptpay_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  async function save() {
    setSaving(true); setError('')
    const res = await fetch(`/api/finance/payouts/${roundId}/payees/${item.external_payee_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    setSaving(false)
    if (!res.ok) { setError(t('payouts.saveFailed')); return }
    onSaved((await res.json()).items)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-warm-200 dark:border-disc-border">
          <h2 className="text-lg font-medium text-warm-900 dark:text-disc-text min-w-0 truncate">
            {t('payouts.editBankTitle', { name: item.payee_name || '—' })}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('payouts.close')}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <PayeeBankFields value={form} onChange={patch => setForm(f => ({ ...f, ...patch }))}
            inputCls={INPUT} labelCls={LABEL} />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-warm-200 dark:border-disc-border">
          <button type="button" onClick={onClose} className={BTN2}>{t('payouts.cancel')}</button>
          <button type="button" onClick={save} disabled={saving} className={BTN}>
            {saving ? t('payouts.saving') : t('payouts.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function SaveIndicator({ status, t }) {
  if (status === 'saving') return <span className="text-sm text-warm-500 dark:text-disc-muted">{t('payouts.saving')}</span>
  if (status === 'saved')  return <span className="text-sm text-teal">{t('payouts.saved')}</span>
  if (status === 'error')  return <span className="text-sm text-red-500">{t('payouts.saveFailed')}</span>
  return null
}
