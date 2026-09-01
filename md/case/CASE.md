# Case System — ระบบเรื่องร้องเรียน

รับและบริหารเรื่องร้องเรียนจากประชาชน (ถนน/ไฟฟ้า/ประปา/ไม่ได้รับความเป็นธรรม) ระดับจังหวัด
เชื่อมกับ Discord forum (1 เคส = 1 กระทู้) · ผู้ร้องเรียนติดตามผลผ่าน ref + SMS

---

## 🔑 แนวคิดหลัก

- **Core term:** `case` ทุกที่ในโค้ด · permission `caseworker`
- **1 เคส = 1 Discord forum thread**
- **Province scope = เหมือน calling** — `getUserScope()` / `caseAccess.js` (admin/secretary_general เห็นทุกจังหวัด)
- **Ref ID:** `<รหัสมหาดไทย>-<พ.ศ.2หลัก>-<random4hex>` เช่น `70-69-A8F3` (random กัน enumerate · รหัสมหาดไทย = 2 หลักแรกรหัสไปรษณีย์)

---

## 🚪 ช่องทางรับเรื่อง

1. **Public web form** `/complaint/new?province=<ชื่อจังหวัด>` (ไม่ต้อง login)
   - province มาจาก URL (ผู้ประสานงานแชร์ลิงก์จังหวัดตัวเอง) · ไม่มี → dropdown picker
   - บังคับ: ชื่อ + เบอร์ + consent (PDPA) · optional: LINE id + ไฟล์แนบ
   - หลัง submit → SMS ลิงก์ติดตาม + สร้าง forum thread (`createForumThread()` ใน `POST /api/case` — ผูก thread ให้ตั้งแต่ตอนสร้าง ไม่มีขั้นตอนเชื่อมทีหลัง)

2. **Discord import** — context menu `📋 นำเข้าเป็นเคสร้องเรียน` บนข้อความในกระทู้
   - modal กรอกจังหวัด (pre-fill จาก `case_config.default_province` ตั้งผ่าน `/panel case`) + ประเภท
   - กระทู้เดิม = thread ของเคส · AI สรุปกระทู้อัตโนมัติ (`ai_summary`)

---

## 🗺️ Routes

> ⚠️ **เปลี่ยนชื่อเส้นทางแล้ว 2026-08-30** — ฝั่งประชาชนย้ายไป `/complaint/*` ทั้งชุด · `/case/*` เหลือไว้ให้คนทำงานล้วนๆ
> ลิงก์ที่ส่งให้ผู้ร้อง (SMS / ลิงก์ "ติดตามสาธารณะ" ในเธรด) ต้องเป็น `/complaint/[ref]` เสมอ — `/case/[ref]` ติด gate เข้าไม่ได้

> 🔗 **เลขเคสในข้อความ Discord ต้องเป็นลิงก์กลับเสมอ** (user เคาะ 2026-09-01) — ทุกข้อความที่บอท/เว็บโพสต์
> แล้วมี ref อยู่ ต้องเรนเดอร์เป็น `[ref](.../case/ref)` ไม่ใช่ `**ref**` เปล่าๆ · ชี้ `/case/[ref]` เพราะข้อความ
> พวกนี้อยู่ในเธรดของทีมงาน (คนละอันกับลิงก์ติดตามของผู้ร้องด้านบน)
> ตัวช่วย: `caseRefLink()` ใน `web/lib/caseDiscord.js` · `refLink()` ใน `handlers/caseImportHandler.js` (ฝั่งบอท อ่าน base จาก guild_config)
> ยกเว้นข้อความเดียว: **"เคส X ถูกลบออกจากระบบแล้ว"** — แถวถูก purge ไปแล้ว ลิงก์จะ 404

| Route | สาธารณะ? | หน้าที่ |
|---|---|---|
| `/complaint` | ✅ public | dashboard สาธารณะ + ช่องติดตาม ref + ปุ่มแจ้งใหม่ |
| `/complaint/new` · `/complaint/new/[province]` | ✅ public | ฟอร์มแจ้งเรื่อง (ไม่ระบุจังหวัด = picker) |
| `/complaint/[ref]` | ✅ public | ติดตามสถานะ + public note timeline (ไม่มี PII) |
| `/case` | 🔒 caseworker | รายการเคส (scope-filtered) |
| `/case/[ref]` | 🔒 caseworker | จัดการเคส (PII + actions) |

