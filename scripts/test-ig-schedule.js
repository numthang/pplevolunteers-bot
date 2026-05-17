// scripts/test-ig-schedule.js — ทดสอบว่า IG scheduled publishing ใช้ได้ไหม
// ไม่โพสต์จริง แค่สร้าง container แล้วเช็ค status
//
// รัน: node scripts/test-ig-schedule.js

require('dotenv').config();
const https = require('https');
const pool  = require('../db/index');

const GUILD_ID = process.env.GUILD_ID;
const IMAGE_URL = 'https://pplevolunteers.org/api/media-temp/f10e2e8aededfc2f1f62b3d5.jpg';

function post(urlPath, fields) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams(fields).toString();
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
    });
    req.on('error', reject);
    req.write(params);
    req.end();
  });
}

async function main() {
  const [rows] = await pool.execute(
    `SELECT \`key\`, value FROM dc_guild_config WHERE guild_id = ? AND \`key\` IN ('meta_ig_id','meta_page_token')`,
    [GUILD_ID]
  );
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (!cfg.meta_ig_id || !cfg.meta_page_token) {
    console.error('❌ ไม่พบ meta_ig_id หรือ meta_page_token ใน dc_guild_config');
    process.exit(1);
  }

  const scheduleTime = Math.floor(Date.now() / 1000) + 3600; // 1 ชั่วโมงข้างหน้า
  console.log(`📷 IG ID: ${cfg.meta_ig_id}`);
  console.log(`🕐 scheduled_publish_time: ${scheduleTime} (${new Date(scheduleTime * 1000).toLocaleString('th-TH')})`);
  console.log('🔄 กำลังสร้าง container...\n');

  const res = await post(`/v22.0/${cfg.meta_ig_id}/media`, {
    image_url: IMAGE_URL,
    caption: 'test scheduled',
    published: 'false',
    scheduled_publish_time: String(scheduleTime),
    access_token: cfg.meta_page_token,
  });

  if (res.error) {
    console.log('❌ ไม่ได้รับ permission scheduled publishing');
    console.log(`   ${res.error.message}`);
  } else {
    console.log(`✅ Scheduled publishing ใช้ได้! container id: ${res.id}`);
    console.log('   (container หมดอายุเองใน 24 ชั่วโมง ไม่มีอะไรโพสต์จริง)');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
