'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Suspense } from 'react'
import CategorySelect, { CatIcon } from '@/components/CategorySelect'
import { formatThaiDateHeader, formatThaiDateShort, formatThaiDateTime } from '@/lib/dateFormat'
import AccountSelect from '@/components/AccountSelect'
import { Pencil, Trash2, ImagePlus, X, ChevronDown, Copy, Check } from 'lucide-react'
import BankBadge from '@/components/BankBadge'
import { canEditAccount } from '@/lib/financeAccess.js'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'

const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function TransactionsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session } = useSession()
  const { roles: effectiveRoles, discordId: effectiveDiscordId } = useEffectiveRoles(session)

  const [txns, setTxns]         = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [filter, setFilter]     = useState({
    accountId:  searchParams.get('accountId')  || '',
    type:       searchParams.get('type')       || '',
    categoryId: searchParams.get('categoryId') || '',
    search:     searchParams.get('search')     || '',
    year:       searchParams.get('year')       || '',
    month:      searchParams.get('month')      || '',
    dateFrom:   searchParams.get('dateFrom')   || '',
    dateTo:     searchParams.get('dateTo')     || '',
  })
  const [balance, setBalance]   = useState(null)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')

  // sync filter → URL
  useEffect(() => {
    const p = new URLSearchParams()
    if (filter.accountId)  p.set('accountId',  filter.accountId)
    if (filter.type)       p.set('type',        filter.type)
    if (filter.categoryId) p.set('categoryId',  filter.categoryId)
    if (filter.search)     p.set('search',      filter.search)
    if (filter.year)       p.set('year',        filter.year)
    if (filter.month)      p.set('month',       filter.month)
    if (filter.dateFrom)   p.set('dateFrom',    filter.dateFrom)
    if (filter.dateTo)     p.set('dateTo',      filter.dateTo)
    router.replace('?' + p.toString(), { scroll: false })
  }, [filter])
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [copiedAcc, setCopiedAcc] = useState(false)
  const [accOpen, setAccOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [hasMore, setHasMore]   = useState(true)
  const [loading, setLoading]   = useState(false)
  const sentinelRef             = useRef(null)
  const loadingRef              = useRef(false)
  const offsetRef               = useRef(0)
  const LIMIT = 50

  function toLocalDT(d = new Date()) {
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const EMPTY_FORM = { account_id: filter.accountId, type: 'income', amount: '', description: '', category_id: '', counterpart_name: '', counterpart_bank: '', counterpart_account: '', txn_at: toLocalDT() }

  useEffect(() => {
    fetch('/api/finance/accounts').then(r => r.json()).then(list => {
      setAccounts(list)
      // ถ้า accountId ใน URL ไม่อยู่ในรายการที่เข้าถึงได้ → ล้างออก
      if (filter.accountId && !list.some(a => String(a.id) === String(filter.accountId))) {
        setFilter(f => ({ ...f, accountId: '' }))
      }
    })
    fetch('/api/finance/categories').then(r => r.json()).then(setCategories)
  }, [])

  useEffect(() => { fetchBalance() }, [filter.accountId])

  const fetchPage = useCallback(async (currentOffset, reset = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    const p = new URLSearchParams()
    if (filter.accountId)  p.set('accountId',  filter.accountId)
    if (filter.type)       p.set('type',        filter.type)
    if (filter.categoryId) p.set('categoryId',  filter.categoryId)
    if (filter.search)     p.set('search',      filter.search)
    if (filter.year)       p.set('year',        filter.year)
    if (filter.month)      p.set('month',       filter.month)
    if (filter.dateFrom)   p.set('dateFrom',    filter.dateFrom)
    if (filter.dateTo)     p.set('dateTo',      filter.dateTo)
    p.set('limit',  LIMIT)
    p.set('offset', currentOffset)
    const res = await fetch('/api/finance/transactions?' + p)
    const rows = res.ok ? await res.json() : []
    setTxns(prev => {
      const merged = reset ? rows : [...prev, ...rows]
      const seen = new Set()
      return merged.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
    })
    setHasMore(rows.length === LIMIT)
    setLoading(false)
    loadingRef.current = false
  }, [filter])

  // reset on filter change
  useEffect(() => {
    offsetRef.current = 0
    loadingRef.current = false
    setTxns([])
    setHasMore(true)
    fetchPage(0, true)
  }, [filter])

  // infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
        const next = offsetRef.current + LIMIT
        offsetRef.current = next
        fetchPage(next)
      }
    }, { threshold: 0.1 })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasMore, fetchPage])

  const fetchBalance = useCallback(() => {
    if (!filter.accountId) { setBalance(null); return }
    fetch(`/api/finance/transactions/balance?accountId=${filter.accountId}`)
      .then(r => r.json()).then(setBalance)
  }, [filter.accountId])

  const load = useCallback(() => {
    offsetRef.current = 0
    loadingRef.current = false
    setTxns([])
    setHasMore(true)
    fetchPage(0, true)
    fetchBalance()
  }, [fetchPage, fetchBalance])

  function openNew()  { setForm({ ...EMPTY_FORM }); setEditing({}) }
  function openEdit(t){ setForm({ ...t, txn_at: toLocalDT(new Date(t.txn_at)) }); setEditing(t) }
  function close()    { setEditing(null) }

  async function save() {
    if (!form.account_id) return alert('กรุณาเลือกบัญชี')
    if (!form.amount || Number(form.amount) <= 0) return alert('กรุณาใส่จำนวนเงิน')
    const isNew = !editing?.id
    const res = await fetch(isNew ? '/api/finance/transactions' : `/api/finance/transactions/${editing.id}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) return alert('ไม่มีสิทธิ์บันทึกรายการในบัญชีนี้')
    close(); load()
  }

  async function remove(id) {
    if (!confirm('ลบรายการนี้?')) return
    await fetch(`/api/finance/transactions/${id}`, { method: 'DELETE' })
    load()
  }

  async function changeCategory(t, categoryId) {
    await fetch(`/api/finance/transactions/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...t, category_id: categoryId || null, txn_at: toLocalDT(new Date(t.txn_at)) }),
    })
    setTxns(prev => prev.map(x => x.id === t.id
      ? { ...x, category_id: categoryId, category_name: categories.find(c => c.id === Number(categoryId))?.name || null, category_icon: categories.find(c => c.id === Number(categoryId))?.icon || null }
      : x
    ))
    setExpandedId(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">รายการธุรกรรม</h1>
        {['เหรัญญิก','กรรมการจังหวัด','ผู้ประสานงานจังหวัด','Admin','เลขาธิการ'].some(r => effectiveRoles.includes(r)) && (
          <button onClick={openNew} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
            + เพิ่มรายการ
          </button>
        )}
      </div>

      {/* Account selector card */}
      {accounts.length > 0 && (() => {
        const acc = accounts.find(a => String(a.id) === String(filter.accountId))
        const visLabel = acc?.visibility === 'private' ? '🔒 ส่วนตัว' : acc?.visibility === 'internal' ? '👥 ภายใน' : '🌐 สาธารณะ'
        function copyAll(e) {
          e.stopPropagation()
          const text = [acc.name, acc.bank, acc.account_no].filter(Boolean).join(' ')
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => { setCopiedAcc(true); setTimeout(() => setCopiedAcc(false), 1500) })
          } else {
            const el = document.createElement('textarea')
            el.value = text; document.body.appendChild(el); el.select()
            document.execCommand('copy'); document.body.removeChild(el)
            setCopiedAcc(true); setTimeout(() => setCopiedAcc(false), 1500)
          }
        }
        return (
          <div className="mb-4 rounded-xl border dark:border-disc-border bg-card-bg overflow-hidden">
            {/* trigger */}
            <button type="button" onClick={() => setAccOpen(o => !o)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-disc-hover/50 transition text-left">
              <BankBadge bank={acc?.bank} size={40} />
              <div className="flex-1 min-w-0">
                {acc ? (
                  <>
                    <p className="font-semibold text-gray-900 dark:text-disc-text">{acc.name}</p>
                    <p className="text-xs text-gray-400 dark:text-disc-muted mt-0.5">
                      {[acc.bank, acc.account_no].filter(Boolean).join(' · ')}
                      {acc.province && <span> · {acc.province}</span>}
                      <span> · {visLabel}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-gray-400 dark:text-disc-muted">เลือกบัญชี</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {acc && (
                  <span onClick={copyAll}
                    className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-disc-muted hover:text-indigo-500 dark:hover:text-indigo-400 transition px-1 cursor-pointer"
                  >
                    {copiedAcc ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    {copiedAcc ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </span>
                )}
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${accOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {/* dropdown */}
            {accOpen && (
              <div className="border-t dark:border-disc-border max-h-64 overflow-y-auto">
                <button type="button"
                  onClick={() => { setFilter(f => ({ ...f, accountId: '' })); setAccOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-disc-hover/50">
                  ทุกบัญชี
                </button>
                {accounts.map(a => (
                  <button key={a.id} type="button"
                    onClick={() => { setFilter(f => ({ ...f, accountId: String(a.id) })); setAccOpen(false) }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition
                      ${String(a.id) === String(filter.accountId) ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}>
                    <BankBadge bank={a.bank} size={32} />
                    <div className="text-left min-w-0">
                      <p className={`text-sm font-medium truncate ${String(a.id) === String(filter.accountId) ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-disc-text'}`}>{a.name}</p>
                      <p className="text-xs text-gray-400 dark:text-disc-muted truncate">{[a.bank, a.account_no].filter(Boolean).join(' · ')}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* balance */}
            {acc && balance?.has_balance_after && (
              <div className="border-t dark:border-disc-border px-4 py-2.5 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-disc-muted">ยอดรวมในระบบ</span>
                  <span className="font-semibold">{Number(balance.net).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-disc-muted">ยอดคงเหลือจริง</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{Number(balance.balance_after).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</span>
                </div>
                {Math.abs(Number(balance.net) - Number(balance.balance_after)) > 0.01 && (
                  <div className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded px-2 py-1">
                    ⚠️ ยอดต่างกัน {Math.abs(Number(balance.net) - Number(balance.balance_after)).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}


      {/* Filters */}
      <div className="flex flex-col gap-2 mb-5">
        {/* Type */}
        <div className="flex rounded border dark:border-disc-border overflow-hidden text-sm">
          {[['', 'ทั้งหมด'], ['income', '📥 รายรับ'], ['expense', '📤 รายจ่าย']].map(([val, label]) => (
            <button key={val} type="button"
              onClick={() => setFilter(f => ({ ...f, type: val }))}
              className={`flex-1 px-3 py-1.5 ${filter.type === val ? 'bg-indigo-600 text-white' : 'bg-card-bg text-gray-700 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-disc-hover'}`}
            >{label}</button>
          ))}
        </div>

        {/* Date filter toggle */}
        {(() => {
          const hasDate = filter.year || filter.month || filter.dateFrom || filter.dateTo || filter.search
          const now = new Date()
          const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 5 + i)
          const dateLabel = filter.dateFrom || filter.dateTo
            ? `${filter.dateFrom || '…'} – ${filter.dateTo || '…'}`
            : [filter.year ? `${Number(filter.year) + 543}` : '', MONTHS[Number(filter.month) - 1] || ''].filter(Boolean).join(' ') || null
          return (
            <div className="rounded border dark:border-disc-border overflow-hidden bg-card-bg text-sm">
              <button type="button" onClick={() => setDateOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-disc-hover/50 transition">
                <span className={hasDate ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-400 dark:text-disc-muted'}>
                  {dateLabel || 'กรองตามวันที่'}
                </span>
                <div className="flex items-center gap-2">
                  {hasDate && (
                    <span onClick={e => { e.stopPropagation(); setSearchInput(''); setFilter(f => ({ ...f, year: '', month: '', dateFrom: '', dateTo: '', search: '' })) }}
                      className="text-xs text-gray-400 hover:text-red-500 transition px-1">ล้าง</span>
                  )}
                  <ChevronDown size={14} className={`text-gray-400 transition-transform ${dateOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {dateOpen && (
                <div className="border-t dark:border-disc-border px-3 py-3 space-y-2">
                  <input
                    className="w-full border dark:border-disc-border rounded px-2 py-1.5 text-sm bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text placeholder-gray-400"
                    placeholder="ค้นหารายการ..."
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && setFilter(f => ({ ...f, search: searchInput }))}
                  />
                  <div className="flex gap-2">
                    <select className="flex-1 border dark:border-disc-border rounded px-2 py-1.5 text-sm bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text"
                      value={filter.year} onChange={e => setFilter(f => ({ ...f, year: e.target.value, month: '', dateFrom: '', dateTo: '' }))}>
                      <option value="">ทุกปี</option>
                      {years.map(y => <option key={y} value={y}>{y + 543} ({y})</option>)}
                    </select>
                    <select className="flex-1 border dark:border-disc-border rounded px-2 py-1.5 text-sm bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text"
                      value={filter.month} onChange={e => setFilter(f => ({ ...f, month: e.target.value, dateFrom: '', dateTo: '' }))}>
                      <option value="">ทุกเดือน</option>
                      {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <input type="date" className="flex-1 min-w-0 border dark:border-disc-border rounded px-2 py-1 bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text text-sm"
                      value={filter.dateFrom} onChange={e => setFilter(f => ({ ...f, dateFrom: e.target.value, year: '', month: '' }))} />
                    <span className="text-gray-400 flex-shrink-0">–</span>
                    <input type="date" className="flex-1 min-w-0 border dark:border-disc-border rounded px-2 py-1 bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text text-sm"
                      value={filter.dateTo} onChange={e => setFilter(f => ({ ...f, dateTo: e.target.value, year: '', month: '' }))} />
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* List */}
      <div className="space-y-2">
        {txns.length === 0 && (
          <div className="text-center py-12 text-gray-400">ไม่มีรายการ</div>
        )}
        {txns.reduce((acc, t) => {
          const dateKey = formatThaiDateHeader(t.txn_at)
          if (!acc.length || acc[acc.length - 1].dateKey !== dateKey) {
            acc.push({ dateKey, items: [] })
          }
          acc[acc.length - 1].items.push(t)
          return acc
        }, []).map(({ dateKey, items }) => (
          <div key={dateKey}>
            <p className="text-xs font-semibold text-gray-400 dark:text-disc-muted px-1 py-1.5 sticky top-0 bg-gray-50 dark:bg-disc-bg2 z-10">{dateKey}</p>
            <div className="space-y-1.5">
        {items.map(t => (
          <div key={t.id} className="bg-card-bg rounded-xl shadow overflow-hidden">
            {/* Main row */}
            <div
              className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-disc-hover/50 select-none"
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
            >
              <BankBadge bank={t.account_bank} size={32} />
              {t.evidence_url && (
                <img src={t.evidence_url} alt="" onClick={e => { e.stopPropagation(); window.open(t.evidence_url, '_blank') }}
                  className="w-10 h-10 rounded object-cover flex-shrink-0 border dark:border-disc-border cursor-zoom-in" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-gray-900 dark:text-disc-text truncate">{t.description || '—'}</p>
                <p className="text-sm text-gray-500 dark:text-disc-muted truncate flex items-center gap-1">
                  {t.account_name}
                  {t.category_name && (
                    <>
                      <span>·</span>
                      <CatIcon name={t.category_icon} size={11} className="flex-shrink-0" />
                      <span>{t.category_name}</span>
                    </>
                  )}
                  {!t.category_name && <span className="text-gray-300 dark:text-disc-muted/50">· ไม่มีหมวด</span>}
                </p>
                <p className="text-xs text-gray-400 dark:text-disc-muted mt-0.5">
                  {formatThaiDateTime(t.txn_at)} · <span className="text-gray-300 dark:text-disc-muted/50">#{t.id}</span>
                </p>
              </div>
              <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                <p className={`font-mono font-semibold ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {t.type === 'income' ? '+' : '-'}{Number(t.amount).toLocaleString('th-TH')} ฿
                </p>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${expandedId === t.id ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* Expanded: category grid + actions */}
            {expandedId === t.id && (
              <div className="border-t dark:border-disc-border px-4 py-3 bg-gray-50 dark:bg-disc-hover/30">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {/* ตัวเลือกไม่มีหมวด */}
                  <button
                    onClick={() => changeCategory(t, null)}
                    className={`px-3 py-1.5 rounded-full text-[15px] border transition
                      ${!t.category_id
                        ? 'bg-gray-200 dark:bg-disc-hover border-gray-400 dark:border-disc-border text-gray-800 dark:text-disc-text font-medium'
                        : 'border-gray-200 dark:border-disc-border text-gray-400 hover:bg-gray-100 dark:hover:bg-disc-hover'}`}
                  >ไม่มีหมวด</button>

                  {/* category icons — all, sorted by usage_count */}
                  {[...categories].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)).slice(0, 10).map(c => (
                    <button
                      key={c.id}
                      onClick={() => changeCategory(t, c.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[15px] border transition
                        ${t.category_id === c.id
                          ? 'bg-indigo-100 dark:bg-indigo-900/60 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300 font-medium'
                          : 'border-gray-200 dark:border-disc-border text-gray-600 dark:text-disc-text hover:bg-gray-100 dark:hover:bg-disc-hover'}`}
                    >
                      <CatIcon name={c.icon} size={11} />
                      {c.name}
                    </button>
                  ))}
                </div>
                {canEditAccount(
                  { owner_id: t.account_owner_id, visibility: t.account_visibility, province: t.account_province },
                  effectiveDiscordId,
                  effectiveRoles
                ) && (
                  <div className="flex gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(t); setExpandedId(null) }}
                      className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    ><Pencil size={12} /> แก้ไขทั้งหมด</button>
                    <button
                      onClick={e => { e.stopPropagation(); remove(t.id) }}
                      className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 hover:underline ml-2"
                    ><Trash2 size={12} /> ลบ</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
            </div>
          </div>
        ))}
      </div>

      {/* infinite scroll sentinel */}
      <div ref={sentinelRef} className="py-2 text-center text-xs text-gray-400">
        {loading && 'กำลังโหลด...'}
        {!loading && !hasMore && txns.length > 0 && 'แสดงทั้งหมดแล้ว'}
      </div>

      {editing !== null && (
        <Modal title={editing.id ? `แก้ไขรายการ #${editing.id}` : 'เพิ่มรายการ'} onClose={close} onSave={save}>
          <TxnForm form={form} onChange={v => setForm(f => ({ ...f, ...v }))}
            accounts={accounts.filter(a => canEditAccount(
              { owner_id: a.owner_id, visibility: a.visibility, province: a.province },
              effectiveDiscordId, effectiveRoles
            ))}
            categories={categories} />
        </Modal>
      )}
    </div>
  )
}

function TxnForm({ form, onChange, accounts, categories }) {
  const inputCls = "block w-full border dark:border-disc-border rounded px-2 py-1 mt-1 bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text"
  const hasDetails = !!(form.counterpart_name || form.counterpart_bank || form.counterpart_account || form.evidence_url)
  const [showDetails, setShowDetails] = useState(hasDetails)

  return (
    <div className="space-y-3 text-sm text-gray-700 dark:text-disc-text">
      <label className="block">
        บัญชี
        <AccountSelect
          accounts={accounts}
          value={form.account_id}
          onChange={v => onChange({ account_id: v })}
          placeholder="เลือกบัญชี"
          className="mt-1"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="block">
          ประเภท
          <div className="flex rounded border dark:border-disc-border overflow-hidden mt-1 text-sm">
            {[['income','📥 รายรับ'],['expense','📤 รายจ่าย']].map(([val, label]) => (
              <button key={val} type="button"
                onClick={() => onChange({ type: val })}
                className={`flex-1 py-1 ${form.type === val
                  ? val === 'income' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                  : 'bg-white dark:bg-disc-hover text-gray-600 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-disc-header'}`}
              >{label}</button>
            ))}
          </div>
        </div>
        <div className="block">
          จำนวนเงิน
          <CalcInput value={form.amount} onChange={v => onChange({ amount: v })} />
        </div>
      </div>
      <label className="block">
        รายละเอียด
        <input name="description" className={inputCls} value={form.description || ''} onChange={e => onChange({ description: e.target.value })} />
      </label>
      <div className="block text-sm">
        หมวดหมู่
        <CategorySelect
          categories={categories}
          value={form.category_id || ''}
          onChange={v => onChange({ category_id: v })}
          className="mt-1"
        />
      </div>
      <label className="block">
        วันที่ / เวลา
        <input type="datetime-local" lang="th" className={inputCls} value={form.txn_at || ''} onChange={e => onChange({ txn_at: e.target.value })} />
      </label>

      {/* Collapsible: counterpart + evidence */}
      <div className="border-t dark:border-disc-border pt-2">
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="w-full flex items-center justify-between text-xs text-gray-400 dark:text-disc-muted hover:text-gray-600 dark:hover:text-disc-text py-0.5"
        >
          <span>{showDetails ? 'ซ่อนรายละเอียด' : 'แหล่งที่มา / หลักฐาน'}{!showDetails && hasDetails && <span className="ml-1 text-indigo-500">•</span>}</span>
          <ChevronDown size={14} className={`transition-transform ${showDetails ? 'rotate-180' : ''}`} />
        </button>

        {showDetails && (
          <div className="space-y-3 mt-2">
            <label className="block">
              แหล่งที่มา (ชื่อผู้โอน/รับ)
              <input name="counterpart_name" className={inputCls} value={form.counterpart_name || ''} onChange={e => onChange({ counterpart_name: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                ธนาคารคู่โอน
                <input name="counterpart_bank" className={inputCls} value={form.counterpart_bank || ''} onChange={e => onChange({ counterpart_bank: e.target.value })} />
              </label>
              <label className="block">
                เลขบัญชีคู่โอน
                <input name="counterpart_account" className={inputCls} value={form.counterpart_account || ''} onChange={e => onChange({ counterpart_account: e.target.value })} />
              </label>
            </div>
            <EvidenceUpload value={form.evidence_url || ''} onChange={v => onChange({ evidence_url: v })} />
          </div>
        )}
      </div>
    </div>
  )
}

function CalcInput({ value, onChange }) {
  const [expr, setExpr] = useState(String(value || ''))
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  // sync ถ้า value เปลี่ยนจากนอก
  useEffect(() => {
    if (!open) setExpr(String(value || ''))
  }, [value, open])

  // keyboard support
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      const k = e.key
      if (k >= '0' && k <= '9') { e.preventDefault(); press(k) }
      else if (k === '.') { e.preventDefault(); press('.') }
      else if (k === '+') { e.preventDefault(); press('+') }
      else if (k === '-') { e.preventDefault(); press('-') }
      else if (k === '*') { e.preventDefault(); press('×') }
      else if (k === '/') { e.preventDefault(); press('÷') }
      else if (k === 'Backspace') { e.preventDefault(); press('⌫') }
      else if (k === 'Enter' || k === '=') { e.preventDefault(); press('✓') }
      else if (k === 'Escape') { e.preventDefault(); setOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, expr])

  function press(key) {
    if (key === '⌫') {
      setExpr(e => e.slice(0, -1))
    } else if (key === '✓') {
      try {
        const result = Function('"use strict"; return (' + expr.replace(/×/g, '*').replace(/÷/g, '/') + ')')()
        const rounded = Math.round(result * 100) / 100
        onChange(rounded)
        setExpr(String(rounded))
      } catch {
        onChange(parseFloat(expr) || 0)
      }
      setOpen(false)
    } else {
      setExpr(e => e + key)
    }
  }

  // คำนวณ preview
  let preview = ''
  try {
    const r = Function('"use strict"; return (' + expr.replace(/×/g, '*').replace(/÷/g, '/') + ')')()
    if (isFinite(r) && String(r) !== expr) preview = '= ' + (Math.round(r * 100) / 100).toLocaleString('th-TH')
  } catch {}

  const rows = [
    ['7','8','9','×'],
    ['4','5','6','÷'],
    ['1','2','3','-'],
    ['.','0','⌫','+'],
  ]

  return (
    <div className="relative mt-1">
      <input
        inputMode="none"
        readOnly
        value={expr}
        onFocus={() => setOpen(true)}
        className="block w-full border dark:border-disc-border rounded px-2 py-1 bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text cursor-pointer"
        placeholder="0"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-gray-100 dark:bg-disc-bg2 border dark:border-disc-border rounded-xl shadow-xl overflow-hidden">
          {/* display */}
          <div className="px-3 py-2 text-right bg-card-bg border-b dark:border-disc-border">
            <p className="font-mono text-lg text-gray-900 dark:text-disc-text min-h-6">{expr || '0'}</p>
            <p className="font-mono text-sm text-gray-400 min-h-5">{preview}</p>
          </div>
          {/* keypad */}
          <div className="grid grid-cols-4 gap-1 p-1.5">
            {rows.map((row, ri) => row.map(key => (
              <button
                key={`${ri}-${key}`}
                type="button"
                onClick={() => press(key)}
                className={`aspect-square text-base font-medium rounded-lg transition active:scale-95
                  ${key === '⌫'
                    ? 'bg-red-50 dark:bg-red-900/40 text-red-500 dark:text-red-400'
                    : ['+','-','×','÷'].includes(key)
                      ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400'
                      : 'bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-disc-header'}`}
              >{key}</button>
            )))}
            {/* ✓ */}
            <button
              type="button"
              onClick={() => press('✓')}
              className="col-span-4 py-2 text-base font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition"
            >✓</button>
          </div>
        </div>
      )}
      {/* overlay ปิด */}
      {open && <div className="fixed inset-0 z-40" onClick={() => { press('✓') }} />}
    </div>
  )
}

function EvidenceUpload({ value, onChange }) {
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    // compress via canvas
    const img = await createImageBitmap(file)
    const MAX = 1200
    const scale = Math.min(1, MAX / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = img.width * scale
    canvas.height = img.height * scale
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(async blob => {
      const fd = new FormData()
      fd.append('file', blob, file.name)
      const res = await fetch('/api/finance/upload', { method: 'POST', body: fd })
      const { url } = await res.json()
      onChange(url)
      setUploading(false)
    }, 'image/jpeg', 0.82)
  }

  return (
    <div className="text-sm text-gray-700 dark:text-disc-text mt-1">
      <p className="mb-1">หลักฐาน</p>
      {value ? (
        <div className="mt-1 relative inline-block">
          <img src={value} alt="evidence"
            onClick={() => window.open(value, '_blank')}
            className="rounded-lg max-h-32 max-w-full object-contain border dark:border-disc-border cursor-zoom-in" />
          <button type="button" onClick={() => onChange('')}
            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600">
            <X size={12} />
          </button>
        </div>
      ) : (
        <label className="mt-1 flex items-center gap-2 border dark:border-disc-border rounded px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-disc-hover text-gray-400">
          <ImagePlus size={16} />
          <span className="text-sm">{uploading ? 'กำลังอัพโหลด...' : 'เลือกรูปภาพ'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
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

  function handleSubmit(e) {
    e.preventDefault()
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-card-bg rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-disc-text">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-disc-text"><X size={18} /></button>
        </div>
        <div className="px-6 overflow-y-auto flex-1">{children}</div>
        <div className="flex justify-end gap-2 px-6 py-4 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-1.5 rounded border dark:border-disc-border text-sm text-gray-700 dark:text-disc-text">ยกเลิก</button>
          <button type="submit" className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">บันทึก</button>
        </div>
      </form>
    </div>
  )
}

export default function TransactionsPage() {
  return <Suspense><TransactionsContent /></Suspense>
}
