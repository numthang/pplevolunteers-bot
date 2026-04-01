// commands/orgchart-add.js
// เพิ่ม channel เข้า role ใน config ได้สูงสุด 5 channels พร้อมกัน

const { SlashCommandBuilder, MessageFlags, ChannelType } = require('discord.js');
const { upsertChannel, setRoleGroup } = require('../db/orgchartConfig');

function resolveChannelType(channel) {
  if (channel.type === ChannelType.GuildForum) return 'forum';
  if (channel.isVoiceBased())                  return 'voice';
  return 'text';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orgchart-add')
    .setDescription('เพิ่ม channel เข้า role ใน config (Admin only)')
    .setDefaultMemberPermissions(0x8)
    .addRoleOption(opt =>
      opt.setName('role').setDescription('Role ที่ต้องการเพิ่ม channel ให้').setRequired(true)
    )
    .addChannelOption(opt =>
      opt.setName('channel1').setDescription('Channel ที่ 1').setRequired(true)
    )
    .addChannelOption(opt =>
      opt.setName('channel2').setDescription('Channel ที่ 2').setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('channel3').setDescription('Channel ที่ 3').setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('channel4').setDescription('Channel ที่ 4').setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('channel5').setDescription('Channel ที่ 5').setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('group')
        .setDescription('กลุ่มของ role นี้ (ถ้าไม่ระบุ จะไม่เปลี่ยนค่าเดิม)')
        .setRequired(false)
        .addChoices(
          { name: '🌟 ทีมหลัก',       value: 'main'     },
          { name: '🛠️ ทีม Skill',     value: 'skill'    },
          { name: '🗺️ ทีมภาค',       value: 'region'   },
          { name: '📍 ทีมจังหวัด',    value: 'province' },
          { name: '🏘️ ทีมอำเภอ',     value: 'district' },
          { name: '⬜ ยังไม่จัดกลุ่ม', value: 'other'    },
        )
    ),

  async execute(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ ต้องการสิทธิ์ Administrator', flags: MessageFlags.Ephemeral });
    }

    const role = interaction.options.getRole('role');
    const roleColor = role.hexColor !== '#000000' ? role.hexColor : null;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channels = [1, 2, 3, 4, 5]
      .map(i => interaction.options.getChannel(`channel${i}`))
      .filter(Boolean);

    for (const channel of channels) {
      await upsertChannel({
        guildId:     interaction.guildId,
        roleId:      role.id,
        roleName:    role.name,
        roleColor,
        channelId:   channel.id,
        channelName: channel.name,
        channelType: resolveChannelType(channel),
      });
    }

    const group = interaction.options.getString('group');
    if (group) await setRoleGroup(interaction.guildId, role.id, group);

    const names = channels.map(c => `**#${c.name}**`).join(', ');
    const groupNote = group ? ` (group: ${group})` : '';
    await interaction.editReply({
      content: `✅ เพิ่ม ${names} เข้า **${role.name}** แล้วครับ${groupNote}`,
    });
  },
};