**กันหลุด PII ระดับโครงสร้าง:** หน้า public ใช้ `getCaseByRefPublic()` (query เฉพาะ field ปลอดภัย) · หน้าทีมงานใช้ `getCaseByRefFull()` หลังผ่าน gate

---

## 🔐 Permission & Scope

- permission `caseworker` (เพิ่มใน `lib/permissions.js` capability `manageCases`)
- `caseAccess.js`: `canManageCases(access)` · `canAccessCaseProvince(province, access)` · re-export `getUserScope`/`isAdmin` จาก callingAccess
- ทุก action API gate ผ่าน `lib/caseGate.js` (auth + permission + province scope)

---

## ⚙️ ตั้งค่า bot

```
/panel case channel:#ห้อง-forum-เรื่องร้องเรียน default_province:ราชบุรี
```
- ต้องเป็น **forum channel** · เก็บใน `case_config.forum_channel_id`
- `case_config.default_province` — จังหวัดตั้งต้นของ auto-import + pre-fill ในโมดัลตอน import
  - **ย้ายมาจาก `dc_guild_config` key `case_default_province` แล้ว (2026-09-01)** — key เดิมไม่มี UI ให้ตั้งตั้งแต่เกิด ต้องยัด DB เอง · ตอนนี้ตั้งผ่าน `/panel case` ได้ตรงๆ
  - ไม่ตั้ง = auto-import ตกไป `'ไม่ระบุ'` → ref ขึ้นต้น `00-` และ **ทีมที่ scope รายจังหวัดมองไม่เห็นเคสเลย**

**deploy slash command ใหม่:** รัน `./deploy.sh` (มี `/panel case` + context menu + เปลี่ยน `/case` เก่าเป็น `/report`)

---

## 🗄️ Schema (6 ตาราง)

- `cases` — เคสหลัก (ref, province, category, title, detail, status, close_reason, complainant_*, discord_thread_id, discord_guild_id, ai_summary, intake_ip, consent_at, letters)
- `case_timeline` — timeline (is_public แยก internal/public)
- `case_assignees` — ผู้รับผิดชอบหลายคน/เคส
- `case_attachments` — ไฟล์แนบ (เก็บนอก /public)
- `case_config` — forum channel ต่อ guild
- `case_letter_config` — ข้อมูลออกหนังสือต่อ org+จังหวัด (org_name, address, signer_*, coordinator_*)

---

## 🔄 Lifecycle

`open` (รับเรื่องแล้ว) → `in_progress` (กำลังดำเนินการ) → `resolved` (แก้ไขแล้ว) / `closed` (ปิดเรื่อง) / `rejected` (ไม่รับดำเนินการ)

- ปิด/reject → ต้องเลือก `close_reason` + เขียน public note (แจ้งผู้ร้องเรียน)
- "รับเรื่อง" = เพิ่มตัวเองเข้า `case_assignees` → ping ทุกคนในกระทู้

### 👥 ผู้รับผิดชอบ — ทุกทางต้องผ่าน `web/lib/caseAssign.js` (2026-08-31)

`case_assignees` คือความจริง · `kanban_cards.owner_user_id` + `kanban_card_helpers` เป็น **สำเนา**
(ต่างจากสถานะที่การ์ดอ่านสด) → เขียนตารางเดียวแล้วจบ = เจ้าภาพดริฟต์ แบบที่เป็นมาถึง 2026-08-30

- ⛔ **ห้ามเรียก `addAssignee`/`removeAssignee` จาก route ตรงๆ** — service ตัวนี้ทำ 3 อย่างพร้อมกัน:
  เขียน `case_assignees` → `syncCaseCardPeople()` → ping เธรด Discord + `logAction`
