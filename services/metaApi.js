const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEMP_DIR = process.env.META_TEMP_DIR
  || path.join(__dirname, '..', 'web', 'public', 'media-temp');
const TEMP_URL = process.env.META_TEMP_URL
  || `${process.env.WEB_BASE_URL || ''}/api/media-temp`;

const pool = require('../db/index');

async function getConfig(guildId) {
  const [rows] = await pool.execute(
    `SELECT \`key\`, value FROM dc_guild_config WHERE guild_id = ? AND \`key\` IN ('meta_page_id','meta_ig_id','meta_page_token')`,
    [guildId]
  );
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (!cfg.meta_page_id || !cfg.meta_page_token) return null;
  return { pageId: cfg.meta_page_id, igId: cfg.meta_ig_id || null, token: cfg.meta_page_token };
}

async function getThreadsConfig(guildId) {
  const [rows] = await pool.execute(
    `SELECT \`key\`, value FROM dc_guild_config WHERE guild_id = ? AND \`key\` IN ('meta_threads_id','meta_threads_token')`,
    [guildId]
  );
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (!cfg.meta_threads_id || !cfg.meta_threads_token) return null;
  return { userId: cfg.meta_threads_id, token: cfg.meta_threads_token };
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

async function waitForIgContainer(id, token, maxWaitMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await httpsGet(`/v22.0/${id}?fields=status_code,status&access_token=${token}`);
    if (res.status_code === 'FINISHED') return;
    if (res.status_code === 'ERROR') throw new Error(`IG container error: ${res.status || 'unknown'}`);
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

async function postToFacebook(guildId, images, caption, scheduleTime = null) {
  const cfg = await getConfig(guildId);
  if (!cfg) throw new Error('ไม่พบ config สำหรับ guild นี้');

  const scheduleFields = scheduleTime
    ? { published: 'false', scheduled_publish_time: String(scheduleTime) }
    : {};

  // caption-only post
  if (!images.length) {
    const { body, contentType } = buildMultipart({ message: caption, access_token: cfg.token, ...scheduleFields });
    const res = await httpsPost(`/v22.0/${cfg.pageId}/feed`, body, contentType);
    if (res.error) throw new Error(`FB feed post: ${res.error.message}`);
    return res;
  }

  // upload each photo as unpublished → create feed post (ให้ได้ pageId_postId เสมอ)
  const photoIds = [];
  for (const img of images) {
    const res = await fbUploadPhoto(cfg.pageId, cfg.token, img.buffer, img.ext, false);
    photoIds.push({ media_fbid: res.id });
  }

  const { body, contentType } = buildMultipart({
    message: caption,
    attached_media: JSON.stringify(photoIds),
    access_token: cfg.token,
    ...scheduleFields,
  });
  const res = await httpsPost(`/v22.0/${cfg.pageId}/feed`, body, contentType);
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

async function _igPostFromUrls(cfg, imageUrls, caption, scheduleTime = null) {
  if (imageUrls.length > 10) imageUrls = imageUrls.slice(0, 10);
  const scheduleFields = scheduleTime
    ? { scheduled_publish_time: String(scheduleTime), published: 'false' }
    : {};

  async function publishAndGetUrl(containerId) {
    const { id: mediaId } = await igPost(`/v22.0/${cfg.igId}/media_publish`, {
      creation_id: containerId, access_token: cfg.token,
    });
    const info = await httpsGet(`/v22.0/${mediaId}?fields=permalink&access_token=${cfg.token}`);
    return { id: mediaId, permalink: info.permalink || null };
  }

  if (imageUrls.length === 1) {
    const { id } = await igPost(`/v22.0/${cfg.igId}/media`, {
      image_url: imageUrls[0], caption, access_token: cfg.token, ...scheduleFields,
    });
    await waitForIgContainer(id, cfg.token);
    return publishAndGetUrl(id);
  }

  // carousel — children ไม่ใส่ scheduled_publish_time, ใส่แค่ parent
  const childIds = [];
  for (const url of imageUrls) {
    const { id } = await igPost(`/v22.0/${cfg.igId}/media`, {
      image_url: url, is_carousel_item: 'true', access_token: cfg.token,
    });
    await waitForIgContainer(id, cfg.token);
    childIds.push(id);
  }
  const { id: carouselId } = await igPost(`/v22.0/${cfg.igId}/media`, {
    media_type: 'CAROUSEL', caption,
    children: childIds.join(','),
    access_token: cfg.token,
    ...scheduleFields,
  });
  await waitForIgContainer(carouselId, cfg.token);
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

async function postToInstagram(guildId, images, caption, scheduleTime = null) {
  const cfg = await getConfig(guildId);
  if (!cfg?.igId) throw new Error('ไม่พบ Instagram config');
  if (!TEMP_URL.startsWith('http')) {
    throw new Error(`META_TEMP_URL หรือ WEB_BASE_URL ไม่ได้ set — ตอนนี้ TEMP_URL="${TEMP_URL}" ซึ่ง Instagram เข้าไม่ได้`);
  }
  const urls = saveProcessedToTemp(images);
  console.log('[IG] temp URLs:', urls);
  return _igPostFromUrls(cfg, urls, caption, scheduleTime);
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

async function waitForThreadsContainer(id, token, maxWaitMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await threadsGet(`/v1.0/${id}?fields=status&access_token=${token}`);
    if (res.status === 'FINISHED') return;
    if (res.status === 'ERROR') throw new Error('Threads container error');
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Threads container timeout — รูปใช้เวลา process นานเกิน 30s');
}

async function postToThreads(guildId, images, caption) {
  const cfg = await getThreadsConfig(guildId);
  if (!cfg) throw new Error('ไม่พบ Threads config');
  if (images.length && !TEMP_URL.startsWith('http')) {
    throw new Error(`WEB_BASE_URL ไม่ได้ set — Threads เข้า URL ไม่ได้`);
  }

  const imageUrls = images.length ? saveProcessedToTemp(images) : [];

  async function publishAndGetUrl(containerId) {
    const { id: mediaId } = await threadsPost(`/v1.0/${cfg.userId}/threads_publish`, {
      creation_id: containerId, access_token: cfg.token,
    });
    const info = await threadsGet(`/v1.0/${mediaId}?fields=permalink&access_token=${cfg.token}`);
    return { id: mediaId, permalink: info.permalink || null };
  }

  // text only
  if (!imageUrls.length) {
    const { id } = await threadsPost(`/v1.0/${cfg.userId}/threads`, {
      media_type: 'TEXT', text: caption || '', access_token: cfg.token,
    });
    await waitForThreadsContainer(id, cfg.token);
    return publishAndGetUrl(id);
  }

  // single image
  if (imageUrls.length === 1) {
    const { id } = await threadsPost(`/v1.0/${cfg.userId}/threads`, {
      media_type: 'IMAGE', image_url: imageUrls[0], text: caption || '', access_token: cfg.token,
    });
    await waitForThreadsContainer(id, cfg.token);
    return publishAndGetUrl(id);
  }

  // carousel
  const childIds = [];
  for (const url of imageUrls) {
    const { id } = await threadsPost(`/v1.0/${cfg.userId}/threads`, {
      media_type: 'IMAGE', image_url: url, is_carousel_item: 'true', access_token: cfg.token,
    });
    await waitForThreadsContainer(id, cfg.token);
    childIds.push(id);
  }
  const { id: carouselId } = await threadsPost(`/v1.0/${cfg.userId}/threads`, {
    media_type: 'CAROUSEL', text: caption || '',
    children: childIds.join(','),
    access_token: cfg.token,
  });
  await waitForThreadsContainer(carouselId, cfg.token);
  return publishAndGetUrl(carouselId);
}

module.exports = { getConfig, getThreadsConfig, postToFacebook, postToInstagram, postToThreads };
