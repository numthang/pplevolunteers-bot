const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { fetchBuffer } = require('../utils/watermarkImage');
const { convertVideoIfNeeded } = require('../utils/videoUtils');
const { splitLinks } = require('./linkToComment');

const TEMP_DIR = process.env.META_TEMP_DIR
  || path.join(__dirname, '..', 'web', 'public', 'media-temp');
const TEMP_URL = process.env.META_TEMP_URL
  || `${process.env.WEB_BASE_URL || ''}/api/media-temp`;

const pool = require('../db/index');
const { orgIdOfGuild } = require('../db/org');

const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// app creds อยู่ที่ org_config (ราย org) ตั้งแต่ 2026-07-29 — org ที่ไม่มี Discord ก็ Connect เองได้
// อ่าน org ก่อน → เติมเฉพาะคีย์ที่ขาดจาก dc_guild_config (fallback ช่วงเปลี่ยนผ่าน · จะลบรอบหน้า)
// orgId ส่งตรงได้เมื่อไม่มี guild เลย · ส่งแค่ guildId = พฤติกรรมเดิมเป๊ะ (แปลง guild→org ให้เอง)
// ⚠️ org_config.value = text (ค่าดิบ) · dc_guild_config.value = json (pg parse ให้เป็น string แล้ว)
// คู่แฝดฝั่งเว็บ: web/lib/socialAppCreds.js getMetaApp()
async function getGuildMetaApp(guildId, orgId = null) {
  const oid = orgId ?? (guildId ? await orgIdOfGuild(guildId) : null);
  const m = {};

  if (oid) {
    const { rows } = await pool.query(
      `SELECT key, value FROM org_config WHERE org_id = $1 AND key IN ('meta_app_id', 'meta_app_secret')`,
      [oid]
    );
    for (const r of rows) if (r.value) m[r.key] = r.value;
  }

  if (guildId && (!m.meta_app_id || !m.meta_app_secret)) {
    const { rows } = await pool.query(
      `SELECT "key", value FROM dc_guild_config WHERE guild_id = $1 AND "key" IN ('meta_app_id', 'meta_app_secret')`,
      [guildId]
    );
    for (const r of rows) if (r.value && !m[r.key]) m[r.key] = r.value;
  }

  if (!m.meta_app_id || !m.meta_app_secret) return null;
  return { app_id: m.meta_app_id, app_secret: m.meta_app_secret };
}

async function refreshUserToken(guildId, rowId, userDiscordId, currentUserToken) {
  const app = await getGuildMetaApp(guildId);
  if (!app) throw new Error(`Token refresh ล้มเหลว: guild ${guildId} ยังไม่ได้ set meta_app_id/secret (org_config ขององค์กร หรือ dc_guild_config)`);

  const res = await httpsGet(
    `/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${app.app_id}&client_secret=${app.app_secret}` +
    `&fb_exchange_token=${encodeURIComponent(currentUserToken)}`
  );
  if (res.error) throw new Error(`Token refresh ล้มเหลว: ${res.error.message} — กรุณา reconnect OAuth ใหม่`);

  const expiresInSec = res.expires_in || 60 * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + expiresInSec * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');

  // ถ้ามี user_discord_id → update ทุก row ของ user คนนั้น (1 user_token ใช้กับหลาย platform)
  // ถ้าไม่มี (rows migrated เดิม) → update เฉพาะ row นั้น
  // ⚠️ `platform IN ('fb','ig')` บังคับเสมอ — token ตัวนี้มาจาก graph.facebook.com (fb_exchange_token)
  //    ใช้กับ Threads ไม่ได้ (คนละ host คนละ grant) · ถ้าไม่กัน วันไหน Threads ย้ายมาเก็บที่ user_token
  //    การ refresh ของ IG จะเขียนทับ Threads token ทิ้งทันที เพราะ user_discord_id เป็นคนเดียวกัน
  if (userDiscordId) {
    await pool.query(
      `UPDATE dc_social_accounts SET user_token = $1, user_token_expires_at = $2
        WHERE user_discord_id = $3 AND user_token IS NOT NULL AND platform IN ('fb','ig')`,
      [res.access_token, expiresAt, userDiscordId]
    );
  } else {
    await pool.query(
      `UPDATE dc_social_accounts SET user_token = $1, user_token_expires_at = $2 WHERE id = $3`,
      [res.access_token, expiresAt, rowId]
    );
  }
  console.log('[refreshUserToken] row:', rowId, 'user:', userDiscordId || '(legacy)', 'expires_at:', expiresAt);
  return res.access_token;
}

/**
 * ต่ออายุ Threads token — **คนละ endpoint กับ FB สิ้นเชิง** (นี่คือเหตุผลที่ Threads ตายเงียบ 3 สัปดาห์)
 *   FB/IG : graph.facebook.com  + grant_type=fb_exchange_token  → เก็บที่ user_token
 *   Threads: graph.threads.net  + grant_type=th_refresh_token   → เก็บที่ access_token
 *
 * เงื่อนไขของ Meta: token ต้องอายุ ≥24 ชม. **และยังไม่หมดอายุ**
 * (ข้อ ≥24 ชม. ผ่านเองอยู่แล้ว เพราะเราต่อเมื่อเหลือ <7 วันจาก 60 วัน = token อายุ ~53 วันแล้ว)
 * เลย 60 วัน = กู้ด้วยโค้ดไม่ได้ ต้องกด Connect Threads ใหม่บนเว็บ
 */
async function refreshThreadsToken(rowId, currentToken) {
  const res = await threadsGet(
    `/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(currentToken)}`
  );
  if (!res.access_token) {
    throw new Error(res.error?.message || res.error_message || 'Threads refresh ไม่สำเร็จ');
  }
  const expiresAt = new Date(Date.now() + (res.expires_in || 60 * 24 * 60 * 60) * 1000);
  await pool.query(
    `UPDATE dc_social_accounts SET access_token = $1, user_token_expires_at = $2 WHERE id = $3`,
    [res.access_token, expiresAt, rowId]
  );
  console.log('[refreshThreadsToken] row:', rowId, 'expires_at:', expiresAt.toISOString());
  return res.access_token;
}

