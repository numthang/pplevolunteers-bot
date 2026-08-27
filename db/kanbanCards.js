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
const { getSetting } = require('./settings');

/**
 * ลิงก์เปิดการ์ดบนเว็บ — ลอกแนวจาก getCaseManageUrl() ใน db/case.js เป๊ะๆ
 * base มาจาก guild_config (key 'web_base_url') ก่อน แล้วค่อยตกไป .env WEB_BASE_URL
 * (รองรับ multi-tenant: แต่ละ guild อาจมี domain ต่างกันในอนาคต)
 *
 * ⚠️ ใช้ **ref (KB-42) ไม่ใช่ id ภายใน** — cardContext() ฝั่งเว็บรับได้ทั้งคู่ แต่ ref อ่านออก
 *    คนก๊อปลิงก์ไปพูดต่อได้ · คู่แฝดของ formatRef() ใน web/lib/kanbanAccess.js (แก้ต้องแก้คู่กัน)
 */
async function cardWebUrl(guildId, refNo) {
  const base = (await getSetting(guildId, 'web_base_url')) || process.env.WEB_BASE_URL;
  if (!base || !refNo) return null;
  return `${String(base).replace(/\/$/, '')}/kanban?card=KB-${refNo}`;
}

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

/**
 * สร้างการ์ดให้ "ของจริง" (เคส/งานสื่อ) ที่เพิ่งเกิดฝั่งบอท — คู่แฝด CJS ของ
 * `mirrorEntityCard()` ใน web/db/kanban/links.js · **แก้ที่นั่นต้องแก้ที่นี่ด้วยเสมอ**
 *
 * ⭐ ทำไมไม่ `import()` ตัวฝั่งเว็บมาใช้เลย: ไฟล์นั้นเป็น ESM และลาก `web/db/index.js`
 *    ซึ่งเปิด **pool ที่สองในโปรเซสบอท** · บอทรันค้างตลอดเวลา คอนเนกชันคูณสองไม่คุ้ม
 *    กับการประหยัดโค้ด 30 บรรทัด (สคริปต์ .mjs ยอมได้เพราะรันจบแล้วตาย)
 *
 * ⚠️ **idempotent** — entity ที่มีการ์ดแล้วคืน id เดิม ไม่สร้างซ้ำ (UNIQUE (entity_type, entity_id)
 *    กันอีกชั้น) · เรียกซ้ำได้ปลอดภัย และต้องเป็นแบบนั้น เพราะ reconcileEntityCards() ตามเก็บทับได้
 *
 * ⚠️ **ห้ามปล่อยการ์ดไม่มีเจ้าภาพ** — isMyCard() นับงานไม่มีเจ้าภาพเป็น "ของทุกคน"
 *    เคส 200 ใบไม่มีเจ้าภาพ = หน้า "การบ้านของฉัน" พังทั้งทีม → ลากเจ้าภาพจากต้นทางมาเสมอ
 *
 * @param {'case'|'post'} entityType
 * @param {{id: number|string, title: string, ownerUserId: number|null}} src
 * @param {string|null} statusType ค่าตั้งต้นของคอลัมน์ cache — ใส่ตอนกวาดของเก่าที่จบงานแล้ว
 *        (backfillPostThreads.js ส่ง 'done') มีผลจริงเฉพาะตอนต้นทางเป็นสถานะที่คืน NULL
 *        เท่านั้น คือโพสต์ที่ยัง draft (ดู POST_STATUS ใน web/db/kanban/statusSql.js)
 *        ⭐ ต้องตั้งตรงนี้ ไม่ใช่ UPDATE ตามทีหลัง — ลืมเมื่อไหร่ = การ์ด 500+ ใบท่วมกอง "กำลังทำ"
 * @returns {Promise<string|null>} id การ์ด · null = ทำไม่ได้ (ไม่มีคนสร้าง)
 */
async function mirrorEntityCardFromBot(orgId, entityType, src, { createdBy = null, guildId = null, statusType = null } = {}) {
  const { rows: existing } = await pool.query(
    `SELECT card_id FROM kanban_card_links WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, src.id]
  );
  if (existing[0]) return existing[0].card_id;

  // created_by เป็น NOT NULL แต่ต้นทางอาจไม่มีคนสร้าง (เคสจากฟอร์มสาธารณะ ผู้ร้องไม่ได้ล็อกอิน)
  // → ตกไปใช้คนที่สร้างกระดานแรกของ org (เป็นสมาชิก org จริงเสมอ)
  let by = createdBy || src.ownerUserId;
  if (!by) {
    const { rows } = await pool.query(
      `SELECT created_by FROM kanban_boards WHERE org_id = $1 ORDER BY sort_order, id LIMIT 1`, [orgId]
    );
    by = rows[0]?.created_by || null;
  }
  if (!by) return null;

  const boardId = await resolveBoardId(orgId, guildId, by);
  const ownerUserId = src.ownerUserId || null;
  // สถานะที่ใส่ตอนสร้างเป็นแค่ค่าตั้งต้นของคอลัมน์ cache — ของที่แสดงจริงคำนวณสดจากต้นทางเสมอ
  // แต่ต้องไม่ขัด CHECK ของ DB (ไม่มีเจ้าภาพ = อยู่ backlog เท่านั้น) → ไม่มีเจ้าภาพก็บังคับ backlog
  // ต่อให้คนเรียกส่ง statusType มา (CHECK kanban_cards_owner_required จะปัดตกทั้งแถว)
  const status = ownerUserId ? (statusType || 'doing') : 'backlog';
  const title = src.title || (entityType === 'case' ? 'เรื่องร้องเรียนไม่มีชื่อ' : 'งานสื่อไม่มีชื่อ');

  for (let attempt = 0; attempt < 5; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO kanban_cards (org_id, ref_no, title, status_type, owner_user_id, created_by, board_id)
         VALUES ($1,
                 (SELECT COALESCE(MAX(ref_no), 0) + 1 FROM kanban_cards WHERE org_id = $1),
                 $2, $3, $4, $5, $6)
         RETURNING id`,
        [orgId, title, status, ownerUserId, by, boardId]
      );
      // ⚠️ ผูกลิงก์ในทรานแซกชันเดียวกับตอนสร้างการ์ด — แยกกันเมื่อไหร่ ล้มกลางทางแล้วได้
      //    การ์ดเปล่าที่ไม่ผูกอะไร ค้างกินเลข K ไปเรื่อยๆ โดยไม่มีใครรู้ว่ามันคืออะไร
      await client.query(
        `INSERT INTO kanban_card_links (card_id, entity_type, entity_id, is_auto) VALUES ($1, $2, $3, TRUE)`,
        [rows[0].id, entityType, src.id]
      );
      await client.query('COMMIT');
      return rows[0].id;
    } catch (err) {
      await client.query('ROLLBACK');
      // 23505 บน ref_no = คนอื่นคว้าเลขไปก่อน → ลองใหม่
      // 23505 บน uq_kanban_card_links_entity = อีกทางสร้างตัดหน้าไปแล้ว → คืนใบของเขา
      if (err.code === '23505') {
        const { rows: won } = await pool.query(
          `SELECT card_id FROM kanban_card_links WHERE entity_type = $1 AND entity_id = $2`,
          [entityType, src.id]
        );
        if (won[0]) return won[0].card_id;
        if (attempt < 4) continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
  return null;
}

module.exports = { createCardFromDiscord, mirrorEntityCardFromBot, cardWebUrl };
