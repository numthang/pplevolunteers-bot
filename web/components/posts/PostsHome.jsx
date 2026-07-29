'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Image as ImageIcon, Trash2, RotateCcw, X } from 'lucide-react'

const STATUS_LABELS = { draft: 'ร่าง', review: 'รอตรวจ', approved: 'อนุมัติแล้ว' }
const STATUS_DOT = { draft: 'bg-gray-400', review: 'bg-amber-500', approved: 'bg-green-500' }

function fmtDateTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

function PostCard({ post, onClick, onDelete, onRestore }) {
  const excerpt = (post.body || '').replace(/\s+/g, ' ').trim()
  const archived = !!post.archived_at
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4 hover:border-teal hover:shadow-md transition flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text line-clamp-1">
          {post.title || 'ไม่มีชื่อ'}
        </h3>
        <div className="shrink-0 flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-warm-500 dark:text-disc-muted">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[post.status] || 'bg-gray-400'}`} />
            {STATUS_LABELS[post.status] || post.status}
          </span>
          {/* กดที่ปุ่มแล้วต้องไม่เปิดโพสต์ → stopPropagation */}
          <button
            onClick={(e) => { e.stopPropagation(); archived ? onRestore(post) : onDelete(post) }}
            title={archived ? 'กู้คืนจากกรุ' : 'ลบโพสต์นี้'}
            className={`p-1 rounded-lg transition opacity-0 group-hover:opacity-100 focus:opacity-100 ${
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
        <p className="text-sm text-warm-500 dark:text-disc-muted line-clamp-2">{excerpt}</p>
      ) : (
        <p className="text-sm text-warm-400 dark:text-disc-muted italic">ยังไม่มีเนื้อหา</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-1">
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

      <p className="text-xs text-warm-400 dark:text-disc-muted mt-1">แก้ล่าสุด {fmtDateTime(post.updated_at)}</p>
    </div>
  )
}

