# UPDATE.md - new Update document from owner to push in their project in md/*

📌 ภาพรวมของ PPLE Docs
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

Mobile Signature Component: พัฒนาส่วนการรับลายเซ็นบนหน้าเว็บที่รองรับการใช้งานบนมือถือ

API Adapter: เขียนฟังก์ชันตัวกลางเพื่อรับข้อมูลจาก Callback และจัดรูปแบบ (Flatten Data) ก่อนลงฐานข้อมูล


----
1. การจัดการ Layer ของข้อมูล (Data Architecture)
เพื่อให้ระบบรองรับสมาชิกพรรคหลักแสนคนจาก BigQuery และผู้เข้าร่วมกิจกรรมทั่วไปจาก ACT ได้อย่างมีประสิทธิภาพ:

Layer 1: Central Cache (bq_members)
เปลี่ยนชื่อจาก calling_members_bq เป็น bq_members เพื่อเป็นฐานข้อมูลสมาชิกขนาดใหญ่
ทำหน้าที่เป็น Cache สำหรับการค้นหาที่รวดเร็ว (Search Speed) ในระบบ Calling

Layer 2: Activity Snapshot (act_members, act_event, act_event_register)
รอ Schema จริงจากฝั่ง ACT เพื่อกำหนดฟิลด์ให้ตรงกัน โดยจะใช้ act_userid เป็น Key หลัก (PK)
ทำหน้าที่เก็บข้อมูลผู้ร่วมงานจริง ณ วันที่จัดกิจกรรม เพื่อป้องกันปัญหาข้อมูลที่อยู่เปลี่ยนแปลงในภายหลังแล้วกระทบเอกสารทางกฎหมาย

Layer 3: Document Operations (docs_signatures, docs_activity_entries)
แยกตารางเก็บลายเซ็น (signature_base64) ออกมาต่างหากเพื่อประสิทธิภาพในการ Query
ใช้ตาราง Entry เพื่อคุมสถานะการออกเอกสารและเก็บค่า override_data (กรณีแก้ไขข้อมูลหน้างานเพื่อลง PDF)

2. การเชื่อมโยงตัวตน (Identity & Linking Strategy)
ใช้กลยุทธ์ "Discord-Centric" เพื่อคุมการทำงานของอาสาประชาชน:ฃฃ
Discord ID เป็นแกนกลาง: ทุกระบบจะใช้ discord_id ในการระบุตัวตนคนทำงาน และคุมสิทธิ์ (RBAC) ผ่านระบบ Role เดิมที่มีอยู่
Mapping Bridge: สร้างกลไกการจับคู่ (Mapping) ระหว่าง discord_id ↔ phone ↔ act_userid เพื่อให้ระบบรู้ว่าใครเป็นใครในทุกมิติ
Callback Integration: ใช้ Script Callback ที่คุณทำไว้เพื่อรับข้อมูลจากระบบ ACT มาอัปเดตสถานะใน Discord และเตรียมข้อมูลสำหรับออกเอกสารใน Docs ทันที

3. ขั้นตอนที่ต้องทำต่อทันที (Immediate Next Actions)
รอรับ Schema จริงจาก ACT: เพื่อนำมาปรับปรุงโครงสร้างตารางใน Layer 2 ให้ตรงกัน ไม่ต้องเดาฟิลด์ (เช่น act_userid เป็นประเภทไหน)

ปรับปรุงระบบ Permission (RBAC): พัฒนาฟีเจอร์ "View as Role" บนเว็บ เพื่อทดสอบสิทธิ์การเข้าถึงข้อมูลตามลำดับเขตพื้นที่ (จังหวัด/ภาค) ตามที่ระบุใน UPDATE.md
ออกแบบ API Adapter: เตรียมฟังก์ชันสำหรับดึงข้อมูลที่ออกแบบให้เป็นอิสระ (Decoupled) เพื่อให้ในอนาคตเมื่อเปลี่ยนจากการใช้ไฟล์ Excel มาเป็น API จริง จะสามารถแก้ไขโค้ดได้เพียงจุดเดียว
UI/UX Implementation: เริ่มทำหน้าจอ "Work Queue" สำหรับอาสา (เช่น ปุ่ม Save & Call Next) และหน้าจอจัดการพิกัด PDF สำหรับระบบ Docs โดยเน้นการใช้งานบนมือถือเป็นหลัก

