/**
 * backfillCaseThreads.js — กวาดกระทู้เก่าใน complaint forum มาสร้างเป็นเคสร้องเรียน (cases)
 *
 * คู่แฝดของ backfillPostThreads.js แต่ปลายทางเป็น cases ไม่ใช่ posts
 * ลอก flow มาจาก handlers/caseImportHandler.js (auto-import ตอนมีกระทู้ใหม่) ทั้งดุ้น
 * ต่างกันแค่ทำทีละเยอะและไม่มีคนกดเลือกหมวด/กรอกชื่อผู้ร้องให้
 *
 * Usage (local):
 *   node scripts/data/backfillCaseThreads.js --dry-run     ← ดูยอดก่อน (~10 วินาที)
 *   node scripts/data/backfillCaseThreads.js               ← รันจริง
 *
 * Usage (prod) — ⚠️ **ต้อง `sudo -u www` เสมอ** ไม่งั้น .env ไม่โหลด:
 *   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && \
 *     node scripts/data/backfillCaseThreads.js --dry-run'
 *
 * ⭐ **สั่งเปล่าๆ ปลอดภัย** (ตั้งค่าตั้งต้นแบบเดียวกับ backfillPostThreads 2026-08-28)
 *    `node scripts/data/backfillCaseThreads.js` = ทุกปี · **ไม่ยิง AI**
 *    ของแพง (เครดิต AI) ต้องสั่งเปิดเอง — เคสนึงยิง 3 ครั้ง (หัวข้อ + สรุป + timeline)
 *    ของจริง 183 กระทู้ = 549 ครั้ง ถ้าติดมากับ default แล้วเผลอสั่ง
 *
 * ⭐ **ดึงรูปแนบด้วย** (เพิ่ม 2026-09-02 — ก่อนหน้านี้ไม่มีเลย ต่างจาก backfillPostThreads.js)
 *    ค่าเริ่มต้น: รูปไม่เกิน 4/เคส เก็บลง `case_attachments` + ไฟล์จริงที่ `uploads/cases/<caseId>/`
 *    (path/allowlist ก็อปจาก web/lib/caseUploads.js — import ตรงไม่ได้เพราะเป็น ESM ผูก alias @/)
 *    ⚠️ **รองรับเฉพาะ jpg/png/webp** — case attachments ไม่มี gif ในเมนู (ต่างจาก posts)
 *    ⭐ **เคสที่นำเข้าไปแล้วก่อนหน้านี้ (ไม่มีรูปเลยสักใบ) จะถูกเติมรูปให้ในตัว** ตอนรันซ้ำ
 *       เช็ค case_attachments ว่ามีแถวหรือยังก่อนเสมอ กันยิง Discord ซ้ำกับเคสที่เติมแล้ว
 *
 * Options:
 *   --dry-run          นับอย่างเดียว ไม่ยิง AI ไม่เขียน DB  ← รันอันนี้ก่อนเสมอ
 *   --limit <n>        ทำแค่ n กระทู้แรกที่ยังไม่มีเคส (ลองน้ำก่อนเทหมด)
 *   --no-images        ไม่ดึง/ไม่เติมรูปเลย (ทั้งเคสใหม่และเคสเก่าที่นำเข้าไปแล้ว)
 *   --max-images <n>   จำกัดจำนวนรูปที่ดึงต่อเคส (ค่าเริ่มต้น 4)
 *   --since <YYYY-MM-DD>  เอาเฉพาะกระทู้ที่ตั้งตั้งแต่วันนั้น
 *   --years <n>        ทางลัดของ --since = วันนี้ลบ n ปี   (ไม่ใส่ = ทุกปี)
 *   --province <ชื่อ>  **บังคับใส่** — จังหวัดของเคสทุกใบที่รอบนี้จะสร้าง
 *                      ไม่ใส่ = ไม่ยอมรัน (ไม่มีค่าตั้งต้น ไม่ไปอ่านค่าจากที่ไหนทั้งนั้น)
 *   --guild <id>       จำกัด guild เดียว (ไม่ใส่ = ทุก guild ที่มีแถวใน case_config)
 *                      ⚠️ ถ้ามีหลาย guild ใน scope ต้องระบุ --guild — กันจังหวัดเดียวไปปั๊มทับข้าม guild
 *   --forum <id>       เจาะ forum อื่นที่ไม่ใช่ค่าใน case_config (ต้องใส่ --guild คู่กัน)
 *   --ai               **ยิง AI ให้** (ค่าเริ่มต้นคือไม่ยิง) — 3 ครั้ง/กระทู้
 *                      ไม่ยิง = หัวข้อ = ชื่อกระทู้ · เนื้อหา = ข้อความแรกของกระทู้ · ไม่มี timeline
 *                      กดปุ่มให้ AI สรุปทีละใบในเว็บทีหลังได้
 *                      (watermark `last_synced_message_id` จะถูกปล่อยว่างไว้เสมอถ้าไม่ได้สกัด timeline
 *                       → ปุ่ม "ดึง Discord ใหม่" บนเว็บไล่เก็บทั้งเธรดเองได้ · ดู bug-209)
 *
 * ⭐ **สถานะ = `open` ทุกใบ** (user เคาะ 2026-08-28) — `createCase()` ฝัง 'open' ตายตัวอยู่แล้ว
 *    แปลว่าเคสเก่าทั้งหมดจะไปกอง **"รอทำ"** ของ kanban (CASE_STATUS: open→backlog)
 *    และขึ้นในหน้า /case เป็นเรื่องที่ยัง active · ตั้งใจแบบนั้น ไม่ใช่ลืมใส่ flag
 *    ⚠️ cases **ไม่มีคอลัมน์ `created_via`** → ท่า "ซ่อนของเก่าจากฟีด" ของ posts ใช้ไม่ได้ที่นี่
 *
 * ⭐ **การ์ด kanban ถูกสร้างให้เองในตัว** — `caseDb.createCase()` เรียก `mirrorEntityCardFromBot()`
 *    ไม่ต้องรัน backfillEntityCards.mjs ตามหลัง (มันเป็นแค่ตาข่ายตามเก็บ)
 *
 * ⭐ **rollback ไม่ใช่ restore** — สคริปต์นี้ INSERT อย่างเดียว ไม่แตะของเดิมสักแถว
 *    แต่ **ไม่มีป้าย `created_via` ให้เกาะเหมือน posts** → ถ้าจะถอย ใช้ช่วงเวลา + ต้นทาง:
 *      DELETE FROM cases WHERE source='discord' AND created_at > '<เวลาก่อนรัน>';
 *    ⚠️ ต้องลบการ์ด kanban เองด้วย — `kanban_card_links` ไม่มี FK ไป cases (ไม่ cascade):
 *      DELETE FROM kanban_cards WHERE id IN (
 *        SELECT card_id FROM kanban_card_links WHERE entity_type='case' AND entity_id NOT IN (SELECT id FROM cases));
 *
 * ⭐ กันซ้ำที่ `cases.discord_thread_id` — รันซ้ำได้ ของที่เข้าไปแล้วถูกข้าม
 *
 * ⚠️ **บนเครื่อง dev ซ้อมได้** ถ้า INSERT แถวลง `case_config` ก่อน (ที่นี่ว่างเปล่าเพราะไม่เคยตั้ง
 *    ผ่านคำสั่งบอท) — บอท Tester อยู่ในทั้ง 2 เซิร์ฟเวอร์ ดึงกระทู้จริงได้ แต่เขียนลง DB ของ dev
 *    ดู SQL ใน md/PENDING.md §backfillCaseThreads
 */
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const pool = require('../../db/index');
const caseDb = require('../../db/case');
const { userIdByDiscord } = require('../../db/org');
const { callAI } = require('../../services/aiSummarize');
const { generateTimeline } = require('../../services/caseTimeline');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = has('dry-run');
const USE_AI = has('ai');
const LIMIT = Number(arg('limit', 0)) || 0;
const GUILD_FILTER = arg('guild', null);
const FORUM_OVERRIDE = arg('forum', null);
const NO_IMAGES = has('no-images');
const MAX_IMAGES = Number(arg('max-images', 4)) || 4;

