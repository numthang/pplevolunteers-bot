// web/db/kanban/teamspaces.js — ชั้น teamspace (kanban_teamspaces) 2026-09-07
//
// ดีไซน์: md/kanban/KANBAN.md §Data model ·  org > teamspace > boards > cards
//
// ⚠️ **teamspace ≠ หน้า /team** — /team คือรายชื่อสมาชิกในเซิร์ฟดิสคอร์ด ไม่เกี่ยวกันเลย
//    (คอมเมนต์คู่ฝั่งนั้นอยู่ที่ web/db/team/*.js — แก้ที่ไหนให้แก้คู่กัน)
//
// ⭐ กติกาเดียวกับ boards.js:
//   1. **guild_id เป็นป้าย ไม่ใช่ชั้นข้อมูล** — ใช้ให้บอทเดาว่าเซิร์ฟนี้ลงงานทีมไหน
//      ห้ามอ่านงานผ่าน guild เป็นชั้นบังคับ (ขัดเป้า "ไม่มี Discord ก็ใช้ได้")
//   2. ทุก query มี org_id ใน WHERE เสมอ — ไม่พบ = ข้าม org หรือไม่มีจริง (route ตอบ 404 ไม่ใช่ 403)
//   3. ⛔ **รอบนี้ไม่มีด่านสิทธิ์ระดับ teamspace** ทุกคนใน org เห็นหมด (user สั่ง 2026-09-07)
//      วันที่จะกันจริง แก้ที่ scopeSql.js ที่เดียว ไม่ใช่มาเพิ่ม WHERE ที่นี่
import pool from '../index.js'

const COLS = `t.id, t.org_id, t.name, t.detail, t.scope_node_id, t.guild_id,
              t.sort_order, t.archived_at, t.default_board_id, t.created_by, t.created_at,
              (SELECT g.name FROM dc_guilds g WHERE g.guild_id = t.guild_id) AS guild_name,
              (SELECT n.label FROM org_scope_nodes n WHERE n.id = t.scope_node_id) AS scope_label`

// จำนวนการ์ดที่ยังไม่เข้ากรุ "ทุกบอร์ดใน teamspace นี้รวมกัน" — ตัวเลขข้างหัวข้อในลิสต์เลือกบอร์ด
const CARD_COUNT = `(SELECT count(*) FROM kanban_cards c
                      WHERE c.archived_at IS NULL
                        AND EXISTS (SELECT 1 FROM kanban_boards b
                                     WHERE b.id = c.board_id AND b.teamspace_id = t.id))::int AS card_count`

function shape(row) {
  if (!row) return null
  return {
    ...row,
    id: Number(row.id),
    default_board_id: row.default_board_id == null ? null : Number(row.default_board_id),
    card_count: row.card_count ?? 0,
  }
}

export async function listTeamspaces(orgId, { includeArchived = false } = {}) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${CARD_COUNT}
       FROM kanban_teamspaces t
      WHERE t.org_id = $1 ${includeArchived ? '' : 'AND t.archived_at IS NULL'}
      ORDER BY t.sort_order, t.id`,
    [orgId]
  )
  return rows.map(shape)
}

export async function getTeamspace(orgId, id) {
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${CARD_COUNT} FROM kanban_teamspaces t WHERE t.org_id = $1 AND t.id = $2`,
    [orgId, id]
  )
  return shape(rows[0])
}

/** teamspace ที่ผูกกับเซิร์ฟนี้ — ฝั่งบอทใช้เดาว่าการ์ดจากเซิร์ฟนี้ควรลงทีมไหน */
export async function getTeamspaceByGuild(orgId, guildId) {
  if (!guildId) return null
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${CARD_COUNT} FROM kanban_teamspaces t
      WHERE t.org_id = $1 AND t.guild_id = $2 AND t.archived_at IS NULL
      ORDER BY t.sort_order, t.id LIMIT 1`,
    [orgId, guildId]
  )
  return shape(rows[0])
}

/**
 * teamspace ตั้งต้นของ org — ตัวแรกตามลำดับที่แสดง
 * สร้างให้อัตโนมัติถ้ายังไม่มีสักอัน ด้วยเหตุผลเดียวกับ ensureDefaultBoard:
 * บอร์ดต้องมี teamspace เสมอ จะปล่อยให้พังเพราะ "ยังไม่เคยเข้าหน้าเว็บ" ไม่ได้
 */
export async function ensureDefaultTeamspace(orgId, createdBy) {
  const { rows } = await pool.query(
    `SELECT id FROM kanban_teamspaces WHERE org_id = $1 AND archived_at IS NULL
      ORDER BY sort_order, id LIMIT 1`,
    [orgId]
  )
  if (rows[0]) return Number(rows[0].id)

  const { rows: made } = await pool.query(
    `INSERT INTO kanban_teamspaces (org_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [orgId, 'ทีมหลัก', createdBy]
  )
  return Number(made[0].id)
}

