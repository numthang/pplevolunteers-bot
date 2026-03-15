// commands/province.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { PROVINCE_ROLES, SUB_REGION_ROLES, MAIN_REGION_ROLES } = require('../config/roles');
const { BKK_HINT } = require('../config/hints');

const PROVINCE_REGIONS = [
  {
    id: 'bkk',
    label: '🏙️ กรุงเทพฯ & ปริมณฑล',
    color: 0x3498db,
    provinces: [
      'กรุงเทพชั้นใน', 'กรุงเทพธนบุรี', 'กรุงเทพตะวันออก', 'กรุงเทพเหนือ',
      'นนทบุรี', 'สมุทรปราการ', 'สมุทรสาคร', 'ปทุมธานี',
    ],
  },
  {
    id: 'central',
    label: '🌿 ภาคกลาง',
    color: 0x2ecc71,
    provinces: [
      'ราชบุรี', 'นครปฐม', 'กาญจนบุรี', 'เพชรบุรี', 'สุพรรณบุรี',
      'สมุทรสงคราม', 'ประจวบคีรีขันธ์', 'อุทัยธานี', 'อ่างทอง', 'สระบุรี',
      'อยุธยา', 'นครนายก', 'ลพบุรี', 'ชัยนาท', 'สิงห์บุรี',
    ],
  },
  {
    id: 'north',
    label: '🌄 ภาคเหนือ',
    color: 0xf39c12,
    provinces: [
      'แม่ฮ่องสอน', 'แพร่', 'ลำพูน', 'ลำปาง', 'พะเยา',
      'เชียงใหม่', 'เชียงราย', 'น่าน', 'กำแพงเพชร', 'ตาก',
      'นครสวรรค์', 'พิจิตร', 'พิษณุโลก', 'เพชรบูรณ์', 'สุโขทัย', 'อุตรดิตถ์',
    ],
  },
  {
    id: 'east',
    label: '🌊 ภาคตะวันออก',
    color: 0x1abc9c,
    provinces: [
      'สระแก้ว', 'ตราด', 'จันทบุรี', 'ระยอง',
      'ชลบุรี', 'ฉะเชิงเทรา', 'ปราจีนบุรี',
    ],
  },
  {
    id: 'northeast',
    label: '🌾 ภาคอีสาน',
    color: 0xe67e22,
    provinces: [
      'อุดรธานี', 'หนองคาย', 'บึงกาฬ', 'สกลนคร', 'มุกดาหาร',
      'นครพนม', 'อำนาจเจริญ', 'เลย', 'ชัยภูมิ', 'ขอนแก่น',
      'กาฬสินธุ์', 'ยโสธร', 'หนองบัวลำภู', 'มหาสารคาม', 'ร้อยเอ็ด',
      'อุบลราชธานี', 'ศรีสะเกษ', 'สุรินทร์', 'บุรีรัมย์', 'นครราชสีมา',
    ],
  },
  {
    id: 'south',
    label: '🏖️ ภาคใต้',
    color: 0x9b59b6,
    provinces: [
      'ชุมพร', 'พังงา', 'ระนอง', 'ภูเก็ต', 'สุราษฎร์ธานี',
      'นครศรีธรรมราช', 'ตรัง', 'กระบี่', 'สงขลา', 'พัทลุง',
      'สตูล', 'ปัตตานี', 'ยะลา', 'นราธิวาส',
    ],
  },
];

function buildRows(region, memberRoles) {
  const rows = [];
  for (let i = 0; i < region.provinces.length; i += 4) {
    const chunk = region.provinces.slice(i, i + 4);
    rows.push(
      new ActionRowBuilder().addComponents(
        chunk.map((p) => {
          const roleId = PROVINCE_ROLES[p];
          const hasRole = roleId && memberRoles.cache.has(roleId);
          return new ButtonBuilder()
            .setCustomId(`prov_btn:${region.id}:${p}`)
            .setLabel(p)
            .setStyle(hasRole ? ButtonStyle.Primary : ButtonStyle.Secondary);
        })
      )
    );
  }
  return rows;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('province')
    .setDescription('เลือกจังหวัดของคุณ')
    .addBooleanOption(option =>
      option.setName('ephemeral').setDescription('แสดงผลแบบส่วนตัว').setRequired(false)
    ),
  
  async execute(interaction) {
    const memberRoles = interaction.member.roles;
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;
    
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🏙️ กรุงเทพฯ & ปริมณฑล')
        .setDescription(BKK_HINT)
        .setColor(0x3498db)],
      components: buildRows(PROVINCE_REGIONS[0], memberRoles),
      ephemeral,
    });

    for (let i = 1; i < PROVINCE_REGIONS.length; i++) {
      const region = PROVINCE_REGIONS[i];
      await interaction.followUp({
        embeds: [new EmbedBuilder().setTitle(region.label).setColor(region.color)],
        components: buildRows(region, memberRoles),
        ephemeral,
      });
    }
  },

  PROVINCE_REGIONS,
  buildRows,
};
