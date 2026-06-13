'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Search, ChevronDown, ChevronRight, Shield, MapPin, Tag, GitBranch } from 'lucide-react'

const INPUT_CLS =
  'w-full px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border ' +
  'bg-card-bg text-gray-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-orange/40'

// แยก scope_node 'province:ราชบุรี' → { prefix, value }
function splitScope(scope) {
  if (!scope) return { prefix: '', value: '' }
  const idx = scope.indexOf(':')
  if (idx < 0) return { prefix: '', value: scope }
  return { prefix: scope.slice(0, idx), value: scope.slice(idx + 1) }
}

// badge สรุปสั้นๆ บนหัว row
function RoleBadges({ role, roleNameById }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {role.permission && (
        <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-orange/10 text-orange">
          <Shield size={11} /> {role.permission}
        </span>
      )}
      {role.scope_node && (
        <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-teal/10 text-teal">
          <MapPin size={11} /> {role.scope_node}
        </span>
      )}
      {role.picker_group && (
        <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
          <Tag size={11} /> {role.picker_group}
        </span>
      )}
      {role.parent_role_id && (
        <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500">
          <GitBranch size={11} /> {roleNameById[role.parent_role_id] || role.parent_role_id}
        </span>
      )}
    </div>
  )
}

function RoleCard({ role, groups, permissions, scopePrefixes, allRoles, roleNameById, onSaved }) {
  const [open, setOpen]     = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  const initScope = splitScope(role.scope_node)
  const [permission,   setPermission]   = useState(role.permission || '')
  const [scopePrefix,  setScopePrefix]  = useState(initScope.prefix)
  const [scopeValue,   setScopeValue]   = useState(initScope.value)
  const [pickerGroup,  setPickerGroup]  = useState(role.picker_group || '')
  const [pickerLabel,  setPickerLabel]  = useState(role.picker_label || '')
  const [pickerEmoji,  setPickerEmoji]  = useState(role.picker_emoji || '')
  const [pickerOrder,  setPickerOrder]  = useState(role.picker_order ?? '')
  const [parentRoleId, setParentRoleId] = useState(role.parent_role_id || '')

  const scopeNode = scopePrefix && scopeValue ? `${scopePrefix}:${scopeValue}` : ''

  async function save() {
    setSaving(true); setSaved(false)
    const res = await fetch('/api/bot/roles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role_id: role.role_id,
        permission, scope_node: scopeNode,
        picker_group: pickerGroup, picker_label: pickerLabel,
        picker_emoji: pickerEmoji, picker_order: pickerOrder,
        parent_role_id: parentRoleId,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true); setTimeout(() => setSaved(false), 1500)
      onSaved({
        ...role, permission: permission || null, scope_node: scopeNode || null,
        picker_group: pickerGroup || null, picker_label: pickerLabel || null,
        picker_emoji: pickerEmoji || null,
        picker_order: pickerOrder === '' ? null : Number(pickerOrder),
        parent_role_id: parentRoleId || null,
      })
    }
  }

  return (
    <div className="rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left">
        {open ? <ChevronDown size={16} className="shrink-0 text-gray-400" /> : <ChevronRight size={16} className="shrink-0 text-gray-400" />}
        <span className="text-sm font-medium text-gray-900 dark:text-disc-text shrink-0">{role.role_name}</span>
        <span className="ml-auto"><RoleBadges role={role} roleNameById={roleNameById} /></span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-warm-200 dark:border-disc-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {/* RBAC: permission */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-disc-muted mb-1">สิทธิ์ (Permission)</label>
              <select value={permission} onChange={e => setPermission(e.target.value)} className={INPUT_CLS}>
                <option value="">— ไม่มี —</option>
                {permissions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* RBAC: scope */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-disc-muted mb-1">ขอบเขต (Scope)</label>
              <div className="flex gap-2">
                <select value={scopePrefix} onChange={e => setScopePrefix(e.target.value)}
                  className={INPUT_CLS + ' max-w-[40%]'}>
                  <option value="">— ไม่มี —</option>
                  {scopePrefixes.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input value={scopeValue} onChange={e => setScopeValue(e.target.value)}
                  placeholder="เช่น ราชบุรี" disabled={!scopePrefix} className={INPUT_CLS} />
              </div>
            </div>

            {/* Picker: group */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-disc-muted mb-1">กลุ่มปุ่มเลือก (Picker)</label>
              <select value={pickerGroup} onChange={e => setPickerGroup(e.target.value)} className={INPUT_CLS}>
                <option value="">— ไม่มี —</option>
                {groups.map(g => <option key={g.group_key} value={g.group_key}>{g.label} ({g.group_key})</option>)}
              </select>
            </div>

            {/* Cascade: parent role */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-disc-muted mb-1">Role แม่ (Cascade)</label>
              <select value={parentRoleId} onChange={e => setParentRoleId(e.target.value)} className={INPUT_CLS}>
                <option value="">— ไม่มี —</option>
                {allRoles.filter(r => r.role_id !== role.role_id).map(r => (
                  <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                ))}
              </select>
            </div>

            {/* Picker label/emoji/order — แสดงเมื่อมี picker_group */}
            {pickerGroup && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-disc-muted mb-1">ป้ายปุ่ม (ว่าง = ใช้ชื่อ role)</label>
                  <input value={pickerLabel} onChange={e => setPickerLabel(e.target.value)}
                    placeholder={role.role_name} className={INPUT_CLS} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 dark:text-disc-muted mb-1">Emoji</label>
                    <input value={pickerEmoji} onChange={e => setPickerEmoji(e.target.value)}
                      placeholder="🟠" className={INPUT_CLS} />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-500 dark:text-disc-muted mb-1">ลำดับ</label>
                    <input type="number" value={pickerOrder} onChange={e => setPickerOrder(e.target.value)}
                      className={INPUT_CLS} />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition disabled:opacity-40">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} บันทึก
            </button>
            {saved && <span className="text-sm text-green-600 dark:text-green-400">บันทึกแล้ว</span>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function RolesPage() {
  const { status } = useSession()
  const router = useRouter()

  const [data, setData]       = useState(null)   // { guildId, roles, groups, permissions, scopePrefixes }
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [query, setQuery]     = useState('')
  const [onlySet, setOnlySet] = useState(false)

  const load = useCallback(() => {
    fetch('/api/bot/roles')
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) setData(d); else setError(d.error || 'โหลดไม่สำเร็จ') })
      .catch(() => setError('โหลดไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated') {
      load()
      window.addEventListener('guild-switched', load)
      return () => window.removeEventListener('guild-switched', load)
    }
  }, [status, load, router])

  const roleNameById = useMemo(() => {
    const m = {}
    for (const r of data?.roles || []) m[r.role_id] = r.role_name
    return m
  }, [data])

  const hasPolicy = r => r.permission || r.scope_node || r.picker_group || r.parent_role_id

  const filtered = useMemo(() => {
    let rows = data?.roles || []
    if (onlySet) rows = rows.filter(hasPolicy)
    const q = query.trim().toLowerCase()
    if (q) rows = rows.filter(r => r.role_name.toLowerCase().includes(q))
    return rows
  }, [data, query, onlySet])

  function onSaved(updated) {
    setData(prev => ({ ...prev, roles: prev.roles.map(r => r.role_id === updated.role_id ? updated : r) }))
  }

  if (status !== 'authenticated' || loading) {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }
  if (error && !data) {
    return <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
  }

  const configuredCount = (data.roles || []).filter(hasPolicy).length

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">สิทธิ์ Role</h1>
        <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">
          กำหนดสิทธิ์ (permission), ขอบเขต (scope), กลุ่มปุ่มเลือก, role แม่ — ต่อ guild · บันทึกแล้วมีผลทันที
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหา role..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-gray-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-orange/40" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-disc-muted cursor-pointer px-2">
          <input type="checkbox" checked={onlySet} onChange={e => setOnlySet(e.target.checked)} />
          เฉพาะที่ตั้งค่าแล้ว ({configuredCount})
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-disc-muted text-center py-8">ไม่พบ role</p>
        ) : filtered.map(role => (
          <RoleCard key={role.role_id} role={role}
            groups={data.groups} permissions={data.permissions} scopePrefixes={data.scopePrefixes}
            allRoles={data.roles} roleNameById={roleNameById} onSaved={onSaved} />
        ))}
      </div>
    </div>
  )
}
