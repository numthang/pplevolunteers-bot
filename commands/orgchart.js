// commands/orgchart.js
// แสดง Top N active members ต่อ role
// /orgchart                          → แสดงทุก role ใน config
// /orgchart role1:@ทีมA role2:@ทีมB → แสดงเฉพาะ role ที่เลือก (สูงสุด 5)

const { SlashCommandBuilder } = require('discord.js');
const { getConfig }           = require('../db/orgchartConfig');
const { getRoleStats, buildOrgChartEmbed, buildOrgChartAttachment } = require('../utils/orgchartEmbed');

const DEFAULT_TOP  = 10;
const MAX_TOP      = 25;
const DEFAULT_DAYS = 60;

function addRoleOpt(builder, n) {
  return builder.addRoleOption(opt =>
    opt.setName(`role${n}`)
      .setDescription(`Role ที่ ${n} ที่ต้องการดู`)
      .setRequired(false)
  );
}

let cmd = new SlashCommandBuilder()
  .setName('orgchart')
  .setDescription('แสดง Top active members ต่อ role');

for (let i = 1; i <= 5; i++) cmd = addRoleOpt(cmd, i);

cmd
  .addIntegerOption(opt =>
    opt.setName('top')
      .setDescription(`จำนวนสูงสุดที่แสดงต่อ role (default ${DEFAULT_TOP}, max ${MAX_TOP})`)
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(MAX_TOP)
  )
  .addIntegerOption(opt =>
    opt.setName('days')
      .setDescription(`ย้อนหลังกี่วัน (default ${DEFAULT_DAYS})`)
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(365)
  )
  .addStringOption(opt =>
    opt.setName('output')
      .setDescription('รูปแบบ output (default = embed เท่านั้น)')
      .setRequired(false)
      .addChoices(
        { name: '📝 Embed เท่านั้น (default)', value: 'embed' },
        { name: '🖼️ รูปภาพเท่านั้น',           value: 'image' },
        { name: '📊 Embed + รูปภาพ',            value: 'both'  },
      )
  )
  .addBooleanOption(opt =>
    opt.setName('public')
      .setDescription('แสดงให้ทุกคนเห็น (default: เฉพาะคุณ)')
      .setRequired(false)
  );

module.exports = {
  data: cmd,

  async execute(interaction) {
    // await interaction.deferReply();
    const isPublic = interaction.options.getBoolean('public') ?? false;
    await interaction.deferReply({ ephemeral: !isPublic });

    const config     = await getConfig(interaction.guildId);
    const outputMode = interaction.options.getString('output') ?? 'embed';
    const topN       = interaction.options.getInteger('top')   ?? DEFAULT_TOP;
    const days       = interaction.options.getInteger('days')  ?? DEFAULT_DAYS;

    if (!config.size) {
      return interaction.editReply({ content: '❌ ยังไม่มี config ครับ ลองรัน `/orgchart-scan` ก่อนนะครับ' });
    }

    // รวม role ที่เลือก (role1–role5) ถ้าไม่เลือกเลย = ทุก role
    const selectedIds = [1, 2, 3, 4, 5]
      .map(n => interaction.options.getRole(`role${n}`)?.id)
      .filter(Boolean);

    let targets = [...config.values()];
    if (selectedIds.length) {
      targets = targets.filter(r => selectedIds.includes(r.roleId));
      const notFound = selectedIds.filter(id => !config.has(id));
      if (notFound.length) {
        const mentions = notFound.map(id => `<@&${id}>`).join(', ');
        await interaction.followUp({
          content: `⚠️ Role ${mentions} ยังไม่มีใน config ครับ ลองรัน \`/orgchart-scan\` ก่อนนะครับ`,
          ephemeral: true,
        });
      }
      if (!targets.length) return;
    }

    await interaction.guild.members.fetch().catch(() => {});

    let isFirst = true;

    for (const roleConfig of targets) {
      const top = await getRoleStats(interaction.guildId, interaction.guild, roleConfig, { topN, days });
      if (!top.length || top[0].score === 0) continue;

      const embed      = buildOrgChartEmbed(roleConfig, top, { days });
      let   attachment = null;

      if (outputMode !== 'embed') {
        attachment = await buildOrgChartAttachment(roleConfig, top);
        if (attachment && outputMode !== 'image') embed.setImage('attachment://orgchart.png');
      }

      const payload = {};
      if (outputMode !== 'image') payload.embeds = [embed];
      if (attachment)             payload.files  = [attachment];

      if (isFirst) {
        await interaction.editReply(payload);
        isFirst = false;
      } else {
        await interaction.followUp({ ...payload, ephemeral: !isPublic });
      }
    }

    if (isFirst) {
      await interaction.editReply({ content: `ℹ️ ไม่มีข้อมูล activity ในช่วง ${days} วันที่ผ่านมาครับ` });
    }
  },
};
