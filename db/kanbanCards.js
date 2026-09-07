// db/kanbanCards.js — ฝั่งบอท: สร้าง "การบ้าน" จากข้อความ Discord
//
// mirror ของ web/db/kanban/cards.js:createCard() — **กติกาต้องตรงกันเป๊ะ ห้าม diverge**
// (เคยเจ็บมาแล้วกับตะเข็บ db/mediaBasket.js ↔ web/db/posts/basket.js ที่ต้องแก้คู่กันเสมอ)
//
// 4 อย่างที่ห้ามพลาด:
//   1. ref_no จองแบบ MAX()+1 → กันชนด้วย UNIQUE (org_id, ref_no) แล้ว retry ที่นี่
//   2. ⛔ ห้ามผูก "ชื่อคน" กับ "กอง" อีก (ถอดกฎ + DROP trigger 2026-09-03) — งานใหม่เข้า backlog เสมอ
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
 * กระดานที่การ์ดจากเซิร์ฟนี้ควรลง — ไล่ตามลำดับนี้ (แก้ 2026-09-07 ตอนเพิ่มชั้น teamspace):
 *   1. teamspace ที่ผูก guild นี้ → `default_board_id` ของทีมนั้น (คนตั้งเองในหน้าตั้งค่ากระดาน)
 *   2. teamspace นั้น → กระดานแรกในทีม (ยังไม่ได้ตั้งบอร์ดตั้งต้น)
 *   3. กระดานที่ผูก guild นี้โดยตรง (ข้อมูลเก่าก่อนมี teamspace)
 *   4. กระดานแรกของ org
 *   5. ไม่มีสักใบ → สร้าง teamspace + "กระดานหลัก" ให้ (board_id เป็น NOT NULL ปล่อยพังไม่ได้)
 *
 * ⚠️ **ตะเข็บ 2 ฝั่ง** — `ensureDefaultBoard()` ฝั่งเว็บ (web/db/kanban/boards.js) **ไม่รู้จัก guild**
 *    โดยตั้งใจ เพราะเว็บไม่มี guild ในมือ (org คร่อมหลายเซิร์ฟ) → 2 ฟังก์ชันนี้ **ไม่เหมือนกันโดยตั้งใจ**
 *    แต่ข้อ 4–5 ต้องตรงกันเสมอ · แก้ที่ไหนให้เปิดอีกฝั่งดูทุกครั้ง
 * ⛔ ห้ามผูกกระดานตั้งต้นไว้ที่ `kanban_boards.guild_id` เพิ่มอีกที่ — guild เก็บที่ teamspace ที่เดียว
 *    (เก็บ 2 ที่เมื่อไหร่ก็มีวันขัดกันเอง · /scrutinize ตีตกแบบ is_guild_default ไปแล้ว 2026-09-07)
 */
