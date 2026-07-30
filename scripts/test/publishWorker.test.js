// เทส worker คิวโพสต์ — ไม่ยิงออกเน็ตจริง (stub publishOne) แต่ใช้ DB จริง แล้วลบข้อมูลทดสอบทิ้ง
// รัน: node scripts/test/publishWorker.test.js
// ตั้งก่อน require ทุกอย่าง — metaApi คำนวณ TEMP_URL ตอนโหลดโมดูล
process.env.WEB_BASE_URL = process.env.WEB_BASE_URL || 'http://localhost:3000';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');

// stub ท่อโพสต์ก่อน require worker — คุมได้ว่าให้สำเร็จ/ล้ม แล้วดูว่า worker จัดการสถานะถูกไหม
let behavior = () => ({ ok: true, url: 'https://ok.test/1', error: null });
const seen = [];
const realPipeline = require(ROOT + '/services/publishPipeline');
require.cache[require.resolve(ROOT + '/services/publishPipeline')] = {
  exports: {
    ...realPipeline,
    publishOne: async (args) => { seen.push(args); return { platform: args.platform, label: args.platform, ...behavior(args) }; },
  },
};

const pool = require(ROOT + '/db/index');
const { runOnce } = require(ROOT + '/services/publishWorker');

const CH = 'TESTWORKER';
const ok = (label, cond, extra = '') => console.log(`${cond ? '✅' : '❌'} ${label}`, extra);

