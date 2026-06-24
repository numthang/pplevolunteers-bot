import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getGuildId } from '@/lib/guildContext.js'

/**
 * GET /api/docs/members/recent?province=X&limit=10
 * ผู้รับเงินล่าสุดในจังหวัดนั้น (distinct, เรียงตามครั้งล่าสุด)
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const province = searchParams.get('province') || ''
  const limit    = Math.min(parseInt(searchParams.get('limit') || '8'), 20)
  const guildId  = await getGuildId(session)

  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (e.member_discord_id)
              m.discord_id, m.display_name, m.username, m.member_id,
              n.first_name, n.last_name,
              MAX(e.created_at) OVER (PARTITION BY e.member_discord_id) AS last_used
       FROM docs_activity_entries e
       JOIN dc_members m ON m.discord_id = e.member_discord_id AND m.guild_id = $1
       LEFT JOIN ngs_member_cache n ON n.source_id = m.member_id
       JOIN docs_projects dp ON dp.id = e.project_id
       JOIN act_event_cache ev ON ev.id = dp.act_event_id
       WHERE e.guild_id = $1
         AND e.member_discord_id IS NOT NULL
         AND ($2 = '' OR ev.province = $2)
       ORDER BY e.member_discord_id, last_used DESC
       LIMIT $3`,
      [guildId, province, limit]
    )
    return Response.json({ success: true, data: rows })
  } catch (err) {
    console.error('[GET /api/docs/members/recent]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
