// command/sticky-stop.js

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getSetting, deleteSetting } = require('../db/settings'); // สมมติว่าคุณมีฟังก์ชัน delete

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticky-stop')
        .setDescription('หยุดการทำงานของ Sticky Message ในห้องนี้และลบข้อความทิ้ง')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // commands/sticky-stop.js (เฉพาะส่วน execute)

    async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const key = `sticky_${interaction.channelId}`;
    let config = await getSetting(interaction.guildId, key);

    if (!config) {
        return interaction.editReply('❌ ไม่พบ Sticky Message ที่รันอยู่ในห้องนี้ครับ');
    }

    // แก้ตรงนี้: ถ้าเป็น string ค่อย parse ถ้าเป็น object ใช้เลย
    if (typeof config === 'string') {
        try {
        config = JSON.parse(config);
        } catch (err) {
        console.error('Invalid sticky config JSON:', err);
        // ถ้า parse ไม่ได้ ลบ config ทิ้งเลยดีกว่า
        await deleteSetting(interaction.guildId, key);
        return interaction.editReply('⚠️ พบ config เสีย ลบการตั้งค่าแล้วครับ');
        }
    }

    // ตอนนี้ config เป็น object แน่นอน
    try {
        if (config.message_id) {
        const oldMessage = await interaction.channel.messages.fetch(config.message_id).catch(() => null);
        if (oldMessage) {
            await oldMessage.delete().catch(() => null);
        }
        }

        await deleteSetting(interaction.guildId, key);

        await interaction.editReply('✅ หยุดการทำงานและลบ Sticky Message เรียบร้อยแล้วครับ');
    } catch (error) {
        console.error('Error stopping sticky:', error);
        await interaction.editReply('❌ เกิดข้อผิดพลาดในการหยุดการทำงาน');
    }
    },   
};