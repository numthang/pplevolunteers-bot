# PENDING.md — Backlog & Ideas

> เก็บเฉพาะงานค้าง + design ที่ยังไม่ทำ · ของที่ทำเสร็จ+deploy แล้วย้ายไปอยู่ในโค้ด/`md/*` ตามระบบ

## 🎨 CSS Design Token migration — รองรับสีแบรนด์ต่อ org แบบ runtime (เคาะ 2026-08-20)

**user เคาะแล้วว่าจะทำ** หลังคุยเปรียบเทียบกับ prompt "design token + component class" ที่เจอมา — สรุปเหตุผลที่ทำให้คุ้ม (ไม่ใช่แค่ nice-to-have): โปรเจกต์กำลังจะเป็น multi-tenant org platform (rebrand → platfor.org, มี `config/brand.js` วางรากไว้แล้ว [[project_rebrand]]) ถ้าแต่ละ org อยากมีสีแบรนด์ตัวเอง **ต้องเปลี่ยนได้ตอนรันไทม์โดยไม่ deploy ใหม่** — Tailwind config ทำแบบนี้ไม่ได้ (เป็นค่า build-time) ต้องใช้ CSS variable จริง

**สถานะตอนนี้ (ตรวจ 2026-08-20):** สี `teal`/`warm-*`/`disc-*` อยู่ใน `tailwind.config.js` (เปลี่ยนที่เดียวได้แต่ต้อง rebuild) มีแค่ `--card-bg` ตัวเดียวที่เป็น CSS variable จริงใน `globals.css` — ไม่มี component class (`.btn`, `.card`) เลย ต้องก็อป Tailwind string เต็มทุกไฟล์

**ตรวจ compliance กับกฎเดิมใน WEB.md แล้วพบว่าต่ำกว่าที่คิด** (จาก 196 ไฟล์ component/page ใน `web/`):
- hardcode hex color: 26 ไฟล์ (~13%)
- ใช้ `text-xs` ทั้งที่ห้าม: 77 ไฟล์ (~39%)
- ใช้ `rounded-xl` บนการ์ด/กล่องทั้งที่ห้าม: 72 ไฟล์ (~37%)
- ปุ่ม primary ตรงสตริงมาตรฐานเป๊ะ: แค่ 6 ไฟล์

**แผนที่คุยกันไว้ — แยก 2 ก้อน ห้ามรื้อรวดเดียว:**
1. **สร้าง token + component class layer** (`globals.css`/`tailwind.config.js`) — เสี่ยงต่ำ ไม่กระทบของเดิมเพราะยังไม่มีใครเรียกใช้ class ใหม่
2. **ไล่ migrate 196 ไฟล์ทีละโซน** — โปรเจกต์นี้**ไม่มี visual regression test** ต้องเปิดเบราว์เซอร์เช็คจริงทุกโซนก่อนไปโซนถัดไป (ตรงกับหลัก "ทำไปเทสไป" ที่เคาะไว้กับ kanban [[feedback_test_as_you_go]]) — ห้ามรื้อทั้ง 196 ไฟล์รวดเดียวเพราะไม่มีทางรู้ว่าพังตรงไหนจนกว่าจะเจอเอง
3. **อัปเดตกฎลง `md/WEB.md`** (ไม่ใช่ CLAUDE.md ตรงๆ — CLAUDE.md แค่ชี้มาที่ WEB.md อยู่แล้วเหมือน section CSS conventions เดิม) — เขียนกฎ "โค้ด CSS ใหม่ห้าม hardcode สี/ขนาด ต้องใช้ token/component class" แบบเดียวกับ section i18n **ทำได้ก็ต่อเมื่อก้อน 1 เสร็จแล้วเท่านั้น** เพราะกฎนี้อ้างถึง class ที่ต้องมีอยู่จริงในโค้ดก่อน — ถ้าเขียนกฎไว้ก่อนมี class จริง Claude session หน้าจะเรียก class ที่ไม่มีอยู่

**ยังไม่เคาะ:** ลำดับโซนไหนก่อน-หลัง, timeline

## 🗄️ Refactor: API route ยิง SQL ตรง ไม่ผ่าน service layer (พบจาก audit 2026-08-20)

ตรวจ codebase เทียบ checklist ที่ [md/AUDIT.md](AUDIT.md) §2 — ผลตรวจ:

| ข้อตรวจ | สถานะ | รายละเอียด |
|---|---|---|
| **Connection Pooler** | ⚠️ ไม่มี | ยิงตรง port 5432 ไม่มี PgBouncer/Supavisor คั่น มีแค่ pool ระดับ app (`pg.Pool`) — ยังไม่เป็นปัญหาตอนนี้เพราะ traffic ต่ำ แต่เป็นจุดเสี่ยงถ้า concurrent connection พุ่ง |
| **Singleton Instance** | ✅ ผ่าน | มี pool แค่ 2 จุดทั้งโปรเจกต์: `db/index.js` (บอท, `max: 10`) กับ `web/db/index.js` (เว็บ, `max: 3`, กัน hot-reload สร้างซ้ำด้วย `globalThis._pgPool`) — ไม่มี `new Pool()` กระจายไฟล์อื่น |
| **Service Layer แยกจาก UI** | ⚠️ รั่วบางส่วน | มี service layer อยู่แล้ว (`db/` บอท 26 ไฟล์, `web/db/` เว็บ 50 ไฟล์) **แต่พบ 41 ไฟล์ใน `web/app/api/**/route.js` import `pool` ตรงแล้วยิง SQL เองในนั้น** ไม่ผ่าน `web/db/` — ตัวอย่าง: `web/app/api/profile/route.js`, `web/app/api/social/accounts/route.js`, `web/app/api/finance/funds/[id]/route.js` ฯลฯ (ดูรายชื่อเต็มด้วย `grep -rl "pool.query\|db.query" web/app`) นอกจากนี้สคริปต์บอท 3 ไฟล์ (`scripts/cron/sync-act-events.js`, `scripts/calling/import-member-csv.js`, `scripts/calling/import-act-event-cache.js`) import db ตรง — ระดับ one-off script ยอมรับได้ ไม่ใช่ปัญหา |
| **แยก `DATABASE_URL`/`DIRECT_URL`** | ➖ ไม่ตรง pattern แต่ไม่ใช่ปัญหา | ใช้ตัวแปรแยก `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASS`/`DB_NAME` แทน — เทียบเท่ากันแค่คนละ format เพราะไม่ได้ใช้ ORM ที่ต้องการ URL ทั้งก้อน |
| **Vendor Lock-in** | ✅ ไม่ติด | ทั้งโปรเจกต์ใช้ raw `pg` ล้วน ไม่มี Supabase/Vercel SDK ฝังอยู่เลย → ย้าย VPS ↔ Supabase Cloud แค่เปลี่ยนค่า `DB_*` ใน `.env` |

**ไม่เร่งด่วน** — ไม่กระทบ user ตอนนี้ แค่ debt สะสม ถ้าจะทำ:
- ไล่ทีละโซน ย้าย query จาก route → ฟังก์ชันใน `web/db/<module>.js` ที่ตรงกัน แล้วให้ route เรียกฟังก์ชันแทน
- งาน mechanical ซ้ำ pattern เดิม → ส่งเป็นก้อนเล็ก 2-3 ไฟล์ต่อ Sonnet subagent ได้
- Connection pooler (PgBouncer) ยังไม่จำเป็น — ค่อยพิจารณาตอน traffic สูงขึ้นจริง

## 🗂️ Kanban ก้อน 3 — board จริง (เลื่อนได้ · ประเมินแล้ว 2026-08-20)

**user ถาม: "กระทบโครงสร้าง ทำทีหลังไม่เป็นไรใช่ไหม" → ไม่เป็นไร ตราบใดที่ยังมีทีมเดียวใช้**

**ผลกระทบจริงเล็ก เพราะรางวางไว้แล้ว** — `board_id` ถูกอ้างถึงแค่ 3 บรรทัดทั้ง repo:
`web/db/kanban/fields.js:25` (select) · `web/db/kanban/cards.js:42,78` (`d.board_id IS NULL` ฮาร์ดโค้ด + คอมเมนต์เตือน)
schema: `kanban_field_defs.board_id` มีแล้ว **และ** unique index ใช้ `COALESCE(board_id, 0)` ตั้งแต่แรก
→ งานที่เหลือคือ `CREATE TABLE kanban_boards` + `ALTER TABLE kanban_cards ADD COLUMN board_id` = **migration แบบเติมล้วน** ไม่มีแปลง type

**⏰ ตัวจับเวลาไม่ใช่ "เวลา" แต่คือ "ทีมที่ 2 เริ่มลงงาน"**
ของที่แพงขึ้นคือ **การตัดสินว่าของเก่าเป็นของกระดานไหน** ไม่ใช่ schema ·
ตอนนี้ทีมเดียว งานชุดเดียว (82 ใบ) → backfill = "ยกทั้งหมดไปกระดาน 1" จบใน 1 statement
พอมีทีมที่สองลงงานในคลังเดียวกัน คลังตัวเลือกจะปนกัน แล้วต้องแยกทีละตัวด้วยมือ
(เหมือนเคส `ปริ้นเตอร์`/`พรินเตอร์` แต่หนักกว่า — สคริปต์ตัดสินแทนไม่ได้)

**⚠️ ข้อขัดแย้งที่ต้องเคาะตอนลงมือ (อย่าปล่อยให้ดริฟต์):**
schema เขียน `board_id NULL = ใช้ทุกกระดาน` แต่ user เคาะทีหลังว่า **คลังตัวเลือกห้ามข้าม board** — ขัดกันอยู่
ต้องเลือก: (ก) ทิ้งความหมาย "NULL = ของกลาง" แล้ว backfill ทั้งหมดเข้ากระดาน + `SET NOT NULL`
หรือ (ข) เก็บ NULL ไว้เฉพาะ field ที่เป็นของกลางจริงๆ ไม่กี่ตัว
**ตอนนี้ข้อมูลเป็น NULL หมด = กวาดทีเดียวสะอาด** ยิ่งเลื่อนนานยิ่งต้องมานั่งแยกแยะ

**อื่นๆ ที่ต้องขยับพร้อมกัน:** route `/kanban/fields` · `/kanban/labels` · `/kanban/board` เป็น segment คงที่
ถึงก้อน 3 ต้องย้ายกระดานไป `/kanban/b/[board]` (เตือนไว้ใน `.wolf/anatomy.md` แล้ว)

## 👤 การ์ดโปรไฟล์คนแบบ Discord — ✅ กล่องโปรไฟล์เสร็จ 2026-08-20 (local, ยังไม่ commit) · เหลือ DM

**ทำไปแล้ว:** กดชื่อเจ้าภาพ/คนช่วยในการ์ด → เปิด `PersonProfileModal` (รูป/ชื่อ/@username/ยศ/จำนวนการ์ดที่ถือ)
แยกจากปุ่มแก้ค่าแล้ว — ปากกาข้างชื่อ (ตรง `TagCombobox.jsx` prop ใหม่ `onOpenProfile`) เปิด picker เดิม
API: `GET /api/kanban/people/[id]` (`web/db/kanban/people.js#getPersonProfile`) — gate ด้วยแถว `org_members` ก่อนเสมอ กัน enumeration ข้าม org (คนใน org อื่นไล่เลข userId ดูชื่อจริง+avatar คนทั้งระบบไม่ได้)
⚠️ **ยังไม่ได้กดจริงในเบราว์เซอร์** — ให้ user เปิดการ์ดที่มีเจ้าภาพ/คนช่วยแล้วกดชื่อทดสอบก่อน

**เหลือ (ก้อนถัดไป) — กล่องแชทส่ง DM ผ่านบอทจากในเว็บ:**
- บอทกับเว็บเป็นคนละโปรเซส **ยังไม่มีเส้นเชื่อมกันเลย** — ของเดิมที่ใกล้เคียงสุดคือ `services/smsWebhook.js`
  (เปิดพอร์ต HTTP + secret ให้แอปนอกยิงเข้ามา) น่าจะ pattern เดียวกันที่ใช้ได้: เว็บยิง HTTP เข้าโปรเซสบอทให้สั่ง `user.send()`
- ต้องเคาะเรื่องสิทธิ์ก่อนทำ: ใครส่งหาใครได้ · ปิดรับ DM แล้วบอกยังไง · เก็บ log ไหม
- เป็นกล่องลอยเฉยๆ หรือมีหน้าจริง `/org/people/[id]` ด้วย (deep link / แชร์ลิงก์ได้) — ยังไม่เคาะ

**เกี่ยวข้อง:** สูตรชื่อคน `web/db/displayName.js` · avatar pattern ลอกจาก `web/db/orgchart.js:79` · roles เป็น comma-string ไม่ใช่ array (`org_members.roles`)

---

## 🖼️ avatar ย้ายมาที่ `users` แล้ว (2026-08-18) — ยังไม่ deploy + ยังไม่มีรูปที่ตั้งเองบนเว็บ

**ทำไปแล้ว (local):** `users.avatar` เป็นแหล่งจริง · อ่านทุกที่เป็น `COALESCE(u.avatar, om.avatar)` ·
บอทเขียนตอน register/memberAdd/memberUpdate + `userUpdate` (เปลี่ยนรูปแล้วตามเอง) ·
`org_members.avatar` เหลือเป็น fallback ของเก่า ยังไม่ DROP

**ต้องทำตอน deploy:**
1. รัน migration (`ALTER TABLE users ADD COLUMN avatar` + UPDATE ยกของเดิม) — อยู่ท้าย `scripts/migration/migration.sql`
2. ขึ้นบอทกับเว็บ**พร้อมกัน** (เว็บอ่าน `u.avatar`, บอทเขียน `u.avatar`)
3. รัน `node scripts/data/backfill-avatars.js` เติมคนเก่า (dry run 2026-08-18 บน prod: 6,034 แถวเป็นเพดานบน)

**ถ้าจะทำ "รูปที่ผู้ใช้อัปโหลดเองบนเว็บ" — ห้ามใช้คอลัมน์ `users.avatar`**
บอทเขียนทับคอลัมน์นี้ทุกครั้งที่เจ้าตัวเปลี่ยนรูปใน Discord (`userUpdate`) → รูปที่อัปเองจะหายเงียบ
ให้เพิ่มคอลัมน์แยก `users.avatar_custom` แล้วไล่แก้ลำดับการอ่านเป็น
`COALESCE(u.avatar_custom, u.avatar, om.avatar)` ที่ 5 จุด:
`web/db/orgchart.js` (1) · `web/db/calling/members.js` (3) · `web/db/calling/starred.js` (1)

**ค้างอยู่:** DROP `org_members.avatar` ทิ้งหลัง deploy นิ่งแล้ว

## 🗄️ Postgres ยังไม่อยู่ใต้ aaPanel — backup ตอนนี้เป็น workaround (2026-08-17)

Production Postgres ลงด้วย `sudo apt install postgresql` ตรง ๆ (ไม่ผ่าน aaPanel PgSQL Manager plugin) → ปลั๊กอินไม่รู้จัก instance นี้เลย
(DB List ว่าง, ปุ่มมีแต่ "Install version" ซึ่งจะไปชน port 5432 ของเดิมแน่ ๆ ถ้ากด)

**วันนี้แก้ด้วย:** สร้าง db เปล่า `pple_dcbot` (ให้ handshake ผ่าน default-db-name-เท่ากับ-username ของ Postgres) แล้วใช้ "Remote DB" ต่อเข้าไปแบบ read-only/browse — แต่ฟีเจอร์นี้ไม่ผูกกับ cron+backup อัตโนมัติของ panel จริง
→ backup เลยต้องใช้ Cron "Shell script" (pg_dump) + Cron "Backup: Directory" (ดันขึ้น Drive) แทน ไม่ใช่ Cron "Backup: Database" แบบ native

**อยากได้ในอนาคต (user เคาะ 2026-08-17):** "ยุ่งจริง อยากใช้ gui aapanel ง่ายๆ" — ย้าย Postgres มาให้ aaPanel PgSQL Manager ติดตั้ง/manage เต็มรูปแบบ จะได้ backup ผ่าน Database type ตรง ๆ เหมือน DB อื่น
- ต้องทำตอน maintenance window เท่านั้น (ห้ามรันคู่ขนานบน 5432 เดิม) — แผนคร่าว ๆ: ลง pgsql ผ่าน panel บน port อื่นก่อน → `pg_dump`/`pg_restore` ย้ายข้อมูล → สลับ `.env` DB_HOST/PORT → ปิด apt postgres เดิม → ค่อยย้าย panel instance ไป 5432
- ต้องเช็ค `pg_hba.conf`/`postgresql.conf` ของ panel-managed instance ใหม่ให้อนุญาต password auth เหมือนที่ตั้งไว้วันนี้ด้วย

## 🧩 Kanban — custom field + ลิงก์ต้นทางดิสฯ (เคาะ 2026-08-18)

**แผนเต็มอยู่ที่** `~/.claude/plans/reactive-churning-falcon.md` (ไม่ได้อยู่ใน repo — ถ้าหายให้ไล่จาก `md/kanban/CUSTOM-FIELDS.md` §กลับคำ)

user เคาะ: **ทำ custom field เลย ไม่ต้องรอ tripwire** — *"ไม่ต้องรอองค์กรนอกหรอก ผมนี่แหละ จะเริ่มเพิ่มแล้ว"*

⚠️ **บั๊กเดิมที่เจอระหว่างเทสใน browser จริง (2026-08-18 รอบเย็น) — ไม่เกี่ยวกับ custom field เลย ยังไม่แก้:**
เช็คบ็อกซ์ "ติดปัญหาอยู่" ใน CardModal ยิง `patch({ blocked: e.target.checked })` **ไม่ส่ง `lockToken`**
แต่ server (`/api/kanban/cards/[id]/route.js` PATCH) เส้น `blocked` ตกไปอยู่สาขา "autosave เนื้อหา" ที่บังคับเทียบ
`lockToken` เสมอ → `undefined !== token จริง` ชนกันทุกครั้ง = **กดติ๊ก "ติดปัญหาอยู่" ไม่เคยเซฟติดเลยสักครั้ง**
(`patch()` เห็น `!res.ok` ก็ขึ้น error "มีคนแก้การบ้านใบนี้ไปแล้ว" ทุกครั้งที่กด — ผู้ใช้เห็น error แต่คงเข้าใจผิดว่าเป็นคนอื่นชนกัน
ทั้งที่จริงเป็นบั๊กโค้ด) เป็นบั๊กจากก้อน 1 (ตั้งแต่สร้าง CardModal) ไม่ใช่จากรอบนี้ — แก้ตรงๆ คือให้ `patch()` ส่ง `lockToken.current`
ไปด้วยเมื่อ body มี `blocked`/`blockedReason` หรือย้าย `blocked` ไปเป็น action แยกไม่ผ่าน lockToken เหมือน statusType

**ขั้น 1 เสร็จ local (2026-08-18) ยังไม่ deploy** — ลิงก์ต้นทางดิสฯ `kanban_cards.source_url` + `source_message_id`
- migration เพิ่มแล้วท้าย `scripts/migration/migration.sql` · `/scrutinize` เจอ blocker: customId เดิมมีแค่ `msg.id` ไม่พอสร้าง URL (ต้อง `channelId` ด้วย เพราะ modal submit เป็น interaction คนละก้อน หยิบ `msg` เดิมไม่ได้) → แก้เป็น `kanban_card_modal:<channelId>:<messageId>:<ts>`
- `db/kanbanCards.js` + `handlers/kanbanImportHandler.js` เขียนแล้ว · `web/db/kanban/cards.js` COLS + `CardModal.jsx` แสดงลิงก์ "มาจากข้อความในดิสฯ" แล้ว
- smoke test เขียน+อ่านกลับผ่าน DB จริงแล้ว (ลบทิ้งหลังเทส) · `npm test` 389 ข้อผ่าน · build ผ่าน

**ขั้น 2 เสร็จ local (2026-08-18 รอบเย็น) ยังไม่ deploy** — custom field ครบ 8 ชนิด (text/number/url/date/checkbox/select/multi_select/checklist) เร่งมารวมกับ select/multi_select ตามสกรีนช็อตจริงของ AppFlowy ที่ user ส่งมา + checklist กลับคำจาก "คอลัมน์จริง" → เป็น custom field type (ดู `md/kanban/CUSTOM-FIELDS.md` §กลับคำรอบเย็น)
- **ไม่มีหน้าแอดมินจัดการ field/option แยกอีกต่อไป** (`/kanban/fields` + `FieldManager.jsx` ถูกลบ) — สร้าง/แก้/ซ่อนทุกอย่างทำจากกล่อง "ข้อมูลของทีม" ในการ์ดตรงๆ ไม่มี `isKanbanAdmin` gate เลยในระบบนี้
- ไฟล์ใหม่หลัก: `web/lib/kanbanFieldValue.js` (validate/slugifyFieldKey + เทส 30 ข้อ) · `web/db/kanban/fields.js` (field/option/checklist CRUD) · `web/components/kanban/{TagCombobox,ChecklistFieldBox,CardFieldsBox}.jsx`
- `kanban_card_checklist` เพิ่ม `field_id` แล้ว (0 แถวตอนกลับคำ → replace เต็มๆ ไม่ต้อง migrate) — การ์ดมีได้หลายเช็คลิสต์ถ้า org สร้างหลาย field ชนิดนี้
- smoke test ครบ (สร้าง field ทุกชนิด → เขียน/อ่าน/reorder/rename/archive option → checklist add/toggle/reorder/delete → ยืนยัน `updated_at` ไม่ขยับตลอด) · `npm test` 419 ข้อผ่าน · build ผ่าน
- ⚠️ เจอบั๊กจาก smoke test ก่อน build: AGG ผสม `json_agg`/`to_jsonb` ในตัวเดียวกัน (CASE ต้องชนิดเดียวกันทุกกิ่ง) → error 42846 "could not convert type json to jsonb" แก้เป็น `jsonb_agg`/`'[]'::jsonb` ให้ตรงกับ `to_jsonb()` ที่ใช้ใน CASE อื่น

**ค้างต่อจากที่วางแผนไว้เดิม**
- **ยุบป้ายเข้า custom field จริง** — กลไก select/multi_select พร้อมแล้ว แต่ยังไม่ได้ migrate ข้อมูลจริง (3 กลุ่มป้าย → 3 field · 29 ป้าย → options · 76 เส้น → ค่า) `kanban_labels`/`kanban_card_labels` ยังอยู่เหมือนเดิม ยังไม่แตะ
- **importer เก็บของที่เคยทิ้ง** — Discord → `source_url` · FB Post → field url · งบประมาณ → field number
  ⚠️ ตอนนี้ importer **ข้าม 3 คอลัมน์นี้แบบเงียบๆ ไม่มีบรรทัดเตือน** → import 50 ใบที่จบแล้วรอบหน้าจะหาย 5 Discord + 31 FB

**กับดักที่จดไว้แล้ว ห้ามพลาดซ้ำ:** เขียนค่า field **ห้าม bump `kanban_cards.updated_at`** (เป็น lock token ของ autosave → คนที่เปิดค้างจะโดน 409) · `key` เปลี่ยนไม่ได้/`label` เปลี่ยนได้ · `label` เป็นข้อมูล org ห้ามผ่าน `t()` · ลบ field = `archived_at` เท่านั้น

## 🏷️ Kanban — ป้าย (2026-08-17) · ชิป + ติด/ถอด เสร็จ local ยังไม่ deploy

ชิปบนแถวการ์ด (`LabelChips.jsx`) + กล่องเลือกใน CardModal (`LabelPicker.jsx`) + API 2 เส้น
(`GET /api/kanban/labels`, `PUT /api/kanban/cards/[id]/labels`) — สีชิป hash จากชื่อกลุ่ม ไม่มีชื่อกลุ่มใน โค้ด

**เจ้าภาพ (2026-08-17):** `OwnerPicker.jsx` + `GET /api/kanban/people?q=` (ค้นหาเท่านั้น — org 1 มี 7,376 คน)
· ชื่อที่ค้นเจอใช้สูตรเดียวกับที่การ์ดโชว์ (`web/db/kanban/people.js` — แก้สูตรที่ไหนต้องแก้คู่กับ `db/kanban/cards.js`)

**กระดานย่อ (2026-08-17):** `/kanban/board` — ช่อง = `status_type` 6 แบบ ไม่มีตารางใหม่ · ลาก = `PATCH { statusType }`
⚠️ **ไม่ใช่ก้อน 3** — บอร์ด/ช่องตั้งเอง/สิทธิ์บอร์ด ยังอยู่หลังจุดตัดสินใจตามแผนเดิม

**เพิ่ม 2026-08-17 (รอบเย็น) — สร้าง/จัดการ/กรองป้าย · เสร็จ local ยังไม่ deploy**
- **สร้างป้ายใหม่จากในกล่อง** — ช่องพิมพ์อยู่ในกองของกลุ่มนั้น (ไม่ต้องเลือกกลุ่ม) · `POST /api/kanban/labels`
  ทุกคนใน org สร้างได้ **แต่ตั้งกลุ่มใหม่ไม่ได้** (กลุ่มต้องมีอยู่แล้ว) — org มี 7,376 คน และป้ายลบไม่ได้ ซ่อนได้อย่างเดียว
- **หน้าจัดการป้าย** `/kanban/labels` (admin) — เปลี่ยนชื่อ/ย้ายกลุ่ม/ตั้งสีจากคลัง 12 สี/ซ่อน-เลิกซ่อน + จำนวนการ์ด
  autosave + ป้ายสถานะ ไม่มีปุ่มบันทึก (กฎ Update) · ทางเข้าอยู่ในกล่องเลือกป้าย โชว์เฉพาะ admin (`canManage` ติดมากับ GET)
- **กรองด้วยป้ายในหน้า /kanban** — `web/lib/kanbanLabelFilter.js` (pure + เทส 19 ข้อ) · **OR ในกลุ่ม · AND ข้ามกลุ่ม**
  ชิปกรองสร้างจากป้ายที่มีจริงบนการ์ดที่โหลดมา ไม่ใช่ทั้งคลัง (ไม่งั้นได้ปุ่มกดแล้วว่าง)
- ⚠️ 2 กับดักที่ `/scrutinize` จับได้ และ**แก้ไปแล้ว** — smoke `scripts/smoke/kanbanLabels.mjs` เฝ้าไว้ 22 ข้อ
  1. เปลี่ยนชื่อ/ย้ายกลุ่ม = สีชิปเด้งทั้งระบบ (สี hash จาก `กลุ่ม/ชื่อ`) → `updateLabel` แช่สีเดิมลง DB ก่อนเปลี่ยนชื่อ
  2. ซ่อนป้าย → ชิปหายจากการ์ด → ใครแก้ป้ายบนการ์ดนั้นต่อ = ความสัมพันธ์เดิมหายถาวร → `setCardLabels` ลบเฉพาะป้ายที่ไม่ถูกซ่อน
- ❌ **แก้ความเข้าใจผิดที่เคยจดไว้:** สีเก็บเป็น **hex ได้ตรงๆ** ไม่ต้องเป็น class เต็มสตริง — `chipProps()` ส่ง hex เข้า CSS var `--kb` ให้ `.kb-tint` ผสมเอง ไม่พึ่ง Tailwind scan (bug-409 แก้ทางนี้ไปแล้ว)

**เพิ่ม 2026-08-18 — ยุบเหลือหน้าเดียว + แยก "พักไว้" ออกจาก "กรุ"**
- `/kanban` เป็นหน้าเดียวของโมดูล · `/kanban/board` redirect มา · คุมด้วย 2 ปุ่ม: **แสดง** (ของฉัน/ทั้งหมด/กรุ) กับ **จัดกลุ่ม** (ตามสถานะ/ตามกำหนดส่ง)
- คำ: `backlog` = **รอทำ** (เดิม "รอรับ") · `cancelled` = **พักไว้** (เดิม "กรุ") · `archived_at` = **กรุ** = archive จริง กู้คืนได้
- ⛔ **ห้ามยุบ "พักไว้" กับ "กรุ" เข้าหากัน** และห้ามแก้ปุ่ม "เก็บเข้ากรุ" กลับเป็น "ลบ" — เหตุผลเต็มอยู่ใน KANBAN.md §พักไว้กับกรุ
- ⬜ ยังไม่มี **auto-purge กรุ** และไม่มีปุ่มลบถาวร — การ์ดในกรุอยู่ตลอดกาล (โมดูลนี้ไม่มี hard delete เลย)

**ค้างไว้ (ไม่ทำในรอบนี้)**
- **กระดานบนมือถือลากไม่ได้** (HTML5 DnD) — ถ้าจะเอาจริงต้องลง dnd lib หรือทำเมนู "ย้ายไป…" บนการ์ด
- **มอบหมายจากหน้ารายการ** (ตอนนี้ต้องเปิดการ์ดก่อน) · **เพิ่มคนช่วยที่เป็นคนอื่น** ยังไม่มี UI (API `POST helpers { userId }` มีแล้ว — ใช้ `OwnerPicker` ซ้ำได้)
- **10 ใบที่ import มามีชื่อผู้รับผิดชอบเดิมอยู่ในช่องรายละเอียด** (จับคู่บัญชีไม่ได้) — ตอนนี้มอบหมายมือได้แล้ว ยังไม่มีใครไล่ทำ
- **ตัวกรองยังไม่มีในหน้ากระดาน** `/kanban/board` — มีเฉพาะหน้า /kanban
- **ตัวกรองจะโกหกเมื่อการ์ดทะลุ limit 200** (กรองฝั่ง client จากที่โหลดมา) — ตอนนี้ 34 ใบยังตรง · ถึงตอนนั้นต้องย้ายไปกรองใน SQL
- **เรียงลำดับป้ายเอง** (`sort_order` มีคอลัมน์แล้ว แต่ยังไม่มี UI ลาก)
- ⚠️ **ก้อน 3 ต้องใช้ `/kanban/b/[board]`** — segment คงที่ (`/kanban/board`, `/kanban/labels`) ชนะ dynamic เสมอใน Next.js

## 📢 ห้องข่าวสารผูกรายกลุ่ม social — เสร็จ local (2026-08-12) ยังไม่ deploy

**ที่แก้:** platform `news` ในกล่องเผยแพร่เคยเดินตาม guild ที่เปิดหน้าอยู่ (cookie `selected_guild`) ไม่ใช่กลุ่มที่เลือก
→ อยู่เซิร์ฟอาสาฯ เลือกกลุ่มราชบุรี = โพสต์ในนามราชบุรีลงห้องข่าวเซิร์ฟอาสาฯ เงียบๆ · ตอนนี้ผูกที่กลุ่มแล้ว