4. สิ่งที่ต้องพิจารณาเพิ่มเติม
Data Integrity: การทำระบบ Alert เพื่อมาร์คเบอร์เสีย (Wrong Number) กลับไปยังฐานข้อมูลหลัก เพื่อไม่ให้คนอื่นเสียเวลาโทรซ้ำในแคมเปญหน้า

Audit Logs: เพิ่มระบบประวัติการแก้ไข (History) เพื่อดูว่าใครเป็นคนเพิ่ม หรือแก้ไขข้อมูลสมาชิกคนไหน
---

# 📌 PPLE Project Global Overview (2026)
เอกสารสรุปภาพรวมการบริหารจัดการโปรเจกต์ และการอัปเดตระบบภายใน (Finance, Calling, Docs) เพื่อให้ทีมพัฒนาและ AI เข้าใจโครงสร้างเดียวกัน
---

## 📂 1. Project Architecture & Documentation
เพื่อลดความสับสนใจการจัดการเอกสารที่มีจำนวนมาก ให้ใช้โครงสร้างดังนี้:
* **Centralized `CLAUDE.md`**: รวมไฟล์ `web/CLAUDE.md` เข้ากับ `CLAUDE.md` ที่ Root เพื่อคุมภาพรวมทั้ง Bot และ Web ในที่เดียว
* **Modular Folders**: แยกรายละเอียดแต่ละโปรเจกต์ไว้ในโฟลเดอร์ `md/` เช่น:
    * `md/finance/` - รายละเอียดระบบการเงิน
    * `md/calling/` - รายละเอียดระบบโทรหาสมาชิก
    * `md/docs/` - รายละเอียดระบบเอกสารและกิจกรรม ACT

---

## 💰 2. PPLE Finance: Access Control (RBAC)
กำหนดสิทธิ์การ View/Edit บัญชีในระบบการเงิน:

### **การดูข้อมูล (View Access)**
* **Public**: ดูได้ทุกคนโดยไม่ต้อง Login
* **Private**: เฉพาะเจ้าของบัญชี (Owner) และ Admin
* **Internal**: เจ้าของ, Admin, เลขาธิการ, เหรัญญิก, และทีมงานตามลำดับเขตพื้นที่ (กรรมการจังหวัด/ผู้ประสานงาน)

### **การแก้ไขข้อมูล (Edit Access)**
* **Public**: เจ้าของ, Admin, และเหรัญญิก
* **Private**: เจ้าของ และ Admin เท่านั้น
* **Internal**: เจ้าของ, Admin, เลขาธิการ และ (เหรัญญิก ร่วมกับผู้ดูแลตามเขตพื้นที่)

---

## 📞 3. PPLE Calling: System Strategy
ระบบจัดการคิวโทรและการเข้าถึงข้อมูลสมาชิก:

### **Scope & Assignments**
* **Access Scope**: สิทธิ์การมองเห็นข้อมูลตามลำดับเขต (ระดับประเทศสำหรับ Admin/เลขา, ระดับภาค/จังหวัด/อำเภอ สำหรับ Local Roles)
* **Assign Power**: Admin มอบหมายได้ทั่วประเทศ; Local Roles มอบหมายได้ภายในเขตพื้นที่ตนเอง
* **Bypass Rule**: เมื่อสมาชิกถูก Assign ให้ใครแล้ว คนนั้นจะเข้าถึงข้อมูลสมาชิกได้ทันทีโดยไม่ต้องเช็คเขตพื้นที่ (Bypass Scope Check)
* **Deny Priority**: สิทธิ์การปฏิเสธ (Deny) โดย Admin มีผลสูงสุดเหนือสิทธิ์อื่นเสมอ