/**
 * สร้าง teamspace — 2 ทาง (user เคาะ 2026-09-07):
 *   scopeNodeId  เลือกจากหน่วยงานที่มีอยู่ (org_scope_nodes 97 แถว) ← ทางหลัก
 *   name เปล่าๆ  ตั้งชื่อเอง สำหรับทีมที่ไม่ใช่พื้นที่ (เช่น "ทีมสื่อ")
 * ⚠️ ไม่บังคับให้ scope_node_id ไม่ซ้ำ — org อาจอยากมี 2 ทีมในจังหวัดเดียวกัน
 */
export async function createTeamspace(orgId, { name, detail = null, scopeNodeId = null, guildId = null }, createdBy) {
  const { rows } = await pool.query(
    `INSERT INTO kanban_teamspaces (org_id, name, detail, scope_node_id, guild_id, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM kanban_teamspaces WHERE org_id = $1),
             $6)
     RETURNING id`,
    [orgId, name, detail, scopeNodeId, guildId, createdBy]
  )
  return await getTeamspace(orgId, rows[0].id)
}

export async function updateTeamspace(orgId, id, { name, detail, scopeNodeId, guildId, defaultBoardId } = {}) {
  const sets = []
  const params = [orgId, id]
  const put = (sql, val) => { params.push(val); sets.push(`${sql} = $${params.length}`) }

  if (name !== undefined)        put('name', name)
  if (detail !== undefined)      put('detail', detail)
  if (scopeNodeId !== undefined) put('scope_node_id', scopeNodeId)
  if (guildId !== undefined)     put('guild_id', guildId)
  if (defaultBoardId !== undefined) put('default_board_id', defaultBoardId)
  if (!sets.length) return await getTeamspace(orgId, id)

  await pool.query(`UPDATE kanban_teamspaces SET ${sets.join(', ')} WHERE org_id = $1 AND id = $2`, params)
  return await getTeamspace(orgId, id)
}

/**
 * เก็บ teamspace เข้ากรุ — บอร์ด/การ์ดข้างในไม่ถูกแตะ (กลับมาเห็นทันทีที่เอาออกจากกรุ)
 * ⛔ teamspace สุดท้ายของ org เก็บไม่ได้ — ไม่งั้นบอร์ดทั้งหมดไม่มีที่ยืน
 *    (คืน null ให้ route แปลงเป็นข้อความบอกเหตุผล ห้ามเงียบ — กติกาเดียวกับ archiveBoard)
 */
export async function archiveTeamspace(orgId, id) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM kanban_teamspaces WHERE org_id = $1 AND archived_at IS NULL`,
    [orgId]
  )
  if ((rows[0]?.n ?? 0) <= 1) return null

  await pool.query(
    `UPDATE kanban_teamspaces SET archived_at = now() WHERE org_id = $1 AND id = $2 AND archived_at IS NULL`,
    [orgId, id]
  )
  return await getTeamspace(orgId, id)
}

export async function unarchiveTeamspace(orgId, id) {
  await pool.query(
    `UPDATE kanban_teamspaces SET archived_at = NULL WHERE org_id = $1 AND id = $2`,
    [orgId, id]
  )
  return await getTeamspace(orgId, id)
}

/**
 * กระดานใบนี้ไม่ควรเป็น "บอร์ดตั้งต้น" ของ teamspace อื่นแล้ว — ล้างทิ้งแล้วเลื่อนไปใบแรกที่เหลือ
 *
 * เรียกหลัง **ย้ายกระดานข้าม teamspace** (keepForTeamspaceId = ทีมใหม่) และหลัง **เก็บกระดานเข้ากรุ**
 * (keepForTeamspaceId = null) · ไม่ทำ = บอทของเซิร์ฟทีมเดิมลงการ์ดข้ามทีมเงียบๆ
 */
export async function clearDefaultBoardElsewhere(orgId, boardId, keepForTeamspaceId = null) {
  await pool.query(
    `UPDATE kanban_teamspaces t
        SET default_board_id = (
              SELECT b.id FROM kanban_boards b
               WHERE b.teamspace_id = t.id AND b.archived_at IS NULL AND b.id <> $2
               ORDER BY b.sort_order, b.id LIMIT 1)
      WHERE t.org_id = $1 AND t.default_board_id = $2
        AND ($3::bigint IS NULL OR t.id <> $3)`,
    [orgId, boardId, keepForTeamspaceId]
  )
}

/** หน่วยงานทั้งหมดของ org — ป้อนตัวเลือก "เลือกจากหน่วยงานที่มีอยู่" ในกล่องสร้าง teamspace */
export async function listScopeNodes(orgId) {
  const { rows } = await pool.query(
    `SELECT n.id, n.label, n.parent_id,
            (SELECT p.label FROM org_scope_nodes p WHERE p.id = n.parent_id) AS parent_label
       FROM org_scope_nodes n WHERE n.org_id = $1
      ORDER BY n.parent_id NULLS FIRST, n.sort_order, n.id`,
    [orgId]
  )
  return rows
}