async function addJob({ platform = 'fb', scheduledAt = null, attempts = 0, media = '[]', status = 'pending' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO post_social_history (org_id, batch_id, platform, guild_id, channel_id, caption, media, scheduled_at, status, attempts, created_by_discord_id)
     VALUES (1, gen_random_uuid(), $1, '1111998833652678757', $2, 'ทดสอบ', $3::jsonb, $4, $5, $6, '1')
     RETURNING id, batch_id`,
    [platform, CH, media, scheduledAt, status, attempts]
  );
  return rows[0];
}
const getJob = async id => (await pool.query(`SELECT * FROM post_social_history WHERE id = $1`, [id])).rows[0];
const cleanup = () => pool.query(`DELETE FROM post_social_history WHERE channel_id = $1`, [CH]);

(async () => {
  await cleanup();
  const sent = [];
  const fakeClient = {
    channels: { fetch: async () => ({ isTextBased: () => true, send: async m => sent.push(m) }) },
    guilds:   { fetch: async () => ({ id: 'G' }) },
  };

  // 1) งานพร้อมยิง → done + เก็บ url + แจ้งกลับห้อง
  const j1 = await addJob({ platform: 'fb' });
  await runOnce(fakeClient);
  let r = await getJob(j1.id);
  ok('งานพร้อมยิง → done', r.status === 'done' && r.result?.url === 'https://ok.test/1', `status=${r.status}`);
  ok('นับ attempts + ลง posted_at', r.attempts === 1 && !!r.posted_at);
  ok('แจ้งกลับห้องต้นทาง (backlink)', sent.length === 1 && sent[0].includes('https://ok.test/1'), sent[0]?.slice(0, 60));

  // 2) ตั้งเวลาอนาคต → ยังไม่หยิบ
  const j2 = await addJob({ scheduledAt: new Date(Date.now() + 3600e3) });
  await runOnce(fakeClient);
  ok('ตั้งเวลาอนาคต → ยังไม่ยิง', (await getJob(j2.id)).status === 'pending');

  // 3) เลยเวลาเกิน 2 ชม. → stale (ไม่ยิงเงียบๆ)
  const j3 = await addJob({ scheduledAt: new Date(Date.now() - 3 * 3600e3) });
  await runOnce(fakeClient);
  ok('เลยเวลาเกิน grace 2 ชม. → stale', (await getJob(j3.id)).status === 'stale');

  // 4) เลยเวลาไม่เกิน grace → ยิงเลย
  const j4 = await addJob({ scheduledAt: new Date(Date.now() - 30 * 60e3) });
  await runOnce(fakeClient);
  ok('เลยเวลาไม่ถึง 2 ชม. → ยิงเลย', (await getJob(j4.id)).status === 'done');

  // 5) ล้มแต่ยังไม่ครบ 3 ครั้ง → กลับเข้าคิว
  behavior = () => ({ ok: false, url: null, error: 'พังชั่วคราว' });
  const j5 = await addJob({ attempts: 0 });
  await runOnce(fakeClient);
  r = await getJob(j5.id);
  ok('ล้มครั้งแรก → กลับเป็น pending + เก็บ last_error', r.status === 'pending' && r.last_error === 'พังชั่วคราว');

  // 6) ล้มครั้งที่ 3 → failed ถาวร
  const j6 = await addJob({ attempts: 2 });
  await runOnce(fakeClient);
  ok('ล้มครบ 3 ครั้ง → failed', (await getJob(j6.id)).status === 'failed');

  // 7) สื่อชี้นอก storage/ → ปฏิเสธ (กัน path traversal ของงานที่ถูกยัดมา)
  behavior = () => ({ ok: true, url: 'x', error: null });
  const j7 = await addJob({ attempts: 2, media: JSON.stringify([{ kind: 'upload', path: '../../etc/passwd' }]) });
  await runOnce(fakeClient);
  r = await getJob(j7.id);
  ok('สื่อนอก storage/ → failed ไม่แตะไฟล์', r.status === 'failed' && /นอก storage/.test(r.last_error || ''), r.last_error);

  // 8) ลายน้ำ — ค่าในแถวงานคือ input จากภายนอก ต้องกันหลุดออกนอก assets/watermark
  const { resolveWatermark } = require(ROOT + '/services/publishWorker');
  const wmReal = 'path:1111998833652678757/ประชาชนราชบุรี/2. pplerb-white-orange.png';
  ok('ลายน้ำที่มีจริง → คืน absolute path', (await resolveWatermark(wmReal))?.endsWith('2. pplerb-white-orange.png'));
  ok('ไม่มีลายน้ำ / none → null', (await resolveWatermark(null)) === null && (await resolveWatermark('none')) === null);
  ok('path traversal → null ไม่แตะไฟล์', (await resolveWatermark('path:../../../etc/passwd')) === null);
  ok('token เก่าของตะกร้าดิสฯ → null (เว็บไม่ใช้)', (await resolveWatermark('guild:pple-orange.png')) === null);
  ok('ไฟล์ไม่มีจริง → null (ไม่ล้มทั้งงาน)', (await resolveWatermark('path:1111998833652678757/ไม่มีจริง.png')) === null);

  // 9) วิดีโอจากเว็บ (ไฟล์ใน storage/) ต้องกลายเป็น URL สาธารณะให้ Meta ดึง
  const vidRel = 'storage/posts/__test_clip.mp4';
  fs.mkdirSync(path.join(ROOT, 'storage', 'posts'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, vidRel), Buffer.from('fake-mp4'));
  const seenBefore = seen.length;                       // เทสข้อ 10 ยังต้องใช้ของเก่าใน seen อยู่
  const j9 = await addJob({ platform: 'ig', media: JSON.stringify([{ kind: 'video', path: vidRel }]) });
  await runOnce(fakeClient);
  const vidJob = seen.slice(seenBefore).find(s => s.platform === 'ig');
  ok('วิดีโอจากเว็บ → ได้ URL media-temp ไม่ใช่ path ดิบ',
     /^https?:\/\/.+\/media-temp\/[0-9a-f]{24}\.mp4$/.test(vidJob?.videoUrl || ''), vidJob?.videoUrl);
  ok('งานวิดีโอจบเป็น done', (await getJob(j9.id)).status === 'done');
  fs.unlinkSync(path.join(ROOT, vidRel));

  // 10) รีเฟรชลิงก์ Discord ที่หมดอายุ (บั๊กรูปตะกร้าตายใน 24 ชม.)
  const { isSignedDiscordUrl, isExpiring, refreshAttachmentUrls } = require(ROOT + '/services/discordAttachments');
  const hex = s => Math.floor(s).toString(16);
  const past   = `https://cdn.discordapp.com/attachments/1/2/a.png?ex=${hex(Date.now() / 1000 - 3600)}&is=x&hm=y`;
  const future = `https://cdn.discordapp.com/attachments/1/2/a.png?ex=${hex(Date.now() / 1000 + 86400)}&is=x&hm=y`;
  ok('ลิงก์ Discord ที่มีลายเซ็น → รู้จัก', isSignedDiscordUrl(past) && !isSignedDiscordUrl('https://example.com/a.png'));
  ok('หมดอายุแล้ว → ต้องรีเฟรช', isExpiring(past) === true);
  ok('ยังไม่หมดอายุ → ไม่ต้องรีเฟรช', isExpiring(future) === false);
  const restCalls = [];
  const restClient = { rest: { post: async (route, opts) => {
    restCalls.push({ route, urls: opts.body.attachment_urls });
    return { refreshed_urls: opts.body.attachment_urls.map(u => ({ original: u, refreshed: u + '&NEW' })) };
  } } };
  const map = await refreshAttachmentUrls(restClient, [past, future, 'https://example.com/a.png']);
  ok('ส่งเฉพาะลิงก์ที่หมดอายุไปขอใหม่', restCalls.length === 1 && restCalls[0].urls.length === 1 && restCalls[0].urls[0] === past);
  ok('ได้ลิงก์ใหม่กลับมา map ถูกตัว', map.get(past) === past + '&NEW' && !map.has(future));
  ok('ไม่มี client → ไม่พัง คืน map ว่าง', (await refreshAttachmentUrls(null, [past])).size === 0);

  // 11) accountId/orgId ส่งถึงท่อจริง
  const withAcc = seen.find(s => s.platform === 'fb');
  ok('ส่ง orgId + guildId + caption เข้าท่อ', withAcc?.orgId === 1 && withAcc?.guildId === '1111998833652678757' && withAcc?.caption === 'ทดสอบ');

  await cleanup();
  await pool.end();
})();
