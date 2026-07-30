// utils/postsStorage.js — ที่เก็บไฟล์สื่อของ posts ฝั่งบอท (CJS)
//
// **จุดเดียวในฝั่งบอทที่แตะไฟล์จริง** — วันที่ย้ายไป object storage (R2/S3) หรือกรุ Drive
// ให้แก้ไฟล์นี้ไฟล์เดียว ไม่ต้องไล่ทุก call site (user เคาะ 2026-07-30: ยังไม่ต่อ R2 ใช้ดิสก์ไปก่อน)
//
// path ที่เก็บใน DB = **relative จาก repo root** (`storage/posts/<uuid>.jpg`) เพราะบอทกับเว็บ
// คนละโปรเซส คนละ cwd แต่อ่านดิสก์ก้อนเดียวกัน
// ⚠️ ฝาแฝดฝั่งเว็บคือ `web/lib/postsStorage.js` (ESM · ใช้ตอนอัปโหลดผ่านหน้าเว็บ) —
//    ตัวนั้นคิด REPO_ROOT จาก cwd ส่วนตัวนี้คิดจาก __dirname (cwd อะไรก็ถูก)
const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');

const REPO_ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join('storage', 'posts');

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

/** absolute path จาก path ที่เก็บใน DB — กัน path traversal ก่อนแตะดิสก์เสมอ */
function absPath(relPath) {
  const abs = path.resolve(REPO_ROOT, relPath);
  const base = path.resolve(REPO_ROOT, 'storage');
  if (!abs.startsWith(base + path.sep)) throw new Error(`postsStorage: path อยู่นอก storage/ — ${relPath}`);
  return abs;
}

/** เดา ext จาก URL/ชื่อไฟล์ (Discord CDN มีนามสกุลใน path เสมอ) */
function extOfUrl(url) {
  const m = String(url || '').match(/\.(png|jpe?g|webp|gif|mp4|mov)(?:[?#]|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : null;
}

function extOfPath(p) {
  return String(p || '').split('.').pop()?.toLowerCase() || 'jpg';
}

/** เขียน buffer ลงดิสก์ คืน path ที่จะเก็บใน DB */
async function saveBuffer(buffer, ext = 'jpg') {
  await fs.mkdir(path.resolve(REPO_ROOT, POSTS_DIR), { recursive: true });
  const relPath = path.join(POSTS_DIR, `${randomUUID()}.${ext}`);
  await fs.writeFile(absPath(relPath), buffer);
  return relPath;
}

/**
 * โหลดไฟล์จาก URL ลงดิสก์ (ตะกร้าดิสฯ: หย่อนแล้วโหลดตาม background)
 * คลิปทีมสื่อ 10–50 MB → ไม่ตั้งเพดานขนาด แต่กัน hang ด้วย timeout
 */
async function downloadToDisk(url, { timeoutMs = 120000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const mime = res.headers.get('content-type')?.split(';')[0].trim();
    const ext = EXT_BY_MIME[mime] || extOfUrl(url) || 'jpg';
    return await saveBuffer(Buffer.from(await res.arrayBuffer()), ext);
  } finally {
    clearTimeout(t);
  }
}

async function readFile(relPath) {
  return fs.readFile(absPath(relPath));
}

/** ลบไฟล์ — ไม่มีไฟล์ก็ถือว่าสำเร็จ (แถวใน DB เป็นเจ้าของความจริง ไม่ใช่ดิสก์) */
async function deleteFile(relPath) {
  if (!relPath) return false;
  try {
    await fs.unlink(absPath(relPath));
    return true;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[postsStorage] ลบไฟล์ไม่สำเร็จ:', err.message);
    return false;
  }
}

module.exports = { REPO_ROOT, POSTS_DIR, absPath, saveBuffer, downloadToDisk, readFile, deleteFile, extOfPath, extOfUrl };
