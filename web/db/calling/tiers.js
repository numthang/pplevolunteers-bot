import pool from '../index.js'

export async function getTier(memberId, contactType = 'member') {
  const { rows } = await pool.query(
    `SELECT * FROM calling_member_tiers WHERE member_id = $1 AND contact_type = $2`,
    [memberId, contactType]
  )
  return rows[0] || null
}

export async function getTiersByMembers(memberIds) {
  if (!memberIds || memberIds.length === 0) return []

  const { rows } = await pool.query(
    `SELECT * FROM calling_member_tiers WHERE member_id = ANY($1)`,
    [memberIds]
  )
  return rows
}

export async function getMembersByTier(guildId, tier) {
  const { rows } = await pool.query(
    `SELECT m.*, t.tier
     FROM ngs_member_cache m
     LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id::text
     WHERE m.guild_id = $1 AND COALESCE(t.tier::text, 'D') = $2
     ORDER BY m.first_name ASC`,
    [guildId, tier]
  )
  return rows
}

export async function upsertTier(guildId, memberId, tier, source = 'auto', contactType = 'member') {
  await pool.query(
    `INSERT INTO calling_member_tiers
      (member_id, contact_type, tier, tier_source, guild_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (member_id, contact_type) DO UPDATE SET
      tier = EXCLUDED.tier,
      tier_source = EXCLUDED.tier_source,
      updated_at = NOW()`,
    [memberId, contactType, tier, source, guildId]
  )
}

export async function overrideTier(guildId, memberId, tier, overrideBy, reason, contactType = 'member') {
  await pool.query(
    `INSERT INTO calling_member_tiers
      (member_id, contact_type, tier, tier_source, override_by, override_reason, guild_id, updated_at)
     VALUES ($1, $2, $3, 'manual', $4, $5, $6, NOW())
     ON CONFLICT (member_id, contact_type) DO UPDATE SET
      tier = EXCLUDED.tier,
      tier_source = 'manual',
      override_by = EXCLUDED.override_by,
      override_reason = EXCLUDED.override_reason,
      updated_at = NOW()`,
    [memberId, contactType, tier, overrideBy, reason || null, guildId]
  )
}

export async function calculateTierFromSignals(memberId, campaignId = null, contactType = 'member') {
  const params = [memberId, contactType]
  let query = `
    SELECT AVG(
      COALESCE(sig_location, 0) +
      COALESCE(sig_availability, 0) +
      COALESCE(sig_interest, 0)
    ) / 3.0 AS avg_signal
    FROM calling_logs
    WHERE member_id = $1 AND contact_type = $2
      AND status IN ('answered','met')
      AND (sig_location IS NOT NULL OR sig_availability IS NOT NULL OR sig_interest IS NOT NULL)`

  if (campaignId) {
    params.push(campaignId)
    query += ` AND campaign_id = $${params.length}`
  }

  const { rows } = await pool.query(query, params)
  const avgScore = rows[0]?.avg_signal || null

  if (!avgScore) return null

  if (avgScore >= 3.5) return 'A'
  if (avgScore >= 2.5) return 'B'
  if (avgScore >= 1.5) return 'C'
  return 'D'
}

export async function getTierDistribution() {
  const { rows } = await pool.query(
    `SELECT
       tier,
       COUNT(*) AS count
     FROM calling_member_tiers
     GROUP BY tier
     ORDER BY tier ASC`
  )
  return rows
}

export async function getTierWithMemberInfo(guildId, memberId) {
  const { rows } = await pool.query(
    `SELECT
       m.*,
       t.tier,
       t.tier_source,
       t.override_by,
       t.override_reason,
       t.updated_at AS tier_updated_at
     FROM ngs_member_cache m
     LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id::text
     WHERE m.source_id = $1 AND m.guild_id = $2`,
    [memberId, guildId]
  )
  return rows[0] || null
}

export async function updateFlag(guildId, memberId, flag, contactType = 'member') {
  await pool.query(
    `INSERT INTO calling_member_tiers (member_id, contact_type, tier, flag, guild_id, updated_at)
     VALUES ($1, $2, 'D', $3, $4, NOW())
     ON CONFLICT (member_id, contact_type) DO UPDATE SET
       flag = EXCLUDED.flag,
       updated_at = NOW()`,
    [memberId, contactType, flag || null, guildId]
  )
}

export async function clearOverride(guildId, memberId) {
  await pool.query(
    `UPDATE calling_member_tiers
     SET tier_source = 'auto',
         override_by = NULL,
         override_reason = NULL,
         updated_at = NOW()
     WHERE member_id = $1 AND guild_id = $2`,
    [memberId, guildId]
  )
}