- เจ้าภาพของการ์ด = **assignee คนแรก** (`assigned_at, user_id`) · ที่เหลือลงเป็น "คนช่วย"
- กดบนบอร์ด kanban (รับงาน / มอบหมาย / เพิ่มคนช่วย / ถอด) ก็เขียนลง `case_assignees` เหมือนกัน
  **มอบหมายให้คนใหม่ทั้งที่เคสมีคนรับแล้ว = ผู้รับผิดชอบร่วม ไม่ใช่แย่งเจ้าภาพ** (user เคาะ 2026-08-31)
  → API ตอบ `notice` กลับมาให้ UI บอก ไม่ปล่อยเงียบ
- ของเก่าที่ดริฟต์ไว้แล้วต้องกวาดครั้งเดียว: `scripts/kanban/syncCaseAssignees.mjs --org 1 [--dry]`

### 🗄️ เก็บเข้ากรุ / ลบถาวร (2026-08-31)

| ปุ่ม | ทำอะไร | ใครทำได้ | ย้อนได้ |
|---|---|---|---|
| **เก็บเข้ากรุ** | `cases.archived_at = now()` — หายจาก `/case`, ตัวนับหน้าแรก และบอร์ด kanban | คนที่ผ่าน `gateCase` | ✅ `PATCH { restore: true }` |
| **ลบถาวร** | `DELETE FROM cases` (ลูก CASCADE 3 ตาราง) + ลบการ์ด kanban + unlink ไฟล์แนบ | **admin** เท่านั้น | ❌ |

- ⭐ **เข้ากรุไม่กระทบหน้าติดตามสาธารณะ `/complaint/[ref]`** (user เคาะ 2026-08-31) —
  เข้ากรุคือการจัดบ้านภายใน ไม่ใช่คำตอบต่อผู้ร้อง · มีแต่ลบถาวรที่ทำให้หน้านั้น 404
- ⚠️ **ต้องลบการ์ด kanban ก่อนลบเคส** — `kanban_card_links` ทำ FK มาหา `cases` ไม่ได้ (entity ชี้ได้ 2 ตาราง)
- ⚠️ **ไฟล์แนบต้อง unlink เอง** — `uploads/cases/` ไม่มี gc (`scripts/posts/gc-media.js` กวาดแค่ `storage/posts`)
- ⭐ **ไม่แตะเธรด Discord** — โพสต์บอกในเธรดว่า "ปิดได้แล้ว" เท่านั้น (user เคาะ)
  แปลว่าข้อความในเธรดยังอยู่ = ลบไม่สะอาด 100% ถ้าต้องลบจริงต้องไปลบในดิสฯ เอง
- ⛔ เก็บเข้ากรุ/ลบถาวร **ทำที่ /case เท่านั้น** — บนบอร์ด kanban ปุ่มพวกนี้ถูกปิดสำหรับการ์ดที่ผูกของจริง

---

## 🛡️ Security

- **Anonymous upload** (`POST /api/case`): allowlist mime (jpg/png/webp/mp3/m4a/ogg) + ≤10MB + ≤3 ไฟล์ + honeypot + rate limit (เบอร์ 3/วัน, IP 10/วัน)
- ไฟล์แนบเก็บนอก `/public` เสิร์ฟผ่าน `/api/case/[ref]/attachments/[attId]` ที่ gate `caseworker` + scope
- ref random กัน enumerate · public page ref ผิด → 404 เป็นมิตร

---

## 🔧 Environment

| key | ใช้ทำ |
|---|---|
| `GUILD_ID` | guild หลักของ public intake |
| `DISCORD_BOT_TOKEN` | web → Discord REST (สร้าง thread + ping) |
| `THAIBULKSMS_API_KEY` / `_SECRET` / `_SENDER` | ส่ง SMS tracking link |
| `CASE_UPLOAD_DIR` | (optional) โฟลเดอร์เก็บไฟล์แนบ — default `../uploads/cases` |
| `NEXTAUTH_URL` | base URL ของลิงก์ติดตามใน SMS |

---

## 📂 ไฟล์หลัก

