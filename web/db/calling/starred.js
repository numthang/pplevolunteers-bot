import pool from '../index.js'

export async function getFavorites(guildId, userDiscordId) {
  const [rows] = await pool.query(
    `SELECT member_id, contact_type, note, created_at
     FROM calling_starred
     WHERE guild_id = ? AND user_discord_id = ?
     ORDER BY created_at DESC`,
    [guildId, userDiscordId]
  )
  return rows
}

export async function isFavorite(guildId, userDiscordId, memberId, contactType = 'member') {
  const [rows] = await pool.query(
    `SELECT 1 FROM calling_starred
     WHERE guild_id = ? AND user_discord_id = ? AND member_id = ? AND contact_type = ?
     LIMIT 1`,
    [guildId, userDiscordId, String(memberId), contactType]
  )
  return rows.length > 0
}

export async function getFavoriteSet(guildId, userDiscordId, contactType = 'member') {
  const [rows] = await pool.query(
    `SELECT member_id FROM calling_starred
     WHERE guild_id = ? AND user_discord_id = ? AND contact_type = ?`,
    [guildId, userDiscordId, contactType]
  )
  return new Set(rows.map(r => String(r.member_id)))
}

export async function addFavorite(guildId, userDiscordId, memberId, contactType = 'member', note = null) {
  await pool.query(
    `INSERT IGNORE INTO calling_starred
       (guild_id, user_discord_id, member_id, contact_type, note)
     VALUES (?, ?, ?, ?, ?)`,
    [guildId, userDiscordId, String(memberId), contactType, note]
  )
}

export async function removeFavorite(guildId, userDiscordId, memberId, contactType = 'member') {
  await pool.query(
    `DELETE FROM calling_starred
     WHERE guild_id = ? AND user_discord_id = ? AND member_id = ? AND contact_type = ?`,
    [guildId, userDiscordId, String(memberId), contactType]
  )
}

export async function getFavoritesEnriched(guildId, userDiscordId) {
  const [favRows] = await pool.query(
    `SELECT member_id, contact_type, note, created_at
     FROM calling_starred
     WHERE guild_id = ? AND user_discord_id = ?
     ORDER BY created_at DESC`,
    [guildId, userDiscordId]
  )
  if (favRows.length === 0) return []

  const memberIds  = favRows.filter(r => r.contact_type === 'member').map(r => r.member_id)
  const contactIds = favRows.filter(r => r.contact_type === 'contact').map(r => r.member_id)

  const [members, contacts] = await Promise.all([
    memberIds.length === 0 ? [] : pool.query(
      `SELECT source_id, first_name, last_name, mobile_number AS phone,
              home_province, home_amphure AS home_district, date_of_birth
       FROM ngs_member_cache WHERE source_id IN (?)`,
      [memberIds]
    ).then(([r]) => r),
    contactIds.length === 0 ? [] : pool.query(
      `SELECT id, first_name, last_name, phone, province, amphoe, category
       FROM calling_contacts WHERE id IN (?)`,
      [contactIds]
    ).then(([r]) => r),
  ])

  const memberMap  = new Map(members.map(m  => [String(m.source_id), m]))
  const contactMap = new Map(contacts.map(c => [String(c.id), c]))

  return favRows.map(f => {
    const target = f.contact_type === 'member' ? memberMap.get(String(f.member_id)) : contactMap.get(String(f.member_id))
    return {
      member_id:    f.member_id,
      contact_type: f.contact_type,
      note:         f.note,
      created_at:   f.created_at,
      data:         target || null,
    }
  })
}

export async function getFavoritesDisplay(guildId, userDiscordId, { name, limit = 100, offset = 0 } = {}) {
  const keyword = name || null
  const like = keyword ? `%${keyword}%` : null
  const nameFilter = keyword
    ? `AND (? IS NULL OR (
        (f.contact_type = 'member'  AND (m.full_name LIKE ? OR m.mobile_number LIKE ?))
        OR (f.contact_type = 'contact' AND (CONCAT(c.first_name, ' ', COALESCE(c.last_name,'')) LIKE ? OR c.phone LIKE ?))
      ))`
    : ''
  const [rows] = await pool.query(
    `SELECT
       f.member_id, f.contact_type, f.note AS fav_note, f.created_at AS fav_at,
       CASE WHEN f.contact_type = 'member'
         THEN m.full_name
         ELSE CONCAT(c.first_name, IF(c.last_name IS NOT NULL AND c.last_name != '', CONCAT(' ', c.last_name), ''))
       END AS full_name,
       CASE WHEN f.contact_type = 'member' THEN m.mobile_number ELSE c.phone   END AS mobile_number,
       CASE WHEN f.contact_type = 'member' THEN m.home_district ELSE c.tambon  END AS home_district,
       CASE WHEN f.contact_type = 'member' THEN m.home_amphure  ELSE c.amphoe  END AS home_amphure,
       CASE WHEN f.contact_type = 'member' THEN m.home_province ELSE c.province END AS home_province,
       COALESCE(t.tier, 'D') AS tier,
       dc.avatar AS discord_avatar,
       dc.discord_id,
       m.membership_type,
       c.category
     FROM calling_starred f
     LEFT JOIN ngs_member_cache m
       ON f.contact_type = 'member' AND m.source_id = f.member_id
     LEFT JOIN calling_member_tiers t
       ON f.contact_type = 'member' AND t.member_id = f.member_id AND t.contact_type = 'member'
     LEFT JOIN dc_members dc
       ON f.contact_type = 'member' AND dc.serial = m.serial AND dc.guild_id = ?
     LEFT JOIN calling_contacts c
       ON f.contact_type = 'contact' AND c.id = f.member_id
     WHERE f.guild_id = ? AND f.user_discord_id = ?
     ${nameFilter}
     ORDER BY f.created_at DESC
     LIMIT ? OFFSET ?`,
    keyword
      ? [guildId, guildId, userDiscordId, keyword, like, like, like, like, limit, offset]
      : [guildId, guildId, userDiscordId, limit, offset]
  )
  return rows
}

export async function updateFavoriteNote(guildId, userDiscordId, memberId, contactType, note) {
  await pool.query(
    `UPDATE calling_starred SET note = ?
     WHERE guild_id = ? AND user_discord_id = ? AND member_id = ? AND contact_type = ?`,
    [note, guildId, userDiscordId, String(memberId), contactType]
  )
}
