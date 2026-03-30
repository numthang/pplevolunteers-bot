// commands/help.js
// /help — แสดงรายการคำสั่งทั้งหมดพร้อมคำอธิบาย + options
// โหลดคำสั่งแบบ dynamic จาก commands/ — ไม่ต้อง update เมื่อเพิ่มคำสั่งใหม่

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// หมวดหมู่ตาม prefix/ชื่อ — เรียงตาม order ที่จะแสดงใน embed
const CATEGORIES = [
  { name: '👤 สมาชิก',          match: ['register', 'interest', 'province'] },
  { name: '⭐ คะแนน & รายงาน',  match: ['rate-user', 'ratings', 'ratings-top', 'reports'] },
  { name: '📊 สถิติ',            prefix: 'stat-' },
  { name: '🗂️ Org Chart',        prefix: 'orgchart' },
  { name: '🔧 Admin',            match: ['setup-interest', 'setup-province', 'cleanup-messages', 'sticky-set', 'backup'] },
  { name: '💬 ทั่วไป',           match: ['channel-guide', 'hi', 'help'] },
  { name: '📦 อื่นๆ',            fallback: true },
];

function getCategory(name) {
  for (const cat of CATEGORIES) {
    if (cat.fallback) continue;
    if (cat.match?.includes(name)) return cat.name;
    if (cat.prefix && name.startsWith(cat.prefix)) return cat.name;
  }
  return '📦 อื่นๆ';
}

// แปลง option type number เป็น label สั้นๆ
const TYPE_LABEL = { 3: 'text', 4: 'int', 5: 'bool', 6: 'user', 7: 'channel', 8: 'role', 10: 'num' };

function formatOptions(options = []) {
  const parts = [];
  for (const opt of options) {
    if (opt.type === 1) { // SUB_COMMAND
      parts.push(`\`${opt.name}\``);
      continue;
    }
    const label = TYPE_LABEL[opt.type] ? `${opt.name}:${TYPE_LABEL[opt.type]}` : opt.name;
    parts.push(opt.required ? `\`<${label}>\`` : `\`[${label}]\``);
  }
  return parts.length ? '  ' + parts.join(' ') : '';
}

function loadCommands() {
  const dir = path.join(__dirname);
  const grouped = Object.fromEntries(CATEGORIES.map(c => [c.name, []]));

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'help.js');
  for (const file of files) {
    const cmd = require(path.join(dir, file));
    if (!cmd.data?.name) continue;

    // skip context menu (ไม่มี description)
    if (!cmd.data.description) continue;

    const json    = cmd.data.toJSON();
    const catName = getCategory(json.name);
    grouped[catName].push({
      name: json.name,
      desc: json.description,
      opts: formatOptions(json.options ?? []),
    });
  }

  // เรียง alphabetically ภายในแต่ละหมวด
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return grouped;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('แสดงรายการคำสั่งทั้งหมดพร้อมคำอธิบาย')
    .addBooleanOption(opt =>
      opt.setName('public')
        .setDescription('แสดงให้ทุกคนเห็น (default: เฉพาะคุณ)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const isPublic = interaction.options.getBoolean('public') ?? false;
    await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });

    const grouped = loadCommands();
    const embed   = new EmbedBuilder()
      .setTitle('📖 รายการคำสั่งทั้งหมด')
      .setColor(0x5865F2)
      .setFooter({ text: 'PPLE Volunteers Bot  •  <opt> = จำเป็น  [opt] = ไม่บังคับ' });

    for (const cat of CATEGORIES) {
      const list = grouped[cat.name];
      if (!list?.length) continue;

      const lines = list.map(c => `\`/${c.name}\` — ${c.desc}${c.opts}`).join('\n');
      embed.addFields({ name: cat.name, value: lines });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
