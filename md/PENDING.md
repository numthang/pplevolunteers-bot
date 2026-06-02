# PENDING.md — Backlog & Ideas

---

## 🌐 pplevolunteers.org — Auth & Platform

- [ ] ผูกระบบ PPLE กับ **LINE** และ **โทรศัพท์**, PASSKEY

---

## 🤖 PPLE Bot / Social Share

### Discord (Guild) Config — Restructure
- [ ] เปลี่ยนเมนู **BOT** → **DISCORD**, path `/bot/` → `/discord/`
- [ ] รวม guild config ทุกอย่างไว้ที่เดียว:
  - `/discord/social/accounts` — Social accounts (ย้ายจาก /bot/)
  - `/discord/watermark` — Guild watermark management (Admin only, upload/ลบบนเว็บ)
  - `/bot/watermark` หรือ `/discord/watermark/personal` — **Personal watermark** (ทุก user จัดการลายน้ำของตัวเองได้)
  - `/discord/roles` — Role mapping (Discord role → Admin/Mod ในระบบ)
  - `/discord/config` — Meta/X API keys (ย้ายจาก social/accounts)
- [ ] Permission model:
  - **Superadmin** (ENV: `DEV_DISCORD_IDS`) → จัดการได้ทุก guild
  - **Guild Admin** → จัดการได้เฉพาะ guild ของตัวเอง
  - อนาคต: migrate superadmin จาก ENV → DB table ถ้าต้องการ co-admin
- [ ] **Guild isolation bug** — `/bot/social/accounts` ตอนนี้แสดง accounts ของทุก guild ให้คนที่มี Admin role ใดก็ได้ดู ต้องแก้ให้แสดงเฉพาะ guild ที่ตัวเองเป็น Admin พร้อม restructure

### Watermark — Personal Account
- [ ] **Personal watermark** บนเว็บ — แยกจาก guild watermark โดยสิ้นเชิง
  - **Folder:** `assets/watermark/user_{discordId}/` (prefix `user_` ป้องกัน collision กับ guild snowflake)
  - **Web page:** `/bot/watermark` หรือ `/discord/watermark/personal`
    - Upload / ลบลายน้ำส่วนตัว (เห็นเฉพาะของตัวเอง)
    - ไม่ต้องเป็น Admin — ทุก user ใช้ได้
  - **API:**
    - `GET /api/watermark/personal` — list ไฟล์ของ user ที่ login
    - `POST /api/watermark/personal` — upload รูปลายน้ำ (multipart)
    - `DELETE /api/watermark/personal/[filename]` — ลบ
  - **Bot:** `watermarkHandler.js` — merge personal + guild watermarks ใน dropdown
    - แสดงของ user ก่อน (label "🔒 ชื่อไฟล์") ตามด้วย guild watermarks
    - ถ้า user ไม่มีของตัวเอง → ไม่โชว์ section นั้น

### Social Share — X (Twitter)
- [ ] **Optional / Future:** Infographic — แปลงบทความยาวๆ เป็นรูปสรุปแนบโพสต์หลัก

---

## 💰 PPLE Finance

- [ ] ระบบเบี้ยเลี้ยง — โอนเงินเป็นรอบๆ (บัญชีเขต + บัญชีทีมงาน)
- [ ] ระบบบัญชีเบี้ยเลี้ยงจังหวัด — ส่งสลิปเก็บง่าย + DM สลิปไปหาสมาชิก
- [ ] จัดการเบี้ยเลี้ยงจากสมาชิก Discord

---

## 📞 PPLE Calling

### UI / UX
- [ ] Mobile bug — `/calling/campaigns/[id]/edit` ตอนพิมพ์แก้ไขรายละเอียดแล้วเด้งขึ้นบน
- [ ] เบอร์กลางโทรออก — แสดงเบอร์กลางขององค์กรแทนเบอร์ส่วนตัวของ volunteer เวลาโทร (ต้องการ provider/config เบอร์กลาง)

### Dashboard
- [ ] Dashboard สรุป: จำนวน call ที่ผ่านมา / รายเดือน
- [ ] แสดง active event บน dashboard + default event จังหวัดดึงจาก XLS

### Optional
- [ ] Audit logs — ดูประวัติการแก้ไข/เพิ่มข้อมูล (History)
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
- [ ] Webhook ACT — cache act event ทุกครั้งที่สร้างกิจกรรม (ให้ URL webhook ไปแปะ vs ขอ API event)
- [ ] ERM เคลียร์เอกสาร กกต + calling system — ต้องคุยกับใคร → **คุยกับนิ**
- [ ] ACT เชื่อมกับ LINE — ACT มียศไหม? ตารางที่เกี่ยวข้อง? API กิจกรรม/สมาชิก
- [ ] Flow ต่ออายุสมาชิก — ตอนโทรไปหาสมาชิก ทำยังไงง่ายที่สุด
- [ ] API สมาชิกสำหรับ calling (ปัญเจ)
- [ ] ระบบยศภายใน — มีไหม? เชื่อมกับยศ Discord
- [ ] เข้าถึง People ID ยังไง

---

## 📋 PPLE Docs

