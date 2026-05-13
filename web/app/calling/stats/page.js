'use client'

import { useEffect, useState, Suspense } from 'react'
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import { useTheme } from '@/components/Providers'
import 'react-circular-progressbar/dist/styles.css'

const COLORS = {
  tier: ['#ff9d5c', '#ffb574', '#ff8080', '#80bce8'],
  status: ['#66bb6a', '#ffb84d', '#ff7070']
}

const GAUGE_DESCRIPTIONS = {
  successRate: 'โทรติดสาย ÷ โทรทั้งหมด',
  coverage: 'ได้รับมอบหมาย ÷ สมาชิกทั้งหมด',
  engagement: 'สนใจสูง (A+B) ÷ สมาชิกทั้งหมด'
}

function StatsContent() {
  const { dark } = useTheme()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/calling/stats')
        if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลได้')
        const json = await res.json()
        setData(json.data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-80">
        <p className="text-warm-500 dark:text-disc-muted">กำลังโหลด...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-6 text-center">
        <p className="text-warm-900 dark:text-disc-text font-medium">ผิดพลาด</p>
        <p className="text-warm-500 dark:text-disc-muted text-sm mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-2">
          สถิติการโทรหา
        </h1>
        <p className="text-base text-warm-500 dark:text-disc-muted">
          สรุปผลการโทรหาสมาชิก
        </p>
      </div>

      {/* Gauge Charts (KPI) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(data.gauges).map(([key, gauge]) => (
          <div key={`${key}-${dark}`} className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-6 flex flex-col items-center text-center">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text mb-1">
              {gauge.label}
            </h2>
            <p className="text-xs text-warm-500 dark:text-disc-muted mb-4">
              {GAUGE_DESCRIPTIONS[key]}
            </p>
            <div style={{ width: 140, height: 140, filter: dark ? 'none' : 'none', WebkitFontSmoothing: 'antialiased' }}>
              <CircularProgressbar
                value={gauge.value}
                text={`${gauge.value}%`}
                styles={buildStyles({
                  rotation: 0.25,
                  strokeLinecap: 'round',
                  textSize: '28px',
                  pathTransitionDuration: 0.5,
                  pathColor: '#426e92',
                  textColor: dark ? '#ffffff' : '#426e92',
                  trailColor: '#e5e7eb',
                  backgroundColor: '#fff',
                })}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Detail Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tier Distribution */}
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text mb-4">
            การจำแนกระดับ (A, B, C, D)
          </h2>
          {data.tiers.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.tiers}
                  cx="50%"
                  cy="50%"
                  innerRadius={0}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="var(--card-bg, #f3f4f6)"
                  strokeWidth={2}
                >
                  {data.tiers.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.tier[index % COLORS.tier.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ccc', borderRadius: '6px' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-warm-500 dark:text-disc-muted">
              ไม่มีข้อมูล
            </div>
          )}
        </div>

        {/* Call Status */}
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text mb-4">
            สถานะการโทร
          </h2>
          {data.statuses.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.statuses}
                  cx="50%"
                  cy="50%"
                  innerRadius={0}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="var(--card-bg, #f3f4f6)"
                  strokeWidth={2}
                >
                  {data.statuses.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.status[index % COLORS.status.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ccc', borderRadius: '6px' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-warm-500 dark:text-disc-muted">
              ไม่มีข้อมูล
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function StatsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-80"><p className="text-warm-500 dark:text-disc-muted">กำลังโหลด...</p></div>}>
      <StatsContent />
    </Suspense>
  )
}
