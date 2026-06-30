/**
 * backfillCaseThreads.js — ดึงกระทู้เก่าทั้งหมดจาก complaint forum มาสร้าง case
 *
 * Usage (local):  node scripts/backfillCaseThreads.js
 * Usage (prod):   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/backfillCaseThreads.js'
 *
 * Options:
 *   --dry-run   แสดงว่าจะ import อะไรบ้าง โดยไม่ insert จริง
 *   --guild <id>  จำกัดเฉพาะ guild เดียว (ถ้าไม่ใส่ = ทุก guild ที่มี case_config)
 */
require('dotenv').config();
const pool = require('../../db/index');
const caseDb = require('../../db/case');
const { fetchAllMessages, messagesToPlainText } = require('../../services/fetchMessages');
const { callAI } = require('../../services/aiSummarize');
const { generateTimeline } = require('../../services/caseTimeline');

const DRY_RUN = process.argv.includes('--dry-run');
const GUILD_FILTER = (() => {
  const i = process.argv.indexOf('--guild');
  return i !== -1 ? process.argv[i + 1] : null;
})();

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

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

async function discordFetch(path) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${path}`);
  return res.json();
}

async function fetchAllThreadsInForum(guildId, forumChannelId) {
  const threads = [];

  // active threads
  try {
    const active = await discordFetch(`/guilds/${guildId}/threads/active`);
    for (const t of active.threads || []) {
      if (t.parent_id === forumChannelId) threads.push(t);
    }
  } catch (e) {
    console.error('  [warn] active threads:', e.message);
  }

  // archived public threads (paginate)
  let before = null;
  while (true) {
    const qs = before ? `?before=${before}&limit=100` : '?limit=100';
    try {
      const data = await discordFetch(`/channels/${forumChannelId}/threads/archived/public${qs}`);
      for (const t of data.threads || []) threads.push(t);
      if (!data.has_more) break;
      const last = data.threads?.at(-1);
      before = last?.thread_metadata?.archive_timestamp || null;
      if (!before) break;
    } catch (e) {
      console.error('  [warn] archived threads page:', e.message);
      break;
    }
  }

  return threads;
}

async function fetchFirstMessage(threadId) {
  try {
    const msgs = await discordFetch(`/channels/${threadId}/messages?limit=1`);
    return msgs[0]?.content || null;
  } catch { return null; }
}

async function makeClientForThread(threadId) {
  // fetchAllMessages ต้องการ channel object ที่มี messages.fetch
  // ใช้ Discord REST แทน client เพราะ script ไม่ได้ login bot
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

function messagesToText(msgs) {
  return msgs
    .filter(m => m.content?.trim() && !m.author?.bot)
    .map(m => `${m.author?.username || 'user'}: ${m.content}`)
    .join('\n');
}

(async () => {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== backfillCaseThreads ===');

  // โหลด configs
  const { rows: configs } = await pool.query(
    `SELECT guild_id, forum_channel_id FROM case_config WHERE forum_channel_id IS NOT NULL${
      GUILD_FILTER ? ` AND guild_id = '${GUILD_FILTER}'` : ''
    }`,
  );
  if (!configs.length) { console.log('ไม่มี guild ที่ตั้งค่า case_config'); await pool.end(); return; }

  let totalNew = 0, totalSkip = 0, totalErr = 0;

  for (const { guild_id, forum_channel_id } of configs) {
    const province = (await pool.query(
      `SELECT value FROM dc_guild_config WHERE guild_id = $1 AND key = 'case_default_province'`,
      [guild_id],
    )).rows[0]?.value || 'ไม่ระบุ';

    console.log(`\nGuild ${guild_id} · forum ${forum_channel_id} · province=${province}`);

    const threads = await fetchAllThreadsInForum(guild_id, forum_channel_id);
    console.log(`Fetched ${threads.length} threads, checking...`);

    let gNew = 0, gSkip = 0, gErr = 0;
    for (let i = 0; i < threads.length; i++) {
      const t = threads[i];
      process.stdout.write(`\r  ${i + 1}/${threads.length} (new:${gNew} skip:${gSkip} err:${gErr})`);

      try {
        const existing = await caseDb.getCaseByThreadId(t.id);
        if (existing) { gSkip++; continue; }

        if (DRY_RUN) { gNew++; continue; }

        // ดึง messages + AI
        const msgs = await makeClientForThread(t.id);
        const text = messagesToText(msgs);
        const lastMsgId = msgs.at(-1)?.id || null;
        const detail = msgs[0]?.content || null;

        let title = t.name || 'เรื่องร้องเรียน';
        let aiSummary = null;
        if (text.trim()) {
          try {
            const prompt = `หัวข้อกระทู้: ${t.name}\n\nบทสนทนา:\n${text}`;
            const [genTitle, genSummary] = await Promise.all([
              callAI(AI_TITLE_SYSTEM, prompt),
              callAI(AI_SUMMARY_SYSTEM, prompt),
            ]);
            if (genTitle?.trim()) title = genTitle.trim().slice(0, 300);
            aiSummary = genSummary || null;
          } catch (e) {
            console.error(`\n  [ai] thread ${t.id}:`, e.message);
          }
        }

        const ownerId = t.owner_id || null;
        const row = await caseDb.createCase({
          guild_id, province, category: null, title, detail,
          source: 'discord', complainant_name: 'นำเข้าจาก Discord',
          complainant_phone: null, discord_thread_id: t.id, created_by: ownerId,
        });
        if (aiSummary) await caseDb.setAiSummary(row.id, aiSummary, lastMsgId);
        else if (lastMsgId) await caseDb.setLastSyncedMessageId(row.id, lastMsgId);

        // AI timeline
        try {
          const events = await generateTimeline(title, msgs);
          if (events.length) await caseDb.addTimelineEvents(row.id, guild_id, events, 'ai');
        } catch (e) { console.error(`\n  [timeline] thread ${t.id}:`, e.message); }

        gNew++;
      } catch (e) {
        gErr++;
        console.error(`\n  [err] thread ${t.id}:`, e.message);
      }
    }

    console.log(`\n  Done guild ${guild_id}: new=${gNew} skip=${gSkip} err=${gErr}`);
    totalNew += gNew; totalSkip += gSkip; totalErr += gErr;
  }

  console.log(`\n=== สรุป: new=${totalNew} skip=${totalSkip} err=${totalErr} ===`);
  await pool.end();
})();
