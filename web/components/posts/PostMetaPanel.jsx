'use client'

// การ์ด "รายละเอียด" คอลัมน์ขวา — หมวด / ห้องต้นทาง / สถานะ / เจ้าของ / การมองเห็น
// แยกออกมาจาก PostMediaPanel ตอนยุบหน้าตะกร้าสื่อ (2026-07-30): แผงสื่อย้ายลงล่างกว้าง 100%
// แต่ข้อมูลพวกนี้ยังต้องอยู่ข้างบนคู่กับการ์ด "เผยแพร่"
import { useEffect, useState } from 'react'
import { Loader2, Users, Send, ThumbsUp, Undo2 } from 'lucide-react'

const STATUS_LABEL = { draft: 'ฉบับร่าง', review: 'รอตรวจ', approved: 'อนุมัติแล้ว' }
const NEW_CATEGORY = ' new'   // ค่าพิเศษของ <option> "หมวดใหม่" — ห้ามชนชื่อหมวดจริง
const OUTLINE = 'border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'

export default function PostMetaPanel({ id }) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [post, setPost] = useState(null)
  const [can, setCan] = useState({})
  const [statusBusy, setStatusBusy] = useState(false)
  const [promoteLoading, setPromoteLoading] = useState(false)
  const [promoteError, setPromoteError] = useState('')
  const [allCategories, setAllCategories] = useState([])  // หมวดที่เคยใช้ — เลือกซ้ำแทนพิมพ์ใหม่
  const [newCategory, setNewCategory] = useState(false)   // สลับ select → ช่องพิมพ์ชื่อหมวดใหม่

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/posts/${id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(data.error || 'โหลดโพสต์ไม่สำเร็จ'); setLoading(false); return }
      setPost(data.data.post)
      setCan(data.data.can || {})
    } catch {
      setLoadError('โหลดโพสต์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  // หมวดที่เคยใช้ในองค์กร — ไว้ให้เลือกซ้ำแทนพิมพ์ใหม่ (ตั้งชื่อใหม่เองก็ยังได้)
  useEffect(() => {
    fetch('/api/posts/categories')
      .then(res => (res.ok ? res.json() : { data: [] }))
      .then(json => setAllCategories((json.data || []).map(c => c.category).filter(Boolean)))
      .catch(() => {})
  }, [])

  // สถานะ/หมวดเปลี่ยนจากคอลัมน์ซ้าย (PostEditor) — sync โดยไม่ต้องรีโหลดทั้งก้อน
  // ยกเว้นสถานะ: `can` เปลี่ยนตามสถานะด้วย (approved = แก้ไม่ได้) → ต้องโหลดใหม่ ปุ่มถึงจะถูกชุด
  useEffect(() => {
    function onChanged(e) {
      if (e.detail?.id !== id) return
      if (e.detail?.status) { setStatusBusy(false); load(); return }
      if ('category' in (e.detail || {})) setPost(prev => (prev ? { ...prev, category: e.detail.category } : prev))
    }
    window.addEventListener('posts:changed', onChanged)
    return () => window.removeEventListener('posts:changed', onChanged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ปุ่มสถานะอยู่ที่นี่ แต่คนยิง API คือ PostEditor (มันถือ lockToken และต้องรีโหลด token หลังเปลี่ยน)
  function requestStatus(to) {
    setStatusBusy(true)
    window.dispatchEvent(new CustomEvent('posts:request-status', { detail: { id, status: to } }))
    // กันปุ่มค้างหมุนถ้า editor ยิงไม่สำเร็จ (error โชว์ฝั่ง editor)
    setTimeout(() => setStatusBusy(false), 8000)
  }

  // แก้หมวด — **ห้าม PATCH เอง** ทุก PATCH bump updated_at → lockToken ของ PostEditor หมดอายุ
  // แล้ว autosave ฝั่งซ้ายจะเด้ง 409 ทันที (bug-071) → ส่งค่าไปให้ editor เซฟด้วย token ของมันแทน
  function applyCategory(value) {
    setPost(prev => (prev ? { ...prev, category: value } : prev))   // optimistic — ค่าจริงกลับมาทาง posts:changed
    window.dispatchEvent(new CustomEvent('posts:set-category', { detail: { id, category: value } }))
  }

  async function handlePromote() {
    if (!confirm('เปิดร่างนี้ให้ทีมเห็น? ย้อนกลับเป็นส่วนตัวไม่ได้อีก')) return
    setPromoteLoading(true)
    setPromoteError('')
    try {
      const res = await fetch(`/api/posts/${id}/promote`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setPromoteError(data.error || 'เปิดให้ทีมเห็นไม่สำเร็จ'); return }
      setPost(data.data.post)
      load() // can.promote คำนวณจาก visibility ใหม่ — โหลดใหม่ให้ตรง
    } catch {
      setPromoteError('เปิดให้ทีมเห็นไม่สำเร็จ')
    } finally {
      setPromoteLoading(false)
    }
  }

  if (loading) return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  if (loadError) return <p className="text-red-500 text-sm">{loadError}</p>
  if (!post) return null

  // ชื่อปุ่มบอกผลที่จะเกิด ไม่ใช่การร้องขอ · แต่ละสถานะมีทางไปไม่เกิน 2 ทาง
  const statusActions = [
    post.status === 'draft'    && can.edit           && { to: 'review',   label: 'ส่งตรวจ',       icon: <Send size={14} />,     className: 'bg-orange text-white hover:opacity-90' },
    post.status === 'review'   && can.approve        && { to: 'approved', label: 'อนุมัติ',       icon: <ThumbsUp size={14} />, className: 'bg-teal text-white hover:opacity-90' },
    // ส่งตรวจแล้วถอนกลับมาแก้เองได้ — API อนุญาตผ่าน canWritePost อยู่แล้ว
    post.status === 'review'   && can.edit           && { to: 'draft',    label: 'ถอนกลับมาแก้',  icon: <Undo2 size={14} />,    className: OUTLINE },
    post.status === 'approved' && can.requestChanges && { to: 'draft',    label: 'กลับไปแก้',     icon: <Undo2 size={14} />,    className: OUTLINE },
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 text-sm">
        {/* หมวด = ที่เดียวในหน้านี้ที่แก้ได้ (เดิมมี input ในคอลัมน์ซ้ายด้วย = ซ้ำซ้อน)
            "ยังไม่จัดหมวด" ในลิสต์ทำหน้าที่ปุ่ม "ล้าง" เดิม จึงไม่ต้องมีปุ่มแยก */}
        <div className="flex justify-between items-center gap-2">
          <span className="text-warm-500 dark:text-disc-muted shrink-0">หมวด</span>
          {can.edit ? (
            newCategory ? (
              <input
                autoFocus
                value={post.category || ''}
                onChange={e => applyCategory(e.target.value)}
                onBlur={() => setNewCategory(false)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setNewCategory(false) }}
                placeholder="ชื่อหมวดใหม่"
                className="min-w-0 flex-1 max-w-[60%] h-8 px-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
              />
            ) : (
              <select
                value={post.category || ''}
                onChange={e => {
                  if (e.target.value === NEW_CATEGORY) { applyCategory(''); setNewCategory(true); return }
                  applyCategory(e.target.value)
                }}
                className="min-w-0 max-w-[60%] h-8 pl-2 pr-7 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal cursor-pointer"
              >
                <option value="">ยังไม่จัดหมวด</option>
                {/* ต้องมีหมวดปัจจุบันในลิสต์เสมอ — หมวดที่เพิ่งตั้งชื่อใหม่ยังไม่อยู่ใน /categories
                    (ไม่งั้นพอกลับมาเป็น select แล้ว value ไม่ตรง option ไหนเลย → โชว์ว่าง) */}
                {[...new Set([...allCategories, post.category].filter(Boolean))].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value={NEW_CATEGORY}>+ หมวดใหม่…</option>
              </select>
            )
          ) : (
            <span className="text-warm-900 dark:text-disc-text truncate">{post.category || 'ยังไม่จัดหมวด'}</span>
          )}
        </div>
        {/* ห้องต้นทาง — อ่านอย่างเดียว ระบบตั้งให้ ไม่ใช่ของที่คนแก้ (ต่างจากหมวดข้างบน) */}
        {post.channel_name && (
          <div className="flex justify-between gap-2">
            <span className="text-warm-500 dark:text-disc-muted shrink-0">ห้องต้นทาง</span>
            {post.guild_id && post.channel_id ? (
              <a
                href={`https://discord.com/channels/${post.guild_id}/${post.channel_id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="เปิดห้องนี้ใน Discord"
                className="text-indigo-600 dark:text-indigo-400 hover:underline truncate"
              >
                #{post.channel_name} ↗
              </a>
            ) : (
              <span className="text-warm-900 dark:text-disc-text truncate">#{post.channel_name}</span>
            )}
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-warm-500 dark:text-disc-muted">สถานะ</span>
          <span className="text-warm-900 dark:text-disc-text">{STATUS_LABEL[post.status] || post.status}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-warm-500 dark:text-disc-muted">เจ้าของ</span>
          <span className="text-warm-900 dark:text-disc-text">{post.owner_name || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-warm-500 dark:text-disc-muted">การมองเห็น</span>
          <span className="text-warm-900 dark:text-disc-text">{post.visibility === 'org' ? 'องค์กร' : 'ส่วนตัว'}</span>
        </div>
      </div>

      {/* แถวปุ่มของการ์ดนี้ — รวมไว้ที่เดียวใต้เส้นคั่น ห้ามแทรกกลางแถว label/value ข้างบน (ดูรก)
          ⚠️ ปุ่มสถานะ **ห้ามยิง /status เอง** — มัน bump updated_at ทำให้ lockToken ของ PostEditor
          หมดอายุ → autosave เด้ง 409 (bug-071) · ส่ง event ให้ editor ยิงแล้วรีโหลด token เอง
          เหมือนที่ทำกับ "หมวด" */}
      {(statusActions.length > 0 || can.promote) && (
        <div className="pt-3 border-t border-warm-200 dark:border-disc-border flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {statusActions.map(a => (
              <button
                key={a.to + a.label}
                onClick={() => requestStatus(a.to)}
                disabled={statusBusy}
                className={`flex-1 min-w-[45%] flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg disabled:opacity-40 transition ${a.className}`}
              >
                {statusBusy ? <Loader2 size={14} className="animate-spin" /> : a.icon}
                {a.label}
              </button>
            ))}
            {can.promote && (
              <button
                onClick={handlePromote}
                disabled={promoteLoading}
                className={`flex-1 min-w-[45%] flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg disabled:opacity-40 transition ${OUTLINE}`}
              >
                {promoteLoading ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                เปิดให้ทีมเห็น
              </button>
            )}
          </div>
          {promoteError && <p className="text-sm text-red-500">{promoteError}</p>}
        </div>
      )}
    </div>
  )
}
