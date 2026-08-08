// handlers/emailBindHandler.js — ผูกอีเมลเข้ากับบัญชี Discord ด้วย OTP ทางอีเมล
//
// ทำไมต้องมี: users แถวเก่าฝั่ง Discord มี email = NULL เกือบทั้งหมด (prod 6,679/6,685)
// พอคนเดิมไป login เว็บด้วย Google/อีเมล ระบบหาอีเมลนั้นไม่เจอ → สร้างบัญชีใหม่ = แตกเป็น 2 ใบ ยศหาย
// panel นี้ให้เขากรอกอีเมลเองในดิสคอร์ด ประกาศครั้งเดียวถึงทุกคน ไม่ต้องไล่ทำทีละคน
//
// flow: ปุ่ม [ผูกอีเมล] → modal กรอกอีเมล → ส่ง OTP 6 หลักไปที่เมล
//       → ปุ่ม [กรอกรหัส] → modal OTP → UPDATE users.email (หรือ merge ถ้าอีเมลนั้นมีเจ้าของแล้ว)
//
// ยืมโครงจาก verifyHandler.js (SMS OTP) ทั้งหมด — ต่างกันแค่ช่องทางส่งและปลายทางที่เขียน
// session: dc_user_config key `otp_email` · quota แยกจาก `otp_quota` ของ SMS (อีเมลไม่มีค่าส่ง โควตาสูงกว่าได้)
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags,
} = require('discord.js');
const crypto = require('crypto');
const pool = require('../db/index');
const { getOtpState, setOtpState, deleteOtpState } = require('../db/otpSession');
const { sendEmail, emailConfigured, normalizeEmail, isValidEmail } = require('../services/email');
const { getT } = require('../services/i18n');

const OTP_TTL_MS         = 10 * 60 * 1000;  // อีเมลถึงช้ากว่า SMS (spam folder/หน่วง) → ให้เวลามากกว่า
const MAX_ATTEMPTS       = 5;
const MAX_SENDS_PER_DAY  = 10;
const RESEND_COOLDOWN_MS = 60 * 1000;
const SESSION_KEY = 'otp_email';
const QUOTA_KEY   = 'otp_email_quota';

// HMAC ไม่ใช่ sha256 เปล่า — OTP 6 หลักมีแค่ 1M ค่า ถ้า DB หลุดจะ brute-force ได้ทันที
function hashOtp(otp, discordId) {
  return crypto.createHmac('sha256', process.env.DISCORD_BOT_TOKEN)
    .update(`${discordId}:email:${otp}`).digest('hex');
}

function maskEmail(e) {
  const [u, d] = String(e || '').split('@');
  if (!d) return '';
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

// -------- ปุ่ม [ผูกอีเมล] → modal กรอกอีเมล --------
async function handleOpenEmailModal(interaction) {
  const t = await getT(interaction.guildId);
  const modal = new ModalBuilder()
    .setCustomId('modal_bind_email')
    .setTitle(t('emailBind.modalTitle'));
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('field_email')
      .setLabel(t('emailBind.emailLabel'))
      .setPlaceholder('you@example.com')
      .setStyle(TextInputStyle.Short)
      .setMinLength(5)
      .setMaxLength(255)
      .setRequired(true)
  ));
  await interaction.showModal(modal);
}

// -------- modal อีเมล submit → ส่ง OTP --------
async function handleEmailSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const t = await getT(interaction.guildId);
  const discordId = interaction.user.id;

  if (!emailConfigured()) return interaction.editReply(t('emailBind.notConfigured'));

  const email = normalizeEmail(interaction.fields.getTextInputValue('field_email'));
  if (!isValidEmail(email)) return interaction.editReply(t('emailBind.badEmail'));

  // อีเมลนี้เป็นของ Discord "อีกคน" อยู่แล้ว → ไม่ใช่เคสแตกร่าง แต่คือกรอกอีเมลคนอื่น ต้องกัน
  // (ถ้าเจ้าของเป็นบัญชีที่ไม่มี discord_id = เคสแตกร่างของเขาเอง ปล่อยผ่านไปรวมตอนกรอก OTP)
  const { rows: owner } = await pool.query(
    'SELECT id, discord_id FROM users WHERE email = $1', [email]
  );
  if (owner[0]?.discord_id && owner[0].discord_id !== discordId) {
    return interaction.editReply(t('emailBind.takenByOther'));
  }

  const today = new Date().toISOString().slice(0, 10);
  const quota = (await getOtpState(discordId, QUOTA_KEY)) || {};
  const sentToday = quota.day === today ? (quota.count || 0) : 0;
  if (sentToday >= MAX_SENDS_PER_DAY) return interaction.editReply(t('emailBind.quotaExceeded'));

  const prev = await getOtpState(discordId, SESSION_KEY);
  if (prev?.sent_at && Date.now() - prev.sent_at < RESEND_COOLDOWN_MS) {
    return interaction.editReply(t('emailBind.cooldown'));
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const res = await sendEmail({
    to: email,
    subject: t('emailBind.mailSubject'),
    text: t('emailBind.mailText', { otp }),
    html: t('emailBind.mailHtml', { otp }),
  });
  if (!res.ok) return interaction.editReply(t('emailBind.sendFailed'));

  await setOtpState(discordId, SESSION_KEY, {
    email,
    otp_hash: hashOtp(otp, discordId),
    attempts: 0,
    sent_at: Date.now(),
    expires_at: Date.now() + OTP_TTL_MS,
  });
  await setOtpState(discordId, QUOTA_KEY, { day: today, count: sentToday + 1 });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_open_email_otp')
      .setLabel(t('emailBind.enterCodeButton'))
      .setStyle(ButtonStyle.Primary)
  );
  return interaction.editReply({
    content: t('emailBind.sent', { email: maskEmail(email) }),
    components: [row],
  });
}

