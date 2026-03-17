// commands/channel-guide.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channel-guide')
    .setDescription('แสดงรายการห้องทั้งหมดบน server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const backupsDir = path.join(__dirname, '../backups');
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (!files.length) {
      return interaction.editReply({ content: '❌ ไม่พบไฟล์ backup กรุณารัน /backup ก่อนครับ' });
    }

    const latest = path.join(backupsDir, files[0]);
    const data = JSON.parse(fs.readFileSync(latest, 'utf8'));

    const categories = data.channels
      .filter(ch => ch.type === 4)
      .sort((a, b) => a.position - b.position);

    const textChannels = data.channels
      .filter(ch => ch.type === 0)
      .sort((a, b) => a.position - b.position);

    // เพิ่ม forum channels
    const forumChannels = data.channels
      .filter(ch => ch.type === 15)
      .sort((a, b) => a.position - b.position);

    // รวมเข้าไปใน textChannels เพื่อให้แสดงใน category เดียวกัน
    const allChannels = [...textChannels, ...forumChannels]
      .sort((a, b) => a.position - b.position);
      
    const embeds = categories.map(cat => {
      const children = allChannels.filter(ch => ch.parentId === cat.id);
      const description = children.map(ch => {
        const topic = ch.topic ? ` — ${ch.topic}` : '';
        return `<#${ch.id}>${topic}`;
      }).join('\n');

      return new EmbedBuilder()
        .setTitle(cat.name)
        .setDescription(description || 'ไม่มีห้องใน category นี้')
        .setColor(0x5865f3);
    });

    const uncategorized = allChannels.filter(ch => !ch.parentId);
    if (uncategorized.length) {
      embeds.push(new EmbedBuilder()
        .setTitle('ไม่มี category')
        .setDescription(uncategorized.map(ch => {
          const topic = ch.topic ? ` — ${ch.topic}` : '';
          return `<#${ch.id}>${topic}`;
        }).join('\n'))
        .setColor(0x99aab5)
      );
    }

    if (!embeds.length) {
      return interaction.editReply({ content: '❌ ไม่พบข้อมูลห้องในไฟล์ backup' });
    }

    // ส่ง header แยกก่อน 1 message
    await interaction.channel.send({
      embeds: [new EmbedBuilder()
        .setTitle('📖 แนะนำห้องบน Discord อาสาประชาชน')
        .setDescription(`อัปเดตล่าสุด: ${new Date(data.timestamp).toLocaleString('th-TH')}`)
        .setColor(0x5865f3)],
    });

    // ส่ง category embeds ทีละ 10
    for (let i = 0; i < embeds.length; i += 10) {
      await interaction.channel.send({ embeds: embeds.slice(i, i + 10) });
    }

    await interaction.editReply({ content: '✅ ส่ง channel guide เรียบร้อยแล้วครับ' });
  },
};