/**
 * ⭐ จังหวัด = **input ของคำสั่ง ไม่ใช่ค่าที่ไปดูดมาจาก DB** (user เคาะ 2026-08-29)
 *
 * เดิมสคริปต์อ่าน `dc_guild_config` key `case_default_province` เป็นค่าตั้งต้นเงียบๆ
 * → คำสั่งเดียวกันให้ผลไม่เหมือนกันขึ้นกับค่าที่ **มองไม่เห็นและไม่มีหน้าจอให้ดู**
 *   (key นั้นไม่มี UI ตั้งค่าเลยตั้งแต่เกิดเมื่อ 27 มิ.ย. — user ไม่เคยรู้ว่ามีอยู่)
 * นี่เป็น backfill ที่คนสั่งเองทีละครั้ง ค่าที่กำหนดผลลัพธ์ต้องอยู่ในคำสั่งให้เห็นกับตา
 *
 * ⛔ ห้ามใส่ค่าตั้งต้นกลับมา และห้ามให้มัน fallback ไป 'ไม่ระบุ' เงียบๆ —
 *    'ไม่ระบุ' ทำให้ ref ขึ้นต้น 00 และคนที่ scope เป็นรายจังหวัด **มองไม่เห็นเคสเลยสักใบ**
 */
const PROVINCE = (() => {
  const raw = arg('province', null);
  if (!raw) {
    console.error('❌ ต้องระบุ --province <ชื่อจังหวัด> เสมอ — สคริปต์นี้ไม่มีค่าตั้งต้นและไม่อ่านค่าจาก DB');
    console.error('   เช่น: node scripts/data/backfillCaseThreads.js --dry-run --province ราชบุรี --guild 1111998833652678757');
    process.exit(1);
  }
  // ผ่าน normalizeProvinceName เพื่อรับ alias (กทม/กรุงเทพฯ → กรุงเทพมหานคร) และตัดชื่อมั่วทิ้งตั้งแต่ต้น
  // พิมพ์ผิดแล้วปล่อยผ่าน = ref ขึ้นต้น 00 ทั้งชุดโดยไม่มีใครรู้ (เจอตอนซ้อม dev 2026-08-29)
  const canonical = require('../../db/case').normalizeProvinceName(raw);
  if (!canonical) {
    console.error(`❌ ไม่รู้จักจังหวัด "${raw}" — ต้องเป็นชื่อทางการใน config/province-codes.json`);
    process.exit(1);
  }
  return canonical;
})();

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// ── รูปแนบ ──────────────────────────────────────────────────────────────────
// ⭐ ก็อปพาธ/allowlist มาจาก web/lib/caseUploads.js ตรงๆ (import ไม่ได้ — ไฟล์นั้นเป็น ESM
//    ที่ใช้ alias @/ ผูกกับ Next.js bundler เท่านั้น รันจาก plain node ตรงนี้ไม่ได้)
//    ⚠️ แก้ allowlist/พาธที่นั่นแล้วต้องแก้ที่นี่ด้วย ไม่งั้นรูปที่นี่หายไปเงียบๆ
// ⚠️ ต่างจาก posts (extract .gif ได้ด้วย): case attachments **ไม่รองรับ gif** เลย
const CASE_UPLOAD_DIR = process.env.CASE_UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads', 'cases');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — เพดานเดียวกับ web/lib/caseUploads.js
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)(?:[?#]|$)/i;

// ── วันที่ตั้งกระทู้ อ่านจาก snowflake (ไม่ต้องยิง API เพิ่ม) ─────────────────
const DISCORD_EPOCH = 1420070400000n;
const createdAtOf = (id) => new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));