**⚠️ ก่อน deploy prod**
1. รัน migration: `ALTER TABLE dc_social_accounts ADD COLUMN IF NOT EXISTS news_channel_id VARCHAR(20);` (อยู่ท้าย `scripts/migration/migration.sql`)
2. restart bot (`services/newsShare.js`, `handlers/basketHandler.js`, `services/publishPipeline.js` เปลี่ยน signature)
3. เข้า /org/settings/social → ปุ่ม `+ Discord News` → เลือกกลุ่ม + ห้อง (ผูกห้องแล้วได้เซิร์ฟของกลุ่มไปด้วย)
   (ยังไม่ตั้ง = กลุ่ม public ใช้ค่าเดิมของเซิร์ฟต่อ ไม่พัง · กลุ่ม private จะส่งไม่ได้จนทีมสื่อตั้งให้)
4. ยังไม่ได้ทดสอบ "ยิงจริง" ทางเว็บ (จะเป็นการโพสต์ลงห้องข่าวจริง) — ทำตอน deploy แล้วเช็ค
   `SELECT platform, guild_id, group_name FROM post_social_history ORDER BY id DESC LIMIT 5;`

**ตั้งค่าไว้แล้วบน dev DB:** กลุ่ม "ประชาชนราชบุรี" → ห้อง `📢┆ข่าวสารประชาชนราชบุรี` (1150289942203879526)

**ค้างไว้ (ไม่ทำในรอบนี้)**
- **UI รอบแรกทำเป็นการ์ด "การตั้งค่ารายกลุ่ม" — user บอกว่าประหลาด → รื้อเป็นปุ่ม + modal (2026-08-12)** · อย่ากลับไปทำการ์ด config แยก
- `/bot` การ์ด "ห้องที่บอทใช้" ยังเป็นช่องกรอก channel ID ดิบ — น่าเปลี่ยนเป็น dropdown เหมือนหน้ากลุ่ม (มี `lib/discordChannels.js` + `/api/discord/guilds/[id]/channels` พร้อมใช้แล้ว)
- ตะกร้าดิสฯ ยังไม่โชว์ชื่อห้องปลายทางตอนติ๊ก 📢 (เว็บโชว์แล้ว)

## 🔗 ย้ายลิงก์ในโพสต์ FB ไปคอมเมนต์แรก (เริ่ม 2026-08-11 · commit 38e9075)

FB กด reach ของโพสต์ที่พาคนออกนอกแพลตฟอร์ม — เลยโพสต์เนื้อหาเปล่าแล้วหย่อนลิงก์ไว้คอมเมนต์แรกแทน

**ทำแล้ว (local, ยังไม่ deploy)**
- `config/linkLabels.js` + `services/linkToComment.js` (pure) + เทส 18 เคสผ่าน
- `oauth/start`: เพิ่ม `pages_manage_engagement` + `auth_type=rerequest`
- `scripts/checkMetaScopes.js` — เช็ค scope ที่ได้มาจริง ไม่ต้องเปิด Meta Dashboard

**⛔ ทางคอมเมนต์อัตโนมัติ = ตายแล้ว (สรุป 2026-08-11) — อย่าไล่ซ้ำ**

บอท**คอมเมนต์ในนามเพจไม่ได้** เพราะขอ `pages_manage_engagement` ไม่ผ่าน — ใส่ใน SCOPES แล้วหน้าขอสิทธิ์ FB พังทั้งหน้า
(`Invalid Scopes: pages_read_user_content` — ชื่อ legacy ที่ Meta ผูกไว้เอง ไม่ใช่ของที่เราส่ง)

พิสูจน์ครบแล้ว: `pages_show_list` เดี่ยว ✅ · ชุดเดิม 5 ตัว ✅ · +`pages_manage_engagement` ❌ · ไม่มี `auth_type=rerequest` ❌ · dialog v23.0 ❌
ใน dashboard ขึ้น "Ready for testing" แต่เมนู Actions มีแค่ "Go to App Review" / "Remove" — ไม่มีปุ่มเปิดสิทธิ์
→ ทางเดียวคือส่ง App Review (อัดวิดีโอ + รอเป็นสัปดาห์) **เคาะแล้วว่าไม่คุ้ม**
→ โค้ดถอยกลับชุด 5 ตัวแล้ว (commit 159d8c8) · รายละเอียดเต็มใน `.wolf/cerebrum.md`

**✅ แผนสำรอง "เตรียมข้อความให้คนแปะเอง" — เขียนเสร็จแล้ว (local, ยังไม่ deploy)**

`postToFacebook()` แปลง caption + คืน `linkComment` → ไหลผ่าน `publishOne` ออกไป 3 ทาง:
- **ห้อง Discord (คิวเว็บ)** — `notifyBatchDone` ต่อท้ายบล็อกพร้อมก๊อป
- **ห้อง Discord (ตะกร้า)** — `basketHandler` ต่อท้าย followUp ทั้งเส้นรูปและวิดีโอ
- **เว็บ** — `PostPublishPanel` ปุ่ม "ก๊อปลิงก์ไปแปะคอมเมนต์" ข้างปุ่มดูโพสต์ (ไม่กางข้อความ กันรก)
- เก็บลง `post_social_history.result` = `{url, linkComment}` (เดิมมีแค่ `{url}`)
- โพสต์ตั้งเวลาไม่แปลง — ตอน FB ปล่อยจริงไม่มีใครอยู่แปะคอมเมนต์ให้

**ค้าง**
- [ ] ⬜ **กดจริงในเบราว์เซอร์** — verify แค่ระดับ parse (babel) + เทส pipeline · ยังไม่เคยเห็นปุ่มจริง
- [ ] ⬜ **ทดสอบโพสต์จริง** ด้วยเพจ "Unnop Sricharoenchai" (row 59) ก่อนใช้กับเพจพรรค
- [ ] ความเสี่ยงที่รับไว้: ถ้าคนลืมแปะคอมเมนต์ โพสต์จะบอก "ลิงก์ใต้โพสต์" แล้วไม่มีอะไรอยู่ — ถ้าเจอบ่อยค่อยคิดตัวเตือนซ้ำ
- [ ] i18n: `PostPublishPanel.jsx` ยังไม่ migrate (เพิ่มไป 2 string เข้าข่าย "แก้เล็กน้อย") — ทั้งโซน posts ยังไม่ migrate
- [ ] Reels + IG ไม่แตะ — IG ไม่ต้องทำ (ลิงก์ใน caption กดไม่ได้อยู่แล้ว ไม่มี penalty แบบ FB)

**หมายเหตุ:** token FB/IG บน **local ตายทั้งหมด** (code 190/460) — prod ยังใช้ได้ · local จึงเทสยิงจริงไม่ได้ และกด connect ไม่ได้ด้วย (redirect URI ผูกโดเมน prod)

## 🚀 v2.26.0 — 7–9 ส.ค. 2026

**ทำไปแล้ว**
- **สื่อ/โพสต์** — เครื่องมือแต่งภาพในหน้าเขียนโพสต์ · อัปคลิปจากเว็บ + ดูตัวอย่างในเบราว์เซอร์ · ใส่คำคมลงคลิปได้จากเว็บ (หนี UI ของ Reels) · รูปแบบคำคมคอลัมน์ข้างสำหรับข้อความยาว · แก้ autocrop ในระบบเอกสารที่ครอบผิด/ภาพยืด
- **โซเชียล** — เชื่อมบัญชี Threads ได้ครั้งแรก · **OAuth ทั้ง 3 แพลตฟอร์มเลิกผูก Discord guild** → org ที่ไม่มี Discord กด Connect ได้แล้ว
- **บัญชีผู้ใช้** — ยุบบัญชีที่แตกร่าง (ดิสคอร์ด/อีเมลแยกกัน) · เริ่มเก็บ log การเข้าใช้งาน
- **จัด IA** — ย้ายบัญชีโซเชียล `/bot/platforms` → `/org/settings/social` · `/bot` มีหน้าแรก + sidebar แบบเดียวกับ `/org/settings` · ยุบ `/bot/features` เข้า `/bot/ai` · ลบ dead code `SOCIAL_LINKS` · ลบ creds ค้าง 8 แถวใน `dc_guild_config` (รัน migration แล้ว)

**อยากทำต่อ**
- [ ] ⬜ **เทสในเบราว์เซอร์แบบล็อกอินจริง** — โดยเฉพาะ sidebar `/bot` บนมือถือ + ปุ่ม Connect ที่ไม่มี guild แล้ว (smoke test ผ่านแค่ระดับ HTTP)
- [ ] **restart บอทตอน deploy** — ข้อความเตือน token ใน `services/publishWorker.js` ชี้ URL ใหม่แล้ว ถ้าไม่ restart จะยังบอกที่เก่า (ยังเข้าได้ แค่อ้อม)
- [ ] **ลบ fallback `orgIdFromState()`** ใน `web/lib/socialOAuthScope.js` — มีไว้กัน OAuth flow ที่ค้างกลางทางตอน deploy พัง ลบได้หลัง deploy เกิน 10 นาที
- [ ] **guild กำพร้า `506440360600535050`** — มียศค้าง 4 แถวใน `dc_guild_roles` แต่ไม่มีใน `dc_guilds` → จะลบยศทิ้งหรือ map เข้า org
- [ ] **`/admin` จะเอายังไง** — มีหน้าเดียว (`/admin/logs`) ไม่มีลิงก์ไปหาจากไหนเลย · ไอเดีย: ทำเป็นคอนโซลดูภาพรวม**ทุก org** (ตอนนี้ไม่มีหน้าไหนเห็นข้ามองค์กรเลย)

---

## 🎉 CUTOVER org-core → master ขึ้น PROD สำเร็จ
> รายละเอียด/ประวัติย้ายไป `md/archive/CUTOVER.md` แล้ว — ที่เหลือคืองานค้าง
> ⬜ เหลือ smoke test หน้าจริงบน prod (finance/calling/docs/cases/roles/profile) + ดูบอทนิ่ง
> ⬜ หลังนิ่งแล้ว rename `01-identity-refactor.sql` → `.applied.sql` กันรันซ้ำ (DESTRUCTIVE)

## 🔑 Phase 4 identity — บัญชีเดียว หลายช่องทาง login
> รายละเอียด/ประวัติย้ายไป `md/org/AUTH.md` แล้ว — ที่เหลือคืองานค้าง
- [ ] **decouple ประตู login เบอร์ออกจาก Discord** — `findOwnerByVerifiedPhone` ยังมี `AND discord_id IS NOT NULL` → คนที่มีแต่เบอร์ยัง login ไม่ได้ (นี่คือตัวปิดจ๊อบ "เบอร์ยืนเดี่ยว")
- [ ] **เปิดสมัครด้วยเบอร์ (open signup)** — ⛔ ห้าม ship ก่อนมี **rate-limit ต่อเบอร์ + ต่อ IP**
- [ ] **ทิ้ง `dc_user_config` ให้หมด** (ทำพร้อม decouple เบอร์ข้างบน) — 2026-07-29 prefs ย้ายไป `user_config` แล้ว เหลือแค่ OTP state (`otp_quota`, `otp_verify_<guildId>`) ที่ `db/otpSession.js` ถือไว้ · ย้ายเข้า `auth_nonces` ได้จริง (`user_id` **nullable** — คนที่ยังไม่มี users row เก็บได้) แค่ต้องแต่งคีย์เอง `otp:<guildId>:<discordId>` + payload เก็บ session · ทำแล้ว DROP ตารางได้เลย (ตอนนี้เหลือ 1 แถวค้างจาก 8 ก.ค.)
- [ ] **Discord email bridge** — อ่าน `profile.email` เฉพาะ `verified===true` มา match บัญชีเดิม (payload มีค่ามาอยู่แล้ว แต่ jwt branch ทิ้ง)
- [ ] **UI ตอนชนกัน** ("เบอร์/อีเมลนี้มีเจ้าของแล้ว") — ตอนนี้ block เฉยๆ ยังไม่มีทางออกให้ user
- [ ] **ยังไม่มี login ด้วย email บนหน้า `/login`** (มีแต่ฝั่ง org) + ยังไม่ได้เคาะลำดับปุ่ม login (จด NOTE.md 2026-07-26)
- [ ] ⬜ **ยังไม่ได้กดเทสจริงในเบราว์เซอร์ + ยังไม่ได้รัน migration บน prod**

---

## ✅ ปลดล็อกแล้ว — ORG_ACCESS_REDESIGN ขั้น 5 เสร็จ
> รายละเอียด/ประวัติย้ายไป `md/org/ORG_ACCESS_REDESIGN.md` แล้ว — ที่เหลือคืองานค้าง
- [ ] ขั้น 6 — ลบ `web_roles` + `geography.js` (`roles` เก็บไว้เป็น log) · ทำหลังใช้จริงแล้วนิ่ง
- [ ] ⬜ **ขั้น 5 ยังไม่ได้เปิดดูจริงในเบราว์เซอร์** — verify ที่ผ่านคือ build + live 7/7 + unit 206/206 เท่านั้น
- [ ] **ให้พื้นที่ตอนแต่งตั้ง** — ตอนนี้ admin ให้ได้แต่ "ตำแหน่ง" · พื้นที่มาจากเจ้าตัวกรอกที่อยู่เอง (`setSelfDeclaredScope`) เท่านั้น → `/api/org/appoint` ต้องรับ `scopeNodeId` ด้วย
- [ ] **`org_role_defs.managed_by`** ก่อนจะเปิดให้ admin แก้ใบยศเอง — ตอนนี้ `syncRoleDefFromGuildRole` ทำ `ON CONFLICT (org_id,name) DO UPDATE SET permission, scope_node_id` → ถ้ามี writer ที่ 2 ชื่อชนเมื่อไหร่ Discord sync ทับทิ้งเงียบๆ
- [ ] `WANT_SQL` ใน `db/orgMemberRoles.js` ไม่ filter `d.is_active` → ใบยศที่ปิดแล้วยังสะสมแถวใน `org_member_roles` (ไม่อันตราย อ่านกรองอยู่แล้ว แต่รกและงงตอนดูหน้าสมาชิก)
- [ ] **อย่าเพิ่งลดบทบาท `/bot/roles` เหลือ dropdown** — `dc_guild_roles.scope_node` ยังถูกอ่านตรงๆ ที่ `db/members.js:58` + `scripts/calling/sync-discord-members.js:25` (บอท build ไม่จับ)

---

## 📍 อ่านตรงนี้ก่อน — สถานะ (อัปเดต 2026-07-29)

**org migration ปิดจบแล้วทั้งหมด** — identity split + org core + org-scope ครบทั้ง 4 ฟีเจอร์ (finance · calling · docs · cases) + audit_logs · **ไม่เหลือ tenant data ที่ยัง guild-based**

**✅ cutover ขึ้น prod สำเร็จแล้ว 2026-07-23** (ดูหัวข้อแรกสุดของไฟล์นี้ · runbook + ผลอยู่ `md/archive/CUTOVER.md`) — ข้างล่างนี้เป็นบันทึกการซ้อมก่อน cutover เก็บไว้เป็นหลักฐาน/อ้างอิง
- ✅ **ซ้อม migration กับ dump ของ prod — ผ่านแล้ว 2026-07-23** `./scripts/migration/org-scope/rehearse.sh backups/dump-pple_volunteers-202607230242.sql`
  ครบ 13 ขั้น **7–14 วินาที** (= downtime จริง) · users 6615 · org_members 7345 · org_member_roles 6505 · scope_nodes 97 (มีแม่ 90) · ตัวตรวจ 6 บรรทัดได้ 0 ครบ
  **เจอ 5 บั๊กที่ dev ไม่มีทางเจอ** (แก้+push แล้ว): `-1` หายจากคำสั่ง prod · `DEFAULT NULL::varchar` 4 คอลัมน์ใน calling · guild ที่ org_id NULL (NamWa/พันธมิตรชานม) · bash 3.2 บน macOS · dropdb ล้มแล้ววิ่งต่อ
- ✅ **data-layer หลัง migrate = สะอาด (ตรวจ SQL บน pple_rehearsal 2026-07-23):** person ref ทุกช่อง→users 0 หลุด · FK valid หมด · RBAC 6505 ยศ/2332 คน ไม่มีกำพร้า · guild นอกองค์กร (NamWa/พันธมิตรชานม) 0 รั่วเข้า RBAC · cases thread รู้ guild 0 หลุด · โปรไฟล์แยกตำแหน่ง/พื้นที่ได้ (มีคนถือ 94 พื้นที่จริง) · scope tree 90/97 มีพ่อ 0 พ่อลอย
- ⛔ **เหลือ UI smoke test เท่านั้น** (ต้องสายตาคน — query ผ่าน≠จอถูก): หน้าไม่ 500 · `/org/settings/roles` กดเพิ่ม/ลบ/ย้าย node · `/profile` 2 บรรทัด+ปุ่มกาง · finance/calling/docs/cases เปิดดูได้ · ชี้ `DB_NAME=pple_rehearsal`

**เอกสารกวาดตรง schema จริงแล้ว (2026-07-21)** — DATABASE.md regenerate จาก DB สด 58 ตาราง · CASE/DOCS/CALLING/CONTACT ตามมา · งานที่งอกจากรอบนี้อยู่หัวข้อ 🧹 ท้ายไฟล์

> ⚠️ หัวข้อข้างล่างเรียงตาม**ประวัติการทำงาน** ไม่ใช่ลำดับความสำคัญ · เช็ค `[x]/[ ]` ก่อนเชื่อว่ายังไม่ได้ทำ

---

## ✅ ปิดแล้ว — token Facebook เพจ "ราชบุรี" (เจอ 2026-07-30 · **user ยืนยันโพสต์ได้ปกติบน prod 2026-08-09**)
เดิม: `Invalid OAuth access token - Cannot parse access token` ทั้ง page token และ user token → โพสต์ FB ไม่ออก · แก้ด้วยการ reconnect ที่ `/org/settings/social`
⚠️ **สถานะ token บน prod เช็คจากเครื่อง dev ไม่ได้** — prod ไม่ได้อยู่เครื่องนี้ (ไม่มี `/www/wwwroot`, ไม่มี user `www`) · หัวข้อ token ในไฟล์นี้เป็น**บันทึกตอนนั้น** ห้ามอ่านเป็นสถานะปัจจุบัน ต้องถาม user หรือดูที่ prod เอง
⚠️ **เวลาเทสคิวโพสต์: ปิดบอทก่อน** — บอทที่รันอยู่จะหยิบงานในคิวไปยิงโซเชียล**จริง** (เจอตอน e2e 2026-07-30)

## 🔴 เจอ 2026-08-08 — Threads token ตายเงียบ + ไม่มีกลไกต่ออายุทั้งระบบ

โพสต์ Threads ล้ม `code 190 Session has expired on 16-Jul-26` — ตายมา 3 สัปดาห์โดยไม่มีใครรู้

**อายุ token แต่ละแพลตฟอร์ม (ตรวจจาก prod แล้ว):** `fb` Page token = ไม่มีวันหมด · `x` OAuth 1.0a = ไม่มีวันหมด · `ig` 60 วัน มี refresh-on-use ทำงานจริง · **`threads` 60 วัน ไม่มีโค้ดต่ออายุเลย**

**ทำแล้ว 2026-08-08 (local ยังไม่ deploy):**
- `metaApi.js:66` เติม `AND platform IN ('fb','ig')` — กัน IG refresh เขียนทับ Threads token
- `scripts/social/threads-token.js` — แปะ token ใหม่ (แทน `meta-setup.js` ที่เป็นโค้ด MySQL **ตายแล้ว ห้ามรัน**)

**ทำเพิ่ม 2026-08-08 (รอบ 2) — Connect Threads OAuth บนเว็บ (user เคาะ: OAuth อย่างเดียว ไม่เอาช่องแปะ token)**

เหตุผลที่ไม่เอาช่องแปะ: หน้า `/org/settings/social` มีโมเดล **1 ปุ่ม = 1 OAuth flow** อยู่แล้ว (FB+IG ปุ่มเดียวเพราะดันซ์เดียวกัน · X แยกปุ่ม) — ช่องแปะ token รายบัญชีเป็นรูปแบบที่ 3 ที่ไม่มีในหน้านั้น
- `GET /api/threads/oauth/start` + `callback` — authorize ที่ `threads.net/oauth/authorize` (คนละ host กับ FB) · scope `threads_basic,threads_content_publish` · code → short → long-lived 60 วัน
- **`threads_app_id` / `threads_app_secret`** เพิ่มใน App Credentials — Threads มี creds ของตัวเอง **ห้าม fallback ไปใช้ของ Meta** (`getThreadsApp` คืน null ถ้าไม่ครบ) ไม่งั้นได้ error client_secret ที่อ่านไม่ออก
- callback **UPDATE แถวเดิมที่ `social_id` ตรงกันก่อนเสมอ** INSERT เฉพาะบัญชีใหม่ — กันปัญหา id น้อยสุดชนะ
- `TokenExpiry` เดิมโชว์แค่ `ig` → ปลดล็อกให้ `threads` ด้วย (นี่คือเหตุผลที่ไม่มีใครเห็นว่ามันตาย)
- ⛔ ลบทิ้ง: `scripts/social/threads-token.js` + `POST /api/social/accounts/[id]/token` (ทางแปะ token ที่ทำไปแล้วถอดออกตามที่เคาะ)
- [x] ~~**i18n ค้างของหน้าบัญชีโซเชียล**~~ → **migrate แล้ว 2026-08-09** · `web/components/org/OrgSocialAccounts.jsx` ผ่าน `t()` ทั้งไฟล์ · key อยู่ `org.social.*` (th + en ครบทั้งคู่) + เพิ่ม `common.saving`

**🔜 ก่อนเทสจริงต้องทำที่ Meta Dashboard:** เพิ่ม `https://pplevolunteers.org/api/threads/oauth/callback` ใน **Redirect Callback URLs** ของ use case "Threads API" + เอา Threads App ID/Secret มากรอกที่ `/org/settings/social`

**ทำเพิ่ม 2026-08-09 (รอบ 3) — auto-refresh + แจ้งเตือน ✅ เสร็จ local:**
- `refreshThreadsToken()` ใน `services/metaApi.js` — `graph.threads.net/refresh_access_token?grant_type=th_refresh_token` (คนละ host/grant กับ FB)
- `finalizeConfig` **แตกสาขาตาม platform** — เดิมเช็คแค่ `user_token` ส่วน Threads เก็บที่ `access_token` จึงไม่เคยเข้าเงื่อนไข (นี่คือตัวบั๊ก bug-393)
- `refreshExpiringTokens()` + `sweepTokens()` **เกาะ `sweep()` เดิมใน publishWorker (ไม่ตั้ง cron)** · แยก `ok`/`failed`/`dead` — ที่หมดอายุแล้วกู้ด้วยโค้ดไม่ได้ ต้องรายงานให้คนไปกด Connect เอง
- ห้องแจ้งเตือน: key ใหม่ `social_alert_channel_id` (fallback `antispam_mod_channel_id`) + ช่องตั้งค่าที่ `/org/settings/social`

**ค้าง:**
- [x] ~~**auto-refresh Threads**~~ — เสร็จแล้ว (ยังไม่ deploy)
- [ ] เดิม: **auto-refresh Threads** — เกาะ `sweep()` ใน `services/publishWorker.js:205` (วันละครั้งอยู่แล้ว ไม่ต้องตั้ง cron) · แตกสาขา platform ใน `finalizeConfig` เพราะ `refreshUserToken` hardcode `graph.facebook.com` ⚠️ `sweep()` ยิงตอนบอท start ทุกครั้ง + Threads บังคับ token อายุ ≥24 ชม. → ต้องกันด้วย threshold
- [ ] **แจ้งเตือนเข้า Discord เมื่อต่อ token ไม่สำเร็จ** — สำคัญกว่าตัว refresh เอง (รอบนี้เจ็บเพราะตายเงียบ) · ยังไม่เคาะว่าใช้ห้องไหน
- [ ] **ระวัง `ig` แถวกลุ่ม Somseed** — 8 ส.ค. เหลือ 8 วัน อยู่นอกหน้าต่าง refresh 7 วันพอดี ถ้าไม่มีใครโพสต์กลุ่มนี้จะตายแบบเดียวกัน
- [ ] (เลื่อน — ทำ auto-refresh แล้วอาจไม่ต้องใช้) **Connect Threads OAuth บนเว็บ** · `/api/meta/oauth/*` ยิง facebook.com ขอ scope FB/IG ล้วน ไม่รองรับ Threads
- [ ] ยังไม่พิสูจน์: **Threads ใช้ App ID/Secret ชุดเดียวกับ FB หรือคนละชุด** (org_config มีแค่ `meta_app_id`/`meta_app_secret`) — `threads-token.js` แยก error ให้แล้ว รู้ผลตอนรันจริง

⚠️ **แถวซ้ำใน `dc_social_accounts` ตัว id น้อยสุดชนะเสมอ** (`publishTargets.js:45` + `metaApi.js:97`) → เชื่อมบัญชีใหม่ต้อง **UPDATE แถวเดิม ห้าม INSERT** ไม่งั้นแถวเก่าที่ตายแล้วบังตลอด · ซ้ำร้าย `upsertSocialRow` ใน meta oauth callback **ไม่เขียน `group_name`** แถวใหม่เลยหายจากกล่องเผยแพร่
ℹ️ Threads มีบัญชีเดียวใช้ร่วม 2 กลุ่ม (`social_id` เดียวกันทั้ง id 4/5) = **ตั้งใจ** ไม่ใช่บั๊ก (user ยืนยัน 2026-08-08)

## ✍️ POSTS — เครื่องมืองานสื่อ · ดีไซน์เคาะครบ 2026-07-29 ยังไม่เขียนโค้ดสักบรรทัด

spec + ดีไซน์ + ตารางทั้งหมดอยู่ `md/posts/POSTS.md` (อ่านก่อนเสมอ ห้าม re-derive) · `/scrutinize` ผ่าน 2 รอบแล้ว

> ⛔ **2026-07-29 เย็น — ทิ้ง `post_series` ทั้งตาราง** (user เคาะ) หน่วยหลัก = ตอนเดี่ยวๆ จัดกลุ่มด้วยคอลัมน์ `post_episodes.category` · visibility อยู่ที่ตัวโพสต์ · 1 โพสต์ 1 หมวด · ไม่มีเลขลำดับตอน
> → **ก้อน 1 ต้องรื้อก่อนทำ 2a ต่อ:** migration block ก้อน 1 · `postsAccess.js` + 62 tests · `web/db/posts/*` · `postsGuard.js` · `md/posts/API-2a.md` (ยังไม่ขึ้น prod → รื้อได้ฟรี) · รายละเอียดอยู่ `md/posts/POSTS.md` §Data model

**⬜ ทำตามลำดับ:**
- [x] **`/grill`** ✅ 2026-07-29 — 16 กิ่งเคาะครบ อยู่ `md/posts/POSTS.md` §ผ่าน `/grill` (policy ราย org · job 1 แถว/แพลตฟอร์ม · ไฟล์นอก `public/` · optimistic lock · grace 2 ชม. · **ใช้ท่อโพสต์ร่วมกับตะกร้าดิสฯ ห้ามเขียนใหม่**)
- [x] **ก้อน 1** ✅ 2026-07-29 (local — ยังไม่ deploy prod) — 7 ตาราง posts + `postsAccess.js` (62 tests ผ่าน) + `orgFeatures` key `posts`
  - `dc_user_config` → `user_config` (key = users.id) เสร็จด้วย: prefs 7 แถวย้ายแล้ว · **OTP state ยังอยู่ `dc_user_config`** แยกเป็น `db/otpSession.js` เพราะตอนยืนยันตัวตน users row อาจยังไม่เกิด
  - แก้ 3 route ที่ยิงตารางตรงๆ: `bot/quote-config` · `watermark/personal` · `docs/sign/self-info` (ใช้ `session.user.userId`)
  - verify: `npm test` 268 ผ่าน · `npm run build` ผ่าน · smoke บอท read/write/delete prefs + อ่าน otp_quota ผ่าน
  - ⏭️ prod: รัน 2 บล็อกท้าย `migration.sql` (additive ล้วน) แล้ว restart บอท+เว็บ
- [x] **ก้อน 2a** ✅ 2026-07-29 เย็น (local — ยังไม่ deploy prod · **เทสในเบราว์เซอร์จริงผ่านแล้ว**)
  - schema รื้อใหม่: 6 ตาราง ไม่มี `post_series` · `post_episodes` ถือ org/owner/visibility/category เอง
  - lib: `postsAccess.js` (post-centric, 66 tests) · `postsGuard.js` (`postsContext`/`postContext`) · `postsAiQuota.js` · `postsStorage.js` · `ai.js`
  - db: `web/db/posts/episodes.js` (autosave + optimistic lock + revision-เมื่อคนแก้เปลี่ยนคน + category/rename) · `media.js`
  - API 13 ไฟล์: `/api/posts` · `[id]` (GET/PATCH autosave/DELETE) · status · promote · revision(s) · categories · `[id]/media` · `media/[id]` (stream ผ่าน gate) · `ai/outline` · `ai/draft`
  - UI: `/posts` (แท็บส่วนตัว-องค์กร + กล่องไอเดีย + แถบหมวด + การ์ด) · `/posts/[id]` (2 คอลัมน์ autosave + สื่อ paste/ลากเรียง + กล่อง 409) · Nav แท็บ POSTS + `app/posts/layout.js` feature gate
  - verify: `npm test` 272 · `next build` · **smoke DB 15 เคส** (lock 409 ไม่ทับของเดิม · revision attribution ถูกคน · throttle · rename หมวด · promote audit · cascade)
  - **เทสเบราว์เซอร์จริง (Playwright + magic login users.id=1):** สร้างโพสต์ → พิมพ์ → autosave PATCH 200 → reload เนื้อหายังอยู่ · อัปรูปขึ้นแถบสื่อ + แสดงผลได้ · **ยิงไฟล์สื่อแบบไม่ล็อกอิน = 401** · 2 แท็บแก้พร้อมกัน → กล่อง 409 โผล่ + ปุ่ม "เก็บฉบับของฉัน" ทำงาน
  - ⚠️ เจอตอนเทส: **ต้องเปิด feature `posts` ที่ `/org/settings/features` ก่อน** ไม่งั้น `/posts` เด้ง 404 (เปิดให้ org 1 ใน DB local แล้ว) · bug ที่แก้: bug-066 (พรอมป์ AI ตอบ format `carousel` ชน CHECK)
  - ⬜ ยังไม่ได้เทสจริง: ปุ่ม AI (ไม่อยากเสียเงิน) · ลากเรียงสื่อ · วางรูปจาก clipboard
  - ⏭️ prod: รันบล็อก POSTS ใน `migration.sql` (additive) · `storage/posts/` สร้างเอง
