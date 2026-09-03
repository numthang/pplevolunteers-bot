'use client'

// การ์ด "รายละเอียด" คอลัมน์ขวา — หมวด / ห้องต้นทาง / สถานะ / เจ้าของ / การมองเห็น
// แยกออกมาจาก PostMediaPanel ตอนยุบหน้าตะกร้าสื่อ (2026-07-30): แผงสื่อย้ายลงล่างกว้าง 100%
// แต่ข้อมูลพวกนี้ยังต้องอยู่ข้างบนคู่กับการ์ด "เผยแพร่"
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Users, Send, ThumbsUp, Undo2, Pencil, X } from 'lucide-react'
import CategoryPicker from './CategoryPicker.jsx'
// ⭐ ผู้รับผิดชอบงานสื่อ (เฟส C 2026-09-03) — ลอก block เดียวกับหน้าเคส (CaseMetaEditor.jsx)
//    picker ตัวเดียวกับการ์ด kanban · ค้นคนใน org ผ่าน /api/kanban/people ตัวเดิม
//    t ของกล่องนี้ต้องมาจาก namespace 'kanban' เพราะ string ภายในกล่องอยู่ที่นั่น
import TagCombobox from '@/components/kanban/TagCombobox.jsx'

const STATUS_LABEL = { draft: 'ฉบับร่าง', review: 'รอตรวจ', approved: 'อนุมัติแล้ว' }
const OUTLINE = 'border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'

