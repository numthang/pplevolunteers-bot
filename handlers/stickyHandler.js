// handlers/stickyHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getSetting, setSetting, deleteSetting } = require('../db/settings');

const KEY_PREFIX = 'sticky_';
const refreshing = new Map(); // channelId → boolean (lock ป้องกัน double call)

async function refreshSticky(channel) {
  if (!channel?.guild || !channel.isTextBased()) return;

  const channelId = channel.id;
  const key = `${KEY_PREFIX}${channelId}`;

  // ป้องกัน double call พร้อมกัน (สำคัญมากสำหรับกรณีเรียกตรง + event ชนกัน)
  if (refreshing.get(channelId)) {
    console.log(`[Sticky] Skipped refresh for ${channelId} - already in progress`);
    return;
  }
  refreshing.set(channelId, true);

  try {
    let config = await getSetting(channel.guildId, key);
    if (!config) {
      console.log(`[Sticky] No config found for ${key}`);
      return;
    }

    // Parse ถ้าเป็น string (รองรับข้อมูลเก่าจาก DB)
    if (typeof config === 'string') {
      try {
        config = JSON.parse(config);
      } catch (parseErr) {
        console.error(`[Sticky] Invalid JSON in DB for ${key}:`, parseErr);
        return;
      }
    }

    // ถ้า sticky message อยู่ล่างสุดอยู่แล้ว ไม่ต้องทำอะไร
    if (config.message_id) {
      try {
        const latest = await channel.messages.fetch({ limit: 1 });
        if (latest.first()?.id === config.message_id) {
          console.log(`[Sticky] Already at bottom in #${channel.name}, skipping`);
          return;
        }
      } catch {}
    }

    // ลบข้อความเก่า (ถ้ามี) + เช็คก่อนว่ายังเป็น sticky ของเราจริงไหม
    if (config.message_id) {
      try {
        const oldMsg = await channel.messages.fetch(config.message_id);
        await oldMsg.delete();
        // 🔥 เพิ่มหน่วงเวลาเล็กน้อยหลังลบ เพื่อให้ Discord อัปเดตสถานะห้องทัน
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (fetchErr) {
        console.log(`[Sticky] Could not delete old message ${config.message_id}: ${fetchErr.message}`);
      }
    }

    // ประกอบร่างส่งข้อมูลดิบ
    const sendOptions = {};
    if (config.content) sendOptions.content = config.content;
    if (config.embeds && config.embeds.length > 0) sendOptions.embeds = config.embeds;
    if (config.components && config.components.length > 0) sendOptions.components = config.components;

    // ดักไว้เผื่อ Data ว่างเปล่าจะได้ไม่ error
    if (!sendOptions.content && !sendOptions.embeds && !sendOptions.components) {
       console.log(`[Sticky] Empty payload for ${channelId}, skipping.`);
       return;
    }
    // โยนตู้มเดียวจบ
    const sent = await channel.send(sendOptions);

    /* // ส่งใหม่
    const sent = await channel.send({
      embeds: [embed],
      components: components,
    }); */

    // 4. อัปเดตเฉพาะ message_id แล้วเซฟ config ก้อนเดิมกลับไป
    config.message_id = sent.id;
    await setSetting(channel.guildId, key, config);

    console.log(`[Sticky] Refreshed successfully in #${channel.name} (${channelId}) → new msg ${sent.id}`);
  } catch (err) {
    console.error(`[Sticky Error] ${channelId}:`, err);
  } finally {
    refreshing.delete(channelId); // ปลด lock เสมอ
  }
}

async function stopSticky(channel) {
  const key = `${KEY_PREFIX}${channel.id}`;
  let config = await getSetting(channel.guildId, key);
  if (!config) return false;

  if (typeof config === 'string') {
    try {
      config = JSON.parse(config);
    } catch {
      await deleteSetting(channel.guildId, key);
      return false;
    }
  }

  if (config.message_id) {
    try {
      const msg = await channel.messages.fetch(config.message_id);
      await msg.delete();
    } catch (err) {
      console.log(`[Sticky Stop] Could not delete ${config.message_id}: ${err.message}`);
    }
  }

  await deleteSetting(channel.guildId, key);
  console.log(`[Sticky] Stopped and removed config for ${channel.id}`);
  return true;
}

module.exports = { refreshSticky, stopSticky };