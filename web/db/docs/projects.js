import pool from '../index.js'
import { randomBytes } from 'crypto'

function genToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from(randomBytes(8)).map(b => chars[b % 62]).join('')
}

function sixMonthsFromNow() {
  const d = new Date()
  d.setMonth(d.getMonth() + 6)
  return d
}

/** list events จาก cache_pple_event โดยตรง, LEFT JOIN docs_projects เพื่อดู status
 *  cache_pple_event ยังคง guild-based (ACT/Discord artifact ไม่แตะ) — scope ให้ org
 *  ด้วย e.guild_id IN (guild ที่เป็นของ org นี้) เหมือน db/calling/campaigns.js */
export async function getDocEvents(orgId, provinces = null) {
  const params = [orgId]
  let query = `
    SELECT
      e.id AS act_event_cache_id,
      e.name AS event_name, e.province, e.image_url,
      TO_CHAR(e.event_date,     'YYYY-MM-DD"T"HH24:MI') AS event_date,
      TO_CHAR(e.event_end_date, 'YYYY-MM-DD"T"HH24:MI') AS event_end_date,
      p.id, p.is_mobile, p.participant_count, p.budget, p.status,
      COUNT(DISTINCT dae.id)                                       AS entry_count,
      COUNT(DISTINCT dae.id) FILTER (WHERE dae.status = 'signed')  AS signed_count
    FROM cache_pple_event e
    LEFT JOIN docs_projects p ON p.cache_pple_event_id = e.id AND p.org_id = $1
    LEFT JOIN docs_activity_entries dae ON dae.project_id = p.id
    WHERE e.type = 'event' AND e.guild_id IN (SELECT guild_id FROM dc_guilds WHERE org_id = $1)`

  if (provinces) {
    params.push(provinces)
    query += ` AND (e.province = ANY($${params.length}) OR e.province IS NULL)`
  }

  query += ` GROUP BY e.id, p.id ORDER BY e.event_date DESC NULLS LAST`
  const { rows } = await pool.query(query, params)
  return rows
}

/** compat: ใช้ใน places ที่ยังอ้าง getDocProjects */
export const getDocProjects = getDocEvents

export async function getDocProjectByEventId(actEventCacheId, orgId) {
  const { rows } = await pool.query(
    `SELECT
       p.*, e.name AS event_name, e.province, e.image_url, e.location, e.act_event_id,
       TO_CHAR(e.event_date,     'YYYY-MM-DD"T"HH24:MI') AS event_date,
       TO_CHAR(e.event_end_date, 'YYYY-MM-DD"T"HH24:MI') AS event_end_date
     FROM docs_projects p
     JOIN cache_pple_event e ON e.id = p.cache_pple_event_id
     WHERE p.cache_pple_event_id = $1 AND p.org_id = $2`,
    [actEventCacheId, orgId]
  )
  return rows[0] || null
}

/** upsert: สร้าง docs_project ถ้ายังไม่มี, return project id */
export async function upsertDocProject({ orgId, actEventCacheId, isMobile, participantCount, budget, allowedItems, projectName, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO docs_projects
       (org_id, cache_pple_event_id, is_mobile, participant_count, budget, allowed_items, project_name, created_by,
        project_token, project_token_expires)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (org_id, cache_pple_event_id) DO UPDATE SET
       is_mobile         = COALESCE(EXCLUDED.is_mobile,         docs_projects.is_mobile),
       participant_count = COALESCE(EXCLUDED.participant_count, docs_projects.participant_count),
       budget            = COALESCE(EXCLUDED.budget,            docs_projects.budget),
       allowed_items     = COALESCE(EXCLUDED.allowed_items,     docs_projects.allowed_items),
       project_name      = COALESCE(EXCLUDED.project_name,      docs_projects.project_name)
     RETURNING id`,
    [orgId, actEventCacheId, isMobile ?? false, participantCount ?? null, budget ?? null,
     JSON.stringify(allowedItems ?? []), projectName ?? null, createdBy,
     genToken(), sixMonthsFromNow()]
  )
  return rows[0].id
}

export async function getDocProjectById(orgId, id) {
  const { rows } = await pool.query(
    `SELECT
       p.*, e.name AS event_name, e.province, e.image_url,
       TO_CHAR(e.event_date,     'YYYY-MM-DD"T"HH24:MI') AS event_date,
       TO_CHAR(e.event_end_date, 'YYYY-MM-DD"T"HH24:MI') AS event_end_date
     FROM docs_projects p
     JOIN cache_pple_event e ON e.id = p.cache_pple_event_id
     WHERE p.id = $1 AND p.org_id = $2`,
    [id, orgId]
  )
  return rows[0] || null
}

export async function createDocProject({ orgId, actEventCacheId, isMobile, participantCount, budget, allowedItems, projectName, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO docs_projects
       (org_id, cache_pple_event_id, is_mobile, participant_count, budget, allowed_items, project_name, created_by,
        project_token, project_token_expires)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [orgId, actEventCacheId, isMobile ?? false, participantCount, budget, JSON.stringify(allowedItems ?? []), projectName ?? null, createdBy,
     genToken(), sixMonthsFromNow()]
  )
  return rows[0].id
}

/** ดึง event_date/end_date จาก cache_pple_event เมื่อยังไม่มี docs_project */
export async function getActEventById(actEventCacheId, guildId) {
  const { rows } = await pool.query(
    `SELECT name, province, act_event_id,
            TO_CHAR(event_date,     'YYYY-MM-DD"T"HH24:MI') AS event_date,
            TO_CHAR(event_end_date, 'YYYY-MM-DD"T"HH24:MI') AS event_end_date
     FROM cache_pple_event WHERE id = $1 AND guild_id = $2`,
    [actEventCacheId, guildId]
  )
  return rows[0] || null
}

export async function getProjectByToken(token) {
  const { rows } = await pool.query(
    `SELECT p.*, e.name AS event_name, e.province,
            TO_CHAR(e.event_date, 'YYYY-MM-DD"T"HH24:MI') AS event_date
     FROM docs_projects p
     JOIN cache_pple_event e ON e.id = p.cache_pple_event_id
     WHERE p.project_token = $1 AND p.project_token_expires > NOW()`,
    [token]
  )
  return rows[0] || null
}

export async function regenerateToken(projectId) {
  const token = genToken()
  const expires = sixMonthsFromNow()
  await pool.query(
    `UPDATE docs_projects SET project_token = $2, project_token_expires = $3 WHERE id = $1`,
    [projectId, token, expires]
  )
  return { token, expires }
}

export async function updateDocProject(id, { isMobile, participantCount, budget, allowedItems, projectName, status }) {
  await pool.query(
    `UPDATE docs_projects SET
       is_mobile         = COALESCE($2, is_mobile),
       participant_count = COALESCE($3, participant_count),
       budget            = COALESCE($4, budget),
       allowed_items     = COALESCE($5, allowed_items),
       project_name      = COALESCE($6, project_name),
       status            = COALESCE($7, status)
     WHERE id = $1`,
    [id, isMobile, participantCount, budget, allowedItems ? JSON.stringify(allowedItems) : null, projectName ?? null, status]
  )
}
