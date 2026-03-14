// handlers/registerHandler.js
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { PROVINCE_ROLES, SUB_REGION_ROLES, MAIN_REGION_ROLES } = require('../config/roles');
const { BKK_HINT } = require('../config/hints');
const { upsertMember, syncMemberRoles } = require('../db/members'); //insert/edit member db

const PROVINCE_REGIONS = [
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
  {
    id: 'bkk',
    label: '🏙️ กรุงเทพฯ & ปริมณฑล',
    color: 0x3498db,
    provinces: [
      'กรุงเทพชั้นใน', 'กรุงเทพธนบุรี', 'กรุงเทพตะวันออก', 'กรุงเทพเหนือ',
      'นนทบุรี', 'สมุทรปราการ', 'สมุทรสาคร', 'ปทุมธานี',
    ],
  },
];

// เก็บข้อมูลชั่วคราว
const pendingForms = new Map();

function buildDropdown(region) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`province_dd:${region.id}`)
      .setPlaceholder(`${region.label} — เลือกได้หลายจังหวัด`)
      .setMinValues(0)
      .setMaxValues(region.provinces.length)
      .addOptions(region.provinces.map((p) => ({ label: p, value: p })))
  );
}

// -------- Modal Submit --------
async function handleModalSubmit(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== 'modal_register') return;

  const formData = {
    name:       interaction.fields.getTextInputValue('field_name'),
    memberId:   interaction.fields.getTextInputValue('field_member_id'),
    nickname:   interaction.fields.getTextInputValue('field_nickname'),
    interest:   interaction.fields.getTextInputValue('field_interest'),
    referredBy: interaction.fields.getTextInputValue('field_referred_by'),
  };

  // เก็บ selectedProvinces แยกตาม regionId
  pendingForms.set(interaction.user.id, { formData, selectedProvinces: {} });

  // ← เพิ่มตรงนี้
  const { name, memberId, nickname, interest, referredBy } = formData;
  const parts = name.trim().split(/\s+/);
  const firstname = parts[0] ?? null;
  const lastname = parts.slice(1).join(' ') || null;

  await upsertMember({
    discord_id: interaction.user.id,
    username: interaction.user.username,
    nickname,
    firstname,
    lastname,
    member_id: memberId,
    specialty: interest,
    referred_by: referredBy,
    province: null,
    region: null,
    roles: null,
    interests: null,
  });
  await syncMemberRoles(interaction.member); //อัพเดททุก Roles ใหม่หมดหลังแก้ไข form

  const embed = new EmbedBuilder()
    .setTitle('📍 เลือกจังหวัดของคุณ')
    .setDescription('เลือกได้หลายจังหวัด หลายภาคตามความสนใจ')
    .setColor(0x5865f3);

  // Message 1: 5 ภาค
  await interaction.reply({
    embeds: [embed],
    components: PROVINCE_REGIONS.slice(0, 5).map(buildDropdown),
    ephemeral: true,
  });

  // Message 2: กรุงเทพฯ & ปริมณฑล
  await interaction.followUp({
    embeds: [new EmbedBuilder()
      .setTitle('🏙️ กรุงเทพฯ & ปริมณฑล')
      .setDescription(BKK_HINT)
      .setColor(0x3498db)],
    components: [buildDropdown(PROVINCE_REGIONS[5])],
    ephemeral: true,
  });

  // Message 3: ปุ่มยืนยัน (แยก message เพื่อไม่ให้ชนกับ dropdown)
  await interaction.followUp({
    content: '> เลือกจังหวัดครบแล้ว กดยืนยันได้เลย',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_register_confirm')
          .setLabel('📋 ยืนยัน & บันทึกข้อมูล')
          .setStyle(ButtonStyle.Success)
      ),
    ],
    ephemeral: true,
  });
}

