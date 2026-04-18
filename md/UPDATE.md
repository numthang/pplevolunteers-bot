# UPDATE.md - new Update document from owner to push in their project in md/*

ช่วยบันทึกทุกอย่างที่รู้ ลง calling.md และ docs.md รวมถึง web.md ด้วยถ้ามีอะไรจะบันทึกอย่างเช่นในส่วนของ integration 3 ระบบ
---
## 📞 PPLE Calling
<!-- ## update calling permission ฝากเติมลง md/calling.md

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
Override ได้รายคน — admin สามารถให้สิทธิ์พิเศษหรือเพิก privilege ได้ -->

Optional
เพิ่ม audit logs -> สามารถดูได้ว่าแก้ไขหรือเพิ่มอะไร (เป็น History)
(การขยายข้ามภาค) approval flow เช่น 
เข้าถึงสมาชิกทั้งประเทศ+ทั้งหมด → ขอ approval ผ่านเลขาธิการ/แอดมิน
เข้าถึงสมาชิกระดับภาค → ขอ approval ผ่านรองเลขาธิการภาค/ผู้ประสานงานภาค
เข้าถึงสมาชิกระดับจังหวัด → ขอ approval ผู้ประสานงาน/กรรมการจังหวัด

### แก้ bug finance ด่วน
- กรณีบัญชี private ตอนนี้ ไม่ขึ้นให้คนทั่วไปดู แต่ขึ้น transaction หราเลย 

### แก้ไขก่อน 
<!-- - calling_campaigns นี่เรามาทำเป็นตาราง act_event_cache จากระบบ act เดิม gemini บอกให้ทำ cache act_events แล้วตัด calling_campaigns ทิ้ง ใช้ act_event_id แทน campaign_id (ใช้ campaign_id ก็ได้ แต่ให้รู้ว่ามันคือ act_event_id) อันนี้โอเคไหม เดี๋ยวให้ดูตัวอย่างข้อมูล act_registers เป็นข้อมูลที่แสดงคนลงทะเบียน ต่อ 1 กิจกรรม โดย event_id ของกิจกรรมนี้คือ 146354 ดูจาก ref_id ของคนลงทะเบียนแล้ว เหมือนมัน run recursive แบบ wordpress style อ่ะ ผมว่าคุณคงเดา schema ออก ลองคาดเดาหน่อย เผลอๆ ตาราง act_registers ไม่มี แต่คือ ตาราง act_events เดียวกันนี่แหละแบบ wordpress style -->
<!-- - กลับมา calling ต่อ อาจจะต้องแก้ campaign_id เป็น id ของตาราง act_event_cache ไหม และ อาจจะใช้ชื่อ event_id หรือ act_event_id ไหม ใช้ชื่ออะไรดี -->
<!-- - ตอนนี้อยากให้แสดงสมาชิกทั้งหมดเลย ตาม view permission ของ user คนนั้น จะอ่านได้ตามลำดับการเข้าถึงโดย role ตรงนี้ทำหรือยังนะ แล้วก็มี view as role ด้วยคล้ายๆ finance เลย
- มาดู แต่ละหน้ากันต่อ เราจะมีหน้า campaign, member list, pending call เอาไปอ่านก่อน แล้วก็อยากได้ UI/UX เหมือนที่ออกแบบมาใน md/calling/calling-system-v2.html ดูออกไหมแต่ละหน้าเป็นยังไง process เป็นไง -->
<!-- - ยังอยู่หน้า calling/[campaignId] ยังคงไม่เป็นระเบียบเลย, ตอนนี้แสดง member แค่ 100 คน, อำเภอแสดงไม่ครบ, ทำ campaign_id ให้แสดงเป็นรหัสจังหวัดไหมเช่นราชบุรี 70 บน act ก็เหมือนจะไม่มี id เลข 2 หลักพวกนี้เลย -->

<!-- เพิ่มเมนูบน Nav หน้า Pending calls ทำตามรายละเอียดดังนี้
- md/calling/calling-system-v2.html Included: 
✅ Page 1: Campaign selection (landing) ✅ Page 2: Member list + bulk assign modal ✅ Page 3: Call logging with sidebar (member info + campaign details) ✅ Page 4: Member profile + call history ✅ Page 5: Campaign management (CRUD) ✅ Modal: Assign to... (searchable dropdown) ✅ Status badges: Called/Pending ✅ Progressive disclosure: Signals show only when "Answered" selected ✅ Status indicator: Shows live when status clicked
- เป็นหน้าของคนที่เราได้รับ assign มาให้โทร
- จิ้มไปที่รายชื่อสมาชิกแล้ว จะเป็น model แสดงหน้า Record call ดูดีไซน์จาก md/calling/calling-system-v2.html
- Modal Record Call (ใช้คำศัพท์อะไรก็ได้ถ้าช่วยคิด เช่น call recording, calling log) ให้ขึ้นแสดงข้อมูล campaign ของการโทร, มีปุ่มกดโทรจากหน้านี้, รายละเอียดสมาชิกเน้นช่องทางติดต่อ, ปุ่ม signal การโทร, ช่องบันทึกการโทร, sig status 4 ด้าน (location availability interest Reachable) ตอนกด answered, history ของการโทรหาสมาชิกพร้อมคะแนน signal (มี hint เขียนบอกว่าคะแนนแต่ละ signal คืออะไร), อย่าลืมทำให้ mobile friendly One-column layout responsive, Avatar, ข้อมูลสมาชิกดึงจาก ngs_member_cache
- เพิ่มปุ่ม "Save & Call Next Member" เพื่อลดขั้นตอนการคลิกและทำคิวโทรให้ต่อเนื่อง
- แสดง "บันทึกล่าสุด (Latest Note)" และ "สถิติการรับสาย (X/Y)" บนการ์ดสมาชิกในหน้า Pending calls
- อย่าลืมคำนึงถึงเรื่อง เน้นให้คนโทร (Caller) ทำงานได้ไวและเตรียมตัวก่อนโทรได้ทันที -->