- [ ] **ก้อน 2b** — Quote Generator Modal · **ดีไซน์ + `/scrutinize` เสร็จ 2026-08-03** ดู `md/posts/POSTS.md` §🎬 Media Section
  - [x] ✅ **spike ผ่านแล้ว** — เว็บ import `utils/quoteStyles.js` ข้าม package ได้จริง render ครบทุกสไตล์ (ไม่ต้อง fallback ไปคิวบอท)
    ⚠️ รอดเพราะไฟล์อยู่ **repo root** จึง resolve เจอ canvas 0.1.97 ของราก · `web/node_modules/@napi-rs/canvas` เป็น **1.0.0 ที่ `loadImage(path)` พัง** → **ห้ามย้าย/ก๊อป quoteStyles.js เข้า `web/`** และ **ห้ามใส่ `@napi-rs/canvas` ใน `web/package.json`**
  - [x] ✅ Blocker: `bug-079` mark asset หาย → quote พังสุ่ม 25% (แก้แล้ว 280 render ล้ม 0) · `sharp` เข้า `serverExternalPackages` แล้ว
  - [x] ~~`kind='quote'` ใน `post_ai_suggestions`~~ **ไม่ต้องทำ** — `/api/posts/ai/caption` คืน `quotes` (3 อัน ดึงจากเนื้อหาจริง "ใช้แปะบนภาพได้") + เก็บลง `post_ai_suggestions` อยู่แล้วตั้งแต่ 2026-08-01 → modal อ่าน `payload.quotes` จาก `GET /api/posts/[id]/ai-suggestions` ได้เลย
  - [x] ✅ **API เสร็จ + เทสจริงผ่าน 2026-08-03**
    - `web/lib/quoteRender.js` — สะพานไป `utils/quoteStyles.js` · `web/lib/quoteBg.js` — resolve พื้นหลัง 3 ทาง (ไฟล์ใหม่ / `bgMediaId` / `bgPath`) · `findMediaByPath()` ใน `web/db/posts/media.js`
    - `POST /api/posts/[id]/media/quote/preview` — คืน PNG ดิบ + header `X-Bg-Path` **ไม่แตะ DB** (รอบแรกอัปไฟล์ → รอบต่อไปส่งแค่ path ไม่ต้องอัปซ้ำตอนสลับสไตล์)
    - `POST /api/posts/[id]/media/quote` — render + `savePostFile` + `addMedia(kind='quote')` เก็บ `quote_text`/`quote_style`/`bg_path` ครบ
    - **verify (curl + session จริง):** 7 สไตล์ + `random` = 200 ทุกตัว · preview 3 รอบไม่เกิดแถวใน DB สักแถว · save → 201 + ไฟล์ PNG 1080×1080 บนดิสก์ · ปฏิเสธถูกทุกเคส: ไม่ล็อกอิน 401 · ข้อความว่าง/สไตล์มั่ว/`bgPath=../../.env` 400 · `bgPath`+`bgMediaId` **ของโพสต์อื่น** 400 · `npm test` 272 ผ่าน · `next build` ผ่านไม่มี warning
    - บั๊กที่เจอระหว่างทาง: `bug-080` (webpack stub `createRequire` → ใช้ `process.getBuiltinModule` แทน) · `bug-081` (BIGSERIAL คืนเป็น string เทียบ `===` ไม่ตรง)
  - [x] ✅ **`scripts/posts/gc-media.js` เสร็จ + เทสผ่าน 2026-08-03** — ลบไฟล์ใน `storage/posts` ที่ **ไม่มีแถวไหนอ้างเลย** และเก่ากว่า N วัน (default 7 · `--days=` ปรับได้ · `--dry` ดูก่อน)
    - ⚠️ **ต่างจาก `services/postsRetention.js` คนละหน้าที่** — retention ลบไฟล์ที่ **ยังมีแถวอ้าง** แต่หมดหน้าที่ (โพสต์ไปแล้ว 30/180 วัน) แล้วเซ็ต `path=NULL` · gc ไม่แตะ DB สักแถว
    - **3 ที่ที่นับเป็น reference** (ตกไปที่เดียว = ลบไฟล์ที่ใช้งานอยู่): `post_episode_media.path` · **`post_episode_media.bg_path`** (พื้นหลังการ์ดคำคม — ไม่มีแถวเป็นของตัวเอง ลบแล้ว re-render ไม่ได้) · **`post_social_history.media[].path`** (worker อ่านไฟล์จาก snapshot นี้ — งาน pending จะล้ม)
    - **verify:** กำพร้าเก่า → ลบ ✅ · กำพร้าเพิ่งสร้าง → รอด (กันเคสผู้ใช้เปิด modal ค้างยังไม่กดบันทึก) ✅ · ไฟล์ที่อ้างผ่าน `bg_path` อย่างเดียว → รอด ✅ · อ้างผ่าน job snapshot อย่างเดียว → รอด ✅ · สื่อจริงของโพสต์ 26/33/42 ไม่ถูกแตะ ✅
    - เจอของจริงระหว่างเทส: ลบการ์ดคำคมทิ้ง → พื้นหลังกลายเป็นกำพร้า → gc รอบถัดไปเก็บให้เอง (ทำงานตามที่ออกแบบ)
  - [x] ✅ **`QuoteGeneratorModal.jsx` เสร็จ + เทสเบราว์เซอร์จริงผ่าน 2026-08-03**
    - **2 ขั้นไม่ใช่ 3** — ขั้น 1 พื้นหลัง+ครอป+ข้อความ · ขั้น 2 สไตล์+สี+บันทึก (ครอปอยู่ขั้น 1 เพราะ renderer คิด layout จากขนาดภาพ)
    - ปุ่ม `[สร้างการ์ดคำคม]` อยู่ข้าง `[เลือกไฟล์]` ใน `PostMediaPanel.jsx` · บันทึกแล้วการ์ดโผล่ในกริดทันที + ยิง `posts:media-changed` ให้กล่องเผยแพร่นับสื่อใหม่
    - i18n ครบทั้งไฟล์ — ns `posts.quoteModal` 33 keys ใน `th.json` + `en.json`
    - **เทส Playwright:** ครอป 4:5 → พรีวิว 720×900 ตรงสัดส่วน · สลับสไตล์/สี render ใหม่ได้ · **พรีวิว 3 รอบ สื่อใน DB ไม่เพิ่มสักแถว** เพิ่มเฉพาะตอนกดบันทึก · ปิดได้ครบ 3 ทาง (ESC/คลิกนอก/ปุ่ม X) · ไม่มี JS error
    - กล่อง "ข้อความจาก AI" เทสกับโพสต์ 8 → ขึ้น 3 ข้อความ คลิกแล้วเติมลง textarea ได้
    - ℹ️ **ตั้งใจอ่านเฉพาะ `payload.quotes` ไม่ fallback ไป `captions`** — `captions` (payload ก่อน 2026-08-01) คือประโยคที่ AI **แต่งเอง** ซึ่งเป็นสิ่งที่ตั้งใจเลิกใช้เพราะ "ห้ามแต่งคำพูดที่ผู้เขียนไม่ได้พูด" · โพสต์เก่าจะไม่เห็นกล่องนี้จนกว่าจะกดขอ AI ใหม่ = ถูกแล้ว
    - ⚠️ เทสเบราว์เซอร์ต้องใช้ `next dev` — โหมด production ตั้ง cookie เป็น `Secure` แล้ว Chromium ไม่ส่งผ่าน http://localhost → next-auth ตอบ 400 (curl ไม่สนใจ flag นี้เลยผ่าน)
  - **เคาะแล้ว:** crop ต้องมา**ก่อน** render เสมอ (renderer คำนวณ layout จากขนาดภาพ — บอททำแบบนี้อยู่ที่ `quoteHandler.js:329`) · **ไม่มีลายน้ำใน modal** ปล่อยให้กล่องเผยแพร่ทำที่เดียว (กันแปะซ้ำ 2 ชั้น) · bg เขียนลง `storage/posts/` แบบไม่สร้างแถวใน `post_episode_media` แล้วให้ gc เก็บ
  - **i18n (เคาะ 2026-08-03):** modal ใหม่ใช้ `t()` สร้าง ns `posts` ใน `th.json`/`en.json` เฉพาะ key ของ modal · **ไฟล์เก่าทั้งโซนยัง hardcode ไทย** → ดู "migrate โซน posts" ข้างล่าง
- [x] **🖼️ เครื่องมือแก้รูปในโพสต์ — ✅ เขียนเสร็จ 2026-08-07** (local · **ยังไม่เทสในเบราว์เซอร์จริง** · ยังไม่ deploy)
  - `ImageEditorModal.jsx` — canvas ล้วนในเบราว์เซอร์: ครอบตัด (อิสระ/1:1/4:5/16:9) · หมุน 90° · **ทับหน้าคนด้วยพิกเซล/เบลอ** (ลากกรอบแล้วกดทับ ทำซ้ำได้) · ย้อนกลับ 5 ขั้น · ย่อรูปที่ใหญ่กว่า 2048px ก่อนแก้
  - `PUT /api/posts/media/[id]` (multipart `file`) → `replaceMediaFile()` ทับไฟล์เดิม **id/sort_order เดิม** + `pathStillUsed()` เช็คก่อนลบไฟล์เก่า (ลบทันที ไม่รอ gc — ต้นฉบับที่ยังไม่เบลอค้างดิสก์ไม่ได้)
  - ⚠️ ล้าง `source_url` ตอนแทนที่ ไม่งั้นไฟล์หายแล้ว UI จะ fallback ไปโชว์รูปดิสคอร์ดที่ยังไม่เบลอ · การ์ดคำคมที่ถูกแก้จะกลายเป็น `kind='upload'`
  - ปุ่ม ✏️ ขึ้นเฉพาะสื่อที่มี `path` แล้ว (รูปที่ยังชี้ CDN ดิสคอร์ด = cross-origin → canvas taint, `toBlob()` ล้ม)
  - i18n ครบ ns `posts.imageEditor` (th+en) · **หาใบหน้าอัตโนมัติยังไม่ทำ** — user เคาะให้เบลอเองด้วยมือก่อน (2026-08-07) ถ้าจะทำต่อ: TinyFaceDetector โมเดล ~200KB วางใน `public/` แล้วให้มันเติมกรอบให้ user ปรับ
- [x] **🎬 อัปคลิปจากเว็บ (ก้อน A) — ✅ เสร็จ + verify 2026-08-09** (local · ยังไม่ deploy) · รายละเอียดเต็ม `md/posts/POSTS.md` §🎬 คลิป: อัปจากเว็บ
  - ลากคลิปใส่โซนสื่อได้ตรงๆ ไม่ต้องอ้อมตะกร้าดิสฯ · พรีวิว `<video>` ในหน้าโพสต์ · โพสต์ออก Reels FB/IG/Threads/X ได้ (ท่อเดิมไม่ได้แก้)
  - ⚠️ **`isAllowedMime()` ยังเป็นของรูปล้วนเหมือนเดิม โดยตั้งใจ** — วิดีโอมี `isAllowedVideoMime()` แยก เพราะคลังภาพ + PUT แก้รูป ใช้ predicate ตัวเดียวกัน
  - ⚠️ **`GET /api/posts/media/[id]` เป็น stream + Range แล้ว** (ไม่ใช่ `readFile` ทั้งก้อน) — ใครจะแก้ route นี้ต่อ อย่าถอยกลับไปเป็น buffer ไม่งั้น Safari เล่นคลิปไม่ได้
  - 🔜 **ก่อน deploy prod: ตั้ง nginx `client_max_body_size 100m;` ของไซต์แล้ว reload** — default 1MB → อัปคลิปเด้ง 413 เป็นหน้า error ดิบของ nginx (local ไม่มี nginx คั่น จึงเทสไม่เจอ)
- [x] **🎬 คำคมบนคลิป (ก้อน B) — ✅ เสร็จ + verify 2026-08-09** (local · ยังไม่ deploy) · รายละเอียด `md/posts/POSTS.md` §🎬 คลิป: คำคมบนคลิป
  - **ไม่มีตารางคิว ไม่มี worker** — render จบใน request เดียว (วัดได้ 0.68 × ความยาวคลิป · เพดาน 90 วิ = เพดาน Reels)
  - เพดานอัปโหลดคลิป 64MB → **200MB** เพราะเปลี่ยนขาอัปเป็นสตรีมลงดิสก์ (`POST /api/posts/[id]/media/video`)
  - 🔜 **nginx ต้องมี 2 บรรทัด:** `client_max_body_size 200m;` + `proxy_read_timeout 300s;` — ขาดตัวหลัง = เบิร์นคลิปยาวๆ ถูกตัดกลางคัน
  - ⚠️ **rotation ยังไม่ผ่านคลิปมือถือจริง** — ffmpeg บนเครื่อง dev เป็น 4.4.2 สังเคราะห์ไฟล์ที่มี display matrix ไม่ได้ · **ต้องลองคลิปแนวตั้งจากมือถือ 1 อันก่อนใช้จริง** ถ้าพลาด = คลิปออกไปนอนตะแคง
- [x] **🎨 การ์ดคำคมแบบไม่มีรูป (พื้นสี CI) — ✅ เสร็จ + verify 2026-08-10** (local · ยังไม่ deploy) · รายละเอียด `md/posts/POSTS.md` §🎨 การ์ดคำคมแบบไม่มีรูป
  - พื้นเป็นสี CI (`quote_ci_accent`) ข้อความกลางการ์ด 4:5 · พื้นหลัง 4 แบบ `plain-flat` / `plain-fade` / `plain-mark` / `plain-logo` (ลายน้ำองค์กร)
  - ⛔ **คีย์ `plain-*` ห้ามยัดเข้า `QUOTE_STYLE_KEYS`/`COMBOS`** — จะตกใน random pool ของบอท (คนกดคำคมจากรูปแล้วรูปโดนทิ้ง) และตั้งเป็น `quote_default_template` ได้ทั้งที่บอทเรนเดอร์ไม่ออก
  - ⛔ **`bg_path` ของการ์ด plain เป็น NULL เสมอ ห้ามเอา ref ลายน้ำไปใส่** — คอลัมน์นั้นโดน `deletePostFile()` ตอนลบการ์ด = ลากไฟล์ลายน้ำขององค์กรหายไปด้วย
  - รอบแต่ง 2026-08-11: ลายพื้นมุมล่างขวา **สีจริง opacity 10% ทั้งดวงไม่โดนขอบตัด** · `plain-mark` สุ่มลายทุกใบ · ข้อความอยู่กลางการ์ด · เลือก **ฟอนต์ (อนาคตใหม่/Google Sans/สารบรรณ) + ขนาด (เล็ก/กลาง/ใหญ่)** ได้ในโมดัล
  - รอบแต่ง 2026-08-11 (รอบ 2): **color picker เลือกสีการ์ดเองได้ทั้ง 2 โหมด** ตั้งต้นที่สี CI + ปุ่มกลับไปสี CI · ครอปตั้งต้นเป็น **4:5** · การ์ดไม่มีรูปเลือกสัดส่วนได้ 1:1 / 4:5 / 16:9 เหมือนกัน · "การลงสี"→**ธีม** · "สี"→**ฟิลเตอร์** (เป็น dropdown แล้ว รองรับเพิ่มฟิลเตอร์ในอนาคต)
  - **รอบแต่ง 2026-08-13: สีตัวอักษรคำคม + ช่องพิมพ์ hex + สลับลำดับสี CI ตามบริบท** (local · ยังไม่ deploy)
    - **สีตัวอักษรคำคมเลือกเองได้** — คุมแค่ **headline เท่านั้น ไม่ใช่ชื่อผู้พูด** (scope เคาะ 2026-08-13) · ไม่เลือก = `null` = auto ของสไตล์นั้นเหมือนเดิม · ไหลผ่าน `textColor` ตั้งแต่ `readQuoteForm` → `renderQuoteCard/renderPlainCard` → ทุก `render*` ใน `utils/quoteStyles.js`
    - ⚠️ `renderPlain` เดิมแตกกิ่งพื้นหลังด้วย `ink === WHITE` (เทียบ string) — พอ ink รับสีที่ผู้ใช้เลือกได้ ไม่ใช่แค่ผลลัพธ์ WHITE/BLACK จาก `contrastText()` ต้องเปลี่ยนเป็นเทียบ **luminance** (`_lum(ink) > 0.5`) ไม่งั้นสีอ่อนที่ไม่ใช่ `#ffffff` เป๊ะๆ ตกกิ่ง "เข้ม" ผิด
    - ถอด `inkOverride` ของ `renderPanel` ทิ้ง (ของไว้เทียบตอน dev — `textColor` แทนที่ครบแล้ว ไม่เหลือ ref ในโค้ด)
    - **ช่องพิมพ์/วาง hex code** ข้าง color picker ทั้ง 3 ที่ (`QuoteGeneratorModal` · `OrgBrand` · `PersonalQuotePrefs`) — helper กลาง `web/lib/hexColor.js` (`normalizeHex`: เติม `#`, ขยาย 3 หลัก `#f80`→`#ff8800`) · commit ตอน **blur/Enter** เท่านั้น ไม่ใช่ทุกตัวอักษร (ไม่งั้นค่ากลางๆ ระหว่างพิมพ์ยิง render ทิ้ง) · พิมพ์ผิด = เด้งกลับค่าที่ใช้อยู่จริง
    - 🐛 **สี CI ขององค์กรไม่มีผล** — `/org/settings/brand` เซฟลง `org_config` ตั้งแต่ migration 2026-08-10 แต่ตัวอ่านยังชี้ `dc_guild_config` (คนละตาราง) · แก้ทั้ง 2 ฝั่ง: `web/lib/quoteAccent.js` (เว็บ) + `resolveConfigOrgFirst()` ใหม่ใน `db/configResolver.js` (บอท) — อ่าน org ก่อน แล้ว fallback guild · **คู่แฝด แก้คู่กันเสมอ** · ดู [[project_org_config_vs_guild_config]]
    - **ลำดับสีสลับตามบริบท** (เคาะ 2026-08-12) — โพสต์ `personal` → personal ชนะ · โพสต์ org / สั่งจากดิสฯ → **org ชนะ** · เหตุ: guild ไม่เคยตั้งสีเอง + ใครตั้งสีส่วนตัวไว้จะเห็นสีตัวเองทับสีองค์กรตลอดไป · คำสั่งในดิสฯ ไม่มีแนวคิด "โพสต์ personal" จึงถือเป็นบริบทองค์กรเสมอ · `/api/posts/quote-accent` รับ `?postId=` เพื่อรู้ `visibility`
  - 🐛 บทเรียน: อาการ "ข้อความวางต่ำไป" จริงๆ คือ **พรีวิวในโมดัลโดนหั่นหัวท้าย** (`w-full` บนการ์ด 4:5) ไม่ใช่ layout — แก้ที่พรีวิวแล้ว ห้ามเว้นแถบก้นการ์ดกลับมา
  - 🔜 ถ้าทำ **re-render การ์ดเก่า** ทีหลัง: จะไม่รู้ค่าลายน้ำ/ฟอนต์/ขนาดที่เคยเลือก (เก็บแค่พื้นหลังใน `quote_style`) — ต้องเพิ่มที่เก็บก่อน (คอลัมน์ใหม่ ไม่ใช่ `bg_path`)
- [x] **🤖 AI สร้างโพสต์ = "เรียบเรียงเป็นโพสต์เดียว" ไม่ใช่ซอยเป็นชุด — ✅ เสร็จ 2026-08-09** (local · ยังไม่ deploy)
  - user โยนบทความยาว 1 เรื่องเข้าไป → ได้ร่าง 4-5 อันแตกออกมา = เข้าใจไม่ตรงกันตั้งแต่ดีไซน์แรก · ที่ต้องการคือ **พิมพ์ในหัวเร็วๆ → AI สรุปให้ 1 โพสต์**
  - `POST /api/posts/ai/outline` (สร้างหลายแถว) **ถูกลบ** → `POST /api/posts/ai/compose` คืน `{category,title,body,format}` สร้างแถวเดียว แล้ว UI เด้งเข้า `/posts/[id]` ทันที
  - **ข้อความดิบที่ user พิมพ์ = revision แรก** ผ่าน `createPost({ originalRevision })` (เวลาถอย 1 วิ กันชนกับ snapshot ฉบับ AI) + `listRevisions` เพิ่ม tiebreak `r.id DESC`
  - ⬜ **ยังไม่เทสในเบราว์เซอร์จริง** (build ผ่าน) · ⬜ i18n: `PostsHome.jsx` ยัง hardcode ไทยตามโซน — เข้าคิวข้อล่างนี้
  - **2026-08-12/13 — Series กลับมาเป็นตัวเลือกที่ user กดเอง (2 รอบ)** · รายละเอียดเต็ม `md/posts/POSTS.md`
    - รอบแรก: ปุ่ม **[1 ตอน | Series]** + ช่องกรอกจำนวนตอน (2-12) · รอบสอง (**ค่าปัจจุบัน**): ถอดช่องกรอกออก — **AI ตัดสินใจจำนวนตอนเอง (1-12) จากเนื้อหา** เพราะ user มักระบุจำนวนไว้ในข้อความที่พิมพ์อยู่แล้ว · ต่างจาก auto-split ที่ถูกตัดทิ้ง 2026-08-09 ตรงที่ **ยังต้องกดปุ่ม Series เองก่อน** ไม่ใช่ AI ซอยเงียบๆ
    - client ส่ง `series: true` (เลิกส่ง `episodeCount`) — route `ai/compose` รับ `series` อยู่แล้ว ไม่ต้องแก้
    - 🐛 **`MAX_TOKENS` 8000 → 32000** (`web/lib/ai.js`) · ซีรีส์ 12 ตอนเนื้อหาเต็มโดนตัดกลางคัน (`stop_reason: max_tokens`) → JSON ขาดครึ่ง → user เห็น error กำกวม "ไม่ใช่ JSON ที่อ่านได้"
    - ⚠️ **ต้องใช้ `.stream().finalMessage()` ไม่ใช่ `.create()`** — max_tokens สูงแบบไม่ stream เสี่ยง SDK ชน HTTP timeout เอง · เพิ่มเช็ค `stop_reason === 'max_tokens'` ก่อน parse เพื่อโยน error ที่อ่านรู้เรื่อง
- [ ] **migrate i18n โซน posts** (หนี้จากก้อน 2b) — 7 ไฟล์: `PostsHome` · `PostEditor` · `PostMediaPanel` · `PostMetaPanel` · `PostPublishPanel` · `PostRevisions` · `EmojiPicker` (ใหม่ 2026-08-08 — hardcode ไทยตาม sibling ในโซนเดิม) · งาน mechanical ส่ง Sonnet subagent ได้ · ระหว่างยังไม่ทำ โซนนี้จะปน hardcode กับ `t()`
  - **หนี้เพิ่ม 2026-08-12:** `PostEditor.jsx` เพิ่ม block ใหม่ทั้งก้อน (`ReviewResult` + `RISK_LABEL` 9 ป้าย + `SEVERITY_STYLE` 3 ป้าย) เข้าข่าย "โค้ดใหม่" ตามกฎ CLAUDE.md แต่เขียน hardcode ไทยตาม sibling ทั้งโซน — จดตามข้อยกเว้นที่กฎกำหนดไว้ ตอน migrate จริงอย่าลืมก้อนนี้
- [x] **🎨 คลังภาพ (media library) — ✅ เขียนเสร็จ 2026-08-04** (local · ยังไม่ deploy prod · **ยังไม่เทสในเบราว์เซอร์จริง**)
  - migration รันบน local แล้ว: `post_assets` + `post_episode_media.source_asset_id` (บล็อกท้าย `migration.sql` · additive ล้วน)
  - lib: `postsAccess.js` +5 ฟังก์ชัน asset (**tests 82 ผ่าน** — เดิม 66) · `postsGuard.assetContext()` · `postsStorage`: `copyPostFile`/`sha256Hex`/`probeImage`
  - db: `web/db/posts/assets.js` (list/smart view/tags/dedupe/usage) · `media.addMedia` รับ `sourceAssetId`
  - API 4 ไฟล์: `/api/posts/assets` (GET list+tags · POST upload) · `assets/[id]` (GET+usage/PATCH/DELETE) · `assets/[id]/file` (stream ผ่าน gate) · `/api/posts/[id]/media/from-asset` (**คัดลอกไฟล์**)
  - UI: `AssetLibrary.jsx` (กอง/ค้นหา/ชิปแท็ก/ยังไม่เคยใช้/อัปโหลด+ช่องสิทธิ์ภาพ/แก้/เลื่อนขึ้นกองกลาง/ลบ) · `AssetPickerModal.jsx` · หน้า `/posts/library` + เมนู Nav "Library" · ปุ่ม "จากคลัง" ใน `PostMediaPanel` + `QuoteGeneratorModal` · i18n ครบ ns `posts.library` (th+en)
  - `gc-media.js` เพิ่ม reference ที่ 4 แล้ว
  - verify: `npm test` **288 ผ่าน** · `next build` ผ่าน · **smoke DB 25 เคส** (ตัวสำคัญ: ลบสื่อของโพสต์แล้ว **ไฟล์ในคลังยังอยู่** · dedupe ไม่ข้ามเจ้าของ · used_count/unused · ลบ asset แล้ว `source_asset_id` → NULL)
  - ⬜ **ยังไม่ได้ทำ:** เทสในเบราว์เซอร์จริง (อัป/เลือก/เลื่อนกอง) · เทส API ผ่าน HTTP จริงรวมเคส 403 · เพดานขนาดคลังต่อ org (`SUM(bytes)`) · ปุ่ม "รูปนี้ถูกใช้ที่ไหน" ยังมีแต่ API (`GET /api/posts/assets/[id]`) ยังไม่มี UI
  - ⏭️ prod: รันบล็อก `2026-08-04: post_assets` ท้าย `migration.sql`
  - รายละเอียดดีไซน์ + เหตุผลอยู่ข้างล่างนี้ (อ่านก่อนแก้ของเดิม)

  ที่มา (user 2026-08-03): *"บางทีผมก็อยากมีคลังภาพใหญ่ ให้คนอัพโหลด เหมือน canva แต่ก็อยากให้มีคลังส่วนตัวด้วย"* + *"ขอไอเดียใหม่ๆ จาก software ระดับโลก ลอกมาเลยก็ได้"*

  **⛔ 2 ข้อห้ามที่ต้องรู้ก่อนแตะ:**
  - **ห้ามทำคลัง = "รูปจากทุกโพสต์ใน org"** — `postsRetention.js` ลบไฟล์ `kind='upload'` **180 วันหลังเผยแพร่** (เซ็ต `path=NULL`) → คลังจะเน่าเงียบๆ ธัมบ์เนลแตกทีหลัง · คลังกับสื่อแนบโพสต์ **คนละ lifecycle ต้องคนละตาราง**
  - **ห้ามทำเป็น folder ซ้อน** — user เสนอ "folder ส่วนตัว/ส่วนรวม" แต่เคาะแล้วว่า **การแบ่งถูก แต่ folder เป็น primitive ที่ผิด**: สิทธิ์ซ้อน (folder ACL × org roles) ดูแลไม่ไหวใน multi-tenant · รูป 1 ใบอยู่ได้ folder เดียวทั้งที่ควรอยู่ทั้ง "ราชบุรี" และ "น้ำท่วม" · WordPress จงใจไม่มี folder ในคลังสื่อมาสิบปี ปลั๊กอินที่เติมให้เป็นแหล่งปัญหาคลาสสิก
    → ใช้ **`visibility` + `tags[]` + smart view** แทน

  **ที่ลอกมา (เรียงตามคุ้มค่า):** ① Canva "Uploads vs Brand Kit" = 2 กองที่*กติกาต่างกัน* ไม่ใช่ 2 โฟลเดอร์ · ② Figma/Google Photos smart view ("ใช้ล่าสุด/ของฉัน/ขององค์กร/ติดดาว/ยังไม่เคยใช้") · ③ Contentful/Bynder tag หลายอันต่อรูป · ④ Figma/Bynder "รูปนี้ถูกใช้ที่ไหนบ้าง" · ⑤ Dropbox dedupe ด้วย hash · ⑥ Bynder/Brandfolder สิทธิ์การใช้ภาพ+วันหมดอายุ
  **ไม่ลอก:** folder ซ้อนลึก · versioning ของ asset · AI auto-tag (เปลืองโควตา) · approval workflow ของ asset (มีของโพสต์แล้ว อย่าทำ 2 ชั้น)

  **✅ user เคาะ 2026-08-04:**
  - **กองกลางเฉพาะ `editor`** — ใครก็อัปเข้ากองตัวเอง (`personal`) ได้ แต่ **เฉพาะ `editor` ที่เลื่อนรูปขึ้นกองกลาง (`org`) ได้** (กันกองกลางรกใน 3 เดือน · ใช้ role ที่มีอยู่แล้ว ไม่เพิ่มคำใหม่)
  - **ใส่ `consent_note`/`usable_until` ตั้งแต่แรก** แม้ยังไม่ทำ UI — เป็นภาพคนจริงในงานพรรค เติมทีหลังต้องไล่ถามย้อนหลังทุกรูปซึ่งทำไม่ได้จริง

  **ตาราง `post_assets` (คอลัมน์ชุด visibility เดียวกับ `post_episodes` — ไม่ต้องเรียนกลไกใหม่):**
  ```
  org_id · owner_user_id · visibility('personal'|'org')
  path · mime · width · height · bytes · sha256      ← dedupe (unique ต่อ org+เจ้าของ)
  title · tags text[]                                 ← แทน folder
  uploaded_by · created_at
  consent_note · usable_until
  ```
  - **ไม่มี retention** — คลังคือของที่ตั้งใจเก็บ (ต่างจาก `post_episode_media`)
  - แม่แบบ personal-vs-shared ที่ใช้จริงอยู่แล้ว: `assets/watermark/<guildId>/` vs `assets/watermark/user_<userId>/`
  - ดิสก์ยังไม่ใช่ข้อจำกัด (`storage/posts` 1.1 MB · ว่าง 115 GB) โตจริงค่อยคุย R2 (ดู `decision_media_storage_retention`)

  **🔧 แก้ดีไซน์หลัง `/scrutinize` 2026-08-04 — 3 ข้อนี้ตัดสินหน้าตาโค้ด อ่านก่อนเขียน:**
  1. ⛔ **หยิบรูปจากคลังไปใช้ = "คัดลอกไฟล์" ห้ามแชร์ `path` เดียวกัน** (ดีไซน์เดิมเขียนว่า usage tracking "ได้ฟรีจาก path เดียวกัน" — **ผิด**)
     เพราะโค้ดที่มีอยู่แล้วลบไฟล์จาก path ของแถวโพสต์ตรงๆ 2 จุด → แชร์ path เมื่อไหร่ = ไฟล์ในคลังหายจากดิสก์เงียบๆ แถวคลังยังชี้ path เดิม:
     - `web/app/api/posts/media/[id]/route.js:67-69` ลบสื่อ 1 ชิ้น → `deletePostFile(path)` **และ** `deletePostFile(bg_path)`
     - `services/postsRetention.js:48` ลบไฟล์ 30/180 วันหลังเผยแพร่
     → **แทนที่ด้วย:** คัดลอกเป็น uuid ใหม่ตอนหยิบไปใช้ + เพิ่มคอลัมน์ **`post_episode_media.source_asset_id bigint NULL`** เป็นตัวตอบ "ถูกใช้ที่ไหน"/"ยังไม่เคยใช้" · โค้ดลบเดิม**ไม่ต้องแก้สักบรรทัด** (ลบแค่สำเนาของโพสต์)
  2. **ต้องมี route เสิร์ฟไฟล์ของคลังเอง** — `/api/posts/media/[id]` JOIN `post_episodes` (`web/db/posts/media.js:82-92`) asset ไม่มีโพสต์เจ้าของจึงใช้ไม่ได้ → `GET /api/posts/assets/[id]/file` ที่ gate เอง (ไฟล์อยู่นอก `public/`)
  3. **`resolveBackground` มีรูตรงกิ่ง `bgPath`** (`web/lib/quoteBg.js`) — เช็คแค่ "ไม่ใช่ของโพสต์อื่น" ผ่าน `findMediaByPath` ซึ่ง asset **ไม่มีแถว → คืน [] = ผ่านทุกครั้ง** (รูป personal ของคนอื่นถ้ารู้ path ก็ใช้ได้)
     → **ทำจริงแบบง่ายกว่าที่วางไว้ (2026-08-04):** ไม่ได้เพิ่มกิ่ง `bgAssetId` เพราะกล่องการ์ดคำคม**ครอปฝั่ง client แล้วอัปเป็นไฟล์ใหม่เสมอ** (กิ่ง `bgFile`) = ได้สำเนาคนละใบอยู่แล้ว · กิ่งใหม่จะเป็น dead code
     → ที่ใส่แทนคือ **ปิดประตู**: กิ่ง `bgPath` เรียก `findAssetByPath()` แล้วปฏิเสธถ้า path นั้นเป็นของคลัง

  **กติกาสิทธิ์ (เคาะเพิ่ม 2026-08-04 — ดีไซน์เดิมไม่ได้พูด):**
  - เลื่อนขึ้นกองกลาง = **`isMediaTeam()`** (admin + secretary_general + editor) **ห้ามเช็ค `permissions.has('editor')` ตรงๆ** ไม่งั้น admin ทำไม่ได้
  - **กองกลางทุกคนใน org อ่านได้เสมอ ไม่ผูกกับ `posts_policy.read`** — org ที่ตั้ง `'team'` จะมองไม่เห็นคลังกลางทั้งที่คลังมีไว้แชร์ (policy คุมร่าง ไม่ใช่คุมวัตถุดิบ) · `personal` = เจ้าของ + admin
  - แก้/ลบ asset = ผู้อัป + `isMediaTeam` (ปลอดภัยเพราะโพสต์ถือสำเนาของตัวเองแล้ว)
  - `sha256` dedupe **ต้องมีขอบเขต** — unique `(org_id, owner_user_id, sha256)` และค้นซ้ำเฉพาะกองที่คนนั้นเป็นเจ้าของ ไม่งั้นแชร์ไฟล์ข้าม tenant
  - `consent_note`/`usable_until` **ใส่ input ในฟอร์มอัปเลย** (optional) — มีแต่คอลัมน์ = NULL ตลอด เหตุผลที่ยกมาไม่เกิดผลจริง

  **อื่นๆ:** ⚠️ `scripts/posts/gc-media.js` เพิ่ม `post_assets.path` เป็น reference **ที่ 4** (+แก้คอมเมนต์หัวไฟล์ที่เขียนว่า "3 ที่") · เก็บไฟล์ใน `storage/posts/` เดิม ห้ามตั้งโฟลเดอร์ใหม่ (ต้องแก้ `absPath` ทั้งฝาแฝด web ESM + bot CJS + gc) · `tags` normalize ตอนเขียน (trim/lower/≤10) · **ไม่ต่อ Meilisearch** — `title ILIKE` + `tags && $1` + GIN พอสำหรับคลังที่เริ่มจาก 0 · ยังไม่มีเพดานขนาดต่อ org (คลังไม่มี retention = โตทางเดียว) ใส่เช็ค `SUM(bytes)` ตอนอัปได้ทีหลัง
