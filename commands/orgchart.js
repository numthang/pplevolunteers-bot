// commands/orgchart.js
const {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const {
  upsertChannel, roleExists,
  getRolesByGroup, getConfigByRoleIds,
  deleteChannel, deleteRole, excludeChannel, unexcludeChannel,
  setRoleGroup, saveSnapshot, getSnapshotByGroup,
} = require('../db/orgchartConfig');
const { getRoleStats, buildOrgChartEmbed } = require('../utils/orgchartEmbed');

const DEFAULT_DAYS = 180;

const GROUP_CHOICES = [
  { name: '🌟 ทีมหลัก',       value: 'main'     },
  { name: '🛠️ ทีม Skill',     value: 'skill'    },
  { name: '🗺️ ทีมภาค',       value: 'region'   },
  { name: '📍 ทีมจังหวัด',    value: 'province' },
  { name: '🏘️ ทีมอำเภอ',     value: 'district' },
  { name: '⬜ ยังไม่จัดกลุ่ม', value: 'other'    },
];

const ALL_GROUPS = ['main', 'skill', 'region', 'province', 'district', 'other'];

function resolveChannelType(channel) {
  if (channel.type === ChannelType.GuildForum) return 'forum';
  if (channel.isVoiceBased())                  return 'voice';
  return 'text';
}

function formatComputedAt(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1)   return 'เมื่อกี้';
  if (diff < 60)  return `${diff} นาทีที่แล้ว`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

let cmd = new SlashCommandBuilder()
  .setName('orgchart')
  .setDescription('จัดการ orgchart config และดูรายงาน (Admin)')
  .setDefaultMemberPermissions(0x10) // ManageChannels

  // --- view ---
  .addSubcommand(sub =>
    sub.setName('view')
      .setDescription('ดูรายงาน orgchart จาก snapshot')
      .addStringOption(opt =>
        opt.setName('group').setDescription('กลุ่มที่ต้องการดู').setRequired(true)
          .addChoices(...GROUP_CHOICES)
      )
      .addBooleanOption(opt =>
        opt.setName('refresh').setDescription('คำนวณใหม่แทนที่จะอ่าน snapshot (default: false)').setRequired(false)
      )
      .addIntegerOption(opt =>
        opt.setName('days').setDescription(`ย้อนหลังกี่วัน ใช้เมื่อ refresh=true (default ${DEFAULT_DAYS})`).setRequired(false).setMinValue(1).setMaxValue(365)
      )
  )

  // --- snapshot ---
  .addSubcommand(sub =>
    sub.setName('snapshot')
      .setDescription('คำนวณและบันทึก stats ทุก role ลง DB')
      .addStringOption(opt =>
        opt.setName('group').setDescription('กลุ่มที่ต้องการ snapshot').setRequired(true)
          .addChoices(...GROUP_CHOICES, { name: '🔄 ทุกกลุ่ม', value: 'all' })
      )
      .addIntegerOption(opt =>
        opt.setName('days').setDescription(`ย้อนหลังกี่วัน (default ${DEFAULT_DAYS})`).setRequired(false).setMinValue(1).setMaxValue(365)
      )
  )

  // --- scan ---
  .addSubcommand(sub =>
    sub.setName('scan')
      .setDescription('สแกน role + channel แล้วบันทึก config')
  )

  // --- add ---
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('เพิ่ม channel เข้า role ใน config')
      .addRoleOption(opt =>
        opt.setName('role').setDescription('Role ที่ต้องการเพิ่ม channel ให้').setRequired(true)
      )
      .addChannelOption(opt => opt.setName('channel1').setDescription('Channel ที่ 1').setRequired(true))
      .addChannelOption(opt => opt.setName('channel2').setDescription('Channel ที่ 2').setRequired(false))
      .addChannelOption(opt => opt.setName('channel3').setDescription('Channel ที่ 3').setRequired(false))
      .addChannelOption(opt => opt.setName('channel4').setDescription('Channel ที่ 4').setRequired(false))
      .addChannelOption(opt => opt.setName('channel5').setDescription('Channel ที่ 5').setRequired(false))
      .addStringOption(opt =>
        opt.setName('group').setDescription('กลุ่มของ role นี้ (ถ้าไม่ระบุ จะไม่เปลี่ยนค่าเดิม)').setRequired(false)
          .addChoices(...GROUP_CHOICES)
      )
  )

  // --- remove ---
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('ลบหรือ exclude channel/role ออกจาก config')
      .addRoleOption(opt =>
        opt.setName('role').setDescription('Role ที่ต้องการแก้ไข').setRequired(true)
      )
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('Channel ที่ต้องการแก้ไข (ไม่ระบุ = ทั้ง role)').setRequired(false)
      )
      .addStringOption(opt =>
        opt.setName('action').setDescription('การกระทำ (default: ลบถาวร)').setRequired(false)
          .addChoices(
            { name: '🗑️ ลบถาวร (default)',                       value: 'delete'    },
            { name: '⛔ Exclude (ไม่ track แต่ยังอยู่ใน config)', value: 'exclude'   },
            { name: '✅ Unexclude (กลับมา track)',                 value: 'unexclude' },
          )
      )
  );