### **Data & Infrastructure**
* **Central Cache**: เปลี่ยนชื่อตารางเป็น `bq_members` เพื่อเป็นถังพักสมาชิกแสนคนจาก BigQuery เพื่อความเร็วในการค้นหา
* **Data Integrity**: ระบบ Alert ทันทีเมื่อระบุเป็น "Wrong Number" เพื่อให้เลือกลบหรือมาร์คเบอร์เสียในฐานข้อมูลหลัก

---

## 📱 4. UI/UX Design & Work Queue
มาตรฐานการออกแบบสำหรับอาสาและคนทำงาน (Mobile-First):

* **Efficiency**: เพิ่มปุ่ม "Save & Call Next Member" เพื่อลดขั้นตอนการคลิกและทำคิวโทรให้ต่อเนื่อง
* **Visual Context**: แสดง "บันทึกล่าสุด (Latest Note)" และ "สถิติการรับสาย (X/Y)" บนการ์ดสมาชิกในหน้า List ทันที
* **Theme**: รองรับ Dark Mode และแบ่งระดับความสำคัญด้วยสี (Tier A=เขียว, B=น้ำเงิน, C=เหลือง, D=แดง)
* **Admin Visibility**: Floating Bar แสดงจำนวนสมาชิกที่เลือก (Bulk Assign) และแสดงจำนวนงานในมือของคนรับงานแต่ละคน

---

## 🔌 5. Future Integration: ACT & PPLE Docs
แนวทางการเชื่อมต่อระบบภายนอก:

* **Decoupled Adapter**: ออกแบบระบบให้คุยผ่าน API เป็นหลัก เพื่อรองรับการย้าย Server หรือเปลี่ยนฐานข้อมูลในอนาคตได้โดยไม่กระทบ Logic ภายใน
* **Local Store Strategy**: ยังคงใช้การ Cache ข้อมูลสมาชิกไว้ในฝั่งเราเพื่อ Search Speed แต่จะดึงข้อมูล Snapshot เฉพาะวันงานมาที่ `act_members` เพื่อความถูกต้องของเอกสาร

---
## md/finance.md
การดู (can View Account):
Public account → ดูได้ทั้งหมด (ไม่ต้อง login)
Private account → เจ้าของ || Admin
Internal account → เจ้าของ || Admin ||  เลขาธิการ || เหรัญญิก || กรรมการจังหวัด (ของบัญชีนั้น) || ผู้ประสานงาน (ของบัญชีจังหวัดนั้น) || ผู้ประสานงานภาค (ของบัญชีจังหวัดนั้น) || รองเลขาภาค (ของบัญชีจังหวัดนั้น)

