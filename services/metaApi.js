const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEMP_DIR = process.env.META_TEMP_DIR
  || path.join(__dirname, '..', 'web', 'public', 'media-temp');
const TEMP_URL = process.env.META_TEMP_URL
  || `${process.env.WEB_BASE_URL || ''}/media-temp`;

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

// ─── HTTP helper ──────────────────────────────────────────────────────────────

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

async function postToFacebook(guildId, images, caption) {
  const cfg = await getConfig(guildId);
  if (!cfg) throw new Error('ไม่พบ config สำหรับ guild นี้');

  // caption-only post
  if (!images.length) {
    const { body, contentType } = buildMultipart({ message: caption, access_token: cfg.token });
    const res = await httpsPost(`/v22.0/${cfg.pageId}/feed`, body, contentType);
    if (res.error) throw new Error(`FB feed post: ${res.error.message}`);
    return res;
  }

  if (images.length === 1) {
    return fbUploadPhoto(cfg.pageId, cfg.token, images[0].buffer, images[0].ext, true, caption);
  }

  // multi-photo: upload unpublished → create feed post
  const photoIds = [];
  for (const img of images) {
    const res = await fbUploadPhoto(cfg.pageId, cfg.token, img.buffer, img.ext, false);
    photoIds.push({ media_fbid: res.id });
  }

  const { body, contentType } = buildMultipart({
    message: caption,
    attached_media: JSON.stringify(photoIds),
    access_token: cfg.token,
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

async function postToInstagram(guildId, images, caption) {
  const cfg = await getConfig(guildId);
  if (!cfg?.igId) throw new Error('ไม่พบ Instagram config');

  const tempFiles = [];
  try {
    const urls = images.map(img => {
      const temp = saveTempFile(img.buffer, img.ext);
      tempFiles.push(temp.cleanup);
      return temp.url;
    });

    if (urls.length === 1) {
      const { id } = await igPost(`/v22.0/${cfg.igId}/media`, {
        image_url: urls[0], caption, access_token: cfg.token,
      });
      return igPost(`/v22.0/${cfg.igId}/media_publish`, {
        creation_id: id, access_token: cfg.token,
      });
    }

    // carousel
    const childIds = [];
    for (const url of urls) {
      const { id } = await igPost(`/v22.0/${cfg.igId}/media`, {
        image_url: url, is_carousel_item: 'true', access_token: cfg.token,
      });
      childIds.push(id);
    }

    const { id: carouselId } = await igPost(`/v22.0/${cfg.igId}/media`, {
      media_type: 'CAROUSEL', caption,
      children: childIds.join(','),
      access_token: cfg.token,
    });

    return igPost(`/v22.0/${cfg.igId}/media_publish`, {
      creation_id: carouselId, access_token: cfg.token,
    });

  } finally {
    setTimeout(() => tempFiles.forEach(fn => fn()), 60_000);
  }
}

module.exports = { getConfig, postToFacebook, postToInstagram };
