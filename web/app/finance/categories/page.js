'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import {
  Utensils, Car, Package, Building2, Newspaper, Banknote, CreditCard,
  PartyPopper, BookOpen, Zap, Droplets, Smartphone, ShoppingCart,
  Plane, Gift, Wrench, Printer, Megaphone, Handshake, Fuel, Home,
  Stethoscope, GraduationCap, Shirt, Wifi, Camera, Music, Hammer, Folder,
  Heart, Users, MoreHorizontal, TrendingUp, Mic, AlertTriangle, Globe,
  Pill, Sparkles, Wallet, Map,
  Pencil, Trash2, Check, X,
} from 'lucide-react'

const GLOBAL_EDITORS = ['Admin', 'เลขาธิการ', 'Moderator']

const ICONS = [
  { name: 'Utensils',       Icon: Utensils },
  { name: 'Car',            Icon: Car },
  { name: 'Package',        Icon: Package },
  { name: 'Building2',      Icon: Building2 },
  { name: 'Newspaper',      Icon: Newspaper },
  { name: 'Banknote',       Icon: Banknote },
  { name: 'CreditCard',     Icon: CreditCard },
  { name: 'Heart',          Icon: Heart },
  { name: 'Users',          Icon: Users },
  { name: 'TrendingUp',     Icon: TrendingUp },
  { name: 'Mic',            Icon: Mic },
  { name: 'AlertTriangle',  Icon: AlertTriangle },
  { name: 'Globe',          Icon: Globe },
  { name: 'Pill',           Icon: Pill },
  { name: 'Sparkles',       Icon: Sparkles },
  { name: 'Wallet',         Icon: Wallet },
  { name: 'Map',            Icon: Map },
  { name: 'Zap',            Icon: Zap },
  { name: 'Smartphone',     Icon: Smartphone },
  { name: 'Shirt',          Icon: Shirt },
  { name: 'ShoppingCart',   Icon: ShoppingCart },
  { name: 'Plane',          Icon: Plane },
  { name: 'Gift',           Icon: Gift },
  { name: 'Wrench',         Icon: Wrench },
  { name: 'Printer',        Icon: Printer },
  { name: 'Megaphone',      Icon: Megaphone },
  { name: 'Handshake',      Icon: Handshake },
  { name: 'Fuel',           Icon: Fuel },
  { name: 'Home',           Icon: Home },
  { name: 'Stethoscope',    Icon: Stethoscope },
  { name: 'GraduationCap',  Icon: GraduationCap },
  { name: 'Wifi',           Icon: Wifi },
  { name: 'Camera',         Icon: Camera },
  { name: 'Music',          Icon: Music },
  { name: 'Hammer',         Icon: Hammer },
  { name: 'Droplets',       Icon: Droplets },
  { name: 'MoreHorizontal', Icon: MoreHorizontal },
  { name: 'PartyPopper',    Icon: PartyPopper },
  { name: 'BookOpen',       Icon: BookOpen },
  { name: 'Folder',         Icon: Folder },
]

const ICON_MAP = Object.fromEntries(ICONS.map(({ name, Icon }) => [name, Icon]))

function CatIcon({ name, size = 18, className = '' }) {
  const Icon = ICON_MAP[name] || Folder
  return <Icon size={size} className={className} />
}

function IconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const Current = ICON_MAP[value] || Folder
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-9 h-9 flex items-center justify-center border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
      >
        <Current size={18} />
      </button>
      {open && (
        <div className="absolute z-20 top-10 left-0 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl shadow-xl p-2 grid grid-cols-6 gap-1 w-52">
          {ICONS.map(({ name, Icon }) => (
            <button
              key={name}
              type="button"
              onClick={() => { onChange(name); setOpen(false) }}
              className={`p-1.5 rounded flex items-center justify-center hover:bg-indigo-50 dark:hover:bg-indigo-900/40 text-gray-600 dark:text-gray-300
                ${value === name ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400' : ''}`}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CategoriesPage() {
  const { data: session } = useSession()
  const { roles: effectiveRoles, discordId: effectiveDiscordId } = useEffectiveRoles(session)
  const [cats, setCats]               = useState([])
  const [input, setInput]             = useState('')
  const [inputIcon, setInputIcon]     = useState('Folder')
  const [inputGlobal, setInputGlobal] = useState(false)
  const [editId, setEditId]           = useState(null)
  const [editName, setEditName]       = useState('')
  const [editIcon, setEditIcon]       = useState('Folder')
  const [editGlobal, setEditGlobal]   = useState(false)

  const canEditGlobal = GLOBAL_EDITORS.some(r => effectiveRoles.includes(r))

  function canEdit(c) {
    return c.is_global ? canEditGlobal : c.owner_id === effectiveDiscordId
  }

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
      body: JSON.stringify({ name: input.trim(), icon: inputIcon, is_global: inputGlobal }),
    })
    setInput(''); setInputIcon('Folder'); setInputGlobal(false)
    load()
  }

  async function save(id) {
    await fetch(`/api/finance/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, icon: editIcon, is_global: editGlobal }),
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

      <div className="flex flex-wrap gap-2 mb-6">
        <IconPicker value={inputIcon} onChange={setInputIcon} />
        <input
          className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          placeholder="ชื่อหมวดหมู่ใหม่"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        {canEditGlobal && (
          <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={inputGlobal} onChange={e => setInputGlobal(e.target.checked)} />
            global
          </label>
        )}
        <button onClick={add} className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm hover:bg-indigo-700">เพิ่ม</button>
      </div>

      {[{ label: '🌐 Global', items: cats.filter(c => c.is_global) }, { label: '👤 ของฉัน', items: cats.filter(c => !c.is_global) }]
        .filter(g => g.items.length > 0)
        .map(group => (
          <div key={group.label} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">{group.label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {group.items.map(c => (
                <div key={c.id} className="bg-white dark:bg-gray-800 rounded-xl shadow flex items-center justify-between px-4 py-3 gap-3">
                  {editId === c.id ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <IconPicker value={editIcon} onChange={setEditIcon} />
                      <input
                        className="border dark:border-gray-600 rounded px-2 py-0.5 text-sm w-0 flex-1 min-w-0 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && save(c.id)}
                        autoFocus
                      />
                      {canEditGlobal && (
                        <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          <input type="checkbox" checked={editGlobal} onChange={e => setEditGlobal(e.target.checked)} />
                          g
                        </label>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-gray-500 dark:text-gray-400">
                        <CatIcon name={c.icon} size={18} />
                      </span>
                      <span className="text-sm text-gray-900 dark:text-gray-100">{c.name}</span>
                      <span className="text-xs text-gray-400">{c.is_global ? '(global)' : '(ของฉัน)'}</span>
                    </div>
                  )}
                  <div className="flex gap-2 flex-shrink-0">
                    {editId === c.id ? (
                      <>
                        <button onClick={() => save(c.id)} className="p-1.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"><Check size={16} /></button>
                        <button onClick={() => setEditId(null)} className="p-1.5 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={16} /></button>
                      </>
                    ) : canEdit(c) ? (
                      <>
                        <button onClick={() => { setEditId(c.id); setEditName(c.name); setEditIcon(c.icon || 'Folder'); setEditGlobal(!!c.is_global) }} className="p-1.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"><Pencil size={16} /></button>
                        <button onClick={() => remove(c.id)} className="p-1.5 rounded text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40"><Trash2 size={16} /></button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      {cats.length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">ยังไม่มีหมวดหมู่</p>}
    </div>
  )
}
