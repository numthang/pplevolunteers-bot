// web/db/kanban/boards.js — กระดาน (kanban_boards) ก้อน 3
//
// ดีไซน์: md/kanban/KANBAN.md §Data model + §สิทธิ์
//
// ⭐ 3 กติกาของก้อนนี้:
//   1. **guild_id เป็นป้าย ไม่ใช่ชั้นข้อมูล** (เคาะ 2026-08-24) — user มอง guild เป็น workspace
//      (org 1 คร่อม 3 guild) แต่ระบบห้ามอ่านงานผ่าน guild เป็นชั้นบังคับ ไม่งั้นผูกตายกับ Discord
//      ขัดเป้าหมาย "ไม่มี Discord ก็ใช้ได้" · ใช้จัดกลุ่มรายชื่อบนเว็บ + ให้บอทเสนอบอร์ดของเซิร์ฟนั้นก่อน
//   2. ⛔ **ไม่มี kanban_columns** — ช่องยังเป็น status_type 6 แบบตรงๆ (ดีไซน์ §MVP)
//      ห้ามเพิ่มตารางช่องโดยไม่อ่าน §แบ่งก้อนงาน ก่อน: ช่องกลายเป็นแหล่งสถานะที่ 2 = ทั้งดีไซน์พัง
//   3. ทุก query มี org_id ใน WHERE เสมอ — ไม่พบ = ข้าม org หรือไม่มีจริง (guard ตอบ 404 ไม่ใช่ 403)
import pool from '../index.js'

const COLS = `b.id, b.org_id, b.guild_id, b.name, b.detail, b.open_to_org,
              b.sort_order, b.archived_at, b.created_by, b.created_at,
              (SELECT g.name FROM dc_guilds g WHERE g.guild_id = b.guild_id) AS guild_name`

// จำนวนการ์ดที่ยังไม่เข้ากรุ — dropdown เลือกกระดานโชว์ตัวเลขนี้ข้างชื่อ
const CARD_COUNT = `(SELECT count(*) FROM kanban_cards c
                      WHERE c.board_id = b.id AND c.archived_at IS NULL)::int AS card_count`

function shape(row) {
  if (!row) return null
  return { ...row, id: Number(row.id), card_count: row.card_count ?? 0 }
}

export async function listBoards(orgId, { includeArchived = false } = {}) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${CARD_COUNT}
       FROM kanban_boards b
      WHERE b.org_id = $1 ${includeArchived ? '' : 'AND b.archived_at IS NULL'}
      ORDER BY b.sort_order, b.id`,
    [orgId]
  )
  return rows.map(shape)
}

export async function getBoard(orgId, id) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${CARD_COUNT} FROM kanban_boards b WHERE b.org_id = $1 AND b.id = $2`,
    [orgId, id]
  )
  return shape(rows[0])
}

/**
 * กระดานตั้งต้นของ org — ตัวแรกตามลำดับที่แสดง
 * ใช้ตอนมีคนสร้างการ์ดโดยไม่ระบุกระดาน (บอท · context menu ในดิสฯ · import)
 * สร้างให้อัตโนมัติถ้า org ยังไม่มีสักใบ — kanban_cards.board_id เป็น NOT NULL
 * จะปล่อยให้ INSERT พังเพราะ "ยังไม่เคยเข้าหน้าเว็บ" ไม่ได้
 */
export async function ensureDefaultBoard(orgId, createdBy) {
  const { rows } = await pool.query(
    `SELECT id FROM kanban_boards WHERE org_id = $1 AND archived_at IS NULL
      ORDER BY sort_order, id LIMIT 1`,
    [orgId]
  )
  if (rows[0]) return Number(rows[0].id)

  const { rows: made } = await pool.query(
    `INSERT INTO kanban_boards (org_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [orgId, 'กระดานหลัก', createdBy]
  )
  return Number(made[0].id)
}

/** สร้างกระดาน — user เคาะ 2026-08-24: กรอก "ชื่ออย่างเดียว" ที่เหลือไปตั้งทีหลังในเฟืองของกระดาน */
export async function createBoard(orgId, { name, guildId = null, detail = null, openToOrg = true }, createdBy) {
  const { rows } = await pool.query(
    `INSERT INTO kanban_boards (org_id, guild_id, name, detail, open_to_org, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM kanban_boards WHERE org_id = $1),
             $6)
     RETURNING id`,
    [orgId, guildId, name, detail, openToOrg, createdBy]
  )
  return await getBoard(orgId, rows[0].id)
}

export async function updateBoard(orgId, id, { name, detail, guildId, openToOrg } = {}) {
  const sets = []
  const params = [orgId, id]
  const put = (sql, val) => { params.push(val); sets.push(`${sql} = $${params.length}`) }

  if (name !== undefined)      put('name', name)
  if (detail !== undefined)    put('detail', detail)
  if (guildId !== undefined)   put('guild_id', guildId)
  if (openToOrg !== undefined) put('open_to_org', openToOrg)
  if (!sets.length) return await getBoard(orgId, id)

  await pool.query(`UPDATE kanban_boards SET ${sets.join(', ')} WHERE org_id = $1 AND id = $2`, params)
  return await getBoard(orgId, id)
}

/**
 * เก็บกระดานเข้ากรุ — การ์ดข้างในไม่ถูกแตะ (ยังอยู่ครบ กลับมาเห็นทันทีที่เอากระดานออกจากกรุ)
 * ⛔ กระดานสุดท้ายของ org เก็บไม่ได้ — ไม่งั้นการ์ดทั้งหมดหายจากทุกหน้าจอโดยไม่มีทางกลับ
 *    (คืน null ให้ route แปลงเป็นข้อความบอกเหตุผล ห้ามเงียบ)
 */
export async function archiveBoard(orgId, id) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM kanban_boards WHERE org_id = $1 AND archived_at IS NULL`,
    [orgId]
  )
  if ((rows[0]?.n ?? 0) <= 1) return null

  await pool.query(
    `UPDATE kanban_boards SET archived_at = now() WHERE org_id = $1 AND id = $2 AND archived_at IS NULL`,
    [orgId, id]
  )
  return await getBoard(orgId, id)
}

export async function unarchiveBoard(orgId, id) {
  await pool.query(
    `UPDATE kanban_boards SET archived_at = NULL WHERE org_id = $1 AND id = $2`,
    [orgId, id]
  )
  return await getBoard(orgId, id)
}