export default function PostsHome() {
  const router = useRouter()

  const [mode, setMode] = useState('personal')
  const [category, setCategory] = useState('') // '' = ทั้งหมด, '__none__' = ยังไม่จัดหมวด, อื่นๆ = ชื่อหมวด
  const [idea, setIdea] = useState('')
  const [posts, setPosts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [confirmPost, setConfirmPost] = useState(null)   // โพสต์ที่กำลังถามยืนยันลบ
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // โหลด mode ที่จำไว้ล่าสุดจาก localStorage (client only)
  useEffect(() => {
    const saved = window.localStorage.getItem('posts_mode')
    if (saved === 'personal' || saved === 'org') setMode(saved)
  }, [])

  const loadPosts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ visibility: mode })
      if (category) params.set('category', category)
      if (showArchived) params.set('archived', '1')      // API คืน "รวมของในกรุ" → กรองเหลือเฉพาะในกรุที่นี่
      const res = await fetch(`/api/posts?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      const rows = res.ok && json.success ? json.data : []
      setPosts(showArchived ? rows.filter(p => p.archived_at) : rows)
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [mode, category, showArchived])

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/posts/categories')
      const json = await res.json().catch(() => ({}))
      setCategories(res.ok && json.success ? json.data : [])
    } catch {
      setCategories([])
    }
  }, [])

  useEffect(() => { loadPosts() }, [loadPosts])
  useEffect(() => { loadCategories() }, [loadCategories])

  // ปิดกล่องยืนยันด้วย ESC (คู่กับปุ่ม X และคลิกนอกกล่อง)
  useEffect(() => {
    if (!confirmPost) return
    const onKey = (e) => { if (e.key === 'Escape') setConfirmPost(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmPost])

  function selectMode(next) {
    setMode(next)
    setCategory('')
    window.localStorage.setItem('posts_mode', next)
  }

  // หมวดที่กำลังเลือกอยู่ (ไม่นับ 'ทั้งหมด'/'ยังไม่จัดหมวด') ไว้ผูกกับโพสต์ใหม่/AI
  const activeCategory = category && category !== '__none__' ? category : undefined

  async function handleCreateNew() {
    setCreating(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: mode, category: activeCategory }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.success) {
        router.push(`/posts/${json.data.id}`)
      } else {
        alert(json.error || 'สร้างโพสต์ไม่สำเร็จ')
      }
    } catch {
      alert('สร้างโพสต์ไม่สำเร็จ')
    } finally {
      setCreating(false)
    }
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

  async function handleAiOutline() {
    if (!idea.trim()) return
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch('/api/posts/ai/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea, visibility: mode, category: activeCategory }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.success) {
        setIdea('')
        loadPosts()
        loadCategories()
      } else {
        // ล้มเหลวห้ามล้างข้อความในกล่อง
        setAiError(json.error || 'ให้ AI จัดชุดโพสต์ไม่สำเร็จ')
      }
    } catch {
      setAiError('ให้ AI จัดชุดโพสต์ไม่สำเร็จ')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">โพสต์</h1>
        <p className="text-base text-warm-500 dark:text-disc-muted">โยนไอเดีย ให้ AI ช่วยจัดชุด แล้วเขียนต่อจนพร้อมเผยแพร่</p>
      </div>

      {/* แท็บ ส่วนตัว/องค์กร */}
      <div className="inline-flex rounded-lg border border-warm-200 dark:border-disc-border overflow-hidden">
        <button
          onClick={() => selectMode('personal')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'personal'
              ? 'bg-teal text-white'
              : 'bg-card-bg text-warm-700 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
          }`}
        >
          ส่วนตัว
        </button>
        <button
          onClick={() => selectMode('org')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-l border-warm-200 dark:border-disc-border ${
            mode === 'org'
              ? 'bg-teal text-white'
              : 'bg-card-bg text-warm-700 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
          }`}
        >
          องค์กร
        </button>
      </div>

      {/* กล่องโยนไอเดีย */}
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="โยนหัวข้อ/ไอเดีย หรือวางบทความยาวที่เขียนไว้"
          rows={4}
          className="w-full px-3 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal resize-none"
        />
        {aiError && <p className="text-sm text-red-500 dark:text-red-400 mt-2">{aiError}</p>}
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={handleCreateNew}
            disabled={creating}
            className="border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-base font-medium px-4 py-2 disabled:opacity-50"
          >
            {creating ? 'กำลังสร้าง...' : 'เขียนโพสต์ใหม่'}
          </button>
          <button
            onClick={handleAiOutline}
            disabled={aiLoading || !idea.trim()}
            className="flex items-center gap-1.5 bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2 disabled:opacity-50"
          >
            <Sparkles size={16} />
            {aiLoading ? 'กำลังจัดชุดโพสต์...' : 'ให้ AI จัดชุดโพสต์ →'}
          </button>
        </div>
      </div>

      {/* แถบหมวด */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory('')}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border
            ${!category
              ? 'bg-orange text-white border-orange'
              : 'bg-card-bg text-warm-600 dark:text-disc-muted border-warm-200 dark:border-disc-border hover:border-orange hover:text-orange dark:hover:text-orange'
            }`}
        >
          ทั้งหมด
        </button>
        <button
          onClick={() => setCategory('__none__')}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border
            ${category === '__none__'
              ? 'bg-orange text-white border-orange'
              : 'bg-card-bg text-warm-600 dark:text-disc-muted border-warm-200 dark:border-disc-border hover:border-orange hover:text-orange dark:hover:text-orange'
            }`}
        >
          ยังไม่จัดหมวด
        </button>
        <button
          onClick={() => setShowArchived(v => !v)}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border
            ${showArchived
              ? 'bg-warm-600 text-white border-warm-600'
              : 'bg-card-bg text-warm-600 dark:text-disc-muted border-warm-200 dark:border-disc-border hover:border-warm-400'
            }`}
        >
          🗄️ ในกรุ
        </button>
        {categories.map((c) => (
          <button
            key={c.category}
            onClick={() => setCategory(c.category)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border
              ${category === c.category
                ? 'bg-orange text-white border-orange'
                : 'bg-card-bg text-warm-600 dark:text-disc-muted border-warm-200 dark:border-disc-border hover:border-orange hover:text-orange dark:hover:text-orange'
              }`}
          >
            {c.category} ({c.post_count})
          </button>
        ))}
      </div>

      {/* การ์ดโพสต์ */}
      {loading ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-10 text-center text-warm-400 dark:text-disc-muted">
          กำลังโหลด...
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-10 text-center text-warm-400 dark:text-disc-muted">
          {showArchived ? 'ไม่มีโพสต์ในกรุ' : 'ยังไม่มีโพสต์ — โยนไอเดียแล้วเริ่มเขียนได้เลย'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
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
              เก็บเข้ากรุแล้วกู้คืนได้ที่แถบ “ในกรุ” · ลบถาวรคือหายจากฐานข้อมูลจริง เอากลับไม่ได้
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
