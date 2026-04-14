Finance Permission Checking
การดู (can View Account):
Public account → ดูได้ทั้งหมด (ไม่ต้อง login)
Private account → เจ้าของ || Admin
Internal account → เจ้าของ || Admin ||  เลขาธิการ || เหรัญญิก || กรรมการจังหวัด (ของบัญชีนั้น) || ผู้ประสานงาน (ของบัญชีจังหวัดนั้น) || ผู้ประสานงานภาค (ของบัญชีจังหวัดนั้น) || รองเลขาภาค (ของบัญชีจังหวัดนั้น)

การแก้ไข (can Edit Account):
Public account → เจ้าของ || Admin || เหรัญญิก
Private account → เจ้าของ || Admin
Internal account → เจ้าของ || Admin || เลขาธิการ || เหรัญญิก && { กรรมการจังหวัด (ของบัญชีนั้น) || ผู้ประสานงาน (ของบัญชีจังหวัดนั้น) || ผู้ประสานงานภาค (ของบัญชีจังหวัดนั้น) || รองเลขาภาค (ของบัญชีจังหวัดนั้น)

---
Import calling xls member : scripts/calling/import-members-xls.js
- line_username คือ LINE_USERNAME
- caller_name คือ CALLER_NAME
---
🎯 Calling System Permission
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

UX design file:///home/tee/VSites/node/pple-volunteers/web/md/calling-system-ui.html 
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
อื่นๆ ของ finance และ calling
- ผมอยากทำ UI Design ใหม่ มี theme ให้เลือกใหม่ จาก demo web/md/calling-system-full.html อันนี้ก็ไม่เลวอ่ะ แต่อยากให้ dark mode base on สีชุดเดียวกันนี้ด้วย
- ทำระบบ view as role บนเว็บ มี เหรัญญิก กรรมการจังหวัด ผู้ประสานงานจังหวัด ผู้ประสานงานภาค รองเลขาภาค เลขาธิการ
- Mobile Design คนส่วนใหญ่ใช้มือถือแหละ ไม่ค่อยใช้คอมกันแล้ว 
- เมื่อบันทึกว่าเป็น Wrong number ระบบควรมี Alert ถามว่าจะ "ลบเบอร์นี้/มาร์คว่าเบอร์เสีย" ในฐานข้อมูลหลักเลยหรือไม่ เพื่อไม่ให้คนอื่นเสียเวลาโทรซ้ำใน Campaign ถัดไป
- calling_campaigns นี่ถ้าเป็น ตาราง act_events ที่อยู่บนระบบเดิมไปเลยไหมเดี๋ยวผมถามขอข้อมูล schema มาให้ เราต้องมา create campaign เพิ่มหรือเปล่านะ
- 

Discord Bot
- Discord มีหนทางไหนที่ทำให้ใครก็ได้ แก้ไข message ที่เดียวกันได้บ้างไหม แต่เท่าที่รู้มันไม่อนุญาตให้เราแก้ไขข้อความคนอื่นได้ มีวิธีอื่นไหม เช่นข้อความผ่าน bot แล้วมีปุ่มให้เปิด modal ให้ใครก็ได้แก้ไขข้อความได้

---
PPLE Docs

