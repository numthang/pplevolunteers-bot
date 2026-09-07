# STATUS — 2026-09-07

## ✅ เพิ่งจบ: KANBAN ชั้น teamspace — **ขึ้น prod แล้ว 2026-09-08** (prod = `5563a5c`)

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
