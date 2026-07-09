// Anti-spam: duplicate ข้ามห้อง + mass-mention + honeypot channel
// เรียกจาก index.js messageCreate — ก่อน forum/search/RAG (ต้อง return early ถ้ามี action)
// ดีไซน์: md/PENDING.md section "🛡️ Anti-Spam — Honeypot Channel" + "🚫 Quarantine Role"

const { PermissionFlagsBits } = require('discord.js');
const { getAntiSpamConfig } = require('../services/antiSpamCache');

const DUPLICATE_WINDOW_MS       = 30_000;
const DUPLICATE_CHANNEL_THRESHOLD = 3;
const MASS_MENTION_THRESHOLD   = 10;
const SWEEP_INTERVAL_MS        = 5 * 60_000;

const REASON_LABELS = {
  honeypot:    '📢 โพสต์ในห้อง honeypot',
  'mass-mention': `📢 mention เกิน ${MASS_MENTION_THRESHOLD} คน/role ในข้อความเดียว`,
  'duplicate-cross-channel': `📢 ส่งข้อความเดิมซ้ำ ≥${DUPLICATE_CHANNEL_THRESHOLD} ห้องใน ${DUPLICATE_WINDOW_MS / 1000} วิ`,
};

// userId → [{ channelId, messageId, content, timestamp }]
const messageHistory = new Map();

function pruneHistory(history, now) {
  return history.filter(e => now - e.timestamp < DUPLICATE_WINDOW_MS);
}

// sweep เป็นระยะกัน memory เพิ่มไม่รู้จบสำหรับ user ที่หายไปแล้ว
setInterval(() => {
  const now = Date.now();
  for (const [userId, history] of messageHistory) {
    const pruned = pruneHistory(history, now);
    if (pruned.length === 0) messageHistory.delete(userId);
    else messageHistory.set(userId, pruned);
  }
}, SWEEP_INTERVAL_MS).unref();

function recordAndCheckDuplicate(message) {
  const content = message.content?.trim();
  if (!content) return null; // ข้อความเปล่า (attachment/sticker ล้วน) ไม่เช็ค — กัน false-positive

  const now    = Date.now();
  const userId = message.author.id;
  const history = pruneHistory(messageHistory.get(userId) ?? [], now);

  history.push({ channelId: message.channelId, messageId: message.id, content, timestamp: now });
  messageHistory.set(userId, history);

  const matches = history.filter(e => e.content === content);
  const distinctChannels = new Set(matches.map(e => e.channelId));
  return distinctChannels.size >= DUPLICATE_CHANNEL_THRESHOLD ? matches : null;
}

function checkMassMention(message) {
  const count = message.mentions.users.size + message.mentions.roles.size;
  return count >= MASS_MENTION_THRESHOLD;
}

function checkHoneypot(message, config) {
  return Boolean(config.honeypotChannelId) && message.channelId === config.honeypotChannelId;
}

function isStaffExempt(message) {
  return message.member?.permissions.has(PermissionFlagsBits.ManageMessages) ?? false;
}

async function deleteMatchedMessages(guild, entries) {
  for (const entry of entries) {
    try {
      const channel = await guild.channels.fetch(entry.channelId);
      const msg     = await channel.messages.fetch(entry.messageId);
      await msg.delete();
    } catch {
      // ข้อความอาจถูกลบไปแล้ว หรือ fetch channel ไม่ได้ — ข้ามได้ ไม่ critical
    }
  }
}

async function notifyMod(message, config, reasons, status) {
  if (!config.modChannelId) return;
  try {
    const channel = await message.guild.channels.fetch(config.modChannelId);
    const reasonText = reasons.map(r => REASON_LABELS[r] ?? r).join('\n');
    const statusText = {
      quarantined: '✅ ติด Quarantine role แล้ว',
      failed:      '⚠️ ติด Quarantine role ไม่สำเร็จ — เช็ค role hierarchy (bot role ต้องอยู่เหนือ Quarantine)',
      exempt:      '👀 ผู้ใช้มีสิทธิ์ staff — ไม่ auto-quarantine (ตรวจสอบเอง)',
    }[status];

    await channel.send({
      content: `🛡️ **ตรวจพบพฤติกรรมต้องสงสัย**\n`
        + `ผู้ใช้: <@${message.author.id}> (${message.author.tag})\n`
        + `ห้อง: <#${message.channelId}>\n`
        + `สาเหตุ:\n${reasonText}\n`
        + statusText,
    });
  } catch (err) {
    console.error('[antiSpam] notifyMod failed:', err.message);
  }
}

/**
 * @returns {Promise<boolean>} true = มี action เกิดขึ้น (ลบข้อความ) — caller ควร return early
 */
async function handleAntiSpam(message) {
  if (message.author.bot || message.webhookId || !message.guild) return false;

  const config = getAntiSpamConfig(message.guildId);
  if (!config.quarantineRoleId) return false; // guild นี้ยังไม่ได้ setup

  const reasons = [];
  if (checkHoneypot(message, config)) reasons.push('honeypot');
  if (checkMassMention(message)) reasons.push('mass-mention');

  const duplicateMatches = recordAndCheckDuplicate(message);
  if (duplicateMatches) reasons.push('duplicate-cross-channel');

  if (reasons.length === 0) return false;

  // honeypot ไม่มี staff-exempt — ไม่มีเหตุผลที่ staff จริงจะโพสต์ในนั้น และเป็นเคสที่ตั้งใจจับ
  // Administrator ที่โดนแฮคโดยเฉพาะ (Administrator bypass ViewChannel deny + SendMessages deny ทุกที่อยู่แล้ว)
  if (!reasons.includes('honeypot') && isStaffExempt(message)) {
    await notifyMod(message, config, reasons, 'exempt');
    return false; // ไม่ลบ ไม่ quarantine staff — ให้ mod ตัดสินเอง
  }

  const messagesToDelete = duplicateMatches ?? [{ channelId: message.channelId, messageId: message.id }];
  await deleteMatchedMessages(message.guild, messagesToDelete);

  let status = 'quarantined';
  try {
    const member = message.member ?? await message.guild.members.fetch(message.author.id);
    await member.roles.add(config.quarantineRoleId);
  } catch (err) {
    status = 'failed';
    console.error('[antiSpam] quarantine role assign failed:', err.message);
  }

  await notifyMod(message, config, reasons, status);
  return true;
}

module.exports = { handleAntiSpam };