- [ ] **📅 สร้าง Discord Event จากโพสต์ (ฝั่งเว็บ) — ยังไม่เคยจด · user ถาม 2026-08-04** *"เลือก create event บน discord ตามกำหนดการของโพสต์ นอกจากแชร์ลงห้องข่าวสาร"*
  - **มีแล้วเฉพาะฝั่งดิสฯ:** ปุ่ม 📅 หลังโพสต์ตะกร้า → modal (ชื่อ/เริ่ม/จบ default +2 ชม./ห้องประชุมหรือสถานที่) → `guild.scheduledEvents.create()` + ประกาศ @everyone เข้าห้องข่าวสาร (มี quiet hours 21:00–09:00) · `handlers/basketHandler.js:876-1010` · ดีไซน์เต็มอยู่ `md/discord/BOT.md` §Social share
  - **ฝั่งเว็บยังไม่มีเลย** — `PostPublishPanel` มีแค่ platform `news` (ห้องข่าวสาร) ไม่มี event
  - ⚠️ **ตัวติดจริงคือสถาปัตยกรรม ไม่ใช่ UI:** เว็บสร้าง Discord event เองไม่ได้ (ไม่มี discord client ในโปรเซสเว็บ) → ต้องส่งงานผ่าน `post_social_history` เหมือนเป็นเป้าหมายอีกตัว แล้วให้ `services/publishWorker.js` (ฝั่งบอท) เป็นคนสร้าง — และต้องแยก logic ออกจาก `basketHandler` เป็น service ก่อน (แบบเดียวกับที่ `publishPipeline.js` ทำกับการโพสต์)
  - ⚠️ **"กำหนดการของโพสต์" ≠ `scheduled_at`** — `scheduled_at` คือ *เวลาที่โพสต์ออก* ส่วน event ต้องการ *เวลางานจริง* → ต้องมี `event_start`/`event_end`/`location` (คอลัมน์บน `post_episodes` หรือถามในกล่องตอนกด) · อย่าเอา `scheduled_at` มาใช้แทน
  - ต้องเคาะเพิ่ม: โพสต์เป็น org-native แต่ **event เป็น guild artifact** → สร้างที่ guild ไหน (โพสต์ใบเดียวอาจไปหลาย guild) · เป็นติ๊กในกล่องเผยแพร่ หรือปุ่ม follow-up หลังโพสต์เหมือนดิสฯ · สิทธิ์ฝั่งเว็บใช้ `postsAccess` (ฝั่งดิสฯ ใช้ ManageMessages) · bot ต้องมี **Manage Events**
- [ ] **ก้อน 3** — อนุมัติ: สถานะ + revisions + review links (`noindex`, token ≥32 bytes) + comments + ล็อกหลังอนุมัติ
- [x] **ก้อน 4** ✅ 2026-07-30 (local · ยังไม่ deploy prod · **ยังไม่กดโพสต์จริงจากดิสฯ/เว็บ**)
  - ขั้น 1 `3539ba5` — param `accountId` ใน metaApi/xApi (+ `orgId` ให้ X ใช้ app creds ของ org)
  - ขั้น 2 `d8746f9` — **`services/publishPipeline.js`** (prepareImages/publishOne/publishBatch) + **สลับ basketHandler มาเรียกในรอบเดียวกัน** (processAndPost -215/+72 บรรทัด) · เทส `scripts/test/publishPipeline.test.js` 14 เคส
  - ขั้น 3 `eb9d6c4` — รวมประวัติที่ `post_social_history` (10 แถวเก่า → 16 แถวรายแพลตฟอร์ม, batch_id คงที่) · `getHistory` GROUP BY batch_id · **drop `dc_media_history`**
  - ขั้น 4a `7ddf6cc` — **worker** (`services/publishWorker.js`) poll 30 วิ · SKIP LOCKED · retry ≤3 · grace 2 ชม.→stale · **backlink กลับห้อง Discord** · เทส 10 เคส
  - ขั้น 4b — API เว็บ (`/publish` 202 · `/jobs` · retry/cancel) + กันกดซ้ำ 409 + UI กล่องเผยแพร่ใน `PostPublishPanel.jsx`
  - e2e ผ่าน: สร้างโพสต์ → เผยแพร่ → เข้าคิว → worker ยิง → done+URL · กดซ้ำ 409 · IG ไม่มีสื่อ 400 · ตั้งเวลาย้อนหลัง 400
  - ขั้น 4c (2026-07-30) — **กล่องเผยแพร่เลือก "กลุ่ม" ไม่ใช่ "บัญชี"** (`lib/publishTargets.js` + `/api/posts/publish-targets`)
    ปิดบั๊ก: เดิมเช็คแค่ `org_id` → คนใน org เดียวกันโพสต์ในนามบัญชี private ของคนอื่นได้ · news ต้องมี `news_channel_id` จริง
  - ขั้น 4d (2026-07-30) — **ลายน้ำจากเว็บ** (`lib/watermarks.js` + `/api/posts/watermarks`) · เก็บเป็น `path:<guild>/<group>/<file>`
    ที่ resolve แล้ว (ไม่ใช่ token `guild:` ของตะกร้าดิสฯ เพราะกลุ่มอาจอยู่คนละ guild กับที่ผู้ใช้อยู่) · `wm_type` → `text`
  - ขั้น 4e (2026-07-30) — **วิดีโอจากเว็บโพสต์ได้แล้ว**: worker วางไฟล์ลง `media-temp` (โฟลเดอร์เดียวกับที่รูป IG
    ใช้อยู่แล้ว ผ่าน `metaApi.saveMediaToTemp`) แล้วส่ง URL ให้ Meta ดึง — **ไม่ต้องมี signed URL route**
    ถ้า `WEB_BASE_URL` ไม่ได้ตั้ง = โยน error ชัดๆ ไม่ปล่อย URL สัมพัทธ์ไปให้ Meta
  - **⬜ ของค้างจากก้อนนี้:**
    - UI ยังไม่มี: เลือกห้องแจ้งกลับ (ใช้ `org_config.posts_notify_channel` เท่านั้น) — รอทำ channel picker ค่อยทำทีเดียว
    - ~~`media-temp` ไม่มีตัวลบไฟล์เก่า~~ → **เสร็จ 2026-07-30** `cleanTempMedia()` เกาะ publishWorker วันละครั้ง (เก็บ 24 ชม.)
    - ~~quiet hours ของ `news`~~ — **user เคาะ 2026-07-30: ไม่ต้องมี** เว็บสั่งโพสต์เมื่อไหร่ก็ยิงเลย
      (quiet hours 21:00–09:00 ใช้เฉพาะประกาศอีเวนต์ผ่าน `sendOrQueueAnnouncement` ซึ่งคนละเส้นกับ posts อยู่แล้ว)
    - `job.guild_id` = guild ที่ผู้ใช้อยู่ตอนกด ซึ่งอาจไม่ใช่ guild ของกลุ่มที่เลือก (โพสต์ไม่พังเพราะบัญชีถูก pin แล้ว
      และลายน้ำ resolve จากฝั่งเว็บ) — แต่ถ้าจะใช้ `guild_id` ทำอย่างอื่นต้องระวัง
- [x] ~~**ก้อน 4c — ยุบตะกร้าดิสฯ เข้า `post_episodes`**~~ ✅ **เสร็จ local 2026-07-30** (5 commit: `4fcc7e6` schema → `27a19a5` ตะเข็บ db → `26a9276` basketHandler → `6220ae5` เว็บ → `d0c09d0` retention)
  - **ทำไปจริงยังไง:** `db/mediaBasket.js` = ตะเข็บ (ข้างในเป็น `post_*` ข้างนอกคืนแถวรูปแบบเดิม) → `basketHandler` 12k tok ไม่ต้องรื้อ · ฝาแฝดฝั่งเว็บคือ `web/db/posts/basket.js` (CJS/ESM import ข้ามกันไม่ได้ — **แก้ logic ที่ไหนต้องไล่ดูอีกฝั่งเสมอ**)
  - caption ของตะกร้า = `post_episodes.body` · ล้างตะกร้า = archive · `org_id` NULL = โผล่แค่ในดิสฯ
  - ⚠️ **~~หมวด = ชื่อห้อง~~ ยกเลิกแล้ว 2026-07-30** — ชื่อห้องย้ายไปคอลัมน์ `post_episodes.channel_name` ของตัวเอง
    (เดิมยัดลง `category` เพื่อไม่ต้องเพิ่มคอลัมน์ → `category` ทำ 2 หน้าที่ · `listCategories` ต้อง exclude ชื่อห้องทุก query
     และพอ UI ให้แก้หมวดได้ **ชื่อห้องหายถาวร**) · migration + backfill อยู่ท้าย `migration.sql` · รันบน local แล้ว (10 แถว)
  - หย่อนแล้ว **ack ก่อน** โหลดไฟล์ลงดิสก์ background · พรีวิวในการ์ด = แนบไฟล์ (`attachment://`) ไม่ใช่ลิงก์ CDN
  - `publishPipeline.loadMediaSources()` = ตัวแปลง path/URL → input ของ `publishOne` **ที่เดียว** (worker เลิกมีของตัวเอง)
  - `/api/bot/basket/media/[id]` เสิร์ฟไฟล์ (ใช้ `/api/posts/media/[id]` ไม่ได้ — ตัวนั้นเทียบ `org_id` กับ session แล้วตะกร้า `org_id` NULL ตก 404)
  - ฟีด `/posts` **ซ่อนของจากดิสฯ เป็น default** + แท็บ "จากดิสฯ" (`?source=discord`) — user เคาะ 2026-07-30
  - เทส: `scripts/test/basketEpisode.test.js` (20) · pipeline 22 · worker 24
  - **⬜ เหลือ (ทำหลัง deploy prod ครบทั้งบอทและเว็บ):**
    - [ ] `DROP TABLE dc_media_baskets` (คอมเมนต์รออยู่ท้าย `migration.sql`) + ลบ `scripts/data/backfillBasketNames.js` ที่ตายตามไป
    - [ ] ไฟล์ของตะกร้าที่ย้ายมา (16 แถว) ยัง `path` NULL — หย่อนอะไรเพิ่มในห้องนั้นครั้งหน้าถึงจะโหลดลงดิสก์ให้เอง (ระหว่างนี้ใช้ `source_url` ปกติ)
    - [ ] ยังไม่ได้เทสด้วยตาในดิสฯ ของจริง (หย่อนรูป/คลิป → ดูการ์ด → กดโพสต์)
- [ ] **ที่เก็บสื่อระยะยาว — ยังไม่ต้องทำ** (user ถาม 2026-07-30 "ดิสก์จะไม่พอไหม" · คุยจบแล้ว)
  - **แก้ด้วย retention ไปแล้ว** (`services/postsRetention.js` — คลิป 30 วัน / รูป 180 วัน หลังโพสต์ออก) → ดิสก์นิ่งหลักร้อย MB ไม่โตเป็นเส้นตรง
  - **R2 (Cloudflare) — ยังไม่ต่อ** · มีไว้เพื่อ URL สาธารณะให้ IG/Threads มาดึงคลิป ซึ่งตอนนี้ `saveMediaToTemp()` + `/api/media-temp/` ทำแทนได้แล้ว · ราคา ~$0.015/GB/เดือน (free 10 GB) egress ฟรี · ค่อยต่อวันที่ดิสก์เต็มจริง = งานครึ่งวัน เพราะทุกจุดที่แตะไฟล์ผ่าน `utils/postsStorage.js` อยู่แล้ว
  - **Google Drive — ไม่เอาเป็นที่เก็บของระบบ** ลิงก์ Drive ให้ Meta ดึงไม่ได้ (redirect + rate limit + virus-scan interstitial) · เหมาะเป็น "คลังฟุตเทจให้คนเปิดดู" ซึ่งเป็นฟีเจอร์คนละตัว
  - [ ] จดไว้ทำทีหลัง: **คลังฟุตเทจดิบของทีมสื่อ** (Drive) — ถ้าอยากได้จริงค่อยทำเป็นงานแยก
- [x] ~~**ก้อน 5** — AI เกลาสำนวน + แคปชัน/ไอเดียภาพ~~ ✅ 2026-07-30 (`f92346b`) — `/api/posts/ai/polish` (3 โทน) + `/api/posts/ai/caption` (แคปชัน 3 + ไอเดียภาพ 3) · ไม่เขียนลง DB · snapshot revision ก่อนทับทุกครั้ง
- [ ] **i18n โซน posts — ยังเป็นไทย hardcode ทั้งโซน** (จด 2026-07-30 หลังรื้อ UI `/posts`) · `PostsHome.jsx` · `PostEditor.jsx` · `PostMediaPanel.jsx` · `PostMetaPanel.jsx` (ใหม่ 2026-07-30 ตอนยุบหน้าตะกร้า) · `PostPublishPanel.jsx` · `PostCreate.jsx` · `PostRevisions.jsx` → migrate ทีเดียวทั้งโซนเป็น `posts.*` ใน `web/locales/{th,en}.json` (งาน mechanical → `i18n-migrator` ทีละ 2-3 ไฟล์) · เหตุที่ยังไม่ทำตอนรื้อ: migrate ไฟล์เดียวจะได้สไตล์ไม่ตรงเพื่อนบ้าน แล้วต้องกลับมาแก้อีกรอบ
- [~] **ก้อน 6** — migrate `posts/*.md` เข้า DB: **seed แล้ว 22 ตอน** (`scripts/seedPostsFromFiles.js` idempotent) เหลือแค่เคาะว่าจะเลิกใช้โฟลเดอร์ `posts/` เลยไหม
- [ ] **ถอด prefix `dc_` ออกจากตารางที่เป็น org แล้ว** (user สั่ง 2026-07-29 · ทำ **หลังก้อน 4**) — สำรวจแล้วเหลือจริง 3 ตัว:
  - **หลักที่ user เคาะ 2026-07-29: prefix ต้องมีโมดูลจริงรองรับ** — ห้ามตั้ง prefix ลอยๆ ที่ไม่มีโฟลเดอร์/feature key รองรับ (เช่น `media_` ตกไปเพราะไม่มี `web/db/media/`) · `post_` ผ่านเพราะมี `web/db/posts/` + `orgFeatures` key `posts`
  - `dc_social_accounts` → **`post_social_accounts`** (**26 ไฟล์โค้ด** — grep ใหม่ 2026-08-13: บอท 5 `handlers/basketHandler.js` `services/{metaApi,newsShare,xApi}.js` · scripts 7 · web 14 · เดิมจด 14 ไฟล์ **ประเมินต่ำไป**) — ⚠️ ต้องมีคอมเมนต์หัวตารางว่าตะกร้าสื่อ/ลายน้ำ/Meta-X OAuth ใช้ร่วม **ห้าม drop ตามโมดูล posts**
  - `dc_orgchart_config` → `org_chart_config` (2) · `dc_orgchart_snapshot` → `org_chart_snapshot` (1) — มี `org_*` เป็นโมดูลรองรับอยู่แล้ว
  - `dc_media_baskets` คง `dc_` ไว้ — เป็นฟีเจอร์ของ Discord จริงๆ (ไม่ยุบเข้า posts แล้ว)
  - **ไม่ต้องแตะ** `dc_media_baskets` / `dc_media_history` / `dc_user_config` — ก้อน 4 ยุบหาย/รอ drop อยู่แล้ว (rename ตอนนี้ = เสียแรงฟรี)
  - **คง `dc_` ไว้ 12 ตัวที่เป็น Discord จริง**: guilds · guild_config (channel/message id ล้วน) · guild_roles (392) · guild_role_groups · activity_daily/mentions (89k แถว) · forum_config/posts · gogo_entries · ai_modes · user_ratings/reports
  - ⚠️ ทำ **ทีละตาราง ทีละ commit** grep แก้ด้วยตา — ห้าม sed รวด (เคย bulk-rename ตอน migrate calling แล้ว `orgId` ไหลเข้า `guild_id`)
  - ⚠️ บอท/เว็บ deploy ไม่พร้อมกัน → rename แล้วสร้าง **view ชื่อเดิม** คร่อมไว้ (auto-updatable) → deploy → drop view
  - 🕐 **ถามอีกรอบ 2026-08-13 "ทำไหม" → ตอบ ยังไม่ทำ** · เหตุ: ต้อง deploy บอท+เว็บพร้อมกัน แต่ตอนนี้มีกองรอ deploy ซ้อนกันหลายชั้น (ก้อน 4c · Phase 0 social accounts ที่ rebuild ตารางนี้ทั้งตัว · middleware/auth 404 · AI prompt backoffice) — วางทับกองที่ยังไม่ deploy พอพังจะแยกไม่ออกว่าอะไรพัง · **ได้ 0 กับผู้ใช้** (งานความสะอาดล้วน) → รอ prod นิ่งก่อน แล้วทำเป็น session เดี่ยว ไม่ปนงานอื่น (`/scrutinize` ก่อนตามกฎโปรเจกต์)
- [x] ~~**บั๊กที่มีอยู่จริง: รูปในตะกร้าตายใน ~24 ชม.**~~ ✅ 2026-07-30 (`f682283`) — **เลือกทาง B** `services/discordAttachments.js` รีเฟรชลิงก์ตอนใช้ (basketHandler + worker) · ข้อจำกัดที่เหลือ: ข้อความต้นทางถูกลบ = จบ · เติมทาง A ทับได้ทีหลัง
  - <details><summary>บันทึกการตัดสินใจเดิม</summary> — `dc_media_baskets.image_url` เป็น Discord signed URL (`?ex=&is=&hm=`) ตะกร้าที่ค้างข้ามวันแล้วกดโพสต์จะยิงไม่ออก (`fetchBuffer` ที่ `basketHandler` 783/801/1054 โยน · วิดีโอส่ง URL ให้ Meta ดึงเองที่ 711-756 ก็พังเหมือนกัน) · **รอเคาะว่าเอาทางไหน:**
  - **B. รีเฟรช URL ตอนใช้ (เชียร์)** — `client.rest.post('/attachments/refresh-urls')` (discord.js 14.25 เรียกได้ ไม่ต้องอัป) · **แก้วิดีโอด้วย** เพราะ Meta ต้องดึงจาก URL ที่ยังไม่หมดอายุ · แตะ helper 1 ตัว + จุดเรียก 3-4 จุด · ไม่รอด ถ้าข้อความต้นทางถูกลบ
  - **A. โหลดไฟล์ลงดิสก์ตอนหย่อนเข้าตะกร้า** — รอดแม้ข้อความถูกลบ · แต่ **แก้วิดีโอไม่ได้** (ไฟล์ในเครื่องเรา Meta เข้าไม่ถึง ต้องมี public URL อีกชั้น) · แตะ `addImages` + จุดอ่าน 4 จุด + หน้าเว็บตะกร้าต้องมี route เสิร์ฟรูป
  - เติม A ทับ B ทีหลังได้ ไม่ขัดกัน
  - ❌ **อย่าเอาไปรวมกับ `post_episode_media`** (คุยแล้ว 2026-07-29): `episode_id` เป็น FK NOT NULL → รับแถวตะกร้าต้องมีพ่อ 2 แบบ = polymorphic parent · และถ้าเลือกทาง B ตะกร้าไม่มีไฟล์เลย ไม่มีอะไรให้รวม · **ของที่ใช้ร่วมคือ logic (ลากเรียง/ลายน้ำ/แปลง buffer) ไม่ใช่ตาราง** — แบบเดียวกับที่ finance/docs เก็บไฟล์คนละตารางแต่ใช้ helper ตัวเดียว</details>
- [ ] ลายน้ำยังผูก guild (`resolveWatermarkPath`) → org ไม่มี guild ใช้ลายน้ำไม่ได้ · ต้องยกขึ้น org วันหลัง
- [ ] จดไว้ทำทีหลัง: ดึงการ์ดที่ทำในดิสฯ เข้ามาเป็นสื่อของตอนบนเว็บ (ตอนนี้ทางฝั่งดิสฯ จบที่ตะกร้าซึ่งตัดออกแล้ว)

### 📡 Social listening → ป้อนไอเดียคอนเทนต์ (ไอเดียใหม่ 2026-08-12 · ยังไม่เคยทำ · อยู่ในระบบ posts)

user เปรยว่า "น่าจะมี social listening เอาไว้เป็นตัวอย่างทำคอนเทนต์" · **ยังไม่ได้ scope/ไม่ได้เคาะ** — จดกันลืม

**⛔ ข้อจำกัดที่ต้องรู้ก่อนวางแผน (เช็ค 2026-08-12) — ห้าม re-derive:**
- **FB/IG ค้นโพสต์สาธารณะตามคีย์เวิร์ดไม่ได้แล้ว** — CrowdTangle ปิด ส.ค. 2024 · Meta Content Library ให้เฉพาะนักวิจัยที่ผ่านอนุมัติ · TikTok เหมือนกัน (research API)
- **X search ต้องจ่าย** ~$200/เดือน (Basic tier)
- → **"ฟังเสียงคนทั่วไป / วัด sentiment" ทำไม่ได้ในงบ 0 บาท** อย่าไปเขียน spec ที่สัญญาสิ่งนี้ · ที่ทำได้จริงคือ *news monitoring + วิเคราะห์ผลงานตัวเอง*

**✅ แหล่งที่ใช้ได้จริง (user เลือก 2 อันแรก)**
1. **Google News RSS — ฟรี ไม่ต้อง key · ยิงจริงแล้วผ่าน 2026-08-12**
   `https://news.google.com/rss/search?q=<คีย์เวิร์ด>+when:7d&hl=th&gl=TH&ceid=TH:th` → 200, ~200KB, หัวข้อไทยครบพร้อม `pubDate`/`link`/ชื่อสำนักข่าว
   ใช้กรองรายพื้นที่ได้ (`"ราชบุรี" when:3d`) → ตรงกับงานพื้นที่ · ได้แค่ headline+ลิงก์ ไม่ได้เนื้อข่าวเต็ม
2. **ผลงานคอนเทนต์ของเราเอง** — ดึง insights ของเพจ/IG/Threads ที่ **มี token อยู่แล้ว** (`dc_social_accounts`) กลับมา join กับ `post_social_history` + `post_episodes.category`
   → ตอบคำถามที่ตอนนี้ไม่มีใครตอบได้: หมวดไหน/รูปแบบไหน/เวลาไหนไปได้ดี · ทุกวันนี้โพสต์ออกแล้วจบ ไม่มีตัวเลขวิ่งกลับ
3. (สำรอง) RSS สำนักข่าวไทยตรงๆ · YouTube Data API search (ฟรี 10k unit/วัน)

**🎯 user เคาะ 2026-08-12: "อยากรู้เรื่องท้องถิ่นมากกว่า เช่นข่าวในราชบุรี"** → ข่าวชาติเป็นของรอง · ออกแบบให้ **พื้นที่เป็นแกนหลัก**

**ผลเทสจริง "ราชบุรี" (2026-08-12) — ตัวเลขจริง ห้าม re-derive:**
- `ราชบุรี when:7d` → **73 ข่าว/7 วัน (~10/วัน)** เป็นข่าวท้องถิ่นจริง: ไฟไหม้โรงงานบ้านโป่ง · เนวินพบบุญยิ่ง (การเมืองท้องถิ่น) · ค่าจ้างขั้นต่ำจังหวัด · ปลาหมอคางดำ · GI มะนาวแป้นดำเนินสะดวก
- **🔑 แหล่งอันดับ 1 = `facebook.com` 22/73 (30%)** — Google News ดัชนีโพสต์เพจข่าวท้องถิ่นบน FB ให้ → **ได้เนื้อหาเพจท้องถิ่นทางอ้อมแบบฟรี ทั้งที่ Meta API ปิดไปแล้ว** · อันนี้คือของมีค่าที่สุดสำหรับงานพื้นที่ · รองลงมา: กรมประชาสัมพันธ์(10) สยามรัฐ(7) ผู้จัดการ(5)
- ค้น**ชื่ออำเภอ**ได้ผลดี: `"จอมบึง" OR "บ้านโป่ง" OR "โพธาราม" OR "ดำเนินสะดวก" when:14d` → 24 ข่าว ตรงประเด็นเกือบหมด
- ⚠️ **ยัด OR ยาวกับคำกว้าง = พัง** — `ราชบุรี เทศบาล OR อบต. OR อบจ.` คืนข่าวชาติมั่ว (ฮั้ว สว.นครฯ / จีนเทา) → **แยกเป็นคำค้นสั้นๆ หลายอันแล้ว dedupe ทีหลัง อย่ารวมเป็น query เดียว**
- ⚠️ ต้องมี **blocklist** — "ราชบุรี เอฟซี" (ฟุตบอล) + ข่าวเที่ยวสวนผึ้ง กินโควตาเยอะ
- สคริปต์ที่ใช้เทสอยู่ scratchpad (ไม่ได้ commit) — parse ด้วย regex ง่ายๆ ไม่ต้องลง lib RSS
- ⚠️ ปีในหัวข้อข่าวเป็น พ.ศ. (2569) แต่ `pubDate` เป็น ค.ศ. ปกติ

**✅ ก้อนแรกเขียนเสร็จ 2026-08-12 (local · ยังไม่ deploy · ยังไม่เคยรันกับ Discord จริง)**
- `config/newsWatch.js` · `db/newsWatch.js` · `services/newsWatch.js` · `handlers/newsWatchHandler.js` · subcommand `/panel news` · ns `newsWatch` ใน th+en · ตาราง `news_watch_seen` ใน migration.sql
- **ปลายทางได้ 3 แบบ** (เพิ่ม 2026-08-12 รอบสอง): ห้องแชท · **เธรด** (ปลุกให้เองถ้า archived) · **ห้อง Forum** (เปิดกระทู้ใหม่ 1 กระทู้ต่อรอบ — Forum ส่งข้อความลอยๆ ไม่ได้)
- **ตั้งได้หลายชุดต่อ guild** — `news_watch_feeds` = `[{channelId, keywords}]` · 1 ปลายทาง = 1 ชุดคำค้น · ตั้งซ้ำที่เดิม = แก้ชุดเดิม
  - ⚠️ `news_watch_seen` คีย์ด้วย **(guild_id, channel_id, item_key)** — ถ้าคีย์แค่ guild ห้องที่สองจะไม่เห็นข่าวที่ห้องแรกส่งไปแล้ว
  - ⚠️ ปลายทางเป็น Forum → panel ไปวางที่ห้องที่พิมพ์คำสั่งแทน (วางใน Forum ไม่ได้)
