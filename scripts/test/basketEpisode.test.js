// เทสตะกร้าสื่อหลังยุบเข้า post_episodes (ก้อน 4c) — ยิง DB จริง แล้วลบของที่สร้างทิ้งท้ายสุด
// รัน: node scripts/test/basketEpisode.test.js
//
// ที่ต้องพิสูจน์: ตะเข็บคืนรูปแบบแถวเดิม · 1 ห้อง = 1 ตะกร้าเปิด (บังคับที่ DB)
// · ล้างตะกร้า = archive ไม่ใช่ลบ · guild ที่ไม่มี org ยังใช้ได้ (org_id NULL)
require('dotenv').config();
const pool = require('../../db/index');
const b = require('../../db/mediaBasket');

const GUILD = '999000000000000001';        // ไม่มีใน dc_guilds → ทดสอบเส้น org_id NULL
const CH1 = '999000000000000101';
const CH2 = '999000000000000102';
const USER = '999000000000000201';

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✅' : '❌'} ${label}`, extra); };

(async () => {
  try {
    // 1) หย่อนรูป → เปิดตะกร้าใหม่ให้เอง
    await b.addImages(GUILD, CH1, USER, [{ url: 'https://cdn.test/a.png' }, { url: 'https://cdn.test/b.png' }], 'MSG1', 'ห้องทดสอบ');
    const ep = await b.getOpenEpisode(GUILD, CH1);
    ok('หย่อนรูป → เปิดตะกร้าให้อัตโนมัติ', !!ep);
    ok('guild ที่ยังไม่ผูก org → org_id NULL (โผล่แค่ในดิสฯ)', ep.org_id === null, `org_id=${ep.org_id}`);
    // 2026-07-30: ชื่อห้องอยู่ที่ channel_name แล้ว · category ต้อง "ว่าง" ไว้ให้คนจัดหมวดเอง
    ok('channel_name = ชื่อห้องต้นทาง', ep.channel_name === 'ห้องทดสอบ', ep.channel_name);
    ok('category ว่าง (ไม่ยัดชื่อห้อง)', ep.category == null, ep.category);

    // 2) รูปแบบแถวที่ handlers เดิมคาดหวัง
    let basket = await b.getBasket(GUILD, CH1);
    const imgs = basket.filter(r => r.type === 'image');
    ok('getBasket คืนแถวรูปครบ', imgs.length === 2, `${imgs.length} แถว`);
    ok('แถวมีฟิลด์เดิม (image_url/message_id/sort_order)',
       imgs[0].image_url === 'https://cdn.test/a.png' && imgs[0].message_id === 'MSG1' && imgs[0].sort_order === 0);
    ok('path ยัง NULL ตอนเพิ่งหย่อน (ไฟล์โหลดทีหลัง)', imgs[0].path === null);

    // 3) caption = body ของโพสต์ ไม่ใช่แถว
    await b.setCaption(GUILD, CH1, USER, 'บรรทัดแรก', null);
    await b.appendCaption(GUILD, CH1, USER, 'บรรทัดสอง', null);
    basket = await b.getBasket(GUILD, CH1);
    const cap = basket.find(r => r.type === 'caption');
    ok('appendCaption ต่อท้ายของเดิม', cap?.caption === 'บรรทัดแรก\n\nบรรทัดสอง', JSON.stringify(cap?.caption));
    const { rows: bodyRows } = await pool.query('SELECT body FROM post_episodes WHERE id = $1', [ep.id]);
    ok('caption เก็บที่ post_episodes.body จริง', bodyRows[0].body === 'บรรทัดแรก\n\nบรรทัดสอง');

    // 4) เรียงรูปใหม่
    await b.reorderImages(GUILD, CH1, [imgs[1].id, imgs[0].id]);
    basket = await b.getBasket(GUILD, CH1);
    ok('reorderImages สลับลำดับได้', basket.filter(r => r.type === 'image')[0].id === imgs[1].id);

    // 5) วิดีโอ
    await b.addVideo(GUILD, CH1, USER, [{ url: 'https://cdn.test/v.mp4' }], 'MSG2', 'ห้องทดสอบ');
    basket = await b.getBasket(GUILD, CH1);
    ok('addVideo → type=video', basket.filter(r => r.type === 'video').length === 1);
    ok('หย่อนซ้ำในห้องเดิม → ยังเป็นตะกร้าใบเดิม',
       (await b.getOpenEpisode(GUILD, CH1)).id === ep.id);

    // 6) ล้างตะกร้า = archive (ห้ามลบแถว — มันคือคอนเทนต์)
    await b.clearBasket(GUILD, CH1);
    ok('ล้างแล้วตะกร้าว่าง', (await b.getBasket(GUILD, CH1)).length === 0);
    const { rows: arch } = await pool.query('SELECT archived_at, channel_id FROM post_episodes WHERE id = $1', [ep.id]);
    ok('แถวยังอยู่ + archived_at ถูกตั้ง', !!arch[0] && !!arch[0].archived_at);
    ok('ยังรู้ว่ามาจากห้องไหน (provenance ไม่หาย)', arch[0].channel_id === CH1);

    // 7) ห้องว่างแล้ว → เปิดใบใหม่ได้
    await b.addImages(GUILD, CH1, USER, [{ url: 'https://cdn.test/c.png' }], 'MSG3', 'ห้องทดสอบ');
    const ep2 = await b.getOpenEpisode(GUILD, CH1);
    ok('เปิดตะกร้าใบใหม่ในห้องเดิมได้', !!ep2 && ep2.id !== ep.id);

    // 8) invariant ที่ DB บังคับ: 1 ห้อง เปิดได้ใบเดียว
    let blocked = false;
    await pool.query(
      `INSERT INTO post_episodes (org_id, owner_user_id, visibility, created_via, status, guild_id, channel_id)
       VALUES (NULL, NULL, 'org', 'manual', 'draft', $1, $2)`, [GUILD, CH1]
    ).catch(err => { blocked = err.code === '23505'; });
    ok('DB บล็อกตะกร้าเปิดใบที่ 2 ของห้องเดียวกัน', blocked);

    // 9) กู้คืนจากกรุเข้าห้องที่มีตะกร้าเปิดอยู่ → ต้องล้าง channel_id ไม่ใช่ตอบ error (เคาะ 2026-07-30)
    const { rows: conflict } = await pool.query(
      `SELECT 1 FROM post_episodes WHERE channel_id = $1 AND archived_at IS NULL AND id <> $2`, [CH1, ep.id]
    );
    ok('เช็คก่อนกู้คืนเจอว่าห้องไม่ว่าง', conflict.length === 1);

    // 10) คนละห้อง = คนละตะกร้า
    await b.addImages(GUILD, CH2, USER, [{ url: 'https://cdn.test/d.png' }], 'MSG4', 'ห้องสอง');
    ok('ห้องอื่นเปิดตะกร้าของตัวเองได้', (await b.getBasket(GUILD, CH2)).length === 1);
    ok('ตะกร้าห้องหนึ่งไม่ปนห้องสอง', (await b.getBasket(GUILD, CH1)).length === 1);

    // 11) กัน scope ข้าม guild
    ok('guild อื่นถาม channel เดียวกัน → ไม่เห็น', (await b.getBasket('999000000000000999', CH1)).length === 0);
  } catch (err) {
    fail++;
    console.error('❌ ระเบิด:', err);
  } finally {
    await pool.query(
      `DELETE FROM post_episodes WHERE guild_id IN ($1, '999000000000000999')`, [GUILD]
    ).catch(e => console.error('ลบของทดสอบไม่สำเร็จ:', e.message));
    console.log(`\n${fail ? '❌' : '✅'} ผ่าน ${pass} · ล้ม ${fail}`);
    await pool.end();
    process.exit(fail ? 1 : 0);
  }
})();
