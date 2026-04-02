// commands/server.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { getServerOverview, getTopChannels } = require('../db/stat');

const BACKUPS_DIR = path.join(__dirname, '../backups');

function formatVoice(seconds) {
  if (!seconds) return '—';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('ข้อมูลและจัดการ server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    // --- stat ---
    .addSubcommand(sub =>
      sub.setName('stat')
        .setDescription('สถิติรวมของ server')
        .addIntegerOption(opt =>
          opt.setName('top').setDescription('จำนวน top channels ที่แสดง (default 5)').setRequired(false).setMinValue(1).setMaxValue(25)
        )
        .addIntegerOption(opt =>
          opt.setName('days').setDescription('ย้อนหลังกี่วัน (default 60)').setRequired(false).setMinValue(1).setMaxValue(365)
        )
        .addBooleanOption(opt =>
          opt.setName('public').setDescription('แสดงให้ทุกคนเห็น (default: เฉพาะคุณ)').setRequired(false)
        )
    )

    // --- backup ---
    .addSubcommand(sub =>
      sub.setName('backup')
        .setDescription('backup ข้อมูล server ทั้งหมดลง JSON')
    )

    // --- guide ---
    .addSubcommand(sub =>
      sub.setName('guide')
        .setDescription('แสดงรายการห้องทั้งหมดบน server จาก backup ล่าสุด')
        .addBooleanOption(opt =>
          opt.setName('public').setDescription('แสดงให้ทุกคนเห็น (default: false)').setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub      = interaction.options.getSubcommand();
    const isPublic = interaction.options.getBoolean('public') ?? false;
    const { guildId, guild } = interaction;

    // ================================================================
    if (sub === 'stat') {
      const days = interaction.options.getInteger('days') ?? 60;
      const topN = interaction.options.getInteger('top')  ?? 5;

      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

      const overview    = await getServerOverview(guildId, days);
      const topChannels = await getTopChannels(guildId, days, topN);

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📊 ${guild.name} — Server Stats`)
        .setDescription(`ย้อนหลัง ${days} วัน`)
        .addFields(
          {
            name: '📈 Overview',
            value: [
              `👥 Active members: **${Number(overview.active_users).toLocaleString()}**`,
              `💬 Total messages: **${Number(overview.total_msgs).toLocaleString()}**`,
              `🔊 Total voice: **${formatVoice(Number(overview.total_voice))}**`,
            ].join('\n'),
          },
          {
            name: `🏆 Top ${topN} Channels`,
            value: topChannels.length
              ? topChannels.map((ch, i) =>
                  `**${i + 1}.** <#${ch.channel_id}>  💬 ${Number(ch.messages).toLocaleString()}  👥 ${ch.contributors}`
                ).join('\n')
              : '—',
          }
        )
        .setThumbnail(guild.iconURL({ extension: 'png' }))
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ================================================================
    if (sub === 'backup') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      await guild.channels.fetch();
      await guild.roles.fetch();
      const members = await guild.members.fetch();

      const roles = guild.roles.cache
        .sort((a, b) => b.position - a.position)
        .map(r => ({
          id: r.id, name: r.name, color: r.hexColor,
          hoist: r.hoist, mentionable: r.mentionable,
          position: r.position, permissions: r.permissions.toArray(),
          managed: r.managed,
        }));

      const channels = guild.channels.cache
        .sort((a, b) => a.position - b.position)
        .map(ch => ({
          id: ch.id, name: ch.name, type: ch.type,
          position: ch.position, parentId: ch.parentId ?? null,
          parentName: ch.parent?.name ?? null, topic: ch.topic ?? null,
          nsfw: ch.nsfw ?? false, rateLimitPerUser: ch.rateLimitPerUser ?? 0,
          permissionOverwrites: ch.permissionOverwrites?.cache.map(ow => ({
            id: ow.id, type: ow.type,
            allow: ow.allow.toArray(), deny: ow.deny.toArray(),
          })) ?? [],
        }));

      const memberRoles = [...members.values()].map(m => ({
        id: m.id, username: m.user.username, nickname: m.nickname ?? null,
        roles: m.roles.cache
          .filter(r => r.id !== guild.id)
          .map(r => ({ id: r.id, name: r.name })),
      }));

      const backup = {
        timestamp: new Date().toISOString(),
        guild: {
          id: guild.id, name: guild.name,
          memberCount: guild.memberCount,
          description: guild.description,
          preferredLocale: guild.preferredLocale,
        },
        roles,
        channels,
        memberRoles,
      };

      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      const filename = `backup_${guild.id}_${Date.now()}.json`;
      fs.writeFileSync(path.join(BACKUPS_DIR, filename), JSON.stringify(backup, null, 2), 'utf8');

      return interaction.editReply({
        content: [
          `✅ backup เสร็จแล้วครับ`,
          `📁 \`${filename}\``,
          `- Roles: ${roles.length}`,
          `- Channels: ${channels.length}`,
          `- Members: ${memberRoles.length}`,
        ].join('\n'),
      });
    }

    // ================================================================
    if (sub === 'guide') {
      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

      const files = fs.existsSync(BACKUPS_DIR)
        ? fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.startsWith(`backup_${guildId}_`) && f.endsWith('.json'))
            .sort()
            .reverse()
        : [];

      if (!files.length) {
        return interaction.editReply({ content: '❌ ไม่พบ backup ของ server นี้ครับ ลองรัน `/server backup` ก่อนนะครับ' });
      }

      const data = JSON.parse(fs.readFileSync(path.join(BACKUPS_DIR, files[0]), 'utf8'));

      const categories   = data.channels.filter(ch => ch.type === 4).sort((a, b) => a.position - b.position);
      const allChannels  = data.channels
        .filter(ch => ch.type === 0 || ch.type === 15)
        .sort((a, b) => a.position - b.position);

      const embeds = categories.map(cat => {
        const children = allChannels.filter(ch => ch.parentId === cat.id);
        return new EmbedBuilder()
          .setTitle(cat.name)
          .setDescription(
            children.length
              ? children.map(ch => `<#${ch.id}>${ch.topic ? ` — ${ch.topic}` : ''}`).join('\n')
              : 'ไม่มีห้องใน category นี้'
          )
          .setColor(0x5865f3);
      });

      const uncategorized = allChannels.filter(ch => !ch.parentId);
      if (uncategorized.length) {
        embeds.push(new EmbedBuilder()
          .setTitle('ไม่มี category')
          .setDescription(uncategorized.map(ch => `<#${ch.id}>${ch.topic ? ` — ${ch.topic}` : ''}`).join('\n'))
          .setColor(0x99aab5)
        );
      }

      if (!embeds.length) {
        return interaction.editReply({ content: '❌ ไม่พบข้อมูลห้องในไฟล์ backup' });
      }

      await interaction.channel.send({
        embeds: [new EmbedBuilder()
          .setTitle(`📖 คู่มือห้อง ${data.guild.name}`)
          .setDescription(`อัปเดตล่าสุด: ${new Date(data.timestamp).toLocaleString('th-TH')}`)
          .setColor(0x5865f3)],
      });

      for (let i = 0; i < embeds.length; i += 10) {
        await interaction.channel.send({ embeds: embeds.slice(i, i + 10) });
      }

      return interaction.editReply({ content: '✅ ส่ง channel guide เรียบร้อยแล้วครับ' });
    }
  },
};