module.exports = {
  data: cmd,

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const { guild } = interaction;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ================================================================
    if (sub === 'view') {
      const group   = interaction.options.getString('group');
      const refresh = interaction.options.getBoolean('refresh') ?? false;
      const days    = interaction.options.getInteger('days') ?? DEFAULT_DAYS;

      if (refresh) {
        // คำนวณใหม่ live แล้ว save snapshot
        const roles = await getRolesByGroup(guildId, group);
        if (!roles.length) {
          return interaction.editReply({ content: `❌ ไม่มี role ใน group นี้ครับ` });
        }
        await guild.members.fetch().catch(() => {});

        for (const r of roles) {
          const config = await getConfigByRoleIds(guildId, [r.roleId]);
          const roleConfig = config.get(r.roleId);
          if (!roleConfig) continue;
          const top = await getRoleStats(guildId, guild, roleConfig, { topN: 10, days });
          await saveSnapshot(guildId, r.roleId, days, top);
        }
      }

      const snapshots = await getSnapshotByGroup(guildId, group);
      if (!snapshots.length) {
        return interaction.editReply({
          content: `❌ ยังไม่มี snapshot ของกลุ่มนี้ครับ ลองรัน \`/orgchart snapshot group:${group}\` ก่อนนะครับ`,
        });
      }

      let isFirst = true;
      for (const snap of snapshots) {
        if (!snap.topMembers.length) continue;

        const roleConfig = { roleId: snap.roleId, roleName: snap.roleName, roleColor: snap.roleColor };
        const embed = buildOrgChartEmbed(roleConfig, snap.topMembers, { days: snap.days })
          .setFooter({ text: `Snapshot: ${formatComputedAt(snap.computedAt)} • ย้อนหลัง ${snap.days} วัน` });

        if (isFirst) {
          await interaction.editReply({ embeds: [embed] });
          isFirst = false;
        } else {
          await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
      }

      if (isFirst) {
        return interaction.editReply({ content: `ℹ️ ไม่มีข้อมูล activity ใน snapshot ครับ` });
      }
      return;
    }

    // ================================================================
    if (sub === 'snapshot') {
      const group = interaction.options.getString('group');
      const days  = interaction.options.getInteger('days') ?? DEFAULT_DAYS;

      const groups = group === 'all' ? ALL_GROUPS : [group];
      await guild.members.fetch().catch(() => {});

      let total = 0;
      for (const g of groups) {
        const roles = await getRolesByGroup(guildId, g);
        for (const r of roles) {
          const config = await getConfigByRoleIds(guildId, [r.roleId]);
          const roleConfig = config.get(r.roleId);
          if (!roleConfig) continue;
          const top = await getRoleStats(guildId, guild, roleConfig, { topN: 10, days });
          await saveSnapshot(guildId, r.roleId, days, top);
          total++;
        }
      }

      return interaction.editReply({
        content: `✅ Snapshot เสร็จแล้วครับ — บันทึก **${total}** roles (ย้อนหลัง ${days} วัน)`,
      });
    }

    // ================================================================
    if (sub === 'scan') {
      const STRIP_PREFIXES = ['ทีม'];
      function stripPrefix(name) {
        for (const p of STRIP_PREFIXES) if (name.startsWith(p)) return name.slice(p.length).trim();
        return name.trim();
      }
      function normalize(str) { return str.toLowerCase().replace(/[\s\-_]/g, ''); }
      function matchChannels(g, roleName) {
        const keyword = normalize(stripPrefix(roleName));
        const textChs = [], voiceChs = [];
        for (const ch of g.channels.cache.values()) {
          const chName = normalize(ch.name);
          if (!chName.includes(keyword) && !keyword.includes(chName)) continue;
          if (ch.isVoiceBased()) voiceChs.push({ id: ch.id, name: ch.name });
          else if ((ch.isTextBased() && !ch.isThread()) || ch.type === ChannelType.GuildForum)
            textChs.push({ id: ch.id, name: ch.name, type: ch.type === ChannelType.GuildForum ? 'forum' : 'text' });
        }
        return { textChs, voiceChs };
      }

      await guild.roles.fetch();
      await guild.channels.fetch();

      const added = [], skipped = [], noMatch = [];

      for (const role of guild.roles.cache.values()) {
        if (role.name === '@everyone' || role.managed) continue;
        if (await roleExists(guild.id, role.id)) { skipped.push(role.name); continue; }

        const { textChs, voiceChs } = matchChannels(guild, role.name);
        if (!textChs.length && !voiceChs.length) { noMatch.push(role.name); continue; }

        const roleColor = role.hexColor !== '#000000' ? role.hexColor : null;
        for (const ch of textChs)  await upsertChannel({ guildId: guild.id, roleId: role.id, roleName: role.name, roleColor, channelId: ch.id, channelName: ch.name, channelType: ch.type });
        for (const ch of voiceChs) await upsertChannel({ guildId: guild.id, roleId: role.id, roleName: role.name, roleColor, channelId: ch.id, channelName: ch.name, channelType: 'voice' });
        added.push({ name: role.name, textChs, voiceChs });
      }

      const lines = [];
      if (added.length) {
        lines.push(`✅ เพิ่มใหม่ **${added.length}** roles:`);
        for (const r of added) {
          lines.push(`**${r.name}**\n  💬 ${r.textChs.map(c => c.name).join(', ') || '—'}\n  🔊 ${r.voiceChs.map(c => c.name).join(', ') || '—'}`);
        }
      } else {
        lines.push('ℹ️ ไม่มี role ใหม่ที่ต้องเพิ่ม');
      }
      if (skipped.length) { lines.push(`\n⏭️ ข้าม **${skipped.length}** roles (มีอยู่แล้ว):`); for (const n of skipped) lines.push(`• ${n}`); }
      if (noMatch.length) { lines.push(`\n⚠️ หา channel ไม่เจอ **${noMatch.length}** roles:`); for (const n of noMatch) lines.push(`• ${n}`); lines.push('*เพิ่มเองได้ด้วย `/orgchart add`*'); }

      const chunks = [];
      let current = '';
      for (const line of lines) {
        if (current.length + line.length > 1800) { chunks.push(current); current = ''; }
        current += line + '\n';
      }
      if (current) chunks.push(current);

      await interaction.editReply({ content: chunks[0] });
      for (const chunk of chunks.slice(1)) await interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral });
      return;
    }

    // ================================================================
    if (sub === 'add') {
      const role = interaction.options.getRole('role');
      const roleColor = role.hexColor !== '#000000' ? role.hexColor : null;

      const channels = [1, 2, 3, 4, 5]
        .map(i => interaction.options.getChannel(`channel${i}`))
        .filter(Boolean);

      for (const channel of channels) {
        await upsertChannel({
          guildId, roleId: role.id, roleName: role.name, roleColor,
          channelId: channel.id, channelName: channel.name,
          channelType: resolveChannelType(channel),
        });
      }

      const group = interaction.options.getString('group');
      if (group) await setRoleGroup(guildId, role.id, group);

      const names = channels.map(c => `**#${c.name}**`).join(', ');
      const groupNote = group ? ` (group: ${group})` : '';
      return interaction.editReply({ content: `✅ เพิ่ม ${names} เข้า **${role.name}** แล้วครับ${groupNote}` });
    }

    // ================================================================
    if (sub === 'remove') {
      const role    = interaction.options.getRole('role');
      const channel = interaction.options.getChannel('channel');
      const action  = interaction.options.getString('action') ?? 'delete';

      if (action === 'exclude') {
        if (!channel) return interaction.editReply({ content: '❌ ต้องระบุ channel สำหรับ exclude ครับ' });
        await excludeChannel(guildId, role.id, channel.id);
        return interaction.editReply({ content: `⛔ Excluded **#${channel.name}** จาก **${role.name}** แล้วครับ` });
      }

      if (action === 'unexclude') {
        if (!channel) return interaction.editReply({ content: '❌ ต้องระบุ channel สำหรับ unexclude ครับ' });
        await unexcludeChannel(guildId, role.id, channel.id);
        return interaction.editReply({ content: `✅ Unexcluded **#${channel.name}** จาก **${role.name}** แล้วครับ` });
      }

      if (channel) {
        await deleteChannel(guildId, role.id, channel.id);
        return interaction.editReply({ content: `✅ ลบ **#${channel.name}** ออกจาก **${role.name}** แล้วครับ` });
      }
      await deleteRole(guildId, role.id);
      return interaction.editReply({ content: `✅ ลบ **${role.name}** ออกจาก config ทั้งหมดแล้วครับ` });
    }
  },
};
