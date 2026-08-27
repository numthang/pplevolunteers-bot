'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Sparkles, Image as ImageIcon, Trash2, RotateCcw, X, Check } from 'lucide-react'

const STATUS_LABELS = { draft: 'ร่าง', review: 'รอตรวจ', approved: 'อนุมัติแล้ว' }
const STATUS_DOT = { draft: 'bg-gray-400', review: 'bg-amber-500', approved: 'bg-green-500' }

// ─── ความสมบูรณ์ของเนื้อหา (เคาะ 2026-07-30) ────────────────────────────────
// 4 ข้อเท่าๆ กัน ข้อละ 25% · **ไม่นับสถานะ (ร่าง/รอตรวจ/อนุมัติ)** เพราะมีจุดแสดงของตัวเองอยู่แล้ว
// คิดฝั่ง client ทั้งหมดจากฟิลด์ที่ /api/posts คืนมาอยู่แล้ว — ไม่ต้องแตะ API/SQL
const BODY_FULL_CHARS = 300   // ต่ำกว่านี้ถือว่ายังเป็นโครง ไม่ใช่บทความที่เขียนจริง

const CHECKS = [
  { key: 'title', label: 'ชื่อเรื่อง',    test: (p) => !!(p.title || '').trim() },
  { key: 'body',  label: 'เนื้อหา',       test: (p) => !!(p.body || '').trim() },
  { key: 'long',  label: 'เนื้อหายาวพอ',  test: (p) => (p.body || '').trim().length >= BODY_FULL_CHARS },
  { key: 'media', label: 'สื่อแนบ',       test: (p) => Number(p.media_count) > 0 },
]

function completeness(post) {
  const missing = CHECKS.filter((c) => !c.test(post))
  const done = CHECKS.length - missing.length
  return { done, total: CHECKS.length, pct: Math.round((done / CHECKS.length) * 100), missing }
}

function fmtDateTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

const selectCls =
  'h-9 pl-3 pr-8 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal cursor-pointer'

// badge บอกที่มาของโพสต์ — ฟีดเดียวปนกันทุกแหล่ง ต้องดูออกใน 1 สายตาว่าใบไหนมาจากไหน
// 3 แหล่ง 3 สี: ดิสคอร์ด = ม่วงน้ำเงินแบบ Discord · ส่วนตัว = เขียวมะนาว · องค์กร = teal
function sourceBadge(post, orgName) {
  if (post.channel_id) {
    return {
      label: post.guild_name || 'ดิสคอร์ด',   // ชื่อเซิร์ฟเวอร์ Discord ต้นทาง
      cls: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20',
      icon: '💬',
    }
  }
  if (post.visibility === 'personal') {
    return { label: 'Personal', cls: 'bg-lime-500/10 text-lime-700 dark:text-lime-400 border border-lime-500/20' }
  }
  return { label: orgName, cls: 'bg-teal/10 text-teal border border-teal/20' }
}

