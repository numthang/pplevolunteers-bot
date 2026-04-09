'use client'
import { useEffect, useState } from 'react'

export default function CategoriesPage() {
  const [cats, setCats]   = useState([])
  const [input, setInput] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')

  async function load() {
    const res = await fetch('/api/finance/categories')
    if (res.ok) setCats(await res.json())
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!input.trim()) return
    await fetch('/api/finance/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.trim() }),
    })
    setInput('')
    load()
  }

  async function save(id) {
    await fetch(`/api/finance/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    })
    setEditId(null)
    load()
  }

  async function remove(id) {
    if (!confirm('ลบหมวดหมู่นี้?')) return
    await fetch(`/api/finance/categories/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">หมวดหมู่</h1>

      <div className="flex gap-2 mb-6">
        <input
          className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          placeholder="ชื่อหมวดหมู่ใหม่"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button onClick={add} className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm hover:bg-indigo-700">เพิ่ม</button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow divide-y dark:divide-gray-700">
        {cats.map(c => (
          <div key={c.id} className="flex items-center justify-between px-4 py-3">
            {editId === c.id ? (
              <input
                className="border dark:border-gray-600 rounded px-2 py-0.5 text-sm flex-1 mr-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save(c.id)}
                autoFocus
              />
            ) : (
              <span className="text-sm text-gray-900 dark:text-gray-100">{c.name} {c.is_global ? <span className="text-xs text-gray-400">(global)</span> : null}</span>
            )}
            <div className="flex gap-2">
              {editId === c.id ? (
                <>
                  <button onClick={() => save(c.id)} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">บันทึก</button>
                  <button onClick={() => setEditId(null)} className="text-sm text-gray-400 hover:underline">ยกเลิก</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditId(c.id); setEditName(c.name) }} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">แก้ไข</button>
                  {!c.is_global && <button onClick={() => remove(c.id)} className="text-sm text-red-500 dark:text-red-400 hover:underline">ลบ</button>}
                </>
              )}
            </div>
          </div>
        ))}
        {cats.length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">ยังไม่มีหมวดหมู่</p>}
      </div>
    </div>
  )
}
