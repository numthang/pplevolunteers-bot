import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'

const districtCache = new Map()
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

function getCacheKey(campaignId, amphure) {
  return `campaign:${campaignId}:amphure:${amphure}`
}

function getCached(key) {
  const cached = districtCache.get(key)
  if (!cached) return null
  if (Date.now() > cached.expiresAt) {
    districtCache.delete(key)
    return null
  }
  return cached.value
}

function setCached(key, value) {
  districtCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL
  })
}

/**
 * GET /api/calling/districts
 * Fetch districts (home_district) for a specific amphure in a campaign
 * ?campaignId=X&amphure=Y
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const campaignId = parseInt(searchParams.get('campaignId'))
  const amphure = searchParams.get('amphure')

  if (!campaignId || !amphure) {
    return Response.json({ error: 'Missing campaignId or amphure' }, { status: 400 })
  }

  try {
    const cacheKey = getCacheKey(campaignId, amphure)
    const cached = getCached(cacheKey)

    if (cached) {
      return Response.json({ success: true, data: cached, cached: true })
    }

    const [rows] = await pool.query(
      `SELECT DISTINCT COALESCE(m.home_district, '') AS district, COUNT(DISTINCT m.source_id) AS count
       FROM act_event_cache cc
       JOIN ngs_member_cache m ON (cc.province IS NULL OR m.home_province = cc.province)
       WHERE cc.id = ? AND cc.type = 'campaign'
         AND m.home_amphure = ?
         AND m.mobile_number IS NOT NULL
       GROUP BY district
       ORDER BY district`,
      [campaignId, amphure]
    )

    const districts = rows.map(r => ({
      name: r.district,
      count: Number(r.count)
    }))

    setCached(cacheKey, districts)

    return Response.json({ success: true, data: districts, cached: false })
  } catch (error) {
    console.error('[GET /api/calling/districts]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