export default function PostMetaPanel({ id }) {
  const t = useTranslations('posts.meta')
  const tk = useTranslations('kanban')   // string ภายใน TagCombobox (ผู้รับผิดชอบ) อยู่ namespace นี้
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [post, setPost] = useState(null)
  const [can, setCan] = useState({})
  const [assignees, setAssignees] = useState([])
  const [assignError, setAssignError] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [promoteLoading, setPromoteLoading] = useState(false)
  const [promoteError, setPromoteError] = useState('')
  const [allCategories, setAllCategories] = useState([])  // หมวดที่เคยใช้ — เลือกซ้ำแทนพิมพ์ใหม่
  const [canManageCategories, setCanManageCategories] = useState(false)  // จาก GET /api/posts/categories — media team ขึ้นไปถึงจะรีเนม/ลบหมวดได้
  const [renameOpen, setRenameOpen] = useState(false)     // กล่องแก้ไข/ลบชื่อหมวดทั้งกอง (มีผลกับทุกโพสต์ที่ใช้หมวดนี้ ไม่ใช่แค่ใบนี้)
  const [renameTo, setRenameTo] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/posts/${id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(data.error || 'โหลดโพสต์ไม่สำเร็จ'); setLoading(false); return }
      setPost(data.data.post)
      setCan(data.data.can || {})
      setAssignees(data.data.assignees || [])
    } catch {
      setLoadError('โหลดโพสต์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  // หมวดที่เคยใช้ในองค์กร — ไว้ให้เลือกซ้ำแทนพิมพ์ใหม่ (ตั้งชื่อใหม่เองก็ยังได้)
  async function loadCategories() {
    try {
      const res = await fetch('/api/posts/categories')
      const json = await res.json().catch(() => ({}))
      setAllCategories((json.data || []).map(c => c.category).filter(Boolean))
      setCanManageCategories(!!json.canManage)
    } catch { /* เลือกหมวดยังพิมพ์เองได้ แค่ไม่มีลิสต์เดิมให้เลือกซ้ำ */ }
  }
  useEffect(() => { loadCategories() }, [])

  /** ค้นคนใน org ให้ picker ผู้รับผิดชอบ — endpoint เดิมที่หน้าเคสกับการ์ด kanban ใช้ */
  const searchPeople = useCallback(async (q) => {
    if (!q || q.trim().length < 2) return []
    const res = await fetch(`/api/kanban/people?q=${encodeURIComponent(q.trim())}`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.people || []).map((p) => ({
      id: String(p.userId), name: p.name, sub: p.username ? `@${p.username}` : null,
    }))
  }, [])

  /**
   * combobox ส่ง "ชุดใหม่ทั้งชุด" มา แต่ API มีแค่เพิ่ม/ถอดทีละคน → ยิงตาม diff
   * (ทรงเดียวกับ commitAssignees ใน CaseMetaEditor.jsx) ผ่าน /api/posts/[id]/assign
   * ซึ่ง sync การ์ด kanban + audit ให้แล้วที่ lib/postAssign.js
   */
  async function commitAssignees(ids) {
    setAssignError('')
    const before = new Set(assignees.map((a) => String(a.user_id)))
    const after = new Set(ids.map(String))
    const added = [...after].filter((x) => !before.has(x))
    const removed = [...before].filter((x) => !after.has(x))
    try {
      for (const [list, method] of [[added, 'POST'], [removed, 'DELETE']]) {
        for (const uid of list) {
          const res = await fetch(`/api/posts/${id}/assign`, {
            method, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: Number(uid) }),
          })
          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            setAssignError(d.error || t('assignFailed'))
            return
          }
        }
      }
      load()
    } catch {
      setAssignError(t('assignFailed'))
    }
  }

  // กล่องแก้ไข/ลบชื่อหมวด — ปิดได้ 3 ทาง เหมือนกล่องอื่นในแอปนี้
  useEffect(() => {
    if (!renameOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setRenameOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [renameOpen])

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

  function openRenameCategory() {
    if (!post.category) return
    setRenameError('')
    setRenameTo('')
    setRenameOpen(true)
  }

  // เปลี่ยนชื่อ/ลบหมวดทั้งกอง — มีผลกับ "ทุกโพสต์" ที่ใช้หมวดนี้ ไม่ใช่แค่ใบนี้ (ต่างจาก applyCategory ข้างบน)
  async function handleRenameCategory() {
    const from = post.category
    if (!from || renaming) return
    setRenaming(true)
    setRenameError('')
    try {
      const res = await fetch('/api/posts/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: renameTo.trim() || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setRenameError(json.error || 'เปลี่ยนชื่อหมวดไม่สำเร็จ'); return }
      setRenameOpen(false)
      // endpoint นี้เขียน DB ตรงไม่ผ่าน lockToken (ไม่บัมพ์ updated_at) — ต้องบอก editor ฝั่งซ้ายเองว่าเปลี่ยนแล้ว
      // ไม่งั้น autosave ครั้งถัดไปจะ PATCH ทับด้วยชื่อหมวดเก่าที่ยังค้างอยู่ใน state ของมัน
      applyCategory(renameTo.trim() || '')
      loadCategories()
    } catch {
      setRenameError('เปลี่ยนชื่อหมวดไม่สำเร็จ')
    } finally {
      setRenaming(false)
    }
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
            <div className="flex items-center gap-1 min-w-0">
              <CategoryPicker
                value={post.category || ''}
                onChange={applyCategory}
                categories={allCategories}
                className="min-w-0 max-w-full h-8 px-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
              />
              {/* แก้ไข/ลบชื่อหมวดทั้งกอง — มีผลกับทุกโพสต์ที่ใช้หมวดนี้ ไม่ใช่แค่ใบนี้ (เฉพาะทีมสื่อขึ้นไป) */}
              {canManageCategories && post.category && (
                <button
                  onClick={openRenameCategory}
                  title="แก้ไข/ลบชื่อหมวด (มีผลกับทุกโพสต์ที่ใช้หมวดนี้)"
                  className="shrink-0 p-1 rounded text-warm-400 dark:text-disc-muted hover:text-teal"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
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
          <span className="text-warm-500 dark:text-disc-muted">{t('creatorLabel')}</span>
          <span className="text-warm-900 dark:text-disc-text">{post.creator_name || '—'}</span>
        </div>

        {/* ⛔ ร่างส่วนตัวไม่มีแถวนี้เลย — ไม่ใช่ "ว่าง" แต่เป็นของที่ยังไม่ใช่งานของทีม
            (ฝั่ง API ก็ปฏิเสธ 400 ถ้ายิงมา — ดู lib/postAssign.js) */}
        {post.visibility === 'org' && (
          <div className="flex justify-between gap-3">
            <span className="text-warm-500 dark:text-disc-muted shrink-0">{t('assigneesLabel')}</span>
            {can.assign ? (
              <div className="min-w-0 flex-1">
                <TagCombobox
                  type="multi_select"
                  numericIds={false}
                  source={{ mode: 'search', search: searchPeople }}
                  placeholder={t('noAssignees')}
                  value={assignees.map((a) => ({ id: String(a.user_id), name: a.name }))}
                  onCommit={commitAssignees}
                  onError={setAssignError}
                  t={tk}
                />
              </div>
            ) : (
              <span className={`text-right ${assignees.length === 0 ? 'text-warm-500 dark:text-disc-muted' : 'text-warm-900 dark:text-disc-text'}`}>
                {assignees.length === 0 ? t('noAssignees') : assignees.map((a) => a.name).join(', ')}
              </span>
            )}
          </div>
        )}
        {assignError && <p className="text-sm text-red-500">{assignError}</p>}
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

      {/* แก้ไข/ลบชื่อหมวดทั้งกอง — ปิดได้ 3 ทาง เหมือนกล่องอื่นในแอปนี้ */}
      {renameOpen && (
        <div
          onClick={() => setRenameOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 w-full max-w-md flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">แก้ไข/ลบชื่อหมวด “{post.category}”</h2>
              <button
                onClick={() => setRenameOpen(false)}
                className="p-1 rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-warm-500 dark:text-disc-muted">
              มีผลกับทุกโพสต์ที่ใช้หมวดนี้ ไม่ใช่แค่ใบนี้ · ตั้งชื่อซ้ำกับหมวดที่มีอยู่แล้ว = รวมเป็นหมวดเดียวกัน · เว้นชื่อใหม่ว่าง = ลบหมวดนี้ทิ้ง (โพสต์กลายเป็น "ยังไม่จัดหมวด")
            </p>

            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">ชื่อใหม่ (เว้นว่าง = ลบหมวด)</label>
              <input
                autoFocus
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                placeholder="พิมพ์ชื่อใหม่ หรือเว้นว่างไว้"
                className="w-full h-10 px-3 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>

            {renameError && <p className="text-sm text-red-500">{renameError}</p>}

            <div className="flex flex-wrap gap-2 justify-end mt-1">
              <button
                onClick={() => setRenameOpen(false)}
                disabled={renaming}
                className="px-4 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleRenameCategory}
                disabled={renaming}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-50"
              >
                {renaming && <Loader2 size={14} className="animate-spin" />}
                {renaming ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