// คืนค่า config ของ platform หนึ่งใน guild หนึ่ง
// userId = Discord user id ของคนที่กำลังโพสต์ (เพื่อ filter private accounts)
// accountId = เลือกบัญชีเจาะจง (posts บนเว็บส่งมา) — ไม่ส่ง = พฤติกรรมเดิมทุกประการ
// ⚠️ ความเป็นเจ้าของบัญชี (org/สิทธิ์) ตรวจที่ชั้น API ตอนสร้างงานในคิว ไม่ใช่ที่นี่
//    ตรงนี้เป็น internal call จาก publishPipeline เท่านั้น
async function getConfig(guildId, platform, userId = null, groupName = null, accountId = null) {
  if (accountId) return getConfigById(accountId, platform, guildId);
  const params = groupName ? [guildId, platform, userId, groupName, userId] : [guildId, platform, userId, userId];
  const groupClause = groupName ? 'AND group_name = $4' : '';
  const orderIdx = groupName ? '$5' : '$4';
  const { rows } = await pool.query(
    `SELECT id, user_discord_id, social_id, access_token, user_token, user_token_expires_at, name, visibility
     FROM dc_social_accounts
     WHERE platform = $2
       AND ((visibility = 'public' AND guild_id = $1)
            OR (visibility = 'private' AND user_discord_id = $3))
       ${groupClause}
     ORDER BY CASE WHEN visibility = 'public' THEN 0 ELSE 1 END,
              CASE WHEN user_discord_id = ${orderIdx} THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    params
  );
  if (!rows.length) return null;
  return finalizeConfig(rows[0], guildId, platform);
}

// ต่อ token ให้พร้อมใช้ (refresh ถ้าใกล้หมดอายุ) แล้วคืนรูปร่างที่ผู้เรียกคาดหวัง
// แยกออกมาเพราะทั้ง getConfig (เลือกอัตโนมัติ) และ getConfigById (posts เลือกเอง) ต้องใช้เหมือนกัน
async function finalizeConfig(r, guildId, platform) {
  let userToken = r.user_token || null;
  let accessToken = r.access_token;
  const msLeft = r.user_token_expires_at
    ? new Date(r.user_token_expires_at).getTime() - Date.now()
    : null;
  const nearExpiry = msLeft !== null && msLeft < REFRESH_THRESHOLD_MS && msLeft > 0;

  if (userToken && nearExpiry) {
    console.log('[getConfig]', guildId, platform, 'user_token expires in', Math.round(msLeft / 86400000), 'days — refreshing');
    try {
      userToken = await refreshUserToken(guildId, r.id, r.user_discord_id, userToken) || userToken;
    } catch (err) {
      console.error('[getConfig] refresh failed:', err.message);
    }
  }

  // Threads เก็บ token ที่ access_token (ไม่ใช่ user_token) → เงื่อนไขข้างบนไม่เคยจับได้เลย
  // นี่คือบั๊กที่ทำให้ token ตายเงียบ (bug-393) — ต้องแยกสาขาตาม platform
  if (platform === 'threads' && accessToken && nearExpiry) {
    console.log('[getConfig]', guildId, 'threads token expires in', Math.round(msLeft / 86400000), 'days — refreshing');
    try {
      accessToken = await refreshThreadsToken(r.id, accessToken) || accessToken;
    } catch (err) {
      console.error('[getConfig] threads refresh failed:', err.message);
    }
  }

  console.log('[getConfig]', guildId, platform, 'name:', r.name, 'visibility:', r.visibility);
  return {
    rowId: r.id,
    name: r.name,
    socialId: r.social_id,
    token: accessToken,
    userToken,
    userDiscordId: r.user_discord_id,
  };
}

// เลือกบัญชีตาม id ตรงๆ — ใช้กับ posts (เว็บเลือกบัญชีเองแล้ว) · platform ต้องตรงกันเสมอ
async function getConfigById(accountId, platform, guildId = null) {
  const { rows } = await pool.query(
    `SELECT id, user_discord_id, social_id, access_token, user_token, user_token_expires_at, name, visibility
     FROM dc_social_accounts WHERE id = $1 AND platform = $2 LIMIT 1`,
    [accountId, platform]
  );
  if (!rows.length) return null;
  return finalizeConfig(rows[0], guildId, platform);
}

// คืน array ของ platforms ที่ user คนนี้สามารถใช้ใน guild นี้
async function getAvailablePlatforms(guildId, userId = null, groupName = null) {
  const params = groupName ? [guildId, userId, groupName] : [guildId, userId];
  const groupClause = groupName ? 'AND group_name = $3' : '';
  const { rows } = await pool.query(
    `SELECT DISTINCT platform FROM dc_social_accounts
     WHERE ((visibility = 'public' AND guild_id = $1)
            OR (visibility = 'private' AND user_discord_id = $2))
       ${groupClause}`,
    params
  );
  return rows.map(r => r.platform);
}

// คืน list ของ group_name (เฉพาะที่ user เห็น) สำหรับ guild นี้
async function getAvailableGroups(guildId, userId = null) {
  const { rows } = await pool.query(
    `SELECT DISTINCT group_name FROM dc_social_accounts
     WHERE group_name IS NOT NULL
       AND ((visibility = 'public' AND guild_id = $1)
            OR (visibility = 'private' AND user_discord_id = $2))
     ORDER BY group_name`,
    [guildId, userId]
  );
  return rows.map(r => r.group_name);
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpsGet(urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: urlPath,
      method: 'GET',
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function waitForIgContainer(id, token, maxWaitMs = 30000, onProgress = null) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await httpsGet(`/v22.0/${id}?fields=status_code,status&access_token=${token}`);
    console.log('[IG container]', id, JSON.stringify(res));
    if (res.status_code === 'FINISHED') return;
    if (res.status_code === 'ERROR') throw new Error(`IG container error`);
    const elapsed = Math.floor((Date.now() - start) / 1000);
    if (onProgress) onProgress(elapsed);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('IG container timeout — รูปใช้เวลา process นานเกิน 30s');
}

function httpsPost(urlPath, body, contentType) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildMultipart(fields, file = null) {
  const boundary = `fb${crypto.randomBytes(8).toString('hex')}`;
  const CRLF = '\r\n';
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
      `${String(value)}${CRLF}`
    ));
  }

  if (file) {
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${file.field}"; filename="${file.name}"${CRLF}` +
      `Content-Type: ${file.mime}${CRLF}${CRLF}`
    ));
    parts.push(file.buffer);
    parts.push(Buffer.from(CRLF));
  }

  parts.push(Buffer.from(`--${boundary}--${CRLF}`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ─── Temp file (สำหรับ Instagram ที่ต้องการ public URL) ───────────────────────

function saveTempFile(buffer, ext) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(TEMP_DIR, name), buffer);
  const cleanup = () => fs.unlink(path.join(TEMP_DIR, name), () => {});
  return { url: `${TEMP_URL}/${name}`, cleanup };
}

