// handlers/verifyHandler.js — ยืนยันตัวตนสมาชิกด้วย SMS OTP (Member Onboarding จังหวะ 1)
// flow: ปุ่ม [ยืนยันตัวตน] → modal เบอร์ → match cache_pple_member + ส่ง OTP
//       → ปุ่ม [กรอกรหัส] → modal OTP → ผูก org_members.member_id + users.phone + ติดยศ
// OTP session: dc_user_config key `otp_verify_<guildId>` (guild-scoped ใน key เพราะ PK ไม่มีมิติ guild)
// TTL 5 นาทีผ่าน expires_at ใน value (pattern เดียวกับ passkey nonce)
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags, EmbedBuilder,
} = require('discord.js');
const crypto = require('crypto');
const pool = require('../db/index');
const { getSetting } = require('../db/settings');
const { getUserSetting, setUserSetting, deleteUserSetting } = require('../db/userConfig');
const { upsertMemberFromDiscord, syncMemberRoles } = require('../db/members');
const { sendSms, smsConfigured, normalizePhone } = require('../services/sms');
const { parseSetting } = require('../utils/parseSetting');
const { getOrgGuildIds, orgIdOfGuild } = require('../db/org');

const OTP_TTL_MS         = 5 * 60 * 1000;
const MAX_ATTEMPTS       = 5;
const MAX_SENDS_PER_DAY  = 5;   // กัน spam + enumeration เบอร์สมาชิก + ค่า SMS · แชร์ quota กับ web login — 3 ไม่พอเมื่อ SMS หาย/ขอใหม่
const RESEND_COOLDOWN_MS = 60 * 1000;

const sessionKey = (guildId) => `otp_verify_${guildId}`;

// HMAC ไม่ใช่ sha256 เปล่า — OTP 6 หลักมีแค่ 1M ค่า brute-force ได้ทันทีถ้า DB หลุด
function hashOtp(otp, discordId, guildId) {
  return crypto.createHmac('sha256', process.env.DISCORD_BOT_TOKEN)
    .update(`${discordId}:${guildId}:${otp}`).digest('hex');
}

function maskPhone(p) {
  return p ? `${p.slice(0, 3)}xxx${p.slice(6)}` : '';
}

// ref code 4 ตัว — โชว์คู่กับ SMS ให้ user รู้ว่า SMS ฉบับไหนตรงกับรอบปัจจุบัน
// (ขอรหัสใหม่ได้ → ถือหลายฉบับ แต่ใช้ได้เฉพาะฉบับล่าสุด) · ตัดตัวสับสน I L O 0 1 ออก
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genRef() {
  let s = '';
  for (let i = 0; i < 4; i++) s += REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)];
  return s;
}

// -------- ปุ่ม [ยืนยันตัวตน] → modal กรอกเบอร์ --------
async function handleOpenVerifyModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_verify_phone')
    .setTitle('ยืนยันตัวตนสมาชิก');
  const phoneInput = new TextInputBuilder()
    .setCustomId('field_phone')
    .setLabel('เบอร์มือถือที่ลงทะเบียนไว้กับองค์กร')
    .setPlaceholder('08xxxxxxxx')
    .setStyle(TextInputStyle.Short)
    .setMinLength(9)
    .setMaxLength(20)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(phoneInput));
  await interaction.showModal(modal);
}

