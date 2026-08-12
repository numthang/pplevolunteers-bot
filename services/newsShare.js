// services/newsShare.js — แชร์โพสต์ตะกร้าสื่อลงห้องข่าวสาร + ประกาศ event (@everyone)
// ประกาศช่วง quiet hours (21:00–09:00 ไทย) จะเข้าคิวใน dc_guild_config แล้วส่งตอน 09:00
const pool = require('../db/index');
const { getSetting, setSetting, deleteSetting } = require('../db/settings');

const CONFIG_KEY = 'news_channel_id';             // string — ค่าราย guild (ตั้งที่ /bot) = fallback ของกลุ่ม public
const QUEUE_KEY  = 'pending_event_announcements'; // [{ channelId, content, sendAt }]
const QUIET_START = 21; // ชั่วโมงไทย
const QUIET_END   = 9;
const NEWS_OFF = 'off';                           // ค่าที่กลุ่มตั้งว่า "ไม่ส่งเข้าห้องข่าวสาร"

/**
 * ห้องข่าวสารของกลุ่มนี้ — ต้องตรงกับ attachNewsReady ฝั่งเว็บ (web/lib/publishTargets.js)
 *   dc_social_accounts.news_channel_id = 'off' → null (ปิด)
 *   มีค่า                                      → ห้องนั้น (อยู่เซิร์ฟไหนก็ได้ในองค์กรเดียวกัน)
 *   ว่าง + กลุ่ม public                        → fallback dc_guild_config (ของเดิมก่อนมีคอลัมน์นี้)
 *   ว่าง + กลุ่ม private                       → null — กลุ่มส่วนตัวยิงเข้าห้องข่าวขององค์กรได้
 *                                               เฉพาะเมื่อทีมสื่อตั้งห้องให้ (ด่านอยู่ที่หน้าตั้งค่า)
 * ไม่ส่ง groupName = ของเดิมทั้งหมด (ประกาศกิจกรรม / เส้นที่ไม่รู้จักกลุ่ม) → ใช้ค่าราย guild
 *
 * ⚠️ ขอบเขตแถวกลุ่มต้องตรงกับ getConfig (services/metaApi.js):
 *    public  ยึด guild ของตัวเอง · private ยึด **เจ้าของ** ไม่ยึด guild
 *    เดิมล็อค `guild_id = $1` ทั้งคู่ → กลุ่มส่วนตัวที่กดแชร์ในเซิร์ฟอื่นจากที่บัญชีผูกไว้ หาแถวไม่เจอ
 *    แล้วเงียบๆ ตกไปใช้ห้องกลางของเซิร์ฟนั้น (bug-401)
 */
async function getNewsChannelId(guildId, groupName = null, userDiscordId = null) {
  if (groupName) {
    const { rows } = await pool.query(
      `SELECT news_channel_id, visibility FROM dc_social_accounts
        WHERE group_name = $2
          AND ( (visibility = 'public'  AND guild_id = $1)
             OR (visibility = 'private' AND $3::varchar IS NOT NULL AND user_discord_id = $3) )
        ORDER BY (news_channel_id IS NULL), id
        LIMIT 1`,
      [guildId, groupName, userDiscordId]
    );
    const row = rows[0];
    if (row) {
      const v = (row.news_channel_id || '').trim();
      if (v === NEWS_OFF) return null;
      if (v) return v;
      if (row.visibility === 'private') return null;
    }
  }
  const v = await getSetting(guildId, CONFIG_KEY);
  return (typeof v === 'string' && v.trim()) ? v.trim() : null;
}

/**
 * คืน channel ที่จะส่งข่าวลง — **หาด้วย channel id ตรงๆ ไม่ผ่าน guild**
 * (pattern เดียวกับ newsWatch.js) จึงส่งข้ามเซิร์ฟในองค์กรเดียวกันได้
 * เส้นแบ่ง org อยู่ที่ตอนตั้งค่า (web/app/api/social/groups/route.js) ไม่ใช่ที่นี่
 */
async function fetchNewsChannel(client, { guildId, group = null, userDiscordId = null } = {}) {
  const channelId = await getNewsChannelId(guildId, group, userDiscordId);
  if (!channelId) return null;
  return client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch(() => null);
}

function inQuietHours(d = new Date()) {
  const thaiHour = (d.getUTCHours() + 7) % 24;
  return thaiHour >= QUIET_START || thaiHour < QUIET_END;
}

