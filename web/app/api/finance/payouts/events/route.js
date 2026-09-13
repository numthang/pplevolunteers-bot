import pool from '@/db/index.js'
import { requireSession } from '../_guard.js'

/**
 * กิจกรรมสำหรับผูกกับรอบจ่าย
 *
 * ทำไมไม่เรียก /api/docs/events ซ้ำ: เส้นนั้นกั้นด้วย canManageDocs — คนคุมบัญชีเขต
 * ไม่จำเป็นต้องมีสิทธิ์โมดูล Docs ด้วย · ที่นี่กั้นแค่ "อยู่ใน org" แล้วจำกัด scope ด้วย org bridge
 * (cache_pple_event ยัง guild-based อยู่ — ต้องวิ่งผ่าน dc_guilds เหมือน getDocEvents)
 */
export async function GET(req) {
  const ctx = await requireSession()
  if (ctx.error) return ctx.error

  const q = new URL(req.url).searchParams.get('q') || ''
  const params = [ctx.orgId]
  let sql = `
    SELECT id, name, province, TO_CHAR(event_date, 'YYYY-MM-DD') AS event_date
      FROM cache_pple_event
     WHERE guild_id IN (SELECT guild_id FROM dc_guilds WHERE org_id = $1)
       AND type = 'event'`
  if (q) {
    params.push(`%${q}%`)
    sql += ` AND name ILIKE $${params.length}`
  }
  sql += ` ORDER BY event_date DESC NULLS LAST LIMIT 100`

  const { rows } = await pool.query(sql, params)
  return Response.json(rows)
}