- **🔴 บั๊กที่เจอตอน user กดใช้จริง 2026-08-12: ลิงก์เปิดแล้วไม่เจอเนื้อข่าว** — ลิงก์ใน RSS เป็น `news.google.com/rss/articles/CBMi…` ที่ Google ซ่อน URL ปลายทางไว้หลัง JS
  - พิสูจน์แล้วว่า **decode base64 ไม่ได้ · ตาม redirect ก็วนอยู่ที่ news.google.com · ในหน้า HTML ไม่มี URL สำนักข่าวเลยสักตัว**
  - แก้ด้วย `resolveLink()` — หยิบ `data-n-a-sg`/`data-n-a-ts` จากหน้า แล้วยิง `batchexecute` ต่อ (เทส **6/6 ผ่าน · 0.4 วิ/ข่าว**)
  - ⚠️ เป็น endpoint ภายในของ Google **พังได้ทุกเมื่อ** → โค้ดตกกลับไปใช้ลิงก์เดิมเสมอ ไม่ทิ้งข่าว · ถ้าวันหนึ่งลิงก์เสียอีก ให้มาดูฟังก์ชันนี้ก่อน
  - แปลงเฉพาะ 5 ข่าวที่จะส่งจริง ไม่ใช่ 36 ชิ้นที่สแกน (ยิง 2 request ต่อข่าว)
  - ของแถม: URL จริงสั้นกว่า ~8 เท่า (50 vs 398 ตัวอักษร) → ข้อความไม่ชนเพดาน 2,000 อีก
- **รูปแบบ: ข้อความธรรมดา ไม่ใช่ embed** (user เคาะ 2026-08-12) — หัวข้อตัวหนาเป็นสรุป + ลิงก์เล็กบรรทัดล่าง (`-#`) · **5 ข่าว/รอบ** = 1 ข้อความ ~920 ตัวอักษร
  - ต้องใส่ `MessageFlags.SuppressEmbeds` เสมอ ไม่งั้น Discord แปะการ์ดพรีวิว 5 ใบกลบเนื้อหา
  - ตัด " - ชื่อสำนัก" ท้ายหัวข้อ (ซ้ำกับบรรทัดล่าง) · ย่อลิงก์โพสต์ FB ที่ slug ไทยยาว ~500 ตัวอักษรให้เหลือเลข id
  - ℹ️ **RSS ไม่ได้ให้เนื้อข่าวมาเลย** (description = หัวข้อ+ชื่อสำนักซ้ำ) → "สรุปย่อ" จริงๆ ต้องใช้ AI ซึ่ง user เลือกไม่เอา ใช้หัวข้อเป็นสรุปแทน
- **🔴 user เปิดใช้จริงแล้วบอก "มีแต่ข่าวขยะ" 2026-08-12 — แก้แล้ว 2 สาเหตุ**
  - **(1) ข่าวเดียวกันซ้ำเต็มกอง** — จาก 37 ข่าวมีแค่ 5 เรื่อง: ไฟไหม้โรงงาน 11 ชิ้น · เนวิน-งูเขียว 8 · ฟุตบอล 11
    - ⛔ **trigram Jaccard ไม่พอ อย่าถอยกลับไปใช้** — วัดแล้วต่อให้ลดเกณฑ์ถึง 0.12 ข่าวเนวินก็ยังแตก 6 กลุ่ม เพราะแต่ละสำนักพาดหัวคนละสำนวน ("สะพัด เนวิน พบ บุญยิ่ง" vs "อนุทิน งง งูเขียว เข้า ภท.")
    - เปลี่ยนเป็นจับกลุ่มด้วย **n-gram ที่หายากในกองนั้น** (ชื่อเฉพาะแบบ "เนวิน"/"บุญยิ่ง" หายาก = มีความหมาย · "ราชบุรี" โผล่ทุกข่าว = ตัดทิ้ง) · grid search ได้ n=5 · แชร์ ≥4 · rare ≤35%
    - ผล: **26 ข่าว → 7 กลุ่ม** (trigram ได้ 21) ยุบเนวิน 8 ชิ้นเป็นก้อนเดียว · ที่แชร์ ≥3 ยุบผิด (เอาข่าวจับคนไปรวมกับไฟไหม้) จึงใช้ 4
    - **บทเรียน: ที่เคยตัดสินใจตั้งเกณฑ์อนุรักษ์นิยม "ยอมซ้ำดีกว่ายุบผิด" — ผิด** ของจริงคือเห็นข่าวเดิม 5 บรรทัดแล้วรู้สึกว่าทั้งกองเป็นขยะ
  - **(3) พนัน/คาสิโนเยอะมาก** (user บอก 2026-08-12) → เติม พนัน/คาสิโน/บาคาร่า/สล็อต/แทงบอล/เดิมพัน/ยิงปลา/ไฮโล/ป๊อกเด้ง/เสือมังกร/รูเล็ต/เว็บตรง/ufabet + หวย/เลขเด็ด/ล็อตเตอรี · เทียบแบบไม่สนตัวพิมพ์แล้ว (UFABET)
    - ⚠️ **จงใจไม่ใส่คำว่า 'บ่อน' เดี่ยวๆ** เพราะไปโดน "บ่อนทำลายความมั่นคง" ซึ่งเป็นข่าวการเมืองจริง ('พนัน' ครอบ "บ่อนการพนัน" อยู่แล้ว)
    - ℹ️ คำค้นชุดเริ่มต้น (ราชบุรี+อำเภอ) **ไม่มีข่าวพนันเลยสักชิ้น** → feed ที่ user ใช้จริงตั้งคำค้นอื่น ยังไม่รู้ว่าคำไหน (DB dev ไม่มี feed — บอทรันกับฐานอื่น)
  - **(4) กวาดขยะสากลเพิ่ม** (user สั่ง "มีอะไรให้กรองอีกช่วยกรองไปก่อนเลย") → ดวง/มูเตลู · ราคาทอง-น้ำมันรายวัน · โปรโมชั่น-ส่วนลด · บอลต่างประเทศ+ลิงก์ดูสด · บันเทิงสากล · วลีสแปมพนัน (ทดลองเล่น/เครดิตฟรี/ฝากถอนออโต้) · **รวม blocklist 60 คำ**
    - ⛔ **ห้ามใส่ 'ฤกษ์' · 'ขอพร' · 'แฟนคลับ'** — ประเมินแล้วไปโดนข่าวงานบุญ/ยกเสาเอก/เปิดอาคาร และข่าวการเมือง ซึ่งเป็นคอนเทนต์ที่ใช้ได้จริง
    - verify: ยิงกับข่าวจริง 60 ชิ้น → กรองออก 1 ชิ้นและเป็นสแปมพนันจริง ไม่มีข่าวดีโดนผิด · เทสอีก 12 เคส (6 ต้องผ่าน / 6 ต้องกรอง) ผ่านหมด
  - **(2) blocklist ฟุตบอลกรองไม่อยู่** — โพสต์เพจสโมสรไม่มีคำว่า "ฟุตบอล/เอฟซี" เลย ("ทีมบุรีรัมย์ ยูไนเต็ด เดินทางถึง ราชบุรี สเตเดียม") → เติม บุรีรัมย์/ยูไนเต็ด/สเตเดียม/ไฮไลต์/ลูกยิง/พรีซีซ/Pre-Season ตัดได้ 11 จาก 37 (30%)
- **verify:** timezone ผ่านทุกเคสภายใต้ `TZ=UTC` (8:30 ไทย → slot `-08` · เที่ยงคืน → null) · e2e ด้วย fake Discord client 6 เคสผ่านหมด: ห้องแชทส่ง 10/36 · **เธรดหลับ → เรียก `setArchived(false)` ก่อน `send` จริง** · Forum เปิดกระทู้ **1 ครั้ง/รอบ** ไม่ใช่ต่อ embed · **2 feed คำค้นเดียวกันได้ข่าวครบทั้งคู่ (37/37)** · รันซ้ำได้ 0 · embed 3,872 ตัวอักษร ไม่ทะลุ 4096
- ⏭️ **ก่อนใช้: `node deploy-commands.js`** แล้ว `/panel news channel:#ห้อง` → กดปุ่ม "🔄 ดึงเดี๋ยวนี้"
- ⏭️ prod: รันบล็อก newsWatch ใน `migration.sql` (additive) + restart บอท
- ⚠️ **ยังไม่เคยส่งข้อความเข้าห้อง Discord จริงสักครั้ง** — เทสผ่าน fake client ล้วน · สิ่งที่ยังไม่พิสูจน์: หน้าตา embed จริง · สิทธิ์บอทในห้อง · ปุ่มบน panel
- ⚠️ **ยุบข่าวซ้ำจงใจตั้ง threshold สูง (0.35) = ยุบไม่ครบ** เห็นข่าวเดียวกัน 2 บรรทัดได้ · เหตุผล+ตัวเลขที่วัดมาอยู่ในคอมเมนต์ `services/newsWatch.js` — อย่าลดเกณฑ์โดยไม่อ่านก่อน
- **หยุดห้องไหนก็ได้:** `/panel news channel:#ห้อง stop:true` (เพิ่ม 2026-08-12) · ไม่ลบแถวใน `news_watch_seen` ทิ้ง เพราะเปิดใหม่ทีหลังจะได้ไม่ยิงข่าวเก่าซ้ำรวด — แถวเก่าหลุดเองด้วย prune 30 วัน · panel เดิมค้างในห้อง ลบเองได้ (กดปุ่มแล้วจะตอบว่ายังไม่ได้ตั้งค่า)
- ⬜ ถ้าใช้แล้วเวิร์ก ค่อยต่อเข้า `/posts` ตามไอเดียข้างล่าง · ถ้าไม่เวิร์ก ลบทิ้งได้ทั้งก้อน ไม่มีอะไรผูกกับของเดิม

**ไอเดียรูปร่าง — วงจรปิดในระบบ posts:** ข่าวเข้า → การ์ดไอเดียในหน้า `/posts` (ต่อยอด "กล่องไอเดีย" ที่มีอยู่แล้ว) → กด "เขียนจากอันนี้" เด้งไปหน้าเขียนพร้อมลิงก์ต้นทาง + ให้ AI ร่าง outline → โพสต์ออก → ตัวเลขวิ่งกลับมาบอกว่าเวิร์กไหม

**ก่อนลงมือ:** `/scrutinize` ตามกฎโปรเจกต์ · ยังไม่เคาะ: เก็บ feed ลง DB หรืออ่านสด · ตั้งคีย์เวิร์ดต่อ org หรือต่อ user · ถี่แค่ไหน (cron) · insights ต้องขอ scope Meta เพิ่มไหม (`read_insights`)

---

## 🔐 ไม่ล็อกอินแล้วเจอ 404 — แก้แล้ว local 2026-08-08 (ยังไม่ deploy)

`requireFeature()` เดิม `notFound()` ทั้งเคส "ไม่มี session" และ "org ปิดฟีเจอร์" → เปิด `/posts/55` ตอนไม่ล็อกอินเจอ 404 ลอยๆ
แก้เป็น: ไม่มี session → `redirectToLogin()` (`lib/auth.js` — พาไป `/?callbackUrl=<path เดิม>`) · org ปิดฟีเจอร์ → 404 เหมือนเดิม
เพิ่ม **`web/middleware.js`** (ไฟล์ middleware ตัวแรกของโปรเจกต์) ยิง header `x-pathname` เพราะ App Router ไม่มี API ให้ server component รู้ pathname ตัวเอง

**⬜ เหลือ:**
- [ ] **deploy prod** — กระทบทุกโซน (`posts`/`finance`/`calling`/`docs`/`case`) · prod ตอนนี้ยัง 404 อยู่ · middleware ตัวใหม่ต้องมาพร้อม build
- [ ] เทสในเบราว์เซอร์จริง: ล็อกอินเสร็จเด้งกลับหน้าเดิมจริงไหมทั้ง 4 provider (ตอนนี้ verify ด้วย `curl` เห็นแค่ 307 + callbackUrl)

---

## 📱 SOCIAL ACCOUNTS org-native (Phase 0 ของ posts) — เสร็จ local 2026-07-29

`dc_social_accounts` = ตารางสุดท้ายในท่อ publish ที่ยัง guild-based · rebuild ใส่ `org_id` + `owner_user_id` แล้ว
รายละเอียด/กติกา + สิ่งที่ตั้งใจไม่แตะ อยู่ `md/posts/POSTS.md` §Phase 0

**⬜ เหลือ:**
- [ ] **deploy prod** — `migration.sql` (idempotent แต่ rebuild ตาราง → ทำตอนบอทไม่ได้เขียน) + build เว็บ + smoke ตะกร้าสื่อในบอทของจริง
- [ ] **เทสในเบราว์เซอร์** — `/org/settings/social` ตอนนี้โชว์บัญชี public ทั้งองค์กร (3 guild รวมกัน) ยังไม่ได้ดูด้วยตา ว่าอ่านออกไหมว่าอันไหนของแบรนด์ไหน (มีแต่ `group_name` เป็นตัวแยก)
- [x] ~~**app creds ยังเป็นราย guild**~~ → **ย้ายขึ้น `org_config` แล้ว 2026-07-29** · 4 คีย์ (`meta_app_id`/`meta_app_secret`/`x_consumer_key`/`x_consumer_secret`) อ่าน org ก่อน fallback guild · helper กลาง `web/lib/socialAppCreds.js` (เว็บ) + `getGuildMetaApp(guildId, orgId)` / `getGuildXApp(guildId, orgId)` (บอท) · หน้า `/org/settings/social` เขียนลง org
  - [ ] เหลือ: ลบแถวเดิม 8 แถวใน `dc_guild_config` (fallback ช่วงเปลี่ยนผ่าน) + เอาโค้ด fallback ออก — ทำรอบหน้าเมื่อ prod ย้ายครบ
- [ ] `/bot/*` ยังบล็อก org ที่ไม่มี guild ทั้งโซน → หน้าจัดการบัญชีโซเชียลควรย้ายออกจาก `/bot/` วันที่ posts มีหน้าของตัวเอง

**📊 เพดานจำนวนบัญชีต่อ app creds ชุดเดียว (ถามกัน 2026-08-10 · user เคาะ "ยังไม่เกิด ใช้ไปก่อน")**
- FB Page / IG / Threads = **ไม่มีเพดานจำนวนบัญชี** — rate limit ของ Meta เป็น per-asset (เพจละถัง) ไม่ใช่ per-app → app id เดียวแบก 70 เพจได้
- **X = มีเพดานจริง** — โควต้าโพสต์เป็น **per-app รายเดือน** (Free 500/เดือน · Basic 3,000/เดือน) ทุกบัญชีในองค์กรกินถังเดียวกัน → @1 โพสต์/วัน ได้ ~16 บัญชี (Free) / ~100 บัญชี (Basic) · เสี่ยง noisy neighbor: บัญชีเดียวยิงเพลิน = ทั้ง org โพสต์ไม่ได้จนขึ้นเดือนใหม่
- ✅ **แก้แล้ว local 2026-08-10 — เพจเกิน 25 หายเงียบ** · เดิม `/me/accounts` ไม่ paginate (Graph API default `limit=25`) · **เพดานนับที่ "คนที่กด Connect" ไม่ใช่ที่ org** → แอดมินกลางของพรรคที่ถือเพจรายจังหวัดครบทุกจังหวัดจะต่อได้แค่ 25 เพจแรก โดยไม่มี error ให้เห็น
  - เติม `fbGetAll()` / `getAll()` (วน `paging.next`, cap 20 หน้า) + `limit=100` ทั้ง 2 ที่: `web/app/api/meta/oauth/callback/route.js` · `scripts/social/meta-setup.js` — **แก้คู่กันเสมอ ทั้งคู่เรียก edge เดียวกัน**
  - build เว็บผ่าน + `node --check` script ผ่าน · ⬜ ยังไม่ได้เทสกับบัญชีที่ถือเกิน 25 เพจจริง
- ทางออกวันที่ org ไหนใหญ่ผิดปกติ: ให้ org นั้นใช้ app id ของตัวเอง — รองรับอยู่แล้ว creds เป็น org-scoped ไม่ได้ hardcode ใน env

**⚠️ บัญชี private (ส่วนตัวของอาสา) ใช้ app creds ขององค์กรร่วมกัน — creds ไม่มีมิติ "ผู้ใช้" เลย**
`getMetaApp({ orgId, guildId })` / `getXApp({ orgId, guildId })` ที่ `web/app/api/meta/oauth/start/route.js` + `web/app/api/x/oauth/start/route.js` ไม่รับ user
`visibility` มีผลแค่ **ใครเป็นเจ้าของแถว** (`owner_user_id`) กับ **ใครมีสิทธิ์กด Connect** ไม่ได้เปลี่ยนว่าใช้ app ไหน

- 🔴 **X = noisy neighbor ตัวจริงอยู่ตรงนี้ ไม่ใช่เพจจังหวัด** — บัญชีส่วนตัวโพสต์บ่อยกว่าบัญชีทางการมาก แต่กินโควต้าเดือนก้อนเดียวกัน · Free 500/เดือน = อาสาไม่กี่คนก็หมด แล้ว **บัญชีทางการโพสต์ไม่ได้ด้วย** จนขึ้นเดือนใหม่ · เกิดง่ายกว่าทุกเคสในบล็อกนี้
- Meta ไม่มีปัญหาโควต้า (แยกรายเพจ) แต่ผูกติด: token ส่วนตัวเก็บใน DB องค์กร + วันที่ org เปลี่ยน app id บัญชีส่วนตัวต้อง re-auth ตามไปด้วย
- (บน Meta "ส่วนตัว" = เพจ/IG ส่วนตัว ไม่ใช่โปรไฟล์ FB — Meta ปิด API โพสต์ลงโปรไฟล์นานแล้ว)

**⬜ ทางแก้ที่ยังไม่ทำ (user เคาะ 2026-08-10 ว่ายังไม่ต้องทำ แค่จดไว้):**
- [ ] **cap โพสต์ต่อบัญชี private ต่อเดือน** ← ทางที่สมจริงสุด กันคนเดียวดูดโควต้าหมด
- [ ] creds คนละชุดสำหรับ private — เติมที่ `getSocialAppCreds()` ที่เดียวจบ (ตะเข็บเดียวกับ group-level override) แต่ไม่สมจริง ไม่มีอาสาคนไหนอยากไปจด X app เอง

---

## 📮 CASES — รอบ 2026-07-28
> รายละเอียด/ประวัติย้ายไป `md/case/CASE.md` แล้ว — ที่เหลือคืองานค้าง
**⬜ เหลือ:**
- [ ] **เทสในเบราว์เซอร์** — กดปุ่มแก้ไขจริง + กด refresh timeline บนเคสที่มีเธรด Discord จริง (ที่ verify ไปคือ production build ผ่าน + code review เท่านั้น)
- [ ] **"โอนเคสข้ามจังหวัด"** เป็น action แยก (admin-only, เช็ค scope ทั้งต้นทาง+ปลายทาง, ลง timeline) — ถ้ามีเคสจัดจังหวัดผิดจริง
- [ ] cron auto-sync timeline (อยู่ใน V2 ของ CASE.md เดิมอยู่แล้ว) — ตอนนี้ sync ด้วยปุ่มกดมือเท่านั้น ไม่มีใครกด = timeline ค้าง
- [ ] ข้อความที่ถูก **edit ทีหลัง** ใน Discord ไม่มีทางเข้าระบบ (`?after=` ดูแต่ ID ใหม่) — รู้ไว้เฉยๆ ยังไม่มีแผนแก้
- [ ] **extract shared `<Lightbox>` component** — `CaseAttachmentGallery.jsx` (ใหม่, 2026-07-31) เป็น lightbox ที่ 4 ที่เขียนแยกกัน ซ้ำกับ `CookingClient.jsx`, `PostMediaPanel.jsx`, `DocProjectView.jsx` (state + ESC + click-outside + ปุ่ม X เกือบเหมือนกันทุกตัว, ต่างแค่ single-image vs multi-image+nav) — ยังไม่มี shared component ใดๆ ตอนนี้ ควรดึงออกมาเป็น `components/Lightbox.jsx` แล้วแทนที่ทั้ง 4 จุด

---

## 🏷️ Rename โปรเจกต์ → platfor.org (เตรียมรางเสร็จ 2026-07-28 · **ยังไม่จดโดเมน**)

> ชื่อเคาะแล้ว: **display = `PLATFOR{m}.ORG`** · **domain = `platfor.org`** (ยังไม่จด — ตอนนี้ยังใช้ `pplevolunteers.org` ทั้งระบบ)
> ✅ commit `278a3a2` วางรางไว้แล้ว: ชื่อ/โดเมนอ่านจากที่เดียว ไม่มี hardcode กระจายอีก

**วันเปลี่ยนจริง — แก้แค่ 2 บรรทัดนี้ก่อน:**
1. `config/brand.js` → `BRAND_DOMAIN: 'platfor.org'`  (`BRAND_NAME` เป็น `PLATFOR{m}.ORG` อยู่แล้ว)
2. `.env` → `NEXTAUTH_URL=https://platfor.org`
   → ตกถึง `web/lib/baseUrl.js` → OAuth redirect_uri ทุกเจ้า + passkey RP_ID + title/footer ทั้งหมดอัตโนมัติ

**แล้วตามด้วยของนอกโค้ด (ลืมไม่ได้):**
- [ ] จดโดเมน + DNS + nginx `server_name` + SSL cert · เสิร์ฟโดเมนเก่า 301 ไปใหม่ไว้ก่อน
- [ ] **`dc_guild_config` key `web_base_url`** — อยู่ใน DB ราย guild ไม่ใช่ .env (บอทใช้ทำลิงก์ใน SMS/Discord) → `UPDATE` ให้ครบทุก guild
- [ ] **redirect URI ในคอนโซลข้างนอกทุกเจ้า:** Discord OAuth · Google · LINE · Meta · X
- [ ] ⚠️ **passkey จะพังทั้งหมด** — `RP_ID` ผูก hostname → passkey ที่ลงทะเบียนไว้ใช้ไม่ได้ · **ยังไม่เคาะ**ว่าจะ pin `PASSKEY_RP_ID=pplevolunteers.org` (ต้องเสิร์ฟโดเมนเก่าตลอด) หรือให้ลงทะเบียนใหม่ (เช็คก่อนว่ามีกี่คน)

**เปลี่ยนชื่อ database ด้วยไหม (จดไว้ 2026-08-17):** ชื่อ DB จริงตอนนี้ยังเป็น `pple_volunteers` — user เอ่ยว่าเปลี่ยน domain ทีคงต้องเปลี่ยนทุกอย่างพร้อมกัน ให้พิจารณา rename DB ตามไปด้วยรอบเดียวกัน (`ALTER DATABASE pple_volunteers RENAME TO ...` + อัปเดต `DB_NAME`/`DATABASE_URL` ใน `.env` + restart bot/web) — ยังไม่เคาะชื่อใหม่
→ pg_dump script ใน aaPanel Cron (Shell script content, ไม่มีไฟล์แยกในโปรเจกต์) ดึง `DB_NAME` จาก `.env` เองแล้ว แก้ `.env` ที่เดียวพอ ไม่ต้องแก้ cron content

**Rename folder / repo (แยกจากโดเมน ทำคนละวันได้):**
- [ ] local `~/VSites/node/pple-volunteers` → `platfor.org` (พาไปด้วย: Claude memory dir, VSCode workspace, `.claude/settings.local.json`)
- [ ] prod `/www/wwwroot/pple-volunteers` → `deploy.sh:44` เป็นบรรทัดเดียวที่รันจริง · อีก ~12 ไฟล์ใน `scripts/` เป็น comment วิธีรัน
- [ ] GitHub repo `numthang/pplevolunteers-bot` → rename (GitHub redirect ให้อยู่แล้ว ไม่พังทันที)
- [ ] 🔒 **git remote มี GitHub PAT plain text** (`ghp_...` ใน origin URL) → revoke + ออกใหม่ตอน rename repo
- [ ] pm2 `pple-dcbot` / `pple-web` — จะเปลี่ยนก็ได้ ไม่ผูกอะไร
- [ ] docs `md/*.md` + `CLAUDE.md` (~10 ไฟล์) — งาน mechanical ล้วน โยน subagent ได้

**เคาะแล้วว่า “ไม่แตะ”:** DB `pple_volunteers` + user `pple_dcbot` (ต้องแก้ .env+scripts ทุกที่ ได้แค่ความสวย เสี่ยง downtime) · `.wolf/memory.md` (log ประวัติ) · `web/app/tee/portfolio/` (อ้างระบบเดิมถูกแล้ว) · `.claude/settings.local.json` (แค่ allowlist)
**ทำก็ได้ไม่ทำก็ได้:** User-Agent 3 จุด (`CaseNewForm.jsx`, `LocationButton.jsx`, `sync-act-events.js`)

---

## 🌐 platformfor.org / CivicFlow — identity/tenant migration
> รายละเอียด/ประวัติย้ายไป `md/civicflow/CIVICFLOW.md` แล้ว — ที่เหลือคืองานค้าง
- [x] **B — grant ยศคน Discord ผ่านเว็บ (2026-07-16, commit 6d534fb)** — หน้า `/admin/roles` (ค้นสมาชิก → chip ยศ toggle) → สั่ง Discord เพิ่ม/ถอดยศจริง (`lib/discordRoles.js` PUT/DELETE) + write-through `dc_members.roles` + `clearAccessCache` + audit · gate `manageRoles`=admin/moderator (permissions.js) · grantable = 9 role (ยกเว้น admin) · **Discord = one source, เว็บเป็นรีโมท** (ตอบโจทย์ "แก้ที่ไหนก็ตรงกันทั้ง Discord+web") · verify curl 403/200 + jest 189 ผ่าน · ⬜ ยังไม่กดเทสจริงในเบราว์เซอร์ (แตะ Discord side-effect)
- [ ] **⭐ migrate `dc_members.roles` (Discord CSV ชื่อ) → `web_roles` (key)** (user สั่งจด 2026-07-16) — แปลชื่อ Discord → permission key ผ่าน catalog `dc_guild_roles` เขียนลง web_roles → เป้าหมาย **web_roles = แหล่งรวม key ของทุกคน (Discord+email) ที่เดียว** · ⚠️ **decision คู่กัน:** ถ้าจะให้ web_roles เป็น source เดียวจริง ต้องให้ **Discord sync เขียน web_roles ด้วย** (แปล name→key ตอน sync ใน `db/members.js`) + resolveAccess อ่าน web_roles → ไม่งั้น `roles`(name) กับ `web_roles`(key) diverge ทุก sync (sync ทับ `roles` แต่ไม่ทับ `web_roles`)
- [ ] **④ contract (เหลืออันเดียว)** — `DROP TABLE _dc_members` (7,298 แถว) + คอลัมน์ที่ไม่ใช้ · **ทำหลัง cutover ขึ้น prod แล้วนิ่ง** · ⚠️ `_dc_members` เป็น safety net จริง (2026-07-21 เคยใช้กู้ `member_id` ที่ถูกล้าง) — อย่าเพิ่งรีบลบ
  - ⬜ ยังไม่ได้ trigger email/SMS/OCR จริง (verify ผ่าน SQL simulate เท่านั้น — ต้องเทสตอน deploy) · db/finance.js = finance_config (guild-based) ไม่ต้องแตะ
> **⬜ เหลือของ docs:**
> **⬜ เหลือของ calling:**
  - ⬜ **ยังไม่กดจริงในเบราว์เซอร์** (tab switch, chip toggle UI, probe แสดง Section B หลัง hydrate)
  - [x] **home org-scope เสร็จ 2026-07-18** (org-core) — `app/page.js` branch org-first (mirror layout.js): resolve `resolveActiveOrg` → `guildsOfOrg`. **guildless org** (MRSJAN org 8) → org-native dashboard: profile (org icon+ชื่อ+email) + FinanceCard (org-scoped อยู่แล้วผ่าน getFINANCESummary/getOrgId) gated ด้วย `getOrgEnabledFeatures` + การ์ดสมาชิกองค์กร (member_count จาก resolveActiveOrg) → `/org/settings/members` + ปุ่มไป `/org/settings` · **ซ่อน** Discord-bot/guild-list + REST-API integrations (PPLE-global) · **guild org (PPLE org 1) คงเดิมทุกอย่าง** (ตกไป guild dashboard เดิม) · guard: Discord user ที่ไม่มี org row → fall-through guild dashboard (ไม่ regress) · email user ไม่มี org → prompt สร้างองค์กร · extract `FinanceCard`/`OrgIcon` component (pure JSX move) · verify: build + curl magic-login MRSJAN→switch org8→home 200 มี members/settings/finance ไม่มี CALLING/REST/Discord-bot leak · ⬜ org 1 guild path ยังไม่ curl-test (ต้อง Discord session — เทสจริงในเบราว์เซอร์) · ⬜ i18n (string ไทย hardcode ตาม convention ไฟล์เดิม)
    - ⬜ follow-up: getRealRoles โหลด web_roles ด้วย userId (เปิด email member ของ guild-backed org) → แล้วค่อย upgrade getGuildId เป็น org-derived
  - ⬜ ยังไม่กดจริงในเบราว์เซอร์ · prod: `public/uploads/org/` route mkdir เอง (nginx `/uploads` block มีแล้ว)
- [ ] เทสจริงในเบราว์เซอร์ (dropdown เปิด/สลับ/สร้าง/ออก) — curl เทส trigger+data แล้ว dropdown เป็น client-only

---

## 🍳 /cooking — UI/UX ปรับปรุง (จดไว้ 2026-07-11) — ✅ เขียนโค้ดเสร็จ + เทสเบราว์เซอร์ผ่านแล้ว (2026-07-14) รอ commit + deploy
> รายละเอียด/ประวัติย้ายไป `md/cooking/COOKING.md` แล้ว — ที่เหลือคืองานค้าง
- [ ] **ตอนแยก personal apps ออกไป domain ตัวเอง → เปลี่ยน image serving เป็น API route** (จดไว้ 2026-07-14) — ตอนนี้ cooking + finance upload เขียนลง `public/uploads/` แล้วเสิร์ฟผ่าน **nginx block** (`location ^~ /uploads/` บน prod — ดู DEPLOYMENT.md) ซึ่งผูกกับ server config · ตอนยกเว็บออก ให้เปลี่ยนไปเสิร์ฟผ่าน **API route อ่าน disk สด** แบบ `media-temp`/`docs`/`case` (route `/api/cooking/media/[filename]` + เปลี่ยน URL ที่ upload คืน + จุดแสดงรูป result card/คลังเมนู/preview) → **self-contained ใน repo, ยกออกไม่ต้อง config nginx, dev=prod เหมือนกัน** · แล้วลบ nginx /uploads block ทิ้งได้ · เหตุผลเลือกตอนนี้ยังใช้ nginx (เร็ว/เบา/ทำเสร็จแล้ว) แต่ตอนแยกออก portability คุ้มกว่า
- [ ] **อนิเมชันตอนกดสุ่มแบบ slot machine จริงจัง** (parked 2026-07-11) — ตอนนี้มี spin ง่ายๆ อยู่แล้ว (`spinning`/`reel` ใน CookingClient สุ่มโชว์ emoji+ชื่อสลับ, decelerate ~2.3s + animation cookslot) → อยากได้แบบสล็อตจริง (รีลหมุนแนวตั้ง, เสียง/สั่นได้)

