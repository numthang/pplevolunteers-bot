'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Copy, Check } from 'lucide-react'

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

const BANK_FIELDS = [
  { key: 'bank_name',     label: 'ธนาคาร',              placeholder: 'เช่น กรุงไทย, กสิกร' },
  { key: 'account_no',    label: 'เลขบัญชี',            placeholder: '1234567890' },
  { key: 'account_holder', label: 'ชื่อบัญชี',          placeholder: '' },
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
  const [activeTab, setActiveTab] = useState('personal')
  const [expandRoles, setExpandRoles] = useState(false)
  const [copied, setCopied] = useState(false)

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
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">แก้ไขโปรไฟล์</h1>


      {/* Discord info */}
      {session && (
        <div className="flex items-start gap-3 mb-3 p-4 bg-card-bg rounded-xl border-2 border-brand-orange">
          {session.user.image && (
            <Image src={session.user.image} alt="" width={48} height={48} className="rounded-full shrink-0 mt-1" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">
              {readOnly.display_name && readOnly.display_name !== session.user.name
                ? readOnly.display_name
                : session.user.name}
              <span className="text-gray-500 ml-2">ID: {session.user.discordId}</span>
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                @{session.user.name}
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(session.user.name)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition"
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    <span>คัดลอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>คัดลอก</span>
                  </>
                )}
              </button>
            </div>
            {readOnly.roles && (
              <div className="flex items-center gap-2">
                <p className={`text-sm text-gray-600 dark:text-gray-300 ${expandRoles ? '' : 'truncate'}`}>
                  <span className="font-medium">ยศ:</span>{' '}
                  {readOnly.roles.split(',').map(r => r.trim()).filter(Boolean).join(' · ')}
                </p>
                <button
                  type="button"
                  onClick={() => setExpandRoles(!expandRoles)}
                  className="shrink-0 text-sm text-brand-orange hover:text-brand-orange-light transition"
                >
                  {expandRoles ? '▼' : '▶'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('personal')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'personal'
              ? 'border-brand-orange text-brand-orange'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          ข้อมูลส่วนตัว
        </button>
        <button
          onClick={() => setActiveTab('bank')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'bank'
              ? 'border-brand-orange text-brand-orange'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          ข้อมูลการเงิน
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Personal Info Tab */}
        {activeTab === 'personal' && (
          <div className="flex flex-col gap-4">
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
          </div>
        )}

        {/* Bank Info Tab */}
        {activeTab === 'bank' && (
          <div className="flex flex-col gap-4">
            {BANK_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {label}
                </label>
                <input
                  type="text"
                  value={form[key] || ''}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-card-bg dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mt-2 bg-brand-orange hover:bg-brand-orange-light disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          {saving ? 'กำลังบันทึก...' : saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
        </button>
      </form>
    </div>
  )
}
