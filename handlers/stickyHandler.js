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

    // Fallback ค่าทั้งหมดเพื่อป้องกัน undefined ทำให้ EmbedBuilder error
    const title       = config.title       ?? '📋 แนะนำตัวสมาชิก อาสาประชาชน';
    const description = config.description ?? 'กดปุ่มด้านล่างเพื่อแนะนำตัวหรืออัปเดตข้อมูลของคุณได้เลย';
    const color       = Number(config.color) || 0x5865f2; // แปลงเป็น number เผื่อเก็บเป็น string
    const buttonLabel = config.button_label ?? '📋 แนะนำตัว/แก้ไขข้อมูล';
    const buttonId    = config.button_custom_id ?? 'btn_open_register_modal';

    // ลบข้อความเก่า (ถ้ามี) + เช็คก่อนว่ายังเป็น sticky ของเราจริงไหม
    let deleted = false;
    if (config.message_id) {
      try {
        const oldMsg = await channel.messages.fetch(config.message_id);
        // ตรวจสอบคร่าว ๆ ว่าเป็น sticky ของเราจริง (ป้องกันลบผิด)
        if (oldMsg.embeds?.[0]?.title?.includes('แนะนำตัวสมาชิก')) {
          await oldMsg.delete();
          deleted = true;
          console.log(`[Sticky] Deleted old message ${config.message_id} in ${channelId}`);
        } else {
          console.log(`[Sticky] Skipped delete - message ${config.message_id} does not match title`);
        }
      } catch (fetchErr) {
        console.log(`[Sticky] Could not delete old message ${config.message_id}: ${fetchErr.message}`);
        // ถ้า fetch ไม่ได้ (หายไปแล้ว) ถือว่า deleted แล้ว
        deleted = true;
      }
    }

    // สร้าง embed ใหม่
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buttonId)
        .setLabel(buttonLabel)
        .setStyle(ButtonStyle.Primary)
    );

    // ส่งใหม่
    const sent = await channel.send({
      embeds: [embed],
      components: [row],
    });

    // อัปเดต config ใน DB (เก็บเป็น object ธรรมดา)
    const updatedConfig = {
      ...config,
      message_id: sent.id,
      title,
      description,
      color,
      button_label: buttonLabel,
      button_custom_id: buttonId,
    };

    await setSetting(channel.guildId, key, updatedConfig);

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