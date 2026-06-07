const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchBuffer } = require('../utils/watermarkImage');
const { convertVideoIfNeeded } = require('../utils/videoUtils');

const TEMP_DIR = process.env.META_TEMP_DIR
  || path.join(__dirname, '..', 'web', 'public', 'media-temp');
const TEMP_URL = process.env.META_TEMP_URL
  || `${process.env.WEB_BASE_URL || ''}/api/media-temp`;

const pool = require('../db/index');

const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function getGuildMetaApp(guildId) {
  const { rows } = await pool.query(
    `SELECT "key", value FROM dc_guild_config WHERE guild_id = $1 AND "key" IN ('meta_app_id', 'meta_app_secret')`,
    [guildId]
  );
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (!m.meta_app_id || !m.meta_app_secret) return null;
  return { app_id: m.meta_app_id, app_secret: m.meta_app_secret };
}

async function refreshUserToken(guildId, rowId, userDiscordId, currentUserToken) {
  const app = await getGuildMetaApp(guildId);
  if (!app) throw new Error(`Token refresh ล้มเหลว: guild ${guildId} ยังไม่ได้ set meta_app_id/secret ใน dc_guild_config`);

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
  if (userDiscordId) {
    await pool.query(
      `UPDATE dc_social_accounts SET user_token = $1, user_token_expires_at = $2 WHERE user_discord_id = $3 AND user_token IS NOT NULL`,
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

// คืนค่า config ของ platform หนึ่งใน guild หนึ่ง
// userId = Discord user id ของคนที่กำลังโพสต์ (เพื่อ filter private accounts)
async function getConfig(guildId, platform, userId = null, groupName = null) {
  const params = groupName ? [guildId, platform, userId, groupName, userId] : [guildId, platform, userId, userId];
  const groupClause = groupName ? 'AND group_name = $4' : '';
  const orderIdx = groupName ? '$5' : '$4';
  const { rows } = await pool.query(
    `SELECT id, user_discord_id, social_id, access_token, user_token, user_token_expires_at, name, visibility
     FROM dc_social_accounts
     WHERE guild_id = $1 AND platform = $2
       AND (visibility = 'public' OR (visibility = 'private' AND user_discord_id = $3))
       ${groupClause}
     ORDER BY CASE WHEN user_discord_id = ${orderIdx} THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    params
  );
  if (!rows.length) return null;
  const r = rows[0];

  let userToken = r.user_token || null;
  if (userToken && r.user_token_expires_at) {
    const msLeft = new Date(r.user_token_expires_at).getTime() - Date.now();
    if (msLeft < REFRESH_THRESHOLD_MS) {
      console.log('[getConfig]', guildId, platform, 'user_token expires in', Math.round(msLeft / 86400000), 'days — refreshing');
      try {
        userToken = await refreshUserToken(guildId, r.id, r.user_discord_id, userToken) || userToken;
      } catch (err) {
        console.error('[getConfig] refresh failed:', err.message);
      }
    }
  }

  console.log('[getConfig]', guildId, platform, 'name:', r.name, 'visibility:', r.visibility);
  return {
    rowId: r.id,
    name: r.name,
    socialId: r.social_id,
    token: r.access_token,
    userToken,
    userDiscordId: r.user_discord_id,
  };
}

// คืน array ของ platforms ที่ user คนนี้สามารถใช้ใน guild นี้
async function getAvailablePlatforms(guildId, userId = null, groupName = null) {
  const params = groupName ? [guildId, userId, groupName] : [guildId, userId];
  const groupClause = groupName ? 'AND group_name = $3' : '';
  const { rows } = await pool.query(
    `SELECT DISTINCT platform FROM dc_social_accounts
     WHERE guild_id = $1
       AND (visibility = 'public' OR (visibility = 'private' AND user_discord_id = $2))
       ${groupClause}`,
    params
  );
  return rows.map(r => r.platform);
}

// คืน list ของ group_name (เฉพาะที่ user เห็น) สำหรับ guild นี้
async function getAvailableGroups(guildId, userId = null) {
  const { rows } = await pool.query(
    `SELECT DISTINCT group_name FROM dc_social_accounts
     WHERE guild_id = $1 AND group_name IS NOT NULL
       AND (visibility = 'public' OR (visibility = 'private' AND user_discord_id = $2))
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

async function postToFacebook(guildId, userId, images, caption, scheduleTime = null, groupName = null) {
  const cfg = await getConfig(guildId, 'fb', userId, groupName);
  if (!cfg) throw new Error('ไม่พบ Facebook config สำหรับ guild นี้');

  const scheduleFields = scheduleTime
    ? { published: 'false', scheduled_publish_time: String(scheduleTime) }
    : {};

  const noButtonCta = JSON.stringify({ type: 'NO_BUTTON' });

  // caption-only post
  if (!images.length) {
    const { body, contentType } = buildMultipart({ message: caption, access_token: cfg.token, call_to_action: noButtonCta, ...scheduleFields });
    const res = await httpsPost(`/v22.0/${cfg.socialId}/feed`, body, contentType);
    if (res.error) throw new Error(`FB feed post: ${res.error.message}`);
    return res;
  }

  // upload each photo as unpublished → create feed post (ให้ได้ pageId_postId เสมอ)
  const photoIds = [];
  for (const img of images) {
    const res = await fbUploadPhoto(cfg.socialId, cfg.token, img.buffer, img.ext, false);
    photoIds.push({ media_fbid: res.id });
  }

  const { body, contentType } = buildMultipart({
    message: caption,
    attached_media: JSON.stringify(photoIds),
    access_token: cfg.token,
    call_to_action: noButtonCta,
    ...scheduleFields,
  });
  const res = await httpsPost(`/v22.0/${cfg.socialId}/feed`, body, contentType);
  if (res.error) throw new Error(`FB feed post: ${res.error.message}`);
  return res;
}

// ─── Instagram ────────────────────────────────────────────────────────────────

async function igPost(urlPath, fields) {
  const { body, contentType } = buildMultipart(fields);
  const res = await httpsPost(urlPath, body, contentType);
  if (res.error) throw new Error(`IG API: ${res.error.message}`);
  return res;
}

async function _igPostFromUrls(cfg, imageUrls, caption, scheduleTime = null, onProgress = null) {
  if (imageUrls.length > 10) imageUrls = imageUrls.slice(0, 10);
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
function saveProcessedToTemp(images) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return images.map(img => {
    const name = `${crypto.randomBytes(12).toString('hex')}.${img.ext}`;
    fs.writeFileSync(path.join(TEMP_DIR, name), img.buffer);
    return `${TEMP_URL}/${name}`;
  });
}

async function postToInstagram(guildId, userId, images, caption, scheduleTime = null, onProgress = null, groupName = null) {
  const cfg = await getConfig(guildId, 'ig', userId, groupName);
  if (!cfg) throw new Error('ไม่พบ Instagram config สำหรับ guild นี้');
  if (!TEMP_URL.startsWith('http')) {
    throw new Error(`META_TEMP_URL หรือ WEB_BASE_URL ไม่ได้ set — ตอนนี้ TEMP_URL="${TEMP_URL}" ซึ่ง Instagram เข้าไม่ได้`);
  }
  const urls = saveProcessedToTemp(images);
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
          if (json.error) reject(new Error(`Threads API: ${json.error.message}`));
          else resolve(json);
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
    const res = await threadsGet(`/v1.0/${id}?fields=status&access_token=${token}`);
    if (res.status === 'FINISHED') return;
    if (res.status === 'ERROR') throw new Error('Threads container error');
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

async function postToThreads(guildId, userId, images, caption, onProgress = null, groupName = null) {
  const cfg = await getConfig(guildId, 'threads', userId, groupName);
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
    const info = await threadsGet(`/v1.0/${mediaId}?fields=permalink&access_token=${cfg.token}`);
    return { id: mediaId, permalink: info.permalink || null };
  }

  async function postReplyChain(firstPostId) {
    if (!extraChunks.length) return;
    let replyToId = firstPostId;
    for (let i = 0; i < extraChunks.length; i++) {
      if (onProgress) onProgress(`📤 @ Threads: โพสต์ thread ${i + 2}/${chunks.length}...`);
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

async function postReelsToFacebook(guildId, userId, videoDiscordUrl, caption, onProgress = null, groupName = null) {
  const cfg = await getConfig(guildId, 'fb', userId, groupName);
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

  // Phase 3: finish — publish
  if (onProgress) onProgress('📤 Facebook Reels: กำลัง publish...');
  const finishRes = await igPost(`/v22.0/${cfg.socialId}/video_reels`, {
    upload_phase: 'finish',
    video_id,
    video_state: 'PUBLISHED',
    description: caption || '',
    access_token: cfg.token,
  });

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

async function postReelsToInstagram(guildId, userId, videoDiscordUrl, caption, onProgress = null, groupName = null) {
  const cfg = await getConfig(guildId, 'ig', userId, groupName);
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
    media_type: 'REELS', video_url: videoUrl, caption, access_token: igToken,
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

module.exports = { getConfig, getAvailablePlatforms, getAvailableGroups, getGuildMetaApp, postToFacebook, postToInstagram, postToThreads, postReelsToInstagram, postReelsToFacebook };
