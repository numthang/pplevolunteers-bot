# STATUS — 2026-09-08

## ✅ เพิ่งจบ: Posts — บทพูด + เครื่องช่วยอ่านหน้ากล้อง (`77bfbfc` · local เท่านั้น · **user ยังไม่กดทดสอบ**)

**ขั้นที่ 1 ของสายงานคลิป** · แผนเต็ม `/home/tee/.claude/plans/rosy-wibbling-wand.md`

user ต้องทำคลิปเพราะคนเสพวิดีโอมากกว่าอ่าน แต่**ตัดต่อไม่เป็นและไม่ชอบทำคลิป** และปฏิเสธทางลัดสาย AI
ทั้งหมด (ไม่เอา avatar ท่องสคริปต์ · ไม่เอา TTS · ไม่เอาภาพ AI ล้วน) เพราะยึดหลัก
**ของจริงเป็นแกน · AI เร่งงานรอบๆ · คนตัดสินใจปลายทาง**
→ ทางที่ถูกที่สุดคือ **ไม่ต้องตัดต่อเลย**: มีบทให้อ่านจากจอ แล้วอัดจบในเทคเดียว
เครื่องมืออ้างอิง = **Descript** แต่ลอกแค่แนวคิดเดียว (บทเป็นตัวตั้ง ไม่ใช่ไทม์ไลน์) เหมือนที่ลอกกระดานจาก Notion

| ของที่ได้ | ที่ไหน |
|---|---|
| slot `posts.script` | `config/aiPrompts.js` — ประโยคสั้น · ตัดวงเล็บ/บุลเล็ต/อีโมจิ · ตัวเลขเป็นคำอ่าน · ย่อหน้าตามจังหวะหายใจ |
| endpoint | `web/app/api/posts/ai/script/route.js` — **ไม่เขียน DB เอง** (bug-071) คืนข้อความให้ editor เซฟ |
| หน้าอ่าน | `/posts/[id]/script` → `web/components/posts/ScriptTeleprompter.jsx` |
| ทางเข้า | `PostEditor.jsx` — โหมด "ทำบทพูด" ในเมนู AI + ปุ่ม "เปิดบทพูด" |
| สโมค | `scripts/smoke/postsScript.mjs` (`node --import ./scripts/smoke/_envload.mjs …`) |

**ไม่มี migration** — เก็บที่ `post_episodes.bodies->>'script'` (jsonb ที่มีอยู่แล้วแต่ไม่เคยมีใครใช้)
⚠️ ต้อง **merge** ของเดิมใน `bodies` เสมอ เขียนทับทั้งก้อน = คีย์อื่นหายเงียบๆ

**verify ที่ผ่านแล้ว:** `npm run build` ✅ · 507 tests ✅ · mobileAudit `/posts/42/script` exit 0 ✅ ·
smoke ✅ ทั้ง prompt (8 ด่านรูปแบบ) และ round-trip ของ `bodies` (คีย์อื่นไม่หาย · lockToken เก่าถูกปฏิเสธ)

**บทเรียนจากรอบแรก (ปิดช่องแล้ว + มีด่านดักใน smoke):** AI **สร้างช่อง `[ใส่ตรงนี้ — …]` ที่ต้นฉบับไม่มี**
และ **เติมวลี "กำลังเร่งดำเนินการต่อเนื่อง"** ที่ต้นฉบับไม่ได้พูด — ทั้งสองอย่างคือสิ่งที่ user รับไม่ได้ที่สุด

### ➜ ขั้นถัดไป
1. **ให้ user กดจริง** → `http://localhost:3000/posts/42/script` (โพสต์ 42 ถูกใส่บทพูดทดสอบไว้บน local
   เพื่อให้ mobileAudit ตรวจถึงแถบควบคุม — **ลบทิ้งได้เลยถ้าไม่ต้องการ**)
   เกณฑ์จริงคือข้อ 7 ของแผน: **อัดคลิปหนึ่งคลิปโดยอ่านจากหน้านี้ แล้วดูว่าได้เทคเดียวจบไหม**
   ถ้ายังต้องอัดหลายเทค = ปัญหาอยู่ที่บทพูด ให้ไปปรับ `head` ของ slot **ก่อน**ขึ้นขั้นที่ 2
2. **เกณฑ์ตัดสินว่าจะทำขั้น 2 ไหม:** ทำคลิปจริง 3-5 คลิปก่อน แล้วดูว่าอะไรน่ารำคาญที่สุด — ไม่ใช่เดาล่วงหน้า
   (ขั้น 2 = ถอดเสียง+ซับ · ขั้น 3 = แก้คลิปด้วยการลบประโยค · ขั้น 4 = รูปจริงขึ้นตามจังหวะ)

