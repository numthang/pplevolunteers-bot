'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PenLine, CreditCard, ChevronRight, AlertTriangle } from 'lucide-react'

const KNOWN_ITEM_TYPES = ['food', 'speaker', 'travel', 'venue', 'accommodation', 'supplies', 'equipment', 'sound', 'photo']

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number)
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`
}

function expiryWarn(expiresAt, t) {
  if (!expiresAt) return null
  const exp = new Date(expiresAt).getTime()
  const now = Date.now()
  if (exp < now) return { text: t('pending.expired'), danger: true }
  if (exp - now < 14 * 86400000) return { text: t('pending.expiresOn', { date: formatDate(expiresAt) }), danger: false }
  return null
}

function SignList({ items, emptyText }) {
  const t = useTranslations('docs')
  if (items.length === 0) {
    return (
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl py-16 text-center text-warm-400 dark:text-disc-muted text-base">
        {emptyText}
      </div>
    )
  }
  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl overflow-hidden divide-y divide-warm-200 dark:divide-disc-border">
      {items.map(it => {
        const warn = expiryWarn(it.expires_at, t)
        return (
          <Link
            key={it.id}
            href={`/docs/sign/${it.token}`}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-warm-50 dark:hover:bg-disc-hover transition group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-medium text-warm-900 dark:text-disc-text truncate">{it.event_name}</span>
                {it.province && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange/10 text-orange shrink-0">{it.province}</span>}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-warm-500 dark:text-disc-muted mt-0.5 flex-wrap">
                <span>{KNOWN_ITEM_TYPES.includes(it.item_type) ? t(`pending.itemLabels.${it.item_type}`) : it.item_type}</span>
                <span className="text-warm-300 dark:text-disc-muted/40">·</span>
                <span className="font-medium text-warm-700 dark:text-disc-text tabular-nums">{t('pending.amount', { amount: Number(it.amount).toLocaleString() })}</span>
                {it.event_date && <><span className="text-warm-300 dark:text-disc-muted/40">·</span><span>{formatDate(it.event_date)}</span></>}
                {warn && (
                  <span className={`inline-flex items-center gap-1 ${warn.danger ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    <AlertTriangle size={13} /> {warn.text}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={18} className="text-warm-300 dark:text-disc-muted group-hover:text-orange transition shrink-0" />
          </Link>
        )
      })}
    </div>
  )
}

export default function DocsPendingPage() {
  const t = useTranslations('docs')
  const [data, setData] = useState({ recipient: [], payer: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('recipient')

  function load() {
    setLoading(true)
    fetch('/api/docs/pending')
      .then(r => r.json())
      .then(d => setData(d.data || { recipient: [], payer: [] }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
  }, [])

  const hasPayer = data.payer.length > 0
  // ถ้าไม่มีรายการรอเซ็นจ่าย ซ่อน tab — บังคับกลับมา recipient
  const activeTab = (!hasPayer && tab === 'payer') ? 'recipient' : tab

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">{t('pending.title')}</h1>
        <p className="text-base text-warm-500 dark:text-disc-muted">{t('pending.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-warm-200 dark:border-disc-border">
        <button
          onClick={() => setTab('recipient')}
          className={`px-4 py-2 text-base font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            activeTab === 'recipient'
              ? 'border-orange text-orange'
              : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
          }`}
        >
          <PenLine className="w-4 h-4 shrink-0" />
          {t('pending.tabRecipient')}
          {data.recipient.length > 0 && (
            <span className={`text-sm px-1.5 py-0.5 rounded-full font-normal ${
              activeTab === 'recipient' ? 'bg-orange/10 text-orange' : 'bg-warm-100 dark:bg-disc-header text-warm-500 dark:text-disc-muted'
            }`}>{data.recipient.length}</span>
          )}
        </button>
        {hasPayer && (
          <button
            onClick={() => setTab('payer')}
            className={`px-4 py-2 text-base font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              activeTab === 'payer'
                ? 'border-orange text-orange'
                : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
            }`}
          >
            <CreditCard className="w-4 h-4 shrink-0" />
            {t('pending.tabPayer')}
            <span className={`text-sm px-1.5 py-0.5 rounded-full font-normal ${
              activeTab === 'payer' ? 'bg-orange/10 text-orange' : 'bg-warm-100 dark:bg-disc-header text-warm-500 dark:text-disc-muted'
            }`}>{data.payer.length}</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-base">{t('pending.loading')}</div>
      ) : activeTab === 'recipient' ? (
        <SignList items={data.recipient} emptyText={t('pending.emptyRecipient')} />
      ) : (
        <SignList items={data.payer} emptyText={t('pending.emptyPayer')} />
      )}
    </div>
  )
}
