'use client'

// หน้าสร้างโพสต์ใหม่ — ตามกฎ CLAUDE.md §กฎการบันทึก:
//   Create = ปุ่มบันทึกเท่านั้น · ห้าม autosave · **ไม่มีแถวใน DB จนกว่าจะกดบันทึก**
// (ของเดิมกด "เขียนโพสต์ใหม่" แล้วยิง POST ทันที → กดเล่นทีไรได้ร่างเปล่าค้าง DB ทุกครั้ง)
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import CategoryPicker from './CategoryPicker.jsx'

function autoGrow(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

export default function PostCreate({ orgName = 'องค์กร', defaultVisibility = 'personal', defaultCategory = '' }) {
  const router = useRouter()
  const bodyRef = useRef(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [visibility, setVisibility] = useState(defaultVisibility === 'org' ? 'org' : 'personal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [allCategories, setAllCategories] = useState([])  // หมวดที่เคยใช้ — เลือกซ้ำแทนพิมพ์ใหม่ (เหมือน PostMetaPanel.jsx)

  const dirty = !!(title.trim() || body.trim())

  useEffect(() => { autoGrow(bodyRef.current) }, [body])

  useEffect(() => {
    fetch('/api/posts/categories')
      .then(res => (res.ok ? res.json() : { data: [] }))
      .then(json => setAllCategories((json.data || []).map(c => c.category).filter(Boolean)))
      .catch(() => {})
  }, [])

  // ไม่มี autosave → ต้องเตือนก่อนออกจากหน้าเมื่อมีข้อความค้าง (กฎเดียวกันใน CLAUDE.md)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  async function handleSave() {
    if (!dirty || saving) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility,
          title: title.trim() || null,
          body: body.trim() || null,
          category: category.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) { setError(json.error || 'บันทึกไม่สำเร็จ'); return }
      // บันทึกแล้วค่อยมีแถวจริง → ส่งต่อให้หน้าแก้ไข (ที่นั่นมี autosave + ปุ่มบันทึก)
      router.replace(`/posts/${json.data.id}`)
    } catch {
      setError('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Link href="/posts" className="inline-block text-base text-teal hover:underline mb-4">
        ← กลับไปหน้ารายการ
      </Link>

      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 flex flex-col gap-4 max-w-3xl">
        <div>
          <h1 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-1">โพสต์ใหม่</h1>
          <p className="text-sm text-warm-500 dark:text-disc-muted">
            ยังไม่ถูกบันทึกจนกว่าจะกดปุ่มบันทึก — ปิดหน้านี้ทิ้งได้เลยถ้าเปลี่ยนใจ
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">ชื่อโพสต์</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="ตั้งชื่อไว้หาเจอง่ายๆ"
            className="w-full h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">เนื้อหา</label>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="เขียนอะไรก็ได้ ยังไม่ต้องเสร็จ"
            rows={8}
            className="w-full px-3 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal resize-none"
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">สร้างเป็น</label>
            <div className="inline-flex rounded-lg border border-warm-200 dark:border-disc-border overflow-hidden">
              {[['personal', 'ส่วนตัว'], ['org', orgName]].map(([v, label], i) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`px-3 h-11 text-sm font-medium transition-colors max-w-[12rem] truncate ${
                    i > 0 ? 'border-l border-warm-200 dark:border-disc-border' : ''
                  } ${
                    visibility === v
                      ? 'bg-teal text-white'
                      : 'bg-card-bg text-warm-700 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-[12rem]">
            <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">หมวด (ไม่ใส่ก็ได้)</label>
            <CategoryPicker
              value={category}
              onChange={setCategory}
              categories={allCategories}
              className="w-full h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal hover:opacity-90 text-white text-base font-medium disabled:opacity-50 transition"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <span className="text-sm text-warm-500 dark:text-disc-muted">
            {dirty ? 'ยังไม่ได้บันทึก' : 'พิมพ์อะไรสักอย่างก่อนถึงจะบันทึกได้'}
          </span>
        </div>
      </div>
    </div>
  )
}
