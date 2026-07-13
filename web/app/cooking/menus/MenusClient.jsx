'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import MenuForm from '../MenuForm.jsx'

export default function MenusClient() {
  const [loading, setLoading] = useState(true)
  const [menus, setMenus] = useState([])
  const [filterText, setFilterText] = useState('')
  const [formState, setFormState] = useState(null) // { mode: 'add'|'edit', menu? }
  const [copied, setCopied] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPromptOpen, setAiPromptOpen] = useState(false)
  const [aiPromptText, setAiPromptText] = useState('')

  useEffect(() => {
    fetch('/api/cooking/menus')
      .then(r => r.json())
      .then(data => setMenus(data.menus || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = menus.filter(m =>
    m.name.toLowerCase().includes(filterText.trim().toLowerCase())
  )

  function handleSaved(menu) {
    setMenus(prev => {
      const exists = prev.some(m => m.id === menu.id)
      return exists ? prev.map(m => (m.id === menu.id ? menu : m)) : [menu, ...prev]
    })
  }

  async function handleDelete(m) {
    if (!confirm(`ลบเมนู "${m.name}" ?`)) return
    try {
      const res = await fetch(`/api/cooking/menus/${m.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'ลบไม่สำเร็จ')
        return
      }
      setMenus(prev => prev.filter(x => x.id !== m.id))
    } catch {
      alert('ลบไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }

  async function confirmAiPrompt() {
    const name = aiPromptText.trim()
    if (!name) return
    setAiPromptOpen(false)
    setAiPromptText('')
    setAiLoading(true)
    try {
      const res = await fetch('/api/cooking/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'สร้างไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      // เปิดฟอร์มโหมดเพิ่ม พร้อมข้อมูลที่ AI ร่างให้ — ผู้ใช้ตรวจ gates แล้วกดบันทึกเอง
      setFormState({ mode: 'add', menu: data.menu })
    } catch {
      alert('สร้างไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setAiLoading(false)
    }
  }

  async function copyNames() {
    const text = menus.map(m => m.name).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('คัดลอกไม่สำเร็จ')
    }
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-warm-500 dark:text-disc-muted">
        กำลังโหลด...
      </div>
    )
  }

  return (
    <div className="py-4">
      <Link href="/cooking" className="text-sm text-teal hover:opacity-80">
        ← กลับหน้าครัว
      </Link>

      <div className="flex items-center justify-between gap-3 mt-2 mb-4">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">คลังเมนู</h1>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAiPromptOpen(true)}
            disabled={aiLoading}
            className="border border-teal text-teal hover:bg-teal hover:text-white rounded-lg text-sm font-medium px-4 py-2 transition whitespace-nowrap disabled:opacity-50"
          >
            {aiLoading ? 'กำลังสร้าง...' : '✨ AI ช่วยสร้าง'}
          </button>
          <button
            type="button"
            onClick={() => setFormState({ mode: 'add' })}
            className="bg-teal hover:opacity-90 text-white rounded-lg text-sm font-medium px-4 py-2 transition whitespace-nowrap"
          >
            ＋ เพิ่มเมนู
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="ค้นหาชื่อเมนู..."
          className="flex-1 h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
        />
        <button
          type="button"
          onClick={copyNames}
          className="border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-sm font-medium px-4 py-2 transition whitespace-nowrap"
        >
          {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกรายชื่อ'}
        </button>
      </div>

      <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">
        {filtered.length} / {menus.length} เมนู
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map(m => (
          <div
            key={m.id}
            className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4"
          >
            <div className="flex items-start gap-3">
              {m.image?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image.url} alt={m.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
              ) : (
                <span className="text-2xl leading-none">{m.image?.emoji || '🍽️'}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-warm-900 dark:text-disc-text truncate">
                  {m.name}
                </p>
                <p className="text-sm text-warm-500 dark:text-disc-muted mt-1 truncate">
                  {(m.ingredients?.core || []).join(', ') || '—'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setFormState({ mode: 'edit', menu: m })}
                className="flex-1 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg px-3 py-1.5 text-sm font-medium transition"
              >
                แก้ไข
              </button>
              <button
                type="button"
                onClick={() => handleDelete(m)}
                className="flex-1 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white rounded-lg px-3 py-1.5 text-sm font-medium transition"
              >
                ลบ
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-warm-500 dark:text-disc-muted py-8">
            ไม่พบเมนูที่ค้นหา
          </p>
        )}
      </div>

      {formState && (
        <MenuForm
          mode={formState.mode}
          menu={formState.menu}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
        />
      )}

      {aiPromptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
          onClick={() => setAiPromptOpen(false)}
        >
          <div
            className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl shadow-xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-warm-900 dark:text-disc-text">✨ AI ช่วยสร้างเมนู</h2>
              <button
                type="button"
                onClick={() => setAiPromptOpen(false)}
                className="text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">
              พิมพ์ชื่ออาหาร แล้ว AI จะร่างสูตรให้ (แก้ได้ก่อนบันทึก)
            </p>
            <input
              type="text"
              autoFocus
              value={aiPromptText}
              onChange={e => setAiPromptText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmAiPrompt()}
              placeholder="เช่น ผัดกะเพราหมูสับ"
              className="w-full h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={() => setAiPromptOpen(false)}
                className="flex-1 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-base font-medium px-4 py-2 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmAiPrompt}
                disabled={!aiPromptText.trim()}
                className="flex-1 bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2 transition disabled:opacity-50"
              >
                สร้าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
