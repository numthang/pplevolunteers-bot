// commands/sticky-set.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
// ดึงฟังก์ชันจัดการ Database ที่คุณมีอยู่ (สมมติชื่อตามที่คุณเคยใช้)
const { setSetting } = require('../db/settings'); 
const { refreshSticky } = require('../handlers/stickyHandler');  // ← เพิ่มบรรทัดนี้

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticky-set')
        .setDescription('ตั้งค่าข้อความค้าง (Sticky Message) สำหรับห้องนี้')
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('รายละเอียดเนื้อหา').setRequired(true))
        .addStringOption(opt => opt.setName('button_label').setDescription('ชื่อบนปุ่ม').setRequired(false))
        .addStringOption(opt => opt.setName('button_id').setDescription('Custom ID ของปุ่ม (เช่น btn_open_register_modal)').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('รหัสสี Hex (เช่น #5865f2)').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const btnLabel = interaction.options.getString('button_label');
        const btnId = interaction.options.getString('button_id');
        const colorHex = interaction.options.getString('color') || '#5865f2';
        const color = parseInt(colorHex.replace('#', ''), 16);  // แปลงเป็น number

        // สร้าง config ก่อน
        const config = {
            title,
            description: description.replace(/\\n/g, '\n'),
            color,   // เก็บเป็น number
            button_label: btnLabel,
            button_custom_id: btnId,
            // ถ้าต้องการเก็บ log_channel_id ด้วยก็ใส่ได้ที่นี่
        };

        try {
            // ลบและส่งใหม่ให้เป็น sticky เดียว (สำคัญ!)
            await refreshSticky(interaction.channel, config);   // ← ใช้ฟังก์ชันกลาง
            // บันทึก config ลง DB
            await setSetting(interaction.guildId, `sticky_${interaction.channelId}`, config);
            await interaction.editReply('✅ ตั้งค่าและอัปเดต Sticky Message เรียบร้อยแล้ว');
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        }
    },
};