การแก้ไข (can Edit Account):
Public account → เจ้าของ || Admin || เหรัญญิก
Private account → เจ้าของ || Admin
Internal account → เจ้าของ || Admin || เลขาธิการ || เหรัญญิก && { กรรมการจังหวัด (ของบัญชีนั้น) || ผู้ประสานงาน (ของบัญชีจังหวัดนั้น) || ผู้ประสานงานภาค (ของบัญชีจังหวัดนั้น) || รองเลขาภาค (ของบัญชีจังหวัดนั้น)
---
## md/calling.md

1. ดู/โทรสมาชิก (default scope):
เห็นสมาชิกพื้นที่ Override โดย admin / เลขาธิการ → ดูได้ทั้งประเทศ
รองเลขาธิการภาค → ดูได้ทุกจังหวัดในภาค (ขยายข้ามภาคได้)
ผู้ประสานงานภาค → ทุกจังหวัดในภาค   (ขยายข้ามภาคได้)
ผู้ประสานงานจังหวัด → ทุกอำเภอในจังหวัด (ขยายข้ามจังหวัดได้)
กรรมการจังหวัด → ทุกอำเภอในจังหวัด    (ขยายข้ามจังหวัดได้)
ตทอ. → อำเภอที่ admin กำหนด    เพิ่ม/ลด อำเภอได้

2. Assign สมาชิก: Role ที่ assign ได้
Admin →  ทุกคน ทุกพื้นที่
รองเลขาธิการภาค / ผู้ประสานงานภาค → สมาชิกทุกจังหวัดในภาคตัวเอง
ผู้ประสานงานจังหวัด / กรรมการจังหวัด → สมาชิกในจังหวัดตัวเอง
ตทอ. → สมาชิกในอำเภอที่ได้รับมอบหมาย

3. Special Rules:
Assign แล้ว → คนที่ถูก assign เข้าถึงสมาชิกคนนั้นได้เลย (bypass scope check)
Deny ชนะเสมอ — ถ้า admin ตั้ง deny สำหรับบุคคล ก็ไม่ได้เข้า
Override ได้รายคน — admin สามารถให้สิทธิ์พิเศษหรือเพิก privilege ได้

Optional
เพิ่ม audit logs -> สามารถดูได้ว่าแก้ไขหรือเพิ่มอะไร (เป็น History)
(การขยายข้ามภาค) approval flow เช่น 
เข้าถึงสมาชิกทั้งประเทศ+ทั้งหมด → ขอ approval ผ่านเลขาธิการ/แอดมิน
เข้าถึงสมาชิกระดับภาค → ขอ approval ผ่านรองเลขาธิการภาค/ผู้ประสานงานภาค
เข้าถึงสมาชิกระดับจังหวัด → ขอ approval ผู้ประสานงาน/กรรมการจังหวัด

## Import PPLE_CALLING xls member from scripts/calling/import-members-xls.js
- line_username คือ LINE_USERNAME
- caller_name คือ CALLER_NAME
- เช็ค script อีกครั้งผมทำให้ไฟล์ xls clean ขึ้น ย้ายไฟล์มาที่ md/calling

## UX design PPLE_CALLING
Member list + Bulk assign
Call logging form (progressive disclosure)
Member card (summary)

Design highlights:
Member list + Bulk assign:
Filter by district, tier, status
Checkbox select (count shows selected/total)
Show last call, tier, assigned person, answered rate
Sort: tier A first → unassigned → low reachability
Assign button (bulk action)
Filter ภาค, จังหวัด มองเห็นตาม Permission 
Call logging (Progressive disclosure):
Status field required (answered/no answer/busy/wrong)
Signals show ONLY if "answered" selected
4 signal types (location, availability, interest, reachability)
Note field optional
Save button at bottom
Member profile:
Avatar + basic info
Call history with timestamps + notes
Recent 2-3 calls shown

Minimal + Functional:
✅ No decorative elements
✅ Dark mode ready (CSS variables)
✅ One-column layout responsive
✅ Forms radio group (4-button horizontal)
✅ Color for tier (A=green, B=blue, C=amber, D=red)

web/md/calling-system-v2.html Included: 
✅ Page 1: Campaign selection (landing) ✅ Page 2: Member list + bulk assign modal ✅ Page 3: Call logging with sidebar (member info + campaign details) ✅ Page 4: Member profile + call history ✅ Page 5: Campaign management (CRUD) ✅ Modal: Assign to... (searchable dropdown) ✅ Status badges: Called/Pending ✅ Progressive disclosure: Signals show only when "Answered" selected ✅ Status indicator: Shows live when status clicked

เพิ่มเติม UI/UX calling system
1. หน้า Pending Calls (Work Queue)
เน้นให้คนโทร (Caller) ทำงานได้ไวและเตรียมตัวก่อนโทรได้ทันที:
Visual History: แสดง "บันทึกล่าสุด" (Latest Note) สั้นๆ ใต้ชื่อสมาชิกในหน้าลิสต์เลย ไม่ต้องกดเข้าไปดูข้างใน
Call Count Tracker: แสดงสถิติ "รับสาย X/Y ครั้ง" เพื่อให้ตัดสินใจได้ว่าสายนี้ควรโทรซ้ำหรือข้ามไปก่อน
Next Action: ในหน้าบันทึกผล เพิ่มปุ่ม "Save & Call Next Member" เพื่อข้ามไปคนถัดไปในคิวทันที ลดขั้นตอนการคลิก

2. Bulk Assign (Admin Tools)
ช่วยให้คนกระจายงาน (Admin) เห็นภาพรวมและไม่ทำงานซ้ำซ้อน:
Filter Persistence: เพิ่ม Floating Bar ด้านล่างที่จะค้างอยู่เสมอเมื่อมีการเลือกสมาชิก บอกชัดเจนว่า "เลือกอยู่กี่คน" แม้จะเลื่อนหน้าจอลงไปไกล
Assign Identity: ในช่องค้นหาคนรับงาน จะมีตัวเลขบอก "จำนวนงานที่ถืออยู่" (เช่น Tee - มีอยู่ 15 งาน) เพื่อให้กระจายงานได้เหมาะสม

3. Hierarchy & Permissions (Scope Awareness)
ลดความสับสนเวลาทำงานข้ามเขต:
Scope Banner: เพิ่มแถบด้านบนสุดระบุชัดเจนว่าตอนนี้กำลังดูข้อมูลของ "เขตไหน" และใช้งานใน "Role อะไร" (เช่น ตทอ. โพธาราม)
---
## อื่นๆ ของ finance และ calling
- ผมอยากทำ UI Design ใหม่ มี theme ให้เลือกใหม่ จาก demo web/md/calling-system-full.html อันนี้ก็ไม่เลวอ่ะ แต่อยากให้ dark mode base on สีชุดเดียวกันนี้ด้วย
- ทำระบบ view as role บนเว็บ มี เหรัญญิก กรรมการจังหวัด ผู้ประสานงานจังหวัด ผู้ประสานงานภาค รองเลขาภาค เลขาธิการ
- Mobile Design คนส่วนใหญ่ใช้มือถือแหละ ไม่ค่อยใช้คอมกันแล้ว 
- เมื่อบันทึกว่าเป็น Wrong number ระบบควรมี Alert ถามว่าจะ "ลบเบอร์นี้/มาร์คว่าเบอร์เสีย" ในฐานข้อมูลหลักเลยหรือไม่ เพื่อไม่ให้คนอื่นเสียเวลาโทรซ้ำใน Campaign ถัดไป
- calling_campaigns นี่ถ้าเป็น ตาราง act_events ที่อยู่บนระบบเดิมไปเลยไหมเดี๋ยวผมถามขอข้อมูล schema มาให้ เราต้องมา create campaign เพิ่มหรือเปล่านะ
- แล้วถ้าจะแก้ไขชื่อตาราง เป็น calling_members_bq -> bq_members สื่อถึง bigquery member ใหญ่ ซึ่งอันนี้ยังคงใช้ชั่วคราว อนาคตต้องไปดึงผ่าน api เป็นรายคน? ไม่ว่ะ ต้องไปเอามาทั้งหมดอ่ะ เราจะยังใช้ วิธี cahe สมาชิกเป็นแสนอยู่ดีไหมนะ
---
คำถาม
- ข้อนี้ผมคิดไว้ก่อนว่าเราจะสร้างตาราง act_members, act_event, act_event_register ของ act ตาม /home/tee/VSites/node/pple-volunteers/md/docs/act_members_and_event_register.xlsx ไหม เพื่อ cache ข้อมูล ตอนนี้ขอ schema ไปอยู่จะได้ไม่ต้องเดา อนาคตใช้ดึง api แทน ควรวางอนาคตให้แก้ง่ายๆ ยังไงดี เพราะถ้าอยู่คนละ server คนละ database ปกติต้องคุยผ่าน api ใช่ไหม ไม่น่าจะใช่การดึง ฐานข้อมูลของเขา หรือเปล่าช่วยแนะนำหน่อย
