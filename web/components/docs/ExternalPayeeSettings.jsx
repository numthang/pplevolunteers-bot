'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Pencil, Trash2, Check, X, IdCard } from 'lucide-react'
import { formatThaiId } from '@/lib/thaiId.js'

const inputCls = 'w-full text-sm px-2 py-1.5 rounded border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text focus:outline-none focus:ring-1 focus:ring-orange'

const EDITABLE = ['title', 'first_name', 'last_name', 'entity_name', 'id_number',
                  'house_no', 'moo', 'road', 'subdistrict', 'district', 'province', 'zip_code', 'phone']

/**
 * จัดการผู้รับเงินคนนอกที่สะสมไว้ — คนกลุ่มนี้ reuse ข้ามงาน ถ้าไม่มีที่แก้
 * พิมพ์ชื่อผิดครั้งเดียวจะติดไปทุกใบสำคัญฯ ที่ออกให้เขาตลอดไป
 *
 * ไม่มี autosave → มีปุ่มบันทึกตามกฎ Update (CLAUDE.md) · แถวเดียวกับ editor ผู้จ่ายด้านบน
 */
export default function ExternalPayeeSettings() {
  const t = useTranslations('docs')
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [editId, setEditId]   = useState(null)
  const [form, setForm]       = useState({})
  const [saving, setSaving]   = useState(false)
  const [cardFor, setCardFor] = useState(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!cardFor) return
    const h = e => { if (e.key === 'Escape') setCardFor(null) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [cardFor])

  function load() {
    setLoading(true)
    fetch('/api/docs/external-payees')
      .then(r => r.json())
      .then(d => { if (d.data) setRows(d.data); else setError(d.error || t('externalPayee.settings.loadFailed')) })
      .catch(() => setError(t('externalPayee.settings.loadFailed')))
      .finally(() => setLoading(false))
  }

  function startEdit(p) {
    setEditId(p.id)
    setForm(Object.fromEntries(EDITABLE.map(f => [f, p[f] ?? ''])))
  }

  async function save(id) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/docs/external-payees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('externalPayee.saveFailed'))
      setRows(rs => rs.map(r => (r.id === id ? d.data : r)))
      setEditId(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(p) {
    const label = p.entity_name || `${p.first_name || ''} ${p.last_name || ''}`.trim()
    if (!confirm(t('externalPayee.settings.confirmDelete', { name: label }))) return
    setError(null)
    const res = await fetch(`/api/docs/external-payees/${p.id}`, { method: 'DELETE' })
    if (!res.ok) { setError((await res.json()).error); return }
    setRows(rs => rs.filter(r => r.id !== p.id))
  }

  const label = p => p.entity_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—'

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl overflow-hidden mt-6">
      <div className="px-4 py-3 border-b border-warm-200 dark:border-disc-border">
        <span className="text-base font-semibold text-warm-700 dark:text-disc-text">
          {t('externalPayee.settings.count', { count: rows.length })}
        </span>
        <p className="text-sm text-warm-400 dark:text-disc-muted mt-0.5">{t('externalPayee.settings.description')}</p>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="px-4 py-8 text-center text-base text-warm-400 dark:text-disc-muted">{t('settings.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-base text-warm-400 dark:text-disc-muted">{t('externalPayee.settings.emptyState')}</div>
      ) : (
        <ul className="divide-y divide-warm-100 dark:divide-disc-border">
          {rows.map(p => (
            <li key={p.id} className="px-4 py-3">
              {editId === p.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {EDITABLE.map(f => (
                      <div key={f}>
                        <label className="block text-xs text-warm-500 dark:text-disc-muted mb-1">{t(`externalPayee.fields.${FIELD_KEY[f]}`)}</label>
                        <input type="text" value={form[f] || ''} onChange={e => setForm(s => ({ ...s, [f]: e.target.value }))} className={inputCls} />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => save(p.id)} disabled={saving}
                      className="flex items-center gap-1.5 text-sm px-4 py-2 bg-orange text-white rounded-lg hover:bg-orange-light disabled:opacity-50 transition-colors">
                      <Check size={15} /> {saving ? t('externalPayee.saving') : t('externalPayee.save')}
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="text-sm px-4 py-2 border border-warm-200 dark:border-disc-border text-warm-600 dark:text-disc-muted rounded-lg hover:bg-warm-100 dark:hover:bg-disc-bg transition-colors">
                      {t('externalPayee.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base text-warm-900 dark:text-disc-text">
                      {label(p)}
                      {p.payee_type === 'entity' && (
                        <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-warm-100 text-warm-500 dark:bg-disc-hover dark:text-disc-muted">
                          {t('externalPayee.type.entity')}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-warm-500 dark:text-disc-muted">
                      {p.id_number ? formatThaiId(p.id_number) : t('externalPayee.settings.noIdNumber')}
                      {p.province && ` · ${p.province}`}
                      {p.phone && ` · ${p.phone}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.has_id_card && (
                      <button onClick={() => setCardFor(p)} title={t('externalPayee.settings.viewCard')}
                        className="p-1.5 rounded text-warm-400 dark:text-disc-muted hover:text-orange transition-colors">
                        <IdCard size={16} />
                      </button>
                    )}
                    <button onClick={() => startEdit(p)}
                      className="p-1.5 rounded text-warm-400 dark:text-disc-muted hover:text-orange transition-colors">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => remove(p)}
                      className="p-1.5 rounded text-warm-400 dark:text-disc-muted hover:text-red-accent transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {cardFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
             onMouseDown={e => { if (e.target === e.currentTarget) setCardFor(null) }}>
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl max-w-lg w-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-warm-200 dark:border-disc-border">
              <span className="text-base font-semibold text-warm-900 dark:text-disc-text">{label(cardFor)}</span>
              <button onClick={() => setCardFor(null)} className="p-1 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition">
                <X size={18} />
              </button>
            </div>
            <img src={`/api/docs/external-payees/${cardFor.id}/id-card`} alt="" className="w-full rounded-b-xl" />
          </div>
        </div>
      )}
    </div>
  )
}

// ชื่อคอลัมน์ใน DB → คีย์ i18n (ใช้ชุดเดียวกับฟอร์มตอนสร้าง ไม่ตั้งคำใหม่)
const FIELD_KEY = {
  title: 'title', first_name: 'firstName', last_name: 'lastName', entity_name: 'entityName',
  id_number: 'idNumber', house_no: 'houseNo', moo: 'moo', road: 'road',
  subdistrict: 'subdistrict', district: 'district', province: 'province',
  zip_code: 'zipCode', phone: 'phone',
}
