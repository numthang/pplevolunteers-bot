// db/kanbanCards.js — ฝั่งบอท: สร้าง "การบ้าน" จากข้อความ Discord
//
// mirror ของ web/db/kanban/cards.js:createCard() — **กติกาต้องตรงกันเป๊ะ ห้าม diverge**
// (เคยเจ็บมาแล้วกับตะเข็บ db/mediaBasket.js ↔ web/db/posts/basket.js ที่ต้องแก้คู่กันเสมอ)
//
// 4 อย่างที่ห้ามพลาด:
//   1. ref_no จองแบบ MAX()+1 → กันชนด้วย UNIQUE (org_id, ref_no) แล้ว retry ที่นี่
//   2. ไม่มีเจ้าภาพ = อยู่ backlog เท่านั้น (DB มี CHECK kanban_cards_owner_required กันอีกชั้น)
//   3. due_at ส่งดิบให้ pg — ห้ามแปลง timezone
//   4. ⭐ board_id เป็น NOT NULL ตั้งแต่ก้อน 3 (2026-08-24) — **ต้องหากระดานให้ทุกครั้ง**
//      ไม่งั้น INSERT พังทันทีที่มีคนกด context menu (เว็บกับบอทต้อง deploy พร้อมกัน)
const pool = require('./index');
const { orgIdOfGuild, userIdByDiscord, upsertUserByDiscord } = require('./org');

/**
 * กระดานที่การ์ดจากห้องนี้ควรลง — ของเซิร์ฟนี้ก่อน แล้วค่อยกระดานแรกของ org
 * สร้าง "กระดานหลัก" ให้ถ้า org ยังไม่มีสักใบ (board_id เป็น NOT NULL จะปล่อยให้ INSERT พังไม่ได้)
 */
async function resolveBoardId(orgId, guildId, createdBy) {
  const { rows } = await pool.query(
    `SELECT id FROM kanban_boards
      WHERE org_id = $1 AND archived_at IS NULL
      ORDER BY (guild_id IS DISTINCT FROM $2), sort_order, id
      LIMIT 1`,
    [orgId, guildId]
  );
  if (rows[0]) return rows[0].id;

  const { rows: made } = await pool.query(
    `INSERT INTO kanban_boards (org_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [orgId, 'กระดานหลัก', createdBy]
  );
  return made[0].id;
}

/**
 * สร้างการบ้านจากข้อความในดิสฯ
 * @returns {{id: string, ref_no: number, title: string, status_type: string, owner_user_id: number|null}}
 */
async function createCardFromDiscord({ guildId, actorDiscordId, actorProfile = {}, title, detail = null, dueAt = null, assignToSelf = true, sourceUrl = null, sourceMessageId = null }) {
  const orgId = await orgIdOfGuild(guildId);
  if (!orgId) throw new Error('guild นี้ยังไม่ได้ผูกกับองค์กร');

  // คนกดอาจยังไม่มีแถวใน users (เข้าเว็บครั้งแรกยังไม่เคย) → สร้างให้ก่อน ไม่งั้น created_by เป็น null ไม่ได้
  let userId = await userIdByDiscord(actorDiscordId);
  if (!userId) userId = await upsertUserByDiscord(actorDiscordId, actorProfile);
  if (!userId) throw new Error('สร้างผู้ใช้จาก Discord ไม่สำเร็จ');

  const ownerUserId = assignToSelf ? userId : null;
  const status = ownerUserId ? 'doing' : 'backlog';

  // กระดานปลายทาง — เลือกของเซิร์ฟนี้ก่อน (kanban_boards.guild_id เป็นป้ายบอกว่ากระดานเป็นของทีมไหน)
  // ไม่มีกระดานที่ผูกเซิร์ฟนี้ → ตกไปที่กระดานแรกของ org · org ยังไม่มีสักใบ → สร้าง "กระดานหลัก" ให้
  // ⚠️ ต้องตรงกับ ensureDefaultBoard() ใน web/db/kanban/boards.js (ตะเข็บ 2 ฝั่ง แก้คู่กันเสมอ)
  const boardId = await resolveBoardId(orgId, guildId, userId);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO kanban_cards (org_id, ref_no, title, detail, status_type, owner_user_id, due_at, created_by, source_url, source_message_id, board_id)
         VALUES ($1,
                 (SELECT COALESCE(MAX(ref_no), 0) + 1 FROM kanban_cards WHERE org_id = $1),
                 $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, ref_no, title, status_type, owner_user_id, board_id`,
        [orgId, title, detail, status, ownerUserId, dueAt || null, userId, sourceUrl, sourceMessageId, boardId]
      );
      return rows[0];
    } catch (err) {
      // 23505 = unique_violation → อีกคนคว้า ref_no นี้ไปก่อน ลองใหม่
      if (err.code === '23505' && attempt < 4) continue;
      throw err;
    }
  }
}

module.exports = { createCardFromDiscord };