**Web:** `app/case/` (public + manage) · `app/api/case/` (submit + actions + attachments) · `db/cases.js` · `db/caseLetterConfig.js` · `lib/{caseAccess,caseUploads,caseDiscord,caseGate,sendSms,provinceCode,caseOptions}.js` · `components/case/`

**Bot:** `db/case.js` · `commands/{panel,case-import-context-menu,report}.js` · `handlers/caseImportHandler.js`

**Shared:** `config/{province-codes,case-options}.json`

---

## 🔄 Discord sync (timeline)

ปุ่ม "อัปเดต timeline" บนหน้า `/case/[ref]` → `POST /api/case/[ref]/timeline/refresh`

**กลไก = watermark** (`cases.last_synced_message_id` — ที่คั่นว่า sync ถึงข้อความไหนแล้ว)
ดึง Discord `?after=<watermark>` → ส่งข้อความใหม่ + timeline เดิม 30 รายการเข้า AI (Haiku) → insert + เลื่อนที่คั่น

- **insert กับเลื่อน watermark อยู่ใน transaction เดียว** — insert พัง = rollback = ที่คั่นไม่ขยับ = กดซ้ำได้ข้อมูลกลับมา (bug-060)
- **conditional UPDATE เป็น optimistic lock** — 2 คนกดพร้อมกัน คนที่ 2 ได้ 409 ไม่เกิด timeline ซ้ำ
- **ส่ง timeline เดิมเข้า prompt กันสกัดซ้ำ** — DB dedup (`ON CONFLICT discord_message_id`) ไม่ช่วย เพราะ AI-generated event ไม่มี message id (bug-061)
- cap 500 ข้อความ/ครั้ง — เธรดยาวกว่านั้นกดซ้ำเพื่อ sync ต่อ

### ไฟล์แนบจากเธรด — watermark เส้นที่ 2

ปุ่มเดียวกันยังนำเข้า **รูป/เสียง** ที่คนโพสต์ในเธรดด้วย (`lib/caseAttachmentSync.js`)

- watermark แยกเส้น `cases.last_attachment_message_id` — **เริ่มจาก NULL โดยตั้งใจ** → กดครั้งแรกกวาดตั้งแต่ข้อความแรกสุด = backfill รูปเก่าที่เส้น timeline เลยไปแล้วกลับคืนมาเอง ไม่ต้องเขียน script
- ต้อง**โหลด bytes มาเก็บเอง** — Discord CDN URL มี signature หมดอายุ เก็บแค่ URL ใช้ไม่ได้
- dedup ด้วย `case_attachments.discord_attachment_id` + partial unique index → กดซ้ำ/กวาดทับไม่เกิดไฟล์ซ้ำ (แถวจากฟอร์มเว็บเป็น NULL จึงไม่ติด index)
- ชนิดไฟล์ใช้ `isAllowedMime()` ตัวเดียวกับฟอร์ม intake (jpg/png/webp + mp3/m4a/ogg) · Discord ไม่ส่ง `content_type` เสมอ → เดาจากนามสกุลเป็นตัวสำรอง
- cap 20 ไฟล์/รอบ · **มีไฟล์ที่พลาดชั่วคราว (`failed>0`) = ไม่เลื่อน watermark** ปล่อยให้รอบหน้าเก็บตก (บทเรียนจาก bug-060)
- **ผลพลอยได้:** เคสที่เปิดจาก Discord (`caseImportHandler`) ได้ไฟล์แนบไปด้วย ไม่ต้องแก้ฝั่งบอท

**ข้อจำกัดที่รู้อยู่:** trigger ด้วยมือเท่านั้น (ไม่มี cron) · ข้อความที่ถูก edit ทีหลังไม่มีทางเข้า (`?after=` ดูแต่ ID ใหม่)

---

## ✏️ แก้ไขข้อมูลเคส

`PATCH /api/case/[ref]` · ปุ่มมุมขวาบน header card → modal (`components/case/CaseEditButton.jsx`)

