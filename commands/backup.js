// commands/backup.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { ROLES } = require('../config/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('backup ข้อมูล server ทั้งหมดลง JSON')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;

    // ดึงข้อมูลทั้งหมด
    await guild.channels.fetch();
    await guild.roles.fetch();
    const members = await guild.members.fetch();

    // --- Roles ---
    const roles = guild.roles.cache
      .sort((a, b) => b.position - a.position)
      .map(r => ({
        id: r.id,
        name: r.name,
        color: r.hexColor,
        hoist: r.hoist,
        mentionable: r.mentionable,
        position: r.position,
        permissions: r.permissions.toArray(),
        managed: r.managed, // bot role หรือเปล่า
      }));

    // --- Channels ---
    const channels = guild.channels.cache
      .sort((a, b) => a.position - b.position)
      .map(ch => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        position: ch.position,
        parentId: ch.parentId ?? null,
        parentName: ch.parent?.name ?? null,
        topic: ch.topic ?? null,
        nsfw: ch.nsfw ?? false,
        rateLimitPerUser: ch.rateLimitPerUser ?? 0,
        // permission overwrites ของแต่ละห้อง
        permissionOverwrites: ch.permissionOverwrites?.cache.map(ow => ({
          id: ow.id,
          type: ow.type, // 0 = role, 1 = member
          allow: ow.allow.toArray(),
          deny: ow.deny.toArray(),
        })) ?? [],
      }));

    // --- Members (เฉพาะ roles ที่มี ไม่เก็บข้อมูลส่วนตัว) ---
    const memberRoles = [...members.values()].map(m => ({
      id: m.id,
      username: m.user.username,
      roles: m.roles.cache
        .filter(r => r.id !== guild.id) // ตัด @everyone ออก
        .map(r => ({ id: r.id, name: r.name })),
    }));

    // --- Guild info ---
    const guildInfo = {
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      description: guild.description,
      preferredLocale: guild.preferredLocale,
    };

    const backup = {
      timestamp: new Date().toISOString(),
      guild: guildInfo,
      roles,
      channels,
      memberRoles,
    };

    // บันทึกลงไฟล์
    const filename = `backup_${guild.id}_${Date.now()}.json`;
    const filepath = path.join(__dirname, '../backups', filename);

    fs.mkdirSync(path.join(__dirname, '../backups'), { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf8');

    await interaction.editReply({
      content: `✅ backup เสร็จแล้วครับ\n📁 \`${filename}\`\n\n` +
        `- Roles: ${roles.length}\n` +
        `- Channels: ${channels.length}\n` +
        `- Members: ${memberRoles.length}`,
    });
  },
};