// unix (วินาที) ของ 09:00 ไทยครั้งถัดไป
function nextReleaseUnix() {
  const now = Date.now();
  const thai = new Date(now + 7 * 3600 * 1000);
  const rel = Date.UTC(thai.getUTCFullYear(), thai.getUTCMonth(), thai.getUTCDate(), QUIET_END - 7, 0, 0);
  return Math.floor((rel > now ? rel : rel + 24 * 3600 * 1000) / 1000);
}

// โพสต์ข่าว (ไม่ ping) — คืน Message
// รับ channel มาตรงๆ เพราะผู้เรียก (publishPipeline) ต้องรู้ channel ก่อนเพื่อคิดเพดานอัปโหลดของเซิร์ฟนั้น
// → resolve ห้องครั้งเดียวด้วย fetchNewsChannel() แล้วส่งต่อ ไม่ต้อง resolve ซ้ำทุกข้อความ
async function postNews(channel, { content, files }) {
  if (!channel) throw new Error('ยังไม่ได้ตั้งค่าห้องข่าวสาร');
  return channel.send({ content: content || undefined, files, allowedMentions: { parse: [] } });
}

function buildEventAnnouncement({ name, startUnix, locationText, eventUrl }) {
  return [
    `📣 @everyone เชิญชวนร่วมกิจกรรม "${name}"`,
    `📅 <t:${startUnix}:F>`,
    locationText ? `📍 ${locationText}` : null,
    '',
    '🔔 กดกระดิ่ง "สนใจ" ที่การ์ดด้านล่าง เพื่อรับแจ้งเตือนก่อนเริ่มงาน',
    eventUrl,
  ].filter(line => line !== null).join('\n');
}

// ส่งประกาศทันที หรือเข้าคิวถ้าอยู่ใน quiet hours — คืน { skipped } | { queued, releaseUnix? }
async function sendOrQueueAnnouncement(guild, content) {
  // ประกาศ @everyone เป็นของ "เซิร์ฟ" ไม่ใช่ของกลุ่ม → ไม่ส่ง group เข้าไป (ใช้ค่าที่ตั้งที่ /bot)
  const channel = await fetchNewsChannel(guild.client, { guildId: guild.id });
  if (!channel) return { skipped: true };
  if (!inQuietHours()) {
    await channel.send({ content, allowedMentions: { parse: ['everyone'] } });
    return { queued: false };
  }
  const queue = (await getSetting(guild.id, QUEUE_KEY)) || [];
  const sendAt = nextReleaseUnix();
  queue.push({ channelId: channel.id, content, sendAt });
  await setSetting(guild.id, QUEUE_KEY, queue);
  return { queued: true, releaseUnix: sendAt };
}

// เช็คคิวทุกนาที — ส่งประกาศที่ถึงเวลาแล้วลบออกจากคิว (ส่ง fail = log แล้วทิ้ง ไม่ retry)
function startAnnounceWorker(client) {
  setInterval(async () => {
    try {
      const { rows } = await pool.query(
        'SELECT guild_id, value FROM dc_guild_config WHERE "key" = $1', [QUEUE_KEY]);
      const now = Math.floor(Date.now() / 1000);
      for (const row of rows) {
        const queue = Array.isArray(row.value) ? row.value : [];
        const due = queue.filter(q => q.sendAt <= now);
        if (!due.length) continue;
        const guild = client.guilds.cache.get(row.guild_id);
        for (const item of due) {
          try {
            const channel = guild?.channels.cache.get(item.channelId) || await guild?.channels.fetch(item.channelId);
            await channel.send({ content: item.content, allowedMentions: { parse: ['everyone'] } });
          } catch (err) {
            console.error('[newsShare worker] ส่งประกาศไม่สำเร็จ:', row.guild_id, err.message);
          }
        }
        const remain = queue.filter(q => q.sendAt > now);
        if (remain.length) await setSetting(row.guild_id, QUEUE_KEY, remain);
        else await deleteSetting(row.guild_id, QUEUE_KEY);
      }
    } catch (err) {
      console.error('[newsShare worker]', err.message);
    }
  }, 60 * 1000);
}

module.exports = { getNewsChannelId, fetchNewsChannel, postNews, buildEventAnnouncement, sendOrQueueAnnouncement, startAnnounceWorker, inQuietHours, nextReleaseUnix };
