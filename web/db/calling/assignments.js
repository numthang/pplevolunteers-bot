import pool from '../index.js'

/**
 * Get assignment by ID
 */
export async function getAssignmentById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_assignments WHERE id = ?`,
    [id]
  )
  return rows[0] || null
}

/**
 * Get assignment for a member (campaign defaults to 0 / Undefined)
 */
export async function getAssignment(memberId, campaignId = 0, contactType = 'member') {
  const [rows] = await pool.query(
    `SELECT * FROM calling_assignments
     WHERE member_id = ? AND contact_type = ?
       AND campaign_id = ?`,
    [memberId, contactType, campaignId]
  )
  return rows[0] || null
}

/**
 * Get all assignments in campaign (defaults to 0 / Undefined)
 */
export async function getAssignmentsByCampaign(campaignId = 0) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_assignments
     WHERE campaign_id = ?
     ORDER BY created_at DESC`,
    [campaignId]
  )
  return rows
}

/**
 * Get assignments for specific person (campaign defaults to 0 / Undefined)
 */
export async function getAssignmentsForPerson(discordId, campaignId = 0) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_assignments
     WHERE assigned_to = ?
       AND campaign_id = ?
     ORDER BY created_at DESC`,
    [discordId, campaignId]
  )
  return rows
}

/**
 * Assign member to person (campaign defaults to 0 / Undefined)
 */
export async function assignMember(memberId, assignedTo, assignedBy, campaignId = 0, contactType = 'member') {
  const [result] = await pool.query(
    `INSERT INTO calling_assignments
      (campaign_id, contact_type, member_id, assigned_to, assigned_by, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      assigned_to = VALUES(assigned_to),
      assigned_by = VALUES(assigned_by)`,
    [campaignId || 0, contactType, memberId, assignedTo, assignedBy]
  )
  return result.insertId || result.affectedRows
}

/**
 * Bulk assign members (campaign defaults to 0 / Undefined)
 */
export async function bulkAssignMembers(memberIds, assignedTo, assignedBy, campaignId = 0, contactType = 'member') {
  if (!memberIds || memberIds.length === 0) return 0

  const values = memberIds.map(memberId => [campaignId || 0, contactType, memberId, assignedTo, assignedBy])
  const [result] = await pool.query(
    `INSERT INTO calling_assignments
      (campaign_id, contact_type, member_id, assigned_to, assigned_by)
     VALUES ?
     ON DUPLICATE KEY UPDATE
      assigned_to = VALUES(assigned_to),
      assigned_by = VALUES(assigned_by)`,
    [values]
  )
  return result.affectedRows
}

/**
 * Update RSVP for an assignment
 */
export async function updateRsvp(memberId, campaignId = 0, rsvp, contactType = 'member') {
  await pool.query(
    `UPDATE calling_assignments SET rsvp = ?
     WHERE member_id = ? AND contact_type = ? AND campaign_id = ?`,
    [rsvp || null, memberId, contactType, campaignId]
  )
}

/**
 * Unassign member (campaign defaults to 0 / Undefined)
 */
export async function unassignMember(memberId, campaignId = 0, contactType = 'member') {
  await pool.query(
    `DELETE FROM calling_assignments
     WHERE member_id = ? AND contact_type = ? AND campaign_id = ?`,
    [memberId, contactType, campaignId]
  )
}

/**
 * Get unassigned members (campaign defaults to 0 / Undefined)
 */
export async function getUnassignedMembers(campaignId = 0, limit = 100, offset = 0) {
  const [rows] = await pool.query(
    `SELECT m.* FROM ngs_member_cache m
     LEFT JOIN calling_assignments a
       ON a.campaign_id = ? AND a.member_id = m.source_id
     WHERE a.id IS NULL
     ORDER BY m.home_amphure ASC, m.first_name ASC
     LIMIT ? OFFSET ?`,
    [campaignId, limit, offset]
  )
  return rows
}

/**
 * Get unassigned count (campaign defaults to 0 / Undefined)
 */
export async function getUnassignedCount(campaignId = 0) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM ngs_member_cache m
     LEFT JOIN calling_assignments a
       ON a.campaign_id = ? AND a.member_id = m.source_id
     WHERE a.id IS NULL`,
    [campaignId]
  )
  return rows[0]?.count || 0
}