อัพเดท Calling (calling/pending)
<!-- - ขอแก้ไขสถานะทั้งหมดใหม่ดังนี้
answered => รับสาย    ✅ ชัด
no_answer => ไม่รับ    ✅ ชัด
wrong_number => เบอร์ผิด    ✅ ชัด
pending => ยังไม่โทร (ถ้าไม่มี 3 สถานะ ด้านบน แสดงว่ายังไม่โทร)
แล้วก็อยากเพิ่มสถานะว่าร่วมกิจกรรมได้ "เข้าร่วม/ไม่เข้าร่วม/อาจจะ" จะเป็นอีกสถานะ หรือเพิ่ม field ใหม่ดี ความเห็นผมน่าจะเพิ่ม field คิดว่าไง
- เช็ค pending จากวันที่ใน act_event_cache ถ้าเลยกำหนดกิจกรรมแล้ว ให้หายไปจาก pending ซ่อน assignment ไว้ ไม่ต้องแสดง? -->
- wrong_number นี่เราจะรู้ใน layer log ไหมนะ อันนี้มันน่าจะ flag ระดับสมาชิก ไม่แน่ใจขอความเห็น

อัพเดท Calling (calling/[campaignId])
<!-- - ใน dropdown filter ทุกตัว ให้วงเล็บจำนวนสมาชิกใน filter นั้นๆ 
- ไม่เข้าใจในวงเล็บ ตรง (ไม่มี call log เลย)
- หลังงานผ่านไปแล้ว แค่ให้ไม่ต้องแสดงในหน้า calling/pending เพราะไม่ต้องโทรแล้ว อย่างอื่นไม่ต้องแก้อะไร ดังนั้นแล้ว assignment ยังอยู่แค่ไม่แสดงเฉยๆ
- ถ้าไม่มี calling log ในแคมเปญนั้นถือว่ายังไม่ไพ้มอบหมาย (รอมอบหมาย) ดังนั้น ฟิลเตอร์หน้านี้มีแค่มอบหมายแล้วกับยังไม่ได้มอบหมายก็พอ ลังเลว่าจะใช้คำว่า "ยังไม่มอบหมาย" หรือ "รอมอบหมายดี" -->

หน้า Calling (calling/members)?
- จิ้มไปที่ member แล้วแสดงหน้า คล้ายๆ แบบ Record call ดู md/calling/calling-system-v2.html อย่าลืมปุ่มกดโทร ดึงข้อมูลโทรศัพท์จาก ngs_member_cache แสดง history ของแต่ละการโทรของและแคมเปญแต่ละครั้ง

ชวนคิด
- เมื่อบันทึกว่าเป็น Wrong number ระบบควรมี Alert ถามว่าจะ "ลบเบอร์นี้/มาร์คว่าเบอร์เสีย" ในฐานข้อมูลหลักเลยหรือไม่ เพื่อไม่ให้คนอื่นเสียเวลาโทรซ้ำใน Campaign ถัดไป

๊UI 
- ตอนนี้ขนาดฟอนต์เท่าไร เพิ่มอีกหน่อย 
- Dark Mode ผมว่าตัวหนังสือกลืนไปเยอะเลย Header ของตาราง ขอสีม่วง discord ได้ไหม ช่วยแนะนำผมหน่อยว่าเวลาผมจะบอกตรงไหนควรเป็นสีอะไร จะบอกให้แก้ยังไง หรือคุณมีชุดธีมสีให้เลือกเป็น pattern เลยไหมอ่ะ
- ทำ element ให้ liquid 100% 

---
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
---
## อื่นๆ สำหรับ finance และ calling
- ทำระบบ view as role บนเว็บ มี เหรัญญิก กรรมการจังหวัด ผู้ประสานงานจังหวัด ผู้ประสานงานภาค รองเลขาภาค เลขาธิการ
- Mobile Design คนส่วนใหญ่ใช้มือถือแหละ ไม่ค่อยใช้คอมกันแล้ว 