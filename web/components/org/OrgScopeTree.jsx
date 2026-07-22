'use client'
import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight, Plus, Pencil, Trash2, Check, X } from 'lucide-react'

/**
 * ผังพื้นที่ของ org — สร้าง/ย้าย/เปลี่ยนชื่อ/ลบ node
 *
 * ทำไมต้องมี: node ที่ซ้อนกันคือสิ่งเดียวที่ทำให้ "ผู้ประสานงานภาคเห็นทุกจังหวัดในภาค"
 * ทำงาน (reduceRoleDefs ไล่ลูกให้เฉพาะคนที่มีตำแหน่งระดับภาค) · org ที่ไม่มี Discord
 * ไม่มีทางสร้างชั้นเหล่านี้มาก่อน
 *
 * key แก้ไม่ได้หลังสร้าง — โชว์เป็น mono ตัวจางข้างชื่อ ให้เห็นว่าอันไหนคือตัวที่แมตช์ข้อมูลจริง
 */
export default function OrgScopeTree() {
  const t = useTranslations('org')
  const [nodes, setNodes] = useState(null)   // null=loading · false=ไม่มีสิทธิ์
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [addUnder, setAddUnder] = useState(undefined)  // undefined=ปิด · null=ระดับบนสุด · id=ใต้ node
  const [editing, setEditing] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const r = await fetch('/api/org/scope-nodes')
    if (!r.ok) return setNodes(false)
    setNodes((await r.json()).nodes)
  }

  async function call(method, body) {
    setBusy(true); setErr('')
    const r = await fetch('/api/org/scope-nodes', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error || t('scope.saveError')); return false }
    await load()
    return true
  }

  // แตก flat list → ต้นไม้ · node ที่ parent หายไป (ไม่ควรเกิด) โผล่ที่ระดับบนสุด ไม่หายไปเงียบๆ
  const { roots, childrenOf } = useMemo(() => {
    const list = Array.isArray(nodes) ? nodes : []
    const ids = new Set(list.map(n => n.id))
    const childrenOf = new Map()
    const roots = []
    for (const n of list) {
      if (n.parent_id != null && ids.has(n.parent_id)) {
        if (!childrenOf.has(n.parent_id)) childrenOf.set(n.parent_id, [])
        childrenOf.get(n.parent_id).push(n)
      } else roots.push(n)
    }
    return { roots, childrenOf }
  }, [nodes])

  if (nodes === null) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('scope.loading')}</p>
  if (nodes === false) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('scope.adminOnly')}</p>

  function renderNode(node, depth) {
    const kids = childrenOf.get(node.id) || []
    const isEditing = editing?.id === node.id

    return (
      <li key={node.id}>
        <div className="group flex items-center gap-2 rounded-lg py-1.5 pr-1 hover:bg-gray-50 dark:hover:bg-disc-hover"
          style={{ paddingLeft: `${depth * 1.25}rem` }}>
          <ChevronRight size={13}
            className={`shrink-0 text-gray-300 dark:text-disc-muted ${kids.length ? 'rotate-90' : 'opacity-0'}`} />

          {isEditing ? (
            <EditRow node={node} nodes={nodes} busy={busy}
              onCancel={() => setEditing(null)}
              onSave={async (patch) => { if (await call('PATCH', { id: node.id, ...patch })) setEditing(null) }} />
          ) : (
            <>
              <span className="truncate text-sm text-gray-900 dark:text-disc-text">{node.label}</span>
              <code className="shrink-0 rounded bg-gray-100 dark:bg-disc-bg2 px-1.5 py-0.5 font-mono text-[11px] text-gray-400 dark:text-disc-muted">
                {node.key}
              </code>
              {node.role_def_count > 0 && (
                <span className="shrink-0 text-[11px] text-gray-400 dark:text-disc-muted">
                  {t('scope.roleDefCount', { count: node.role_def_count })}
                </span>
              )}
              <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <IconBtn label={t('scope.addChild')} onClick={() => setAddUnder(node.id)}><Plus size={14} /></IconBtn>
                <IconBtn label={t('scope.rename')} onClick={() => setEditing(node)}><Pencil size={13} /></IconBtn>
                <IconBtn label={t('scope.delete')} danger
                  onClick={() => call('DELETE', { id: node.id })}><Trash2 size={13} /></IconBtn>
              </span>
            </>
          )}
        </div>

        {addUnder === node.id && (
          <div style={{ paddingLeft: `${(depth + 1) * 1.25}rem` }}>
            <AddRow busy={busy} onCancel={() => setAddUnder(undefined)}
              onSave={async (v) => { if (await call('POST', { ...v, parentId: node.id })) setAddUnder(undefined) }} />
          </div>
        )}

        {kids.length > 0 && <ul>{kids.map(k => renderNode(k, depth + 1))}</ul>}
      </li>
    )
  }

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
      <p className="text-sm font-medium text-gray-700 dark:text-disc-text">{t('scope.title')}</p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-disc-muted">{t('scope.desc')}</p>

      {roots.length === 0 && addUnder === undefined && (
        <p className="mt-4 text-xs text-gray-400 dark:text-disc-muted">{t('scope.empty')}</p>
      )}

      <ul className="mt-3">{roots.map(n => renderNode(n, 0))}</ul>

      {addUnder === null ? (
        <AddRow busy={busy} onCancel={() => setAddUnder(undefined)}
          onSave={async (v) => { if (await call('POST', { ...v, parentId: null })) setAddUnder(undefined) }} />
      ) : (
        <button type="button" onClick={() => setAddUnder(null)}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 dark:border-disc-border px-3 py-2 text-xs text-gray-500 dark:text-disc-muted hover:border-orange hover:text-orange">
          <Plus size={13} /> {t('scope.addRoot')}
        </button>
      )}

      {err && <p className="mt-3 text-sm text-red-accent">{err}</p>}
    </section>
  )
}

