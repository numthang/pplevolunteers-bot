# PENDING.md — Backlog & Ideas

---

## 🌐 pplevolunteers.org — Auth & Platform

- [ ] ผูกระบบ PPLE กับ **LINE** และ **โทรศัพท์**, PASSKEY

---

## 🗄️ Database / Infrastructure

- ~~dc_server_settings → dc_guild_config~~ ✅ (2026-06-04)

---

## 🤖 PPLE Bot / Social Share

- ~~Discord (Guild) Config — Restructure~~ ✅ (2026-06-04)
- ~~Watermark — Personal Account~~ ✅ (2026-06-04)
- ~~Web IA restructure~~ ✅ (2026-06-07) — basket/quote/platforms/watermark ใน path ใหม่
- ~~AI Thread Summarizer — context menu "🤖 AI สรุปเธรด"~~ ✅ (2026-06)

### Social Share — X (Twitter)
- [ ] **Optional / Future:** Infographic — แปลงบทความยาวๆ เป็นรูปสรุปแนบโพสต์หลัก

### Context Menu — Add to Calendar
- [ ] Context menu บนข้อความใน Discord → เพิ่มเข้าปฏิทิน
  - parse Discord event URL หรือ Google Meet URL จากข้อความ
  - parse วันที่/เวลาจากเนื้อความ
  - เลือกปฏิทินได้ (Google Calendar + ปฏิทินทีม เช่น "ทีมสื่อราชบุรี") — รองรับ 2-3 ปฏิทิน

---

## 💰 PPLE Finance

- [ ] ระบบเบี้ยเลี้ยง — โอนเงินเป็นรอบๆ (บัญชีเขต + บัญชีทีมงาน)
- [ ] ระบบบัญชีเบี้ยเลี้ยงจังหวัด — ส่งสลิปเก็บง่าย + DM สลิปไปหาสมาชิก
- [ ] จัดการเบี้ยเลี้ยงจากสมาชิก Discord
- [ ] ระบบชำระเงินค่าเบี้ยเลี้ยง — ผูกเบอร์บัญชีธนาคารกับสมาชิก

---

## 📞 PPLE Calling

- ~~Mobile bug — `/calling/campaigns/[id]/edit` เด้งขึ้นบน~~ ✅
- ~~Dashboard สรุป (`/calling/stats`) — gauges + charts~~ ✅

### ยังเหลือ
- [ ] เบอร์กลางโทรออก — แสดงเบอร์กลางขององค์กรแทนเบอร์ส่วนตัว (ต้องการ provider/config เบอร์กลาง)
- [ ] แสดง active event บน dashboard + default event จังหวัดดึงจาก XLS
- [ ] Audit logs — ดูประวัติการแก้ไข/เพิ่มข้อมูล
- [ ] Approval flow ข้ามภาค — จังหวัด → ภาค → ประเทศ ขอ approval ผ่านผู้ประสานงาน

---

## 👥 PPLE Contacts

- [ ] Multi-server design — ถกเรื่อง schema: แยก table ตาม guild หรืออยู่ table เดียวแยกด้วย `guild_id`

---

## 🔌 Integration — Panel / ACT / External APIs

### Panel 360
- [ ] รายชื่อผู้บริจาค 360 — ขอ schema, pkey คืออะไร
- [ ] API สมาชิกพรรค และรายนามผู้บริจาค
- [ ] ขอ endpoint: `GET /api/members`, auth method, pagination format (ต้องการ cursor-based)

### ACT Integration
- [ ] Self check-in ACT
- [ ] Webhook ACT — cache act event ทุกครั้งที่สร้างกิจกรรม
- [ ] ERM เคลียร์เอกสาร กกต + calling system — คุยกับนิ
- [ ] ACT เชื่อมกับ LINE — ACT มียศไหม? ตารางที่เกี่ยวข้อง? API กิจกรรม/สมาชิก
- [ ] Flow ต่ออายุสมาชิก — ตอนโทรไปหาสมาชิก ทำยังไงง่ายที่สุด
- [ ] API สมาชิกสำหรับ calling (ปัญเจ)
- [ ] ระบบยศภายใน — มีไหม? เชื่อมกับยศ Discord
- [ ] เข้าถึง People ID ยังไง

---

## 📋 PPLE Docs

<!-- รอ Schema จริงจากทาง ACT ก่อน — ดู PENDING.md section ACT Integration -->

---

## 🛠️ Internal Tools / Productivity

- [ ] Project management ในแบบ Notion/AppFlowy — simple, lightweight สำหรับทีม

---

## 🔗 References

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — Production-grade engineering skills for AI coding agents
