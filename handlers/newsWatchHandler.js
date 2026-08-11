// handlers/newsWatchHandler.js — ปุ่ม "ดึงเดี๋ยวนี้" บน panel ข่าวท้องถิ่น
//
// ทำไมต้องมีปุ่มนี้: ถ้ารอรอบ 8:00/17:00 อย่างเดียว กว่าจะรู้ว่าข่าวที่ได้มีประโยชน์พอทำคอนเทนต์ไหม
// ต้องรอครึ่งวัน — ปุ่มนี้ทำให้ลองแล้วเห็นผลทันที ซึ่งเป็นเหตุผลทั้งหมดของรอบนี้ (spike วัดของจริง)
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getSetting } = require('../db/settings');
const { runForGuild } = require('../services/newsWatch');
const { getT } = require('../services/i18n');

const COOLDOWN_MS = 60 * 1000;
const lastRun = new Map();   // guildId → timestamp

async function handleNewsWatchRun(interaction) {
    const t = await getT(interaction.guildId);

    // ⚠️ /panel ทั้งคำสั่งไม่มี setDefaultMemberPermissions (ต่างจาก sticky/role/channel ที่มี)
    //    ปุ่มนี้อยู่ในห้องสาธารณะ ใครก็กดได้ → ต้องเช็คสิทธิ์ตรงนี้เอง
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: t('newsWatch.noPermission'), flags: MessageFlags.Ephemeral });
    }

    const since = Date.now() - (lastRun.get(interaction.guildId) ?? 0);
    if (since < COOLDOWN_MS) {
        return interaction.reply({
            content: t('newsWatch.cooldown', { seconds: Math.ceil((COOLDOWN_MS - since) / 1000) }),
            flags: MessageFlags.Ephemeral,
        });
    }

    if (!await getSetting(interaction.guildId, 'news_watch_channel_id')) {
        return interaction.reply({ content: t('newsWatch.notConfigured'), flags: MessageFlags.Ephemeral });
    }

    // ยิง RSS หลายคำค้นเรียงกัน ~6 วิ — เกินเพดาน 3 วิของ Discord ต้อง defer ก่อนเสมอ
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    lastRun.set(interaction.guildId, Date.now());

    try {
        const { sent, scanned } = await runForGuild(interaction.client, interaction.guildId);
        return interaction.editReply(sent
            ? t('newsWatch.runDone', { sent, scanned })
            : t('newsWatch.runEmpty', { scanned }));
    } catch (err) {
        console.error('[newsWatch] ปุ่มดึงเดี๋ยวนี้:', err);
        lastRun.delete(interaction.guildId);   // ล้มแล้วให้ลองใหม่ได้เลย ไม่ต้องรอ cooldown
        return interaction.editReply(t('newsWatch.runFailed', { error: err.message }));
    }
}

module.exports = { handleNewsWatchRun };
