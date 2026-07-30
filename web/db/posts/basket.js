// web/db/posts/basket.js — หา "ตะกร้าของห้องนี้" ฝั่งเว็บ
//
// ⚠️ ก้อน 4c (2026-07-30): ตะกร้าไม่มีตารางของตัวเองแล้ว — เป็นแถวใน post_episodes ที่
//    `channel_id = ห้องนั้น AND archived_at IS NULL` (partial unique index บังคับให้เหลือใบเดียว)
//
// ⚠️ ยุบหน้าตะกร้า (2026-07-30, เย็น): UI ตะกร้าถูกยุบเข้า /posts + /posts/[id] แล้ว
//    ฟังก์ชันอ่าน/แก้ตะกร้าฝั่งเว็บ (getBasketContent / listGuildBaskets / reorderBasketImages /
//    setBasketCaption / deleteBasketMedia / clearBasket / getBasketMediaWithScope) **ลบทิ้งแล้ว**
//    ทุกอย่างเดินผ่าน /api/posts/* ตัวเดียว · ที่นี่เหลือแค่ตัวหาโพสต์จาก guild+channel
//    ให้ตัว redirect ที่ /bot/media/basket ใช้ (ลิงก์เก่าในข้อความ Discord แก้ย้อนหลังไม่ได้)
//
//    ฝั่งบอท `db/mediaBasket.js` **ยังใช้เต็มตัว ห้ามลบ** — คนละ pool คนละ module system
import pool from '../index.js'

/** ตะกร้าที่เปิดอยู่ของห้อง — คืน null ถ้าห้องนี้ไม่มีตะกร้า */
export async function getOpenBasket(guildId, channelId) {
  const { rows } = await pool.query(
    `SELECT id, org_id, channel_name, body FROM post_episodes
      WHERE channel_id = $2 AND guild_id = $1 AND archived_at IS NULL LIMIT 1`,
    [guildId, channelId]
  )
  return rows[0] || null
}
