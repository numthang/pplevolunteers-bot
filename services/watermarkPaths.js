// services/watermarkPaths.js — โฟลเดอร์ลายน้ำฝั่งบอท (ตัวแปลง guild→org / discord→user ที่ "ขอบ")
//
// ลายน้ำเลิกผูกกับ guild แล้ว 2026-08-10 — มันเป็นอัตลักษณ์ของแบรนด์ = กลุ่มโซเชียลของ org
//   assets/watermark/org_<org_id>/<group>/*   ← ลายน้ำของกลุ่ม
//   assets/watermark/user_<users.id>/*        ← ลายน้ำส่วนตัว
//
// บอทรู้จักแต่ guild id กับ Discord user id → **แปลงที่นี่ที่เดียว** แล้วส่ง org/user ต่อเข้าไป
// ห้าม handler เอา guild id ไปต่อ path เองอีก (คู่แฝดฝั่งเว็บ: web/lib/watermarks.js)
const fs = require('fs');
const path = require('path');
const pool = require('../db/index');

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'watermark');
const IMG_RE = /\.(png|jpg|jpeg|webp)$/i;
const TTL_MS = 5 * 60 * 1000;   // map เปลี่ยนน้อยมาก แต่ไม่ cache ถาวรเผื่อย้าย guild ข้าม org

const cache = new Map();  // 'g:<id>' | 'u:<id>' → { value, at }

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await loader();
  cache.set(key, { value, at: Date.now() });
  return value;
}

/** guild → org_id · null ถ้า guild ยังไม่ได้ map เข้า org */
async function orgIdOf(guildId) {
  if (!guildId) return null;
  return cached(`g:${guildId}`, async () => {
    const { rows } = await pool.query(`SELECT org_id FROM dc_guilds WHERE guild_id = $1`, [guildId]);
    return rows[0]?.org_id ?? null;
  });
}

/** Discord user id → users.id · null ถ้าคนนี้ยังไม่มีแถวใน users */
async function userIdOf(discordId) {
  if (!discordId) return null;
  return cached(`u:${discordId}`, async () => {
    const { rows } = await pool.query(`SELECT id FROM users WHERE discord_id = $1`, [discordId]);
    return rows[0]?.id ?? null;
  });
}

const orgDir      = orgId => (orgId ? path.join(ASSETS_DIR, `org_${orgId}`) : null);
const groupDir    = (orgId, group) => (orgId && group ? path.join(ASSETS_DIR, `org_${orgId}`, group) : null);
const personalDir = userId => (userId ? path.join(ASSETS_DIR, `user_${userId}`) : null);

/** ไฟล์รูปในโฟลเดอร์นี้ (ชั้นเดียว) */
function listImgs(dir) {
  if (!dir) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile() && IMG_RE.test(e.name)).map(e => e.name).sort();
  } catch { return []; }
}

/** ไฟล์รูปในโฟลเดอร์นี้ + ลงโฟลเดอร์ย่อย 1 ชั้น (คืนเป็น '<กลุ่ม>/<ไฟล์>') — ใช้ตอนยังไม่ได้เลือกกลุ่ม */
function listImgsRec(dir) {
  if (!dir) return [];
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isFile() && IMG_RE.test(e.name)) out.push(e.name);
    else if (e.isDirectory()) for (const f of listImgs(path.join(dir, e.name))) out.push(`${e.name}/${f}`);
  }
  return out.sort();
}

module.exports = { ASSETS_DIR, orgIdOf, userIdOf, orgDir, groupDir, personalDir, listImgs, listImgsRec };
