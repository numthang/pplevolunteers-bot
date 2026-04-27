# UPDATE.md - new Update document from owner to push in their project in md/*
---
## PPLE Bot Project

- SMS Gateway
---
## PPLE Finance
ขั้นตอน Setup
1. เพิ่มใน .env
SMS_WEBHOOK_PORT=3099
SMS_WEBHOOK_SECRET=ใส่รหัสลับอะไรก็ได้ยาวๆ
2. เปิด Port ที่ server (ถ้า firewall)

sudo ufw allow 3099/tcp
3. ตั้งค่า SMS Forwarder app (Android)
ใช้แอป SMS Forwarder (ฟรี บน Play Store) ตั้งค่า:

Webhook URL: http://<server-ip>:3099/
Method: POST
Headers: Authorization: Bearer <SMS_WEBHOOK_SECRET>
Body (JSON):

{
  "from": "%from%",
  "message": "%message%",
  "device": "Samsung-A03-Ratchaburi"
}
Filter: เฉพาะ SMS จาก sender KBANK
4. ตั้งค่า Android ให้ระบบไม่ตาย
Battery Optimization (สำคัญมาก):

Settings → Apps → SMS Forwarder → Battery → Unrestricted
Settings → Device Care → Battery → Background Usage Limits → ปิดสำหรับ SMS Forwarder
Samsung-specific:

Settings → Apps → SMS Forwarder → Allow background activity: ON
ใช้ "Protect Battery" mode (85%) ได้เลย — ไม่กระทบ SMS รับ
ห้าม Force Stop แอปหลัง reboot

---

## 📞 PPLE Calling
### อัพเดท Calling (calling/pending)

### อัพเดท Calling (calling/[campaignId])

### Optional
- เพิ่ม audit logs -> สามารถดูได้ว่าแก้ไขหรือเพิ่มอะไร (เป็น History)
(การขยายข้ามภาค) approval flow เช่น 
- เข้าถึงสมาชิกทั้งประเทศ+ทั้งหมด → ขอ approval ผ่านเลขาธิการ/แอดมิน
- เข้าถึงสมาชิกระดับภาค → ขอ approval ผ่านรองเลขาธิการภาค/ผู้ประสานงานภาค
- เข้าถึงสมาชิกระดับจังหวัด → ขอ approval ผู้ประสานงาน/กรรมการจังหวัด
- เมื่อบันทึกว่าเป็น Wrong number ระบบควรมี Alert ถามว่าจะ "ลบเบอร์นี้/มาร์คว่าเบอร์เสีย" ในฐานข้อมูลหลักเลยหรือไม่ เพื่อไม่ให้คนอื่นเสียเวลาโทรซ้ำใน Campaign ถัดไป

### UI
---
## 📞 PPLE Docs

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
---
<!-- ## 🔌 Future Integration: ACT & PPLE Docs, Calling
แนวทางการเชื่อมต่อระบบภายนอก:

* **Decoupled Adapter**: ออกแบบระบบให้คุยผ่าน API เป็นหลัก เพื่อรองรับการย้าย Server หรือเปลี่ยนฐานข้อมูลในอนาคตได้โดยไม่กระทบ Logic ภายใน
* **Local Store Strategy**: ยังคงใช้การ Cache ข้อมูลสมาชิกไว้ในฝั่งเราเพื่อ Search Speed แต่จะดึงข้อมูล Snapshot เฉพาะวันงานมาที่ `act_members` เพื่อความถูกต้องของเอกสาร

ชวนคิด
- ข้อนี้ผมคิดไว้ก่อนว่าเราจะสร้างตาราง act_members, act_events, act_event_registers ของ act ตาม /md/docs/act_event_register.xlsx เพื่อ cache ข้อมูล ตอนนี้ขอ schema ไปอยู่จะได้ไม่ต้องเดา อนาคตใช้ดึง api แทน ควรวางอนาคตให้แก้ง่ายๆ ยังไงดี เพราะถ้าอยู่คนละ server คนละ database ปกติต้องคุยผ่าน api ใช่ไหม ไม่น่าจะใช่การดึง ฐานข้อมูลของเขา หรือเปล่าช่วยแนะนำหน่อย -->
---
<!-- ## update finance permission ฝากเติมลง md/finance.md
การดู (can View Account):
Public account → ดูได้ทั้งหมด (ไม่ต้อง login)
Private account → เจ้าของ || Admin
Internal account → เจ้าของ || Admin ||  เลขาธิการ || เหรัญญิก || กรรมการจังหวัด (ของบัญชีนั้น) || ผู้ประสานงาน (ของบัญชีจังหวัดนั้น) || ผู้ประสานงานภาค (ของบัญชีจังหวัดนั้น) || รองเลขาภาค (ของบัญชีจังหวัดนั้น)

การแก้ไข (can Edit Account):
Public account → เจ้าของ || Admin || เหรัญญิก
Private account → เจ้าของ || Admin
Internal account → เจ้าของ || Admin || เลขาธิการ || เหรัญญิก && { กรรมการจังหวัด (ของบัญชีนั้น) || ผู้ประสานงาน (ของบัญชีจังหวัดนั้น) || ผู้ประสานงานภาค (ของบัญชีจังหวัดนั้น) || รองเลขาภาค (ของบัญชีจังหวัดนั้น) -->