// -------- Dropdown Select → diff role --------
async function handleProvinceDropdown(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  if (!interaction.customId.startsWith('province_dd:')) return;

  await interaction.deferUpdate();

  const regionId = interaction.customId.split(':')[1];
  let pending = pendingForms.get(interaction.user.id);
  if (!pending) {
    pending = { formData: {}, selectedProvinces: {} };
    pendingForms.set(interaction.user.id, pending);
  }

  const prev = new Set(pending.selectedProvinces[regionId] || []);
  const next = new Set(interaction.values);

  // เพิ่ม role ที่เพิ่งเลือกใหม่
  for (const p of next) {
    if (!prev.has(p)) {
      if (PROVINCE_ROLES[p]) await interaction.member.roles.add(PROVINCE_ROLES[p]);
      if (SUB_REGION_ROLES[p]) await interaction.member.roles.add(SUB_REGION_ROLES[p]);
      if (MAIN_REGION_ROLES[p]) await interaction.member.roles.add(MAIN_REGION_ROLES[p]);
    }
  }

  // ถอด role ที่เอาออก
  for (const p of prev) {
    if (!next.has(p)) {
      if (PROVINCE_ROLES[p]) await interaction.member.roles.remove(PROVINCE_ROLES[p]);
      if (SUB_REGION_ROLES[p]) await interaction.member.roles.remove(SUB_REGION_ROLES[p]);
      if (MAIN_REGION_ROLES[p]) await interaction.member.roles.remove(MAIN_REGION_ROLES[p]);
    }
  }

  // อัปเดต state
  pending.selectedProvinces[regionId] = interaction.values;
  await syncMemberRoles(interaction.member);
}

// -------- Confirm Button → log channel --------
async function handleRegisterConfirm(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'btn_register_confirm') return;

  await interaction.deferUpdate();

  const pending = pendingForms.get(interaction.user.id);
  if (!pending) {
    return interaction.followUp({ content: '❌ ไม่พบข้อมูล กรุณาใช้ /register ใหม่', ephemeral: true });
  }

  const { formData } = pending;
  const { name, memberId, nickname, interest, referredBy } = formData;

  // ดึงจังหวัดจาก member roles โดยตรง — แม่นยำกว่า state
  await interaction.member.fetch();
  const allProvinces = Object.entries(PROVINCE_ROLES)
    .filter(([, roleId]) => interaction.member.roles.cache.has(roleId))
    .map(([province]) => province);
  await syncMemberRoles(interaction.member);
  
  /*// ตั้ง nickname
  const newNickname = memberId
    ? `${name} (${memberId}) • ${nickname}`
    : `${name} • ${nickname}`;

  try {
    await interaction.member.setNickname(newNickname);
  } catch (err) {
    console.error('❌ set nickname ไม่ได้:', err);
  }
  */
  const embed = new EmbedBuilder()
    //.setTitle(`สวัสดี, ${interaction.user.username}`)
    .setColor(0x5865f3)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: 'ชื่อ-นามสกุล',     value: name,                    inline: true },
      { name: 'ชื่อเล่น',          value: nickname,                inline: true },
      { name: 'เลขสมาชิก',         value: memberId || '-',         inline: true },
      { name: 'จังหวัด',           value: allProvinces.join(', '), inline: false },
      { name: 'ความสนใจ/ความถนัด', value: interest || '-',         inline: false },
      { name: 'แนะนำโดย',         value: referredBy || '-',       inline: true },
      { name: 'Discord',           value: `<@${interaction.user.id}>`+` (${interaction.user.username})`, inline: false },
    )
    .setTimestamp();

  // ส่งไป log channel/thread
  try {
    //const logChannel = await interaction.client.channels.fetch(process.env.LOG_CHANNEL_ID);
    const logChannel = interaction.channel;
    if (logChannel.isThread()) await logChannel.join();
    await logChannel.send({
      embeds: [embed],
      /*components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('delete_log')
            .setLabel('🗑️ ลบ')
            .setStyle(ButtonStyle.Danger)
        ),
      ],*/
    });
  } catch (err) {
    console.error('❌ ส่ง log ไม่ได้:', err);
  }

  await interaction.followUp({ content: '✅ บันทึกข้อมูลเรียบร้อยแล้วครับ!', ephemeral: true });
  pendingForms.delete(interaction.user.id);
}

async function handleDeleteLog(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'delete_log') return;
  await interaction.message.delete();
}

module.exports = { handleModalSubmit, handleProvinceDropdown, handleRegisterConfirm, handleDeleteLog };