'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

const FIELDS = [
  { key: 'nickname',   label: 'ชื่อเล่น',              placeholder: 'เช่น แมว' },
  { key: 'firstname',  label: 'ชื่อจริง',               placeholder: '' },
  { key: 'lastname',   label: 'นามสกุล',               placeholder: '' },
  { key: 'member_id',  label: 'หมายเลขสมาชิกพรรค',     placeholder: '' },
  { key: 'specialty',  label: 'ความเชี่ยวชาญ',          placeholder: 'เช่น กฎหมาย, การเงิน, IT' },
  { key: 'amphoe',     label: 'อำเภอ',                  placeholder: '' },
  { key: 'phone',      label: 'เบอร์โทร',               placeholder: '08x-xxx-xxxx' },
  { key: 'line_id',    label: 'Line ID',                placeholder: '' },
  { key: 'google_id',  label: 'Google Email',           placeholder: '' },
]

const EMPTY = Object.fromEntries(FIELDS.map(f => [f.key, '']))

export default function ProfilePage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const [form, setForm] = useState(EMPTY)
  const [readOnly, setReadOnly] = useState({})
  const [primaryProvince, setPrimaryProvince] = useState('')
  const [provinceOptions, setProvinceOptions] = useState([])
  const [guildId, setGuildId] = useState('')
  const [guild, setGuild] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        setForm(prev => {
          const next = { ...prev }
          for (const f of FIELDS) next[f.key] = data[f.key] || ''
          return next
        })
        setReadOnly({
          username:     data.username || '',
          display_name: data.display_name || '',
          province:     data.province || '',
          region:       data.region || '',
          roles:        data.roles || '',
          interests:    data.interests || '',
        })
        setPrimaryProvince(data.primary_province || '')
        setProvinceOptions(data.province_options || [])
        setGuildId(data.guild_id || '')
        setGuild(data.guild || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [status])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, primary_province: primaryProvince || null }),
      })
      if (!res.ok) throw new Error()
      await update()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    }
    setSaving(false)
  }

  if (status === 'loading' || loading) {
    return <div className="py-16 text-center text-gray-400 text-sm">กำลังโหลด...</div>
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">แก้ไขโปรไฟล์</h1>


      {/* Discord info */}
      {session && (
        <div className="flex items-center gap-3 mb-3 p-4 bg-card-bg rounded-xl border border-gray-200 dark:border-gray-700">
          {session.user.image && (
            <Image src={session.user.image} alt="" width={48} height={48} className="rounded-full shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">@{session.user.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              ID: {session.user.discordId}
            </p>
            {readOnly.display_name && readOnly.display_name !== session.user.name && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Display name: {readOnly.display_name}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">ข้อมูล Discord — แก้ไขได้ใน Discord โดยตรง</p>
          </div>
        </div>
      )}

      {/* Read-only info */}
      {(readOnly.province || readOnly.region || readOnly.roles) && (
        <div className="mb-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800 text-sm space-y-1">
          {readOnly.province && (
            <p className="text-gray-700 dark:text-gray-300">
              <span className="font-medium">จังหวัด:</span> {readOnly.province}
              {readOnly.region && <span className="text-gray-500"> · {readOnly.region}</span>}
            </p>
          )}
          {readOnly.roles && (
            <p className="text-gray-700 dark:text-gray-300">
              <span className="font-medium">ยศ:</span>{' '}
              {readOnly.roles.split(',').map(r => r.trim()).filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">ข้อมูลจาก Discord server — แก้ไขโดย Admin</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {label}
            </label>
            <input
              type="text"
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-card-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>
        ))}

        {provinceOptions.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              จังหวัดหลัก (Primary Province)
            </label>
            <select
              value={primaryProvince}
              onChange={e => setPrimaryProvince(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-card-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            >
              <option value="">— ไม่ระบุ —</option>
              {provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">ใช้เป็นค่า default เมื่อเพิ่ม Contact ใหม่</p>
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          {saving ? 'กำลังบันทึก...' : saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
        </button>
      </form>
    </div>
  )
}
