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
 *   มีค่า                                      → ห้องนั้น
 *   ว่าง + กลุ่ม public                        → fallback dc_guild_config (ของเดิมก่อนมีคอลัมน์นี้)
 *   ว่าง + กลุ่ม private                       → null — กลุ่มส่วนตัวยิงเข้าห้องข่าวขององค์กรได้
 *                                               เฉพาะเมื่อทีมสื่อตั้งห้องให้ (ด่านอยู่ที่หน้าตั้งค่า)
 * ไม่ส่ง groupName = ของเดิมทั้งหมด (ประกาศกิจกรรม / เส้นที่ไม่รู้จักกลุ่ม) → ใช้ค่าราย guild
 */
async function getNewsChannelId(guildId, groupName = null) {
  if (groupName) {
    const { rows } = await pool.query(
      `SELECT news_channel_id, visibility FROM dc_social_accounts
        WHERE guild_id = $1 AND group_name = $2
        ORDER BY (news_channel_id IS NULL), id
        LIMIT 1`,
      [guildId, groupName]
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

async function fetchNewsChannel(guild, groupName = null) {
  const channelId = await getNewsChannelId(guild.id, groupName);
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || guild.channels.fetch(channelId);
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

// โพสต์ข่าว (ไม่ ping) — คืน Message · group = กลุ่ม social ที่โพสต์ในนาม (ตัวเลือกห้อง)
async function postNews(guild, { content, files, group = null }) {
  const channel = await fetchNewsChannel(guild, group);
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
  const channel = await fetchNewsChannel(guild);
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

module.exports = { getNewsChannelId, postNews, buildEventAnnouncement, sendOrQueueAnnouncement, startAnnounceWorker, inQuietHours, nextReleaseUnix };
