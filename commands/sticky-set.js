// commands/sticky-set.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { setSetting } = require('../db/settings'); 
const { refreshSticky } = require('../handlers/stickyHandler');  // ← เพิ่มบรรทัดนี้

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticky-set')
/*         .setDescription('ตั้งค่าข้อความค้าง (Sticky Message) สำหรับห้องนี้')
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(false))
        .addStringOption(opt => opt.setName('description').setDescription('รายละเอียดเนื้อหา').setRequired(false))
        .addStringOption(opt => opt.setName('button_label').setDescription('ชื่อบนปุ่ม').setRequired(false))
        .addStringOption(opt => opt.setName('button_id').setDescription('Custom ID ของปุ่ม (เช่น btn_open_register_modal)').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('รหัสสี Hex (เช่น #5865f2)').setRequired(false)) */
        .setDescription('ตั้งค่า Sticky Message โดยดูดข้อมูลจาก Message ID')
        .addStringOption(opt => 
            opt.setName('message_id')
               .setDescription('ID ของข้อความเป้าหมาย (ต้องอยู่ในห้องเดียวกัน)')
               .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const msgId = interaction.options.getString('message_id');

        /* const title = interaction.options.getString('title') || 'หัวข้อสำหรับข้อความปักหมุด';
        const description = interaction.options.getString('description') || 'รายละเอียดข้อความปักหมุด';
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
            log_channel_id: `${interaction.channelId}`, 
        };
        // console.log(`✅ โหลด command:`, config); */

        // 1. ดึงข้อความตาม ID ในห้องนี้
        const targetMsg = await interaction.channel.messages.fetch(msgId);
        // เช็คว่าว่างเปล่าไหม
        if (!targetMsg.content && !targetMsg.embeds.length && !targetMsg.components.length) {
            return interaction.editReply('❌ ข้อความเป้าหมายไม่มีข้อมูลอะไรเลย ดูดไม่ได้ครับ');
        }
        // 2. ดูดทุกอย่างแปลงเป็น JSON ดิบ (กวาดมาทั้งหมด)
        const config = {
            content: targetMsg.content || null,
            embeds: targetMsg.embeds.map(embed => embed.toJSON()), 
            components: targetMsg.components.map(row => row.toJSON())
        };

        try {
            // บันทึก config ลง DB
            await setSetting(interaction.guildId, `sticky_${interaction.channelId}`, config);
            await refreshSticky(interaction.channel);
            await interaction.editReply('✅ ตั้งค่าและอัปเดต Sticky Message เรียบร้อยแล้ว');
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        }
    },
};