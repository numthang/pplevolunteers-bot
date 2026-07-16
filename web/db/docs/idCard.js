import pool from '../index.js'

/**
 * สำเนาบัตรประชาชนเก็บใน org_members.id_card_image (BYTEA) แบบ per-guild
 * — guild ที่อัปโหลดไปเท่านั้นที่มีรูป (ตามที่ตัดสินใจ ไม่ใช่ ngs_member_cache ที่ sync ทับ)
 */

/** บันทึก/แทนที่รูปบัตรของ user ใน guild นั้น คืน true ถ้ามี row ให้อัปเดต */
export async function saveIdCard(discordId, guildId, imageBuffer) {
  const { rowCount } = await pool.query(
    `UPDATE org_members om SET id_card_image = $1
       FROM users u WHERE om.user_id = u.id AND u.discord_id = $2 AND om.guild_id = $3`,
    [imageBuffer, discordId, guildId]
  )
  return rowCount > 0
}

/** ดึงรูปบัตร (Buffer) ของ user ใน guild — null ถ้าไม่มี */
export async function getIdCard(discordId, guildId) {
  const { rows } = await pool.query(
    `SELECT om.id_card_image FROM org_members om
       JOIN users u ON u.id = om.user_id
      WHERE u.discord_id = $1 AND om.guild_id = $2`,
    [discordId, guildId]
  )
  return rows[0]?.id_card_image ?? null
}
