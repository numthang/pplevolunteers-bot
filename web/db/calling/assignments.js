import pool from '../index.js'

/**
 * Get assignment by ID
 */
export async function getAssignmentById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM calling_assignments WHERE id = $1`,
    [id]
  )
  return rows[0] || null
}

/**
 * Get assignment for a member (campaign defaults to 0 / Undefined)
 */
export async function getAssignment(memberId, campaignId = 0, contactType = 'member') {
  const { rows } = await pool.query(
    `SELECT * FROM calling_assignments
     WHERE member_id = $1 AND contact_type = $2
       AND campaign_id = $3`,
    [memberId, contactType, campaignId]
  )
  return rows[0] || null
}

/**
 * Get all assignments in campaign (defaults to 0 / Undefined)
 */
export async function getAssignmentsByCampaign(campaignId = 0) {
  const { rows } = await pool.query(
    `SELECT * FROM calling_assignments
     WHERE campaign_id = $1
     ORDER BY created_at DESC`,
    [campaignId]
  )
  return rows
}

/**
 * Get assignments for specific person (campaign defaults to 0 / Undefined)
 */
export async function getAssignmentsForPerson(discordId, campaignId = 0) {
  const { rows } = await pool.query(
    `SELECT * FROM calling_assignments
     WHERE assigned_to = $1
       AND campaign_id = $2
     ORDER BY created_at DESC`,
    [discordId, campaignId]
  )
  return rows
}

/**
 * Assign member to person (campaign defaults to 0 / Undefined)
 */
export async function assignMember(memberId, assignedTo, assignedBy, campaignId = 0, contactType = 'member') {
  const { rows } = await pool.query(
    `INSERT INTO calling_assignments
      (campaign_id, contact_type, member_id, assigned_to, assigned_by, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (campaign_id, member_id, contact_type) DO UPDATE SET
      assigned_to = EXCLUDED.assigned_to,
      assigned_by = EXCLUDED.assigned_by
     RETURNING id`,
    [campaignId || 0, contactType, memberId, assignedTo, assignedBy]
  )
  return rows[0]?.id
}

/**
 * Bulk assign members (campaign defaults to 0 / Undefined)
 */
export async function bulkAssignMembers(memberIds, assignedTo, assignedBy, campaignId = 0, contactType = 'member') {
  if (!memberIds || memberIds.length === 0) return 0

  const values = []
  const params = []
  let p = 1
  for (const memberId of memberIds) {
    values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`)
    params.push(campaignId || 0, contactType, memberId, assignedTo, assignedBy)
  }
  const result = await pool.query(
    `INSERT INTO calling_assignments
      (campaign_id, contact_type, member_id, assigned_to, assigned_by)
     VALUES ${values.join(', ')}
     ON CONFLICT (campaign_id, member_id, contact_type) DO UPDATE SET
      assigned_to = EXCLUDED.assigned_to,
      assigned_by = EXCLUDED.assigned_by`,
    params
  )
  return result.rowCount
}

/**
 * Update RSVP for an assignment
 */
export async function updateRsvp(memberId, campaignId = 0, rsvp, contactType = 'member') {
  await pool.query(
    `UPDATE calling_assignments SET rsvp = $1
     WHERE member_id = $2 AND contact_type = $3 AND campaign_id = $4`,
    [rsvp || null, memberId, contactType, campaignId]
  )
}

/**
 * Unassign member (campaign defaults to 0 / Undefined)
 */
export async function unassignMember(memberId, campaignId = 0, contactType = 'member') {
  await pool.query(
    `DELETE FROM calling_assignments
     WHERE member_id = $1 AND contact_type = $2 AND campaign_id = $3`,
    [memberId, contactType, campaignId]
  )
}

/**
 * Get unassigned members (campaign defaults to 0 / Undefined)
 */
export async function getUnassignedMembers(campaignId = 0, limit = 100, offset = 0) {
  const { rows } = await pool.query(
    `SELECT m.* FROM ngs_member_cache m
     LEFT JOIN calling_assignments a
       ON a.campaign_id = $1 AND a.member_id = m.source_id::text
     WHERE a.id IS NULL
     ORDER BY m.home_amphure ASC, m.first_name ASC
     LIMIT $2 OFFSET $3`,
    [campaignId, limit, offset]
  )
  return rows
}

/**
 * Get unassigned count (campaign defaults to 0 / Undefined)
 */
export async function getUnassignedCount(campaignId = 0) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM ngs_member_cache m
     LEFT JOIN calling_assignments a
       ON a.campaign_id = $1 AND a.member_id = m.source_id::text
     WHERE a.id IS NULL`,
    [campaignId]
  )
  return Number(rows[0]?.count) || 0
}
