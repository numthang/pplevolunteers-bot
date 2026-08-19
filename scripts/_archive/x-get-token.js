/**
 * PIN-based OAuth 1.0a — ขอ Access Token สำหรับ X account ใดก็ได้ แล้ว insert ลง DB
 * Usage: node scripts/x-get-token.js <API_KEY> <API_SECRET> [GUILD_ID] [visibility: public|private]
 */

const https    = require('https');
const crypto   = require('crypto');
const readline = require('readline');
const pool     = require('../../db/index');

const API_KEY    = process.env.X_CONSUMER_KEY    || process.argv[2];
const API_SECRET = process.env.X_CONSUMER_SECRET || process.argv[3];
const GUILD_ID   = process.env.GUILD_ID     || process.argv[4];
const VISIBILITY = process.argv[5] || 'private';

if (!API_KEY || !API_SECRET) {
  console.error('Usage: node scripts/x-get-token.js <API_KEY> <API_SECRET> [GUILD_ID] [public|private]');
  process.exit(1);
}

function pct(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildOAuthHeader(method, url, params, tokenSecret = '') {
  const o = {
    oauth_consumer_key:     API_KEY,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_version:          '1.0',
    ...params,
  };
  const paramStr = Object.keys(o).sort().map(k => `${pct(k)}=${pct(o[k])}`).join('&');
  const base     = `${method}&${pct(url)}&${pct(paramStr)}`;
  const sigKey   = `${pct(API_SECRET)}&${pct(tokenSecret)}`;
  o.oauth_signature = crypto.createHmac('sha1', sigKey).update(base).digest('base64');
  return 'OAuth ' + Object.keys(o).sort().map(k => `${pct(k)}="${pct(o[k])}"`).join(', ');
}

function xPost(path, authHeader, body = '') {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.twitter.com', path, method: 'POST',
      headers: {
        Authorization:    authHeader,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseQS(str) {
  return Object.fromEntries(str.split('&').map(p => p.split('=')));
}

function ask(rl, question) {
  return new Promise(res => rl.question(question, ans => res(ans.trim())));
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Step 1: ขอ request token
  console.log('\n🔑 ขอ request token...');
  const auth1 = buildOAuthHeader('POST', 'https://api.twitter.com/oauth/request_token', { oauth_callback: 'oob' });
  const r1 = await xPost('/oauth/request_token', auth1, 'oauth_callback=oob');
  if (r1.status !== 200) {
    console.error('❌ ขอ request token ไม่สำเร็จ:', r1.body);
    rl.close(); pool.end?.(); process.exit(1);
  }
  const { oauth_token: reqToken } = parseQS(r1.body);

  // Step 2: ให้ user เปิด URL แล้ว login ด้วย account ที่ต้องการ
  console.log('\n✅ เปิด URL นี้ในเบราว์เซอร์:\n');
  console.log(`   https://twitter.com/oauth/authorize?oauth_token=${reqToken}\n`);
  console.log('Login ด้วย X account ที่ต้องการ แล้วจะได้ PIN 7 หลัก\n');

  // Step 3: รับ PIN
  const pin = await ask(rl, '📌 ใส่ PIN: ');

  // Step 4: แลก PIN เป็น Access Token
  console.log('\n🔄 แลก PIN เป็น Access Token...');
  const auth2 = buildOAuthHeader('POST', 'https://api.twitter.com/oauth/access_token',
    { oauth_token: reqToken, oauth_verifier: pin });
  const r2 = await xPost('/oauth/access_token', auth2,
    `oauth_token=${reqToken}&oauth_verifier=${pin}`);
  if (r2.status !== 200) {
    console.error('❌ แลก token ไม่สำเร็จ:', r2.body);
    rl.close(); pool.end?.(); process.exit(1);
  }
  const result = parseQS(r2.body);
  const screenName = result.screen_name;

  console.log(`\n✅ ได้ token ของ @${screenName} แล้ว`);

  // Step 5: ถามชื่อที่แสดง + guild (ถ้ายังไม่ได้ระบุ)
  const name = await ask(rl, `ชื่อที่แสดงใน bot (กด Enter ใช้ "@${screenName}"): `) || `@${screenName}`;

  let guildId = GUILD_ID;
  if (!guildId) {
    const [guilds] = await pool.execute('SELECT guild_id, name FROM dc_guild_config GROUP BY guild_id LIMIT 10').catch(async () => {
      const [g] = await pool.execute('SELECT DISTINCT guild_id FROM dc_social_accounts LIMIT 10');
      return [g];
    });
    if (guilds.length === 1) {
      guildId = guilds[0].guild_id;
      console.log(`Guild: ${guilds[0].name || guildId}`);
    } else {
      guilds.forEach((g, i) => console.log(`  ${i + 1}. ${g.name || g.guild_id}`));
      const idx = await ask(rl, 'เลือก guild (หมายเลข): ');
      guildId = guilds[parseInt(idx) - 1]?.guild_id;
    }
  }

  const vis = await ask(rl, `visibility (public/private) [${VISIBILITY}]: `) || VISIBILITY;

  // Step 6: Discord ID (จำเป็นถ้า private)
  let discordId = null;
  if (vis === 'private') {
    const [members] = await pool.execute(
      `SELECT user_id, display_name FROM dc_members WHERE guild_id = ? ORDER BY display_name LIMIT 20`,
      [guildId]
    );
    if (members.length) {
      members.forEach((m, i) => console.log(`  ${i + 1}. ${m.display_name} (${m.user_id})`));
      const idx = await ask(rl, 'เลือก Discord user ของคุณ (หมายเลข หรือพิมพ์ Discord ID ตรงๆ): ');
      discordId = isNaN(idx) ? idx : members[parseInt(idx) - 1]?.user_id;
    } else {
      discordId = await ask(rl, 'Discord ID ของคุณ: ');
    }
  }

  rl.close();

  if (!guildId) {
    console.error('❌ ไม่ได้ระบุ guild_id');
    process.exit(1);
  }

  // Step 7: บันทึกลง DB
  const creds = JSON.stringify({
    api_key:              API_KEY,
    api_secret:           API_SECRET,
    access_token:         result.oauth_token,
    access_token_secret:  result.oauth_token_secret,
  });

  await pool.execute(
    `INSERT INTO dc_social_accounts (user_discord_id, guild_id, name, platform, social_id, access_token, visibility)
     VALUES (?, ?, ?, 'x', ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), access_token = VALUES(access_token), visibility = VALUES(visibility)`,
    [discordId, guildId, name, screenName, creds, vis]
  );

  console.log(`\n✅ บันทึก @${screenName} ลง DB แล้ว (${vis}${discordId ? `, discord: ${discordId}` : ''})\n`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