// -------- ปุ่ม [กรอกรหัส] → modal OTP --------
async function handleOpenOtpModal(interaction) {
  const t = await getT(interaction.guildId);
  // timestamp ใน customId — Discord cache modal ตาม customId ถ้าซ้ำจะได้ของเก่า
  const modal = new ModalBuilder()
    .setCustomId(`modal_bind_email_otp:${Date.now()}`)
    .setTitle(t('emailBind.otpModalTitle'));
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('field_otp')
      .setLabel(t('emailBind.otpLabel'))
      .setPlaceholder('123456')
      .setStyle(TextInputStyle.Short)
      .setMinLength(6)
      .setMaxLength(6)
      .setRequired(true)
  ));
  await interaction.showModal(modal);
}

// -------- modal OTP submit → เขียนอีเมลลง users (หรือยุบรวมบัญชีที่แตกร่าง) --------
async function handleOtpSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const t = await getT(interaction.guildId);
  const discordId = interaction.user.id;

  const s = await getOtpState(discordId, SESSION_KEY);
  if (!s) return interaction.editReply(t('emailBind.noSession'));
  if (Date.now() > s.expires_at) {
    await deleteOtpState(discordId, SESSION_KEY);
    return interaction.editReply(t('emailBind.expired'));
  }

  // นับ attempt ก่อนเทียบ hash — กัน brute force
  const attempts = (s.attempts || 0) + 1;
  if (attempts > MAX_ATTEMPTS) {
    await deleteOtpState(discordId, SESSION_KEY);
    return interaction.editReply(t('emailBind.tooManyAttempts'));
  }
  await setOtpState(discordId, SESSION_KEY, { ...s, attempts });

  const otp = interaction.fields.getTextInputValue('field_otp').trim();
  if (hashOtp(otp, discordId) !== s.otp_hash) {
    return interaction.editReply(t('emailBind.wrongCode', { left: MAX_ATTEMPTS - attempts }));
  }

  await deleteOtpState(discordId, SESSION_KEY);

  try {
    const merged = await bindEmail(discordId, s.email, interaction.user.username);
    return interaction.editReply(
      merged ? t('emailBind.successMerged', { email: s.email })
             : t('emailBind.success',       { email: s.email })
    );
  } catch (err) {
    console.error('[emailBind] ผูกอีเมลไม่สำเร็จ', err.message);
    return interaction.editReply(t('emailBind.saveFailed'));
  }
}

/**
 * เขียนอีเมลลงแถว users ของ discord คนนี้
 * ถ้าอีเมลนั้นมีเจ้าของอยู่แล้วและเจ้าของไม่มี discord = บัญชีที่เขาเผลอสร้างตอน login เว็บ → ยุบรวมเข้ามา
 * (ตอนนี้เขาพิสูจน์ครบสองฝั่งแล้ว: กดปุ่มในดิสคอร์ด = ตัวตน Discord · ใส่ OTP = เจ้าของอีเมล)
 * คืน true ถ้ามีการรวมบัญชีเกิดขึ้น
 */
async function bindEmail(discordId, email, username) {
  const { rows: mine } = await pool.query('SELECT id FROM users WHERE discord_id = $1', [discordId]);
  let myId = mine[0]?.id ?? null;
  if (!myId) {
    myId = (await pool.query(
      'INSERT INTO users (discord_id, username) VALUES ($1, $2) RETURNING id', [discordId, username || null]
    )).rows[0].id;
  }

  const { rows: owner } = await pool.query(
    'SELECT id, discord_id FROM users WHERE email = $1', [email]
  );
  if (owner[0] && owner[0].id !== myId) {
    if (owner[0].discord_id) throw new Error('email_taken_by_other_discord');
    // web/db/userMerge.js เป็น ESM — บอทเป็น CJS จึงต้อง dynamic import (ไฟล์นั้น import pool แบบ relative แล้ว)
    // หมายเหตุ: ทำให้ process บอทเปิด pg pool ตัวที่สอง (ของฝั่ง web) — ไม่กระทบความถูกต้อง
    // เพราะ merge ทั้งก้อนอยู่ใน transaction เดียวของ pool นั้นเอง แค่รู้ไว้ตอนดูจำนวน connection
    const { mergeUsers } = await import('../web/db/userMerge.js');
    await mergeUsers(myId, owner[0].id, 'bind_email_bot');
    return true;
  }

  await pool.query(
    'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [email, myId]
  );
  return false;
}

// bindEmail export ไว้เทสต์ตรงๆ (ตัวตัดสินใจอยู่ที่นี่ ไม่ใช่ที่ชั้น interaction)
module.exports = { handleOpenEmailModal, handleEmailSubmit, handleOpenOtpModal, handleOtpSubmit, bindEmail };
