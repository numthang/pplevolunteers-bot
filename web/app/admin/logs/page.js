'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const LEVELS = {
  ERROR: 'text-red-400',
  WARN:  'text-yellow-400',
  INFO:  'text-gray-300',
  DEBUG: 'text-gray-500',
}

function colorLine(line) {
  for (const [level, cls] of Object.entries(LEVELS)) {
    if (line.includes(`[${level}]`)) return cls
  }
  return 'text-gray-400'
}

export default function LogsPage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const [lines, setLines]       = useState([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lines200, setLines200] = useState(200)
  const bottomRef = useRef(null)

  const roles = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : (session?.user?.roles || '').split(',').map(r => r.trim())

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated' && !['Admin', 'Moderator'].some(r => roles.includes(r))) router.push('/dashboard')
  }, [status, roles])

  async function fetchLogs() {
    const res = await fetch(`/api/admin/logs?lines=${lines200}`)
    if (res.ok) {
      const { lines } = await res.json()
      setLines(lines)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [lines200])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(fetchLogs, 5000)
    return () => clearInterval(id)
  }, [autoRefresh, lines200])

  // scroll to bottom on new lines
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [lines])

  if (status === 'loading') return null

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">System Logs</h1>
        <div className="flex items-center gap-3 text-sm">
          <select
            className="border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
            value={lines200}
            onChange={e => setLines200(Number(e.target.value))}
          >
            {[100, 200, 500, 1000].map(n => <option key={n} value={n}>last {n} lines</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            auto refresh (5s)
          </label>
          <button onClick={fetchLogs} className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700">
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-gray-950 rounded-xl p-4 overflow-auto font-mono text-xs leading-relaxed max-h-[75vh]">
        {lines.length === 0
          ? <p className="text-gray-500">ไม่มี log</p>
          : lines.map((line, i) => (
            <div key={i} className={colorLine(line)}>{line}</div>
          ))
        }
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
