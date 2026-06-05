const https  = require('https');
const crypto = require('crypto');
const pool   = require('../db/index');
const { fetchBuffer } = require('../utils/watermarkImage');
const { convertVideoIfNeeded } = require('../utils/videoUtils');

async function getGuildXApp(guildId) {
  const { rows } = await pool.query(
    `SELECT "key", value FROM dc_guild_config WHERE guild_id = $1 AND "key" IN ('x_consumer_key', 'x_consumer_secret')`,
    [guildId]
  );
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (!m.x_consumer_key || !m.x_consumer_secret) return null;
  return { api_key: m.x_consumer_key, api_secret: m.x_consumer_secret };
}

async function getXConfig(guildId, userId = null, groupName = null) {
  const app = await getGuildXApp(guildId);
  if (!app) return null;

  const params = groupName ? [guildId, userId, groupName, userId] : [guildId, userId, userId];
  const groupClause = groupName ? 'AND group_name = $3' : '';
  const orderUserIdx = groupName ? '$4' : '$3';

  const { rows } = await pool.query(
    `SELECT social_id, access_token FROM dc_social_accounts
     WHERE guild_id = $1 AND platform = 'x'
       AND (visibility = 'public' OR (visibility = 'private' AND user_discord_id = $2))
       ${groupClause}
     ORDER BY CASE WHEN user_discord_id = ${orderUserIdx} THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    params
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

const X_LIMIT           = 280;
const MAX_IMGS_PER_TWEET = 4;
const INDICATOR_BUF      = 6;   // "10/10 " worst case

// split text into chunks ≤ chunkLen, breaking on whitespace when possible
function splitCaption(text, chunkLen) {
  const chunks = [];
  let rest = text.trim();
  while (rest.length > chunkLen) {
    let cut = rest.slice(0, chunkLen);
    const lastSpace = cut.lastIndexOf(' ');
    const lastNewline = cut.lastIndexOf('\n');
    const breakAt = Math.max(lastSpace, lastNewline);
    if (breakAt > chunkLen * 0.5) cut = rest.slice(0, breakAt);
    chunks.push(cut.trim());
    rest = rest.slice(cut.length).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function postSingleTweet(cfg, text, mediaIds, replyTo) {
  const tweetBody = {};
  if (text) tweetBody.text = text;
  if (mediaIds && mediaIds.length) tweetBody.media = { media_ids: mediaIds };
  if (replyTo) tweetBody.reply = { in_reply_to_tweet_id: replyTo };

  const bodyStr = JSON.stringify(tweetBody);
  const auth    = buildAuthHeader('POST', 'https://api.twitter.com/2/tweets', cfg);
  const res     = await xReq('api.twitter.com', '/2/tweets', 'POST', {
    Authorization:    auth,
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(bodyStr),
  }, bodyStr);

  if (res.status === 429) throw new Error('X API: Rate limit — รอแล้วลองใหม่');
  if (res.status === 403) {
    const detail = res.body?.errors?.[0]?.message || res.body?.detail || 'ไม่มีสิทธิ์หรือเครดิต X หมด';
    throw new Error(`X API 403: ${detail}`);
  }
  if (!res.body?.data?.id) {
    const detail = res.body?.errors?.[0]?.message || res.body?.title || JSON.stringify(res.body);
    throw new Error(`X API: ${detail}`);
  }
  return res.body.data.id;
}

const URL_RE = /https?:\/\/\S+/g;

async function postToX(guildId, userId, images, caption, groupName = null) {
  const cfg = await getXConfig(guildId, userId, groupName);
  if (!cfg) throw new Error('ไม่พบ X account — เพิ่ม X account ที่ /bot/social/accounts ก่อน');

  const fullText = (caption || '').trim();

  // 1) extract URLs (move to reply tweet → avoid X URL tax + reach penalty)
  const urls = fullText.match(URL_RE) || [];
  const mainText = urls.length
    ? fullText.replace(URL_RE, '').replace(/\s{2,}/g, ' ').trim()
    : fullText;

  // 2) split main text into chunks
  const textChunks = mainText.length > X_LIMIT
    ? splitCaption(mainText, X_LIMIT - INDICATOR_BUF)
    : (mainText ? [mainText] : []);

  // 3) group all images into chunks of MAX_IMGS_PER_TWEET
  const imageGroups = [];
  for (let i = 0; i < images.length; i += MAX_IMGS_PER_TWEET) {
    imageGroups.push(images.slice(i, i + MAX_IMGS_PER_TWEET));
  }

  // 4) upload all media, grouped
  const uploadedGroups = [];
  for (const group of imageGroups) {
    const ids = [];
    for (const img of group) ids.push(await uploadMedia(cfg, img.buffer, img.ext));
    uploadedGroups.push(ids);
  }

  // 5) post tweets — one slot per text chunk or image group, whichever is more
  const mainCount = Math.max(textChunks.length, imageGroups.length);
  const total     = mainCount + (urls.length ? 1 : 0);
  const needsIndicator = total > 1;
  let firstId = null;
  let prevId  = null;

  for (let i = 0; i < mainCount; i++) {
    let text          = textChunks[i] || '';
    const mediaIds    = uploadedGroups[i] || [];
    if (needsIndicator) {
      const indicator = `${i + 1}/${total}`;
      text = text ? `${text} ${indicator}` : indicator;
    }
    const id = await postSingleTweet(cfg, text, mediaIds, prevId);
    if (i === 0) firstId = id;
    prevId = id;
  }

  if (urls.length) {
    let linkText = '🔗 ลิงก์:\n' + urls.join('\n');
    if (needsIndicator) linkText += `\n${total}/${total}`;
    if (linkText.length > X_LIMIT) linkText = linkText.slice(0, X_LIMIT - 1) + '…';
    // if no main tweets (caption = URLs only, no images), first image group goes here
    const mediaIds = mainCount === 0 ? (uploadedGroups[0] || []) : [];
    const id = await postSingleTweet(cfg, linkText, mediaIds, prevId);
    if (firstId === null) firstId = id;
  }

  const url = cfg.username && firstId ? `https://x.com/${cfg.username}/status/${firstId}` : null;
  return {
    id: firstId,
    url,
    threadCount: total,
    urlCount:    urls.length,
    imageCount:  images.length,
    totalImages: images.length,
  };
}

const VIDEO_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

async function uploadVideoMedia(cfg, buffer) {
  const totalBytes = buffer.length;

  // INIT
  const initBody = `command=INIT&total_bytes=${totalBytes}&media_type=video%2Fmp4&media_category=tweet_video`;
  const initAuth = buildAuthHeader('POST', 'https://upload.twitter.com/1.1/media/upload.json', cfg);
  const initRes  = await xReq('upload.twitter.com', '/1.1/media/upload.json', 'POST', {
    Authorization:  initAuth,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(initBody),
  }, initBody);
  if (!initRes.body?.media_id_string) throw new Error(`X video INIT: ${JSON.stringify(initRes.body)}`);
  const mediaId = initRes.body.media_id_string;

  // APPEND — ทีละ 5 MB
  let segment = 0;
  for (let offset = 0; offset < totalBytes; offset += VIDEO_CHUNK_SIZE) {
    const chunk    = buffer.slice(offset, offset + VIDEO_CHUNK_SIZE);
    const boundary = `x${crypto.randomBytes(8).toString('hex')}`;
    const chunkBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      chunk,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const appendAuth = buildAuthHeader('POST', 'https://upload.twitter.com/1.1/media/upload.json', cfg);
    const appendRes  = await xReq(
      'upload.twitter.com',
      `/1.1/media/upload.json?command=APPEND&media_id=${mediaId}&segment_index=${segment}`,
      'POST',
      { Authorization: appendAuth, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': chunkBody.length },
      chunkBody
    );
    if (appendRes.status !== 204 && appendRes.status !== 200) {
      throw new Error(`X video APPEND segment ${segment}: HTTP ${appendRes.status} — ${JSON.stringify(appendRes.body)}`);
    }
    segment++;
  }

  // FINALIZE
  const finalBody = `command=FINALIZE&media_id=${mediaId}`;
  const finalAuth = buildAuthHeader('POST', 'https://upload.twitter.com/1.1/media/upload.json', cfg);
  const finalRes  = await xReq('upload.twitter.com', '/1.1/media/upload.json', 'POST', {
    Authorization:  finalAuth,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(finalBody),
  }, finalBody);
  if (finalRes.body?.error) throw new Error(`X video FINALIZE: ${finalRes.body.error}`);

  // STATUS poll — ถ้า processing_info มีให้ poll จนสำเร็จ
  const procInfo = finalRes.body?.processing_info;
  if (procInfo && procInfo.state !== 'succeeded') {
    await pollXVideoStatus(cfg, mediaId, procInfo.check_after_secs || 5);
  }
  return mediaId;
}

async function pollXVideoStatus(cfg, mediaId, initialWaitSecs, maxWaitMs = 300_000) {
  const start = Date.now();
  let waitSecs = initialWaitSecs;
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, waitSecs * 1000));
    const auth = buildAuthHeader('GET', 'https://upload.twitter.com/1.1/media/upload.json', cfg);
    const res  = await xReq('upload.twitter.com', `/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`, 'GET', {
      Authorization: auth,
    }, null);
    const info = res.body?.processing_info;
    if (!info || info.state === 'succeeded') return;
    if (info.state === 'failed') throw new Error('X video: server ประมวลผลไม่สำเร็จ');
    waitSecs = info.check_after_secs || 5;
  }
  throw new Error('X video: หมดเวลารอ processing');
}

