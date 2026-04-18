import pool from '../index.js'

/**
 * Get tier for member
 */
export async function getTier(memberId) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_member_tiers WHERE member_id = ?`,
    [memberId]
  )
  return rows[0] || null
}

/**
 * Get tiers for multiple members
 */
export async function getTiersByMembers(memberIds) {
  if (!memberIds || memberIds.length === 0) return []

  const placeholders = memberIds.map(() => '?').join(',')
  const [rows] = await pool.query(
    `SELECT * FROM calling_member_tiers WHERE member_id IN (${placeholders})`,
    memberIds
  )
  return rows
}

/**
 * Get all members grouped by tier
 */
export async function getMembersByTier(tier) {
  const [rows] = await pool.query(
    `SELECT m.*, t.tier
     FROM ngs_member_cache m
     LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id
     WHERE COALESCE(t.tier, 'D') = ?
     ORDER BY m.first_name ASC`,
    [tier]
  )
  return rows
}

/**
 * Upsert tier (auto-calculated)
 */
export async function upsertTier(memberId, tier, source = 'auto') {
  await pool.query(
    `INSERT INTO calling_member_tiers
      (member_id, tier, tier_source, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      tier = VALUES(tier),
      tier_source = VALUES(tier_source),
      updated_at = NOW()`,
    [memberId, tier, source]
  )
}

/**
 * Manually override tier
 */
export async function overrideTier(memberId, tier, overrideBy, reason) {
  await pool.query(
    `INSERT INTO calling_member_tiers
      (member_id, tier, tier_source, override_by, override_reason, updated_at)
     VALUES (?, ?, 'manual', ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      tier = VALUES(tier),
      tier_source = 'manual',
      override_by = VALUES(override_by),
      override_reason = VALUES(override_reason),
      updated_at = NOW()`,
    [memberId, tier, overrideBy, reason || null]
  )
}

/**
 * Calculate tier from signals (average of answered calls)
 * Returns A/B/C/D
 * score = average of signals
 * A = 3.5 - 4.0
 * B = 2.5 - 3.4
 * C = 1.5 - 2.4
 * D = 1.0 - 1.4
 */
export async function calculateTierFromSignals(memberId, campaignId = null) {
  let query = `
    SELECT AVG(
      COALESCE(sig_location, 0) +
      COALESCE(sig_availability, 0) +
      COALESCE(sig_interest, 0)
    ) / 3.0 AS avg_signal
    FROM calling_logs
    WHERE member_id = ?
      AND status = 'answered'`

  const params = [memberId]

  if (campaignId) {
    query += ` AND campaign_id = ?`
    params.push(campaignId)
  }

  const [rows] = await pool.query(query, params)
  const avgScore = rows[0]?.avg_signal || null

  if (!avgScore) return null

  if (avgScore >= 3.5) return 'A'
  if (avgScore >= 2.5) return 'B'
  if (avgScore >= 1.5) return 'C'
  return 'D'
}

/**
 * Get tier distribution (count by tier)
 */
export async function getTierDistribution() {
  const [rows] = await pool.query(
    `SELECT
       tier,
       COUNT(*) AS count
     FROM calling_member_tiers
     GROUP BY tier
     ORDER BY tier ASC`
  )
  return rows
}

/**
 * Get tier with full member info
 */
export async function getTierWithMemberInfo(memberId) {
  const [rows] = await pool.query(
    `SELECT
       m.*,
       t.tier,
       t.tier_source,
       t.override_by,
       t.override_reason,
       t.updated_at AS tier_updated_at
     FROM ngs_member_cache m
     LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id
     WHERE m.source_id = ?`,
    [memberId]
  )
  return rows[0] || null
}

/**
 * Clear manual override (revert to auto)
 */
export async function clearOverride(memberId) {
  await pool.query(
    `UPDATE calling_member_tiers
     SET tier_source = 'auto',
         override_by = NULL,
         override_reason = NULL,
         updated_at = NOW()
     WHERE member_id = ?`,
    [memberId]
  )
}
