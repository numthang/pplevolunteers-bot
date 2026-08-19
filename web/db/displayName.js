// web/db/displayName.js — สูตร "ชื่อคนที่เอาไว้โชว์" ของทั้งระบบ (SQL fragment ที่ใครก็ประกอบใช้ได้)
//
// ⭐ ทำไมต้องมีไฟล์นี้: สูตรนี้เคยถูกก็อปไว้ 2 ที่ (db/kanban/cards.js กับ db/kanban/people.js)
//    พร้อมคอมเมนต์เตือนกันเองว่า "แก้ที่ไหนต้องแก้อีกที่ด้วย" — ซึ่งแปลว่าวันหนึ่งมันจะดริฟต์แน่นอน
//    ตอนนี้เหลือที่เดียว: แก้ตรงนี้ = เปลี่ยนพร้อมกันทุกจุดที่ import ไป
//
// 📌 ลำดับที่เลือก (user เคาะ 2026-08-19) — ไล่จาก "ชื่อที่เพื่อนร่วมทีมจำได้" ลงไปหา "ชื่อที่พอระบุตัวได้":
//      1. org_members.display_name  ← ชื่อที่เห็นในดิสคอร์ด (7,100 / 7,490 คนใน org 1 มี = 95%)
//      2. org_members.nickname      ← ชื่อเล่นที่ตั้งไว้ในระบบ (1,315 คน)
//      3. users.firstname lastname  ← ชื่อจริง (1,402 คน — น้อยกว่าที่คิดมาก)
//      4. users.username            ← ชื่อล็อกอินดิสคอร์ด (ทุกคนมี แต่เป็น 'mark30260' อ่านไม่รู้เรื่อง)
//
//    ของเดิมเริ่มที่ข้อ 3 → คน 81% ตกไปข้อ 4 = การ์ดโชว์ 'mark30260' แทนที่จะเป็น 'Mark'
//    (user เจอเองตอนไล่ดูเจ้าภาพหลัง import 2026-08-19)
//
// ⚠️ **คนเดียวมีได้หลายแถวใน org เดียว** — org_members แยกแถวต่อ guild และ org 1 คร่อม 3 guild
//    (708 คนมีแถวซ้ำ · เช่น user 2353 = "เมฆ นรพนธ์ เขต1" ในกิลด์หนึ่ง / "เมฆ ราชบุรี เขต1" อีกกิลด์)
//    → ต้อง ORDER BY + LIMIT 1 เสมอ ไม่งั้น subquery คืนหลายแถว = error 21000 ตอน runtime
//    เลือกแถว id น้อยสุดที่มีชื่อ — ไม่ได้ "ถูกกว่า" แถวอื่น แค่**ตัดสินใจเหมือนเดิมทุกครั้ง**
//    (ชื่อกระพริบสลับไปมาระหว่างโหลดคือบั๊กที่หาสาเหตุยากกว่าชื่อที่เลือกไม่ถูกใจ)
//
// ⚠️ ต้องมี index (user_id, org_id) ไม่งั้นเป็น seq scan ต่อ 1 คนต่อ 1 แถว — อยู่ใน migration.sql แล้ว

/**
 * @param {string} u     alias ของตาราง users ใน query ที่จะเอาไปแปะ
 * @param {string} org   นิพจน์ org_id — ใส่คอลัมน์ ('c.org_id') หรือ placeholder ('$1') ก็ได้
 * @returns {string} SQL scalar expression — ใส่ใน SELECT / ORDER BY ได้เลย
 */
export function displayNameSql(u = 'u', org = 'c.org_id') {
  const pick = `COALESCE(NULLIF(TRIM(om_dn.display_name), ''), NULLIF(TRIM(om_dn.nickname), ''))`
  return `COALESCE(
    (SELECT ${pick}
       FROM org_members om_dn
      WHERE om_dn.user_id = ${u}.id
        AND om_dn.org_id = ${org}
        AND om_dn.status = 'active'
        AND ${pick} IS NOT NULL
      ORDER BY om_dn.id
      LIMIT 1),
    NULLIF(TRIM(CONCAT_WS(' ', ${u}.firstname, ${u}.lastname)), ''),
    ${u}.username
  )`
}