// -------- modal เบอร์ submit → match roster + ส่ง OTP --------
async function handleVerifyPhoneSubmit(interaction) {
  // ThaiBulkSMS อาจเกิน 3 วิ — ต้อง defer ก่อน
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId   = interaction.guildId;
  const discordId = interaction.user.id;

  if (!smsConfigured()) {
    return interaction.editReply('❌ ระบบ SMS ยังไม่ได้ตั้งค่า — ติดต่อแอดมิน');
  }

  const phone = normalizePhone(interaction.fields.getTextInputValue('field_phone'));
  if (!/^0[689]\d{8}$/.test(phone || '')) {
    return interaction.editReply('❌ รูปแบบเบอร์ไม่ถูกต้อง — ต้องเป็นเบอร์มือถือไทย 10 หลัก เช่น 0812345678');
  }

  // เครือ guild ในองค์กรเดียวกัน — roster/ผูกชื่อ มองข้าม guild ระดับ org (roster อยู่ guild เดียวในเครือ)
  const orgGuilds = await getOrgGuildIds(guildId);
  const orgId = await orgIdOfGuild(guildId);

  // ผูก + ยืนยันเบอร์ครบแล้วที่ guild ใดในเครือ → จบเลย ไม่เปลือง SMS
  // เช็ค phone_verified_at ด้วย ไม่ใช่แค่ member_id — คนที่ผูกก่อนมีคอลัมน์นี้ (หรือผูกผ่าน docs) ต้อง re-verify ได้
  // ไม่งั้นติดกับดักถาวร: verify ซ้ำโดนเด้ง "ยืนยันแล้ว" แต่ phone_verified_at ไม่เคยถูกเขียน → login เว็บไม่ได้
  const { rows: meRows } = await pool.query(
    `SELECT 1 FROM org_members om
       JOIN users u ON u.id = om.user_id
      WHERE om.guild_id = ANY($1) AND u.discord_id = $2
        AND om.member_id IS NOT NULL AND u.phone_verified_at IS NOT NULL
      LIMIT 1`,
    [orgGuilds, discordId]
  );
  if (meRows.length) {
    return interaction.editReply('✅ บัญชีของคุณยืนยันตัวตนไว้แล้ว');
  }

  // quota รายวัน + cooldown ระหว่างส่ง
  const today = new Date().toISOString().slice(0, 10);
  const quota = (await getUserSetting(discordId, 'otp_quota')) || {};
  const sentToday = quota.day === today ? (quota.count || 0) : 0;
  if (sentToday >= MAX_SENDS_PER_DAY) {
    return interaction.editReply(`❌ ขอรหัสครบ ${MAX_SENDS_PER_DAY} ครั้งของวันนี้แล้ว — ลองใหม่พรุ่งนี้ หรือติดต่อแอดมิน`);
  }
  const prev = await getUserSetting(discordId, sessionKey(guildId));
  if (prev?.sent_at && Date.now() - prev.sent_at < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - prev.sent_at)) / 1000);
    const refNote = prev.ref ? ` (รหัสอ้างอิง **${prev.ref}**)` : '';
    return interaction.editReply(`⏳ เพิ่งส่งรหัสไปแล้ว${refNote} — รออีก ${wait} วินาที แล้วกดปุ่ม "กรอกรหัส OTP" จากข้อความก่อนหน้า`);
  }

  // match roster — เทียบเฉพาะตัวเลข รองรับทั้งเก็บแบบ 0xxx และ 66xxx · ตัดแถวที่ถูก claim แล้วระดับ org
  // roster (cache_pple_member) เป็น org-scope แล้ว (calling org migration 2026-07-19) → match ด้วย org_id
  // เลิกใช้ roster_guild_id: "guild เจ้าของรายชื่อ" ไม่มีความหมายอีกต่อไป — เลขสมาชิกเป็นข้อเท็จจริงระดับ org
  const phone66 = '66' + phone.slice(1);
  const { rows } = await pool.query(
    `SELECT n.source_id
       FROM cache_pple_member n
      WHERE n.org_id = $1
        AND regexp_replace(COALESCE(n.mobile_number, ''), '\\D', '', 'g') IN ($2, $3)
        AND NOT EXISTS (
          SELECT 1 FROM org_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.org_id = $1 AND m.member_id = n.source_id
             AND u.discord_id <> $4
        )`,
    [orgId, phone, phone66, discordId]
  );
  if (rows.length === 0) {
    const { rows: claimed } = await pool.query(
      `SELECT 1 FROM cache_pple_member n
         JOIN org_members m ON m.org_id = $1 AND m.member_id = n.source_id
         JOIN users u ON u.id = m.user_id
        WHERE n.org_id = $1
          AND regexp_replace(COALESCE(n.mobile_number, ''), '\\D', '', 'g') IN ($2, $3)
          AND u.discord_id <> $4
        LIMIT 1`,
      [orgId, phone, phone66, discordId]
    );
    if (claimed.length) {
      return interaction.editReply('❌ เบอร์นี้ถูกผูกกับบัญชี Discord อื่นแล้ว — ติดต่อแอดมินหากคิดว่าไม่ถูกต้อง');
    }
    return interaction.editReply('❌ ไม่พบเบอร์นี้ในทะเบียนสมาชิก — ตรวจสอบเบอร์อีกครั้ง หรือติดต่อแอดมิน');
  }
  if (rows.length > 1) {
    return interaction.editReply('❌ เบอร์นี้ตรงกับทะเบียนมากกว่า 1 รายชื่อ — ติดต่อแอดมินเพื่อยืนยันด้วยตนเอง');
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const ref = genRef();
  const res = await sendSms({
    msisdn: phone,
    message: `รหัสยืนยันสมาชิก: ${otp} (Ref: ${ref}) ใช้ได้ 5 นาที`,
  }).catch(err => ({ error: err.message }));
  if (res?.error || res?.bad_phone_number_list?.length) {
    console.error('[verify] SMS ส่งไม่สำเร็จ:', JSON.stringify(res));
    return interaction.editReply('❌ ส่ง SMS ไม่สำเร็จ — ลองใหม่อีกครั้ง หรือติดต่อแอดมิน');
  }

  await setUserSetting(discordId, sessionKey(guildId), {
    phone,
    otp_hash: hashOtp(otp, discordId, guildId),
    ref,
    source_id: rows[0].source_id,
    org_id: orgId,
    attempts: 0,
    sent_at: Date.now(),
    expires_at: Date.now() + OTP_TTL_MS,
  });
  await setUserSetting(discordId, 'otp_quota', { day: today, count: sentToday + 1 });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_open_verify_otp')
      .setLabel('🔑 กรอกรหัส OTP')
      .setStyle(ButtonStyle.Success)
  );
  return interaction.editReply({
    content: `📱 ส่งรหัส 6 หลักไปที่ ${maskPhone(phone)} แล้ว · รหัสอ้างอิง **${ref}** (ต้องตรงกับใน SMS)\nได้รับแล้วกดปุ่มด้านล่างเพื่อกรอกรหัส — หมดอายุใน 5 นาที`,
    components: [row],
  });
}

