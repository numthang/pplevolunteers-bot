'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const LEVEL_CLS = {
  ERROR: 'text-red-400',
  WARN:  'text-yellow-400',
  INFO:  'text-gray-300',
  DEBUG: 'text-gray-500',
}

function colorLine(line) {
  if (line.includes('error') || line.includes('Error') || line.includes('ERROR')) return 'text-red-400'
  if (line.includes('warn')  || line.includes('Warn')  || line.includes('WARN'))  return 'text-yellow-400'
  if (line.includes('[INFO]')) return 'text-gray-300'
  if (line.includes('[DEBUG]')) return 'text-gray-500'
  return 'text-gray-400'
}

export default function LogsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [lines, setLines]           = useState([])
  const [sources, setSources]       = useState([])
  const [source, setSource]         = useState('all')
  const [maxLines, setMaxLines]     = useState(300)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef(null)

  const roles = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : (session?.user?.roles || '').split(',').map(r => r.trim())

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated' && !['Admin', 'Moderator'].some(r => roles.includes(r)))
      router.push('/dashboard')
  }, [status, roles])

  async function fetchLogs() {
    setLoading(true)
    const res = await fetch(`/api/admin/logs?source=${source}&lines=${maxLines}`)
    if (res.ok) {
      const data = await res.json()
      setLines(data.lines || [])
      setError(data.error || null)
      if (data.sources?.length) setSources(data.sources)
    }
    setLoading(false)
  }

  useEffect(() => { fetchLogs() }, [source, maxLines])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(fetchLogs, 5000)
    return () => clearInterval(id)
  }, [autoRefresh, source, maxLines])

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView()
  }, [lines])

  if (status === 'loading') return null

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">System Logs</h1>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {/* Lines */}
          <select
            className="border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
            value={maxLines}
            onChange={e => setMaxLines(Number(e.target.value))}
          >
            {[100, 300, 500, 1000].map(n => <option key={n} value={n}>last {n} lines</option>)}
          </select>

          <label className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            auto (5s)
          </label>

          <label className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
            scroll
          </label>

          <button onClick={fetchLogs} className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700">
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs mb-2">Error reading file: {error}</p>}

      <div className="bg-gray-950 rounded-xl p-4 overflow-auto font-mono text-xs leading-relaxed max-h-[75vh]">
        {lines.length === 0
          ? <p className="text-gray-500">{loading ? 'กำลังโหลด...' : 'ไม่มี log'}</p>
          : lines.map((line, i) => (
            <div key={i} className={colorLine(line)}>{line}</div>
          ))
        }
        <div ref={bottomRef} />
      </div>

      <p className="text-xs text-gray-500 mt-2 text-right">{lines.length} lines</p>
    </div>
  )
}