const SINCE = (() => {
  const years = Number(arg('years', 0)) || 0;
  if (years) { const d = new Date(); d.setFullYear(d.getFullYear() - years); return d; }
  const raw = arg('since', null);
  if (!raw) return null;
  // ตรึง +07:00 — เซิร์ฟเวอร์รันเป็น UTC ถ้าปล่อยให้ Date เดาเอง "1 ม.ค." จะกลายเป็นคนละวัน
  const d = new Date(`${raw}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) { console.error(`--since ไม่ใช่วันที่ที่อ่านได้: ${raw}`); process.exit(1); }
  return d;
})();

const AI_TITLE_SYSTEM = `สร้างหัวข้อสรุปเรื่องร้องเรียนจากบทสนทนา Discord
รูปแบบ: [ประเภท] สาระสำคัญ — พื้นที่
ตัวอย่าง: ถนนชำรุด ซ.วัดโพธิ์ หมู่ 3 — อ.โพธาราม ราชบุรี
- ประเภท: ถนน / ไฟฟ้า / น้ำประปา / ที่ดิน / การร้องเรียนเจ้าหน้าที่ / อื่นๆ
- ระบุพื้นที่ให้ละเอียดที่สุดเท่าที่มีข้อมูล (หมู่บ้าน/ตำบล/อำเภอ/จังหวัด)
- ห้ามแต่งเติม · ความยาวไม่เกิน 80 ตัวอักษร · ตอบเป็นหัวข้อเดียว ไม่ต้องมีคำอธิบายเพิ่ม`;

const AI_SUMMARY_SYSTEM = `สรุปเรื่องร้องเรียนจากบทสนทนา Discord ให้ทีมงานเข้าใจเร็ว
- สรุปสั้น กระชับ ภาษาทางการเล็กน้อย ไม่เกิน 5 บรรทัด
- ระบุ: ปัญหาคืออะไร · สถานที่/หน่วยงานที่เกี่ยวข้อง (ถ้ามี) · สิ่งที่ผู้ร้องต้องการ
- ห้ามแต่งเติมข้อมูลที่ไม่มีในบทสนทนา`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * ⭐ รอแล้วลองใหม่เมื่อโดน 429 (rate limit) — **จำเป็นบน prod เท่านั้นแต่ต้องมี** (bug-184)
 *
 * โควตา rate limit ผูกกับ token ของบอท · บน prod บอทตัวจริงรันตลอด 24 ชม. รับ event อยู่แล้ว
 * สคริปต์นี้ไปแย่งโควตาเดียวกัน → เจอ 429 ประปราย (บน dev ไม่เจอเลยเพราะบอท Tester นั่งเฉยๆ
 * — ห้ามสรุปว่า "เทสบน dev ผ่านแล้วแปลว่าไม่มีปัญหา" เจอจริงตอนรัน posts บน prod 2026-08-28)
 *
 * Discord บอกเวลาที่ต้องรอมาให้ใน `retry-after` (วินาที) — เชื่อค่านั้น ไม่ต้องเดาเอง
 * 5xx ก็ลองใหม่ด้วย (Discord ล่มชั่วคราว) · 4xx อื่นไม่ลอง เพราะขอผิดเองลองกี่ครั้งก็ผิด
 */
async function discordFetch(path, attempt = 0) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });
  if (res.ok) return res.json();

  const retryable = res.status === 429 || res.status >= 500;
  if (retryable && attempt < 5) {
    const headerWait = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(headerWait) && headerWait > 0
      ? headerWait * 1000 + 250          // บวกอีกนิดกันพลาดเส้นเป๊ะๆ
      : 1000 * 2 ** attempt;             // ไม่มี header ก็ถอย 1s→2s→4s…
    await sleep(waitMs);
    return discordFetch(path, attempt + 1);
  }
  throw new Error(`Discord ${res.status}: ${path}`);
}

/** กระทู้ทั้งหมดใน forum — active + archived (แบ่งหน้า) */
async function fetchAllThreadsInForum(guildId, forumChannelId) {
  const threads = [];

  try {
    const active = await discordFetch(`/guilds/${guildId}/threads/active`);
    for (const t of active.threads || []) {
      if (t.parent_id === forumChannelId) threads.push(t);
    }
  } catch (e) {
    console.error('  [warn] active threads:', e.message);
  }

  let before = null;
  while (true) {
    // ⚠️ ต้อง encodeURIComponent — archive_timestamp เป็น ISO8601 ที่ลงท้ายด้วย `+00:00`
    //    ส่งดิบไป `+` จะถูกอ่านเป็น "ช่องว่าง" ใน query string → Discord ตอบ 400 แล้วเราหยุดดึงกลางคัน
    //    อาการหลอก: ไม่ error ให้เห็นชัด แค่ได้กระทู้มาไม่ครบ (เจอจริง 2026-08-24: 109 → 481 หลังแก้)
    const qs = before ? `?before=${encodeURIComponent(before)}&limit=100` : '?limit=100';
    try {
      const data = await discordFetch(`/channels/${forumChannelId}/threads/archived/public${qs}`);
      for (const t of data.threads || []) threads.push(t);
      if (!data.has_more) break;
      before = data.threads?.at(-1)?.thread_metadata?.archive_timestamp || null;
      if (!before) break;
    } catch (e) {
      console.error('  [warn] archived threads page:', e.message);
      break;
    }
  }

  // กระทู้เดียวกันโผล่ได้ทั้ง active และ archived ถ้าโดนปิดคาระหว่างดึง → กันซ้ำด้วย id
  return [...new Map(threads.map(t => [t.id, t])).values()];
}

/**
 * เนื้อความตั้งต้นของกระทู้ (โหมดไม่ยิง AI) — call เดียวต่อกระทู้ ไม่ต้องไล่ดึงทั้งกระทู้
 *
 * ข้อความแรกของกระทู้ forum = ข้อความที่ **id เท่ากับ id ของกระทู้** (starter message)
 * ⚠️ แต่ starter ว่างได้จริง — เจอบน dev 2 ใน 3 ใบแรก (ใบนึงแนบแต่รูป อีกใบว่างเปล่า)
 *    → ถ้าว่าง ค่อยขอต่ออีก 1 call เอาข้อความถัดไปที่มีเนื้อความจริง (คนมักพิมพ์รายละเอียดในข้อความที่ 2)
 */
async function fetchStarterText(threadId) {
  try {
    const starter = await discordFetch(`/channels/${threadId}/messages/${threadId}`);
    if (starter?.content?.trim()) return starter.content;
  } catch { /* starter โดนลบไปแล้ว — ตกไปหาข้อความถัดไป */ }

  try {
    // `after` = ขอข้อความที่อยู่ **ถัดจาก** id นั้น (ได้ของเก่าสุดก่อน) · array เรียงใหม่→เก่า จึงต้อง reverse
    const next = await discordFetch(`/channels/${threadId}/messages?after=${threadId}&limit=5`);
    const first = (next || []).reverse().find(m => m.content?.trim() && !m.author?.bot);
    return first?.content || null;
  } catch { return null; }
}

/** ข้อความทั้งกระทู้ เรียงเก่า → ใหม่ (ใช้เฉพาะโหมด --ai) */
async function fetchThreadMessages(threadId) {
  const msgs = [];
  let before = null;
  while (true) {
    const qs = before ? `?before=${before}&limit=100` : '?limit=100';
    const batch = await discordFetch(`/channels/${threadId}/messages${qs}`);
    if (!batch.length) break;
    msgs.push(...batch);
    if (batch.length < 100) break;
    before = batch.at(-1).id;
  }
  return msgs.reverse();
}

function messagesToText(msgs) {
  return msgs
    .filter(m => m.content?.trim() && !m.author?.bot)
    .map(m => `${m.author?.username || 'user'}: ${m.content}`)
    .join('\n');
}

/** รูปจากทุกข้อความในกระทู้ — เก็บ id ของ attachment/message ต้นทางไว้กันซ้ำตอน insert · ลอกจาก backfillPostThreads.js */
function extractImages(msgs) {
  const out = [];
  for (const m of msgs) {
    for (const a of m.attachments || []) {
      if (IMAGE_EXT_RE.test(a.filename || a.url)) {
        out.push({ url: a.url, messageId: m.id, attachmentId: a.id, filename: a.filename, contentType: a.content_type });
      }
      if (out.length >= MAX_IMAGES) return out;
    }
  }
  return out;
}

/** เคสนี้มีไฟล์แนบอยู่แล้วหรือยัง — ใช้กันไม่ให้ยิง Discord ซ้ำทุกรอบที่รันสคริปต์ */
async function hasAttachments(caseId) {
  const { rows } = await pool.query(`SELECT 1 FROM case_attachments WHERE case_id = $1 LIMIT 1`, [caseId]);
  return rows.length > 0;
}

/**
 * ดาวน์โหลดรูปจาก Discord CDN แล้วเก็บลง case_attachments — ก็อป logic มาจาก
 * web/lib/caseUploads.js (saveCaseBuffer) + web/db/cases.js (insertAttachment)
 * @returns {Promise<number>} จำนวนรูปที่เก็บสำเร็จ
 */
async function attachCaseImages(caseId, orgId, images) {
  const dir = path.join(CASE_UPLOAD_DIR, String(caseId));
  await fs.mkdir(dir, { recursive: true });
  let saved = 0;
  for (const img of images) {
    const mime = img.contentType?.split(';')[0].trim()
      || MIME_BY_EXT[(img.filename || '').split('.').pop()?.toLowerCase()];
    const ext = EXT_BY_MIME[mime];
    if (!ext) continue; // ชนิดไม่รองรับ — extractImages กรองมาแล้วแต่กันเหนียวไว้
    try {
      const res = await fetch(img.url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_FILE_SIZE) continue; // เช็คขนาดจริงซ้ำ ไม่เชื่อ header จาก Discord เฉยๆ
      const filename = `${crypto.randomUUID()}.${ext}`;
      await fs.writeFile(path.join(dir, filename), buf);
      const filePath = path.join(String(caseId), filename);
      const { rowCount } = await pool.query(
        `INSERT INTO case_attachments
           (case_id, org_id, file_path, original_name, mime, discord_attachment_id, discord_message_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (discord_attachment_id) WHERE discord_attachment_id IS NOT NULL DO NOTHING`,
        [caseId, orgId, filePath, img.filename || null, mime, img.attachmentId || null, img.messageId || null],
      );
      if (rowCount) saved++;
    } catch (e) {
      console.error(`\n  [img] case ${caseId} attachment ${img.attachmentId}:`, e.message);
    }
  }
  return saved;
}

/**
 * ชื่อผู้ร้อง = ชื่อในเซิร์ฟเวอร์ของเจ้าของกระทู้ (nickname > global_name > username)
 * สูตรเดียวกับ handlers/caseImportHandler.js ที่ใช้ `member.displayName` — ไม่งั้นเคสที่เกิด
 * คนละทางได้ชื่อคนละแบบ · หาไม่เจอ (ออกจากเซิร์ฟเวอร์แล้ว) = 'ไม่ระบุ' เหมือน hook ปัจจุบัน
 */
const nameCache = new Map();
async function complainantNameOf(guildId, ownerId) {
  if (!ownerId) return 'ไม่ระบุ';
  const key = `${guildId}:${ownerId}`;
  if (nameCache.has(key)) return nameCache.get(key);
  let name = 'ไม่ระบุ';
  try {
    const m = await discordFetch(`/guilds/${guildId}/members/${ownerId}`);
    name = m?.nick || m?.user?.global_name || m?.user?.username || 'ไม่ระบุ';
  } catch { /* ออกจากเซิร์ฟเวอร์ไปแล้ว */ }
  nameCache.set(key, name);
  return name;
}

(async () => {
  console.log(DRY_RUN ? '=== DRY RUN (ไม่เขียน DB ไม่ยิง AI) ===' : '=== backfillCaseThreads ===');
  console.log(`โหมด AI: ${USE_AI ? 'ยิง (3 ครั้ง/กระทู้)' : 'ไม่ยิง — ใช้ชื่อกระทู้ + ข้อความแรก'}`
    + (SINCE ? ` · ตั้งแต่ ${SINCE.toISOString().slice(0, 10)}` : ' · ทุกปี')
    + (LIMIT ? ` · จำกัด ${LIMIT} กระทู้` : '')
    + ` · ${NO_IMAGES ? 'ไม่โหลดรูป' : `รูปไม่เกิน ${MAX_IMAGES}/เคส (เติมรูปให้เคสที่นำเข้าไปแล้วแต่ยังไม่มีรูปด้วย)`}`);

  // โหลด configs (guild → complaint forum)
  let configs;
  if (FORUM_OVERRIDE) {
    if (!GUILD_FILTER) { console.error('--forum ต้องใส่ --guild คู่กันด้วย'); await pool.end(); return; }
    configs = [{ guild_id: GUILD_FILTER, forum_channel_id: FORUM_OVERRIDE }];
  } else {
    const { rows } = await pool.query(
      `SELECT guild_id, forum_channel_id FROM case_config
        WHERE forum_channel_id IS NOT NULL
          AND ($1::varchar IS NULL OR guild_id = $1)`,
      [GUILD_FILTER],
    );
    configs = rows;
  }
  if (!configs.length) { console.log('ไม่มี guild ที่ตั้งค่า case_config'); await pool.end(); return; }

  // ⛔ จังหวัดเดียวปั๊มข้ามหลาย guild = ปั้นข้อมูลผิดเงียบๆ (ราชบุรีกับอาสาประชาชนคนละพื้นที่)
  //    บังคับให้เลือก guild เองเมื่อมีมากกว่า 1 — ยอมให้พิมพ์เพิ่ม ดีกว่าได้เคสติดจังหวัดผิดทั้งชุด
  if (configs.length > 1) {
    console.error(`❌ มี ${configs.length} guild ใน case_config แต่ --province ใช้ได้ทีละจังหวัด`);
    console.error('   ระบุ --guild <id> ให้ชัด แล้วรันทีละ guild:');
    for (const c of configs) console.error(`     --guild ${c.guild_id}   (forum ${c.forum_channel_id})`);
    await pool.end();
    return;
  }

  let totalNew = 0, totalSkip = 0, totalErr = 0, totalAssigned = 0, totalNoOwner = 0;
  let totalImg = 0, totalImgBackfilled = 0, totalImgPending = 0;
  const createdCaseIds = [];

  for (const { guild_id, forum_channel_id } of configs) {
    const province = PROVINCE;   // มาจาก --province เท่านั้น (ดูเหตุผลตรงที่ประกาศ PROVINCE)

    console.log(`\nGuild ${guild_id} · forum ${forum_channel_id} · province=${province}`);

    let threads = await fetchAllThreadsInForum(guild_id, forum_channel_id);
    const fetched = threads.length;
    if (SINCE) threads = threads.filter(t => createdAtOf(t.id) >= SINCE);
    threads.sort((a, b) => (a.id < b.id ? -1 : 1));   // เก่า → ใหม่ ให้ --limit หยิบของเก่าสุดก่อน
    console.log(`Fetched ${fetched} threads${SINCE ? ` → เข้าเกณฑ์วันที่ ${threads.length}` : ''}, checking...`);

    let gNew = 0, gSkip = 0, gErr = 0, gAssigned = 0, gNoOwner = 0;
    let gImg = 0, gImgBackfilled = 0, gImgPending = 0;
    for (let i = 0; i < threads.length; i++) {
      if (LIMIT && gNew >= LIMIT) { console.log(`\n  ครบ --limit ${LIMIT} แล้ว หยุด`); break; }
      const t = threads[i];
      process.stdout.write(`\r  ${i + 1}/${threads.length} (new:${gNew} skip:${gSkip} err:${gErr} รูป:${gImg}+${gImgBackfilled})`);

      try {
        const existing = await caseDb.getCaseByThreadId(t.id);
        if (existing) {
          gSkip++;
          // ⭐ เคสที่นำเข้าไปแล้ว (รอบก่อนหน้าไม่มีโค้ดดึงรูปเลย) — เติมรูปให้ด้วยในตัว ไม่ต้องมีสคริปต์แยก
          //    เช็ค hasAttachments ก่อนเสมอกันยิง Discord ซ้ำทุกครั้งที่รันสคริปต์กับเคสที่เติมแล้ว
          if (!NO_IMAGES) {
            const missing = !(await hasAttachments(existing.id));
            if (missing && DRY_RUN) gImgPending++;
            if (missing && !DRY_RUN) {
              try {
                const oldMsgs = await fetchThreadMessages(t.id);
                const images = extractImages(oldMsgs);
                if (images.length) gImgBackfilled += await attachCaseImages(existing.id, existing.org_id, images);
              } catch (e) {
                console.error(`\n  [img-backfill] case ${existing.id} (thread ${t.id}):`, e.message);
              }
            }
          }
          continue;
        }

        if (DRY_RUN) { gNew++; continue; }

        let title = t.name || 'เรื่องร้องเรียน';
        let detail = null;
        let lastMsgId = t.last_message_id || null;
        let aiSummary = null;
        let msgs = [];

        // ⚠️ ต้องดึงข้อความทั้งกระทู้เพื่อสแกนหารูป ไม่ใช่แค่ตอน --ai อีกต่อไป
        //    (เดิมโหมดไม่ใส่ --ai ใช้ fetchStarterText แค่ 1-2 call — ถูกกว่าแต่มองไม่เห็นรูปที่อยู่ลึกในกระทู้)
        //    ปิดด้วย --no-images ถ้าอยากได้ path เดิมที่ถูกกว่า
        const needFullFetch = USE_AI || !NO_IMAGES;
        if (needFullFetch) msgs = await fetchThreadMessages(t.id);

        if (USE_AI) {
          detail = msgs[0]?.content || null;
          lastMsgId = msgs.at(-1)?.id || lastMsgId;
          const text = messagesToText(msgs);
          if (text.trim()) {
            try {
              const prompt = `หัวข้อกระทู้: ${t.name}\n\nบทสนทนา:\n${text}`;
              const [genTitle, genSummary] = await Promise.all([
                callAI(AI_TITLE_SYSTEM, prompt, { guildId: guild_id }),
                callAI(AI_SUMMARY_SYSTEM, prompt, { guildId: guild_id }),
              ]);
              if (genTitle?.trim()) title = genTitle.trim().slice(0, 300);
              aiSummary = genSummary || null;
            } catch (e) {
              console.error(`\n  [ai] thread ${t.id}:`, e.message);
            }
          }
        } else if (needFullFetch) {
          // เทียบเท่า fetchStarterText แต่จากลิสต์ที่ดึงมาแล้ว (ไม่ต้องยิง API เพิ่ม)
          detail = msgs.find(m => m.content?.trim() && !m.author?.bot)?.content || null;
        } else {
          detail = await fetchStarterText(t.id);
        }

        const row = await caseDb.createCase({
          guild_id, province, category: null,
          title: title.slice(0, 300), detail,
          source: 'discord',
          complainant_name: await complainantNameOf(guild_id, t.owner_id),
          complainant_phone: null, discord_thread_id: t.id, created_by: t.owner_id || null,
        });
        // ⛔ **ห้ามเลื่อน watermark ตรงนี้** (บั๊ก bug-209 · prod ค้าง 172 ใบ)
        //    `last_synced_message_id` แปลว่า "ข้อความถึง id นี้ถูกสกัดเป็น timeline แล้ว"
        //    ไม่ใช่ "เห็นข้อความถึง id นี้แล้ว" — เดิมเซ็ตจาก `t.last_message_id` ตั้งแต่ตอนสร้างเคส
        //    ทั้งที่โหมดปกติ (ไม่ใส่ --ai) ไม่เคยสกัด timeline เลยสักครั้ง
        //    ผลคือปุ่ม "ดึง Discord ใหม่" บนเว็บตอบ "ไม่มีข้อความใหม่" ตลอดกาล = เคสกู้ตัวเองไม่ได้
        //    → เลื่อน **หลังสกัด timeline สำเร็จ** เท่านั้น (ดูท้ายลูป)
        if (aiSummary) await caseDb.setAiSummary(row.id, aiSummary);

        if (!NO_IMAGES && msgs.length) {
          const images = extractImages(msgs);
          if (images.length) {
            try { gImg += await attachCaseImages(row.id, row.org_id, images); }
            catch (e) { console.error(`\n  [img] case ${row.id}:`, e.message); }
          }
        }

        // ── เจ้าภาพ = เจ้าของกระทู้ (user เคาะ 2026-08-29) ────────────────────────
        // ⚠️ ความหมายต่างจากฝั่งโพสต์: กระทู้ร้องเรียนคนตั้ง = **ผู้ร้อง** ไม่ใช่คนที่รับผิดชอบแก้
        //    (ชื่อเดียวกันนี้ถูกใส่เป็น complainant_name ด้วย) · แต่ของจริงในห้องนี้ทีมงานเป็นคนตั้ง
        //    กระทู้แทนชาวบ้านเกือบทั้งหมด → user เลือกให้เป็นเจ้าภาพไปเลย
        // ⭐ ที่ต้องมีเจ้าภาพ ไม่ใช่แค่ความสวยงาม: การ์ดที่ไม่มีเจ้าภาพจะไปโผล่ใน
        //    "การบ้านของฉัน" ของ **ทุกคน** (isMyCard นับงานไม่มีเจ้าภาพเป็นของทุกคน)
        //    เคส 179 ใบไม่มีเจ้าภาพ = หน้าแรกพังทั้งทีม (เหตุผลเดียวกับ web/db/kanban/links.js)
        // ⚠️ `case_assignees.user_id` เป็น NOT NULL → ต้องแปลง discord id เป็น users.id ให้ได้ก่อน
        //    คนที่ไม่เคยเข้าระบบ/ออกจากเซิร์ฟเวอร์ไปแล้ว จะไม่มีแถวใน users → ข้าม ไม่ใช่ error
        if (t.owner_id) {
          const ownerUserId = await userIdByDiscord(t.owner_id);
          if (ownerUserId) { await caseDb.addAssignee(row.id, guild_id, t.owner_id); gAssigned++; }
          else gNoOwner++;
        } else gNoOwner++;

        createdCaseIds.push(row.id);

        // AI timeline (เฉพาะโหมด --ai · best-effort)
        // ⭐ watermark เลื่อน **ที่นี่ที่เดียว** และเฉพาะเมื่อเขียน event สำเร็จจริง
        //    สกัดล้ม / ไม่ได้ใส่ --ai → ปล่อย watermark เป็น NULL ไว้ ให้ปุ่มดึงบนเว็บ
        //    ไล่เก็บทั้งเธรดเองได้ทีหลัง (เสียแค่ยิง AI ซ้ำ ดีกว่าเคสตันถาวร)
        if (USE_AI && msgs.length) {
          try {
            const events = await generateTimeline(title, msgs, { guildId: guild_id });
            if (events.length) {
              await caseDb.addTimelineEvents(row.id, guild_id, events, 'ai');
              if (lastMsgId) await caseDb.setLastSyncedMessageId(row.id, lastMsgId);
            }
          } catch (e) { console.error(`\n  [timeline] thread ${t.id}:`, e.message); }
        }

        gNew++;
      } catch (e) {
        gErr++;
        console.error(`\n  [err] thread ${t.id}:`, e.message);
      }
    }

    console.log(`\n  Done guild ${guild_id}: new=${gNew} skip=${gSkip} err=${gErr}`
      + ` · เจ้าภาพ=${gAssigned} หาเจ้าของไม่ได้=${gNoOwner}`
      + (NO_IMAGES ? '' : DRY_RUN
        ? ` · รูปที่จะเติมให้เคสเก่า=${gImgPending}`
        : ` · รูป(เคสใหม่)=${gImg} รูป(เติมของเก่า)=${gImgBackfilled}`));
    totalNew += gNew; totalSkip += gSkip; totalErr += gErr;
    totalAssigned += gAssigned; totalNoOwner += gNoOwner;
    totalImg += gImg; totalImgBackfilled += gImgBackfilled; totalImgPending += gImgPending;
  }

  console.log(`\n=== สรุป: new=${totalNew} skip=${totalSkip} err=${totalErr}`
    + ` · เจ้าภาพ=${totalAssigned} หาเจ้าของไม่ได้=${totalNoOwner}`
    + (NO_IMAGES ? '' : DRY_RUN
      ? ` · รูปที่จะเติมให้เคสเก่า=${totalImgPending}`
      : ` · รูป(เคสใหม่)=${totalImg} รูป(เติมของเก่า)=${totalImgBackfilled}`)
    + ' ===');

  // ⚠️ การ์ด kanban ถูกยิงแบบ fire-and-forget ใน createCase() (`.catch(() => {})`)
  //    ปิด pool ทันทีหลังใบสุดท้าย = ใบท้ายๆ อาจยังเขียนการ์ดไม่เสร็จแล้วโดนตัดเงียบๆ
  //    (dev รอบแรกครบ 185/185 ก็จริง แต่เป็นเรื่องจังหวะ ไม่ใช่การรับประกัน)
  if (!DRY_RUN && totalNew) { await sleep(2000); }

  /**
   * ⭐ sync ผู้รับผิดชอบลงการ์ด — **ต้องทำเป็นก้อนท้ายสุด ไม่ใช่ทีละใบระหว่างลูป**
   *
   * `kanban_card_assignees` เป็น **สำเนา** ของ `case_assignees` ไม่ได้อ่านสดเหมือนสถานะ
   * (สถานะอ่านสดผ่าน LIVE_STATUS_SQL) → ต้องเขียนให้เอง
   *
   * ทำท้ายสุดเพราะการ์ดเกิดแบบ fire-and-forget — ระหว่างลูปมันอาจยังไม่มีแถวให้เขียน
   *
   * ⭐ 2026-09-03 (เฟส B): เดิมยัด assignee **คนแรก** ลง `kanban_cards.owner_user_id`
   *    คอลัมน์นั้นถูกยุบทิ้งแล้ว → ลงตารางเป็นชุดแทน · สถานะการ์ดขยับตามให้เองด้วย trigger
   */
  if (!DRY_RUN && createdCaseIds.length) {
    const { rowCount } = await pool.query(
      `INSERT INTO kanban_card_assignees (card_id, user_id, assigned_at)
       SELECT l.card_id, a.user_id, a.assigned_at
         FROM kanban_card_links l
         JOIN case_assignees a ON a.case_id = l.entity_id
        WHERE l.entity_type = 'case'
          AND l.entity_id = ANY($1)
       ON CONFLICT DO NOTHING`,
      [createdCaseIds],
    );
    console.log(`sync ผู้รับผิดชอบลงการ์ด kanban: ${rowCount} แถว`);
  }

  await pool.end();
})();
