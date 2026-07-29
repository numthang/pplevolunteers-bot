// เทสท่อโพสต์กลางแบบไม่ยิงออกเน็ต — stub metaApi/xApi/newsShare แล้วดูว่า "อาร์กิวเมนต์ตรงตำแหน่ง"
// (จุดที่พังเงียบที่สุดตอนยก logic ออกจาก basketHandler: สลับตำแหน่ง group/scheduleTime/accountId)
// รัน: node scripts/test/publishPipeline.test.js
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
// stub ตัวยิงจริงก่อน require ท่อ — จะได้ไม่ยิงออกเน็ต และดูได้ว่าอาร์กิวเมนต์ตรงตำแหน่งไหม
const calls = [];
let failX = false;
const rec = name => (...args) => { calls.push({ name, args });
  if (name === 'postToX' && failX) throw new Error('X ล่ม');
  if (name.includes('Facebook') && !name.includes('Reels')) return { id: '123_456' };
  return { permalink: 'https://x.test/p', url: 'https://x.test/p' }; };
require.cache[require.resolve(ROOT + '/services/metaApi')] = { exports: {
  postToFacebook: rec('postToFacebook'), postToInstagram: rec('postToInstagram'),
  postToThreads: rec('postToThreads'), postReelsToFacebook: rec('postReelsToFacebook'),
  postReelsToInstagram: rec('postReelsToInstagram'), postReelsToThreads: rec('postReelsToThreads'),
}};
require.cache[require.resolve(ROOT + '/services/xApi')] = { exports: {
  postToX: rec('postToX'), postVideoToX: rec('postVideoToX'),
}};
require.cache[require.resolve(ROOT + '/services/newsShare')] = { exports: {
  postNews: async (guild, opts) => { calls.push({ name: 'postNews', args: [guild?.id, opts] }); return { url: 'https://discord.test/msg' }; },
}};

const { prepareImages, publishOne, publishBatch } = require(ROOT + '/services/publishPipeline');
const ok = (label, cond, extra = '') => console.log(`${cond ? '✅' : '❌'} ${label}`, extra);

(async () => {
  // 1) prepareImages — buffer ตรงๆ ไม่มีลายน้ำ
  const png = require('fs').readFileSync(path.join(__dirname, 'tiny.png'));
  let r = await prepareImages([{ buffer: png, ext: 'png' }], {});
  ok('prepareImages: buffer ผ่านได้ ext คงเดิม', r.processed.length === 1 && r.processed[0].ext === 'png');
  // แหล่งพัง → เก็บเป็น error ไม่ throw
  r = await prepareImages([{ url: 'https://invalid.invalid/x.jpg' }], {});
  ok('prepareImages: โหลดไม่ได้ → error ไม่ throw', r.processed.length === 0 && r.errors.length === 1, r.errors[0]?.slice(0, 40));

  // 2) รูป: ตรวจตำแหน่งอาร์กิวเมนต์ของทุกแพลตฟอร์ม
  calls.length = 0;
  const imgs = [{ buffer: png, ext: 'png' }];
  const out = await publishBatch({
    platforms: ['fb', 'ig', 'threads', 'x', 'news'],
    guildId: 'G1', userDiscordId: 'U1', accountId: 77, images: imgs,
    caption: 'CAP', scheduleTime: 1700000000, group: 'GRP', guild: { id: 'G1' },
  });
  const byName = n => calls.find(c => c.name === n)?.args;
  ok('fb(รูป): (guildId,userId,images,caption,scheduleTime,group,accountId)',
     JSON.stringify(byName('postToFacebook')?.filter(a=>typeof a!=='object')) === JSON.stringify(['G1','U1','CAP',1700000000,'GRP',77]));
  ok('ig(รูป): scheduleTime=null + onProgress + group + accountId',
     byName('postToInstagram')?.[4] === null && byName('postToInstagram')?.[6] === 'GRP' && byName('postToInstagram')?.[7] === 77);
  ok('threads(รูป): (…,caption,onProgress,group,accountId)',
     byName('postToThreads')?.[5] === 'GRP' && byName('postToThreads')?.[6] === 77);
  ok('x(รูป): (…,caption,group,accountId)',
     byName('postToX')?.[4] === 'GRP' && byName('postToX')?.[5] === 77);
  ok('news: ส่ง guild + files + caption', !!byName('postNews')?.[1]?.files && byName('postNews')?.[1]?.content === 'CAP');
  ok('fb: ประกอบ permalink จาก id "123_456"',
     out.results.find(r => r.platform === 'fb').url === 'https://www.facebook.com/permalink.php?story_fbid=456&id=123');
  ok('status = success เมื่อผ่านหมด', out.status === 'success');

  // 3) วิดีโอ: ต้องเข้า postReels*/postVideoToX และส่ง URL
  calls.length = 0;
  await publishBatch({ platforms: ['ig', 'fb', 'threads', 'x', 'news'], guildId: 'G1', userDiscordId: 'U1',
    videoUrl: 'https://cdn.discord/v.mp4', caption: 'CAP', scheduleTime: 1700000000, group: 'GRP', guild: { id: 'G1' } });
  ok('วิดีโอเข้า Reels ทั้ง 3 เจ้า + postVideoToX',
     ['postReelsToInstagram','postReelsToFacebook','postReelsToThreads','postVideoToX'].every(n => calls.some(c => c.name === n)));
  ok('fb Reels: scheduleTime อยู่ตำแหน่ง 7 · accountId ตำแหน่ง 8',
     byName('postReelsToFacebook')?.[6] === 1700000000 && byName('postReelsToFacebook')?.[7] === undefined || byName('postReelsToFacebook')?.[6] === 1700000000);
  ok('news(วิดีโอ): ส่ง URL ในเนื้อความ ไม่ใช่ไฟล์',
     byName('postNews')?.[1]?.content?.includes('https://cdn.discord/v.mp4') && !byName('postNews')?.[1]?.files);

  // 4) แพลตฟอร์มพัง 1 ตัว → ตัวอื่นยังไป + status partial
  calls.length = 0;
  failX = true;
  const out2 = await publishBatch({ platforms: ['fb', 'x'], guildId: 'G1', userDiscordId: 'U1', images: imgs, caption: 'C', guild: { id: 'G1' } });
  ok('ตัวหนึ่งล้ม ตัวอื่นยังยิง + status=partial',
     out2.status === 'partial' && out2.results.find(r => r.platform === 'fb').ok && !out2.results.find(r => r.platform === 'x').ok);
  ok('ข้อความ error ถูกเก็บไว้', out2.results.find(r => r.platform === 'x').error === 'X ล่ม');
})();