// ─── Facebook ─────────────────────────────────────────────────────────────────

async function fbUploadPhoto(pageId, token, buffer, ext, published, caption = '') {
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const { body, contentType } = buildMultipart(
    { published: String(published), message: caption, access_token: token },
    { field: 'source', name: `photo.${ext}`, mime, buffer }
  );
  const res = await httpsPost(`/v22.0/${pageId}/photos`, body, contentType);
  if (res.error) throw new Error(`FB photo upload: ${res.error.message}`);
  return res;
}

async function postToFacebook(guildId, userId, images, caption, scheduleTime = null, groupName = null, accountId = null) {
  const cfg = await getConfig(guildId, 'fb', userId, groupName, accountId);
  if (!cfg) throw new Error('ไม่พบ Facebook config สำหรับ guild นี้');

  const scheduleFields = scheduleTime
    ? { published: 'false', scheduled_publish_time: String(scheduleTime) }
    : {};

  const noButtonCta = JSON.stringify({ type: 'NO_BUTTON' });

  // ย้ายลิงก์ออกจากเนื้อโพสต์ → คนเอา `linkComment` ไปแปะเป็นคอมเมนต์แรกเอง
  // (FB กด reach ของโพสต์ที่พาคนออกนอกแพลตฟอร์ม · บอทคอมเมนต์เองไม่ได้ — ขอ pages_manage_engagement
  //  ไม่ผ่าน ดู .wolf/cerebrum.md 2026-08-11) · ตัวเรียกมีหน้าที่เอา linkComment ไปแสดงให้คนเห็น
  // ⚠️ โพสต์ตั้งเวลาไม่แปลง — ตอน FB ปล่อยโพสต์จริงไม่มีใครอยู่แปะคอมเมนต์ให้
  //    ปล่อยลิงก์คาในเนื้อดีกว่าโพสต์ที่บอก "ใต้โพสต์" แล้วไม่มีอะไรอยู่
  const split = scheduleTime ? null : splitLinks(caption);
  const message = split?.changed ? split.caption : caption;
  const linkComment = split?.changed ? split.comment : null;

  // caption-only post
  if (!images.length) {
    const { body, contentType } = buildMultipart({ message, access_token: cfg.token, call_to_action: noButtonCta, ...scheduleFields });
    const res = await httpsPost(`/v22.0/${cfg.socialId}/feed`, body, contentType);
    if (res.error) throw new Error(`FB feed post: ${res.error.message}`);
    return { ...res, linkComment };
  }

  // upload each photo as unpublished → create feed post (ให้ได้ pageId_postId เสมอ)
  const photoIds = [];
  for (const img of images) {
    const res = await fbUploadPhoto(cfg.socialId, cfg.token, img.buffer, img.ext, false);
    photoIds.push({ media_fbid: res.id });
  }

  const { body, contentType } = buildMultipart({
    message,
    attached_media: JSON.stringify(photoIds),
    access_token: cfg.token,
    call_to_action: noButtonCta,
    ...scheduleFields,
  });
  const res = await httpsPost(`/v22.0/${cfg.socialId}/feed`, body, contentType);
  if (res.error) throw new Error(`FB feed post: ${res.error.message}`);
  return { ...res, linkComment };
}

// ─── Instagram ────────────────────────────────────────────────────────────────

const IG_CAPTION_MAX = 2200; // Instagram hard limit

// IG โพสต์เป็น caption เดียว (ไม่มี reply chain แบบ Threads) → ยาวเกินต้องตัด
function truncateCaption(caption, max = IG_CAPTION_MAX) {
  if (!caption || caption.length <= max) return caption || '';
  const cut = caption.slice(0, max - 1);
  console.warn(`[IG] caption truncated: ${caption.length} → ${max} chars`);
  return cut.trimEnd() + '…';
}

async function igPost(urlPath, fields) {
  const { body, contentType } = buildMultipart(fields);
  const res = await httpsPost(urlPath, body, contentType);
  if (res.error) throw new Error(`IG API: ${res.error.message}`);
  return res;
}

