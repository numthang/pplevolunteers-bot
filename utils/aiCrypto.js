// utils/aiCrypto.js — เข้ารหัส API key ขององค์กรก่อนเก็บลง DB (zero-dep, ใช้ทั้ง bot + web)
//
// ทำไมต้องเข้ารหัสทั้งที่ meta_app_secret เก็บดิบ: API key ของ Anthropic/Gemini **ยิงเงินได้
// ด้วยตัวมันเองทันที** ส่วน app_secret ต้องมี OAuth flow + app_id ประกอบถึงจะใช้ได้ — คนละชั้นความเสี่ยง
//
// master key มาจาก env `AI_KEY_SECRET` (ข้อความอะไรก็ได้ ยาวๆ) — ไม่ตั้ง = เข้ารหัส/ถอดไม่ได้
// และระบบจะตกไปใช้ key กลางจาก .env เหมือนเดิม ไม่พัง
//
// ⚠️ เปลี่ยน AI_KEY_SECRET = ถอดของเดิมไม่ออกทั้งหมด ต้องให้ทุก org กรอก key ใหม่

const crypto = require('crypto');

const VERSION = 'v1';

/** master key → 32 bytes (scrypt ช้าพอที่ brute-force จาก DB dump ไม่คุ้ม) */
function masterKey() {
  const secret = process.env.AI_KEY_SECRET;
  if (!secret) return null;
  return crypto.scryptSync(secret, 'pple-ai-creds', 32);
}

function hasMasterKey() {
  return Boolean(process.env.AI_KEY_SECRET);
}

/** plaintext → 'v1:iv:tag:ciphertext' (base64 ทุกท่อน) */
function encryptSecret(plain) {
  const key = masterKey();
  if (!key) throw new Error('ยังไม่ได้ตั้ง AI_KEY_SECRET ใน .env — เก็บ API key ไม่ได้');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

/**
 * 'v1:...' → plaintext · คืน null ถ้าถอดไม่ได้ (master key เปลี่ยน / ค่าเพี้ยน / ยังไม่ตั้ง secret)
 * **ห้ามโยน error** — เส้นเรียกต้องตกไปใช้ key กลางได้ ไม่ใช่ทำ AI ตายทั้งระบบ
 */
function decryptSecret(blob) {
  const key = masterKey();
  if (!key || typeof blob !== 'string') return null;

  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** 'sk-ant-api03-xxxx…' → 'sk-ant…4f2a' — ค่าที่ API ส่งกลับหน้าจอได้ */
function maskKey(plain) {
  const s = String(plain || '');
  if (s.length < 12) return '••••';
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

module.exports = { encryptSecret, decryptSecret, maskKey, hasMasterKey };
