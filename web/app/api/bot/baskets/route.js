import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'

// GET /api/bot/baskets — รายการตะกร้าทั้งหมดใน guild ปัจจุบัน (ดูได้ทุก member, scope ด้วย guild)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)

  const { rows } = await pool.query(
    `SELECT
       channel_id,
       MAX(channel_name) AS channel_name,
       COUNT(*) FILTER (WHERE type = 'image') AS image_count,
       COUNT(*) FILTER (WHERE type = 'video') AS video_count,
       MAX(added_at) AS last_added,
       MAX(CASE WHEN type = 'caption' THEN caption END) AS caption,
       (SELECT array_agg(image_url ORDER BY sort_order ASC, added_at ASC)
        FROM dc_media_baskets b2
        WHERE b2.guild_id = $1 AND b2.channel_id = b1.channel_id AND b2.type = 'image') AS thumbnails
     FROM dc_media_baskets b1
     WHERE guild_id = $1
     GROUP BY channel_id
     ORDER BY MAX(added_at) DESC`,
    [guildId]
  )

  return Response.json({ guildId, baskets: rows })
}
