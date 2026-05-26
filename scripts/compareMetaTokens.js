// node scripts/compareMetaTokens.js
require('dotenv').config({ override: true });
const pool = require('../db/index');
const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
    }).on('error', reject);
  });
}

async function checkToken(label, token) {
  if (!token) { console.log(`${label}: (ไม่มี)`); return; }
  const suffix = token.slice(-12);
  console.log(`${label}: ...${suffix} (length: ${token.length})`);
  const debug = await httpsGet(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`);
  if (debug.data) {
    console.log(`  type: ${debug.data.type}, valid: ${debug.data.is_valid}`);
  } else {
    console.log(`  debug_token error:`, JSON.stringify(debug));
  }
}

async function main() {
  // Old table
  const [oldRows] = await pool.execute(
    `SELECT guild_id, \`key\`, value FROM dc_guild_config WHERE \`key\` IN ('meta_page_token','meta_page_id','meta_ig_id') ORDER BY guild_id, \`key\``
  );

  // New table
  const [newRows] = await pool.execute(
    `SELECT owner_id, page_id, access_token, ig_id FROM dc_social_accounts WHERE platform = 'fb'`
  );

  const oldByGuild = {};
  for (const r of oldRows) {
    if (!oldByGuild[r.guild_id]) oldByGuild[r.guild_id] = {};
    oldByGuild[r.guild_id][r.key] = r.value;
  }

  for (const n of newRows) {
    const guildId = n.owner_id;
    const old = oldByGuild[guildId] || {};
    console.log(`\n═══ Guild ${guildId} ═══`);
    console.log(`ig_id  old: ${old.meta_ig_id || '(ไม่มี)'}  new: ${n.ig_id || '(ไม่มี)'}`);

    const oldToken = old.meta_page_token;
    const newToken = n.access_token;

    if (oldToken && newToken) {
      const same = oldToken === newToken;
      console.log(`token  same: ${same}`);
      if (!same) {
        await checkToken('OLD', oldToken);
        await checkToken('NEW', newToken);
      } else {
        await checkToken('TOKEN (same)', newToken);
      }
    } else {
      await checkToken('OLD', oldToken);
      await checkToken('NEW', newToken);
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
