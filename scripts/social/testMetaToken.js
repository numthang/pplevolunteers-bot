// node scripts/testMetaToken.js
require('dotenv').config({ override: true });
const pool = require('../../db/index');
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

async function main() {
  const [rows] = await pool.execute(
    `SELECT page_id, access_token, ig_id, name FROM dc_social_accounts WHERE platform = 'fb' AND ig_id IS NOT NULL LIMIT 3`
  );

  for (const r of rows) {
    console.log(`\n═══ ${r.name} (igId: ${r.ig_id}) ═══`);
    const token = r.access_token;

    // 1. token type + validity
    const debug = await httpsGet(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`);
    if (debug.data) {
      console.log('Token type  :', debug.data.type);
      console.log('Is valid    :', debug.data.is_valid);
      console.log('Expires     :', debug.data.expires_at ? new Date(debug.data.expires_at * 1000).toISOString() : 'never/long-lived');
      const igPerms = (debug.data.scopes || []).filter(s => s.includes('instagram'));
      console.log('IG scopes   :', igPerms.length ? igPerms.join(', ') : '(none)');
    } else {
      console.log('debug_token :', JSON.stringify(debug));
    }

    // 2. IG account reachable?
    const igInfo = await httpsGet(`https://graph.facebook.com/v22.0/${r.ig_id}?fields=id,name,username&access_token=${token}`);
    if (igInfo.error) {
      console.log('IG account  : ❌', igInfo.error.message, `(${igInfo.error.code}/${igInfo.error.error_subcode})`);
    } else {
      console.log('IG account  : ✅', igInfo.username || igInfo.name);
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