// -------- ปุ่ม [กรอกรหัส OTP] → modal OTP --------
async function handleOpenOtpModal(interaction) {
  const session = await getUserSetting(interaction.user.id, sessionKey(interaction.guildId));
  if (!session || Date.now() > session.expires_at) {
    return interaction.reply({
      content: '❌ รหัสหมดอายุแล้ว — กดปุ่ม "ยืนยันตัวตนสมาชิก" เพื่อขอรหัสใหม่',
      flags: MessageFlags.Ephemeral,
    });
  }
  const modal = new ModalBuilder()
    .setCustomId('modal_verify_otp')
    .setTitle('กรอกรหัส OTP');
  const otpInput = new TextInputBuilder()
    .setCustomId('field_otp')
    .setLabel(`รหัส 6 หลักที่ส่งไปที่ ${maskPhone(session.phone)}`)
    .setPlaceholder('123456')
    .setStyle(TextInputStyle.Short)
    .setMinLength(6)
    .setMaxLength(6)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(otpInput));
  await interaction.showModal(modal);
}

// -------- modal OTP submit → verify + ผูก binding + ติดยศ --------
async function handleVerifyOtpSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId   = interaction.guildId;
  const discordId = interaction.user.id;
  const key       = sessionKey(guildId);

  const session = await getUserSetting(discordId, key);
  if (!session || Date.now() > session.expires_at) {
    return interaction.editReply('❌ รหัสหมดอายุแล้ว — กดปุ่ม "ยืนยันตัวตนสมาชิก" เพื่อขอรหัสใหม่');
  }

  const otp = interaction.fields.getTextInputValue('field_otp').trim();
  if (hashOtp(otp, discordId, guildId) !== session.otp_hash) {
    session.attempts = (session.attempts || 0) + 1;
    if (session.attempts >= MAX_ATTEMPTS) {
      await deleteUserSetting(discordId, key);
      return interaction.editReply('❌ กรอกผิดเกินจำนวนครั้งที่กำหนด — กดปุ่ม "ยืนยันตัวตนสมาชิก" เพื่อขอรหัสใหม่');
    }
    await setUserSetting(discordId, key, session);
    return interaction.editReply(`❌ รหัสไม่ถูกต้อง (เหลือ ${MAX_ATTEMPTS - session.attempts} ครั้ง) — กดปุ่ม "กรอกรหัส OTP" เพื่อลองใหม่`);
  }

  // เลขสมาชิก = ข้อเท็จจริงระดับ org (roster เป็น org-scope) → เขียนลง org_members ทุกแถวของคนนี้ใน org นั้น
  // (คนเดียวอยู่หลาย guild ในเครือ = สมาชิกเลขเดียวกัน) · trigger uq_om_org_member กันคนอื่น claim เลขซ้ำ (23505)
  // identity split: member_id → org_members (per-guild rows), phone/phone_verified_at → users (identity)
  const orgId = session.org_id;
  try {
    let { rowCount } = await pool.query(
      `UPDATE org_members om SET member_id = $1, roles_assigned_at = NOW()
         FROM users u
        WHERE u.id = om.user_id AND om.org_id = $2 AND u.discord_id = $3`,
      [session.source_id, orgId, discordId]
    );
    if (rowCount === 0) {
      // ยังไม่มีแถวใน org นี้เลย (sync พลาด) → สร้างจาก guild ที่กดปุ่มก่อน แล้วเขียนซ้ำ
      await upsertMemberFromDiscord(interaction.member);
      ({ rowCount } = await pool.query(
        `UPDATE org_members om SET member_id = $1, roles_assigned_at = NOW()
           FROM users u
          WHERE u.id = om.user_id AND om.org_id = $2 AND u.discord_id = $3`,
        [session.source_id, orgId, discordId]
      ));
    }
    if (rowCount === 0) throw new Error('org_members row not found after upsert');

    await pool.query(
      'UPDATE users SET phone = $1, phone_verified_at = NOW() WHERE discord_id = $2',
      [session.phone, discordId]
    );
  } catch (err) {
    if (err.code === '23505') {
      await deleteUserSetting(discordId, key);
      return interaction.editReply('❌ รายชื่อนี้เพิ่งถูกผูกกับบัญชีอื่น — ติดต่อแอดมิน');
    }
    console.error('[verify] bind ล้มเหลว:', err);
    return interaction.editReply('❌ เกิดข้อผิดพลาดระหว่างผูกบัญชี — ลองใหม่ หรือติดต่อแอดมิน');
  }

  await deleteUserSetting(discordId, key);

  // ติดยศ (member_role เดียวกับ register panel) — fail ต้องบอก user เพราะยศคือผลลัพธ์หลักของ flow นี้
  const regConfig = parseSetting(await getSetting(guildId, 'config_register'));
  let roleNote = '';
  if (regConfig?.member_role_id) {
    const ok = await interaction.member.roles.add(regConfig.member_role_id)
      .then(() => true)
      .catch(err => {
        console.error(`[verify] ติดยศ (${regConfig.member_role_id}) ไม่ได้:`, err.message);
        return false;
      });
    if (ok) {
      roleNote = `\nได้รับยศ <@&${regConfig.member_role_id}> เรียบร้อย`;
      await interaction.member.fetch();
      await syncMemberRoles(interaction.member).catch(() => {});
    } else {
      roleNote = '\n⚠️ ติดยศอัตโนมัติไม่สำเร็จ — แจ้งแอดมินให้ติดยศให้';
    }
  }

  return interaction.editReply({
    embeds: [new EmbedBuilder()
      .setTitle('🎉 ยืนยันตัวตนสำเร็จ')
      .setDescription(`ระบบผูกบัญชี Discord ของคุณกับทะเบียนสมาชิกเรียบร้อยแล้ว${roleNote}`)
      .setColor(0x57f287)],
  });
}

module.exports = {
  handleOpenVerifyModal,
  handleVerifyPhoneSubmit,
  handleOpenOtpModal,
  handleVerifyOtpSubmit,
};