// แถบความคืบหน้า — สีไล่ตามระยะ ให้กวาดตาลงคอลัมน์เดียวแล้วเห็นว่าใบไหนใกล้เส้นชัย
function ProgressBar({ pct }) {
  const tone = pct === 100 ? 'bg-teal' : pct >= 75 ? 'bg-teal' : pct >= 50 ? 'bg-orange' : 'bg-warm-300 dark:bg-disc-border'
  return (
    <div className="h-1.5 w-full rounded-full bg-warm-100 dark:bg-disc-hover overflow-hidden">
      <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function PostRow({ post, orgName, onClick, onDelete, onRestore }) {
  const excerpt = (post.body || '').replace(/\s+/g, ' ').trim()
  const archived = !!post.archived_at
  const badge = sourceBadge(post, orgName)
  const { pct, done, total, missing } = completeness(post)

  // ไฟล์ในดิสก์ (ผ่าน gate) ก่อน · ไม่มีค่อยใช้ CDN ของ Discord ซึ่งลิงก์หมดอายุได้ → error แล้วซ่อนไป
  const [thumbFailed, setThumbFailed] = useState(false)
  const thumbSrc = post.thumb_media_id ? `/api/posts/media/${post.thumb_media_id}` : (post.thumb_source_url || null)

  return (
    <div
      onClick={onClick}
      // hover ต้องอยู่ในเงื่อนไข @media(hover:hover) เท่านั้น — ถ้าไม่กัน มือถือจะเจอบั๊ก iOS Safari
      // "แตะครั้งแรกกลายเป็น hover ต้องแตะซ้ำถึงจะ click จริง" เพราะ element เดียวกันมีทั้ง onClick + :hover
      className="group cursor-pointer bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-3 [@media(hover:hover)]:hover:border-teal [@media(hover:hover)]:hover:shadow-md transition flex gap-3"
    >
      {/* ช่องรูปกว้างคงที่เสมอ แม้ไม่มีรูป — ไม่งั้นข้อความแต่ละแถวเริ่มไม่ตรงกัน กวาดตาไม่ติด */}
      <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-warm-100 dark:bg-disc-hover flex items-center justify-center">
        {thumbSrc && !thumbFailed ? (
          <img
            src={thumbSrc}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon size={20} className="text-warm-300 dark:text-disc-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-semibold text-warm-900 dark:text-disc-text truncate [@media(hover:hover)]:group-hover:text-teal transition">
            {post.title || 'ไม่มีชื่อ'}
          </h3>
          <div className="shrink-0 flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-warm-500 dark:text-disc-muted">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[post.status] || 'bg-gray-400'}`} />
              {STATUS_LABELS[post.status] || post.status}
            </span>
            <span className="text-xs text-warm-400 dark:text-disc-muted hidden sm:inline">
              {fmtDateTime(post.updated_at)}
            </span>
            {/* กดที่ปุ่มแล้วต้องไม่เปิดโพสต์ → stopPropagation
                มือถือไม่มี hover จริง — เดิม opacity-0 group-hover:opacity-100 เลยกลายเป็นปุ่มโปร่งใส
                แต่ยังกดได้ตลอด (dead zone ที่มุมขวาบนของการ์ด กินการแตะไปเงียบๆ) → โชว์ปุ่มถาวรบนมือถือ
                ซ่อนจนกว่าจะ hover เฉพาะอุปกรณ์ที่มี hover จริงเท่านั้น */}
            <button
              onClick={(e) => { e.stopPropagation(); archived ? onRestore(post) : onDelete(post) }}
              title={archived ? 'กู้คืนจากกรุ' : 'ลบโพสต์นี้'}
              className={`p-1 rounded-lg transition opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus:opacity-100 ${
                archived
                  ? 'text-warm-500 dark:text-disc-muted hover:text-teal hover:bg-warm-50 dark:hover:bg-disc-hover'
                  : 'text-warm-400 dark:text-disc-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover'
              }`}
            >
              {archived ? <RotateCcw size={15} /> : <Trash2 size={15} />}
            </button>
          </div>
        </div>

        {excerpt ? (
          <p className="text-sm text-warm-500 dark:text-disc-muted line-clamp-1">{excerpt}</p>
        ) : (
          <p className="text-sm text-warm-400 dark:text-disc-muted italic">ยังไม่มีเนื้อหา</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium max-w-[14rem] truncate ${badge.cls}`}>
            {badge.icon ? `${badge.icon} ` : ''}{badge.label}
          </span>
          {/* โพสต์จากดิสฯ: badge = ชื่อเซิร์ฟเวอร์ · ชิปนี้ = ห้องต้นทาง (คนละเรื่องกับหมวด)
              กดแล้วเด้งไป Discord — อยู่ในการ์ดที่คลิกเปิดโพสต์ ต้อง stopPropagation ไม่งั้นเปิดทั้งคู่ */}
          {post.channel_name && (
            post.guild_id && post.channel_id ? (
              <a
                href={`https://discord.com/channels/${post.guild_id}/${post.channel_id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="เปิดห้องนี้ใน Discord"
                className="px-2 py-0.5 rounded-full text-xs bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 max-w-[12rem] truncate hover:bg-indigo-500/15 hover:underline"
              >
                #{post.channel_name} ↗
              </a>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 max-w-[12rem] truncate">
                #{post.channel_name}
              </span>
            )
          )}
          {post.category && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-warm-100 dark:bg-disc-hover text-warm-600 dark:text-disc-muted">
              {post.category}
            </span>
          )}
          {post.media_count > 0 && (
            <span className="flex items-center gap-1 text-xs text-warm-500 dark:text-disc-muted">
              <ImageIcon size={12} />{post.media_count}
            </span>
          )}
          {post.published_count > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-teal/10 text-teal font-medium">เผยแพร่แล้ว</span>
          )}
          {post.queued_count > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-orange/10 text-orange font-medium">ตั้งเวลาไว้</span>
          )}
        </div>

        {/* ความสมบูรณ์ — แถบ + สิ่งที่ยังขาด (ตัวเลข % อย่างเดียวไม่บอกว่าต้องไปทำอะไรต่อ) */}
        <div className="flex items-center gap-2 mt-0.5">
          <div className="w-24 sm:w-32 shrink-0"><ProgressBar pct={pct} /></div>
          <span className={`shrink-0 text-xs font-semibold tabular-nums ${pct === 100 ? 'text-teal' : 'text-warm-600 dark:text-disc-text'}`}>
            {pct}%
          </span>
          <span className="min-w-0 text-xs text-warm-400 dark:text-disc-muted truncate">
            {missing.length === 0
              ? <span className="inline-flex items-center gap-1 text-teal"><Check size={12} />ครบแล้ว</span>
              : `${done}/${total} · ขาด ${missing.map((m) => m.label).join(' · ')}`}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function PostsHome({ orgName = 'องค์กร' }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ตัวกรองทั้งหมด (ยกเว้น createAs/idea ที่เป็น draft ชั่วคราว) เก็บใน URL query string
  // → กด back จากหน้ารายละเอียดโพสต์แล้วได้ตัวกรองเดิมกลับมา (เคาะ 2026-08-08)
  // อ่านค่าเริ่มต้นจาก query แค่ครั้งแรกตอน mount (useState lazy init) ไม่ sync กลับจาก URL อีกทีหลัง mount
  const [filter, setFilter] = useState(() => searchParams.get('filter') || 'all')       // all | personal | org | discord
  const [createAs, setCreateAs] = useState('personal') // ปลายทางของโพสต์ใหม่ (แยกจาก filter, ไม่เก็บ URL)
  // pending = ยังไม่โพสต์ (default, ตรงกับที่ API กรองให้ default อยู่แล้ว) · posted = โพสต์ครบแล้ว · archived = ในกรุ
  const [postState, setPostState] = useState(() => searchParams.get('state') || 'pending')
  const [category, setCategory] = useState(() => searchParams.get('category') || '') // '' = ทั้งหมด, '__none__' = ยังไม่จัดหมวด, อื่นๆ = ชื่อหมวด
  const [status, setStatus] = useState(() => searchParams.get('status') || '')     // '' = ทุกสถานะ
  const [sort, setSort] = useState(() => searchParams.get('sort') || 'updated') // progress = ใกล้เสร็จก่อน · updated = แก้ล่าสุด
  const [idea, setIdea] = useState('')
  const [posts, setPosts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiNotice, setAiNotice] = useState('')
  // single = โพสต์เดียว (default) · series = AI ตัดสินใจจำนวนตอนเอง (1-12) จากเนื้อหา แล้วร่างเต็มทุกตอนทันที
  // (ไม่มีช่องกรอกจำนวนตอน — user มักระบุจำนวนไว้ในเนื้อหาที่พิมพ์เองอยู่แล้ว · เคาะ 2026-08-12)
  const [composeMode, setComposeMode] = useState('single')
  // บังคับให้ฟีดโหลดใหม่แม้ตัวกรองไม่เปลี่ยน — setCategory ด้วยค่าเดิม React จะ bail out ไม่ re-render
  // (เคสจริง: สร้างซีรีส์ที่ 2 ในหมวดเดิม แล้วรายการด้านล่างไม่ขยับ ดูเหมือนไม่ได้สร้าง)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [confirmPost, setConfirmPost] = useState(null)   // โพสต์ที่กำลังถามยืนยันลบ
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // ปลายทางของโพสต์ใหม่ที่จำไว้ล่าสุด (client only) — 'discord'/'org' คือค่าจากแท็บรุ่นก่อน
  useEffect(() => {
    const saved = window.localStorage.getItem('posts_mode')
    if (saved === 'discord') { setCreateAs('org'); window.localStorage.setItem('posts_mode', 'org') }
    else if (['personal', 'org'].includes(saved)) setCreateAs(saved)
  }, [])

  const loadPosts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      // source=all = รวมของจากตะกร้าดิสฯ เข้าฟีดด้วย (default ของ API คือซ่อน)
      // ⭐ backfill = คลังกระทู้เก่า — API ซ่อนจากทุกค่าอื่นรวมทั้ง all ต้องขอตรงๆ เท่านั้น
      if (filter === 'discord') { params.set('visibility', 'org'); params.set('source', 'discord') }
      else if (filter === 'backfill') { params.set('visibility', 'org'); params.set('source', 'backfill') }
      else if (filter === 'all') params.set('source', 'all')
      else params.set('visibility', filter)

      // postState = posted/archived ต้องขอมาแบบไม่กรองทั้งคู่ก่อน ไม่งั้น default exclusion ของอีกฝั่ง
      // จะหลุดมากรองซ้ำโดยไม่ตั้งใจ (เช่น โพสต์ในกรุที่โพสต์แล้วด้วยจะหายไปจากมุมมอง "ในกรุ")
      if (postState === 'archived' || postState === 'posted') { params.set('archived', '1'); params.set('posted', '1') }
      if (category) params.set('category', category)
      if (status) params.set('status', status)

      const res = await fetch(`/api/posts?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      const rows = res.ok && json.success ? json.data : []
      const isFullyPosted = (p) => Number(p.published_count) > 0 && Number(p.queued_count) === 0
      setPosts(
        postState === 'archived' ? rows.filter(p => p.archived_at) :
        postState === 'posted'   ? rows.filter(isFullyPosted) :
        rows
      )
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [filter, postState, category, status, reloadNonce])

  const loadCategories = useCallback(async () => {
    try {
      // กรอง personal/org อยู่ = เอาเฉพาะหมวดของฝั่งนั้น ไม่งั้นชิปที่กดแล้วได้ 0 โพสต์จะโผล่มาปน
      // ⭐ backfill ก็เหมือนกัน — ต้องส่งให้ตรงกับที่ loadPosts ส่ง ไม่งั้นเลขบนชิปคนละชุดกับรายการ
      const q = ['personal', 'org'].includes(filter) ? `?visibility=${filter}`
              : filter === 'backfill' ? '?source=backfill' : ''
      const res = await fetch(`/api/posts/categories${q}`)
      const json = await res.json().catch(() => ({}))
      setCategories(res.ok && json.success ? json.data : [])
    } catch {
      setCategories([])
    }
  }, [filter, reloadNonce])

  useEffect(() => { loadPosts() }, [loadPosts])
  useEffect(() => { loadCategories() }, [loadCategories])

  // sync ตัวกรองลง URL query string — ใช้ replace (ไม่ใช่ push) กันตัวกรองแต่ละคลิกไปกองใน history
  // ไม่ sync กลับจาก URL → state (ตัวเดียว ทางเดียว: state เป็นความจริง, URL แค่สะท้อนไว้ให้ back/reload ใช้)
  useEffect(() => {
    const qs = new URLSearchParams()
    if (filter !== 'all') qs.set('filter', filter)
    if (postState !== 'pending') qs.set('state', postState)
    if (status) qs.set('status', status)
    if (category) qs.set('category', category)
    if (sort !== 'updated') qs.set('sort', sort)
    const next = qs.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [filter, postState, status, category, sort, pathname, router])

  // API เรียงตาม updated_at DESC มาแล้ว → โหมด 'updated' ใช้ตามนั้นเลย
  // โหมด 'progress': % มากก่อน แต่ **ใบที่ครบ 100% จมไปท้ายสุด** — มันจบแล้ว ไม่ใช่ของที่ต้อง focus
  const visiblePosts = useMemo(() => {
    if (sort !== 'progress') return posts
    const rank = (p) => { const { pct } = completeness(p); return pct === 100 ? -1 : pct }
    return [...posts].sort((a, b) =>
      rank(b) - rank(a) || new Date(b.updated_at) - new Date(a.updated_at)
    )
  }, [posts, sort])

  // ปิดกล่องยืนยันด้วย ESC (คู่กับปุ่ม X และคลิกนอกกล่อง)
  useEffect(() => {
    if (!confirmPost) return
    const onKey = (e) => { if (e.key === 'Escape') setConfirmPost(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmPost])

  function selectFilter(next) {
    setFilter(next)
    setCategory('')   // ชิปหมวดถูกโหลดใหม่ตาม filter — ค่าที่ค้างอยู่อาจไม่มีในชุดใหม่
  }

  function selectCreateAs(next) {
    setCreateAs(next)
    window.localStorage.setItem('posts_mode', next)
  }

  // หมวดที่กำลังเลือกอยู่ (ไม่นับ 'ทั้งหมด'/'ยังไม่จัดหมวด') ไว้ผูกกับโพสต์ใหม่/AI
  const activeCategory = category && category !== '__none__' ? category : undefined
  const createVisibility = createAs

  // ห้ามยิง POST ตรงนี้ — พาไปหน้า /posts/new แล้วให้กดบันทึกที่นั่น
  // (กฎ CLAUDE.md §กฎการบันทึก · ของเดิมกดทีไรได้ร่างเปล่าค้าง DB ทุกครั้ง)
  function handleCreateNew() {
    const qs = new URLSearchParams({ as: createVisibility })
    if (activeCategory) qs.set('category', activeCategory)
    router.push(`/posts/new?${qs.toString()}`)
  }

  // ลบ: default = เก็บเข้ากรุ (กู้คืนได้) · permanent = ลบถาวรจาก DB
  async function handleDelete(permanent) {
    if (!confirmPost) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/posts/${confirmPost.id}${permanent ? '?permanent=1' : ''}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setDeleteError(json.error || 'ลบไม่สำเร็จ'); return }
      setConfirmPost(null)
      loadPosts()
      loadCategories()
    } catch {
      setDeleteError('ลบไม่สำเร็จ')
    } finally {
      setDeleting(false)
    }
  }

  async function handleRestore(post) {
    try {
      const res = await fetch(`/api/posts/${post.id}/restore`, { method: 'POST' })
      if (res.ok) { loadPosts(); loadCategories() }
    } catch { /* กู้คืนไม่ได้ก็ยังเห็นการ์ดเดิมอยู่ ไม่ต้องเด้ง error */ }
  }

  // โยนของดิบ → AI เรียบเรียงเป็น "โพสต์เดียว" (default) แล้วพาเข้าหน้าแก้ไขเลย
  // composeMode === 'series' → AI ตัดสินใจจำนวนตอนเอง, ร่างเต็มทุกตอนทันที, กลับมาที่หน้านี้กรองตามหมวดที่ได้ (เคาะ 2026-08-12)
  async function handleAiCompose() {
    if (!idea.trim()) return
    setAiLoading(true)
    setAiError('')
    setAiNotice('')
    const isSeries = composeMode === 'series'
    try {
      const res = await fetch('/api/posts/ai/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea,
          visibility: createVisibility,
          category: activeCategory,
          ...(isSeries ? { series: true } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.success) {
        setIdea('')
        // duplicate = ข้อความนี้เคยสร้างไปแล้วเมื่อกี้ (ครั้งก่อนสำเร็จฝั่ง server แต่ response ไม่ถึงเบราว์เซอร์)
        // → พาไปดูของเดิม ไม่สร้างใหม่ · ต้องบอกให้ชัดไม่งั้น user งงว่าทำไมกดแล้วไม่มีอะไรเพิ่ม
        if (json.data.posts) {
          const name = json.data.seriesName ? `"${json.data.seriesName}" ` : ''
          setAiNotice(json.duplicate
            ? `ข้อความนี้สร้างไปแล้วเมื่อสักครู่ (${json.data.posts.length} ตอน) — แสดงของเดิมให้แทนการสร้างซ้ำ`
            : `สร้างซีรีส์ ${name}แล้ว ${json.data.posts.length} ตอน ในหมวด "${json.data.category || 'ไม่ระบุ'}"`)
          // ตัวกรอง "แหล่ง" ต้องตรงกับที่เพิ่งสร้าง ไม่งั้นดูอยู่ฝั่ง personal แต่สร้างเข้า org = ฟีดว่างทั้งที่สร้างสำเร็จ
          if (filter !== 'all' && filter !== createVisibility) setFilter(createVisibility)
          setCategory(json.data.category || '__none__')
          setReloadNonce(n => n + 1)   // การันตีว่าโหลดใหม่แม้หมวด/แหล่งเดิมเป๊ะ
        } else {
          router.push(`/posts/${json.data.post.id}`)
        }
      } else {
        // ล้มเหลวห้ามล้างข้อความในกล่อง
        setAiError(json.error || 'ให้ AI เรียบเรียงไม่สำเร็จ')
      }
    } catch {
      // ส่วนใหญ่คือ request ใช้เวลานานจนถูกตัดกลางทาง — งานฝั่ง server อาจสำเร็จไปแล้ว
      // บอกให้กดซ้ำได้เลย ระบบกันซ้ำให้ (route เช็ค source_idea ย้อนหลัง 15 นาที)
      setAiError('การเชื่อมต่อหลุดระหว่างรอ AI — กดปุ่มเดิมซ้ำได้เลย ระบบจะไม่สร้างโพสต์ซ้ำให้')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">โพสต์</h1>
        <p className="text-base text-warm-500 dark:text-disc-muted">โยนความคิดดิบๆ ให้ AI เรียบเรียงเป็นโพสต์ แล้วเขียนต่อจนพร้อมเผยแพร่</p>
      </div>

      {/* กล่องโยนไอเดีย — ซ่อนตอนกำลังดู "โพสต์แล้ว"/"ในกรุ" เพราะเป็นมุมมองย้อนดู ไม่ใช่ที่สร้างของใหม่ */}
      {postState === 'pending' && (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
          {/* ปลายทาง + จำนวนตอน อยู่แถวเดียวกัน — แยกกลุ่มด้วย "·" ไม่ใช่คนละแถว (เคาะ 2026-08-12 ลดความรก) */}
          <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
            <div className="inline-flex rounded-lg border border-warm-200 dark:border-disc-border overflow-hidden">
              {[['personal', 'ส่วนตัว'], ['org', orgName]].map(([v, label], i) => (
                <button
                  key={v}
                  onClick={() => selectCreateAs(v)}
                  className={`px-3 py-1 text-sm font-medium transition-colors max-w-[12rem] truncate ${
                    i > 0 ? 'border-l border-warm-200 dark:border-disc-border' : ''
                  } ${
                    createAs === v
                      ? 'bg-teal text-white'
                      : 'bg-card-bg text-warm-700 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className="text-warm-300 dark:text-disc-border">·</span>

            {/* single = โพสต์เดียว (default) · series = user ระบุจำนวนตอนเอง แล้ว AI ร่างเต็มทุกตอนทันที */}
            <div className="inline-flex rounded-lg border border-warm-200 dark:border-disc-border overflow-hidden">
              {[['single', '1 ตอน'], ['series', 'Series']].map(([v, label], i) => (
                <button
                  key={v}
                  onClick={() => setComposeMode(v)}
                  className={`px-3 py-1 text-sm font-medium transition-colors ${
                    i > 0 ? 'border-l border-warm-200 dark:border-disc-border' : ''
                  } ${
                    composeMode === v
                      ? 'bg-teal text-white'
                      : 'bg-card-bg text-warm-700 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {activeCategory && (
              <span className="text-warm-500 dark:text-disc-muted">
                · หมวด <span className="font-medium text-warm-700 dark:text-disc-text">{activeCategory}</span>
              </span>
            )}
          </div>
          <br></br>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder={
              composeMode === 'series'
                ? 'พิมพ์รัวๆ หรือวางบทความยาว — AI จะแบ่งเป็นหลายตอนให้เอง (ระบุจำนวนตอนในเนื้อหาได้เลยถ้าต้องการ)'
                : 'พิมพ์รัวๆ ไม่ต้องเรียบเรียง หรือวางบทความยาวที่เขียนไว้ — AI จะสรุปให้เป็นโพสต์เดียว'
            }
            rows={4}
            className="w-full px-3 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal resize-none"
          />

          {aiError && <p className="text-sm text-red-500 dark:text-red-400 mt-2">{aiError}</p>}
          {aiNotice && <p className="text-sm text-teal mt-2">{aiNotice}</p>}
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <button
              onClick={handleAiCompose}
              disabled={aiLoading || !idea.trim()}
              className="flex items-center gap-1.5 bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2 disabled:opacity-50"
            >
              <Sparkles size={16} />
              {aiLoading
                ? 'กำลังเรียบเรียง...'
                : composeMode === 'series' ? 'AI แบ่งเป็นซีรีส์ →' : 'AI เรียบเรียงเป็นโพสต์ →'}
            </button>
            {/* ปุ่มรอง — ไม่ใช้ข้อความในกล่อง จึงลดระดับให้ไม่อ่านเหมือนสองทางเลือกที่เท่ากัน */}
            <button
              onClick={handleCreateNew}
              className="text-base text-warm-500 dark:text-disc-muted underline underline-offset-4 hover:text-teal"
            >
              สร้างโพสต์เปล่า
            </button>
          </div>
        </div>
      )}

      {/* ตัวกรอง — แหล่ง / สถานะ / ระยะ(ยังไม่โพสต์-โพสต์แล้ว-ในกรุ) / หมวด · dropdown แถวเดียว
          (ชิป 3 แถวรกเกินไป — user เคาะ 2026-07-30 · postState เดิมเป็นปุ่มมุมมองพิเศษแยก ย้ายมารวมเป็น
          dropdown ตัวที่ 4 แทน — user เคาะ 2026-08-08 จะได้ผสมกับตัวกรองอื่นได้ เช่น โพสต์แล้ว+หมวด X) */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={filter} onChange={(e) => selectFilter(e.target.value)} className={selectCls}>
          {/* ⚠️ ห้ามตั้งชื่อว่า "ทุกแหล่ง" — มันไม่รวม 📚 กระทู้เก่านำเข้า (user ทักถูก 2026-08-28)
              4 ตัวแรก = มุมมองของ "งานปัจจุบัน" · ตัวสุดท้าย = คลังของเก่า คนละแกนกัน ไม่ใช่ subset */}
          <option value="all">งานปัจจุบัน</option>
          <option value="personal">ส่วนตัว</option>
          <option value="org">{orgName}</option>
          <option value="discord">💬 จากดิสคอร์ด</option>
          <option value="backfill">📚 กระทู้เก่านำเข้า</option>
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>

        <select value={postState} onChange={(e) => setPostState(e.target.value)} className={selectCls}>
          <option value="pending">ยังไม่โพสต์</option>
          <option value="posted">✅ โพสต์แล้ว</option>
          <option value="archived">🗄️ ในกรุ</option>
        </select>

        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
          <option value="">ทุกหมวด</option>
          <option value="__none__">ยังไม่จัดหมวด</option>
          {categories.map((c) => (
            <option key={c.category} value={c.category}>{c.category} ({c.post_count})</option>
          ))}
        </select>

        {/* ตัวกรองที่ค้างอยู่มองไม่เห็นเท่าชิป → ต้องมีทางล้างทีเดียวให้เห็นชัด */}
        {(filter !== 'all' || status || category || postState !== 'pending') && (
          <button
            onClick={() => { setFilter('all'); setStatus(''); setCategory(''); setPostState('pending') }}
            className="text-sm text-warm-500 dark:text-disc-muted underline underline-offset-4 hover:text-teal"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* หัวรายการ + ตัวเรียง */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">
          {loading ? 'กำลังโหลด...' : `${posts.length} โพสต์`}
        </h2>
        <div className="inline-flex rounded-lg border border-warm-200 dark:border-disc-border overflow-hidden">
          {[['progress', 'ใกล้เสร็จก่อน'], ['updated', 'แก้ล่าสุด']].map(([v, label], i) => (
            <button
              key={v}
              onClick={() => setSort(v)}
              className={`px-3 py-1 text-sm font-medium transition-colors ${
                i > 0 ? 'border-l border-warm-200 dark:border-disc-border' : ''
              } ${
                sort === v
                  ? 'bg-teal text-white'
                  : 'bg-card-bg text-warm-700 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* การ์ดโพสต์ */}
      {loading ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-10 text-center text-warm-400 dark:text-disc-muted">
          กำลังโหลด...
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-10 text-center text-warm-400 dark:text-disc-muted">
          {postState === 'archived'
            ? 'ไม่มีโพสต์ในกรุ'
            : postState === 'posted'
              ? 'ยังไม่มีโพสต์ที่เผยแพร่ครบทุกช่องทาง'
              : filter === 'discord'
                ? 'ยังไม่มีสื่อที่หย่อนจากดิสคอร์ด'
                : 'ยังไม่มีโพสต์ — โยนไอเดียแล้วเริ่มเขียนได้เลย'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visiblePosts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              orgName={orgName}
              onClick={() => router.push(`/posts/${post.id}`)}
              onDelete={(p) => { setDeleteError(''); setConfirmPost(p) }}
              onRestore={handleRestore}
            />
          ))}
        </div>
      )}

      {/* ยืนยันลบ — ปิดได้ 3 ทาง: ปุ่ม X · ESC · คลิกนอกกล่อง */}
      {confirmPost && (
        <div
          onClick={() => setConfirmPost(null)}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 w-full max-w-md flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">ลบโพสต์</h2>
              <button
                onClick={() => setConfirmPost(null)}
                className="p-1 rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-base text-warm-700 dark:text-disc-text break-words">
              “{confirmPost.title || 'ไม่มีชื่อ'}”
            </p>
            <p className="text-sm text-warm-500 dark:text-disc-muted">
              เก็บเข้ากรุแล้วกู้คืนได้ที่ “ในกรุ” ท้ายหัวรายการ · ลบถาวรคือหายจากฐานข้อมูลจริง เอากลับไม่ได้
            </p>

            {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}

            <div className="flex flex-wrap gap-2 justify-end mt-1">
              <button
                onClick={() => setConfirmPost(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => handleDelete(true)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg border border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover disabled:opacity-50"
              >
                ลบถาวร
              </button>
              <button
                onClick={() => handleDelete(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? 'กำลังลบ...' : 'เก็บเข้ากรุ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