function IconBtn({ children, label, onClick, danger }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className={`rounded p-1.5 ${danger
        ? 'text-gray-400 dark:text-disc-muted hover:bg-red-accent/10 hover:text-red-accent'
        : 'text-gray-400 dark:text-disc-muted hover:bg-gray-200 dark:hover:bg-disc-border hover:text-gray-700 dark:hover:text-disc-text'}`}>
      {children}
    </button>
  )
}

const FIELD_CLS =
  'rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 ' +
  'px-2.5 py-1.5 text-sm text-gray-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-orange/40'

function AddRow({ onSave, onCancel, busy }) {
  const t = useTranslations('org')
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-orange/30 bg-orange/5 p-2">
      <input autoFocus value={label} onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        placeholder={t('scope.labelPlaceholder')} className={`${FIELD_CLS} min-w-0 flex-1`} />
      <input value={key} onChange={e => setKey(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        placeholder={t('scope.keyPlaceholder')} className={`${FIELD_CLS} w-40 font-mono text-xs`} />
      <button type="button" disabled={busy || !(key.trim() || label.trim())}
        onClick={() => onSave({ key: key.trim() || label.trim(), label: label.trim() || key.trim() })}
        className="rounded-lg bg-orange px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
        {t('scope.saveButton')}
      </button>
      <IconBtn label={t('scope.cancel')} onClick={onCancel}><X size={14} /></IconBtn>
    </div>
  )
}

// แก้ชื่อ + ย้ายพื้นที่แม่ · ตัวเลือกแม่ตัดตัวเองออก (ลูกหลานปล่อยให้ server ปฏิเสธ พร้อมบอกเหตุผล)
function EditRow({ node, nodes, onSave, onCancel, busy }) {
  const t = useTranslations('org')
  const [label, setLabel] = useState(node.label)
  const [parentId, setParentId] = useState(node.parent_id ?? '')

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <input autoFocus value={label} onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        className={`${FIELD_CLS} min-w-0 flex-1`} />
      <select value={parentId} onChange={e => setParentId(e.target.value)} className={`${FIELD_CLS} max-w-48`}>
        <option value="">{t('scope.noParent')}</option>
        {nodes.filter(n => n.id !== node.id).map(n => (
          <option key={n.id} value={n.id}>{n.label}</option>
        ))}
      </select>
      <button type="button" disabled={busy}
        onClick={() => onSave({ label, parentId: parentId === '' ? null : Number(parentId) })}
        className="rounded-lg bg-orange px-2.5 py-1.5 text-xs text-white disabled:opacity-50">
        <Check size={14} />
      </button>
      <IconBtn label={t('scope.cancel')} onClick={onCancel}><X size={14} /></IconBtn>
    </div>
  )
}
