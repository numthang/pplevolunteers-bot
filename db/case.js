/**
 * Case (เรื่องร้องเรียน) — bot-side DB layer (CJS)
 *
 * ใช้โดย Discord import (context menu) + forum thread handler
 * web มี layer แยกที่ web/db/cases.js (ESM) — ตาราง/ref format เดียวกัน
 *
 * ref format: `<รหัสมหาดไทย>-<พ.ศ.2หลัก>-<random4hex>` เช่น 70-68-A8F3 (กัน enumerate)
 */

const crypto = require('crypto');
const path = require('path');
const pool = require('./index');
const { getSetting } = require('./settings');

// source of truth เดียวกับ web/lib/provinceCode.js
const PROVINCE_CODES = require(path.join(__dirname, '..', 'config', 'province-codes.json'));

// ชื่อย่อ/พิมพ์เล่นที่คนกรอกบ่อย → ชื่อทางการใน province-codes.json
const PROVINCE_ALIASES = {
  'กรุงเทพ': 'กรุงเทพมหานคร',
  'กรุงเทพฯ': 'กรุงเทพมหานคร',
  'กทม': 'กรุงเทพมหานคร',
  'กทม.': 'กรุงเทพมหานคร',
};

/** คืนชื่อจังหวัดทางการ (แก้ alias แล้ว) ถ้าถูกต้อง — ไม่งั้น null */
function normalizeProvinceName(name) {
  if (!name) return null;
  const trimmed = String(name).trim();
  const canonical = PROVINCE_ALIASES[trimmed] || trimmed;
  return PROVINCE_CODES[canonical] ? canonical : null;
}

function provinceToCode(name) {
  const canonical = normalizeProvinceName(name);
  return canonical ? PROVINCE_CODES[canonical] : null;
}

function beYear2() {
  return String((new Date().getFullYear() + 543) % 100).padStart(2, '0');
}

function randomChunk() {
  return crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 hex chars
}

/**
 * ลิงก์หน้าจัดการเคสบนเว็บ — base URL มาจาก guild_config (key 'web_base_url') ก่อนเสมอ
 * รองรับ multi-tenant (แต่ละ guild อาจมี domain web ต่างกันในอนาคต) · .env WEB_BASE_URL เป็นแค่ fallback กันลิงก์หายตอนยังไม่ตั้งค่า
 */
async function getCaseManageUrl(guildId, ref) {
  const base = (await getSetting(guildId, 'web_base_url')) || process.env.WEB_BASE_URL;
  if (!base) return null;
  return `${String(base).replace(/\/$/, '')}/case/manage/${ref}`;
}

// ── config: forum channel ต่อ guild ──
async function getCaseConfig(guildId) {
  const { rows } = await pool.query(`SELECT * FROM case_config WHERE guild_id = $1`, [guildId]);
  return rows[0] || null;
}

async function upsertCaseConfig(guildId, { forum_channel_id }) {
  await pool.query(
    `INSERT INTO case_config (guild_id, forum_channel_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (guild_id) DO UPDATE SET
       forum_channel_id = COALESCE(EXCLUDED.forum_channel_id, case_config.forum_channel_id),
       updated_at       = NOW()`,
    [guildId, forum_channel_id || null],
  );
}

/**
 * สร้าง ref ที่ไม่ซ้ำ (retry กรณีชน unique) — province code ไม่รู้จัก → fallback '00'
 */
async function generateRef(guildId, province) {
  const code = provinceToCode(province) || '00';
  const yy = beYear2();
  for (let i = 0; i < 8; i++) {
    const ref = `${code}-${yy}-${randomChunk()}`;
    const { rows } = await pool.query(`SELECT 1 FROM cases WHERE ref = $1`, [ref]);
    if (rows.length === 0) return ref;
  }
  throw new Error('generateRef: ไม่สามารถสร้าง ref ที่ไม่ซ้ำได้หลัง 8 ครั้ง');
}

/**
 * สร้างเคส — คืนแถวที่สร้าง
 * @param {object} data
 */