- แก้ได้: `title` `detail` `category` `complainant_name` `complainant_phone` `complainant_line_id` (whitelist `EDITABLE_CASE_FIELDS`)
- 🔒 **`province` แก้ไม่ได้โดยตั้งใจ** — รหัสจังหวัดฝังใน `ref` ที่ส่ง SMS + เป็น public URL ไปแล้ว · และ `gateCase()` เช็ค scope จากจังหวัด**เดิม** เท่านั้น → ปล่อยแก้ = ผลักเคสข้ามจังหวัดแล้วตัวเองหลุด scope ทันที · ส่ง `province` มา = 400
- gate เดียวกับเปลี่ยนสถานะ (`manageCases` + province scope) **ไม่ต้องรับเคสก่อน** — คนที่ผ่าน gate เห็น PII เต็มอยู่แล้ว ห้ามแก้จึงกันความลับไม่ได้ กันได้แค่ integrity ซึ่ง audit log ทำแทน
- ⚠️ audit เก็บ **ชื่อ field ที่เปลี่ยนเท่านั้น ไม่เก็บค่า** — `audit_logs` ไม่มี province gate เก็บเบอร์/ชื่อลงไป = PII รั่วอ้อมกำแพง `getCaseByRefPublic`/`Full`
- แก้ `title` → โพสต์แจ้งในเธรด (ชื่อ thread เดิมจะค้าง) · แก้เบอร์ → เลือกส่ง SMS ลิงก์ติดตามซ้ำไปเบอร์ใหม่ได้

---

## ⏳ V2 (ยังไม่ทำ)

- charts แยกจังหวัด/ประเภท/สถานะ บน `/case` + flag "ซ่อนเคสจาก dashboard สาธารณะ" ต่อเคส
- **โอนเคสข้ามจังหวัด** เป็น action แยก (admin-only เช็ค scope ทั้งต้นทาง+ปลายทาง)
- auto-assign · cron poll AI · แยกห้อง noti ตามจังหวัด · CAPTCHA · SMS แจ้งตอนสถานะเปลี่ยน
- ~~ลบเคส~~ — **เคาะ 2026-07-28 ไม่ทำ** เคสร้องเรียนควรเก็บ record ตลอด "ปิดเรื่อง" ด้วยสถานะพอแล้ว

## 📮 CASES — รอบ 2026-07-28 (ยังไม่ commit)
> ย้ายมาจาก md/PENDING.md (2026-07-29)

> เข้ามาจากคำถาม "ลบ/แก้ไข case ได้ไหม" แล้วลากไปเจอบั๊ก Discord sync · กลไก sync + ข้อจำกัดเขียนไว้ที่ `md/case/CASE.md` หัวข้อ "🔄 Discord sync"

**✅ เสร็จรอบนี้ (ยังไม่ commit / ยังไม่เทสในเบราว์เซอร์):**
- **แก้บั๊ก watermark sync** (bug-060/061) — insert+เลื่อน watermark เป็น transaction เดียว (เดิม insert พังแต่ที่คั่นเลื่อนต่อ = ข้อความหายถาวร) · optimistic lock กันกดพร้อมกัน · ส่ง timeline เดิมเข้า prompt กัน AI สกัดซ้ำ · cap 500 ข้อความ/ครั้ง
- **แก้ไขข้อมูลเคส** — `PATCH /api/case/[ref]` + `CaseEditButton.jsx` (modal มุมขวาบน header) · แก้ได้: title/detail/category/ชื่อ/เบอร์/LINE · **province แก้ไม่ได้โดยตั้งใจ** (รหัสจังหวัดฝังใน `ref` ที่ส่ง SMS ไปแล้ว + `gateCase` เช็ค scope จากจังหวัดเดิม → ปล่อยแก้ = ผลักเคสข้ามจังหวัดแล้วตัวเองหลุด scope) · audit เก็บ**ชื่อ field เท่านั้น ไม่เก็บค่า** (`audit_logs` ไม่มี province gate = PII รั่วอ้อมกำแพง `getCaseByRefPublic/Full`)
- gate ของการแก้ = เดียวกับเปลี่ยนสถานะ (`manageCases` + province scope) **ไม่ต้องรับเคสก่อน** — เคาะ 2026-07-28 เหตุผล: คนที่ผ่าน gate เห็น PII เต็มๆ อยู่แล้ว ห้ามแก้จึงกันความลับไม่ได้ กันได้แค่ integrity ซึ่ง audit log ทำแทน