---

## 📢 Social share → ห้องข่าวสาร + Discord Event — implement เสร็จ local
> รายละเอียด/ประวัติย้ายไป `md/discord/BOT.md` แล้ว — ที่เหลือคืองานค้าง

---

## 📢 ระบบเรื่องร้องเรียน (Case System) — implement เสร็จ local · ดู `md/case/CASE.md`
> รายละเอียด/ประวัติย้ายไป `md/case/CASE.md` แล้ว — ที่เหลือคืองานค้าง
- [ ] **Hamburger — เอา 3 เมนูบนออก** — `menuLinks` ซ้ำกับ app switcher → ซ่อนเมื่ออยู่ home/dashboard
- [ ] **Detect location → link จังหวัด** — หน้า `/case` ปุ่ม "ใช้ตำแหน่งของฉัน" → reverse geocode (Nominatim/OSM) → redirect `/case/new/[จังหวัด]`

---

## 🌐 pplevolunteers.org — Auth & Platform
> รายละเอียด/ประวัติย้ายไป `md/org/AUTH.md` แล้ว — ที่เหลือคืองานค้าง

---

## 🧭 Rebrand / Positioning — feature จากการสำรวจตลาด (จด 2026-07-03)

> กำลังเปลี่ยน positioning: pplevolunteers.org → บริการ bot + web multi-tenant สำหรับองค์กรบน Discord · ชื่อใหม่ยังไม่เคาะ — user ชอบแนว abstract มั่วๆ · **ตัวเต็ง: eegg (eegg.gg ว่าง, verify 2026-07-03)** — ชื่อที่ user เคยมั่วขึ้นมาเองแล้วชอบ + .gg เป็น TLD วัฒนธรรม Discord (~฿3k/ปี, eegg.com โดนจอง) · ตัวสำรอง: Ruampon/Khabuan/OrgGuild (.com ว่าง)
> คู่แข่งในตลาด (CommunityOne, Levellr, Mee6/VibeBot) เน้น engagement + analytics · **ไม่มีใครทำ "ระบบปฏิบัติงานองค์กร"** (สมาชิก/การเงิน/calling/เคส) = จุดขายหลักของเรา · benchmark ราคา $10–80/เดือน/เซิร์ฟเวอร์ต่อ feature เดี่ยว
> ทั้งหมดเป็น backlog — ยังไม่เริ่ม implement

### เคาะแล้ว — grilling session 2026-07-03
1. **โครงแบรนด์:** แบรนด์ใหม่ครอบเป็น parent · pplevolunteers.org คงอยู่เป็น tenant #1 + case study — ไม่ต้อง migrate user เดิม
2. **ลูกค้า 1–2 ปีแรก:** องค์กรภาคประชาชนสาย movement ในไทย (NGO/ภาคประชาสังคม/กลุ่มการเมืองรุ่นใหม่) ขายผ่าน network ที่มี · positioning = "NationBuilder สำหรับองค์กรที่ community อยู่บน Discord" — demand พิสูจน์แล้ว (Amnesty สากลจ่าย NationBuilder $34–160+/เดือน)
3. **รายได้:** solidarity pricing — **พื้น = ต้นทุนแปรผันของ tenant (SMS/AI/server) ต้องจ่ายเสมอ ห้ามเป็น donation** · เหนือพื้น = ค่าสนับสนุนตามกำลังองค์กร (ขั้นบันได) · mission-first: เป้า break-even + รายได้เสริม ยอมควักบ้าง · มอง grant สาย civic tech เสริม
4. **Bot identity:** bot กลางตัวเดียว สถาปัตยกรรมเดิม — nickname per server ที่แอดมินเปลี่ยนเองได้ครอบความต้องการ white-label ~80% แล้ว · custom avatar/token = premium คุยทีหลัง ไม่ refactor ตอนนี้
5. **Tenant web:** domain กลางเดียว + custom domain map ให้เฉพาะเจ้าที่ขอ (รายเจ้า ไม่ทำ self-serve)
6. **Customize:** โค้ดเดียวทุก tenant — ฟีเจอร์ที่ลูกค้าจ้างต้อง generalize เข้า core เป็น config/toggle (แบบ verify_phone) · generalize ไม่ได้ = ปฏิเสธ · ห้าม fork/branch ต่อ tenant
7. **การเมือง:** แบรนด์ platform เป็นกลาง — ชื่อ/สีไม่ผูกพรรค · ส้ม #ff6a13 เป็นสีของ tenant อาสาประชาชน ไม่ใช่สี platform → ต้องทำ palette ใหม่ตอน landing
8. **นิติบุคคล:** รับเงินแบบบุคคลธรรมดา (องค์กรหัก ณ ที่จ่ายได้) · จด หจก./บจก. เมื่อมีลูกค้า recurring 2–3 ราย หรือจะขอ grant
9. **ชื่อ:** ไม่จำกัดภาษา ขอแค่เข้าตัวตน + เป็นกลางทางการเมือง (ข้อ 7 ทำให้ "Khabuan" ต้องชั่งอีกที — สื่อ movement แรง · "Ruampon" กลางกว่า) · user คิดต่อเอง ใช้เวลาได้

### ชื่อ — ยังไม่เคาะ (user ขอคิดนานๆ เอาดีที่สุด · อัปเดต 2026-07-03)

**เงื่อนไข domain ที่ user ยอมรับ: .com / .xyz / .app / .org** (เท .co ไม่ชอบ, .gg/.ai แพง, .us จดไม่ได้)

**แคนดิเดตปัจจุบัน (เรียงตามน้ำหนัก):**
- **Numthang (นำทาง) — user เอนเอียงมาทางนี้ ("อวตารใหม่ก็ numthang.xyz ไปเลย")** · numthang.com + .app + .xyz ว่าง (เช็ค 2026-07-03) · ชื่อสวน/ชื่อลูกสาว user · ความหมายปิด metaphor: LINE=ถนน Discord=บ้าน นำทาง=พาสมาชิกเข้าบ้าน · **numthang.org — user เคยจดเอง (ตั้งแต่ 2006?) ตอนนี้อยู่ autoRenewPeriod หลังหมดอายุ 2026-05-27 ที่ Namecheap → ถ้าจะกู้คืนต้องรีบก่อนเข้า redemption (ค่าไถ่แพง)** · ข้อชั่ง: ใจ user เรื่องชื่อลูก (เบา: คำสามัญ · หนัก: ถ้าขายกิจการ/ดราม่า) · ถ้าเคาะ → จด .xyz + .com คู่กันกันโดนตัดหน้า
- **punkan.com ว่าง** — "ปันกัน" ล้อ solidarity pricing · ฝรั่งอาจอ่าน punk-an
- **eegg** — ชื่อที่ user รัก แต่ domain ตัน (.com/.xyz/.app โดนจองหมด)
- .app ว่างเผื่อเลือก: jipjip.app, pukpik.app, jubjai.app, hatchoo.app
- สำรอง .com: ruampon, khabuan, orgguild
- **eegg** — ชื่อที่ user มั่วขึ้นเอง · domain ตัน: .com/.org/.net/.app/.dev/.xyz โดนจอง · .co ว่างแต่ user ไม่ชอบ · .gg/.ai ว่างแต่แพง · .us จดไม่ได้ (เช็ค 2026-07-03)
- **Brand story ชั้นหลัก (ใช้สื่อสารจริง):** ไข่ = community ที่รอฟัก — องค์กรมีคนอยู่แล้วแต่ยังไม่เป็น community ที่มีชีวิต, eegg คือตู้ฟัก · tagline: **"where communities hatch"** / "ที่ที่ community ฟักตัว"
- **ลูกเล่นเก็บไว้ตอน pitch (อย่าเล่าพร้อมกันหมด):** (1) ตัวอักษรไม่อยู่เดี่ยว — e คู่ e, g คู่ g = ไม่มีใครทำงานองค์กรคนเดียว · (2) backronym: Engage · Empower · Gather · Grow หรือสายเล่น "Every Egg Grows a Guild" · (3) logo = รูปไข่ วงรีเดียว friendly, ไข่ฟักออกเป็น community ใช้เล่า onboarding ได้ทั้ง deck
- [ ] จด domain ทันทีที่เคาะชื่อ (Namecheap/Porkbun) — กันโดนตัดหน้า · brand story "ฟักไข่/hatch" ด้านบนใช้ได้กับ eegg เท่านั้น ถ้าเปลี่ยนชื่อต้องเล่าใหม่

### Next actions (หลังได้ชื่อ)
- [ ] จด domain + ทำ palette กลางของ platform
- [ ] Landing page แบรนด์ใหม่ (static แยกจาก app ได้) + pricing sheet แบบ solidarity tiers
- [ ] ตั้งราคาจริงกับ Amnesty เป็นเคสแรกของโมเดลรายได้

### Roadmap feature เรียงตามความคุ้ม:
1. [ ] **Analytics dashboard ต่อ guild** — active members, retention, "อาสาคนไหนกำลังจะหลุด" · ต่อยอดจาก activity tracker (`utils/`) ที่มีอยู่ · เป็น feature ชูโรงที่ตลาดขายกัน
2. [ ] **RAG AI → "AI ตอบคำถามองค์กร"** — ขายเป็น feature แบบ Spark ของ CommunityOne · โครงมีแล้ว (RAG section ด้านล่าง) + เพิ่ม report "คำถามที่ตอบไม่ได้" ให้แอดมิน
3. [ ] **Gamification สำหรับอาสา/สมาชิก** — คะแนนกิจกรรม, badge, leaderboard · เชื่อมข้อมูลกิจกรรมที่เก็บอยู่แล้ว · เข้ากับ volunteer org กว่า gaming
4. [ ] **ค่าสมาชิก/เงินบริจาคผ่านระบบ** — เชื่อม Finance ที่มีกับ membership dues · องค์กรไทยต้องการมาก ไม่มี bot ไหนทำ · เกี่ยวพัน section Donation ด้านล่าง
5. [ ] **Insight summary ให้ผู้บริหาร** — AI สรุปรายสัปดาห์ "สมาชิกพูดเรื่องอะไร อารมณ์เป็นยังไง" แบบ Levellr · ทำทีหลังได้ ใช้ AI infra เดิม

---

## 🌍 i18n — เว็บ + bot รองรับหลายภาษา
> รายละเอียด/ประวัติย้ายไป `md/WEB.md` แล้ว — ที่เหลือคืองานค้าง
- [ ] Migrate โซนที่เหลือ: **docs, bot pages (`web/app/bot/**`)** + shared components (finance: BankBadge/CategorySelect/AccountSelect; root: LoginPanel/NoGuildNotice ฯลฯ) + **bot จริง (`services/i18n.js`, discord.js embed/handler)** — ใช้ i18n-migrator agent ซอยทีละ 2-3 ไฟล์
- [ ] เว็บ fallback เป็น locale ของ guild ก่อนถึง default (ตอนนี้ cookie → th)
- [ ] คำสั่ง/หน้า config ตั้ง locale ต่อ guild
- [ ] แปล en จริง (ตอนนี้มีแค่ skeleton `common.*`)

---

## 📝 Custom Register Form — dynamic per-guild (design เคาะ 2026-07-03)