async function _igPostFromUrls(cfg, imageUrls, caption, scheduleTime = null, onProgress = null) {
  if (imageUrls.length > 10) imageUrls = imageUrls.slice(0, 10);
  caption = truncateCaption(caption);
  // IG ใช้ User Token เท่านั้น — Page Token โดน Meta ปิด gate แล้ว
  const igToken = cfg.userToken;
  if (!igToken) throw new Error('ไม่พบ User Token สำหรับ IG — กรุณาเข้าไป reconnect Meta OAuth ใหม่');

  const scheduleFields = scheduleTime
    ? { scheduled_publish_time: String(scheduleTime), published: 'false' }
    : {};

  async function publishAndGetUrl(containerId) {
    const { id: mediaId } = await igPost(`/v22.0/${cfg.socialId}/media_publish`, {
      creation_id: containerId, access_token: igToken,
    });
    const info = await httpsGet(`/v22.0/${mediaId}?fields=permalink,shortcode&access_token=${encodeURIComponent(igToken)}`);
    console.log('[IG permalink raw]', JSON.stringify(info));
    const permalink = info.permalink
      || (info.shortcode ? `https://www.instagram.com/p/${info.shortcode}/` : null);
    return { id: mediaId, permalink };
  }

  const total = imageUrls.length;

  if (total === 1) {
    console.log('[IG create container] igId:', cfg.socialId, 'url:', imageUrls[0]);
    const { id } = await igPost(`/v22.0/${cfg.socialId}/media`, {
      image_url: imageUrls[0], caption, access_token: igToken, ...scheduleFields,
    });
    console.log('[IG container created] id:', id);
    await waitForIgContainer(id, igToken, 30000,
      s => onProgress && onProgress(`📤 Instagram: กำลัง process รูป... (${s}s)`)
    );
    return publishAndGetUrl(id);
  }

  // carousel — children ไม่ใส่ scheduled_publish_time, ใส่แค่ parent
  const childIds = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const { id } = await igPost(`/v22.0/${cfg.socialId}/media`, {
      image_url: imageUrls[i], is_carousel_item: 'true', access_token: igToken,
    });
    await waitForIgContainer(id, igToken, 30000,
      s => onProgress && onProgress(`📤 Instagram: กำลัง process รูป ${i + 1}/${total}... (${s}s)`)
    );
    childIds.push(id);
  }
  const { id: carouselId } = await igPost(`/v22.0/${cfg.socialId}/media`, {
    media_type: 'CAROUSEL', caption,
    children: childIds.join(','),
    access_token: igToken,
    ...scheduleFields,
  });
  await waitForIgContainer(carouselId, igToken, 30000,
    s => onProgress && onProgress(`📤 Instagram: กำลัง publish carousel... (${s}s)`)
  );
  return publishAndGetUrl(carouselId);
}

// บันทึก buffer ลง temp dir แล้วคืน public URLs (ไม่ลบอัตโนมัติ — cleanup รายเดือน)
/**
 * วางไฟล์ลงโฟลเดอร์ temp สาธารณะแล้วคืน URL ที่ Meta ดึงได้
 * (IG/Threads/Reels ไม่รับไฟล์อัปโหลดตรง — ต้องให้ URL แล้วเขามาดึงเอง)
 * ใช้ร่วมกับ publishWorker: สื่อจากเว็บอยู่ใน storage/ ซึ่งไม่มี URL สาธารณะ
 */
function saveMediaToTemp(buffer, ext = 'jpg') {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(TEMP_DIR, name), buffer);
  return `${TEMP_URL}/${name}`;
}

/**
 * ลบไฟล์เก่าในโฟลเดอร์ temp — ไฟล์ที่นี่มีไว้ให้ Meta ดึงตอนโพสต์เท่านั้น ดึงเสร็จก็ไม่ใช้แล้ว
 * เก็บไว้ 24 ชม. เผื่องานตั้งเวลา/ลองใหม่ · ไม่มีตัวลบมาตั้งแต่แรก ไฟล์เลยสะสมไปเรื่อยๆ
 */
function cleanTempMedia(maxAgeMs = 24 * 60 * 60 * 1000) {
  let removed = 0;
  try {
    const cutoff = Date.now() - maxAgeMs;
    for (const name of fs.readdirSync(TEMP_DIR)) {
      const p = path.join(TEMP_DIR, name);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && st.mtimeMs < cutoff) { fs.unlinkSync(p); removed++; }
      } catch { /* ไฟล์หายระหว่างทาง = ไม่ต้องสน */ }
    }
  } catch { /* ยังไม่มีโฟลเดอร์ = ไม่มีอะไรให้ลบ */ }
  if (removed) console.log(`[metaApi] ลบไฟล์ media-temp เก่า ${removed} ไฟล์`);
  return removed;
}

function saveProcessedToTemp(images) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return images.map(img => {
    const name = `${crypto.randomBytes(12).toString('hex')}.${img.ext}`;
    fs.writeFileSync(path.join(TEMP_DIR, name), img.buffer);
    return `${TEMP_URL}/${name}`;
  });
}

// ─── IG aspect ratio ──────────────────────────────────────────────────────────
// IG feed/carousel รับสัดส่วน 4:5 ถึง 1.91:1 เท่านั้น หลุดกรอบ = "IG API: The aspect ratio is not supported"
// ตัวแก้รูปในเว็บครอบอิสระได้ → หลุดกรอบบ่อย · เลือกวิธี "เติมขอบด้วยพื้นหลังเบลอจากรูปเดิม"
// (user เคาะ 2026-08-28) แทนการครอบกลาง เพราะไม่เสียเนื้อภาพ
// ⚠️ carousel: IG บังคับทุกใบสัดส่วนเดียวกันโดยยึดใบแรก แล้วครอบใบที่เหลือทิ้งเอง
//    → ปรับทุกใบให้เท่าใบแรกตั้งแต่ที่นี่ จะได้เห็นเต็มใบทุกใบ
const IG_MIN_RATIO = 4 / 5;
const IG_MAX_RATIO = 1.91;
const IG_MAX_WIDTH = 1440;  // IG ย่อลงเท่านี้อยู่แล้ว — ย่อเองก่อนให้ไฟล์ temp เล็กลง
const IG_RATIO_EPS = 0.005; // ต่างกันไม่ถึง 0.5% ถือว่าตรงแล้ว กันเติมขอบ 1px จากการปัดเศษ