<!-- 📌 ภาพรวมของ PPLE Docs
PPLE Docs คือระบบบริหารจัดการเอกสารทางกฎหมายและลายเซ็นดิจิทัล (E-signature) ที่เป็นส่วนต่อขยายของโปรเจกต์ ACT เพื่อให้อาสาสมัครและสมาชิกพรรคสามารถทำธุรกรรมและเซ็นเอกสารประกอบกิจกรรม (เช่น เอกสารเบิกจ่ายของ กกต.) ได้อย่างรวดเร็วหน้างาน

🏗️ โครงสร้างระบบและทางเทคนิค (Technical Stack)
Identity: ใช้ Discord ID เป็นกุญแจหลักในการระบุตัวตนคนทำงาน และใช้ Phone/Line ID ในการ Mapping ข้อมูลกับฐานข้อมูลสมาชิกใหญ่

Auth: ผ่าน Discord OAuth (next-auth) ตามมาตรฐานเดิมของโปรเจกต์

🗄️ การออกแบบฐานข้อมูล 3 เลเยอร์ (The 3-Layer Schema)
เพื่อให้ระบบรองรับสมาชิกแสนคนแต่ยังทำงานได้รวดเร็ว เราตกลงกันว่าจะแบ่งตารางดังนี้:

Layer 1: bq_members (Central Cache)
เก็บสมาชิก ~100,000 คนที่ Mirror มาจาก BigQuery เพื่อใช้ในการค้นหาและอ้างอิงข้อมูลเบื้องต้น

Layer 2: act_members & act_events (Snapshot)
เก็บข้อมูลผู้ที่ลงทะเบียนร่วมกิจกรรม ACT จริง โดยใช้ act_userid เป็นกุญแจหลัก

ทำหน้าที่เป็น "Snapshot" ข้อมูลชื่อ-ที่อยู่ ณ วันที่จัดงาน เพื่อไม่ให้เอกสารเพี้ยนหากมีการแก้ไขข้อมูลสมาชิกในภายหลัง

Layer 3: docs_signatures & docs_activity_entries (Ops)

docs_signatures: เก็บข้อมูลลายเซ็นเป็น Base64 แยกตารางออกมาเพื่อ Performance

docs_activity_entries: เก็บสถานะเอกสาร (Pending, Signed, Printed) และค่า override_data (JSON) สำหรับแก้ไขข้อมูลเฉพาะในเอกสารใบนั้นๆ

🔄 ขั้นตอนการทำงาน (Workflow)
Registration & Callback: เมื่อสมาชิกจากระบบ ACT ลงทะเบียน กิจกรรมจะส่ง Callback มาที่ Discord เพื่อเริ่มกระบวนการ Mapping ตัวตน

Mapping & Preparation: ระบบจะตรวจสอบว่า act_userid นั้นตรงกับใครใน bq_members และผูกเข้ากับ discord_id (ถ้ามี)

Signing: อาสาสมัคร/สมาชิก เข้าถึงลิงก์บนมือถือเพื่อตรวจสอบข้อมูลและเซ็นชื่อผ่านหน้า Canvas

Generation: ระบบหยอดข้อมูล (รวมถึงข้อมูลที่ Override หน้างาน) และลายเซ็นลงบนพิกัด X, Y ใน PDF Template ที่ Admin ตั้งค่าไว้

Batch Printing: Admin หรือผู้ประสานงานเขต สามารถสั่งพิมพ์เอกสารทั้งหมดของกิจกรรมนั้นๆ แยกตามจังหวัดหรือภาคได้

📝 สิ่งที่ต้องให้ Claude ทำต่อ (Next Actions)
Schema Finalization: รอ Schema จริงจากทาง ACT เพื่อปรับจูนฟิลด์ใน act_members ให้ตรงกัน

UI/UX Development: สร้างหน้าจอจัดการ Template PDF ที่สามารถกำหนดจุดวางข้อมูล (Field Mapping) ได้

Mobile Signature Component: พัฒนาส่วนการรับลายเซ็นบนหน้าเว็บที่รองรับการใช้งานบนมือถือ -->

<!-- ## 🔌 Future Integration: ACT & PPLE Docs, Calling
แนวทางการเชื่อมต่อระบบภายนอก:

* **Decoupled Adapter**: ออกแบบระบบให้คุยผ่าน API เป็นหลัก เพื่อรองรับการย้าย Server หรือเปลี่ยนฐานข้อมูลในอนาคตได้โดยไม่กระทบ Logic ภายใน
* **Local Store Strategy**: ยังคงใช้การ Cache ข้อมูลสมาชิกไว้ในฝั่งเราเพื่อ Search Speed แต่จะดึงข้อมูล Snapshot เฉพาะวันงานมาที่ `act_members` เพื่อความถูกต้องของเอกสาร

ชวนคิด
- ข้อนี้ผมคิดไว้ก่อนว่าเราจะสร้างตาราง act_members, act_events, act_event_registers ของ act ตาม /md/docs/act_event_register.xlsx เพื่อ cache ข้อมูล ตอนนี้ขอ schema ไปอยู่จะได้ไม่ต้องเดา อนาคตใช้ดึง api แทน ควรวางอนาคตให้แก้ง่ายๆ ยังไงดี เพราะถ้าอยู่คนละ server คนละ database ปกติต้องคุยผ่าน api ใช่ไหม ไม่น่าจะใช่การดึง ฐานข้อมูลของเขา หรือเปล่าช่วยแนะนำหน่อย -->

---

## 🔗 References

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — Production-grade engineering skills for AI coding agents
