'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const INPUT_CLS =
  'flex-1 min-w-0 h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal'

export default function KitchenClient() {
  const [loading, setLoading] = useState(true)
  const [kitchens, setKitchens] = useState([])
  const [currentKitchenId, setCurrentKitchenId] = useState(null)
  const [members, setMembers] = useState([])
  const [nameInput, setNameInput] = useState('')
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState([])
  const [selectedInvitee, setSelectedInvitee] = useState(null) // { discord_id, display_name }
  const [busy, setBusy] = useState(false)
  const searchTimer = useRef(null)

  const currentKitchen = kitchens.find(k => k.id === currentKitchenId)

  async function loadAll() {
    const [kRes] = await Promise.all([fetch('/api/cooking/kitchens')])
    const kData = await kRes.json()
    setKitchens(kData.kitchens || [])
    setCurrentKitchenId(kData.currentKitchenId || null)
    if (kData.currentKitchenId) {
      const mRes = await fetch(`/api/cooking/kitchens/${kData.currentKitchenId}/members`)
      const mData = await mRes.json()
      setMembers(mData.members || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAll().catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (currentKitchen) setNameInput(currentKitchen.name)
  }, [currentKitchen?.id])

  function handleQueryChange(v) {
    setInviteQuery(v)
    setSelectedInvitee(null)
    clearTimeout(searchTimer.current)
    if (!v.trim()) {
      setInviteResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/cooking/kitchens/member-search?q=${encodeURIComponent(v.trim())}`)
      if (!res.ok) return
      const data = await res.json()
      setInviteResults(data.members || [])
    }, 250)
  }

  function pickInvitee(m) {
    setSelectedInvitee(m)
    setInviteQuery(m.display_name || m.username || m.discord_id)
    setInviteResults([])
  }

  async function switchKitchen(kitchenId) {
    setBusy(true)
    const res = await fetch('/api/cooking/kitchens/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kitchenId }),
    })
    setBusy(false)
    if (!res.ok) {
      alert('สลับครัวไม่สำเร็จ')
      return
    }
    await loadAll()
  }

  async function saveName() {
    const trimmed = nameInput.trim()
    if (!trimmed || !currentKitchenId) return
    setBusy(true)
    const res = await fetch(`/api/cooking/kitchens/${currentKitchenId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    setBusy(false)
    if (!res.ok) {
      alert('เปลี่ยนชื่อไม่สำเร็จ')
      return
    }
    const { kitchen } = await res.json()
    setKitchens(prev => prev.map(k => (k.id === kitchen.id ? kitchen : k)))
  }

  async function invite() {
    // เลือกจาก dropdown ค้นหาไว้ ใช้ discord_id ตรงๆ · ถ้าไม่เจอในค้นหา (ยังไม่เคยเข้าเว็บ) ให้พิมพ์ ID เองแทนได้
    const discordId = selectedInvitee?.discord_id || inviteQuery.trim()
    if (!discordId || !currentKitchenId) return
    setBusy(true)
    const res = await fetch(`/api/cooking/kitchens/${currentKitchenId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId }),
    })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'เชิญไม่สำเร็จ')
      return
    }
    const { members: updated } = await res.json()
    setMembers(updated)
    setInviteQuery('')
    setSelectedInvitee(null)
  }

  async function removeMember(member) {
    if (!currentKitchenId) return
    if (!confirm(`ลบ ${member} ออกจากครัวนี้?`)) return
    setBusy(true)
    const res = await fetch(`/api/cooking/kitchens/${currentKitchenId}/members/${encodeURIComponent(member)}`, {
      method: 'DELETE',
    })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'ลบไม่สำเร็จ')
      return
    }
    setMembers(prev => prev.filter(m => m.member !== member))
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

      <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mt-2 mb-4">
        จัดการครัว
      </h1>

      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4 mb-4">
        <p className="text-sm font-medium text-warm-900 dark:text-disc-text mb-2">ครัวของคุณ</p>
        <div className="space-y-2">
          {kitchens.map(k => (
            <div key={k.id} className="flex items-center justify-between gap-2">
              <span className="text-sm text-warm-900 dark:text-disc-text">
                {k.name} {k.id === currentKitchenId && <span className="text-[#AAD9CE]">✓ กำลังใช้</span>}
              </span>
              {k.id !== currentKitchenId && (
                <button
                  type="button"
                  onClick={() => switchKitchen(k.id)}
                  disabled={busy}
                  className="border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg px-3 py-1 text-xs font-medium transition disabled:opacity-50"
                >
                  สลับมาใช้
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {currentKitchenId && (
        <>
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-warm-900 dark:text-disc-text mb-2">ชื่อครัวปัจจุบัน</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                className={INPUT_CLS}
              />
              <button
                type="button"
                onClick={saveName}
                disabled={busy}
                className="bg-[#AAD9CE] hover:bg-[#93cabb] text-[#1f4a3d] rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
              >
                บันทึก
              </button>
            </div>
          </div>

          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
            <p className="text-sm font-medium text-warm-900 dark:text-disc-text mb-2">
              สมาชิก ({members.length}) — ทุกคนช่วยติ๊กของ/ทำเมนูในครัวนี้ได้เท่ากันหมด
            </p>
            <div className="space-y-2 mb-4">
              {members.map(m => (
                <div key={m.member} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-warm-900 dark:text-disc-text truncate">{m.member}</span>
                  <button
                    type="button"
                    onClick={() => removeMember(m.member)}
                    disabled={busy}
                    className="border border-red-500 text-red-500 hover:bg-red-500 hover:text-white rounded-lg px-3 py-1 text-xs font-medium transition disabled:opacity-50 shrink-0"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-warm-400 dark:text-disc-muted mb-2">
              เชิญเพิ่ม — ค้นชื่อคนที่จะช่วยจัดการครัวนี้ (พิมพ์ Discord ID ตรงๆ ก็ได้ถ้าค้นไม่เจอ)
            </p>
            <div className="relative">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteQuery}
                  onChange={e => handleQueryChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && invite()}
                  placeholder="ชื่อ หรือ Discord ID"
                  className={INPUT_CLS}
                />
                <button
                  type="button"
                  onClick={invite}
                  disabled={busy}
                  className="border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
                >
                  เชิญ
                </button>
              </div>
              {inviteResults.length > 0 && (
                <div className="absolute left-0 right-14 mt-1 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg z-10 overflow-hidden">
                  {inviteResults.map(m => (
                    <button
                      key={m.discord_id}
                      type="button"
                      onClick={() => pickInvitee(m)}
                      className="w-full text-left px-3 py-2 text-sm text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                    >
                      {m.display_name || m.username}
                      {m.username && m.display_name !== m.username && (
                        <span className="text-warm-400 dark:text-disc-muted"> (@{m.username})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
