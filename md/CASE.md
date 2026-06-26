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

1. **Public web form** `/case/new?province=<ชื่อจังหวัด>` (ไม่ต้อง login)
   - province มาจาก URL (ผู้ประสานงานแชร์ลิงก์จังหวัดตัวเอง) · ไม่มี → dropdown picker
   - บังคับ: ชื่อ + เบอร์ + consent (PDPA) · optional: LINE id + ไฟล์แนบ
   - หลัง submit → SMS ลิงก์ติดตาม + สร้าง forum thread

2. **Discord import** — context menu `📋 นำเข้าเป็นเคสร้องเรียน` บนข้อความในกระทู้
   - modal กรอกจังหวัด (pre-fill จาก `case_default_province`) + ประเภท
   - กระทู้เดิม = thread ของเคส · AI สรุปกระทู้อัตโนมัติ (`ai_summary`)

---

## 🗺️ Routes

| Route | สาธารณะ? | หน้าที่ |
|---|---|---|
| `/case` | ✅ public | dashboard สาธารณะ + ช่องติดตาม ref + ปุ่มแจ้งใหม่ |
| `/case/new` | ✅ public | ฟอร์มแจ้งเรื่อง |
| `/case/[ref]` | ✅ public | ติดตามสถานะ + public note timeline (ไม่มี PII) |
| `/case/manage` | 🔒 caseworker | รายการเคส (scope-filtered) |
| `/case/manage/[ref]` | 🔒 caseworker | จัดการเคส (PII + actions) |

**กันหลุด PII ระดับโครงสร้าง:** หน้า public ใช้ `getCaseByRefPublic()` (query เฉพาะ field ปลอดภัย) · หน้าทีมงานใช้ `getCaseByRefFull()` หลังผ่าน gate

---

## 🔐 Permission & Scope

- permission `caseworker` (เพิ่มใน `lib/permissions.js` capability `manageCases`)
- `caseAccess.js`: `canManageCases(access)` · `canAccessCaseProvince(province, access)` · re-export `getUserScope`/`isAdmin` จาก callingAccess
- ทุก action API gate ผ่าน `lib/caseGate.js` (auth + permission + province scope)

---

## ⚙️ ตั้งค่า bot

```
/panel case channel:#ห้อง-forum-เรื่องร้องเรียน
```
- ต้องเป็น **forum channel** · เก็บใน `case_config.forum_channel_id`
- `case_default_province` (key ใน `dc_guild_config`) — จังหวัด pre-fill ตอน import

**deploy slash command ใหม่:** รัน `./deploy.sh` (มี `/panel case` + context menu + เปลี่ยน `/case` เก่าเป็น `/report`)

---

## 🗄️ Schema (5 ตาราง)

- `cases` — เคสหลัก (ref, province, category, title, detail, status, close_reason, complainant_*, discord_thread_id, ai_summary, intake_ip, consent_at)
- `case_notes` — timeline (is_public แยก internal/public)
- `case_assignees` — ผู้รับผิดชอบหลายคน/เคส
- `case_attachments` — ไฟล์แนบ (เก็บนอก /public)
- `case_config` — forum channel ต่อ guild

---

## 🔄 Lifecycle

`open` (รับเรื่องแล้ว) → `in_progress` (กำลังดำเนินการ) → `resolved` (แก้ไขแล้ว) / `closed` (ปิดเรื่อง) / `rejected` (ไม่รับดำเนินการ)

- ปิด/reject → ต้องเลือก `close_reason` + เขียน public note (แจ้งผู้ร้องเรียน)
- "รับเรื่อง" = เพิ่มตัวเองเข้า `case_assignees` → ping ทุกคนในกระทู้

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

**Web:** `app/case/` (public + manage) · `app/api/case/` (submit + actions + attachments) · `db/cases.js` · `lib/{caseAccess,caseUploads,caseDiscord,caseGate,sendSms,provinceCode,caseOptions}.js` · `components/case/`

**Bot:** `db/case.js` · `commands/{panel,case-import-context-menu,report}.js` · `handlers/caseImportHandler.js`

**Shared:** `config/{province-codes,case-options}.json`

---

## ⏳ V2 (ยังไม่ทำ)

- charts แยกจังหวัด/ประเภท/สถานะ บน `/case` + flag "ซ่อนเคสจาก dashboard สาธารณะ" ต่อเคส
- ปุ่ม "อัปเดต AI สรุป" ฝั่ง web (ดึง message ใหม่หลัง `last_synced_message_id`) — ต้องเพิ่ม AI SDK ใน web ก่อน
- auto-assign · cron poll AI · แยกห้อง noti ตามจังหวัด · CAPTCHA · SMS แจ้งตอนสถานะเปลี่ยน