const clampIgRatio = r => Math.min(IG_MAX_RATIO, Math.max(IG_MIN_RATIO, r));

// คืนรูปใหม่ที่สัดส่วน = target · ไม่ต้องแก้ก็คืนตัวเดิม (ไม่ re-encode ทิ้งคุณภาพฟรีๆ)
async function fitImageForIg(img, target) {
  const src = sharp(img.buffer, { autoOrient: true });
  const meta = await src.metadata();
  // metadata() คืนขนาด "ก่อนหมุน" เสมอ (autoOrient ไม่มีผลกับมัน · sharp 0.34) — EXIF 5-8 = รูปตะแคง
  // ต้องสลับ w/h เอง ไม่งั้นรูปแนวนอนที่ถ่ายมาตะแคงจะถูกมองว่าสูงเกินแล้วเติมขอบทิ้งฟรีๆ
  const width = meta.orientation >= 5 ? meta.height : meta.width;
  const height = meta.orientation >= 5 ? meta.width : meta.height;
  if (!width || !height) return img;

  const ratio = width / height;
  if (Math.abs(ratio - target) / target <= IG_RATIO_EPS) return img;

  const cw = ratio < target ? Math.round(height * target) : width;
  const ch = ratio < target ? height : Math.round(width / target);

  // ⚠️ ห้ามต่อ .resize() ท้าย composite — sharp ทำ resize ก่อน composite เสมอ
  //    ตัวรูปจะใหญ่กว่าผืนที่ย่อแล้ว → "Image to composite must have same dimensions or smaller"
  //    จึงย่อผืนกับตัวรูปให้พอดีก่อน แล้วค่อยวางทับ (เข้ารหัส jpeg รอบเดียว)
  const scale = Math.min(1, IG_MAX_WIDTH / cw);
  const fw = Math.round(cw * scale), fh = Math.round(ch * scale);

  const base = await src.toBuffer(); // auto-orient แล้ว ใช้ซ้ำทั้งพื้นหลังและตัวรูป
  const inner = scale < 1 ? await sharp(base).resize(fw, fh, { fit: 'inside' }).toBuffer() : base;
  const bg = await sharp(base)
    .resize(fw, fh, { fit: 'cover' })
    .blur(Math.max(12, Math.round(Math.min(fw, fh) / 25)))
    .modulate({ brightness: 0.85 }) // หรี่ลงหน่อยให้ตัวรูปเด่นกว่าพื้นหลัง
    .toBuffer();

  const buffer = await sharp(bg).composite([{ input: inner, gravity: 'center' }]).jpeg({ quality: 92 }).toBuffer();
  console.log(`[IG fit] ${width}x${height} (${ratio.toFixed(2)}) → ${fw}x${fh} (${target.toFixed(2)}) เติมขอบเบลอ`);
  return { buffer, ext: 'jpg' };
}

async function fitImagesForIg(images) {
  if (!images.length) return images;
  let target = 1;
  try {
    const f = await sharp(images[0].buffer, { autoOrient: true }).metadata();
    const fw = f.orientation >= 5 ? f.height : f.width;   // ตะแคงตาม EXIF — ดูหมายเหตุใน fitImageForIg
    const fh = f.orientation >= 5 ? f.width : f.height;
    if (fw && fh) target = clampIgRatio(fw / fh);
  } catch (e) {
    console.error('[IG fit] อ่านขนาดรูปใบแรกไม่ได้ ใช้ 1:1:', e.message);
  }
  const out = [];
  for (const img of images) {
    // ปรับไม่ได้ก็ส่งของเดิมไป ให้ IG เป็นคนบอกว่าไม่รับ ดีกว่าโพสต์ล้มทั้งงานตรงนี้
    try { out.push(await fitImageForIg(img, target)); }
    catch (e) { console.error('[IG fit] ข้ามรูปที่ปรับไม่ได้:', e.message); out.push(img); }
  }
  return out;
}

async function postToInstagram(guildId, userId, images, caption, scheduleTime = null, onProgress = null, groupName = null, accountId = null) {
  const cfg = await getConfig(guildId, 'ig', userId, groupName, accountId);
  if (!cfg) throw new Error('ไม่พบ Instagram config สำหรับ guild นี้');
  if (!TEMP_URL.startsWith('http')) {
    throw new Error(`META_TEMP_URL หรือ WEB_BASE_URL ไม่ได้ set — ตอนนี้ TEMP_URL="${TEMP_URL}" ซึ่ง Instagram เข้าไม่ได้`);
  }
  const urls = saveProcessedToTemp(await fitImagesForIg(images));
  return _igPostFromUrls(cfg, urls, caption, scheduleTime, onProgress);
}

// ─── Threads ──────────────────────────────────────────────────────────────────

function threadsGet(urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'graph.threads.net', path: urlPath, method: 'GET' }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function threadsPost(urlPath, fields) {
  const { body, contentType } = buildMultipart(fields);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.threads.net', path: urlPath, method: 'POST',
      headers: { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            const e = json.error;
            console.error('[Threads API error]', urlPath, JSON.stringify({
              status: res.statusCode,
              message: e.message,
              type: e.type,
              code: e.code,
              error_subcode: e.error_subcode,
              error_user_title: e.error_user_title,
              error_user_msg: e.error_user_msg,
              fbtrace_id: e.fbtrace_id,
            }));
            const detail = e.error_user_msg || e.message || 'unknown error';
            const codeStr = [e.code, e.error_subcode].filter(Boolean).join('/');
            reject(new Error(`Threads API: ${detail}${codeStr ? ` (code ${codeStr})` : ''}`));
          } else resolve(json);
        } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function waitForThreadsContainer(id, token, maxWaitMs = 30000, onProgress = null) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await threadsGet(`/v1.0/${id}?fields=status,error_message&access_token=${token}`);
    if (res.status === 'FINISHED') return;
    if (res.status === 'ERROR') {
      console.error('[Threads container ERROR]', id, JSON.stringify(res));
      throw new Error(`Threads container error: ${res.error_message || 'unknown'}`);
    }
    const elapsed = Math.floor((Date.now() - start) / 1000);
    if (onProgress) onProgress(elapsed);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Threads container timeout — รูปใช้เวลา process นานเกิน 30s');
}

