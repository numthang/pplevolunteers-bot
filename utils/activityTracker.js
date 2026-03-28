// utils/activityTracker.js
// ติดตาม message, voice, mention แล้ว upsert ลง DB รายวัน

const { upsertDailyActivity, addMention, markReplied } = require('../db/activity');

// เก็บ voice session ที่กำลัง active อยู่ใน memory
// key: `${guildId}:${userId}:${channelId}` → joinedAt (timestamp)
const voiceSessions = new Map();

function _today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * เรียกเมื่อมี messageCreate
 * - track message count
 * - track mention + markReplied
 */
async function onMessage(message) {
  if (!message.guild || message.author.bot) return;

  const { guildId } = message;
  const userId = message.author.id;
  // ถ้าเป็น thread ให้ใช้ parent channel id แทน เพราะ config เก็บแค่ parent
  const channelId = message.channel.isThread()
    ? (message.channel.parentId ?? message.channelId)
    : message.channelId;

  // 1. นับ message
  await upsertDailyActivity({
    guildId,
    userId,
    channelId,
    date: _today(),
    messageDelta: 1,
  }).catch(err => console.error('[ActivityTracker] upsertDailyActivity error:', err));

  // 2. ถ้า message นี้ reply ต่อ mention → mark replied
  if (message.reference?.messageId) {
    await markReplied({
      guildId,
      userId,
      channelId,
      repliedAt: message.createdAt,
    }).catch(err => console.error('[ActivityTracker] markReplied error:', err));
  }

  // 3. บันทึก mention ของ user ที่ถูก @
  if (message.mentions.users.size > 0) {
    const mentionedAt = message.createdAt;
    for (const [mentionedId, mentionedUser] of message.mentions.users) {
      if (mentionedUser.bot) continue;
      await addMention({
        guildId,
        userId: mentionedId,
        mentionedBy: userId,
        channelId,
        timestamp: mentionedAt,
      }).catch(err => console.error('[ActivityTracker] addMention error:', err));
    }
  }
}

/**
 * เรียกเมื่อมี voiceStateUpdate
 */
async function onVoiceStateUpdate(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const guildId = member.guild.id;
  const userId = member.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  const joined   = !oldChannelId && newChannelId;
  const left     = oldChannelId && !newChannelId;
  const switched = oldChannelId && newChannelId && oldChannelId !== newChannelId;

  if (joined) {
    _startVoice(guildId, userId, newChannelId);
  } else if (left) {
    await _endVoice(guildId, userId, oldChannelId);
  } else if (switched) {
    await _endVoice(guildId, userId, oldChannelId);
    _startVoice(guildId, userId, newChannelId);
  }
}

function _startVoice(guildId, userId, channelId) {
  const key = `${guildId}:${userId}:${channelId}`;
  voiceSessions.set(key, Date.now());
}

async function _endVoice(guildId, userId, channelId) {
  const key = `${guildId}:${userId}:${channelId}`;
  const joinedAt = voiceSessions.get(key);
  if (!joinedAt) return;

  voiceSessions.delete(key);

  const seconds = Math.floor((Date.now() - joinedAt) / 1000);
  if (seconds < 5) return; // ไม่นับถ้าอยู่แค่แวบเดียว

  await upsertDailyActivity({
    guildId,
    userId,
    channelId,
    date: _today(),
    voiceDelta: seconds,
  }).catch(err => console.error('[ActivityTracker] voice upsert error:', err));
}

module.exports = { onMessage, onVoiceStateUpdate };
