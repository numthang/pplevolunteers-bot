/**
 * backfillPostThreads.js — กวาดกระทู้เก่าใน forum งานสื่อ มาสร้างเป็นโพสต์ (post_episodes)
 *
 * คู่แฝดของ backfillCaseThreads.js แต่ปลายทางเป็น posts ไม่ใช่ cases
 * ลอก flow มาจาก handlers/postImportHandler.js (context menu "นำเข้าเป็นโพสต์") ทั้งดุ้น
 * ต่างกันแค่ทำทีละเยอะและไม่มีคนกดเลือกหมวดให้
 *
 * Usage (local):
 *   node scripts/data/backfillPostThreads.js --dry-run     ← ดูยอดก่อน (~10 วินาที)
 *   node scripts/data/backfillPostThreads.js               ← รันจริง
 *
 * Usage (prod) — ⚠️ **ต้อง `sudo -u www` เสมอ** ไม่งั้น .env ไม่โหลด + ไฟล์รูปเป็นของ user ผิดคน:
 *   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && \
 *     node scripts/data/backfillPostThreads.js --dry-run'
 *
 * ⚠️ **ลำดับบน prod ห้ามสลับ** — migration (CHECK created_via) → deploy เว็บ → รันสคริปต์
 *    รันสคริปต์ก่อน migration = พังตอน INSERT · ก่อน deploy เว็บ = โพสต์เก่าหลายร้อยใบ
 *    ท่วมหน้า /posts ให้ทีมเห็น เพราะตัวกรอง `created_via <> 'backfill'` ยังไม่ขึ้น
 *
 * ⭐ **rollback ไม่ใช่ restore** — สคริปต์นี้ INSERT อย่างเดียว ไม่แตะของเดิมสักแถว
 *    ถ้าจะถอย ให้ลบตามป้าย `created_via = 'backfill'` (+ ไฟล์ตาม path ใน post_episode_media)
 *    การ restore ตารางกลับจะลบงานที่ทีมทำระหว่างนั้นไปด้วย = แย่กว่าเดิม
 *
 * ⭐ **สั่งเปล่าๆ ปลอดภัยแล้ว** (เปลี่ยนค่าตั้งต้น 2026-08-28 — user ขอ "ไม่อยากจำ flag")
 *    `node scripts/data/backfillPostThreads.js` = ทุกปี · ไม่ยิง AI · 4 รูป/กระทู้
 *    ของแพง 2 อย่าง (เครดิต AI · พื้นที่ดิสก์) ต้อง **สั่งเปิดเอง** ไม่ใช่ติดมากับ default
 *    เหตุผล: ของจริงคือ 550+ กระทู้ ค่าเดิม (ยิง AI + 30 รูป) ตั้งไว้ตอนคิดว่าจะนำเข้าไม่กี่ใบ
 *    → เผลอสั่งเปลาๆ ครั้งเดียว = เผาเครดิต 550 ครั้ง + ดิสก์ ~5 GB
 *
 * Options:
 *   --dry-run          นับอย่างเดียว ไม่ยิง AI ไม่เขียน DB ไม่โหลดรูป  ← รันอันนี้ก่อนเสมอ
 *                      ถูกมาก: 561 กระทู้ = 9 วินาที (วัดจริง 2026-08-28) เทียบกับรันจริง ~50 นาที
 *   --limit <n>        ทำแค่ n กระทู้แรกที่ยังไม่มีโพสต์ (ลองน้ำก่อนเทหมด)
 *   --since <YYYY-MM-DD>  เอาเฉพาะกระทู้ที่ตั้งตั้งแต่วันนั้น (เช่น ย้อนหลัง 1 ปี)
 *   --years <n>        ทางลัดของ --since = วันนี้ลบ n ปี   (ไม่ใส่ = ทุกปี)
 *   --forum <id> --guild <id>   เจาะ forum เดียว (ไม่ใส่ = ทุกอันใน FORUMS)
 *   --owner <discordId>         เจ้าภาพสำรองเมื่อหาเจ้าของกระทู้ไม่เจอ
 *   --no-images        ไม่แนบ/ไม่โหลดรูปเลย
 *   --max-images <n>   จำกัดจำนวนรูปที่ดึงต่อกระทู้ (**ค่าเริ่มต้น 4**) — ของ backfill ต้องตั้งต่ำ
 *                      เพราะเป็น draft เก่าที่แทบไม่ถูก publish → รูปไม่โดน retention เก็บกวาดอัตโนมัติ
 *                      (ดูเหตุผลใน services/postsRetention.js บรรทัด 10) = ค้างกินดิสก์ถาวร
 *   --ai               **ยิง AI เรียบเรียงให้** (ค่าเริ่มต้นคือไม่ยิง) — เสียเครดิต 1 ครั้ง/กระทู้
 *                      ไม่ยิง = หัวข้อ = ชื่อกระทู้ · เนื้อหา = ข้อความดิบทั้งกระทู้
 *                      โพสต์เป็น draft อยู่แล้ว กดปุ่ม "ให้ AI เรียบเรียง" ในเว็บทีหลังทีละใบได้
 *   --no-ai            (ยังรับอยู่ ไม่ทำอะไร — ค่าเริ่มต้นเป็นแบบนี้แล้ว) กันคำสั่งเก่าที่จดไว้พัง
 *
 * ⚠️ **บนเครื่อง dev ดึงกระทู้จริงได้** (token ที่นี่อยู่ในเซิร์ฟเวอร์ทั้ง 2 อัน — ตรวจแล้ว 2026-08-24)
 *    แต่มันเขียนลง **DB ของ dev** ไม่ใช่ prod → ใช้ซ้อมและนับยอดได้ ของจริงต้องรันบน prod
 *    (ต่างจาก backfillCaseThreads.js ที่บน dev รันไม่ได้เลยเพราะ `case_config` ที่นี่ว่าง)
 *
 * ⭐ กันซ้ำที่ `post_episodes.channel_id = <id ของกระทู้>` — หลักที่ user เคาะคือ
 *    **1 topic = 1 posts = 1 ตะกร้าสื่อ** และ partial unique `uq_open_basket_per_channel`
 *    บังคับให้อยู่แล้วที่ชั้น DB · ตะกร้าที่เปิดทีหลังในกระทู้เดิมจะเกาะโพสต์ใบนี้ (ensureOpenEpisode ใช้ซ้ำ)
 *
 * ⚠️ เช็คว่า "เคยนำเข้าแล้ว" **โดยไม่สนใจ archived_at** — โพสต์ที่ถูกเก็บเข้ากรุไปแล้วคือของที่คน
 *    ตัดสินใจทิ้ง ถ้าเช็คเฉพาะใบที่ยังไม่เข้ากรุ รันซ้ำจะปลุกงานที่เขาลบไปแล้วกลับมาทุกรอบ
 *
 * ⭐ **การ์ด kanban ถูกสร้างให้เองในตัว ไม่ต้องรันสคริปต์ที่สองตามหลัง** (แก้คอมเมนต์ผิด 2026-08-28)
 *    `createImportedPost()` เรียก `mirrorEntityCardFromBot()` ให้อยู่แล้ว และของ backfill
 *    ลงกอง **"เสร็จแล้ว" (done)** ตั้งแต่สร้าง เพราะเป็นงานที่จบไปแล้ว ไม่ใช่งานค้าง
 *    ⚠️ คอมเมนต์เดิมตรงนี้เขียนว่า "ไม่มี hook เข้า kanban" ซึ่ง**ค้างมาจากตอนที่ยังไม่มี hook**
 *       และหลอกให้เข้าใจผิดมาแล้ว → `backfillEntityCards.mjs` เป็นแค่ตาข่ายตามเก็บ ไม่ใช่ขั้นบังคับ
 */
