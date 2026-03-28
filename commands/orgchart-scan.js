// commands/orgchart-scan.js
// สแกน role + channel แล้วบันทึกลง DB (merge — ไม่เขียนทับ role ที่มีอยู่แล้ว)

const { SlashCommandBuilder, MessageFlags, ChannelType } = require('discord.js');
const { upsertChannel, roleExists } = require('../db/orgchartConfig');

const STRIP_PREFIXES = ['ทีม'];

function stripPrefix(name) {
  for (const prefix of STRIP_PREFIXES) {
    if (name.startsWith(prefix)) return name.slice(prefix.length).trim();
  }
  return name.trim();
}

function normalize(str) {
  return str.toLowerCase().replace(/[\s\-_]/g, '');
}

function matchChannels(guild, roleName) {
  const keyword  = normalize(stripPrefix(roleName));
  const textChs  = [];
  const voiceChs = [];

  for (const channel of guild.channels.cache.values()) {
    const chName = normalize(channel.name);
    if (!chName.includes(keyword) && !keyword.includes(chName)) continue;
    if ((channel.isTextBased() && !channel.isThread()) || channel.type === ChannelType.GuildForum) {
      const type = channel.type === ChannelType.GuildForum ? 'forum' : 'text';
      textChs.push({ id: channel.id, name: channel.name, type });
    } else if (channel.isVoiceBased()) {
      voiceChs.push({ id: channel.id, name: channel.name, type: 'voice' });
    }
  }

  return { textChs, voiceChs };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orgchart-scan')
    .setDescription('สแกน role + channel แล้วบันทึก config (Admin only)')
    .setDefaultMemberPermissions(0x8),

  async execute(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ ต้องการสิทธิ์ Administrator', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guild } = interaction;
    await guild.roles.fetch();
    await guild.channels.fetch();

    const added   = [];
    const skipped = [];
    const noMatch = [];

    for (const role of guild.roles.cache.values()) {
      if (role.name === '@everyone') continue;
      if (role.managed) continue;

      // merge: ถ้ามีอยู่แล้วใน DB ข้ามเลย
      const exists = await roleExists(guild.id, role.id);
      if (exists) {
        skipped.push(role.name);
        continue;
      }

      const { textChs, voiceChs } = matchChannels(guild, role.name);

      if (!textChs.length && !voiceChs.length) {
        noMatch.push(role.name);
        continue;
      }

      const roleColor = role.hexColor !== '#000000' ? role.hexColor : null;

      for (const ch of textChs) {
        await upsertChannel({
          guildId: guild.id, roleId: role.id, roleName: role.name,
          roleColor, channelId: ch.id, channelName: ch.name, channelType: ch.type,
        });
      }
      for (const ch of voiceChs) {
        await upsertChannel({
          guildId: guild.id, roleId: role.id, roleName: role.name,
          roleColor, channelId: ch.id, channelName: ch.name, channelType: 'voice',
        });
      }

      added.push({ name: role.name, textChs, voiceChs });
    }

    // ── summary ────────────────────────────────────────────────────────────────
    const lines = [];

    if (added.length) {
      lines.push(`✅ เพิ่มใหม่ **${added.length}** roles:`);
      for (const r of added) {
        const tch = r.textChs.map(c => c.name).join(', ') || '—';
        const vch = r.voiceChs.map(c => c.name).join(', ') || '—';
        lines.push(`**${r.name}**\n  💬 ${tch}\n  🔊 ${vch}`);
      }
    } else {
      lines.push('ℹ️ ไม่มี role ใหม่ที่ต้องเพิ่ม');
    }

    if (skipped.length) {
      lines.push(`\n⏭️ ข้าม **${skipped.length}** roles (มีอยู่แล้ว — ไม่แตะ):`);
      for (const n of skipped) lines.push(`• ${n}`);
    }

    if (noMatch.length) {
      lines.push(`\n⚠️ หา channel ไม่เจอ **${noMatch.length}** roles:`);
      for (const n of noMatch) lines.push(`• ${n}`);
      lines.push(`*เพิ่มเองได้ด้วย \`/orgchart-add\`*`);
    }

    const chunks = [];
    let current  = '';
    for (const line of lines) {
      if (current.length + line.length > 1800) { chunks.push(current); current = ''; }
      current += line + '\n';
    }
    if (current) chunks.push(current);

    await interaction.editReply({ content: chunks[0] });
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral });
    }
  },
};
