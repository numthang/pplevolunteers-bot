// commands/message.js
const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('จัดการข้อความใน channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    // --- cleanup ---
    .addSubcommand(sub =>
      sub.setName('cleanup')
        .setDescription('กวาดล้างข้อความในช่องนี้')
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('จำนวนข้อความที่ต้องการลบ (1-100, default: 100)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
        )
    )

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
        .addBooleanOption(opt =>
          opt.setName('public')
            .setDescription('ให้ทุกคนเห็นผลลัพธ์ (default: false)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ================================================================
    if (sub === 'cleanup') {
      const amount = interaction.options.getInteger('amount') ?? 100;

      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);

        const embed = new EmbedBuilder()
          .setColor('#ff4444')
          .setTitle('🧹 Cleanup Success')
          .setDescription(`กวาดล้างไปทั้งหมด **${deleted.size}** ข้อความ`)
          .setFooter({ text: `โดย: ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch {
        return interaction.reply({
          content: 'ลบไม่ได้ครับ! อาจเพราะข้อความเก่าเกิน 14 วัน หรือบอทไม่มีสิทธิ์',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // ================================================================
    if (sub === 'fetch') {
      const isPublic      = interaction.options.getBoolean('public') ?? false;
      const format        = interaction.options.getString('format') ?? 'txt';
      const channelIdsRaw = interaction.options.getString('channel-ids');

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

      const { buffer, filename } = buildFile(allMessages, format);
      const attachment = new AttachmentBuilder(buffer, { name: filename });

      const summary = [
        `✅ ดึงข้อความสำเร็จ **${allMessages.length}** ข้อความ`,
        `📁 ไฟล์: \`${filename}\``,
        ...errors,
      ].join('\n');

      return interaction.editReply({ content: summary, files: [attachment] });
    }
  },
};

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

async function fetchAllMessages(channel) {
  const result = [];
  let lastId   = null;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    for (const msg of batch.values()) {
      result.push(serializeMessage(msg, channel));
    }

    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  return result;
}

function serializeMessage(msg, channel) {
  return {
    channel_id:   channel.id,
    channel_name: channel.name,
    message_id:   msg.id,
    timestamp:    msg.createdAt.toISOString(),
    author_id:    msg.author.id,
    author_tag:   msg.author.tag,
    content:      msg.content,
    attachments:  msg.attachments.map(a => ({ filename: a.name, url: a.url })),
    embeds:       msg.embeds.map(e => ({ title: e.title ?? null, description: e.description ?? null })),
    reactions:    msg.reactions.cache.map(r => ({ emoji: r.emoji.name, count: r.count })),
  };
}

function buildFile(messages, format) {
  const ts           = new Date().toISOString().slice(0, 10);
  const channelNames = [...new Set(messages.map(m => m.channel_name))]
    .map(name => name.replace(/\s+/g, '_'))
    .join('_');
  const baseName = `${channelNames}_${ts}`;

  if (format === 'json') {
    return {
      buffer:   Buffer.from(JSON.stringify(messages, null, 2), 'utf8'),
      filename: `${baseName}.json`,
    };
  }

  if (format === 'csv') {
    const headers = ['channel_id','channel_name','message_id','timestamp','author_id','author_tag','content','attachments','embeds','reactions'];
    const rows = messages.map(m => [
      m.channel_id, m.channel_name, m.message_id, m.timestamp,
      m.author_id, m.author_tag,
      csvEscape(m.content),
      csvEscape(JSON.stringify(m.attachments)),
      csvEscape(JSON.stringify(m.embeds)),
      csvEscape(JSON.stringify(m.reactions)),
    ].join(','));
    return {
      buffer:   Buffer.from('\uFEFF' + [headers.join(','), ...rows].join('\n'), 'utf8'),
      filename: `${baseName}.csv`,
    };
  }

  // TXT
  const lines = messages.map(m =>
    `[${m.timestamp}] ${m.author_tag} (${m.channel_name})\n${m.content || '(no text content)'}` +
    (m.attachments.length ? `\nAttachments: ${m.attachments.map(a => a.url).join(', ')}` : '') +
    '\n' + '─'.repeat(60)
  );
  return {
    buffer:   Buffer.from(lines.join('\n'), 'utf8'),
    filename: `${baseName}.txt`,
  };
}

function csvEscape(str) {
  if (!str) return '';
  return `"${String(str).replace(/"/g, '""')}"`;
}
