// เทส worker คิวโพสต์ — ไม่ยิงออกเน็ตจริง (stub publishOne) แต่ใช้ DB จริง แล้วลบข้อมูลทดสอบทิ้ง
// รัน: node scripts/test/publishWorker.test.js
const path = require('path');
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

  // 8) accountId/orgId ส่งถึงท่อจริง
  const withAcc = seen.find(s => s.platform === 'fb');
  ok('ส่ง orgId + guildId + caption เข้าท่อ', withAcc?.orgId === 1 && withAcc?.guildId === '1111998833652678757' && withAcc?.caption === 'ทดสอบ');

  await cleanup();
  await pool.end();
})();