> แต่ละองค์กรต้องการข้อมูลแนะนำตัวคนละแบบ → ทำ register modal ที่ config field เองได้ต่อ guild โดยไม่แตะโค้ด · เป็น **จังหวะ 2** ของ [Member Onboarding](#-member-onboarding--verify_phone-เคาะ-2026-07-03) — `verify_phone` toggle (จังหวะ 1) ถูกดูดเข้ามาเป็น field type ที่นี่

### แนวคิดหลัก — แยก "นิยามฟอร์ม" ออกจาก "การ render"
ฟอร์ม = ลิสต์ field (นิยาม) · เวลาแสดงผล renderer **แยกตามชนิด field**:

| type | render เป็น | โควตา |
|---|---|---|
| `short` / `paragraph` | รวมลง Discord modal เดียว | ≤ 5 ช่อง (ลิมิต Discord) |
| `verified_phone` | OTP flow (ปุ่ม→modal เบอร์→ปุ่ม→modal OTP) | ไม่กิน slot modal (สเต็ปแยก) |
| `choice` | select menu | ผูก picker เดิม (`dc_guild_roles`) |

- field ทุกชนิดอยู่ในนิยามเดียวกัน แต่ render คนละกลไก → **verified_phone ไม่แย่งช่อง modal** (เหมือน choice ที่แยกเป็น dropdown อยู่แล้ว)
- `verified_phone` ต้องแยกเพราะ OTP async (หยุดรอ SMS) — modal รอไม่ได้ · จุดจุดชนวน: หลัง save text modal เสร็จ bot ไล่เจอ field ชนิดนี้ → เข้า OTP flow
- ลำดับ verify ก่อน/หลัง = `sort_order` ใน DB (ไม่แตะโค้ด)

### Discord constraints ที่กำหนดดีไซน์
- modal ≤ 5 text input · **text อย่างเดียว** (ไม่มี dropdown/date/checkbox ใน modal → choice ต้องแยกเป็น select เสมอ)
- modal เปิดต่อจาก modal submit ไม่ได้ → ต้องมีปุ่มคั่น (เกิน 5 ช่อง = modal 2 หน้า คั่นด้วยปุ่ม)

### Storage — ใช้ `dc_guild_config` ไม่ต้องมี table ใหม่
**นิยามฟอร์ม** เก็บเป็น json array ใน `dc_guild_config` key `register_form_fields` (reuse `getSetting`/`setSetting` เหมือน `enabled_features` / `config_register`):
```json
[
  { "field_key":"nickname", "label":"ชื่อ-นามสกุล", "type":"short",          "required":true, "maps_to":"nickname" },
  { "field_key":"chapter",  "label":"สาขา",         "type":"short",          "required":true, "maps_to":null     },
  { "field_key":"phone",    "label":"เบอร์",         "type":"verified_phone", "required":true, "maps_to":"phone"  }
]
```
- **ทำไมไม่ใช่ table:** ฟอร์มโหลดทั้งชุดเสมอเพื่อ render + admin save ทั้งชุดทีเดียว (overwrite array) + ไม่เคย query/join/filter ข้าม guild + ไม่มี FK เข้ามา → JSON blob ชนะ table (≠ `dc_guild_roles` ที่ต้อง lookup รายแถว + sync รายตัว)
- ลำดับ = ตำแหน่งใน array (เรียงใหม่ = เขียน array ใหม่)

**ค่าที่กรอก** (คนละเรื่องกับนิยาม) → `dc_members` column ตาม `maps_to` · field ที่ไม่มี column → `dc_members.extra JSONB` เก็บที่ `extra->>'field_key'`
- **JSONB ไม่ใช่ EAV:** PG query/filter/index ได้ (`WHERE extra->>'chapter' = 'กทม'` + expression index) → ยืดหยุ่น**และ**ค้นได้ · field ที่ common → เลื่อนเป็น native column ทีหลัง

### งานที่ต้องทำ
- migration: เพิ่ม `dc_members.extra JSONB` อย่างเดียว (นิยามฟอร์มไม่ต้อง migration — อยู่ใน config)
- backoffice `/bot/forms` — admin เพิ่ม/ลบ/เรียง field + เลือก type → save เป็น json ลง `register_form_fields` · seed 5 ช่องเดิมของอาสาประชาชนเป็น default (backward-compatible)
- `handlers/registerHandler.js` — สร้าง modal สดจาก `getSetting(guildId,'register_form_fields')` (เดิม hardcode 5 field) + dispatch ตาม type ตอน submit
- **north star:** ฟอร์ม 1 นิยามครอบทุกชนิด field · เพิ่ม type ใหม่ (เช่น `verified_email`) = เพิ่ม case ใน renderer ไม่ต้องทำปุ่มแยก

### maps_to — ยังไม่เคาะ
- admin เลือกเองว่า field ไหน map column ไหน **หรือ** fix (common → column, ที่เหลือ → extra อัตโนมัติ) — ตัดสินตอน implement

---

## 🔐 RBAC / Multi-guild — เหลืองานค้าง

> RBAC step 1–12 เสร็จ + deploy prod แล้ว (v2.13.0) — bot + web อ่าน role จาก DB ทั้งหมด ไม่มี hardcode policy · **รายละเอียด design เต็ม + feature matrix ดูได้จาก git history: `git show bbc8291:SPEC.md`**

### ยังไม่ทำ
- **Dynamic picker groups** — สร้างกลุ่ม picker เองได้ (schema เผื่อ `kind` ไว้แล้ว ไม่ต้องรื้อ)
- **Security gate (ยังไม่เร่ง เพราะยังไม่เปิดใช้จริง):**
  - `POST /api/calling/logs` ไม่เช็ค role · `GET /api/calling/stats`,`logs` ไม่ filter scope
  - `getEffectiveIdentity` fallback ใช้ JWT เก่าเมื่อ user ไม่อยู่ guild
  - JWT `maxAge` 90 วัน → stale roles · หลาย route ใช้ `session.user.roles` (JWT) แทน `getEffectiveRoles` (DB-fresh)
- **edge case guild-mismatch cookie (defer)** — user ที่ไม่ได้เป็น member ของ guild default แต่เป็น guild อื่น → ไม่มี cookie → `getGuildId` คืน default → Nav mismatch · RBAC กันข้อมูลอยู่ (`isMember=false`) · แก้ที่ดีต้อง middleware/cookie-on-login — ทำตอนเปิด guild ที่ 2 จริง
- **(optional) `dc_members.role_ids` ขนาน `roles`** — แก้ปัญหา rename role แล้วสิทธิ์หายชั่วคราว (web match ด้วยชื่อ) · เพิ่ม column `role_ids` (id ทน rename) ใช้เช็ค permission · ยังไม่จำเป็น จดเผื่อเจอ bug

### 🎯 เป้าหมาย: ใช้งานได้โดยไม่ต้องมี Discord (เคาะ 2026-07-21)

> **Discord = ส่วนเสริม ถ้ามีก็ดี ไม่มีก็ใช้ได้** — เป็นเป้าหมายที่ user ยืนยัน · ระบบ docs อาจเป็นตัวแรกที่ออกแบบใหม่ให้รองรับ org ที่ยังไม่มี Discord

**สภาพวันนี้ — ประตู email เปิดได้แค่ login ส่วนที่เหลือยังผูก Discord + PPLE ทั้งก้อน** (ยืนยันจากโค้ดจริง 2026-07-21):

1. **`scopeGrants` (พื้นที่) มาจากยศ Discord ทางเดียว** — `resolveAccess()` อ่าน `scope_node` จาก `dc_guild_roles` เท่านั้น · `web_roles` เติมแค่ permission ไม่เติม scope ([resolveAccess.js:79](../web/lib/resolveAccess.js#L79)) · คน email (`guild_id` NULL) → query `WHERE guild_id = NULL` → 0 แถว → **scope ว่างเสมอ**
   - ผลจริงต่อแอพ: calling = เด้ง `noAccess` เห็นศูนย์ · cases = ไม่เห็นเคสไหนเลย (ทุกเคสมีจังหวัด) · docs/finance = เห็นเฉพาะระดับประเทศที่ไม่ผูกจังหวัด · ยกเว้นได้ `admin`/`secretary_general` ที่ข้ามเรื่องพื้นที่
2. **คำศัพท์ "พื้นที่" เป็นของ PPLE เอง** — [web/lib/geography.js](../web/lib/geography.js) hardcode จังหวัด→ภาค 77 จังหวัด โดยชื่อภาคคือ**ชื่อ role ทีม Discord ของ PPLE** (`'ราชบุรี' → 'ทีมภาคกลางตะวันตก'`) · ในไฟล์เขียนกำกับเองว่า *"ชุดข้อมูลนี้คือของ guild อาสาประชาชน — multi-guild geography เป็นงานทำต่อ"* · org อื่นอาจแบ่งเป็นเขต/สาขา/ทีม ไม่ใช่จังหวัดไทยด้วยซ้ำ

**สิ่งที่ต้องมีก่อน (ยังไม่ออกแบบ — เป็นงานก้อนใหม่ ไม่ใช่แก้ของเดิม):** ให้ org **นิยาม "พื้นที่" ของตัวเองได้** แล้วผูกกับยศผ่านเว็บ

**ข่าวดีเชิงโครงสร้าง:** 4 แอพ (finance/calling/docs/cases) ไม่รู้จัก Discord เลย — มันกินแค่ `{ permissions, scopeGrants }` ที่ `resolveAccess` คืนมา · **ปลด Discord = เติม "แหล่งที่ 2" ที่ผลิตรูปร่างเดียวกัน ไม่ต้องรื้อ 4 แอพ** · `resolveAccess()` คือตะเข็บที่ควรลงมือ

---

## 🗄️ Database / Infrastructure

- [ ] **ลบ/แทนที่ `scripts/roles/syncAllMembers.js`** — ตัวเก่าพังหลัง migrate PG (เขียน table `members` + MySQL syntax) ใช้ `scripts/calling/sync-discord-members.js` แทน

---

## 🤖 PPLE Bot / Social Share

### Quote Modal — Pre-fill & AI
- [ ] **Future:** ตั้งค่า default ชื่อ/ตำแหน่งใน Quote modal ผ่าน backoffice (แทน `.setValue` hardcode ที่ลบออกแล้ว)
- [ ] **Future:** ปุ่ม "AI คัด quote เด็ด" ใน modal — ดึง quote + attribution จาก thread ด้วย mode `quote_highlight` แล้ว pre-fill
- [ ] backoffice Quote (`/bot/media/quote`) — เพิ่ม config **default crop position** (1:1) ต่อ user/guild
- [ ] **ตรวจสอบ:** ลายน้ำบน Quote Image ซ้ำซ้อนไหม (quote ส่งตรงจาก `/quote` ส่วน basket ติดลายน้ำตอน post อยู่แล้ว) → พิจารณาตัด dropdown ลายน้ำออกจาก quote modal

### Social Share — X (Twitter)
- [ ] **Future:** Infographic — แปลงบทความยาวเป็นรูปสรุปแนบโพสต์หลัก

### Social Share — ช่องทางใหม่: LINE OA + Email (จด 2026-07-03)
- [ ] เพิ่ม **LINE OA** (Messaging API broadcast) + **Email** เป็นช่องทางโพสต์ใน basket/social share คู่กับ FB/IG/X ที่มีอยู่ — content เดียว กระจายครบทุกช่องที่สมาชิก/ผู้ติดตามองค์กรอยู่
- เฟรมเดียวกับ positioning ใหม่: Discord = บ้าน · LINE OA/email = ถนนไปหาคนที่ยังไม่อยู่ใน Discord
- config token/credential ต่อ guild ตาม pattern platforms ที่มี (`/bot/server/platforms`)

### Context Menu — Add to Calendar
- [ ] Context menu บนข้อความ → เพิ่มเข้าปฏิทิน · parse Discord/Google Meet URL + วันเวลา · เลือกปฏิทินได้ (Google Calendar + ปฏิทินทีม)

---

## 💰 PPLE Finance

- [ ] ระบบเบี้ยเลี้ยง — โอนเงินเป็นรอบๆ (บัญชีเขต + บัญชีทีมงาน)
- [ ] ระบบบัญชีเบี้ยเลี้ยงจังหวัด — ส่งสลิปเก็บง่าย + DM สลิปไปหาสมาชิก
- [ ] จัดการเบี้ยเลี้ยงจากสมาชิก Discord
- [ ] ระบบชำระเงินค่าเบี้ยเลี้ยง — ผูกเบอร์บัญชีธนาคารกับสมาชิก

---

## 📞 PPLE Calling

### CSV import สมาชิก (`scripts/importGuildMembers.js`)
- รับ `<guild_id> <file.csv>` → insert ลง `ngs_member_cache`
- columns ขั้นต่ำ: `first_name`, `last_name`, `phone`; optional: `line_id`, `province`, `amphoe`
- ACT-specific fields = NULL; progress output ตาม convention
- **หมายเหตุ:** งานนี้ทับ roster import ของ Amnesty onboarding — ทำรวมกันได้

### ✅ แก้แล้ว (2026-07-26) — ลิงก์กิจกรรมหายจากกล่องส่ง SMS

`buildSmsTemplate` เปลี่ยนไปใช้ `act_event_id` ตั้งแต่ commit `335cd65` (แก้เรื่องส่งลิงก์ผิด id) แต่เติม column ให้แค่ `getCampaigns` ลืม `getCampaignById` → หน้า `/calling/assignments/[id]` ได้ `undefined` → บรรทัดลงทะเบียนหายทั้งหน้า · อีกจุด `RecordCallModal` ยังส่ง `campaign_id` (id ภายใน) เป็น act id → ลิงก์ผิด
> **บทเรียน:** เปลี่ยน field ที่ query หนึ่งแล้ว **ต้องไล่ทุก query ที่ป้อน component เดียวกัน** (list / byId / assigned) · ดู bug-058

### ยังเหลือ
- [ ] เบอร์กลางโทรออก — แสดงเบอร์กลางองค์กรแทนเบอร์ส่วนตัว (ต้องการ provider/config เบอร์กลาง)
- [ ] แสดง active event บน dashboard + default event จังหวัดดึงจาก XLS
- [ ] Audit logs — ดูประวัติการแก้ไข/เพิ่มข้อมูล
- [ ] Approval flow ข้ามภาค — จังหวัด → ภาค → ประเทศ

---

## 👥 PPLE Contacts

- [ ] **Import ข้อมูลผู้บริจาค** เข้า `calling_contacts` — ต้อง copy จากเว็บไซต์มาก่อน (format ยังไม่ชัด) → import script รับ CSV/Excel

---

## 🔌 Integration — Panel / ACT / External APIs

### Panel 360
- [ ] รายชื่อผู้บริจาค 360 — ขอ schema, pkey คืออะไร
- [ ] API สมาชิกพรรค และรายนามผู้บริจาค
- [ ] ขอ endpoint: `GET /api/members`, auth method, pagination (ต้องการ cursor-based)

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

## 📋 PPLE Docs — E-Signature & E-Document

> รายละเอียดทั้งหมดอยู่ที่ [md/docs/DOCS.md](docs/DOCS.md) · shipped v2.15–v2.19: PDF pipeline, `docs_payers` role-based auto+override, security gate, ACT tab + attachment auto-crop, province filter, member_discord_id nullable, ระบบร่างหนังสือร้องเรียน (AI + PDF)

- **Docs self-fill (ผู้รับเงินนอก roster) — ✅ implement เสร็จ local 2026-07-07 · ยังไม่ deploy prod**
  - หน้าเซ็น: ค้น ngs เป็นทางหลักเหมือนเดิม + ลิงก์ "ไม่พบชื่อในทะเบียน? กรอกข้อมูลเอง" → ฟอร์ม ชื่อ/นามสกุล/เลขบัตร 13 หลัก/ที่อยู่ 6 ช่องตามบัตร
  - เก็บ: ชื่อ→`dc_members` · เลขบัตร+ที่อยู่→`override_data` ของ entry (PDF ออกครบ ทุก field override ชนะ ngs) · จำใน `dc_user_config` key `docs_self_info` → prefill ครั้งถัดไป
  - `verify` ส่ง `has_self_info` · ready/canSign = payer ‖ ngsLinked ‖ selfInfoDone · ราชบุรี (มี roster) ยังบังคับ link เหมือนเดิม
  - **Auto-apply (เคาะ 2026-07-07):** คนที่เคยกรอกครบแล้ว เปิดบิลใหม่ → ระบบเติมจาก `docs_self_info` ให้เองข้ามฟอร์ม (การตรวจจริง = ดู preview ก่อนเซ็น) · มีการ์ด "ใช้ข้อมูลผู้รับที่บันทึกไว้ + ปุ่มแก้ไขข้อมูล" · แก้แล้ว regen preview อัตโนมัติ
  - ไฟล์: `web/app/api/docs/sign/self-info/route.js` (ใหม่), `verify/route.js`, `web/app/docs/sign/[token]/page.js` · ไม่มี migration
  - **ค้าง:** เทสต์จริงกับ sign token จริง (สร้างบิล → กรอกเอง → preview/PDF ออกครบช่อง) · deploy prod
  - **Enhancement (จดไว้ ยังไม่ทำ):** OCR อ่านจากรูปบัตรที่อัปโหลด → prefill ฟอร์ม (Claude vision, Haiku 4.5 ~฿0.1/ใบ หรือ Opus 4.8 ~฿0.5/ใบ) — ตัดสินใจ 2026-07-06 ทำ manual ก่อน ถ้า user บ่นพิมพ์เยอะค่อยเสียบ · ข้อชั่ง: ส่งรูปบัตร ปชช. ไป Anthropic API (retention 30 วัน)

- **ค่าเบี้ยเลี้ยง กิจกรรมสัญจร — ยังไม่ implement**
  - กฎ: เบิกได้สูงสุด 5 คน คนละ 300 บาท · เงื่อนไข กิจกรรมต้องจัดมากกว่า 3 ชั่วโมง
  - ต้องเพิ่ม item type ใหม่ใน `web/config/fund69-rules.js` (`ALLOWED_ITEMS_BY_TYPE.mobile` ยังไม่มี `per_diem`) — ดู [md/docs/DOCS.md](docs/DOCS.md) หัวข้อ "กิจกรรมสัญจร"

- **Docs token consolidation — ✅ implement เสร็จ local 2026-07-05 · ยังไม่ deploy prod**
  - `project_token` ตัวเดียวแทน `pdf_token`/`export_token` · แยกเอกสารด้วย path `/receipt` vs `/registration`
  - **ก่อน deploy prod:** รัน `migration.sql` แล้ว restart ทันที (โค้ดเก่า INSERT column เก่า — window ไม่กี่วินาที) · backfill จาก `export_token` → **ลิงก์ registration (แนบท้าย 3) ที่แชร์ไปแล้วพัง ต้อง copy ใหม่** ลิงก์ receipt เดิมใช้ได้ต่อ

### ✂️ Attachment autocrop — ก้อน 1 เสร็จ local 2026-08-09 · ก้อน 2 (editor แก้มือ) ยังไม่เริ่ม

**ก้อน 1 (ทำแล้ว):** เลิกยืดภาพ — `fit_to_a4()` รักษาสัดส่วน + guard 2 ชั้น (quad เกิน 92% เฟรม / สัดส่วนหลุด 1.05–1.95 → ไม่ครอบ) + เลิกเดาหมุน 90° ตอน fallback + export route วางกลางหน้าไม่ยืด + เก็บต้นฉบับ `<uuid>.orig.<ext>`
- [ ] **ยังไม่ได้ลองกับรูปถ่ายจริง** — verify ที่ผ่านคือ build + เทสรูปสังเคราะห์ 5 เคส · ต้องอัปรูปเอกสารจริง 10-20 ใบดูว่าเหลือเพี้ยนแค่ไหน แล้วค่อยตัดสินว่าต้องลงก้อน 2 ไหม

**ก้อน 2 — ยกเครื่องมือแก้รูปของ posts มาใช้กับไฟล์แนบ ACT** (ยังไม่เริ่ม · scrutinize ผ่านแล้ว 2026-08-09)
- [ ] ย้าย `web/components/posts/ImageEditorModal.jsx` → `web/components/ImageEditorModal.jsx` + ย้าย i18n `posts.imageEditor` → `common.imageEditor` (th+en) · รับ prop: `onSaveBlob`, `aspects` (docs ต้องได้ A4 0.707 ไม่ใช่ 4:5/16:9 ของโซเชียล), บังคับ output JPEG (export ใช้ `embedJpg`)
- [ ] `PUT /api/docs/projects/[id]/attachments/[attId]/image` — ทับไฟล์เดิม + rebuild registration PDF · **ต้องใช้ `getEffectiveOrgIdentity` + `userId`** ไม่ใช่ `getEffectiveIdentity`+`discordId` แบบ DELETE/image route ข้างๆ (คนที่มีแต่อีเมลจะโดน 401)
- [ ] `DocProjectView.jsx` — คลิก thumbnail = เปิด editor แทน lightbox + **cache-bust `?v=Date.now()` หลังเซฟ** (route เสิร์ฟ `max-age=3600` URL ไม่เปลี่ยน → ไม่ทำแล้วเปิดแก้ซ้ำจะได้รูปก่อนเบลอกลับมา แบบที่ posts เคยเจอ)
- [ ] ครอบใหม่จากต้นฉบับ (`.orig.`) ได้ด้วย ไม่ใช่แก้จากรูปที่ครอบพลาดไปแล้ว

**เจอระหว่างทาง (ยังไม่แก้):**
- [ ] **HEIC/HEIF พังเงียบ** — `accept` + allowed list รับไว้ แต่ไม่มีตัวถอดทั้งสองฝั่ง (sharp 0.34.5 รองรับ heif เฉพาะ `.avif` · python ไม่มี `pillow_heif`) → `cv2.imread` คืน None → 500 "Upload failed" · ถอดออกจาก `accept` แล้ว iOS Safari จะแปลงเป็น JPEG ให้เอง
- [ ] `DocProjectView.jsx:606` อัปหลายไฟล์ยิงขนานผ่าน `forEach` → `upsertDocProject` find-or-create แข่งกัน
- [ ] `debug_role` ทำให้ `discordId` = null → image route + DELETE ของไฟล์แนบตอบ 401 ทั้งแท็บ ACT ใน debug mode

### 🐛 Bug — Internal Server Error ตอนสร้าง bill — **น่าจะเจอ root cause แล้ว 2026-07-06**
- **สาเหตุที่คาดว่าใช่:** prod DB ยังไม่ได้รัน `ALTER TABLE docs_activity_entries ALTER COLUMN member_discord_id DROP NOT NULL` (migration.sql:672) → สร้างบิลแบบ individual mode/ยังไม่กำหนดผู้รับ (`member_discord_id = NULL`) ชน NOT NULL constraint → error ถูกกลืนเป็น "Internal Server Error" ที่ `web/app/api/docs/entries/route.js:87` (catch-all ไม่ log detail ให้ client)
- เช็คแล้ว local dev DB column นี้ nullable แล้ว (รัน migration ไปแล้วตอน dev) — ต่างจาก prod ที่โดน error
- **ต้องทำ:** รัน `scripts/migration/migration.sql` เต็มไฟล์บน prod (ทุกบรรทัด idempotent) แล้วลองสร้างบิลซ้ำว่าหายไหม — ยังไม่ได้ยืนยัน 100% เพราะไม่มี stack trace จริงจาก prod log ตอนเกิดเหตุ

---

## 🔍 `/panel search` — universal search channel — ✅ แก้เสร็จ local 2026-08-12

> "ห้องรู้รอบ" ค้นข้าม forum/thread ทั้งเซิร์ฟเวอร์ เพราะ forum search ปกติต้องเข้า topic ทีละอันค้นไม่ได้

**ไฟล์:** `commands/panel.js` (sub `search`) · `index.js` (handler) · `services/forumCache.js` (`searchChannelCache`) · เก็บค่าที่ `dc_guild_config` key `search_channel`

**แก้แล้ว:**
- [x] **เพิ่ม `stop:true`** — `/panel search stop:true` ลบ setting + เคลียร์ cache (`clearSearchChannel()` ใหม่ใน `forumCache.js`), `channel` option เปลี่ยนเป็น optional
- [x] **ต้องเมนชันบอทถึงจะทำงาน** — เดิมพิมพ์อะไรในห้องก็ลบ+ค้น+ตอบหมด (รก) เปลี่ยนเป็นเช็ค `message.mentions.has(client.user)` เหมือน `ai_mention` แล้ว strip mention ออกเป็น keyword — พิมพ์เฉยๆ ไม่โดนแตะ, เมนชันไม่มี keyword ก็ไม่ทำอะไร
- [x] 🐛 **`mentions.has()` ต้องใส่ `{ ignoreRoles: true }`** (2026-08-13) — default ของ discord.js นับ **ยศที่บอทถืออยู่** เป็น mention ด้วย · เมนชันยศที่บอทก็มี (เช่น @ทีมงาน) = เข้าเงื่อนไขทั้งที่ไม่ได้เรียกบอท → ห้องค้นโดนลบข้อความ + RAG AI เด้งตอบเอง · แก้ทั้ง **2 จุดใน `index.js`** (search channel + `ai_mention`) — จุดเดียวไม่พอ

---

## 🤖 RAG AI — Discord Forum Search

> user ถามใน Discord แล้ว bot ตอบโดยดึงข้อมูลจาก forum_posts ใน Meilisearch

### Flow (reuse infra เดิม)
1. User `/ask <คำถาม>` → 2. `searchPosts()` top-K จาก Meilisearch → 3. ตัด snippet ~500 chars/โพสต์ → 4. `callAI(ragSystemPrompt, context + question)` → 5. embed reply + sources

### ไฟล์
- `commands/ask.js` · `services/ragSearch.js` (retrieval + context builder) · `handlers/askHandler.js`

### ต้นทุน token (Haiku 4.5 — $1/$5 per 1M)
- snippet 500 chars × K=5 ≈ **~$0.006/ครั้ง** (แนะนำ) · content เต็ม ≈ ~$0.018/ครั้ง · 1,000 query/เดือน ≈ ฿200 (snippet)

### ⚠️ Open Questions ก่อน implement
- **Meilisearch capacity** — index `forum_posts` มี 1,924 docs; เพิ่ม channel threads จำนวนกระโดด → ประเมิน doc count + query latency ก่อนตัดสินใจ index รวม/แยก
- **Privacy & third-party protection** — RAG ดึง content ที่อาจมี PII:
  - system prompt ห้าม AI สรุป/วิเคราะห์บุคคลที่ 3
  - ไม่ index channel ส่วนตัว (DM, private thread, off-limits channel)
  - strip ชื่อ/mention ออกจาก snippet ก่อนส่ง context
  - query ถามเรื่องคน (detect ชื่อจริง/mention) → refuse/redirect

### Chat with AI via Mention
- [ ] **`@bot <ข้อความ>` ในห้องที่กำหนด** — reuse `ragSearch.js` + `callAI()` · trigger จาก `messageCreate` + mention check · config ห้องใน `dc_guild_config` · อาจเพิ่ม conversation thread (multi-turn)

---

## 🛠️ Internal Tools / Productivity

- [ ] **File server องค์กร (EFSS แบบ Google Drive) — จด 2026-07-03**
  - ปัญหา: ตอนนี้อาสาซื้อพื้นที่ cloud ส่วนตัวกันเอง = ภาระ + ไฟล์งานไม่เป็นขององค์กร (อาสาออก ไฟล์หายตาม)
  - แนวทาง: self-host **Nextcloud** (ตัวมาตรฐาน; ตัวเทียบ Seafile) บน infra ที่มี · สิทธิ์ราย user/group/link + quota เหมือน Drive
  - ต้นทุน: VPS+storage 2TB ~฿400–800/เดือน จบทั้งองค์กร vs อาสา 20 คน × ฿70 = ฿1,400/เดือน
  - **จุดขาย platform:** Nextcloud รองรับ OIDC → login ด้วย Discord + map สิทธิ์โฟลเดอร์จาก role ใน `dc_members` (จังหวัด/ฝ่าย/ยศ) — เป็น module ใหม่ของ platform ที่ตลาดไม่มี
  - หมายเหตุ: Google for Nonprofits ฟรีสำหรับมูลนิธิจดทะเบียน แต่องค์กรการเมือง/movement ไม่ qualify → self-host ตอบโจทย์ลูกค้ากลุ่มเรา

- [ ] **Project management (Notion + Trello) — Discord-native**
  - Notion-side: page/doc แนบ project, nested tasks · Trello-side: Kanban drag-drop, swimlane ตาม assignee/label
  - สร้าง/อัปเดต task จาก Discord (slash command / context menu บนข้อความ → task ทันที)
  - แจ้งเตือนใน Discord เมื่อ task เปลี่ยนสถานะ/ถึง deadline/assign
  - member ผูก Discord user อัตโนมัติ (reuse `dc_members`) · web UI (`/projects`) board/table/doc view · reuse `guild_id` + RBAC pattern

---

## 🧙 Server Setup Wizard

> รายละเอียดที่ [md/discord/SERVER_WIZARD.md](discord/SERVER_WIZARD.md)

- [ ] **Wizard สร้าง Discord server สำเร็จรูป** — ตอบ 1–N คำถาม → ได้ server พร้อมใช้ + service pack
  - Wizard อยู่ที่ไหน (web/Discord DM) — ยังไม่เคาะ
  - Templates: พรรคการเมือง/มูลนิธิ/ชมรม/กลุ่มอาสา · Service packs: Calling/Finance/Cases/Media/AI
- [ ] **ห้อง honeypot ใน template** (จด 2026-07-09) — wizard สร้างห้อง honeypot ให้เลย + ตั้ง `honeypot_channel_id` ใน config อัตโนมัติ
  - permission: @everyone เห็นได้ (**ห้าม deny** ไม่งั้น bot join ใหม่มองไม่เห็น กับดักไร้ค่า) · deny ViewChannel ให้ `member_role_id` (role ที่ทุกคนได้ตอน verify ผ่าน `/panel register`/verify flow — ครอบสมาชิกจริงทุกคนแน่นอนกว่า interest/skill/province ที่เลือกหรือไม่เลือกก็ได้) · จะ deny เพิ่มที่ interest/skill/province ด้วยก็ได้แต่ไม่ใช่ตัวหลัก
  - ชื่อห้องกันคนจริงที่ยังไม่ verify เผลอพิมพ์ เช่น `🚫-do-not-post`
  - ผูกกับ Quarantine role (section ถัดไป) — ใครโพสต์ = auto-quarantine ตาม design ใน section Anti-Spam

---

## 🚫 Quarantine Role (anti-spam)

- [ ] เพิ่ม role `Quarantine` ใน template `th-civic-starter.json`
  - deny `ViewChannel` + `SendMessages` + `SendMessagesInThreads` + `CreatePublicThreads` + `CreatePrivateThreads` เป็น overwrite บน **ทุก category** (มองไม่เห็น ส่งไม่ได้ สร้าง thread ไม่ได้)
  - channel ที่ `lockPermissions()` (inherit) รับ deny มาอัตโนมัติ
  - channel ที่มี explicit overwrite ของตัวเองต้องเพิ่ม deny แยก
  - **position: สูงกว่า Admin** (ต่ำกว่า bot เท่านั้น) — ให้ mod assign Quarantine ให้ Admin ได้ด้วย
  - provisioner: สร้าง Quarantine **ก่อน** staff roles ทุกตัว (= position สูงกว่า) + เพิ่ม `{ role: "Quarantine", deny: ["ViewChannel", "SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"] }` เข้า overwrite ทุก category ใน template
  - ใช้: mod ติด role นี้กับ spammer → ส่งข้อความไม่ได้ทุก channel ทันที โดยไม่ต้อง ban
  - **ปัญหา:** category ที่ Admin สร้างเองทีหลังไม่มี Quarantine overwrite อัตโนมัติ
  - **แก้:** เพิ่ม subcommand `/server quarantine-sync` (หรือรวมใน `/server setup` idempotent) — วน loop ทุก category ใน guild แล้ว apply Quarantine deny ให้ครบ

---

## 💳 Donation — หน้าเว็บรับบริจาค

- [ ] **หน้าบริจาคสาธารณะ** — ผู้สนับสนุนภายนอกบริจาคผ่านเว็บ · scope/design ยังไม่ได้คุย

---

## 🛡️ Anti-Spam — Honeypot Channel (แทน Wick quarantine) — คุยไว้ 2026-07-05

> ที่มา: Wick quarantine ถอด role หมดเวลา sensitivity สูง → งง ตั้งค่าไม่ถูก ตอนนี้ quarantine ทำ manual เองอยู่แล้ว อยากได้ระบบ auto ที่ไม่ต้องเฝ้าห้อง

**แนวคิด:** สร้างห้องซ่อน (honeypot) ที่คนจริงมองไม่เห็น (deny "View Channel" ให้ role สมาชิกทั่วไป) — ใครก็ตามที่โพสต์ในห้องนี้ ถือว่าไม่ใช่คนจริงแน่นอน (ต่างจาก anti-spam ทั่วไปที่เดาจาก rate/pattern มี false-positive)

**จับได้ 2 เคส:**
1. สแปมบอท/self-bot ที่ join แล้วยิงรัวทุกห้องที่ token มัน permission ส่งได้ (ไม่ได้เลือกว่าคนคุยจริงไหม)
2. Account staff/admin ที่โดนแฮค — สคริปต์ยิงด้วย permission เดิมของ role ที่ถืออยู่ (เช่น `Administrator`) ซึ่ง **bypass channel overwrite ทุกอัน** → เห็น/โพสต์ห้องที่คนจริงมองไม่เห็นได้

**⚠️ จุดสำคัญที่ทำผิดพลาดง่าย:** ต้อง deny view เฉพาะ `member_role_id` (role ที่ติดอัตโนมัติตอน verify ผ่าน — ดู `handlers/registerHandler.js`/`verifyHandler.js` — ครอบสมาชิกจริงทุกคนแน่นอน ต่างจาก interest/skill/province ที่เลือกหรือไม่เลือกก็ได้) ห้าม deny @everyone/role พื้นฐานที่ได้ตอน join ใหม่ ไม่งั้น raid-bot ที่เพิ่ง join จะมองไม่เห็นห้องไปด้วย (permission บล็อกตั้งแต่ API level → ไม่มี event ให้จับเลย)

**เคาะแล้ว:**
- Admin สร้างห้อง honeypot เอง (ตั้งชื่อ) — bot ไม่ auto-create ห้อง
- **`/server antispam set honeypot_channel:<#ch>` auto-apply permission ให้เลย** (แก้ 2026-07-09 หลังพบว่า manual setup error-prone): deny ViewChannel ให้ `member_role_id` (จาก `config_register` — ต้องตั้ง `/panel register member_role` ไว้ก่อน) + เตือนถ้า @everyone โดน deny อยู่ (honeypot จะไม่ทำงาน) + เตือนถ้ายังไม่ได้ตั้ง `member_role_id`

**⚡ Threat model จริง (2026-07-09):** เคสที่เจอจริงแทบทั้งหมด = **account สมาชิกธรรมดาโดนแฮคมายิง** ไม่ใช่ bot join ใหม่ → honeypot จับเคสนี้ไม่ได้ (สมาชิกโดน deny มองไม่เห็นห้อง Discord reject ที่ API level) → honeypot ลดเป็นตัวรอง จับเฉพาะ admin/staff ที่มี Administrator โดนแฮค + bot join ใหม่ · ยังทำเพราะถูกมาก (listener เดียว)

### เงื่อนไขการติด Quarantine (เคาะแล้ว 2026-07-09)

**Auto-quarantine ทันที — เฉพาะพฤติกรรมที่คนจริงไม่มีทางทำ:**
| # | เงื่อนไข | เกณฑ์ (threshold ยังไม่เคาะ เคาะตอน implement) |
|---|---|---|
| 1 | **Duplicate ข้ามห้อง** (ตัวหลัก — จับ account โดนแฮค) | user เดิมส่ง content เหมือนเป๊ะใน ≥3 ห้อง ภายใน ~30 วิ · exact match (hash ต่อ user ใน memory) ไม่ใช่ fuzzy |
| 2 | **Mass-mention** | mention users+roles รวม ≥10 ในข้อความเดียว · `@everyone` ไม่ต้องเขียนโค้ด — กันด้วย server permission อยู่แล้ว |
| 3 | **โพสต์ในห้อง honeypot** | ข้อความใดๆ ในห้องที่ตั้งเป็น honeypot |

**Action เมื่อ trigger:** ติด **Quarantine role** + ลบข้อความ (เคส duplicate = ลบทุกห้อง) + แจ้งห้อง mod → mod ตัดสินเอง: ปลด role คืน (โดนแฮค กู้ account แล้ว — ยศอื่นอยู่ครบ ไม่ต้องจำ) หรือ ban (bot จริง) · **ไม่ถอดยศอื่น ไม่ใช้ timeout ไม่ ban อัตโนมัติ**

**พฤติกรรมกำกวม — ห้าม auto-quarantine (คนจริงทำได้):**
- พิมพ์รัว (เช่น 8 ข้อความ/5 วิ) → แจ้ง mod เฉยๆ
- ข้อความซ้ำในห้องเดิม → ลบตัวซ้ำ ไม่ลงโทษ (มักเป็น lag กดส่งซ้ำ)
- Invite link server อื่น → ลบ + แจ้ง mod

**ทำไม Quarantine role (ไม่ถอดยศ) ใช้ได้:**
- Quarantine role มี deny overwrite (SendMessages) ติดทุก category + ทุก channel แล้ว (ห้อง unsync ก็มี — copy overwrite มาตอน unsync + user ตั้งมือทุกครั้งที่สร้างห้อง) → โดนแล้วพิมพ์ไม่ได้ทุกห้อง
- กติกา allow-ชนะ-deny ระดับ role ไม่ทำให้พัง เพราะห้องลับ allow แค่ ViewChannel ให้ role สมาชิก ไม่ได้ allow SendMessages → deny ของ Quarantine อยู่
- จุดบอดที่ยอมรับ: ห้องที่ explicit allow SendMessages ให้ role อื่น (เช่นห้องประกาศ staff) · คนถือ Administrator (bypass ทุก overwrite — honeypot จับเคสนี้แทน แล้ว mod จัดการมือ)

**Implement (เสร็จแล้ว 2026-07-09):**
- `services/antiSpamCache.js` — in-memory guild config cache (honeypotChannelId, quarantineRoleId, modChannelId) populate ตอน `clientReady` (index.js) เหมือน pattern `forumCache.js`
- `handlers/antiSpamHandler.js` — `handleAntiSpam(message)` เช็ค 3 เงื่อนไข (honeypot/mass-mention/duplicate-cross-channel) + staff-exempt (`ManageMessages` ขึ้นไป → แจ้ง mod เฉยๆ ไม่ quarantine) + consolidate เป็น 1 action ต่อ 1 ข้อความ + quarantine-fail ยังแจ้ง mod (ไม่ swallow error)
  - duplicate cache เก็บ `{channelId, messageId, content, timestamp}` ต่อ user + prune เก่ากว่า 30s ทุกครั้งที่เช็ค + sweep ทุก 5 นาทีกัน memory โต
  - config เก็บผ่าน `/server antispam set/view/clear` (commands/server.js) → `dc_guild_config` keys: `antispam_honeypot_channel_id`, `antispam_quarantine_role_id`, `antispam_mod_channel_id`
  - wire เข้า `messageCreate` (index.js) เป็นจุดแรกสุด — return early ถ้ามี action กัน forum-index/search/RAG ประมวลผลข้อความที่กำลังจะถูกลบ
- ทดสอบ: mock smoke test 7 เคสผ่านหมด (ไม่ใช่ automated test suite ในโปรเจกต์ — สคริปต์ทดสอบทิ้งไว้ scratchpad ไม่ commit)

**ยังไม่ได้ทำ:**
- Deploy `/server antispam` command ขึ้นจริง (`node deploy-commands.js`) — รอ user สั่ง
- ทดสอบจริงใน Discord server (ต้องมี honeypot channel + quarantine role ตั้งค่าจริงก่อน)
- `channelCreate` listener เติม Quarantine deny อัตโนมัติ + audit script (optional, ยังไม่ทำ)

**สถานะ:** Code เสร็จ + mock test ผ่าน รอ deploy command + ทดสอบจริงบน Discord

---

## 🧹 Code Quality — Bot refactor (จาก external review, จดไว้ 2026-07-03)

> ที่มา: ให้ GLM อ่าน code แล้วสรุปจุดที่ควรปรับปรุง (ไฟล์ IMPROVEMENTS.md เดิมลบแล้ว — สาระอยู่ครบใน list นี้)

> **ตัดสินใจ 2026-07-05:** GLM list เป็น checklist ตำราทั่วไป ไม่ดูบริบท repo (bot ไม่มี test + คนเดียวดูแล) · P2 (แตกไฟล์ใหญ่) เสี่ยงพัง > ประโยชน์ ถ้าจะทำต้องเขียน test ครอบก่อน · P3/P4 churn เยอะ ผลลัพธ์ที่ user เห็น = 0 → **ตัด P2–P4 ทิ้ง**

- [ ] **ทยอยแทนที่ call site ที่เหลือ (boy-scout rule)** — ใช้ `utils/parseSetting.js` แทน pattern `typeof x === 'string' ? JSON.parse` ที่ซ้ำอยู่หลายจุด (เคยเป็นเหตุ basket CPU spike bug) · แตะไฟล์ไหน เก็บไฟล์นั้น ไม่ sweep รอบเดียว (กัน silent bug จาก fallback type ผิด) · ทำแล้ว: verifyHandler.js, panel.js

---

## 🎮 เพิ่ม engagement ให้คนอยู่บน Discord นานขึ้น — ไอเดีย, พับไว้ 2026-07-09

จุดประสงค์จริง: อยากดึงดูดคนอยู่บน Discord มากขึ้น (ไม่ใช่ต้องเป็นเกมขยับตัวเป๊ะๆ)

- ลองไล่มาแล้ว: Discord Activity (ตัดทิ้ง — ต้อง voice/browser), bot+embed grid ขยับ emoji (ตัดทิ้ง — ดูไม่น่าสนใจ)
- 3 ทางเลือกที่เสนอไว้ (ยังไม่เลือก):
  1. **Leveling/Rank system** — ต่อยอดจาก `db/activity.js` + `orgchartEmbed.js` ที่มีอยู่แล้ว, effort ต่ำสุด, engagement แบบ passive
  2. **Slash-command minigame แบบ RNG/สะสม** (เช่น ตกปลา) — loop ให้กลับมาเล่นทุกวัน ต้องออกแบบ economy
  3. **Event/quiz ประจำสัปดาห์** เกี่ยวกับองค์กร — spike engagement แต่ต้องมีคนคิด content ต่อเนื่อง
- **สถานะ:** นึกไม่ออกว่าจะเลือกทางไหน — พับไว้ก่อน ไม่ต้อง scope ต่อจนกว่าจะมีทิศทางชัดขึ้น

---

## 🧹 งานค้างจาก session กวาดเอกสาร (2026-07-21)

> เอกสารทุกฉบับที่ audit ต้องใช้ **ตรงกับ DB จริงแล้ว** (commit `a9d95c4` + `9810983`)

- [ ] **⭐ ให้โมเดลอื่นตรวจ RBAC ทั้ง 4 แอปหลัง org-scope** — พรอมต์พร้อมใช้อยู่ใน `<details>` ข้างล่าง · วางใน session ใหม่ได้เลย (Fable = สลับ `/model` ก่อน · Opus session ว่างๆ ก็ได้ผลใกล้เคียงและถูกกว่า)
  - ⚠️ `/code-review` ปกติดูแค่ diff ที่ยังไม่ commit → **ไม่ครอบ 71 commit ของ org migration** · ตัวที่ครอบทั้ง branch คือ `/code-review ultra` (คิดเงินแยก, ต้อง user สั่งเอง)
- [ ] **🐛 เคสที่สงสัยอยู่ รอ audit ชี้ขาด** — [web/app/api/calling/members/route.js:85-90](web/app/api/calling/members/route.js#L85-L90) ลิสต์สมาชิกกรองด้วย scope เต็ม แต่การเห็นเบอร์/LINE กรองด้วย `session.user.primary_province` ตัวเดียว · ฟิลด์นี้ user แก้เองได้ที่ /profile → คนถือ 2 จังหวัดสลับค่าเองแล้วเห็นเบอร์อีกจังหวัดได้ = ไม่ได้กั้นจริง · ที่อื่นเขาใช้ `getUserScope(access, primary_province)` แบบ**เสริม** scope ไม่ใช่แทน
- [ ] **สคริปต์ที่ยังอ้าง `dc_members`** (ไม่อยู่ใน runtime บอท/เว็บ ไม่บล็อก cutover)
  - `scripts/data/backfill-intro-peoplesparty.js` — pg จริง INSERT INTO dc_members → **พังจาก rename** ถ้าจะใช้ต่อต้องแก้เป็น 2 จังหวะ (users → org_members) ตาม `db/members.js`
  - `scripts/data/backfill-intro-ratchaburi.js` — `require('mysql2/promise')` ตายตั้งแต่ย้ายมา Postgres → ลบทิ้งได้
  - `scripts/social/x-get-token.js:130` — `pool.execute` + `?` + คอลัมน์ `user_id` ยุค MySQL · พังอยู่แล้วก่อน migration · ท่อน insert token น่าจะยังใช้ได้ ถ้ายังต้องใช้ควรซ่อมไม่ใช่ลบ
- [ ] **ฟีเจอร์ที่ ship แล้วแต่ไม่เคยมีเอกสาร** (agent ไม่กล้าเขียนเพราะไม่รู้เจตนา — ต้องคนที่รู้เขียน)
  - **flow ผู้จ่ายเซ็น (docs)** — คอลัมน์มีจริง (`payer_sign_token`, `payer_signed_at`, `docs_signatures.role`) แต่ DOCS.md ไม่มีสักบรรทัด · ไม่รู้ว่าเมื่อไหร่ payer ระดับ entry ต่างจากระดับ project
  - **ฟีเจอร์ SMS (calling)** — `/api/calling/sms`, `SmsModal.jsx`, status `sms_sent/delivered/failed` ยังไม่เคยถูกจด
  - ~12 endpoint ของ docs ที่เอกสารเงียบ · ลายน้ำบัตร ปชช. ที่เอกสารบอก 30°+"สำเนาถูกต้อง" แต่โค้ดจริงเป็น cross-hatch + วันที่
- [ ] **เก็บกวาด slash command** (คนละเรื่องกับโค้ด ทำเมื่อไหร่ก็ได้)
  - ไฟล์ซ้ำ 2 ที่ เนื้อหาเหมือนกันเป๊ะ: `~/.claude/commands/` กับ `.claude/commands/` — `build` `code-simplify` `plan` `review` `ship` `spec` `test` · เก็บที่เดียวพอ (แนะนำ global)
  - **`/review` ชนชื่อ built-in** ของ Claude Code (รีวิว GitHub PR) → ของเราทับอยู่ เรียก built-in ไม่ได้
  - `.claude/commands/code-simplify.md:5` อ้าง skill ที่ไม่ได้ติดตั้ง (`agent-skills:code-simplification`, `code-review-and-quality`) = dead reference

---

## 🌩️ PPLE Platform (console.ppleth.ai) — ไอเดียอนาคต, ยังไม่เริ่ม (2026-07-22)

พรรคมี internal PaaS ใหม่: Cloudflare Worker + Hono + D1 (SQLite) + R2 + `@pplethai/components`, auth = PPLE ID (OIDC, มี province-scope + delegation ในตัว), deploy คำสั่งเดียว `pple deploy` — mini-app รันใน "PPLE Today" · ลอง scaffold demo แล้วที่ `/home/tee/VSites/node/pple-demo` (นอก repo นี้) ใช้งานได้จริง

**แนวคิด: เอาระบบ calling มา rewrite บนแพลตฟอร์มนี้** — user เห็นด้วยถ้า Claude เขียนใหม่ให้ (ไม่ใช่ port ตรงๆ)
- **ไม่ใช่ migration — เป็น rewrite เต็ม:** Postgres→D1/SQLite, Next.js API routes→Hono Worker, Discord-guild RBAC→PPLE ID role/province
- **ข้อดีที่เห็น:** province-scope + delegation ของ PPLE ID ตรงกับที่ calling ต้องการ (coordinator ดูแลเฉพาะจังหวัด) อยู่แล้ว — ไม่ต้องประกอบ RBAC เองแบบตอนนี้
- **ต้องเช็คก่อนเริ่มจริง:** D1 storage/row limit รับข้อมูลปัจจุบันไหว (35 campaigns, 1,156+ logs และจะโตต่อ) ไหม
- ยังไม่เคาะ scope/timeline — แค่บันทึกไอเดียไว้

---

## 🔐 Calling — งานค้างต่อจากรอบอุดเลขบัตรรั่ว (2026-07-23)

**ที่แก้ไปแล้ว** (branch `org-core`, ยังไม่ commit): ปิดรูที่ payload ฝั่ง calling ส่ง `identification_number`
(เลขบัตร ปชช. 13 หลัก · 2,009 ราย), `date_of_birth`, ที่อยู่บ้าน ไปถึงเบราว์เซอร์ทุกคนที่เปิดหน้า calling
สาเหตุ = `SELECT m.*` จาก `cache_pple_member` ซึ่งเป็นสำเนาทะเบียนสมาชิกทั้งแถว → กันด้วย allowlist
ที่ `web/lib/callingFields.js` ครอบ 2 route (`members`, `pending`) · **master ก็รั่วเหมือนกัน** (bug-049)

- [ ] **แก้ที่ต้นทาง — เขียน SELECT ระบุคอลัมน์แทน `SELECT m.*` / `SELECT *`** ใน `web/db/calling/members.js`
      (มี 4 จุด `m.*` + 4 จุด `SELECT *`) · allowlist ที่ API เป็นแค่ตาข่ายกันชั้นสอง ไม่ควรเป็นด่านเดียว
- [ ] **hotfix ขึ้น master** — prod รั่วอยู่ตอนนี้ ไม่ต้องรอ cutover (patch ไม่พึ่งอะไรจาก org-core)
- [ ] **เคาะเรื่องด่าน PDPA ฝั่ง assignee** — `/api/calling/pending` เช็คแค่ `a.assigned_to = ฉัน`
      ไม่เช็คยศเลย ต่างจากหน้า roster ที่เช็ค `canSeeContacts` · และการ assign ต้องการแค่ `canSeeProvince`
      → เหรัญญิกที่ระบบตั้งใจไม่ให้เห็นเบอร์ในหน้า roster สามารถ assign คนให้ตัวเองแล้วอ่านเบอร์ได้
      (ยังไม่ได้ทดลองเดินทางนี้จริง — ต้องเขียนแถว assignment) · จะถือว่า "ถูกมอบหมาย = อนุญาตโดยปริยาย"
      ก็ได้ แต่ต้องเป็นการตัดสินใจ ไม่ใช่ผลข้างเคียง
- [ ] **ไล่ดูฟีเจอร์อื่นที่อ่าน `cache_pple_member`** ว่ามี `SELECT *` แบบเดียวกันไหม (docs/cases)
      — ฝั่ง docs ระวังเรื่องนี้อยู่แล้ว (`ngs-search` ส่งแค่ boolean `has_id_number`) แต่ยังไม่ได้ตรวจครบ

---

## 🔗 References

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — Production-grade engineering skills for AI coding agents

## i18n ค้าง — `web/components/LoginPanel.jsx` (2026-08-08)
รื้อ block render ใหม่ทั้งก้อน (สลับลำดับเป็น Discord → Google → ซ่อนอีเมล) = เข้าเกณฑ์ "โค้ดใหม่" ต้อง migrate เป็น `t()` ทั้งไฟล์
แต่ทั้งโซน login ยังไม่ migrate เลย (ไฟล์นี้ไม่มี `useTranslations` สักตัว) → เลี่ยงไว้ก่อน จดตามกติกา
มี ~30 string: ปุ่ม provider, ERROR_MESSAGES, ฟอร์ม OTP, หน้า "ตรวจอีเมลของคุณ" · ทำพร้อมกันทั้งโซน login ทีเดียวจะคุ้มกว่า

---

## 💧 ตำแหน่งลายน้ำตอนเผยแพร่ (2026-08-10) — เสร็จ local

เดิม [services/publishPipeline.js](../services/publishPipeline.js) ฮาร์ดโค้ด `position: 'random'` ทั้งบอทและเว็บ ไม่มีใครเลือกได้

- **ช่องเลือกตำแหน่ง** ใน `PostPublishPanel` (7 ตัวเลือก) default = สุ่ม · เก็บที่ `post_social_history.wm_pos` (NULL = สุ่ม → งานที่เข้าคิวก่อน deploy ไม่เปลี่ยนพฤติกรรม)
- **สุ่มแบบเลี่ยงตัวหนังสือ** — `pickWatermarkPos()` / `watermarkSpotsFor()` ใน `utils/quoteStyleKeys.js` ตัดช่องที่ข้อความของการ์ดกินก่อนสุ่ม · snapshot สื่อพา `quote_style` ไปกับงานแล้ว
- ⚠️ **ตำแหน่งข้อความยืนยันกับ renderer จริงทุกแถว อย่าเดาจากชื่อ layout** — `pillar` (เสาซ้าย) กับ `frame` (กรอบขวา) **ข้อความอยู่ล่างทั้งคู่** ไม่ใช่ซ้าย/ขวา · `matte` ข้อความอยู่ใต้รูป
- ⚠️ **การ์ด `plain-*` (พื้นสี CI) ไม่แปะลายน้ำเลย** — โลโก้ถูกวาดเข้าไปตั้งแต่ตอนสร้าง (`renderPlainCard`) แปะซ้ำ = โลโก้ 2 อัน
- เลือกตำแหน่งเอง = เคารพเสมอ แม้จะทับข้อความ (ถือว่าผู้ใช้ตั้งใจ)
- ตะกร้าดิสฯ ไม่มี `quote_style` ในสื่อ → ยังสุ่ม 6 ช่องเหมือนเดิม (ไม่ได้แย่ลง จะแก้ต้องให้ `/quote` เขียน metadata ลงตะกร้า = คนละก้อน)
- **i18n ค้าง:** `PostPublishPanel.jsx` ยังไม่ migrate เป็น `t()` (ไฟล์ 404 บรรทัด, โซน posts migrate ไป 6/15 ไฟล์) — รอบนี้เพิ่มข้อความไทยตรงๆ ตาม pattern เดิมของไฟล์ · จดตามกติกาใน CLAUDE.md
- เทสแล้ว: สุ่ม 25 ครั้ง/เคส แล้ววัดตำแหน่งจุดสีจริงในภาพ — การ์ดข้อความล่าง→ลงแถวบนเท่านั้น · ข้อความบน→ลงแถวล่าง · คอลัมน์ซ้าย→ไม่เคยลงซ้าย · รูปธรรมดา→ครบ 6 ช่อง · `plain-*`→ไม่แปะ · เลือกเอง→ลงตรงที่เลือก

---

## 🙂 รวมของ "ของฉัน" ไว้ที่ /profile (2026-08-10) — เสร็จ local

เดิมมี 2 ประตูสำหรับเรื่องของตัวเอง: `/profile` (ฟอร์มแก้ข้อมูล) กับ `/org/personal` (hub ที่เพิ่งสร้าง) · แถม `/org/*` ใช้เปลือก `OrgShell` คนละตัวกับ `Nav.jsx` ที่ใช้ตอนทำงานจริง → คนอยู่ที่ `/posts` หาลายน้ำส่วนตัวไม่เจอ

**โครงใหม่ (สมมาตรกับ `/org` = hub · `/org/settings/*`):**
```
/profile                   hub "ของฉัน" — ข้อมูลส่วนตัว · ลายน้ำ&การ์ด · Cooking
/profile/settings          ข้อมูลส่วนตัว (ฟอร์มเดิมของ /profile)
/profile/settings/brand    ลายน้ำส่วนตัว + ค่าตั้งการ์ดของฉัน
```

- **เกณฑ์ว่าอะไรอยู่ที่นี่: "ของชิ้นนี้ตามคนข้าม org ไหม"** — ตามไป = ที่นี่ · ไม่ตาม = ของ org · โพสต์/สื่อ/เพจ "ส่วนตัว" **ไม่ใช่ของที่นี่** เพราะตารางพวกนั้นมี `org_id` อยู่แล้ว และมีบ้านที่ตัวกรอง "ส่วนตัว" ใน `/posts`
- ลบ `/personal` ทั้งโซน (อายุไม่ถึงวัน ยังไม่ deploy)
- **คืนที่แก้ค่าตั้งการ์ดส่วนตัว** — `user_config` (`quote_ci_accent`, `quote_default_template`) ถูกอ่านอยู่จริงโดย `lib/quoteAccent.js` + `db/configResolver.js` แต่ UI หายไปตอนลบ `QuotePanel` → ทำ `api/profile/quote` + `PersonalQuotePrefs.jsx` ขึ้นมาแทน
- ⚠️ **flow ผูกบัญชี** (`api/link/{discord,google,line}/callback`) redirect กลับ `/profile?link_success=` → แก้เป็น `/profile/settings?link_...` แล้ว 12 จุด เพราะหน้าที่อ่าน query ย้ายลงไป
- `/cooking` เพิ่งมีทางเข้าครั้งแรก (ก่อนหน้านี้ไม่อยู่ใน Nav/APPS ต้องพิมพ์ URL)
- เทสด้วย session จริง: hub แสดงครบ 3 การ์ด · `/profile/settings` ฟอร์มเดิมครบ · brand page เขียน/อ่านค่ากลับตรง · ค่าผิด (สีไม่ใช่ hex / สไตล์ไม่มีจริง) คืน 400 · `/personal` กับ `/org/personal` คืน 404
- **ค้าง:** `/org/login` `/org/verify` ยังอยู่ใต้ `/org` ทั้งที่เป็นเรื่องตัวตนไม่ใช่องค์กร — ย้ายต้องทำ redirect เพราะมีคนใช้จริงแล้ว

---

## 🎨 ลายน้ำ/อัตลักษณ์ ย้ายจาก guild → org (2026-08-10) — เสร็จ local

**เหตุผล:** ลายน้ำถูกอ่านโดยทั้งบอทและเว็บ = ไม่ใช่ค่าตั้งของบอทและไม่ใช่ของ posts แต่เป็น **อัตลักษณ์ของแบรนด์ = กลุ่มโซเชียล** · ของเดิมเก็บเป็น `<guild_id>/<group>/` ทำให้ org ที่มีหลาย guild เห็นลายน้ำไม่ครบ (บั๊กจริง: org 1 มี 2 guild)

**โครงใหม่:** `assets/watermark/org_<org_id>/<group>/` + `assets/watermark/user_<users.id>/` — **guild หลุดจากสมการทั้งหมด**

- **หน้าใหม่:** `/org/settings/brand` (owner only) รวมลายน้ำรายกลุ่ม + สี CI + สไตล์การ์ด · ของส่วนตัวไป `/org/personal/brand`
- **ลบทิ้ง:** `/bot/media/quote`, `/bot/media/watermark`, `api/bot/{guild-watermarks,quote-watermarks,quote-config}`, `WatermarkPanel.jsx`, `QuotePanel.jsx`
- **ตัวแปลงที่ขอบ:** `services/watermarkPaths.js` (บอท) แปลง guild→org / discord→users.id มี cache 5 นาที · `web/lib/watermarks.js` (เว็บ) รับ `orgId/userId` ตรงๆ — ⛔ ห้ามเอา guildId กลับเข้าไปในสองไฟล์นี้
- **ส่วนตัวเลิกใช้ Discord ID** — email-only user ใช้ลายน้ำส่วนตัวได้แล้ว และ debug mode (discordId=null) ไม่ทำของส่วนตัวหายอีก
- **กติกาที่เคาะ:** โหมดส่วนตัว **ไม่เห็น**ลายน้ำ org (แยกถังเด็ดขาด) · `resolveWatermarkRef()` เช็คกับโฟลเดอร์ของกลุ่มที่เลือกตอนเผยแพร่ จึงข้ามถังไม่ได้โดยโครงสร้าง
- **ยังไม่ทำ (ตั้งใจ):** ตาราง `social_groups` — `group_name` เป็น string ต่อไป · ทำเมื่ออยากเปลี่ยนชื่อกลุ่มโดยของเก่าไม่พัง / ให้สิทธิ์รายกลุ่ม / ค่าตั้งต่อกลุ่มเกิน 3 ตัว

**สิ่งที่ต้องทำตอน deploy prod (ตามลำดับ):**
1. `sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/migration/moveWatermarksToOrg.js --dry-run'` — ต้องไม่มี ❌ ก่อนรันจริง
2. รันจริง (ไม่มี `--dry-run`) · local ย้าย 17 ไฟล์ ลบซ้ำ 2
3. รัน SQL ท้าย `scripts/migration/migration.sql` (ย้าย `default_watermark_group:*` → `org_config`)
4. ⚠️ สคริปต์**หยุดเอง**ถ้าเจอไฟล์ชื่อซ้ำเนื้อต่างกัน หรือ guild ที่ไม่มี org — ไม่เขียนทับเงียบๆ · guild กำพร้า `506440360600535050` จะถูกรายงาน

**เทสแล้ว (local, ล็อกอินเป็น owner จริง):** `/org/settings/brand` 200 · API คืนกลุ่มครบ 2 + ไฟล์ + default ที่ย้ายมา · preview รูปผ่าน · PATCH สี/สไตล์ + validate ค่าผิดคืน 400 · path traversal โดนบล็อก · `/api/posts/watermarks` เห็น 17 ไฟล์ · ฝั่งบอทเข้าจาก guild ไหนของ org 1 ก็เห็นครบ 11 ไฟล์เท่ากัน (บั๊กเดิมหาย) · หน้า/API เก่าคืน 404
**⬜ ยังไม่ได้ทดสอบ:** ตะกร้าดิสฯ + `/quote` ในดิสคอร์ดจริง (ต้องรันบอท) · หน้าจอบนมือถือ

---

## 🗂 จัด IA /bot + /org/settings (2026-08-09)

**ทำแล้ว:** OAuth 3 เส้นเลิกผูก guild → scope เป็น org · ย้ายบัญชีโซเชียลไป `/org/settings/social` · หน้าแรก `/bot` (สถานะ + สิ่งที่ยังไม่ได้ตั้ง) · sidebar `/bot` แบบเดียวกับ `/org/settings` · ยุบ `/bot/features` เข้า `/bot/ai` · เอา BOT ออกจากแถวแอป ไปอยู่เมนู org · ลบ dead code `SOCIAL_LINKS` / `/social`

### ค้างอยู่

- [x] ~~**รัน migration ลบ creds ค้าง**~~ → **รันแล้ว 2026-08-09** · `DELETE 8` · เช็คหลังลบ: `dc_guild_config` ไม่เหลือคีย์ creds เลย ส่วน `org_config` ครบ 4 คีย์เหมือนเดิม · สำรอง 8 แถวไว้ที่ scratchpad ของ session (มี secret จึงไม่เก็บใน repo)
- [ ] **guild กำพร้า `506440360600535050`** — มี 4 แถวใน `dc_guild_roles` แต่ไม่มีใน `dc_guilds` → `orgIdOfGuild()` คืน null · หน้า `/bot` มองไม่เห็นตลอดกาล · ต้องเคาะว่าลบยศทิ้งหรือ map เข้า org
- [ ] **เทสในเบราว์เซอร์** — smoke test ผ่านแล้ว (`/bot` 200 · `/bot/platforms` 307 พก query string ครบ · `/org/settings/social` 307 ไป login) แต่ **ยังไม่ได้ดูด้วยตาแบบล็อกอินจริง** โดยเฉพาะ sidebar บนมือถือ + ปุ่ม Connect ที่ไม่มี guild แล้ว
- [ ] **ลบ fallback `orgIdFromState()`** — `web/lib/socialOAuthScope.js` มี fallback ให้ OAuth flow ที่ค้างกลางทางตอน deploy · ลบได้หลัง deploy เกิน 10 นาที (อายุ state)

### ไอเดียที่ยังไม่ทำ

- **AI เป็น per-org แบบ BYO-key** ← **สเปคเคาะครบ 2026-08-10 · ขั้น 1a เสร็จแล้ว**

  **เป้า:** แต่ละ org กรอก API key เอง + เลือกโมเดลเอง → บิลวิ่งไปหา org นั้น → **ไม่ต้องทำ metering** (การนับมีไว้ตอบว่า "ใครติดเงินเรา" ซึ่งหมดคำถามเมื่อเขาจ่ายเอง)

  **org ที่ไม่กรอก key — เคาะแล้ว: โควต้าตัวเลขช่องเดียว ไม่ใช่สวิตช์เปิด/ปิด**
  - `org_config` คีย์เดียว = โควต้ายืม key กลางต่อวัน · `0` = ยืมไม่ได้ · `30` (default) = ทดลองใช้ · `9999` = ยืมได้เต็มที่ (org ของเจ้าของระบบ)
  - **เหตุผลที่ไม่เอาสวิตช์:** สวิตช์ต้องรอเจ้าของระบบนึกได้เองว่าต้องไปกดปิด org ไหน = ไม่ต่างจากไม่มีสวิตช์ · โควต้าบังคับตัวเองอัตโนมัติ · ตัวเลขเดียวทำงานแทนได้ทั้งสวิตช์และเพดาน
  - โควต้าหมด → ข้อความ "โควต้าทดลองวันนี้หมดแล้ว — ใส่ API key ขององค์กรใน `/org/settings/ai`" พร้อมลิงก์
  - นับแค่ **จำนวนครั้งต่อวัน** ไม่ใช่ token/เงิน · ลอก `web/lib/postsAiQuota.js` (นับรายคน→เปลี่ยนเป็นรายองค์กร)

  **ที่ scrutinize จับได้ (2026-08-10) — inventory เดิมนับผิด มี 9 จุดไม่ใช่ 4:**
  - `services/aiLayout.js` (4 จุดใช้ key) = การ์ดคำคม · เส้นเรียกลึกข้ามฝั่ง: `api/posts/[id]/media/quote` → `web/lib/quoteRender.js` → `utils/quoteStyles.js:929` → `analyzeLayout` · **เป็นตัวกำหนดขนาดงานจริง แยกเป็นขั้น 1b**
  - `web/app/api/cooking/*` 4 route = แอพส่วนตัว **ไม่มี org และจะไม่มี** → ประกาศเป็นโซนที่ใช้ key เจ้าของระบบเสมอ ห้ามยัด orgId ให้มัน
  - `web/app/api/case/[ref]/letter/draft` = ยิง REST ตรง (ยุบเข้า `askAi` แล้วในขั้น 1a)

  **ต้องมีตอน deploy ขั้นที่ใช้จริง:** seed โควต้าสูงให้ org ที่มีอยู่ทุกตัวก่อน ไม่งั้น AI ดับทุก org ทันทีที่ deploy (ทุก org วันนี้ใช้ key กลางอยู่)

  **key:** แยกราย provider (`ai_api_key_claude` / `ai_api_key_gemini`) ไม่ใช่ช่องเดียว — เลือก gemini แล้วกรอก key Anthropic = 401 ที่อ่านไม่ออก · resolver ต้องเช็ค key **ของ provider ที่เลือก** · เข้ารหัส AES-256-GCM ด้วย master key ใน `.env` (API key ยิงเงินได้ด้วยตัวมันเอง ต่างจาก `meta_app_secret` ที่ต้องมี OAuth flow ประกอบ — เทียบกันไม่ได้) · API คืนเฉพาะ mask · ห้ามโยน `err.message` ดิบจาก SDK ขึ้นหน้าจอ

  **โมเดล:** 2 ช่องแยก — "งานเบา" (สรุปแชท/case timeline/ร่างจดหมาย) กับ "งานเขียน" (posts) · dropdown = รุ่นที่ทดสอบแล้ว + ช่องพิมพ์เองใต้ป้ายว่าไม่รับประกันผล · posts ที่บังคับ JSON ถ้า parse ไม่ผ่านให้ retry ด้วยโมเดล default 1 ครั้งแล้วแจ้ง — ไม่บล็อกตั้งแต่หน้าตั้งค่า

  **ความคืบหน้า**
  - [x] **ขั้น 1a — ปิดตะเข็บ ctx (2026-08-10)** ไม่เปลี่ยนพฤติกรรม: `callAI/callAIWithHistory(system, user, ctx)` · `getAgentConfig(ctx)` คืน `apiKey` มาด้วย (provider adapter เลิกอ่าน `process.env` เอง) · `generateTimeline(title, messages, ctx)` · ส่ง ctx ครบทุก call site ฝั่งบอท · ฝั่งเว็บ `askAi/askAiJson(system, user, { model, maxTokens, orgId })` + ยุบ callAI ที่ก๊อปในหน้า case timeline และ letter/draft เข้ามาใช้ตัวกลาง
  - [x] ~~**ขั้น 1b — เส้น aiLayout/quote**~~ → **ไม่ต้องทำแล้ว: ถอด AI ออกจากการ์ดคำคมทิ้งเลย 2026-08-10** (user เคาะ: "ใช้วิจารณญาณมนุษย์ดีกว่า เหมือนไม่ค่อยช่วยอะไร") · AI ตัดสินแค่ band/align/สี ซึ่งคนเลือกเองอยู่แล้วจาก 24 สไตล์ + ปุ่มสุ่ม · ลบ `renderEmberAI` + `analyzeLayout` + สไตล์ `'ai'` + ชิป "✨ AI" ในโมดัล · คีย์เก่า `'ai'`/`'quote-1-ember-ai'` alias → `shade-bottom-left` **ทั้ง 3 ที่** (`utils/quoteStyleKeys.js`, `utils/quoteStyles.js` ที่มี alias map ของตัวเอง, `web/lib/quoteStyles.js`) — ลืมที่ไหนที่หนึ่ง = การ์ดเก่าพัง "Unknown style" · `services/aiLayout.js` เหลือแค่ `shortenQuote` (สคริปต์ทดสอบใช้)
  - [x] **ขั้น 2 — resolver + โควตา (2026-08-10)** — `db/aiCreds.js` (บอท) + `web/lib/aiCreds.js` (เว็บ) เป็นคู่แฝด **แก้ไฟล์ไหนต้องแก้อีกไฟล์เสมอ** · ค่าคงที่/ชื่อคีย์อยู่ `config/aiConstants.js` ที่เดียว · เข้ารหัสที่ `utils/aiCrypto.js` (AES-256-GCM, master key = env `AI_KEY_SECRET`) — เว็บ import CJS จาก root ได้ (`@/../utils/…`) เลยไม่ต้องเขียน crypto ซ้ำ 2 ฝั่ง
    - **⚠️ ต้องเพิ่มใน `.env` ก่อนใช้หน้าตั้งค่า:** `AI_KEY_SECRET=<ข้อความยาวๆ สุ่ม>` · ไม่ตั้ง = ถอด key ไม่ได้ → ทุก org ตกไปใช้ key กลางเหมือนเดิม (ไม่พัง) · **เปลี่ยนค่านี้ทีหลัง = key ที่เก็บไว้ถอดไม่ออกทั้งหมด ต้องให้ทุก org กรอกใหม่**
    - **ยืม key กลาง = เลือกโมเดลเองไม่ได้** ใช้ค่าที่เจ้าของระบบตั้งที่ backoffice (เลือกรุ่นแพงได้ต่อเมื่อจ่ายเอง)
    - โควตาหมด → `AiCredsError` code `quota` → ฝั่งเว็บตอบ **429**, AI ล่มจริงตอบ 502 · guild กำพร้าที่ยังไม่ map เข้า org → ยืมได้แต่นับไม่ได้
    - migration seed โควตา `100000` ให้ org ที่มีอยู่ (รันบน local แล้ว 4 แถว) — **ยังไม่ได้รันบน prod**
    - เทสแล้ว: เข้ารหัส/ถอดกลับตรง · master key ผิด → คืน null ไม่ระเบิด · org มี key เอง → ใช้ของตัวเอง+ไม่นับโควตา · โควตา 2 ครั้ง ยิงครั้งที่ 3 โดนบล็อก · โควตา 0 = ยืมไม่ได้
  - [x] **ขั้น 3 — UI `/org/settings/ai` (2026-08-10)** — `web/app/org/settings/ai/page.js` + `components/org/OrgAi.jsx` + `api/org/orgs/[id]/ai` (owner only) · เพิ่มแท็บใน `OrgSettingsNav` · i18n ครบทั้ง th/en
    - **ไม่ autosave โดยตั้งใจ** — ช่อง API key พิมพ์ทีละตัว autosave จะยิงค่าครึ่งๆ ลง DB → ใช้ปุ่มบันทึกตามกติกา Create vs Update
    - **`ai_shared_quota_daily` แก้ผ่าน UI ไม่ได้โดยตั้งใจ** — org ตั้งเองได้ = ไม่มีโควตา · หน้าเว็บโชว์อ่านอย่างเดียว แก้ที่ `org_config` ตรงๆ
    - GET ไม่คืนตัว key ไม่ว่ากรณีใด คืนแค่ `hasKey: {claude, gemini}` · ช่องเลือกโมเดลจะ disabled จนกว่า org จะใส่ key ของตัวเอง
    - ⬜ **ยังไม่ได้ดูด้วยตาแบบล็อกอินจริง** — smoke ผ่านแค่ gate (`/org/settings/ai` → 307 login · API → 401) + build ผ่าน
    - `dc_ai_modes` (prompt สรุปแชท) กับ provider/model ระดับระบบ ยังอยู่ `/bot/ai` เหมือนเดิม = ค่าตั้งต้นที่ org ยืม key กลางจะได้รับ
  - ถ้าวันหน้ากลับไปทาง key กลาง+คิดเงิน: ต้อง log ครบ 4 ช่อง (`input_tokens` / `cache_read_input_tokens` / `cache_creation_input_tokens` / `output_tokens`) — โค้ดใช้ prompt caching อยู่ `input_tokens` จึงเป็นแค่ส่วนที่ไม่โดนแคช ไม่ใช่ยอดรวม · เก็บ token อย่าเก็บเงิน คิดตอนอ่าน

- ~~AI config ควรเป็น per-org (แบบ config-split)~~ → เปลี่ยนเป็น BYO-key ด้านบน · เดิมคิดว่า — ตอนนี้ `dc_guild_config guild_id='global'` + `dc_ai_modes.guild_id='global'` = ทุก org ใช้โมเดล/prompt ชุดเดียวกัน · `dc_ai_modes` มีคอลัมน์ `guild_id` รออยู่แล้ว · พอ rebrand เป็น multi-tenant แต่ละ org ควรเลือกเอง (+ จ่ายเอง) — เป็นการเปลี่ยน scope ไม่ใช่ย้ายหน้า จึงไม่ได้ทำในรอบ IA
- **`/admin` เกือบตาย** — มีหน้าเดียว (`/admin/logs`) ไม่มีลิงก์ไปหาจากที่ไหนเลย gate ที่ `admin/moderator` · ต้องเคาะว่าปลุกเป็นโซน superadmin จริง หรือย้าย logs ไปที่อื่นแล้วลบทิ้ง

## 🤖 AI prompt backoffice (org_ai_prompts) — เขียนเสร็จ 2026-08-13 (local · ยังไม่ deploy)

- [x] **ก้อน A** — โหมด "ตรวจก่อนเผยแพร่" (AI บรรณาธิการ 9 หมวดเสี่ยง) `/api/posts/ai/review` + `ReviewResult` ใน `PostEditor.jsx` (`913a1bb`)
- [x] **ก้อน B** — `org_ai_prompts` แทน `dc_ai_modes` · reader 2 ฝั่ง · 8 call site · หน้าแก้ที่ `/org/settings/ai` (`8c91fee` → `58a87c5`)
- ⬜ **ยังไม่เทสในเบราว์เซอร์จริงทั้ง A และ B** (build + DB test ผ่านแล้วเท่านั้น) — ต้องกดจริงว่า AI ตรวจแล้วทักมากเกินไปไหม + หน้าแก้ prompt ใช้งานได้จริง
- ⚠️ **deploy: บอท + เว็บต้องขึ้นพร้อมกัน** — `db/aiConfig.js` (โปรเซสบอท) กับ `web/app/api/bot/ai-modes/route.js` ยิง `org_ai_prompts` ทั้งคู่ ปล่อยฝั่งเดียวไป = บอทพังเงียบเพราะ `dc_ai_modes` ถูก DROP แล้ว
- ⚠️ **migration ยังไม่รันบน prod** — บล็อก `2026-08-12 · org_ai_prompts` ท้าย `migration.sql` (สร้างตาราง → ย้าย 2 แถว → DROP ของเก่า)
- [ ] **โควตา AI 30/วัน/คน อาจไม่พอ** — `consumeAiQuota` นับที่คนกด ซึ่งฟีเจอร์ตรวจเนื้อหาคนกดคือบรรณาธิการ (คนน้อย ตรวจงานทั้ง org) ต่างจากคนเขียนที่ใช้ของตัวเองไม่กี่ครั้ง · ถ้าเจอเพดานจริง: แยกเพดานของ `kind='review'` หรือขึ้น limit เฉพาะ `isMediaTeam`
- [ ] **ชุดกลาง (org_id IS NULL) ของ slot ยังแก้จากเว็บไม่ได้** — ตั้งใจ (ค่าตั้งต้นอยู่ใน `config/aiPrompts.js`) ถ้าอยากแก้จากเว็บต้องทำหน้า superadmin แยก

## 📱📧 Register panel — ปุ่มผูกอีเมล + soft roster match (2026-08-13 · local ยังไม่ deploy)

- [x] **ปุ่มผูกอีเมลใน `/panel register`** — option `bind_email` → ปุ่ม `btn_open_email_modal` (customId เดียวกับ `/panel email` ใช้ handler เดิม ไม่ต้องแยก flow) · `commands/panel.js`
- [x] **`verifyHandler.js` เปลี่ยนเป็น soft roster match** — เดิมไม่เจอเบอร์ใน `cache_pple_member` = เด้ง "ไม่พบเบอร์นี้ในทะเบียนสมาชิก" ซึ่งพังเพราะ **roster มีไม่ครบทุกจังหวัด**
  - เจอ → `member_id` + `users.phone` + ติดยศ (พฤติกรรมเดิมเป๊ะ)
  - ไม่เจอ → `users.phone` อย่างเดียว **ไม่ติดยศ ไม่แตะ member_id** (user เคาะ: ยศต้องมาจากปุ่มแนะนำตัว/แอดมิน)
  - เจอ >1 รายชื่อ / เบอร์ถูก discord อื่นผูก → ยังเด้งเหมือนเดิม · โหมด soft กัน claim ซ้ำที่ `users.phone WHERE phone_verified_at IS NOT NULL` แทน roster
  - คนที่ผูกแบบ soft ยังกดซ้ำได้ (เช็ค "ยืนยันแล้ว" ต้องมี `member_id` ด้วย) — ตั้งใจ: roster ครบทีหลังแล้วกดใหม่ = ได้ยศ · quota 5/วัน คุมค่า SMS
- ⚠️ **ต้องรัน `node deploy-commands.js` ก่อนใช้** — เพิ่ม option `bind_email` ใน `/panel register`
- ⬜ **ยังไม่เทสจริงบน Discord** (syntax check ผ่านอย่างเดียว)
- [ ] **i18n ค้าง — `handlers/verifyHandler.js` + `commands/panel.js`** ยัง hardcode ไทยทั้งไฟล์ (โซน bot ยังไม่ migrate เลย) · รอบนี้เพิ่ม/แก้ข้อความที่ user เห็น ~4 จุด (label modal, embed ผลลัพธ์โหมด soft, ปุ่ม/สรุป panel) ตาม pattern เดิมของไฟล์ — จดตามกติกา CLAUDE.md