require('dotenv').config();
const pool = require('../../db/index');
const { userIdByDiscord } = require('../../db/org');
const { callAI } = require('../../services/aiSummarize');
const { createImportedPost, attachImages } = require('../../db/postsImport');
const { downloadPending } = require('../../db/mediaBasket');

// forum งานสื่อที่ user ระบุ · เพิ่มที่นี่ถ้ามี server/ห้องใหม่ (ชื่อห้องไว้ให้คนอ่านรู้ว่าอันไหนคืออะไร)
const FORUMS = [
  { guildId: '1111998833652678757', forumId: '1126213766284050492' }, // ราชบุรี · #กระทู้-สื่อ
  { guildId: '1340903354037178410', forumId: '1341846694685315254' }, // อาสาประชาชน · #กระทู้-สื่อ
  { guildId: '1111998833652678757', forumId: '1260552093266345994' }, // ราชบุรี · #กระทู้สื่อ-เลือกตั้ง (2026-08-28)
];

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = has('dry-run');
const NO_IMAGES = has('no-images');
// ⭐ กลับด้านจากเดิม: ไม่ยิง AI เป็นค่าตั้งต้น ต้องสั่ง --ai ถึงจะยิง (ดูหัวไฟล์)
const NO_AI = !has('ai');
const LIMIT = Number(arg('limit', 0)) || 0;
const FALLBACK_OWNER = arg('owner', null);
const ONE_FORUM = arg('forum', null);
const ONE_GUILD = arg('guild', null);

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)(?:[?#]|$)/i;
const MAX_IMAGES = Number(arg('max-images', 4)) || 4;

// ── วันที่ตั้งกระทู้ อ่านจาก snowflake ───────────────────────────────────────
// ⭐ id ของกระทู้ **มีเวลาสร้างฝังอยู่ในตัวเลขอยู่แล้ว** → กรองย้อนหลังได้โดยไม่ต้องยิง API เพิ่มสักครั้ง
//    (thread_metadata.create_timestamp ไม่ได้ติดมาทุกกระทู้ — ของเก่าก่อนปี 2022 เป็น null)
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

// prompt เดียวกับ handlers/postImportHandler.js เป๊ะ — ถ้าแก้ที่นั่นต้องแก้ที่นี่ด้วย
// (ตั้งใจก็อปไม่ใช่ import: handler เป็นไฟล์ discord.js เต็มใบ ดึงเข้ามาในสคริปต์แล้วลาก client ตามมาทั้งก้อน)
const AI_SYSTEM = `คุณเป็นผู้ช่วยบรรณาธิการงานสื่อของพรรคการเมืองไทย
ผู้ใช้จะโยนบทสนทนาในกระทู้ Discord มาให้ — หลายคนคุยกัน มีข้อความปลีกย่อย/ทักทาย/ตอบกลับปนกันอยู่
งานของคุณคือกลั่นเนื้อหาทั้งหมดออกมาเป็น **โพสต์โซเชียล 1 โพสต์** ที่เอาไปโพสต์ได้จริงทันที
กติกา:
- ผลลัพธ์เป็นโพสต์เดียวเสมอ ห้ามซอยเป็นหลายโพสต์ ห้ามทำเป็นโครง/สรุปหัวข้อย่อย ห้ามเขียนเป็นบทสนทนา/ไดอะล็อก
- ดึงประเด็นสำคัญจากบทสนทนาให้ครบ เรียงลำดับให้อ่านรู้เรื่องเป็นเนื้อความเดียว ตัดคำทักทาย/คำฟุ่มเฟือย/ข้อความซ้ำออก
- ห้ามเพิ่มข้อเท็จจริง ตัวเลข ชื่อคน หรือข้ออ้างที่ไม่มีในบทสนทนา
- รักษาน้ำเสียง/จุดยืนของผู้พูดไว้ ไม่ต้องทำให้เป็นทางการกว่าเดิม
- เขียนเป็นย่อหน้าปกติ ไม่ใส่ markdown ไม่ใส่หัวข้อกำกับ
- title = ชื่อไว้หาเจอในระบบ (สั้น ตรงประเด็น) ไม่ใช่พาดหัวโฆษณา
- category = ชื่อหมวดสั้นๆ 1 ชื่อ (ใส่ null ถ้าไม่มั่นใจ)

ตอบเป็น JSON รูปแบบนี้เท่านั้น ห้ามมีข้อความอื่นนอก JSON:
{"category": "ชื่อหมวดหรือ null", "title": "ชื่อโพสต์", "body": "เนื้อหาโพสต์เต็ม"}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * ⭐ รอแล้วลองใหม่เมื่อโดน 429 (rate limit) — **จำเป็นบน prod เท่านั้นแต่ต้องมี**
 *
 * โควตา rate limit ผูกกับ token ของบอท · บน prod บอทตัวจริงรันตลอด 24 ชม. รับ event อยู่แล้ว
 * สคริปต์นี้ไปแย่งโควตาเดียวกัน → เจอ 429 ประปราย (บน dev ไม่เจอเลยเพราะบอท Tester นั่งเฉยๆ
 * — ห้ามสรุปว่า "เทสบน dev ผ่านแล้วแปลว่าไม่มีปัญหา" เจอจริงตอนรัน prod 2026-08-28)
 *
 * เดิมโยน error ทิ้งทันที = กระทู้นั้นถูกนับ "พลาด" แล้วข้ามไป ต้องมารันซ้ำเก็บทีหลังหลายรอบ
 * Discord บอกเวลาที่ต้องรอมาให้ใน `retry_after` (วินาที) — เชื่อค่านั้น ไม่ต้องเดาเอง
 *
 * 5xx ก็ลองใหม่ด้วย (Discord ล่มชั่วคราว) · 4xx อื่นไม่ลอง เพราะขอผิดเองลองกี่ครั้งก็ผิด
 */
async function discordFetch(path, attempt = 0) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });
  if (res.ok) return res.json();

  const retryable = res.status === 429 || res.status >= 500;
  if (retryable && attempt < 5) {
    // header เป็นวินาที (ทศนิยมได้) · เผื่อไม่มีมาก็ถอยแบบเพิ่มขึ้นเรื่อยๆ 1s→2s→4s…
    const headerWait = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(headerWait) && headerWait > 0
      ? headerWait * 1000 + 250          // บวกอีกนิดกันพลาดเส้นเป๊ะๆ
      : 1000 * 2 ** attempt;
    await sleep(waitMs);
    return discordFetch(path, attempt + 1);
  }
  throw new Error(`Discord ${res.status}: ${path}`);
}

/** กระทู้ทั้งหมดใน forum — active + archived (แบ่งหน้า) · ลอกจาก backfillCaseThreads.js */
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
    //    อาการหลอก: ไม่ได้ error ให้เห็นชัด แค่ได้กระทู้มาไม่ครบ (เจอตอนรันจริง 2026-08-24)
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
  return msgs.reverse(); // เก่า → ใหม่
}

const messagesToText = (msgs) => msgs
  .filter(m => m.content?.trim() && !m.author?.bot)
  .map(m => `${m.author?.username || 'user'}: ${m.content}`)
  .join('\n');

/** รูปจากทุกข้อความในกระทู้ — เก็บ messageId ต้นทางไว้ต่อรูป (REST คืน attachments เป็น array) */
function extractImages(msgs) {
  const out = [];
  for (const m of msgs) {
    for (const a of m.attachments || []) {
      if (IMAGE_EXT_RE.test(a.filename || a.url)) out.push({ url: a.url, messageId: m.id });
      if (out.length >= MAX_IMAGES) return out;
    }
  }
  return out;
}

/** callAI คืนข้อความดิบ ไม่ parse JSON ให้ — ต้อง parse+validate เอง (เหมือน postImportHandler) */
function parseAiJson(raw) {
  const cleaned = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let obj;
  try { obj = JSON.parse(cleaned); } catch { return null; }
  if (!obj || typeof obj.title !== 'string' || !obj.title.trim() || typeof obj.body !== 'string' || !obj.body.trim()) return null;
  return {
    title: obj.title.trim(),
    body: obj.body.trim(),
    category: typeof obj.category === 'string' && obj.category.trim() ? obj.category.trim() : null,
  };
}

/** เคยนำเข้ากระทู้นี้แล้วหรือยัง — ⚠️ ไม่กรอง archived_at (ดูหัวไฟล์) */
async function alreadyImported(threadId) {
  const { rows } = await pool.query(
    `SELECT id FROM post_episodes WHERE channel_id = $1 LIMIT 1`, [threadId]
  );
  return rows[0]?.id || null;
}

(async () => {
  if (!BOT_TOKEN) { console.error('ไม่มี DISCORD_BOT_TOKEN'); process.exit(1); }

  const targets = (ONE_FORUM && ONE_GUILD)
    ? [{ guildId: ONE_GUILD, forumId: ONE_FORUM }]
    : FORUMS;

  console.log(DRY_RUN ? '=== DRY RUN — ไม่เขียนอะไรเลย ===' : '=== backfillPostThreads ===');
  // สรุปค่าที่จะใช้จริงก่อนลงมือเสมอ — 2 ค่านี้เป็นของแพง (เครดิต AI · ดิสก์) คนรันต้องเห็นก่อน
  console.log(
    `ตั้งค่า: ${SINCE ? `ตั้งแต่ ${SINCE.toISOString().slice(0, 10)}` : 'ทุกปี'}` +
    ` · ${NO_AI ? 'ไม่ยิง AI (ข้อความดิบ)' : '⚠️ ยิง AI ทุกกระทู้ — เสียเครดิต'}` +
    ` · ${NO_IMAGES ? 'ไม่โหลดรูป' : `รูปไม่เกิน ${MAX_IMAGES}/กระทู้`}` +
    ` · ${targets.length} forum`
  );
  if (!DRY_RUN && !FALLBACK_OWNER) {
    console.log('⚠️  ไม่ได้ส่ง --owner มา — กระทู้ที่หาเจ้าของไม่เจอจะถูกข้าม (การ์ด kanban ห้ามไม่มีเจ้าภาพ)');
  }

  let totalNew = 0, totalSkip = 0, totalErr = 0, totalNoOwner = 0, totalOld = 0, done = 0;

  for (const { guildId, forumId } of targets) {
    console.log(`\nGuild ${guildId} · forum ${forumId}`);

    let threads;
    try {
      threads = await fetchAllThreadsInForum(guildId, forumId);
    } catch (e) {
      console.error(`  [err] ดึงกระทู้ไม่ได้: ${e.message}`);
      totalErr++;
      continue;
    }

    // แยกก่อนว่าอันไหนใหม่จริง — คนรันต้องเห็นยอดก่อนที่มันจะเริ่มยิง AI
    const pending = [];
    let skipped = 0, tooOld = 0;
    for (const t of threads) {
      if (SINCE && createdAtOf(t.id) < SINCE) { tooOld++; continue; }
      if (await alreadyImported(t.id)) skipped++;
      else pending.push(t);
    }
    console.log(
      `  กระทู้ทั้งหมด ${threads.length}` +
      (SINCE ? ` · เก่ากว่าที่กำหนด ${tooOld}` : '') +
      ` · มีโพสต์แล้ว ${skipped} · ยังไม่มี ${pending.length}`
    );
    totalSkip += skipped; totalOld += tooOld;

    // ⚠️ `done` นับ "กระทู้ที่ลงมือแล้ว" ไม่ใช่ "ที่สร้างสำเร็จ" — --limit มีไว้คุมค่าใช้จ่าย
    //    และค่าใช้จ่ายเกิดตอน**ยิง AI** ไม่ใช่ตอนสร้างสำเร็จ · เคยเขียนให้นับเฉพาะที่สำเร็จ
    //    → ตอน AI ล้มทุกใบ done ค้างที่ 0 แล้วมันไล่ทำต่อไม่รู้จบทั้งที่สั่ง --limit 2 ไว้ (เจอตอนรันจริง)
    const todo = LIMIT ? pending.slice(0, Math.max(0, LIMIT - done)) : pending;
    if (LIMIT && todo.length < pending.length) {
      console.log(`  (--limit ${LIMIT} → รอบนี้ทำแค่ ${todo.length})`);
    }
    if (DRY_RUN) { totalNew += todo.length; continue; }

    let gNew = 0, gErr = 0, gNoOwner = 0;
    for (let i = 0; i < todo.length; i++) {
      const t = todo[i];
      process.stdout.write(`\r  ${i + 1}/${todo.length} (สร้าง:${gNew} ไม่มีเจ้าของ:${gNoOwner} พลาด:${gErr})`);
      done++;   // นับทุกใบที่ลงมือ ไม่ว่าจะสำเร็จหรือไม่ (ดูคอมเมนต์ตรง todo ข้างบน)

      try {
        // เจ้าภาพต้องมีเสมอ — การ์ด kanban ที่ไม่มีเจ้าภาพถูกนับเป็น "ของทุกคน" (isMyCard)
        // เคสจริงที่เคยพัง: เคส 200 ใบไม่มีเจ้าภาพ = หน้า "การบ้านของฉัน" พังทั้งทีม
        const ownerDiscordId = t.owner_id || FALLBACK_OWNER;
        if (!ownerDiscordId || !(await userIdByDiscord(ownerDiscordId))) {
          gNoOwner++;
          continue;
        }

        const msgs = await fetchThreadMessages(t.id);
        const text = messagesToText(msgs);
        if (!text.trim()) { gNoOwner++; continue; }   // กระทู้ที่มีแต่รูป/บอท — ไม่มีอะไรให้ AI สรุป

        // --no-ai: ยกข้อความดิบมาตรงๆ ไม่กลั่น — ใช้ตอนเครดิต AI หมด
        // ⭐ เนื้อหาไม่หาย ได้การ์ด kanban ครบ แล้วค่อยกด "ให้ AI เรียบเรียง" ในเว็บทีหลังทีละใบ
        //    (โพสต์เป็น draft อยู่แล้ว ไม่มีอะไรถูกเผยแพร่โดยไม่มีคนอ่านก่อน)
        //    source_idea เก็บข้อความดิบเหมือนกันทั้ง 2 โหมด → เปลี่ยนใจย้อนกลับมากลั่นทีหลังได้เสมอ
        let ai = null;
        if (NO_AI) {
          ai = { title: (t.name || `กระทู้ ${t.id}`).slice(0, 300), body: text, category: null };
        } else {
          try {
            ai = parseAiJson(await callAI(AI_SYSTEM, `หัวข้อกระทู้: ${t.name || ''}\n\nบทสนทนา:\n\n${text}`, { guildId }));
          } catch (e) {
            console.error(`\n  [ai] thread ${t.id}:`, e.message);
          }
          // AI ตอบไม่ตรงรูปแบบ = ไม่สร้าง (ไม่เดาต่อ) — หลักเดียวกับ postImportHandler
          if (!ai) { gErr++; continue; }
        }

        const post = await createImportedPost({
          guildId,
          addedByDiscordId: ownerDiscordId,
          category: ai.category,
          title: ai.title,
          body: ai.body,
          sourceIdea: text,
          channelId: t.id,          // ⭐ กุญแจกันซ้ำ
          channelName: t.name || null,
          // ⭐ ป้ายว่า "ของเก่านำเข้าย้อนหลัง" — ทำให้ listPosts ตัดออกจากฟีดหลักและแท็บจากดิสฯ
          //    ไม่งั้น 500+ ใบจะทับงานจริงที่ทีมกำลังทำอยู่ (limit 200 เรียงตามแก้ล่าสุด)
          createdVia: 'backfill',
        });

        if (!NO_IMAGES) {
          const images = extractImages(msgs);
          if (images.length) {
            await attachImages(post.id, ownerDiscordId, images);
            // ลิงก์ที่เพิ่งดึงมายังไม่หมดอายุ → โหลดได้เลย ไม่ต้องมี client มา refresh ให้
            await downloadPending(post.id).catch(e => console.error(`\n  [img] post ${post.id}:`, e.message));
          }
        }
        gNew++;
        if (LIMIT && done >= LIMIT) break;
      } catch (e) {
        gErr++;
        console.error(`\n  [err] thread ${t.id}:`, e.message);
      }
    }

    console.log(`\n  จบ guild ${guildId}: สร้าง ${gNew} · ไม่มีเจ้าของ/ไม่มีข้อความ ${gNoOwner} · พลาด ${gErr}`);
    totalNew += gNew; totalErr += gErr; totalNoOwner += gNoOwner;
    if (LIMIT && done >= LIMIT) break;
  }

  console.log(
    DRY_RUN
      ? `\nDRY RUN — จะสร้าง ${totalNew} โพสต์ · ข้ามที่มีแล้ว ${totalSkip}${SINCE ? ` · ข้ามเพราะเก่าเกิน ${totalOld}` : ''}`
      : `\nเสร็จ: สร้าง ${totalNew} · ข้าม ${totalSkip}${SINCE ? ` · เก่าเกิน ${totalOld}` : ''} · ไม่มีเจ้าของ/ไม่มีข้อความ ${totalNoOwner} · พลาด ${totalErr}`
  );
  if (!DRY_RUN && totalNew) {
    console.log('\n👉 ขั้นถัดไป: สร้างการ์ด kanban ให้โพสต์พวกนี้');
    console.log('   node --env-file=.env scripts/kanban/backfillEntityCards.mjs --org 1 --dry');
  }
  await pool.end();
})();
