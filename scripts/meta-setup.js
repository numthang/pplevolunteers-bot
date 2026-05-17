// scripts/meta-setup.js — manual fallback
// วิธีที่แนะนำ (ไม่ต้องรัน script นี้):
//   เปิดใน browser ในฐานะ Admin: https://pplevolunteers.org/api/meta/oauth/start?guild_id=GUILD_ID
//   → ระบบจะทำทุกอย่างอัตโนมัติ
//
// ใช้ script นี้เฉพาะเมื่อ web OAuth ใช้ไม่ได้:
//   node scripts/meta-setup.js SHORT_LIVED_TOKEN
//
// Token 2 แบบ — script detect อัตโนมัติจาก prefix:
//
// [Facebook/Instagram] token ขึ้นต้น EAA:
//   1. ไป https://developers.facebook.com/tools/explorer
//   2. เลือก App "Peoples' Volunteers"
//   3. Add permissions: pages_manage_posts, pages_show_list, instagram_content_publish, pages_manage_metadata, business_management
//   4. Generate Access Token → copy token
//
// [Threads] token ขึ้นต้น THAA:
//   1. ไป https://developers.facebook.com/tools/explorer
//   2. เปลี่ยน base URL เป็น graph.threads.net
//   3. Generate Threads Token → copy token

require('dotenv').config();
const https = require('https');
const pool  = require('../db/index');

const APP_ID     = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;

if (!APP_ID || !APP_SECRET) {
  console.error('❌ META_APP_ID หรือ META_APP_SECRET ไม่ได้ตั้งค่าใน .env');
  process.exit(1);
}

const shortToken = process.argv[2];
const targetGuildId = process.argv[3] || null;
if (!shortToken) {
  console.error('❌ ใส่ User Token ด้วย: node scripts/meta-setup.js SHORT_LIVED_TOKEN [GUILD_ID]');
  process.exit(1);
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(data)); }
      });
    }).on('error', reject);
  });
}

async function upsert(guildId, key, value) {
  await pool.execute(
    `INSERT INTO dc_guild_config (guild_id, \`key\`, value) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [guildId, key, value]
  );
}

async function handleThreads(shortToken) {
  console.log('🔄 แปลง Threads token เป็น long-lived...');
  const exchangeRes = await get(
    `https://graph.threads.net/access_token` +
    `?grant_type=th_exchange_token` +
    `&client_id=${APP_ID}` +
    `&client_secret=${APP_SECRET}` +
    `&access_token=${shortToken}`
  );
  if (exchangeRes.error) throw new Error(`Threads exchange failed: ${exchangeRes.error.message}`);
  const longToken = exchangeRes.access_token;
  console.log('✅ ได้ long-lived Threads token แล้ว');

  const meRes = await get(`https://graph.threads.net/v1.0/me?fields=id,name&access_token=${longToken}`);
  if (meRes.error) throw new Error(`Threads /me failed: ${meRes.error.message}`);
  const threadsId = meRes.id;
  console.log(`\n📱 Threads: ${meRes.name} (${threadsId})`);

  const [rows] = await pool.execute(
    targetGuildId
      ? `SELECT DISTINCT guild_id FROM dc_guild_config WHERE \`key\` = 'meta_page_id' AND guild_id = ?`
      : `SELECT DISTINCT guild_id FROM dc_guild_config WHERE \`key\` = 'meta_page_id'`,
    targetGuildId ? [targetGuildId] : []
  );
  if (!rows.length) {
    console.log('⚠️  ยังไม่มี guild ผูก meta — insert เองด้วย SQL:');
    console.log(`   INSERT INTO dc_guild_config (guild_id, \`key\`, value) VALUES`);
    console.log(`     ('YOUR_GUILD_ID', 'meta_threads_id',    '${threadsId}'),`);
    console.log(`     ('YOUR_GUILD_ID', 'meta_threads_token', '${longToken}')`);
    console.log(`   ON DUPLICATE KEY UPDATE value = VALUES(value);`);
  } else {
    for (const row of rows) {
      await upsert(row.guild_id, 'meta_threads_id', threadsId);
      await upsert(row.guild_id, 'meta_threads_token', longToken);
      console.log(`✅ อัพเดท Threads config สำหรับ guild ${row.guild_id}`);
    }
  }
}

async function main() {
  if (shortToken.startsWith('THAA')) {
    await handleThreads(shortToken);
    console.log('\n🎉 เสร็จแล้ว');
    process.exit(0);
  }

  // 1. Exchange short-lived → long-lived user token
  console.log('🔄 แปลงเป็น long-lived token...');
  const exchangeRes = await get(
    `https://graph.facebook.com/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${APP_ID}` +
    `&client_secret=${APP_SECRET}` +
    `&fb_exchange_token=${shortToken}`
  );
  if (exchangeRes.error) throw new Error(`Exchange failed: ${exchangeRes.error.message}`);
  const longToken = exchangeRes.access_token;
  console.log('✅ ได้ long-lived user token แล้ว');

  // 2. ดึง Page Access Tokens ทุก Page
  console.log('📄 ดึง Page list...');
  const accountsRes = await get(
    `https://graph.facebook.com/v22.0/me/accounts` +
    `?fields=id,name,access_token` +
    `&access_token=${longToken}`
  );
  if (accountsRes.error) throw new Error(`Accounts failed: ${accountsRes.error.message}`);

  const pages = accountsRes.data || [];
  if (!pages.length) {
    console.log('⚠️ ไม่พบ Page ที่มีสิทธิ์ admin');
    process.exit(0);
  }

  console.log(`\n📋 พบ ${pages.length} Page:\n`);

  // 3. ดึง IG Business Account ID ของแต่ละ Page
  for (const page of pages) {
    console.log(`  📘 ${page.name} (${page.id})`);

    let igId = null;
    const igRes = await get(
      `https://graph.facebook.com/v22.0/${page.id}` +
      `?fields=instagram_business_account` +
      `&access_token=${page.access_token}`
    );
    if (igRes.instagram_business_account?.id) {
      igId = igRes.instagram_business_account.id;
      console.log(`  📷 Instagram: ${igId}`);
    }

    // 4. ดึง guild_id ที่ผูกกับ Page นี้จาก dc_guild_config
    const [rows] = await pool.execute(
      `SELECT guild_id FROM dc_guild_config WHERE \`key\` = 'meta_page_id' AND value = ?`,
      [page.id]
    );

    if (rows.length) {
      // มี guild ผูกอยู่แล้ว → update token + ig id
      for (const row of rows) {
        await upsert(row.guild_id, 'meta_page_token', page.access_token);
        if (igId) await upsert(row.guild_id, 'meta_ig_id', igId);
        console.log(`  ✅ อัพเดท token สำหรับ guild ${row.guild_id}`);
      }
    } else {
      // ยังไม่มี guild ผูก → แสดงค่าให้ insert เอง
      console.log(`  ⚠️  ยังไม่มี guild ผูกกับ Page นี้ — insert เองด้วย SQL:`);
      console.log(`     INSERT INTO dc_guild_config (guild_id, \`key\`, value) VALUES`);
      console.log(`       ('YOUR_GUILD_ID', 'meta_page_id',    '${page.id}'),`);
      if (igId) console.log(`       ('YOUR_GUILD_ID', 'meta_ig_id',      '${igId}'),`);
      console.log(`       ('YOUR_GUILD_ID', 'meta_page_token', '${page.access_token}')`);
      console.log(`     ON DUPLICATE KEY UPDATE value = VALUES(value);`);
    }
    console.log('');
  }

  console.log('🎉 เสร็จแล้ว');
  process.exit(0);
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
