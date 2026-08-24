/**
 * backfillPostThreads.js — กวาดกระทู้เก่าใน forum งานสื่อ มาสร้างเป็นโพสต์ (post_episodes)
 *
 * คู่แฝดของ backfillCaseThreads.js แต่ปลายทางเป็น posts ไม่ใช่ cases
 * ลอก flow มาจาก handlers/postImportHandler.js (context menu "นำเข้าเป็นโพสต์") ทั้งดุ้น
 * ต่างกันแค่ทำทีละเยอะและไม่มีคนกดเลือกหมวดให้
 *
 * Usage (local — ใช้ไม่ได้จริง ดู ⛔ ข้างล่าง):
 *   node scripts/data/backfillPostThreads.js --dry-run
 * Usage (prod):
 *   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && \
 *     node scripts/data/backfillPostThreads.js --dry-run'
 *
 * Options:
 *   --dry-run          นับอย่างเดียว ไม่ยิง AI ไม่เขียน DB ไม่โหลดรูป  ← รันอันนี้ก่อนเสมอ
 *   --limit <n>        ทำแค่ n กระทู้แรกที่ยังไม่มีโพสต์ (ลองน้ำก่อนเทหมด)
 *   --forum <id> --guild <id>   เจาะ forum เดียว (ไม่ใส่ = ทั้ง 2 อันใน FORUMS)
 *   --owner <discordId>         เจ้าภาพสำรองเมื่อหาเจ้าของกระทู้ไม่เจอ
 *   --no-images        ไม่แนบ/ไม่โหลดรูป
 *
 * ⛔ **รันบนเครื่อง dev ไม่ได้** — `DISCORD_BOT_TOKEN` ที่นี่ผูกกับบอท "Tester"
 *    ไม่ได้อยู่ในเซิร์ฟเวอร์จริง ยิง Discord API แล้วจะไม่เห็นกระทู้เลย (ไม่ใช่ error ให้เห็นชัดๆ ด้วย)
 *
 * ⭐ กันซ้ำที่ `post_episodes.channel_id = <id ของกระทู้>` — หลักที่ user เคาะคือ
 *    **1 topic = 1 posts = 1 ตะกร้าสื่อ** และ partial unique `uq_open_basket_per_channel`
 *    บังคับให้อยู่แล้วที่ชั้น DB · ตะกร้าที่เปิดทีหลังในกระทู้เดิมจะเกาะโพสต์ใบนี้ (ensureOpenEpisode ใช้ซ้ำ)
 *
 * ⚠️ เช็คว่า "เคยนำเข้าแล้ว" **โดยไม่สนใจ archived_at** — โพสต์ที่ถูกเก็บเข้ากรุไปแล้วคือของที่คน
 *    ตัดสินใจทิ้ง ถ้าเช็คเฉพาะใบที่ยังไม่เข้ากรุ รันซ้ำจะปลุกงานที่เขาลบไปแล้วกลับมาทุกรอบ
 *
 * ⚠️ **ไม่มี hook เข้า kanban** (เหมือน db/case.js) — โพสต์ที่ได้จากสคริปต์นี้ยังไม่มีการ์ด
 *    ต้องรัน `node --env-file=.env scripts/kanban/backfillEntityCards.mjs --org <id>` ตามหลัง
 */
require('dotenv').config();
const pool = require('../../db/index');
const { userIdByDiscord } = require('../../db/org');
const { callAI } = require('../../services/aiSummarize');
const { createImportedPost, attachImages } = require('../../db/postsImport');
const { downloadPending } = require('../../db/mediaBasket');

// forum งานสื่อที่ user ระบุ 2026-08-24 · เพิ่มที่นี่ถ้ามี server ใหม่
const FORUMS = [
  { guildId: '1111998833652678757', forumId: '1126213766284050492' },
  { guildId: '1340903354037178410', forumId: '1341846694685315254' },
];

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = has('dry-run');
const NO_IMAGES = has('no-images');
const LIMIT = Number(arg('limit', 0)) || 0;
const FALLBACK_OWNER = arg('owner', null);
const ONE_FORUM = arg('forum', null);
const ONE_GUILD = arg('guild', null);

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)(?:[?#]|$)/i;
const MAX_IMAGES = 30;

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

async function discordFetch(path) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${path}`);
  return res.json();
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
  if (!DRY_RUN && !FALLBACK_OWNER) {
    console.log('⚠️  ไม่ได้ส่ง --owner มา — กระทู้ที่หาเจ้าของไม่เจอจะถูกข้าม (การ์ด kanban ห้ามไม่มีเจ้าภาพ)');
  }

  let totalNew = 0, totalSkip = 0, totalErr = 0, totalNoOwner = 0, done = 0;

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
    let skipped = 0;
    for (const t of threads) {
      if (await alreadyImported(t.id)) skipped++;
      else pending.push(t);
    }
    console.log(`  กระทู้ทั้งหมด ${threads.length} · มีโพสต์แล้ว ${skipped} · ยังไม่มี ${pending.length}`);
    totalSkip += skipped;

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

        let ai = null;
        try {
          ai = parseAiJson(await callAI(AI_SYSTEM, `หัวข้อกระทู้: ${t.name || ''}\n\nบทสนทนา:\n\n${text}`, { guildId }));
        } catch (e) {
          console.error(`\n  [ai] thread ${t.id}:`, e.message);
        }
        // AI ตอบไม่ตรงรูปแบบ = ไม่สร้าง (ไม่เดาต่อ) — หลักเดียวกับ postImportHandler
        if (!ai) { gErr++; continue; }

        const post = await createImportedPost({
          guildId,
          addedByDiscordId: ownerDiscordId,
          category: ai.category,
          title: ai.title,
          body: ai.body,
          sourceIdea: text,
          channelId: t.id,          // ⭐ กุญแจกันซ้ำ
          channelName: t.name || null,
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
      ? `\nDRY RUN — จะสร้าง ${totalNew} โพสต์ · ข้ามที่มีแล้ว ${totalSkip}`
      : `\nเสร็จ: สร้าง ${totalNew} · ข้าม ${totalSkip} · ไม่มีเจ้าของ/ไม่มีข้อความ ${totalNoOwner} · พลาด ${totalErr}`
  );
  if (!DRY_RUN && totalNew) {
    console.log('\n👉 ขั้นถัดไป: สร้างการ์ด kanban ให้โพสต์พวกนี้');
    console.log('   node --env-file=.env scripts/kanban/backfillEntityCards.mjs --org 1 --dry');
  }
  await pool.end();
})();
