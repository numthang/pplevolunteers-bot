'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Trash2, Globe, Lock, AlertTriangle } from 'lucide-react'

const PLATFORM_LABEL = { fb: 'Facebook', ig: 'Instagram', threads: 'Threads', x: 'X (Twitter)' }
const PLATFORM_COLOR = {
  fb:      'bg-blue-600 text-white',
  ig:      'bg-gradient-to-r from-purple-500 to-orange-400 text-white',
  threads: 'bg-gray-800 text-white dark:bg-gray-700',
  x:       'bg-black text-white',
}

function TokenExpiry({ expiresAt }) {
  if (!expiresAt) return null
  const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400000)
  if (days < 0) return <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><AlertTriangle size={12} /> Token หมดอายุแล้ว</span>
  if (days <= 7) return <span className="flex items-center gap-1 text-xs text-orange-500 font-medium"><AlertTriangle size={12} /> หมดอายุใน {days} วัน</span>
  return <span className="text-xs text-green-600 dark:text-green-400">Token อีก {days} วัน</span>
}

export default function SocialPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState([])
  const [guilds, setGuilds] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [banner, setBanner] = useState(null)

  const load = useCallback(async () => {
    const [accRes, gRes] = await Promise.all([
      fetch('/api/social/accounts'),
      fetch('/api/social/my-guilds'),
    ])
    if (accRes.ok) setAccounts(await accRes.json())
    if (gRes.ok) setGuilds(await gRes.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated') load()
  }, [status, load, router])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const account   = searchParams.get('account')
    const error     = searchParams.get('error')
    if (connected) setBanner({ type: 'success', msg: `เชื่อมต่อ @${account} สำเร็จแล้ว` })
    if (error === 'denied') setBanner({ type: 'error', msg: 'ยกเลิก OAuth' })
    if (error && error !== 'denied') setBanner({ type: 'error', msg: `เชื่อมต่อไม่สำเร็จ (${error})` })
  }, [searchParams])

  async function remove(id) {
    if (!confirm('ลบ account นี้?')) return
    setDeleting(id)
    await fetch(`/api/social/accounts/${id}`, { method: 'DELETE' })
    setAccounts(prev => prev.filter(a => a.id !== id))
    setDeleting(null)
  }

  if (status === 'loading' || loading) {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }

  const byGuild = {}
  for (const acc of accounts) {
    const key = acc.guild_id || '__none__'
    if (!byGuild[key]) byGuild[key] = []
    byGuild[key].push(acc)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">Social Accounts</h1>
        <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">จัดการบัญชี Social Media ของคุณที่เชื่อมต่อกับ bot</p>
      </div>

      {banner && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${banner.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
          {banner.msg}
          <button onClick={() => setBanner(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {guilds.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-disc-muted">ไม่พบ Guild ที่คุณเป็นสมาชิก</p>
        )}

        {guilds.map(guild => {
          const gAccounts = byGuild[guild.guild_id] || []
          return (
            <div key={guild.guild_id}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-700 dark:text-disc-muted uppercase tracking-wide">
                  {guild.name || guild.guild_id}
                </h2>
                <a
                  href={`/api/x/oauth/start?guild_id=${guild.guild_id}&visibility=private`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-sm hover:opacity-80 transition"
                >
                  Connect X Account
                </a>
              </div>

              {gAccounts.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-disc-muted pl-1">ยังไม่มีบัญชี</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {gAccounts.map(acc => (
                    <div key={acc.id} className="bg-card-bg rounded-xl px-4 py-3 flex items-center gap-3 border border-warm-200 dark:border-disc-border">
                      <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-md ${PLATFORM_COLOR[acc.platform] || 'bg-gray-500 text-white'}`}>
                        {PLATFORM_LABEL[acc.platform] || acc.platform}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-disc-text">{acc.name}</p>
                        <p className="text-xs text-gray-400 dark:text-disc-muted font-mono">{acc.social_id}</p>
                        {acc.platform === 'ig' && <TokenExpiry expiresAt={acc.user_token_expires_at} />}
                      </div>

                      <span className={`shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-md ${
                        acc.visibility === 'public'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-disc-hover dark:text-disc-muted'
                      }`}>
                        {acc.visibility === 'public' ? <Globe size={12} /> : <Lock size={12} />}
                        {acc.visibility === 'public' ? 'สาธารณะ' : 'ส่วนตัว'}
                      </span>

                      <button
                        onClick={() => remove(acc.id)}
                        disabled={deleting === acc.id}
                        className="shrink-0 p-1.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
