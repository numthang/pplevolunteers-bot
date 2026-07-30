// รีเฟรชลิงก์ไฟล์แนบของ Discord ก่อนเอาไปใช้
//
// ปัญหา: ตั้งแต่ปลายปี 2023 ลิงก์ cdn.discordapp.com มีลายเซ็นหมดอายุติดมาด้วย (`?ex=&is=&hm=`)
// อายุราว 24 ชม. · ตะกร้าสื่อที่ค้างข้ามวันแล้วกดโพสต์จะดาวน์โหลดรูปไม่ได้ และวิดีโอที่ส่ง URL
// ให้ Meta ไปดึงเองก็พังเหมือนกัน (Meta ดึงตอนที่ลายเซ็นหมดอายุแล้ว)
//
// ทางแก้: endpoint `POST /attachments/refresh-urls` ของ Discord — ส่งลิงก์เก่าไป ได้ลิงก์ใหม่กลับมา
// (ทำงานตราบใดที่ข้อความต้นทางยังอยู่ · ถ้าข้อความถูกลบแล้วก็จบ ไม่มีใครช่วยได้)
const REFRESH_ROUTE = '/attachments/refresh-urls';
const MAX_PER_CALL  = 50;                        // Discord รับได้สูงสุด 50 ลิงก์ต่อครั้ง
const SKEW_MS       = 10 * 60 * 1000;            // เหลืออายุน้อยกว่านี้ = รีเฟรชไปเลย

/** ลิงก์ของ Discord ที่มีลายเซ็นหมดอายุ (`?ex=`) เท่านั้นที่ต้องรีเฟรช */
function isSignedDiscordUrl(url) {
  return typeof url === 'string'
    && /(^https:\/\/)(cdn\.discordapp\.com|media\.discordapp\.net)\//.test(url)
    && /[?&]ex=[0-9a-f]+/i.test(url);
}

/** ใกล้หมดอายุหรือหมดแล้วไหม — `ex` เป็น unix seconds เลขฐาน 16 */
function isExpiring(url, now = Date.now()) {
  const m = /[?&]ex=([0-9a-f]+)/i.exec(url || '');
  if (!m) return false;
  const expMs = parseInt(m[1], 16) * 1000;
  return !Number.isFinite(expMs) || expMs - now < SKEW_MS;
}

/**
 * คืน map เดิม→ใหม่ ของลิงก์ที่รีเฟรชสำเร็จ (ลิงก์ที่ไม่ต้องรีเฟรช/รีเฟรชไม่ได้ จะไม่อยู่ใน map)
 * ล้มเหลว = คืน map ว่าง ไม่ throw — ผู้เรียกใช้ลิงก์เดิมต่อแล้วให้ error path เดิมจัดการ
 */
async function refreshAttachmentUrls(client, urls) {
  const out = new Map();
  if (!client?.rest) return out;

  const targets = [...new Set(urls.filter(u => isSignedDiscordUrl(u) && isExpiring(u)))];
  for (let i = 0; i < targets.length; i += MAX_PER_CALL) {
    const batch = targets.slice(i, i + MAX_PER_CALL);
    try {
      const res = await client.rest.post(REFRESH_ROUTE, { body: { attachment_urls: batch } });
      for (const r of res?.refreshed_urls || []) {
        if (r?.original && r?.refreshed) out.set(r.original, r.refreshed);
      }
    } catch (err) {
      console.error('[discordAttachments] รีเฟรชลิงก์ไม่สำเร็จ:', err.message);
    }
  }
  return out;
}

/** สะดวกกว่าเวลาผู้เรียกมีแค่ array ของ url — คืน array ใหม่เรียงเดิม (ตัวที่รีเฟรชไม่ได้คงของเดิม) */
async function refreshUrlList(client, urls) {
  const map = await refreshAttachmentUrls(client, urls);
  return urls.map(u => map.get(u) || u);
}

module.exports = { refreshAttachmentUrls, refreshUrlList, isSignedDiscordUrl, isExpiring };
