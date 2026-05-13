import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import pool from '@/db/index.js'

/**
 * GET /api/calling/stats
 * Fetch stats for calling dashboard
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Call Success Rate (answered / total)
    const [[callStats]] = await pool.query(
      `SELECT
        COUNT(DISTINCT member_id) as total_contacts,
        SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered
       FROM calling_logs
       WHERE contact_type = 'member'`
    )
    const successRate = callStats.total_contacts > 0
      ? Math.round((callStats.answered / callStats.total_contacts) * 100)
      : 0

    // 2. Coverage (assigned / total members)
    const [[members]] = await pool.query(
      `SELECT
        COUNT(DISTINCT m.source_id) as total_members,
        COUNT(DISTINCT a.member_id) as assigned_members
       FROM ngs_member_cache m
       LEFT JOIN calling_assignments a ON a.member_id = m.source_id AND a.contact_type = 'member'`
    )
    const coverage = members.total_members > 0
      ? Math.round((members.assigned_members / members.total_members) * 100)
      : 0

    // 3. High Engagement (Tier A+B / total)
    const [[tierStats]] = await pool.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN tier IN ('A', 'B') THEN 1 ELSE 0 END) as high_tier
       FROM calling_member_tiers
       WHERE contact_type = 'member'`
    )
    const engagement = tierStats.total > 0
      ? Math.round((tierStats.high_tier / tierStats.total) * 100)
      : 0

    // 4. Tier distribution (for detail)
    const [tiers] = await pool.query(
      `SELECT tier, COUNT(*) as count FROM calling_member_tiers WHERE contact_type = 'member' GROUP BY tier ORDER BY tier ASC`
    )

    // 5. Call status distribution (for detail)
    const [statuses] = await pool.query(
      `SELECT status, COUNT(*) as count FROM calling_logs WHERE contact_type = 'member' GROUP BY status`
    )

    return Response.json({
      success: true,
      data: {
        gauges: {
          successRate: { label: 'การโทรสำเร็จ', value: successRate, color: '#0099cc' },
          coverage: { label: 'ความครอบคลุม', value: coverage, color: '#0099cc' },
          engagement: { label: 'ระดับสนใจสูง (A+B)', value: engagement, color: '#0099cc' }
        },
        tiers: tiers.map(row => ({
          name: `Tier ${row.tier}`,
          value: row.count,
          tier: row.tier
        })),
        statuses: statuses.map(row => ({
          name: formatStatusLabel(row.status),
          value: row.count,
          status: row.status
        }))
      }
    })
  } catch (error) {
    console.error('[GET /api/calling/stats]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

function formatStatusLabel(status) {
  const labels = {
    answered: 'รับสาย',
    no_answer: 'ไม่รับสาย',
    not_called: 'ยังไม่ได้โทร'
  }
  return labels[status] || status
}

function formatInterestLabel(level) {
  const labels = {
    1: 'ไม่สนใจ',
    2: 'สนใจนิดหน่อย',
    3: 'สนใจ',
    4: 'กระตือรือร้น'
  }
  return labels[level] || `Level ${level}`
}