### ⛔ ข้อตกลงที่ห้ามเปลี่ยนเอง
- **ห้ามให้ AI แต่งเนื้อหาใหม่ใน slot นี้เด็ดขาด** — มันแปลง *รูปแบบ* จาก body ที่มีอยู่เท่านั้น
- **ห้ามเสนอ TTS / avatar / เจนภาพประกอบ** — user ปฏิเสธชัดเจน ไม่ใช่เพราะยังไม่ถึงคิว
- ภาพประกอบในอนาคตต้องมาจาก **คลังรูปจริงของ user** ไม่ใช่ภาพ AI (user ทำข่าวด้วยรูปจริงเสมอ)
- งานเก็บรายละเอียดกราฟิกนิ่งอยู่บน **Canva** ของ user — ไม่ต้องย้ายเข้าระบบ

---

## ✅ ก่อนหน้า: KANBAN ชั้น teamspace — **ขึ้น prod แล้ว 2026-09-08** (prod = `5563a5c`)

deploy แล้วครบ: `git pull` → `npm run migrate up` → `web && npm run build` → `pm2 restart pple-web pple-dcbot`
· ตรวจหลัง migrate บน prod: teamspace "ทีมราชบุรี" (scope_node 32 · guild ราชบุรี · default_board 1) ·
บอร์ดที่ยังไม่มีทีม = **0** · การ์ด 1,410 ใบเท่าเดิม · `/api/kanban/teamspaces` ตอบ 401 ตอนไม่ล็อกอิน (route มีจริง)
· รอบนี้พ่วง `7b1a04e` (กล่องยืนยันก่อนเผยแพร่ของ posts) ขึ้นไปด้วย เพราะ prod ค้างอยู่ที่ `c6f3718`

`org > teamspace > boards > cards` · แผนเต็ม `/home/tee/.claude/plans/kanban-multi-board-dreamy-quilt.md`

**ทำแล้วทั้ง 4 ก้อน:**
| ก้อน | ของที่ได้ |
|---|---|
| **A** | `migrations/1788700000000_kanban-teamspaces.sql` (รันบน local แล้ว) · `web/db/kanban/teamspaces.js` · `/api/kanban/teamspaces` + `[id]` · `canViewTeamspace/canCreateTeamspace/canManageTeamspace` · ปุ่มเลือกที่ทำงาน 2 ชั้น + ช่องค้นหา + จำที่ล่าสุดใน localStorage · `?teamspace=` ลง URL |
| **B** | ย้ายการ์ดข้ามบอร์ด (แถว "กระดาน" ในการ์ด + กล่องยืนยันถ้ามีค่า field ค้าง) · `/api/kanban/boards/[id]` (PATCH/DELETE) · `BoardSettingsModal.jsx` · **`BOARDS_UI = true`** · `copyFieldDefs()` ก็อปช่องข้อมูลตอนสร้างบอร์ด |
| **C** | `resolveBoardId` ฝั่งบอทไล่ teamspace ของ guild → `default_board_id` → บอร์ดแรกในทีม → บอร์ดของ org · StringSelect "ย้ายไปกระดาน…" หลังสร้างการ์ดจากดิสฯ |
| **D** | `web/db/kanban/scopeSql.js` — `teamspaceScopeSql()` คืน `TRUE` เสมอ (ตะเข็บวันจำกัดสิทธิ์) |

**verify ที่ผ่านแล้ว:** `npm run build` ✅ · `npm test` 507 ตัว ✅ · mobileAudit `/kanban` ✅ (เหลือข้อแนะนำ E 1 จุด ไม่นับ error) ·
smoke ผ่าน session จริงบน dev server: GET/POST teamspaces · POST board + ก็อป field (7 field / ตัวเลือก 14+11 สีลำดับตรงเป๊ะ) ·
`?teamspace=` กรองการ์ด · ย้ายการ์ดแล้ว **ref KB-xxx ไม่เปลี่ยน** · ตั้ง default board ข้ามทีมถูกปฏิเสธ 400 · ย้ายบอร์ดข้ามทีม 200 ·
teamspace/บอร์ดสุดท้ายเก็บเข้ากรุไม่ได้ · ของทดสอบลบหมดแล้ว (local เหลือ teamspace 1 "ทีมราชบุรี" · board 1 · card 1,264)