async function postVideoToX(guildId, userId, videoDiscordUrl, caption, groupName = null) {
  const cfg = await getXConfig(guildId, userId, groupName);
  if (!cfg) throw new Error('ไม่พบ X account — เพิ่ม X account ที่ /bot/social/accounts ก่อน');

  let buffer = await fetchBuffer(videoDiscordUrl);
  buffer = await convertVideoIfNeeded(buffer, videoDiscordUrl);
  const mediaId = await uploadVideoMedia(cfg, buffer);

  const tweetBody = { media: { media_ids: [mediaId] } };
  if (caption) tweetBody.text = caption.slice(0, 280);
  const bodyStr = JSON.stringify(tweetBody);
  const auth    = buildAuthHeader('POST', 'https://api.twitter.com/2/tweets', cfg);
  const res     = await xReq('api.twitter.com', '/2/tweets', 'POST', {
    Authorization:    auth,
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(bodyStr),
  }, bodyStr);

  if (res.status === 429) throw new Error('X API: Rate limit — รอแล้วลองใหม่');
  if (!res.body?.data?.id) throw new Error(`X video post: ${res.body?.errors?.[0]?.message || JSON.stringify(res.body)}`);
  const url = cfg.username ? `https://x.com/${cfg.username}/status/${res.body.data.id}` : null;
  return { id: res.body.data.id, url };
}

module.exports = { getXConfig, getGuildXApp, postToX, postVideoToX };
