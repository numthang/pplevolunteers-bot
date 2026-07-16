'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import { can } from '@/lib/permissions.js'
import { useRouter } from 'next/navigation'

export default function RolesAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { access } = useEffectiveRoles(session)

  const [q, setQ]                 = useState('')
  const [members, setMembers]     = useState([])
  const [assignable, setAssignable] = useState([])
  const [loading, setLoading]     = useState(false)
  const [busy, setBusy]           = useState(null)   // `${memberId}:${roleId}` ที่กำลังอัปเดต
  const [msg, setMsg]             = useState(null)
  const debounce = useRef(null)

  // gate — เฉพาะ manageRoles (admin/moderator) · access เริ่ม null ระหว่างโหลด รอ resolve ก่อนตัดสิน
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated' && access && !can('manageRoles', access.permissions))
      router.push('/dashboard')
  }, [status, access])

  async function search(term) {
    setLoading(true)
    const res = await fetch(`/api/admin/roles?q=${encodeURIComponent(term)}`)
    if (res.ok) {
      const data = await res.json()
      setMembers(data.members || [])
      setAssignable(data.assignable || [])
    }
    setLoading(false)
  }

  // โหลด catalog ครั้งแรก (q ว่าง → ได้ assignable, ยังไม่มี member)
  useEffect(() => { search('') }, [])

  function onSearchChange(v) {
    setQ(v)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(v), 350)
  }

  // คน Discord เช็คด้วยชื่อ role · คน email เช็คด้วย key (permission)
  function memberHasRole(m, role) {
    return m.type === 'discord'
      ? m.roles.includes(role.roleName)
      : m.webRoles.includes(role.permission)
  }

  async function toggle(member, role) {
    const hasRole = memberHasRole(member, role)
    const key = `${member.id}:${role.roleId}`
    setBusy(key); setMsg(null)
    const res = await fetch('/api/admin/roles', {
      method: hasRole ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: member.id, roleId: role.roleId }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setMsg({ type: 'err', text: data.error || 'ทำรายการไม่สำเร็จ' }); return }
    // อัปเดต local — Discord แก้ roles(ชื่อ) · email แก้ webRoles(key)
    setMembers(ms => ms.map(m => {
      if (m.id !== member.id) return m
      if (m.type === 'discord') {
        const roles = new Set(m.roles)
        if (hasRole) roles.delete(role.roleName); else roles.add(role.roleName)
        return { ...m, roles: [...roles] }
      }
      const webRoles = new Set(m.webRoles)
      if (hasRole) webRoles.delete(role.permission); else webRoles.add(role.permission)
      return { ...m, webRoles: [...webRoles] }
    }))
    setMsg({ type: 'ok', text: `${hasRole ? 'ถอด' : 'เพิ่ม'}ยศ "${role.roleName}" ${hasRole ? 'จาก' : 'ให้'} ${member.label} แล้ว` })
  }

  if (status === 'loading') return null

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">จัดการยศสมาชิก</h1>
      <p className="text-sm text-gray-500 dark:text-disc-muted mb-4">
        ตั้ง/ถอดยศผ่านเว็บ — คน Discord เพิ่มยศจริงในเซิร์ฟเวอร์ทันที · คน email เก็บเป็นสิทธิ์ในเว็บ · ยศ admin ตั้งได้ใน Discord เท่านั้น
      </p>

      <input
        type="text"
        value={q}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="ค้นหาสมาชิก (ชื่อ, อีเมล หรือ Discord ID)"
        className="w-full border dark:border-disc-border rounded-lg px-3 py-2 bg-card-bg text-gray-700 dark:text-disc-text mb-3"
      />

      {msg && (
        <p className={`text-sm mb-3 ${msg.type === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {msg.text}
        </p>
      )}

      {loading && <p className="text-sm text-gray-500 dark:text-disc-muted">กำลังโหลด...</p>}

      {!loading && q.length >= 2 && members.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-disc-muted">ไม่พบสมาชิก</p>
      )}

      {!loading && q.length < 2 && (
        <p className="text-sm text-gray-400 dark:text-disc-muted">พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหาสมาชิก</p>
      )}

      <div className="space-y-3">
        {members.map(m => (
          <div key={m.id} className="border dark:border-disc-border rounded-xl p-4 bg-card-bg">
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="font-semibold text-gray-800 dark:text-disc-text truncate">{m.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                m.type === 'discord'
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              }`}>
                {m.type === 'discord' ? 'Discord' : 'email'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {assignable.map(role => {
                const hasRole = memberHasRole(m, role)
                const key = `${m.id}:${role.roleId}`
                return (
                  <button
                    key={role.roleId}
                    disabled={busy === key}
                    onClick={() => toggle(m, role)}
                    title={hasRole ? 'คลิกเพื่อถอดยศ' : 'คลิกเพื่อเพิ่มยศ'}
                    className={`px-2.5 py-1 rounded-full text-xs border transition ${
                      hasRole
                        ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                        : 'bg-transparent text-gray-500 dark:text-disc-muted border-gray-300 dark:border-disc-border hover:border-indigo-400'
                    } ${busy === key ? 'opacity-50' : ''}`}
                  >
                    {busy === key ? '...' : role.roleName}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