function splitCaption(caption, maxLen = 500) {
  if (!caption || caption.length <= maxLen) return [caption || ''];
  const chunks = [];
  let remaining = caption;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut <= 0) cut = remaining.lastIndexOf(' ', maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function postToThreads(guildId, userId, images, caption, onProgress = null, groupName = null, accountId = null) {
  const cfg = await getConfig(guildId, 'threads', userId, groupName, accountId);
  if (!cfg) throw new Error('ไม่พบ Threads config สำหรับ guild นี้');
  if (images.length && !TEMP_URL.startsWith('http')) {
    throw new Error(`WEB_BASE_URL ไม่ได้ set — Threads เข้า URL ไม่ได้`);
  }

  const chunks = splitCaption(caption);
  const firstChunk = chunks[0];
  const extraChunks = chunks.slice(1);

  const imageUrls = images.length ? saveProcessedToTemp(images) : [];
  const total = imageUrls.length;

  async function publishContainer(containerId) {
    const { id: mediaId } = await threadsPost(`/v1.0/${cfg.socialId}/threads_publish`, {
      creation_id: containerId, access_token: cfg.token,
    });
    // permalink อาจยังไม่พร้อมทันทีด้วยเหตุเดียวกับ waitPostVisible — ลองซ้ำสั้นๆ ก่อนยอมคืน null
    // ห้าม throw ตรงนี้เด็ดขาด: โพสต์ออกไปแล้ว ย้อนไม่ได้ · ไม่มีลิงก์ ≠ โพสต์ไม่สำเร็จ
    let permalink = null;
    for (let i = 0; i < 4 && !permalink; i++) {
      const info = await threadsGet(`/v1.0/${mediaId}?fields=permalink&access_token=${cfg.token}`);
      permalink = info?.permalink || null;
      if (!permalink) await new Promise(r => setTimeout(r, 1500));
    }
    return { id: mediaId, permalink };
  }

  // Threads ยังไม่ให้อ้างถึงโพสต์ที่เพิ่ง publish ทันที — ถามหาแล้วได้ error 24 "ไม่พบสื่อที่มี ID …"
  // เคสจริง 2026-09-03: caption ยาว → ตัดเป็น reply chain → ใบที่ 2 ยิง reply_to_id ของใบแรกเร็วไป
  // → threadsPost โยน error = ทั้งงานขึ้น "ล้มเหลว" ทั้งที่ใบแรกโพสต์ออกไปแล้วจริง
  async function waitPostVisible(postId, maxWaitMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const info = await threadsGet(`/v1.0/${postId}?fields=id&access_token=${cfg.token}`);
      if (info?.id) return true;
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;   // หมดเวลาแล้วก็ยังลองยิงต่อ — error จริงจาก Threads มีประโยชน์กว่าเดาเอง
  }

  async function postReplyChain(firstPostId) {
    if (!extraChunks.length) return;
    let replyToId = firstPostId;
    for (let i = 0; i < extraChunks.length; i++) {
      if (onProgress) onProgress(`📤 @ Threads: โพสต์ thread ${i + 2}/${chunks.length}...`);
      await waitPostVisible(replyToId);
      const { id: containerId } = await threadsPost(`/v1.0/${cfg.socialId}/threads`, {
        media_type: 'TEXT', text: extraChunks[i], reply_to_id: replyToId, access_token: cfg.token,
      });
      await waitForThreadsContainer(containerId, cfg.token, 30000,
        s => onProgress && onProgress(`📤 @ Threads: thread ${i + 2}/${chunks.length} กำลัง process... (${s}s)`)
      );
      const { id: publishedId } = await threadsPost(`/v1.0/${cfg.socialId}/threads_publish`, {
        creation_id: containerId, access_token: cfg.token,
      });
      replyToId = publishedId;
    }
  }

  // text only
  if (!imageUrls.length) {
    const { id } = await threadsPost(`/v1.0/${cfg.socialId}/threads`, {
      media_type: 'TEXT', text: firstChunk, access_token: cfg.token,
    });
    await waitForThreadsContainer(id, cfg.token, 30000,
      s => onProgress && onProgress(`📤 @ Threads: กำลัง process... (${s}s)`)
    );
    const result = await publishContainer(id);
    await postReplyChain(result.id);
    return result;
  }

  // single image
  if (total === 1) {
    const { id } = await threadsPost(`/v1.0/${cfg.socialId}/threads`, {
      media_type: 'IMAGE', image_url: imageUrls[0], text: firstChunk, access_token: cfg.token,
    });
    await waitForThreadsContainer(id, cfg.token, 30000,
      s => onProgress && onProgress(`📤 @ Threads: กำลัง process รูป... (${s}s)`)
    );
    const result = await publishContainer(id);
    await postReplyChain(result.id);
    return result;
  }

  // carousel — Threads carousel max is 20 images
  const THREADS_CAROUSEL_MAX = 20;
  const carouselUrls = imageUrls.slice(0, THREADS_CAROUSEL_MAX);
  if (imageUrls.length > THREADS_CAROUSEL_MAX) {
    console.warn(`[Threads] carousel truncated: ${imageUrls.length} → ${THREADS_CAROUSEL_MAX} images`);
    if (onProgress) onProgress(`⚠️ Threads: รูปเกิน ${THREADS_CAROUSEL_MAX} รูป — จะโพสต์แค่ ${THREADS_CAROUSEL_MAX} รูปแรก`);
  }
  const childIds = [];
  for (let i = 0; i < carouselUrls.length; i++) {
    const { id } = await threadsPost(`/v1.0/${cfg.socialId}/threads`, {
      media_type: 'IMAGE', image_url: carouselUrls[i], is_carousel_item: 'true', access_token: cfg.token,
    });
    await waitForThreadsContainer(id, cfg.token, 30000,
      s => onProgress && onProgress(`📤 @ Threads: กำลัง process รูป ${i + 1}/${carouselUrls.length}... (${s}s)`)
    );
    childIds.push(id);
  }
  const { id: carouselId } = await threadsPost(`/v1.0/${cfg.socialId}/threads`, {
    media_type: 'CAROUSEL', text: firstChunk,
    children: childIds.join(','),
    access_token: cfg.token,
  });
  await waitForThreadsContainer(carouselId, cfg.token, 30000,
    s => onProgress && onProgress(`📤 @ Threads: กำลัง publish carousel... (${s}s)`)
  );
  const result = await publishContainer(carouselId);
  await postReplyChain(result.id);
  return result;
}

// POST ไปยัง URL ใดก็ได้ (ใช้สำหรับ upload ไปยัง host นอกจาก graph.facebook.com)
function httpsPostToUrl(fullUrl, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Length': Buffer.byteLength(body), ...headers },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function postReelsToFacebook(guildId, userId, videoDiscordUrl, caption, onProgress = null, groupName = null, scheduleTime = null, accountId = null) {
  const cfg = await getConfig(guildId, 'fb', userId, groupName, accountId);
  if (!cfg) throw new Error('ไม่พบ Facebook config สำหรับ guild นี้');

  if (onProgress) onProgress('📤 Facebook Reels: กำลังดาวน์โหลดวิดีโอ...');
  let buffer = await fetchBuffer(videoDiscordUrl);
  buffer = await convertVideoIfNeeded(buffer, videoDiscordUrl, onProgress);

  // Phase 1: start — ขอ upload session
  if (onProgress) onProgress('📤 Facebook Reels: เริ่ม upload session...');
  const startRes = await igPost(`/v22.0/${cfg.socialId}/video_reels`, {
    upload_phase: 'start', access_token: cfg.token,
  });
  const { video_id, upload_url } = startRes;
  if (!video_id || !upload_url) throw new Error(`FB Reels: ไม่ได้รับ video_id/upload_url — ${JSON.stringify(startRes)}`);

  // Phase 2: upload binary ไปยัง rupload.facebook.com
  if (onProgress) onProgress('📤 Facebook Reels: กำลัง upload วิดีโอ...');
  const uploadRes = await httpsPostToUrl(upload_url, buffer, {
    Authorization: `OAuth ${cfg.token}`,
    'Content-Type': 'video/mp4',
    offset: '0',
    file_size: String(buffer.length),
  });
  if (uploadRes.status >= 400) throw new Error(`FB Reels upload: HTTP ${uploadRes.status} — ${JSON.stringify(uploadRes.body)}`);

  // Phase 3: finish — publish หรือ schedule
  const finishLabel = scheduleTime ? '📤 Facebook Reels: กำลังตั้งเวลา...' : '📤 Facebook Reels: กำลัง publish...';
  if (onProgress) onProgress(finishLabel);
  const finishBody = {
    upload_phase: 'finish',
    video_id,
    video_state: scheduleTime ? 'SCHEDULED' : 'PUBLISHED',
    description: caption || '',
    access_token: cfg.token,
  };
  if (scheduleTime) finishBody.scheduled_publish_time = scheduleTime;
  const finishRes = await igPost(`/v22.0/${cfg.socialId}/video_reels`, finishBody);

  const postId = finishRes.post_id || finishRes.post_id_string || finishRes.id || null;
  console.log('[FB Reels finish]', JSON.stringify(finishRes));
  let permalink = null;
  if (postId) {
    const parts = String(postId).split('_');
    permalink = parts.length === 2
      ? `https://www.facebook.com/permalink.php?story_fbid=${parts[1]}&id=${parts[0]}`
      : `https://www.facebook.com/${postId}`;
  }
  return { id: postId, permalink };
}

async function postReelsToInstagram(guildId, userId, videoDiscordUrl, caption, onProgress = null, groupName = null, accountId = null) {
  const cfg = await getConfig(guildId, 'ig', userId, groupName, accountId);
  if (!cfg) throw new Error('ไม่พบ Instagram config สำหรับ guild นี้');
  if (!TEMP_URL.startsWith('http')) {
    throw new Error(`META_TEMP_URL หรือ WEB_BASE_URL ไม่ได้ set — Instagram เข้าถึง URL ไม่ได้`);
  }
  const igToken = cfg.userToken;
  if (!igToken) throw new Error('ไม่พบ User Token สำหรับ IG — กรุณาเข้าไป reconnect Meta OAuth ใหม่');

  if (onProgress) onProgress('📤 Instagram Reels: กำลังดาวน์โหลดวิดีโอ...');
  let buffer = await fetchBuffer(videoDiscordUrl);
  buffer = await convertVideoIfNeeded(buffer, videoDiscordUrl, onProgress);
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const filename = `${crypto.randomBytes(12).toString('hex')}.mp4`;
  fs.writeFileSync(path.join(TEMP_DIR, filename), buffer);
  const videoUrl = `${TEMP_URL}/${filename}`;

  if (onProgress) onProgress('📤 Instagram Reels: กำลังสร้าง container...');
  const { id: containerId, error: containerErr } = await igPost(`/v22.0/${cfg.socialId}/media`, {
    media_type: 'REELS', video_url: videoUrl, caption: truncateCaption(caption), access_token: igToken,
  });
  if (containerErr) throw new Error(`IG Reels container: ${containerErr.message}`);
  console.log('[IG Reels container created] id:', containerId);

  await waitForIgContainer(containerId, igToken, 300_000,
    s => onProgress && onProgress(`📤 Instagram Reels: กำลัง process วิดีโอ... (${s}s)`)
  );

  const { id: mediaId } = await igPost(`/v22.0/${cfg.socialId}/media_publish`, {
    creation_id: containerId, access_token: igToken,
  });
  const info = await httpsGet(`/v22.0/${mediaId}?fields=permalink,shortcode&access_token=${encodeURIComponent(igToken)}`);
  const permalink = info.permalink
    || (info.shortcode ? `https://www.instagram.com/reel/${info.shortcode}/` : null);
  return { id: mediaId, permalink };
}

async function postReelsToThreads(guildId, userId, videoDiscordUrl, caption, onProgress = null, groupName = null, accountId = null) {
  const cfg = await getConfig(guildId, 'threads', userId, groupName, accountId);
  if (!cfg) throw new Error('ไม่พบ Threads config สำหรับ guild นี้');
  if (!TEMP_URL.startsWith('http')) {
    throw new Error(`META_TEMP_URL หรือ WEB_BASE_URL ไม่ได้ set — Threads เข้าถึง URL ไม่ได้`);
  }

  if (onProgress) onProgress('📤 Threads Reels: กำลังดาวน์โหลดวิดีโอ...');
  let buffer = await fetchBuffer(videoDiscordUrl);
  buffer = await convertVideoIfNeeded(buffer, videoDiscordUrl, onProgress);
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const filename = `${crypto.randomBytes(12).toString('hex')}.mp4`;
  fs.writeFileSync(path.join(TEMP_DIR, filename), buffer);
  const videoUrl = `${TEMP_URL}/${filename}`;

  if (onProgress) onProgress('📤 Threads Reels: กำลังสร้าง container...');
  const { id: containerId } = await threadsPost(`/v1.0/${cfg.socialId}/threads`, {
    media_type: 'REELS', video_url: videoUrl, text: splitCaption(caption)[0], access_token: cfg.token,
  });
  console.log('[Threads Reels container created] id:', containerId);

  await waitForThreadsContainer(containerId, cfg.token, 300_000,
    s => onProgress && onProgress(`📤 Threads Reels: กำลัง process วิดีโอ... (${s}s)`)
  );

  const { id: mediaId } = await threadsPost(`/v1.0/${cfg.socialId}/threads_publish`, {
    creation_id: containerId, access_token: cfg.token,
  });
  const info = await threadsGet(`/v1.0/${mediaId}?fields=permalink&access_token=${cfg.token}`);
  return { id: mediaId, permalink: info.permalink || null };
}

/**
 * กวาดต่ออายุ token ทุกบัญชีที่ใกล้หมด — เรียกจากรอบกวาดวันละครั้งของ publishWorker
 *
 * ทำไมต้องมีทั้งที่มี refresh-on-use อยู่แล้ว (bug-393): refresh-on-use ทำงานเฉพาะตอน "มีคนโพสต์"
 * ซึ่งไม่การันตีว่าจะเกิดในหน้าต่าง 7 วันสุดท้าย → กลุ่มที่ไม่ได้โพสต์ช่วงนั้น token ตายเงียบ
 *
 * ⚠️ fb (Page token) กับ x (OAuth 1.0a) **ไม่มีวันหมดอายุ** → ไม่มี expires_at จึงไม่ถูกเลือกมาเอง
 * ⚠️ ต่อได้เฉพาะ token ที่ **ยังไม่หมดอายุ** — ที่หมดแล้วกู้ด้วยโค้ดไม่ได้ ต้องกด Connect ใหม่
 *    จึงคืนมาในรายการ `dead` เพื่อให้คนไปกดเอง ไม่ใช่เงียบ
 *
 * @returns {Promise<{ok:Array, failed:Array, dead:Array}>}
 */
async function refreshExpiringTokens() {
  const { rows } = await pool.query(
    `SELECT id, platform, name, group_name, guild_id, org_id, access_token, user_token,
            user_discord_id, user_token_expires_at
       FROM dc_social_accounts
      WHERE user_token_expires_at IS NOT NULL
        AND user_token_expires_at < now() + ($1 || ' milliseconds')::interval
      ORDER BY user_token_expires_at`,
    [REFRESH_THRESHOLD_MS]
  );

  const ok = [], failed = [], dead = [];
  for (const r of rows) {
    const label = `${r.platform} · ${r.group_name || r.name || r.id}`;
    // หมดอายุไปแล้ว = refresh ไม่ได้ทั้ง FB และ Threads (ทั้งคู่ต้องใช้ token ที่ยังไม่หมด)
    if (new Date(r.user_token_expires_at).getTime() <= Date.now()) {
      dead.push(label);
      continue;
    }
    try {
      if (r.platform === 'threads') {
        if (!r.access_token) { dead.push(label); continue; }
        await refreshThreadsToken(r.id, r.access_token);
      } else if (r.user_token) {
        await refreshUserToken(r.guild_id, r.id, r.user_discord_id, r.user_token);
      } else {
        continue;   // ไม่มี token ให้ต่อ (fb page token ฯลฯ) — ไม่ใช่ความผิดพลาด
      }
      ok.push(label);
    } catch (err) {
      failed.push(`${label} — ${err.message}`);
    }
  }
  return { ok, failed, dead };
}

module.exports = { fitImagesForIg, getConfig, getConfigById, getAvailablePlatforms, getAvailableGroups, getGuildMetaApp, refreshExpiringTokens, saveMediaToTemp, cleanTempMedia, postToFacebook, postToInstagram, postToThreads, postReelsToInstagram, postReelsToFacebook, postReelsToThreads };
