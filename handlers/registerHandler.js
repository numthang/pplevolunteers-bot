// handlers/registerHandler.js
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
// เพิ่ม import ด้านบนสุด (ถ้ายังไม่มี)
const { buildRows } = require('../commands/interest');
const { INTEREST_ROLES, SKILL_ROLES } = require('../config/roles');
const { PROVINCE_ROLES, SUB_REGION_ROLES, MAIN_REGION_ROLES } = require('../config/roles');
const { BKK_HINT } = require('../config/hints');
const { upsertMember, syncMemberRoles } = require('../db/members');
const { INTEREST_BUTTONS, SKILL_BUTTONS, PROVINCE_REGIONS } = require('../config/constants');

/* const PROVINCE_REGIONS = [
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
]; */

const pendingForms = new Map();

function buildDropdown(region) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`province_dd:${region.id}`)
      .setPlaceholder(`${region.label} — เลือกได้หลายจังหวัด`)
      .setMinValues(0)
      .setMaxValues(region.provinces.length)
      .addOptions(region.provinces.map((p) => ({label: p, value: p})))
  );
}

// -------- Build Modal (รับ existing data เพื่อ pre-fill) --------
function buildRegisterModal(existing = null) {
  const modal = new ModalBuilder()
    .setCustomId('modal_register')
    .setTitle('แนะนำตัวให้เพื่อนรู้จัก');

  const nameInput = new TextInputBuilder()
    .setCustomId('field_name')
    .setLabel('ชื่อ-นามสกุล')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น ณัฐพงษ์ เรืองปัญญาวุฒิ')
    .setRequired(true);
  if (existing?.firstname) {
    nameInput.setValue([existing.firstname, existing.lastname].filter(Boolean).join(' '));
  }

  const memberIdInput = new TextInputBuilder()
    .setCustomId('field_member_id')
    .setLabel('เลขสมาชิกพรรค (ถ้ามี)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น 6000000001')
    .setRequired(false);
  if (existing?.member_id) memberIdInput.setValue(existing.member_id);

  const nicknameInput = new TextInputBuilder()
    .setCustomId('field_nickname')
    .setLabel('ชื่อเล่น')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น เท้ง')
    .setRequired(true);
  if (existing?.nickname) nicknameInput.setValue(existing.nickname);

  const interestInput = new TextInputBuilder()
    .setCustomId('field_interest')
    .setLabel('ความสนใจ / ความถนัด')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('เช่น ทีมกราฟิก, ทีมคอนเทนต์, อื่นๆ')
    .setRequired(true);
  if (existing?.specialty) interestInput.setValue(existing.specialty);

  const referredByInput = new TextInputBuilder()
    .setCustomId('field_referred_by')
    .setLabel('แนะนำโดย (ถ้ามี)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น ชื่อสมาชิกที่แนะนำ/Facebook/X/อื่นๆ')
    .setRequired(false);
  if (existing?.referred_by) referredByInput.setValue(existing.referred_by);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(memberIdInput),
    new ActionRowBuilder().addComponents(nicknameInput),
    new ActionRowBuilder().addComponents(interestInput),
    new ActionRowBuilder().addComponents(referredByInput),
  );

  return modal;
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

  pendingForms.set(interaction.user.id, {formData, selectedProvinces: {}});

  const {name, memberId, nickname, interest, referredBy} = formData;
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
  await syncMemberRoles(interaction.member);

  const embed = new EmbedBuilder()
    .setTitle('📍 เลือกจังหวัดของคุณ')
    .setDescription('เลือกได้หลายจังหวัด หลายภาคตามความสนใจ')
    .setColor(0x5865f3);

  await interaction.reply({
    embeds: [embed],
    components: PROVINCE_REGIONS.slice(0, 5).map(buildDropdown),
    flags: MessageFlags.Ephemeral,
  });

  await interaction.followUp({
    embeds: [new EmbedBuilder()
      .setTitle('🏙️ กรุงเทพฯ & ปริมณฑล')
      .setDescription(BKK_HINT)
      .setColor(0x3498db)],
    components: [buildDropdown(PROVINCE_REGIONS[5])],
    flags: MessageFlags.Ephemeral,
  });

  await interaction.followUp({
    content: '> เลือกจังหวัดครบแล้ว กดยืนยันได้เลย',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_register_confirm')
          .setLabel('📋 ยืนยัน & ส่งข้อมูล')
          .setStyle(ButtonStyle.Success)
      ),
    ],
    flags: MessageFlags.Ephemeral,
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
    pending = {formData: {}, selectedProvinces: {}};
    pendingForms.set(interaction.user.id, pending);
  }

  const prev = new Set(pending.selectedProvinces[regionId] || []);
  const next = new Set(interaction.values);

  for (const p of next) {
    if (!prev.has(p)) {
      if (PROVINCE_ROLES[p]) await interaction.member.roles.add(PROVINCE_ROLES[p]);
      if (SUB_REGION_ROLES[p]) await interaction.member.roles.add(SUB_REGION_ROLES[p]);
      if (MAIN_REGION_ROLES[p]) await interaction.member.roles.add(MAIN_REGION_ROLES[p]);
    }
  }

  for (const p of prev) {
    if (!next.has(p)) {
      if (PROVINCE_ROLES[p]) await interaction.member.roles.remove(PROVINCE_ROLES[p]);
      if (SUB_REGION_ROLES[p]) await interaction.member.roles.remove(SUB_REGION_ROLES[p]);
      if (MAIN_REGION_ROLES[p]) await interaction.member.roles.remove(MAIN_REGION_ROLES[p]);
    }
  }

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
    return interaction.followUp({content: '❌ ไม่พบข้อมูล กรุณาใช้ /register ใหม่', flags: MessageFlags.Ephemeral});
  }

  const {formData} = pending;
  const {name, memberId, nickname, interest, referredBy} = formData;

  await interaction.member.fetch();
  const allProvinces = Object.entries(PROVINCE_ROLES)
    .filter(([, roleId]) => interaction.member.roles.cache.has(roleId))
    .map(([province]) => province);
  await syncMemberRoles(interaction.member);

  const embed = new EmbedBuilder()
    .setColor(0x5865f3)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      {name: 'ชื่อ-นามสกุล',     value: name,                    inline: true},
      {name: 'ชื่อเล่น',          value: nickname,                inline: true},
      {name: 'เลขสมาชิก',         value: memberId || '-',         inline: true},
      {name: 'จังหวัด',           value: allProvinces.join(', ') || '-', inline: false},
      {name: 'ความสนใจ/ความถนัด', value: interest || '-',         inline: false},
      {name: 'แนะนำโดย',         value: referredBy || '-',       inline: true},
      {name: 'Discord',           value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: false},
    )
    .setTimestamp();

  // ส่ง log แล้วเก็บ message ที่ส่งไว้
  let logMessageUrl = null;
  try {
    // --- โค้ดใหม่ ---
    let logChannel = interaction.channel; // ค่าเริ่มต้นคือห้องที่กดปุ่ม
    const { getSetting } = require('../db/settings'); // ดึงเครื่องมือ DB มาใช้
    let regConfig = await getSetting(interaction.guildId, 'config_register');

    // 🔥 เพิ่มบรรทัดนี้เพื่อดักความต่างของ Driver บน Server
    if (typeof regConfig === 'string') {
      try {
          regConfig = JSON.parse(regConfig);
      } catch (e) {
          console.error('❌ Parse regConfig fail:', e);
      }
    }
    if (regConfig && regConfig.log_channel_id) {
      logChannel = await interaction.guild.channels.fetch(regConfig.log_channel_id)
        .catch((err) => {
            console.error(`❌ Fetch Log Channel (${regConfig.log_channel_id}) Failed:`, err.message);
            return interaction.channel;
        });
    }

    if (logChannel.isThread()) await logChannel.join();
    const logMsg = await logChannel.send({
      content: `Sent by <@${interaction.user.id}> (${interaction.user.username})`,
      embeds: [embed] 
    });
    
    // สร้าง link เฉพาะถ้า log ไปห้องอื่น (ห้องเดียวกันไม่ต้องมี)
    if (logChannel.id !== interaction.channelId) {
      logMessageUrl = logMsg.url;
    }
    
    // ... หลังส่ง logMsg สำเร็จ ...
    if (interaction.client.refreshSticky) {
      await interaction.client.refreshSticky(logChannel);
    }
  } catch (err) {
    console.error('❌ ส่ง log ไม่ได้:', err);
  }

  //await interaction.followUp({content: '✅ บันทึกข้อมูลเรียบร้อยแล้วครับ!', flags: MessageFlags.Ephemeral});
  pendingForms.delete(interaction.user.id);
  
  // --- ต่อด้วย interest/skill ---
  const memberRoles = interaction.member.roles;

  await interaction.followUp({
    embeds: [new EmbedBuilder()
      .setTitle('✅ บันทึกข้อมูลเรียบร้อยแล้ว!')
      .setDescription(
        'ขั้นตอนสุดท้าย — เลือกความสนใจและความถนัดของคุณได้เลย\n' +
        'กดซ้ำเพื่อถอด • 🔵 = มีอยู่แล้ว • ⬜ = ยังไม่มี' +
        (logMessageUrl ? `\n\n[📋 ดูข้อมูลที่บันทึกไว้](${logMessageUrl})` : '')
      )
      .setColor(0x57f287)],
    flags: MessageFlags.Ephemeral,
  });

  await interaction.followUp({
    embeds: [new EmbedBuilder()
      .setTitle('🎯 ความสนใจของคุณคืออะไร?')
      .setColor(0xf1c40f)],
    components: buildRows(INTEREST_BUTTONS, INTEREST_ROLES, memberRoles, 'interest'),
    flags: MessageFlags.Ephemeral,
  });

  await interaction.followUp({
    embeds: [new EmbedBuilder()
      .setTitle('🛠️ ความถนัดของคุณคืออะไร?')
      .setColor(0x3498db)],
    components: buildRows(SKILL_BUTTONS, SKILL_ROLES, memberRoles, 'skill'),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleDeleteLog(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'delete_log') return;
  await interaction.message.delete();
}

// -------- Open Modal จาก Button --------
async function handleOpenRegisterModal(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'btn_open_register_modal') return;
  // mode button ไม่มี existing data เพราะยังไม่ได้ดึง DB
  // ถ้าต้องการ pre-fill ให้ดึงจาก DB ก่อน
  const {getMember} = require('../db/members');
  const existing = await getMember(interaction.user.id);
  await interaction.showModal(buildRegisterModal(existing));
}

module.exports = {
  buildRegisterModal,
  handleModalSubmit,
  handleProvinceDropdown,
  handleRegisterConfirm,
  handleDeleteLog,
  handleOpenRegisterModal,
};
