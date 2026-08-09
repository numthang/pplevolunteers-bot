// services/postsRetention.js — เก็บกวาดไฟล์สื่อของ posts/ตะกร้าที่ "หมดหน้าที่แล้ว"
//
// ทำไมต้องมี (user ถาม 2026-07-30 "ดิสก์จะไม่พอไหม"): ก้อน 4c โหลดทั้งรูปและวิดีโอลงดิสก์
// คลิปทีมสื่อ 10–50 MB/ชิ้น ถ้าไม่มีใครลบเลย = โตเป็นเส้นตรงตลอดกาล
//
// หลักที่เคาะ: **ไฟล์ที่โพสต์ออกไปแล้วแทบไม่มีค่าต่อ** — ตัวจริงอยู่บน FB/IG แล้ว
// และยังมี `source_message_id` เป็นทางกลับไปข้อความต้นทางใน Discord
//   - คลิป  30 วันหลังโพสต์  (กินที่สุด · ตัดเร็ว)
//   - รูป  180 วันหลังโพสต์  (เล็ก เก็บยาวหน่อยเผื่อเอามาใช้ซ้ำ)
//   - โพสต์ที่**ยังไม่เคยเผยแพร่** ไม่ถูกแตะเลย ไม่ว่านานแค่ไหน
//   - การ์ดคำคม (kind='quote') ไม่แตะ — ไฟล์เล็ก และหน้าเว็บคาดว่ามีไฟล์อยู่
//
// ลบแค่ "ไฟล์" ไม่ลบ "แถว" → `path` กลับเป็น NULL, source_url/ประวัติยังอยู่ครบ
const fs = require('fs/promises');
const db = require('../db/index');
const storage = require('../utils/postsStorage');

const KEEP_DAYS = { video: 30, upload: 180 };

/**
 * @param {{dryRun?:boolean}} opts
 * @returns {{freed:number, bytes:number}}
 */
async function runRetention({ dryRun = false } = {}) {
  let freed = 0, bytes = 0;

  for (const [kind, days] of Object.entries(KEEP_DAYS)) {
    const { rows } = await db.query(
      `SELECT m.id, m.path
         FROM post_episode_media m
        WHERE m.kind = $1 AND m.path IS NOT NULL
          -- เผยแพร่ไปแล้วอย่างน้อย 1 แพลตฟอร์ม และนานเกินกำหนด
          AND EXISTS (
            SELECT 1 FROM post_social_history h
             WHERE h.episode_id = m.episode_id AND h.status = 'done'
               AND h.posted_at < now() - make_interval(days => $2)
          )
          -- ยังมีงานค้างในคิวของโพสต์นี้ = ห้ามแตะ (worker อาจต้องอ่านไฟล์)
          AND NOT EXISTS (
            SELECT 1 FROM post_social_history h2
             WHERE h2.episode_id = m.episode_id AND h2.status IN ('pending', 'running')
          )
          -- ⛔ ลบเฉพาะของที่ยังมี "ต้นฉบับ" อยู่ที่อื่น (เคาะ 2026-08-09 ตอนเปิดให้อัปคลิปจากเว็บ)
          --    คลิปจากตะกร้าดิสฯ มี source_url/source_message_id กลับไปหาไฟล์เดิมใน Discord ได้
          --    ส่วนคลิปที่อัปจากเว็บ **ไม่มีที่อื่นเก็บ** — ลบแล้วคือหายจริง จึงไม่แตะ
          AND (m.kind <> 'video' OR m.source_url IS NOT NULL)`,
      [kind, days]
    );

    for (const r of rows) {
      try {
        const size = await fs.stat(storage.absPath(r.path)).then(s => s.size).catch(() => 0);
        if (dryRun) { freed++; bytes += size; continue; }
        await storage.deleteFile(r.path);
        await db.query('UPDATE post_episode_media SET path = NULL WHERE id = $1', [r.id]);
        freed++; bytes += size;
      } catch (err) {
        console.error(`[retention] ข้ามสื่อ #${r.id}:`, err.message);
      }
    }
  }

  if (freed) {
    console.log(`[retention] ${dryRun ? '(dry) ' : ''}ลบไฟล์ที่โพสต์ไปแล้ว ${freed} ไฟล์ · คืนพื้นที่ ${(bytes / 1048576).toFixed(1)} MB`);
  }
  return { freed, bytes };
}

module.exports = { runRetention, KEEP_DAYS };
