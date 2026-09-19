'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Trash2, X } from 'lucide-react'
import BankBadge from '@/components/BankBadge'
import EventCombobox from '@/components/finance/EventCombobox'
import { roundStage } from '@/lib/payoutStage.js'

const INPUT = 'h-11 px-3 text-base rounded-lg w-full border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal'
const LABEL = 'block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1'
const BTN   = 'bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2 disabled:opacity-50'
const BTN2  = 'border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-base font-medium px-4 py-2'

const thisMonth = () => new Date().toISOString().slice(0, 7)
const EMPTY = { title: '', account_id: '', source_type: 'event', event_id: '', period_ym: thisMonth(), default_amount: '', note: '' }

// สีป้ายตาม tone ของขั้น (lib/payoutStage.js) — ไม่ผูกกับ status ใน DB แล้ว
const TONE_CLS = {
  idle: 'bg-warm-100 text-warm-700 dark:bg-disc-hover dark:text-disc-muted',
  wait: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  done: 'bg-teal/15 text-teal',
}

export default function PayoutsPage() {
  const t = useTranslations('finance')
  const [rounds, setRounds] = useState([])
  const [accounts, setAccounts] = useState([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const res = await fetch('/api/finance/payouts')
    if (res.ok) setRounds(await res.json())
  }

  useEffect(() => {
    load()
    fetch('/api/finance/accounts').then(r => r.ok && r.json()).then(a => a && setAccounts(a))
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
  }, [])

  // หน้า Create ไม่มี autosave → ปิดแท็บทั้งที่พิมพ์ค้าง = งานหาย ต้องเตือน (กฎ CLAUDE.md §การบันทึก)
  const dirty = creating && (form.title.trim() || form.note.trim())
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  function closeCreate() {
    if (dirty && !window.confirm(t('payouts.confirmDiscard'))) return
    setCreating(false)
    setForm(EMPTY)
    setError('')
  }

  async function save() {
    setError('')
    if (!form.title.trim())  return setError(t('payouts.errTitle'))
    if (!form.account_id)    return setError(t('payouts.errAccount'))
    if (form.source_type === 'event' && !form.event_id) return setError(t('payouts.errEvent'))

    setSaving(true)
    const res = await fetch('/api/finance/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        account_id: Number(form.account_id),
        event_id: form.source_type === 'event' ? Number(form.event_id) : null,
        default_amount: form.default_amount === '' ? null : Number(form.default_amount),
      }),
    })
    setSaving(false)
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || t('payouts.errSave'))
    setCreating(false)
    setForm(EMPTY)
    load()
  }

  async function remove(r) {
    if (!confirm(t('payouts.confirmDelete'))) return
    await fetch(`/api/finance/payouts/${r.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">{t('payouts.title')}</h1>
        <button onClick={() => setCreating(true)} className={BTN}>+ {t('payouts.newRound')}</button>
      </div>

      {!rounds.length && (
        <p className="text-base text-warm-500 dark:text-disc-muted">{t('payouts.empty')}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rounds.map(r => {
          // ป้ายสถานะต้องไม่อยู่ "ท้ายแถวเดียวกับชื่อ" — ที่ 375px แถวเดียวเหลือให้ชื่อรอบแค่ ~100px
          // แล้วชื่อโดน truncate แทบทุกอัน (user ทัก 2026-09-19 "เอาสถานะไปเบียดรายละเอียด")
          // → ป้ายไป "ต่อท้ายยอดเงิน บรรทัดเดียวกัน" (user เคาะ 2026-09-19 หลังลองครบ 4 ท่า)
          //   ⛔ ห้ามย้ายกลับไปแถวเดียวกับชื่อรอบ นั่นคือท่าที่โดนทักตั้งแต่แรก
          const stage = roundStage(r)
          return (
          <div key={r.id} className="group relative rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg px-4 py-3 flex items-center gap-3">
            <BankBadge bank={r.account_bank} size={40} />
            <Link href={`/finance/payouts/${r.id}`} className="min-w-0 flex-1">
              {/* pr-10 เผื่อที่ให้ถังขยะเฉพาะอุปกรณ์ที่ไม่มี hover (ปุ่มโชว์ถาวร) —
                  จอที่ hover ได้ปุ่มซ่อนอยู่ จึงคืนความกว้างเต็มให้ชื่อรอบ ไม่เบียดอะไรเลย */}
              <p className="text-base font-semibold text-warm-900 dark:text-disc-text truncate pr-10 [@media(hover:hover)]:pr-0">{r.title}</p>
              <p className="text-sm text-warm-500 dark:text-disc-muted truncate">
                {r.account_name}{r.account_province ? ` · ${r.account_province}` : ''}
              </p>
              {/* ป้ายสถานะต่อท้ายยอดเงิน "บรรทัดเดียวกัน" (user เคาะ 2026-09-19)
                  บรรทัดนี้สั้นที่สุดในการ์ด ("2 คน · 800 บาท") จึงเหลือที่ให้ป้ายโดยไม่แย่งใคร
                  ไม่มี truncate — ป้ายยาวเกินให้ตกลงบรรทัดใหม่เอง ดีกว่าโดนตัดจนอ่านไม่ออก */}
              <p className="text-sm text-warm-500 dark:text-disc-muted mt-0.5">
                {t('payouts.summary', { count: r.item_count, total: Number(r.total_amount).toLocaleString('th-TH') })}
                <span className={`inline-block align-middle ml-1.5 px-2.5 py-0.5 text-sm font-medium rounded-full ${TONE_CLS[stage.tone]}`}>
                  {t(`payouts.stage.${stage.key}`, { paid: stage.paid ?? 0, count: stage.count ?? 0 })}
                </span>
              </p>
            </Link>
            {/* ถังขยะลอยมุมขวาบน โผล่ตอน hover — มือถือไม่มี hover จริงจึงโชว์ถาวร
                (ครอบ [@media(hover:hover)] ไม่ใช่ sm: — iPad แนวนอนกว้างเกิน sm แต่ยัง hover ไม่ได้) */}
            {r.status !== 'paid' && (
              <button onClick={() => remove(r)} aria-label={t('payouts.deleteAria')} title={t('payouts.deleteAria')}
                className="absolute top-1.5 right-1.5 h-8 w-8 shrink-0 flex items-center justify-center rounded-lg transition bg-card-bg text-warm-400 dark:text-disc-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus:opacity-100">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          )
        })}
      </div>

      {creating && (
        <Modal title={t('payouts.newRound')} onClose={closeCreate}>
          <div className="space-y-3">
            <div>
              <label className={LABEL}>{t('payouts.fieldTitle')}</label>
              <input className={INPUT} value={form.title} autoFocus
                placeholder={t('payouts.titlePlaceholder')}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>

            <div>
              <label className={LABEL}>{t('payouts.fieldAccount')}</label>
              <select className={INPUT} value={form.account_id}
                onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
                <option value="">{t('payouts.choose')}</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{[a.name, a.bank, a.account_no].filter(Boolean).join(' · ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL}>{t('payouts.fieldSource')}</label>
              <select className={INPUT} value={form.source_type}
                onChange={e => setForm(f => ({ ...f, source_type: e.target.value }))}>
                <option value="event">{t('payouts.sourceEvent')}</option>
                <option value="period">{t('payouts.sourcePeriod')}</option>
              </select>
            </div>

            {form.source_type === 'event' ? (
              <div>
                <label className={LABEL}>{t('payouts.fieldEvent')}</label>
                <EventCombobox value={form.event_id} inputCls={INPUT}
                  onChange={id => setForm(f => ({ ...f, event_id: id }))} />
              </div>
            ) : (
              <div>
                <label className={LABEL}>{t('payouts.fieldPeriod')}</label>
                <input type="month" className={INPUT} value={form.period_ym}
                  onChange={e => setForm(f => ({ ...f, period_ym: e.target.value }))} />
              </div>
            )}

            <div>
              <label className={LABEL}>{t('payouts.fieldDefaultAmount')}</label>
              <input type="number" inputMode="decimal" className={INPUT} value={form.default_amount}
                placeholder="300"
                onChange={e => setForm(f => ({ ...f, default_amount: e.target.value }))} />
            </div>

            {error && <p className="text-base text-red-500">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button onClick={closeCreate} className={BTN2}>{t('common.cancel')}</button>
            <button onClick={save} disabled={saving} className={BTN}>
              {saving ? t('payouts.saving') : t('common.save')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  const boxRef = useRef(null)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3"
      onMouseDown={e => { if (!boxRef.current?.contains(e.target)) onClose() }}>
      <div ref={boxRef} className="bg-card-bg rounded-lg shadow-xl w-full max-w-md p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-lg font-medium text-warm-900 dark:text-disc-text">{title}</h2>
          <button onClick={onClose} aria-label="close"
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
