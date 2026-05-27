const https  = require('https');
const crypto = require('crypto');
const pool   = require('../db/index');

async function getGuildXApp(guildId) {
  const [rows] = await pool.execute(
    "SELECT `key`, value FROM dc_guild_config WHERE guild_id = ? AND `key` IN ('x_consumer_key', 'x_consumer_secret')",
    [guildId]
  );
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (!m.x_consumer_key || !m.x_consumer_secret) return null;
  return { api_key: m.x_consumer_key, api_secret: m.x_consumer_secret };
}

async function getXConfig(guildId, userId = null) {
  const app = await getGuildXApp(guildId);
  if (!app) return null;

  const [rows] = await pool.execute(
    `SELECT social_id, access_token FROM dc_social_accounts
     WHERE guild_id = ? AND platform = 'x'
       AND (visibility = 'public' OR (visibility = 'private' AND user_discord_id = ?))
     ORDER BY id ASC LIMIT 1`,
    [guildId, userId]
  );
  if (!rows.length) return null;
  let creds;
  try { creds = JSON.parse(rows[0].access_token); } catch { return null; }
  if (!creds.access_token || !creds.access_token_secret) return null;
  return {
    x_api_key:             app.api_key,
    x_api_secret:          app.api_secret,
    x_access_token:        creds.access_token,
    x_access_token_secret: creds.access_token_secret,
    username:              rows[0].social_id,
  };
}

// RFC 3986 percent-encode (encodeURIComponent ไม่ encode ! ' ( ) *)
function pct(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// สร้าง OAuth 1.0a Authorization header (HMAC-SHA1)
// body params ไม่รวมเมื่อใช้ multipart หรือ JSON — ส่ง {} เสมอ
function buildAuthHeader(method, url, cfg) {
  const o = {
    oauth_consumer_key:     cfg.x_api_key,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            cfg.x_access_token,
    oauth_version:          '1.0',
  };
  const paramStr = Object.keys(o).sort().map(k => `${pct(k)}=${pct(o[k])}`).join('&');
  const base     = `${method.toUpperCase()}&${pct(url)}&${pct(paramStr)}`;
  const sigKey   = `${pct(cfg.x_api_secret)}&${pct(cfg.x_access_token_secret)}`;
  o.oauth_signature = crypto.createHmac('sha1', sigKey).update(base).digest('base64');
  return 'OAuth ' + Object.keys(o).sort().map(k => `${pct(k)}="${pct(o[k])}"`).join(', ');
}

function xReq(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch   { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function uploadMedia(cfg, buffer, ext) {
  const mime     = ext === 'png' ? 'image/png' : 'image/jpeg';
  const boundary = `x${crypto.randomBytes(8).toString('hex')}`;
  const body     = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="img.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const auth = buildAuthHeader('POST', 'https://upload.twitter.com/1.1/media/upload.json', cfg);
  const res  = await xReq('upload.twitter.com', '/1.1/media/upload.json', 'POST', {
    Authorization:  auth,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  }, body);
  if (!res.body?.media_id_string) {
    const detail = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
    throw new Error(`X media upload (${res.status}): ${detail}`);
  }
  return res.body.media_id_string;
}

const X_LIMIT = 280;

async function postToX(guildId, userId, images, caption) {
  const cfg = await getXConfig(guildId, userId);
  if (!cfg) throw new Error('ไม่พบ X account — เพิ่ม X account ที่ /bot/social/accounts ก่อน');

  let text      = caption || '';
  const truncated = text.length > X_LIMIT;
  if (truncated) text = text.slice(0, X_LIMIT - 1) + '…';

  // X รองรับสูงสุด 4 รูปต่อ tweet
  const imgSlice = images.slice(0, 4);
  const mediaIds = [];
  for (const img of imgSlice) {
    mediaIds.push(await uploadMedia(cfg, img.buffer, img.ext));
  }

  const tweetBody = { text };
  if (mediaIds.length) tweetBody.media = { media_ids: mediaIds };

  const bodyStr  = JSON.stringify(tweetBody);
  const tweetUrl = 'https://api.twitter.com/2/tweets';
  const auth     = buildAuthHeader('POST', tweetUrl, cfg);
  const res      = await xReq('api.twitter.com', '/2/tweets', 'POST', {
    Authorization:    auth,
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(bodyStr),
  }, bodyStr);

  if (res.status === 429) throw new Error('X API: Rate limit — กรุณารอสักครู่แล้วลองใหม่');
  if (res.status === 403) {
    const detail = res.body?.errors?.[0]?.message || res.body?.detail || 'ไม่มีสิทธิ์หรือเครดิต X หมด';
    throw new Error(`X API 403: ${detail}`);
  }
  if (!res.body?.data?.id) {
    const detail = res.body?.errors?.[0]?.message || res.body?.title || JSON.stringify(res.body);
    throw new Error(`X API: ${detail}`);
  }

  const tweetId = res.body.data.id;
  const url = cfg.username ? `https://x.com/${cfg.username}/status/${tweetId}` : null;
  return {
    id: tweetId,
    url,
    truncated,
    imageCount:  imgSlice.length,
    totalImages: images.length,
  };
}

module.exports = { getXConfig, getGuildXApp, postToX };
