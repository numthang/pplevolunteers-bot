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
 * Get assignment for specific campaign + member
 */
export async function getAssignment(campaignId, memberId) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_assignments
     WHERE campaign_id = ? AND member_id = ?`,
    [campaignId, memberId]
  )
  return rows[0] || null
}

/**
 * Get all assignments in campaign
 */
export async function getAssignmentsByCampaign(campaignId) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_assignments
     WHERE campaign_id = ?
     ORDER BY created_at DESC`,
    [campaignId]
  )
  return rows
}

/**
 * Get assignments for specific person in campaign
 */
export async function getAssignmentsForPerson(campaignId, discordId) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_assignments
     WHERE campaign_id = ? AND assigned_to = ?
     ORDER BY created_at DESC`,
    [campaignId, discordId]
  )
  return rows
}

/**
 * Assign member to person
 */
export async function assignMember(campaignId, memberId, assignedTo, assignedBy) {
  const [result] = await pool.query(
    `INSERT INTO calling_assignments
      (campaign_id, member_id, assigned_to, assigned_by, created_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      assigned_to = VALUES(assigned_to),
      assigned_by = VALUES(assigned_by)`,
    [campaignId, memberId, assignedTo, assignedBy]
  )
  return result.insertId || result.affectedRows
}

/**
 * Bulk assign members (upsert)
 */
export async function bulkAssignMembers(campaignId, memberIds, assignedTo, assignedBy) {
  if (!memberIds || memberIds.length === 0) return 0

  const values = memberIds.map(memberId => [campaignId, memberId, assignedTo, assignedBy])
  const [result] = await pool.query(
    `INSERT INTO calling_assignments
      (campaign_id, member_id, assigned_to, assigned_by, created_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
      assigned_to = VALUES(assigned_to),
      assigned_by = VALUES(assigned_by)`,
    [values]
  )
  return result.affectedRows
}

/**
 * Unassign member
 */
export async function unassignMember(campaignId, memberId) {
  await pool.query(
    `DELETE FROM calling_assignments
     WHERE campaign_id = ? AND member_id = ?`,
    [campaignId, memberId]
  )
}

/**
 * Get unassigned members in campaign
 */
export async function getUnassignedMembers(campaignId, limit = 100, offset = 0) {
  const [rows] = await pool.query(
    `SELECT m.* FROM calling_members_bq m
     LEFT JOIN calling_assignments a
       ON a.campaign_id = ? AND a.member_id = m.member_id
     WHERE a.id IS NULL
     ORDER BY m.name ASC
     LIMIT ? OFFSET ?`,
    [campaignId, limit, offset]
  )
  return rows
}

/**
 * Get unassigned count in campaign
 */
export async function getUnassignedCount(campaignId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM calling_members_bq m
     LEFT JOIN calling_assignments a
       ON a.campaign_id = ? AND a.member_id = m.member_id
     WHERE a.id IS NULL`,
    [campaignId]
  )
  return rows[0]?.count || 0
}
