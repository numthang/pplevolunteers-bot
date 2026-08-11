// scripts/checkMetaScopes.js — เช็คว่า token โซเชียลที่เก็บไว้ยังใช้ได้ และมี scope อะไรบ้าง
//
// ใช้ตอบคำถาม "reconnect แล้วได้ pages_manage_engagement มาจริงไหม" โดยไม่ต้องเปิด Meta App Dashboard
//
// PRODUCTION:
//   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/checkMetaScopes.js'
//
// อ่านอย่างเดียว ไม่เขียน DB ไม่โพสต์อะไรทั้งนั้น · ไม่พิมพ์ค่า token ออกมา
const https = require('https');
const pool = require('../db/index');
const { getGuildMetaApp } = require('../services/metaApi');

// scope ที่ระบบต้องใช้ — ต้องตรงกับ SCOPES ใน web/app/api/meta/oauth/start/route.js
const NEEDED = [
  'pages_manage_posts',
  'pages_show_list',
  'pages_manage_metadata',
  'pages_manage_engagement',   // คอมเมนต์ในนามเพจ (ย้ายลิงก์ไปคอมเมนต์แรก)
  'instagram_content_publish',
  'business_management',
];

function httpsGet(urlPath) {
  return new Promise((resolve, reject) => {
    https.request({ hostname: 'graph.facebook.com', path: urlPath, method: 'GET' }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
    }).on('error', reject).end();
  });
}

(async () => {
  const { rows } = await pool.query(
    `SELECT id, org_id, guild_id, name, group_name, platform, social_id, access_token, user_token
       FROM dc_social_accounts
      WHERE platform IN ('fb', 'ig')
      ORDER BY platform, id`
  );
  if (!rows.length) return console.log('ไม่มีบัญชี fb/ig ในตาราง dc_social_accounts');

  const appCache = new Map();
  // ⚠️ ต้องนับ "เช็คไม่ได้" แยกจาก "เช็คแล้วไม่มี" — ไม่งั้นตอน token ตายยกแผง
  //    สรุปท้ายจะขึ้น ✅ ทั้งที่ไม่เคยได้อ่าน scope เลยสักตัว (false-green)
  const fbOk = [];        // เช็คได้ + มี pages_manage_engagement
  const fbMissing = [];   // เช็คได้ แต่ไม่มี scope
  const fbUnknown = [];   // เช็คไม่ได้เลย (ไม่มี token / token ตาย / ไม่มี app creds)

  for (const r of rows) {
    const token = r.access_token || r.user_token;
    const kind = r.access_token ? 'page' : (r.user_token ? 'user' : null);
    const tag = `row ${r.id} ${r.name || ''}`.trim();
    const unknown = reason => { if (r.platform === 'fb') fbUnknown.push(`${tag} (${reason})`); };

    console.log('─'.repeat(70));
    console.log(`[${r.platform}] row ${r.id} · ${r.name || '(ไม่มีชื่อ)'} · group=${r.group_name || '-'}`);

    if (!token) { console.log('   ⚠️  ไม่มี token เลย — ต้อง connect'); unknown('ไม่มี token'); continue; }

    // app creds เป็นราย org — cache ไว้ไม่ให้ query ซ้ำ
    const key = `${r.org_id}:${r.guild_id}`;
    if (!appCache.has(key)) appCache.set(key, await getGuildMetaApp(r.guild_id, r.org_id));
    const app = appCache.get(key);
    if (!app) { console.log('   ⚠️  org นี้ยังไม่ได้ตั้ง meta_app_id/secret — ข้าม'); unknown('ไม่มี app creds'); continue; }

    const res = await httpsGet(
      `/debug_token?input_token=${encodeURIComponent(token)}` +
      `&access_token=${encodeURIComponent(`${app.app_id}|${app.app_secret}`)}`
    );
    const d = res.data || {};
    const err = res.error || d.error;
    if (err) { console.log(`   ❌ token (${kind}) ใช้ไม่ได้: ${err.message}`); unknown('token ใช้ไม่ได้'); continue; }

    const scopes = d.scopes || [];
    const exp = d.expires_at ? new Date(d.expires_at * 1000).toISOString().slice(0, 10) : 'ไม่หมดอายุ';
    console.log(`   token=${kind} · valid=${d.is_valid ? '✅' : '❌'} · หมดอายุ ${exp}`);

    for (const s of NEEDED) console.log(`     ${scopes.includes(s) ? '✅' : '⬜'} ${s}`);
    const extra = scopes.filter(s => !NEEDED.includes(s));
    if (extra.length) console.log(`     (อื่นๆ: ${extra.join(', ')})`);

    if (r.platform === 'fb') {
      (scopes.includes('pages_manage_engagement') ? fbOk : fbMissing).push(tag);
    }
  }

  console.log('─'.repeat(70));
  console.log('สรุปเฉพาะ Facebook — สิทธิ์คอมเมนต์ (pages_manage_engagement)');
  if (fbOk.length)      console.log(`  ✅ พร้อมใช้ ${fbOk.length}: ${fbOk.join(' · ')}`);
  if (fbMissing.length) console.log(`  ⚠️  ยังไม่มีสิทธิ์ ${fbMissing.length}: ${fbMissing.join(' · ')} → reconnect ที่ /org/settings/social`);
  if (fbUnknown.length) console.log(`  ❓ เช็คไม่ได้ ${fbUnknown.length}: ${fbUnknown.join(' · ')}`);
  if (!fbOk.length && !fbMissing.length) console.log('  ⛔ ไม่มีบัญชี fb ตัวไหนเช็คได้เลย — ยังสรุปอะไรไม่ได้');

  await pool.end();
  process.exit(fbOk.length && !fbMissing.length && !fbUnknown.length ? 0 : 1);
})().catch(e => { console.error('ล้มเหลว:', e.message); process.exit(1); });
