// commands/message.js
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const { fetchAllMessages, buildFile } = require('../services/fetchMessages');
const { processMessages } = require('../services/aiSummarize');
const { AI_MODES } = require('../config/aiModes');

const REPLY_LIMIT = 1800; // กัน Discord 2000-char limit

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('จัดการข้อความ')

    // --- fetch ---
    .addSubcommand(sub =>
      sub.setName('fetch')
        .setDescription('ดึงข้อความจาก channel แล้วบันทึกลงไฟล์')
        .addStringOption(opt =>
          opt.setName('channel-ids')
            .setDescription('Channel ID คั่นด้วยคอมม่า (ถ้าไม่ใส่ = channel ปัจจุบัน)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('format')
            .setDescription('รูปแบบไฟล์ (default: txt)')
            .setRequired(false)
            .addChoices(
              { name: 'JSON', value: 'json' },
              { name: 'CSV',  value: 'csv'  },
              { name: 'TXT',  value: 'txt'  },
            )
        )
        .addStringOption(opt =>
          opt.setName('ai')
            .setDescription('ให้ AI ประมวลผลข้อความ (ถ้าไม่ใส่ = แค่ดึง raw)')
            .setRequired(false)
            .addChoices(...AI_MODES.map(m => ({ name: m.label, value: m.value })))
        )
        .addBooleanOption(opt =>
          opt.setName('public')
            .setDescription('ให้ทุกคนเห็นผลลัพธ์ (default: false)')
            .setRequired(false)
        )
    )

    // --- anon ---
    .addSubcommand(sub =>
      sub.setName('anon')
        .setDescription('ส่งข้อความโดยไม่ระบุตัวตน')
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('ข้อความสั้น (ถ้าไม่ใส่จะเปิด popup)')
            .setRequired(false)
            .setMaxLength(2000)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ================================================================
    if (sub === 'fetch') {
      const isPublic      = interaction.options.getBoolean('public') ?? false;
      const format        = interaction.options.getString('format') ?? 'txt';
      const channelIdsRaw = interaction.options.getString('channel-ids');
      const aiMode        = interaction.options.getString('ai'); // null = ไม่ใช้ AI

      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

      const channelIds = channelIdsRaw
        ? channelIdsRaw.split(',').map(id => id.trim()).filter(Boolean)
        : [interaction.channelId];

      const allMessages = [];
      const errors      = [];

      for (const channelId of channelIds) {
        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

        if (!channel || !channel.isTextBased()) {
          errors.push(`❌ Channel \`${channelId}\` ไม่พบหรือไม่ใช่ text channel`);
          continue;
        }

        try {
          const messages = await fetchAllMessages(channel);
          allMessages.push(...messages);
        } catch (err) {
          errors.push(`❌ ดึงข้อความจาก <#${channelId}> ไม่ได้: ${err.message}`);
        }
      }

      if (allMessages.length === 0) {
        return interaction.editReply({ content: errors.length ? errors.join('\n') : 'ไม่พบข้อความ' });
      }

      allMessages.sort((a, b) => a.timestamp - b.timestamp);

      const lines = [`✅ ดึงข้อความสำเร็จ **${allMessages.length}** ข้อความ`];
      let attachment;

      if (aiMode) {
        // เลือก AI mode → ไฟล์เป็นผลสรุป (.txt) แทน raw
        try {
          const { mode, output, truncated } = await processMessages(allMessages, aiMode);
          const date = new Date().toISOString().slice(0, 10);
          attachment = new AttachmentBuilder(Buffer.from(output, 'utf8'), { name: `${aiMode}_${date}.txt` });
          const body = output.length > REPLY_LIMIT ? output.slice(0, REPLY_LIMIT) + '\n…(ตัด — ดูไฟล์)' : output;
          lines.push(`${mode.label}${truncated ? ' (บางส่วน)' : ''}`, '─'.repeat(20), body);
        } catch (err) {
          // AI พัง → fallback เป็น raw file
          const { buffer, filename } = buildFile(allMessages, format);
          attachment = new AttachmentBuilder(buffer, { name: filename });
          lines.push(`⚠️ AI ประมวลผลไม่สำเร็จ: ${err.message}`, `📁 ส่ง raw file แทน: \`${filename}\``);
        }
      } else {
        // ไม่เลือก AI → raw file ตาม format
        const { buffer, filename } = buildFile(allMessages, format);
        attachment = new AttachmentBuilder(buffer, { name: filename });
        lines.push(`📁 ไฟล์: \`${filename}\``);
      }

      lines.push(...errors);
      return interaction.editReply({ content: lines.join('\n'), files: [attachment] });
    }

    // ================================================================
    if (sub === 'anon') {
      const quick = interaction.options.getString('message');

      if (quick) {
        await interaction.channel.send(quick);
        return interaction.deferReply({ flags: MessageFlags.Ephemeral }).then(() => interaction.deleteReply());
      }

      const modal = new ModalBuilder()
        .setCustomId(`anon_submit:${interaction.channelId}`)
        .setTitle('ส่งข้อความแบบไม่ระบุตัวตน');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('anon_text')
            .setLabel('ข้อความ')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('พิมพ์หรือ copy แปะข้อความที่นี่...')
            .setRequired(true)
            .setMaxLength(2000)
        )
      );

      await interaction.showModal(modal);
    }
  },
};