- [x] **นำเข้าไฟล์แนบ/รูปจากเธรด Discord ✅ เสร็จ 2026-07-28** — `lib/caseAttachmentSync.js` + watermark เส้นที่ 2 `cases.last_attachment_message_id` (เริ่ม NULL → รอบแรก backfill ทั้งเธรดเอง แก้ปมที่ watermark เส้นแรกเลยรูปเก่าไปแล้ว) · dedup `case_attachments.discord_attachment_id` partial unique index (**verify ด้วย SQL จริงแล้ว**: ยิงซ้ำ→0 rows ไม่ error, แถวฟอร์มเว็บ NULL ยังใส่ซ้ำได้) · โหลด bytes มาเก็บเอง (CDN URL หมดอายุ) ผ่าน `saveCaseBuffer()` ใหม่ · รวมกับปุ่ม refresh timeline เดิม · `failed>0` = ไม่เลื่อน watermark (บทเรียน bug-060) · **ผลพลอยได้: เคสที่เปิดจาก Discord ได้ไฟล์แนบด้วย ไม่ต้องแตะฝั่งบอท**
- [x] ~~ลบเคส~~ — **เคาะ 2026-07-28: ไม่ทำ** · "ปิดเรื่อง" ด้วยสถานะ `closed`/`rejected` + บังคับเหตุผล + public note ที่มีอยู่เพียงพอแล้ว · เคสร้องเรียนควรเก็บ record ไว้ตลอด ไม่ควรลบทิ้งได้อยู่แล้ว

## 📢 ระบบเรื่องร้องเรียน (Case System) — implement เสร็จ local · ดู `md/case/CASE.md`
> ย้ายมาจาก md/PENDING.md (2026-07-29)

> ยังไม่ deploy prod

### ⚠️ ก่อน deploy prod
1. รัน `scripts/migration/migration.sql` บน prod DB — สร้าง `case_config`/`cases`/`case_assignees`/`case_attachments`/`case_timeline`/`audit_logs`/`case_letter_config` + `letters` column (IF NOT EXISTS ปลอดภัย)
2. `./deploy.sh` ลง slash command ใหม่ (`/panel case` + context menu + `/report`)
3. เปิด feature: เพิ่ม `"cases"` ใน `dc_guild_config.enabled_features` + `/panel case` ตั้ง forum channel + `default_province`
4. สร้าง Discord role + map permission `caseworker` ใน `dc_guild_roles`
5. **เทสต์ happy-path จริง** (ฟอร์ม → SMS เข้าเบอร์ตัวเอง → forum thread เกิด) — ยังไม่ได้เทสต์เพราะ SMS ยิงจริง
6. **แก้ crontab บน prod** — `sync-act-events.js` ย้ายไป `scripts/data/` แล้ว ต้องอัปเดต path ใน crontab ของ `www`
7. ใส่ `case_letter_config` per-province ผ่าน DB INSERT

### ⏳ ต้องทดสอบหลัง deploy
- **Discord import จากกระทู้** — context menu `📋 นำเข้าเป็นเคสร้องเรียน` บนข้อความใน thread → modal → สร้าง case + AI สรุป (build แล้ว ยังไม่ได้ทดสอบจริง)

### 🔧 Backlog — Case System UX
- [x] **ปุ่มสีส้ม** — CaseNewForm + CaseManageActions ใช้ `bg-orange`/`bg-brand-orange` แล้ว
- [x] **URL `/complaint/new/[province]`** — route มีแล้ว (`/complaint/new` = picker, `/complaint/new/ราชบุรี` = fix จังหวัด)
- [x] **ถอนตัวจากเคส** (2026-07-14) — ปุ่ม "ถอนตัวจากเคสนี้" + `DELETE /api/case/[ref]/assign` (`removeAssignee`) + audit `case.unassigned`
- [x] **ลิงก์คลิกได้ Discord↔เว็บ** (2026-07-14) — ref ในข้อความ bot เป็นลิงก์ไปหน้า manage (base จาก `guild_config.web_base_url` → fallback `.env WEB_BASE_URL`) · หน้า manage โชว์ชื่อ+ลิงก์กระทู้ Discord
- [x] **รองรับ alias จังหวัด** (2026-07-14) — พิมพ์ "กรุงเทพ/กทม/กรุงเทพฯ" → normalize เป็น "กรุงเทพมหานคร" (`normalizeProvinceName`) ตอน import