async function resolveBoardId(orgId, guildId, createdBy) {
  const { rows: ts } = await pool.query(
    `SELECT id, default_board_id FROM kanban_teamspaces
      WHERE org_id = $1 AND guild_id = $2 AND archived_at IS NULL
      ORDER BY sort_order, id LIMIT 1`,
    [orgId, guildId]
  );

  if (ts[0]) {
    // บอร์ดตั้งต้นต้องยังใช้ได้จริง (ไม่ถูกเก็บเข้ากรุ/ย้ายออกจากทีมไปแล้ว) ไม่งั้นการ์ดไหลไปทีมอื่นเงียบๆ
    if (ts[0].default_board_id) {
      const { rows: def } = await pool.query(
        `SELECT id FROM kanban_boards
          WHERE id = $1 AND org_id = $2 AND teamspace_id = $3 AND archived_at IS NULL`,
        [ts[0].default_board_id, orgId, ts[0].id]
      );
      if (def[0]) return def[0].id;
    }
    const { rows: first } = await pool.query(
      `SELECT id FROM kanban_boards
        WHERE org_id = $1 AND teamspace_id = $2 AND archived_at IS NULL
        ORDER BY sort_order, id LIMIT 1`,
      [orgId, ts[0].id]
    );
    if (first[0]) return first[0].id;
  }

  const { rows } = await pool.query(
    `SELECT id FROM kanban_boards
      WHERE org_id = $1 AND archived_at IS NULL
      ORDER BY (guild_id IS DISTINCT FROM $2), sort_order, id
      LIMIT 1`,
    [orgId, guildId]
  );
  if (rows[0]) return rows[0].id;

  // org ยังไม่มีกระดานเลย — ต้องสร้าง teamspace ให้ด้วย ไม่งั้นกระดานใหม่จะลอยไม่มีทีม
  // แล้วหายจากลิสต์ 2 ชั้นบนเว็บ (บทเรียน board_id NOT NULL ที่ทำ context menu พังมาแล้ว)
  const teamspaceId = ts[0]?.id || (await ensureTeamspaceForGuild(orgId, guildId, createdBy));
  const { rows: made } = await pool.query(
    `INSERT INTO kanban_boards (org_id, name, teamspace_id, guild_id, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [orgId, 'กระดานหลัก', teamspaceId, guildId, createdBy]
  );
  await pool.query(
    `UPDATE kanban_teamspaces SET default_board_id = $2 WHERE id = $1 AND default_board_id IS NULL`,
    [teamspaceId, made[0].id]
  );
  return made[0].id;
}

/** teamspace ของเซิร์ฟนี้ — ไม่มีก็เอาอันแรกของ org ไม่งั้นสร้าง "ทีมหลัก" ให้ */
async function ensureTeamspaceForGuild(orgId, guildId, createdBy) {
  const { rows } = await pool.query(
    `SELECT id FROM kanban_teamspaces WHERE org_id = $1 AND archived_at IS NULL
      ORDER BY (guild_id IS DISTINCT FROM $2), sort_order, id LIMIT 1`,
    [orgId, guildId]
  );
  if (rows[0]) return rows[0].id;

  const { rows: made } = await pool.query(
    `INSERT INTO kanban_teamspaces (org_id, name, guild_id, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [orgId, 'ทีมหลัก', guildId, createdBy]
  );
  return made[0].id;
}

/** กระดานทั้งหมดของ org พร้อมชื่อทีม — ให้ StringSelect "ย้ายไปกระดาน…" ในดิสฯ ใช้ */
async function listBoardsForOrg(orgId) {
  const { rows } = await pool.query(
    `SELECT b.id, b.name,
            (SELECT t.name FROM kanban_teamspaces t WHERE t.id = b.teamspace_id) AS teamspace_name
       FROM kanban_boards b
      WHERE b.org_id = $1 AND b.archived_at IS NULL
      ORDER BY b.teamspace_id NULLS LAST, b.sort_order, b.id`,
    [orgId]
  );
  return rows;
}

/** ย้ายการ์ดไปกระดานอื่น (จากดิสฯ) — org_id ใน WHERE เสมอ กันยิง id ข้าม tenant */
async function moveCardToBoard(orgId, cardId, boardId) {
  const { rows } = await pool.query(
    `UPDATE kanban_cards c SET board_id = $3, updated_at = now()
      WHERE c.org_id = $1 AND c.id = $2
        AND EXISTS (SELECT 1 FROM kanban_boards b
                     WHERE b.id = $3 AND b.org_id = $1 AND b.archived_at IS NULL)
      RETURNING c.id`,
    [orgId, cardId, boardId]
  );
  return Boolean(rows[0]);
}

/**
 * สร้างการบ้านจากข้อความในดิสฯ
 * @returns {{id: string, ref_no: number, title: string, status_type: string}}
 */
async function createCardFromDiscord({ guildId, actorDiscordId, actorProfile = {}, title, detail = null, dueAt = null, assignToSelf = true, sourceUrl = null, sourceMessageId = null }) {
  const orgId = await orgIdOfGuild(guildId);
  if (!orgId) throw new Error('guild นี้ยังไม่ได้ผูกกับองค์กร');

  // คนกดอาจยังไม่มีแถวใน users (เข้าเว็บครั้งแรกยังไม่เคย) → สร้างให้ก่อน ไม่งั้น created_by เป็น null ไม่ได้
  let userId = await userIdByDiscord(actorDiscordId);
  if (!userId) userId = await upsertUserByDiscord(actorDiscordId, actorProfile);
  if (!userId) throw new Error('สร้างผู้ใช้จาก Discord ไม่สำเร็จ');

  // ⛔ ห้ามเดากองจาก "รับเองไหม" (ถอดกฎ 2026-09-03) — งานใหม่เข้าคิว "รอทำ" เสมอ
  //    ต่อให้กดรับเองก็ยังไม่ได้แปลว่าเริ่มลงมือแล้ว · จะเริ่มเมื่อไหร่ลากบนบอร์ดเอง
  const status = 'backlog';

  // กระดานปลายทาง — เลือกของเซิร์ฟนี้ก่อน (kanban_boards.guild_id เป็นป้ายบอกว่ากระดานเป็นของทีมไหน)
  // ไม่มีกระดานที่ผูกเซิร์ฟนี้ → ตกไปที่กระดานแรกของ org · org ยังไม่มีสักใบ → สร้าง "กระดานหลัก" ให้
  // ⚠️ ต้องตรงกับ ensureDefaultBoard() ใน web/db/kanban/boards.js (ตะเข็บ 2 ฝั่ง แก้คู่กันเสมอ)
  const boardId = await resolveBoardId(orgId, guildId, userId);

  // ⚠️ การ์ด + ผู้รับผิดชอบยังอยู่ **ทรานแซกชันเดียวกัน** — ไม่ใช่เพราะ trigger อีกแล้ว (DROP ไปแล้ว)
  //    แต่เพราะล้มกลางทางแล้วได้การ์ดที่คนกด "รับเอง" ไว้แต่ไม่มีชื่อตัวเองอยู่บนนั้น
  for (let attempt = 0; attempt < 5; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO kanban_cards (org_id, ref_no, title, detail, status_type, due_at, created_by, source_url, source_message_id, board_id)
         VALUES ($1,
                 (SELECT COALESCE(MAX(ref_no), 0) + 1 FROM kanban_cards WHERE org_id = $1),
                 $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, ref_no, title, status_type, board_id`,
        [orgId, title, detail, status, dueAt || null, userId, sourceUrl, sourceMessageId, boardId]
      );
      if (assignToSelf) {
        await client.query(
          `INSERT INTO kanban_card_assignees (card_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [rows[0].id, userId]
        );
      }
      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      // 23505 = unique_violation → อีกคนคว้า ref_no นี้ไปก่อน ลองใหม่
      if (err.code === '23505' && attempt < 4) continue;
      throw err;
    } finally {
      client.release();
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
 * ⭐ เฟส B (2026-09-03): ผู้รับผิดชอบเป็น **ชุด** แล้ว (`assigneeIds`) ไม่ใช่เจ้าภาพคนเดียว
 *    และการ์ดที่ยังไม่มีคนรับก็ปล่อยว่างได้แล้ว — isMyCard() เลิกนับงานไร้คนรับเป็นของทุกคน (เฟส A)
 *
 * @param {'case'|'post'} entityType
 * @param {{id: number|string, title: string, assigneeIds?: number[]}} src
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
  const people = [...new Set((src.assigneeIds || []).filter(Boolean).map(Number))];
  let by = createdBy || people[0];
  if (!by) {
    const { rows } = await pool.query(
      `SELECT created_by FROM kanban_boards WHERE org_id = $1 ORDER BY sort_order, id LIMIT 1`, [orgId]
    );
    by = rows[0]?.created_by || null;
  }
  if (!by) return null;

  const boardId = await resolveBoardId(orgId, guildId, by);
  // สถานะที่ใส่ตอนสร้างเป็นแค่ค่าตั้งต้นของคอลัมน์ cache — ของที่แสดงจริงคำนวณสดจากต้นทางเสมอ
  // ⛔ ห้ามเดาจากจำนวนคน (ถอดกฎ 2026-09-03) — คนเรียกส่งมาอะไรใช้อันนั้น ไม่ส่ง = "รอทำ"
  const status = statusType || 'backlog';
  const title = src.title || (entityType === 'case' ? 'เรื่องร้องเรียนไม่มีชื่อ' : 'งานสื่อไม่มีชื่อ');

  for (let attempt = 0; attempt < 5; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO kanban_cards (org_id, ref_no, title, status_type, created_by, board_id)
         VALUES ($1,
                 (SELECT COALESCE(MAX(ref_no), 0) + 1 FROM kanban_cards WHERE org_id = $1),
                 $2, $3, $4, $5)
         RETURNING id`,
        [orgId, title, status, by, boardId]
      );
      if (people.length) {
        await client.query(
          `INSERT INTO kanban_card_assignees (card_id, user_id)
           SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
          [rows[0].id, people]
        );
      }
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

/**
 * ⭐ ฝาแฝด CJS ของ `syncCaseCardPeople()` ใน web/db/kanban/links.js — **แก้ที่นั่นต้องแก้ที่นี่ด้วย**
 *    (เหตุผลที่ไม่ import ฝั่งเว็บมาใช้: pool ที่สองในโปรเซสบอท — ดู mirrorEntityCardFromBot)
 *
 * ผู้รับผิดชอบของการ์ดที่ผูกเคสเป็น **สำเนา** ของ `case_assignees` ไม่ได้อ่านสดเหมือนสถานะ
 * → ทุกทางที่แตะ `case_assignees` ต้องเรียกตัวนี้ต่อทันที ไม่งั้นผู้รับผิดชอบดริฟต์
 * ⚠️ ห้าม throw
 * ⛔ **ไม่ clamp สถานะ** — ถอดคนสุดท้ายออกแล้วการ์ดอยู่กองเดิม (trigger clamp ถูก DROP ทิ้ง 2026-09-03)
 *    ใครจะย้ายไปไหนเป็นเรื่องของคน ไม่ใช่ของ DB
 */
async function syncCaseCardPeopleFromBot(caseId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT card_id FROM kanban_card_links WHERE entity_type = 'case' AND entity_id = $1 FOR UPDATE`,
      [caseId]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return false; }
    const cardId = rows[0].card_id;

    await client.query(
      `DELETE FROM kanban_card_assignees a
        WHERE a.card_id = $1
          AND NOT EXISTS (SELECT 1 FROM case_assignees ca
                           WHERE ca.case_id = $2 AND ca.user_id = a.user_id)`,
      [cardId, caseId]
    );
    await client.query(
      `INSERT INTO kanban_card_assignees (card_id, user_id, assigned_at)
       SELECT $1, ca.user_id, ca.assigned_at FROM case_assignees ca WHERE ca.case_id = $2
       ON CONFLICT DO NOTHING`,
      [cardId, caseId]
    );
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[kanban] syncCaseCardPeopleFromBot ล้มเหลว case', caseId, e.message);
    return false;
  } finally {
    client.release();
  }
}

module.exports = { createCardFromDiscord, mirrorEntityCardFromBot, syncCaseCardPeopleFromBot, cardWebUrl, listBoardsForOrg, moveCardToBoard };
