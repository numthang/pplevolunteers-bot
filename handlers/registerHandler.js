// handlers/registerHandler.js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const { buildRows } = require('./interestSelect');
const { buildRegionDropdown } = require('./provinceSelect');
const { INTEREST_ROLES, SKILL_ROLES, PROVINCE_ROLES } = require('../config/roles');
const { upsertMember, syncMemberRoles } = require('../db/members');
const { INTEREST_BUTTONS, SKILL_BUTTONS } = require('../config/constants');

const pendingForms = new Map();

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

  const amphoeInput = new TextInputBuilder()
    .setCustomId('field_amphoe')
    .setLabel('อำเภอ / จังหวัด')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น ลาดพร้าว กรุงเทพฯ')
    .setRequired(false);
  if (existing?.amphoe) amphoeInput.setValue(existing.amphoe);

  const referredByInput = new TextInputBuilder()
    .setCustomId('field_referred_by')
    .setLabel('แนะนำโดย (ถ้ามี)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น ชื่อสมาชิกที่แนะนำ/Facebook/X/อื่นๆ')
    .setRequired(false);
  if (existing?.referred_by) referredByInput.setValue(existing.referred_by);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(nicknameInput),
    new ActionRowBuilder().addComponents(interestInput),
    new ActionRowBuilder().addComponents(amphoeInput),
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
    nickname:   interaction.fields.getTextInputValue('field_nickname'),
    interest:   interaction.fields.getTextInputValue('field_interest'),
    amphoe:     interaction.fields.getTextInputValue('field_amphoe'),
    referredBy: interaction.fields.getTextInputValue('field_referred_by'),
  };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // โหลด config_register
  const { getSetting } = require('../db/settings');
  let regConfig = await getSetting(interaction.guildId, 'config_register');
  if (typeof regConfig === 'string') {
    try { regConfig = JSON.parse(regConfig); } catch { regConfig = {}; }
  }
  regConfig = regConfig ?? {};
  const provinceSelect = regConfig.province_select === true;
  const interestSelect = regConfig.interest_select === true;

  pendingForms.set(interaction.user.id, {formData, selectedProvinces: {}, interestSelect});

  const {name, nickname, interest, amphoe, referredBy} = formData;
  const parts = name.trim().split(/\s+/);
  const firstname = parts[0] ?? null;
  const lastname = parts.slice(1).join(' ') || null;

  await upsertMember(interaction.guildId, {
    discord_id: interaction.user.id,
    username: interaction.user.username,
    nickname,
    firstname,
    lastname,
    specialty: interest,
    amphoe: amphoe || null,
    referred_by: referredBy,
    province: null,
    region: null,
    roles: null,
    interests: null,
  });
  await syncMemberRoles(interaction.member);

  if (!provinceSelect) {
    pendingForms.delete(interaction.user.id);
    await interaction.member.fetch();
    const allProvinces = Object.entries(PROVINCE_ROLES)
      .filter(([, roleId]) => interaction.member.roles.cache.has(roleId))
      .map(([province]) => province);
    const logMessageUrl = await sendRegisterLog(interaction, formData, allProvinces);
    const memberRoles = interaction.member.roles;
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle('✅ บันทึกข้อมูลเรียบร้อยแล้ว!')
        .setDescription(
          (interestSelect
            ? 'ขั้นตอนสุดท้าย — เลือกความสนใจและความถนัดของคุณได้เลย\n' +
              'กดซ้ำเพื่อถอด • 🔵 = มีอยู่แล้ว • ⬜ = ยังไม่มี'
            : 'ลงทะเบียนเสร็จสมบูรณ์แล้ว') +
          (logMessageUrl ? `\n\n[📋 ดูข้อมูลที่บันทึกไว้](${logMessageUrl})` : '')
        )
        .setColor(0x57f287)],
    });
    if (interestSelect) {
      const dn = interaction.member?.displayName ?? interaction.user.username;
      await interaction.followUp({
        embeds: [new EmbedBuilder().setTitle(`🎯 ความสนใจ · ${dn}`).setColor(0xf1c40f)],
        components: buildRows(INTEREST_BUTTONS, INTEREST_ROLES, memberRoles, 'interest'),
        flags: MessageFlags.Ephemeral,
      });
      await interaction.followUp({
        embeds: [new EmbedBuilder().setTitle(`🛠️ ความถนัด · ${dn}`).setColor(0x3498db)],
        components: buildRows(SKILL_BUTTONS, SKILL_ROLES, memberRoles, 'skill'),
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  const dn = interaction.member?.displayName ?? interaction.user.username;
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle(`🗺️ เลือกจังหวัด · ${dn}`)
      .setDescription('เลือกภาคที่ต้องการ แล้วกดจังหวัดเพื่อเพิ่ม/ถอด role')
      .setColor(0x5865F2)],
    components: [buildRegionDropdown()],
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

// -------- Send Register Log --------
async function sendRegisterLog(interaction, formData, allProvinces) {
  const { getSetting } = require('../db/settings');
  const {name, nickname, interest, amphoe, referredBy} = formData;

  const embed = new EmbedBuilder()
    .setColor(0x5865f3)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      {name: 'ชื่อ-นามสกุล',     value: name,                                                    inline: true},
      {name: 'ชื่อเล่น',          value: nickname,                                                inline: true},
      {name: 'อำเภอ/จังหวัด (role)',     value: [amphoe, allProvinces.join(', ')].filter(Boolean).join(' · ') || '-', inline: false},
      {name: 'ความสนใจ/ความถนัด', value: interest || '-',               inline: false},
      {name: 'แนะนำโดย',         value: referredBy || '-',             inline: true},
      {name: 'Discord',           value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: false},
    )
    .setTimestamp();

  let logMessageUrl = null;
  try {
    let logChannel = interaction.channel ?? await interaction.client.channels.fetch(interaction.channelId);
    let regConfig = await getSetting(interaction.guildId, 'config_register');
    if (typeof regConfig === 'string') {
      try { regConfig = JSON.parse(regConfig); } catch { regConfig = {}; }
    }
    if (regConfig?.log_channel_id) {
      logChannel = await interaction.guild.channels.fetch(regConfig.log_channel_id)
        .catch((err) => {
          console.error(`❌ Fetch Log Channel (${regConfig.log_channel_id}) Failed:`, err.message);
          return logChannel;
        });
    }

    if (logChannel.isThread()) await logChannel.join();
    const logMsg = await logChannel.send({
      content: `Sent by <@${interaction.user.id}> (${interaction.user.username})`,
      embeds: [embed],
    });

    if (logChannel.id !== interaction.channelId) {
      logMessageUrl = logMsg.url;
    }

    if (interaction.client.refreshSticky) {
      await interaction.client.refreshSticky(logChannel);
    }
  } catch (err) {
    console.error('❌ ส่ง log ไม่ได้:', err);
  }

  return logMessageUrl;
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

  const {formData, interestSelect} = pending;
  const {name, nickname, interest, amphoe, referredBy} = formData;

  await interaction.member.fetch();
  const allProvinces = Object.entries(PROVINCE_ROLES)
    .filter(([, roleId]) => interaction.member.roles.cache.has(roleId))
    .map(([province]) => province);
  await syncMemberRoles(interaction.member);

  const logMessageUrl = await sendRegisterLog(interaction, formData, allProvinces);

  //await interaction.followUp({content: '✅ บันทึกข้อมูลเรียบร้อยแล้วครับ!', flags: MessageFlags.Ephemeral});
  pendingForms.delete(interaction.user.id);
  
  // --- ต่อด้วย interest/skill ---
  const memberRoles = interaction.member.roles;

  await interaction.followUp({
    embeds: [new EmbedBuilder()
      .setTitle('✅ บันทึกข้อมูลเรียบร้อยแล้ว!')
      .setDescription(
        (interestSelect
          ? 'ขั้นตอนสุดท้าย — เลือกความสนใจและความถนัดของคุณได้เลย\n' +
            'กดซ้ำเพื่อถอด • 🔵 = มีอยู่แล้ว • ⬜ = ยังไม่มี'
          : 'ลงทะเบียนเสร็จสมบูรณ์แล้ว') +
        (logMessageUrl ? `\n\n[📋 ดูข้อมูลที่บันทึกไว้](${logMessageUrl})` : '')
      )
      .setColor(0x57f287)],
    flags: MessageFlags.Ephemeral,
  });

  if (interestSelect) {
    const dn = interaction.member?.displayName ?? interaction.user.username;
    await interaction.followUp({
      embeds: [new EmbedBuilder()
        .setTitle(`🎯 ความสนใจ · ${dn}`)
        .setColor(0xf1c40f)],
      components: buildRows(INTEREST_BUTTONS, INTEREST_ROLES, memberRoles, 'interest'),
      flags: MessageFlags.Ephemeral,
    });

    await interaction.followUp({
      embeds: [new EmbedBuilder()
        .setTitle(`🛠️ ความถนัด · ${dn}`)
        .setColor(0x3498db)],
      components: buildRows(SKILL_BUTTONS, SKILL_ROLES, memberRoles, 'skill'),
      flags: MessageFlags.Ephemeral,
    });
  }
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
  const existing = await getMember(interaction.guildId, interaction.user.id);
  await interaction.showModal(buildRegisterModal(existing));
}

module.exports = {
  buildRegisterModal,
  handleModalSubmit,
  handleRegisterConfirm,
  handleDeleteLog,
  handleOpenRegisterModal,
};