### 🔄 Sync กระทู้เข้าระบบ — 2 ช่วง
- **Backfill** — script รัน 1 ครั้ง ดึงกระทู้เก่าทั้งหมดใน forum channel มาสร้าง case (skip ถ้ามี `discord_thread_id` แล้ว)
- **Manual** — context menu ทีละกระทู้ (สำหรับ historical ที่ bot พลาด)

**กระบวนการ sync — AI generate 3 ส่วน (เคาะแล้ว 2026-06-28):**
- format หัวข้อ = `[ประเภท] สาระสำคัญ — พื้นที่` เช่น `ถนนชำรุด ซ.วัดโพธิ์ หมู่ 3 — อ.โพธาราม ราชบุรี`
- เรื่องย่อ (`ai_summary`) — สรุปเนื้อหากระทู้ทั้งหมด
- timeline แยก table `case_timeline` (มี visibility control แยก)
  - schema: `(id, case_id, discord_message_id UNIQUE, body, is_public, occurred_at)`
  - partial unique index บน `discord_message_id` → dedup incremental
  - refresh: fetch message หลัง `last_synced_message_id` → AI คัด event → `INSERT ... ON CONFLICT DO NOTHING`
  - **Auto:** AI ตัดสิน is_public เอง (public=ความคืบหน้าทั่วไป, private=ชื่อ/เบอร์/นัดหมาย) → return JSON `[{ body, is_public, occurred_at }]`
  - **Manual:** caseworker เพิ่ม/แก้/toggle is_public รายตัวใน manage page
  - ต้องเพิ่มใน migration.sql + `web/db/cases.js` + `db/case.js` + backfillCaseThreads.js + tracking + manage page

### 🆕 Auto-import เมื่อสร้างกระทู้ใหม่ใน forum
- `threadCreate` listener ใน `index.js` → เช็คว่า thread อยู่ใน `case_config.forum_channel_id`
- auto สร้าง case: `source='discord'`, `province=case_config.default_province`, `title`=thread title, `detail`=first message, `created_by`=Discord ID ผู้สร้าง
- AI สรุป → `ai_summary` · โพสต์ใน thread: "✅ เข้าระบบแล้ว · ref: `XX-XX-XXXX`"
- ไฟล์: `index.js` + `handlers/caseImportHandler.js` (เพิ่ม `handleThreadCreate`)

### 📌 Audit Log — ยังไม่ wire
- `audit_logs` table + `web/db/auditLog.js` (fire-and-forget) มีแล้ว · ใช้ใน cases แล้ว
- **ยังไม่ wire:** finance/docs/calling routes + admin log page (V2)

### 🏛️ ระบบแนะนำหน่วยงาน + ช่องทางยื่น
- จาก category + ประเภทปัญหา → AI แนะนำว่าควรยื่นหน่วยงานไหน (ท้องถิ่น/จังหวัด/สภา/ชาติ)
- บอก workflow ติดตาม: ยื่นแล้วทำอะไรต่อ ภายในกี่วัน มีสิทธิ์อุทธรณ์ไหม
- ต้องคุย scope: AI-generated per case หรือ static knowledge base + AI overlay

### V2 (เลื่อน)
- Public dashboard charts (จังหวัด/ประเภท/สถานะ) + flag "ซ่อนเคสจาก dashboard"
- ปุ่ม "อัปเดต AI สรุป" ฝั่ง web (ต้องเพิ่ม AI SDK ใน web ก่อน) · auto-assign · cron poll · แยกห้อง noti ตามจังหวัด · CAPTCHA

