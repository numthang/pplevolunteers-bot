import pool from '../index.js'

export async function getFavorites(guildId, userDiscordId) {
  const [rows] = await pool.query(
    `SELECT member_id, contact_type, note, created_at
     FROM calling_favorites
     WHERE guild_id = ? AND user_discord_id = ?
     ORDER BY created_at DESC`,
    [guildId, userDiscordId]
  )
  return rows
}

export async function isFavorite(guildId, userDiscordId, memberId, contactType = 'member') {
  const [rows] = await pool.query(
    `SELECT 1 FROM calling_favorites
     WHERE guild_id = ? AND user_discord_id = ? AND member_id = ? AND contact_type = ?
     LIMIT 1`,
    [guildId, userDiscordId, String(memberId), contactType]
  )
  return rows.length > 0
}

export async function getFavoriteSet(guildId, userDiscordId, contactType = 'member') {
  const [rows] = await pool.query(
    `SELECT member_id FROM calling_favorites
     WHERE guild_id = ? AND user_discord_id = ? AND contact_type = ?`,
    [guildId, userDiscordId, contactType]
  )
  return new Set(rows.map(r => String(r.member_id)))
}

export async function addFavorite(guildId, userDiscordId, memberId, contactType = 'member', note = null) {
  await pool.query(
    `INSERT IGNORE INTO calling_favorites
       (guild_id, user_discord_id, member_id, contact_type, note)
     VALUES (?, ?, ?, ?, ?)`,
    [guildId, userDiscordId, String(memberId), contactType, note]
  )
}

export async function removeFavorite(guildId, userDiscordId, memberId, contactType = 'member') {
  await pool.query(
    `DELETE FROM calling_favorites
     WHERE guild_id = ? AND user_discord_id = ? AND member_id = ? AND contact_type = ?`,
    [guildId, userDiscordId, String(memberId), contactType]
  )
}

export async function getFavoritesEnriched(guildId, userDiscordId) {
  const [favRows] = await pool.query(
    `SELECT member_id, contact_type, note, created_at
     FROM calling_favorites
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

export async function updateFavoriteNote(guildId, userDiscordId, memberId, contactType, note) {
  await pool.query(
    `UPDATE calling_favorites SET note = ?
     WHERE guild_id = ? AND user_discord_id = ? AND member_id = ? AND contact_type = ?`,
    [note, guildId, userDiscordId, String(memberId), contactType]
  )
}