async function createCase(data) {
  const {
    guild_id, province, category = null, title = null, detail = null, source = 'discord',
    complainant_name, complainant_phone, complainant_line_id = null,
    discord_thread_id = null, created_by = null, consent_at = null,
  } = data;
  const ref = await generateRef(guild_id, province);
  const { rows } = await pool.query(
    `INSERT INTO cases
       (guild_id, ref, province, category, title, detail, source, status,
        complainant_name, complainant_phone, complainant_line_id,
        discord_thread_id, created_by, consent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [guild_id, ref, province, category, title, detail, source,
     complainant_name, complainant_phone, complainant_line_id,
     discord_thread_id, created_by, consent_at],
  );
  return rows[0];
}

async function getCaseByThreadId(threadId) {
  const { rows } = await pool.query(
    `SELECT * FROM cases WHERE discord_thread_id = $1`, [threadId],
  );
  return rows[0] || null;
}

async function setDiscordThreadId(caseId, threadId) {
  await pool.query(
    `UPDATE cases SET discord_thread_id = $2, updated_at = NOW() WHERE id = $1`,
    [caseId, threadId],
  );
}

async function addAssignee(caseId, guildId, discordId) {
  await pool.query(
    `INSERT INTO case_assignees (case_id, guild_id, discord_id)
     VALUES ($1,$2,$3) ON CONFLICT (case_id, discord_id) DO NOTHING`,
    [caseId, guildId, discordId],
  );
}

async function getAssignees(caseId) {
  const { rows } = await pool.query(
    `SELECT discord_id, assigned_at FROM case_assignees WHERE case_id = $1 ORDER BY assigned_at`,
    [caseId],
  );
  return rows;
}

async function addNote(caseId, guildId, { author_discord_id = null, body, is_public = false }) {
  const { rows } = await pool.query(
    `INSERT INTO case_timeline (case_id, guild_id, source, body, is_public, occurred_at)
     VALUES ($1,$2,'note',$3,$4,NOW()) RETURNING *`,
    [caseId, guildId, body, is_public],
  );
  return rows[0];
}

async function updateStatus(caseId, status, closeReason = null) {
  await pool.query(
    `UPDATE cases SET status = $2, close_reason = $3, updated_at = NOW() WHERE id = $1`,
    [caseId, status, closeReason],
  );
}

async function setAiSummary(caseId, summary, lastSyncedMessageId = null) {
  await pool.query(
    `UPDATE cases
       SET ai_summary = $2,
           ai_summary_updated_at = NOW(),
           last_synced_message_id = COALESCE($3, last_synced_message_id),
           updated_at = NOW()
     WHERE id = $1`,
    [caseId, summary, lastSyncedMessageId],
  );
}

async function setLastSyncedMessageId(caseId, messageId) {
  await pool.query(
    `UPDATE cases SET last_synced_message_id = $2 WHERE id = $1`,
    [caseId, messageId],
  );
}

/**
 * เพิ่ม timeline entries (AI หรือ manual)
 * events = [{ discord_message_id?, body, is_public, occurred_at? }]
 * ถ้ามี discord_message_id จะ skip ถ้าชน (dedup incremental)
 */
async function addTimelineEvents(caseId, guildId, events, source = 'ai') {
  for (const e of events) {
    await pool.query(
      `INSERT INTO case_timeline (case_id, guild_id, discord_message_id, source, body, is_public, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
       ON CONFLICT (case_id, discord_message_id) WHERE discord_message_id IS NOT NULL DO NOTHING`,
      [caseId, guildId, e.discord_message_id || null, source, e.body, e.is_public ?? false, e.occurred_at || null],
    );
  }
}

async function getTimeline(caseId, { publicOnly = false } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM case_timeline WHERE case_id = $1${publicOnly ? ' AND is_public = TRUE' : ''}
     ORDER BY occurred_at ASC`,
    [caseId],
  );
  return rows;
}

module.exports = {
  provinceToCode,
  normalizeProvinceName,
  getCaseManageUrl,
  getCaseConfig,
  upsertCaseConfig,
  generateRef,
  createCase,
  getCaseByThreadId,
  setDiscordThreadId,
  addAssignee,
  getAssignees,
  addNote,
  updateStatus,
  setAiSummary,
  setLastSyncedMessageId,
  addTimelineEvents,
  getTimeline,
};