### ➜ ขั้นถัดไป
1. **ให้ user กดจริงบน prod** — ปุ่มเลือกทีม/บอร์ด · สร้าง teamspace 2 ทาง · เฟืองตั้งค่า · ย้ายการ์ด ·
   คลิกขวาในดิสฯ → สร้าง KANBAN แล้วดู select "ย้ายไปกระดาน…" · โหมด "View as role"
2. **ยังไม่ได้ทำ:** `ALTER TABLE kanban_boards ALTER COLUMN teamspace_id SET NOT NULL;`
   (ตรวจแล้วว่า NULL = 0 ทั้ง local และ prod · เหลือแค่เขียนเป็น migration ใบใหม่แล้ว deploy รอบถัดไป)

### ⛔ ข้อตกลงที่ห้ามเปลี่ยนเอง
- ใช้คำว่า **teamspace** ทับศัพท์ · ห้ามแปลเป็น "แผนก"/"ทีม"/"space"
- **รอบนี้ไม่มีด่านสิทธิ์เลยโดยตั้งใจ** — จะกันจริงต้องแก้ `web/db/kanban/scopeSql.js` แล้ววางลง 3 จุดพร้อมกัน
  (`canViewTeamspace` · `listCards` · `getCardForViewer`) · ทำครึ่งเดียว = ความเป็นส่วนตัวปลอม
- ถ้าจะกันสักจุดในอนาคต **กันการ์ดเคสร้องเรียน 176 ใบก่อน** (เปิดทั้ง org ตั้งแต่ 2026-09-04 · พอมีทีมที่ 2 คนทีมนั้นอ่านได้หมด)
- ห้ามเพิ่ม `kanban_boards.is_guild_default` / `kanban_board_channels` / `kanban_columns` (ตีตกไปแล้วพร้อมเหตุผลในแผน)

---

## ➜ ค้างไว้ (ไม่ด่วน)
1. แท็บ "นำเข้าแล้ว" ยังไม่มีลิงก์ไปเปิดการ์ด KB-xxx (เสนอไว้ user ยังไม่ตอบ) · ยังไม่มีปุ่ม "ยกเลิกการนำเข้า"
2. AI ตกไป 1 ใบจาก 256 — รัน `prepForumImport.mjs --org 1` ซ้ำได้ มันข้ามใบที่ทำแล้ว
3. `caseUploads.getCaseUploadDir()` / `cropDocument.getUploadPath()` มีบั๊ก cwd แบบเดียวกับที่แก้ไปแล้ว
4. cases/kanban ยังไม่ต่อตัวย่อรูป (`web/lib/kanbanUploads.js`) · `gc-media.js` ยังไม่มีอะไรเรียกอัตโนมัติ
5. **Posts โหมด AI "ร่างตามคำแนะนำ"** (`5c73c8b`) — local เท่านั้น user ยังไม่กดทดสอบ

## ✅ ของที่จบไปแล้ว (อ้างอิงเฉยๆ)
- **ย่อรูปทุกทางเข้าของ posts** (`1caf562`) — ขึ้น prod + ยิงจริงผ่านครบ 5 แพลตฟอร์ม 2026-09-05 · คืนพื้นที่ ~1.33 GB
- **คัดกระทู้ดิสฯ เข้า KANBAN** (`/kanban/import/forum`) — ใช้จริงบน prod · prod = `bda2f210` · นำเข้า 12 · ไม่เอา 14 · เหลือ 229

## ⚠️ รู้ไว้
- **prod ใช้ปุ่มเดิมไม่ได้แล้ว: ไม่มีปุ่ม "เพิ่มกระดาน" ใหญ่ๆ มุมขวาบน** (user สั่งเอาออก 2026-09-08)
  สร้างการบ้าน = ปุ่ม + บนหัวกอง · สร้างกระดาน/teamspace = ในลิสต์เลือกที่ทำงาน
- **custom field ผูกกับ "กระดาน" ไม่ใช่ teamspace — user ยืนยันแล้ว ห้ามเสนอย้ายอีก**
- **dev server ของ user รันอยู่ที่พอร์ต 3000** — จะ build ต้องใช้ `NEXT_DIST_DIR=.next-test` ไม่งั้นชน `.next` เดียวกันแล้ว dev server 500 ทั้งเว็บ
- เครื่อง dev มี `ANTHROPIC_API_KEY` เก่าค้างใน `~/.bashrc` → สคริปต์ต้องโหลด env ผ่าน `scripts/smoke/_envload.mjs`
- git ในเครื่องนี้เคยเพี้ยน hash หายจาก reflog 2 รอบ — ก่อน deploy เช็ค `git log -1` ทั้ง 2 ฝั่งจริง
