---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-08-30

---

## ✅ Done

### รอบล่าสุด (2026-08-30 · ยังไม่ commit)
- **แยก route CASES**: public (แจ้ง/ติดตามเรื่อง) ย้าย `/case*` → **`/complaint*`**
  จัดการเคส (เดิม `/case/manage`) ย้ายขึ้นเป็น **`/case`** ตรงๆ (list) + `/case/[ref]` (detail) — ตาม pattern docs/calling/posts
  ปุ่ม "+เพิ่มเรื่องร้องเรียน" บน `/case` → ลิงก์ `/complaint/new` (ของสาธารณะเดิม)
- แก้ลิงก์ตามทั่ว repo: `page.js`/`Nav.jsx`/`db/case.js`(บอท)/`kanban/statusSql.js`
- ⚠️ `case/layout.js` redirect เมื่อไม่ผ่านสิทธิ์ต้องชี้ `/complaint` ห้ามชี้ `/case` (วนลูป — layout ครอบตัวเอง)
- เพิ่ม i18n `case.manage.addButton` · build ผ่าน (`NEXT_DIST_DIR=.next-verify`) เห็นทั้ง `/case`,`/case/[ref]`,`/complaint*`

### ก่อนหน้า (ยังต้องจำ)
- 2026-08-29 (`a2f5b7f`): owner แก้ login info ให้สมาชิกที่ล็อกตัวเองออกจาก Discord ได้ (ต้องมีหลักฐาน OTP/verify-link) · audit log role change · vitest 486/486 ผ่าน
- Backfill กระทู้สื่อ → posts+kanban **ขึ้น prod แล้ว** 708 ใบ (พลาด 1 จาก Discord 429)
- Docs ผู้รับเงินคนนอก: code เสร็จ **ยังไม่ push/deploy** · migration ลง dev แล้ว prod ยังไม่รัน

---

## 🚀 Next quest

**Goal:** timeline เคสที่ AI สกัดออกมา "ไม่ละเอียดพอ" — ทำให้ได้เนื้อครบใจความ

### Files
| File | ทำอะไร |
|---|---|
| `config/aiPrompts.js:165` | prompt `case.timeline` — ปรับกฎ `body` ให้ยาว/ละเอียดขึ้น |
| `web/app/api/case/[ref]/timeline/refresh/route.js:100` | `maxTokens: 1024` → เพิ่ม (ตัวจำกัดจริงที่ทำให้ event ขาด) |
| `web/components/case/CaseTimeline.jsx:12` | `LONG_BODY_LENGTH = 180` → เพิ่ม ไม่งั้น body ยาวขึ้นแล้วโดนตัด `…` หมด |

### Acceptance criteria
1. กด refresh timeline บนเคสที่มีเธรด Discord จริง แล้ว event มีบริบท เหตุ→ดำเนินการ→ผลลัพธ์ ครบ ไม่ใช่ประโยคห้วน
2. body ยาวขึ้นแล้วยังอ่านได้ในหน้าเคส (ไม่โดน truncate ทันทีทุกใบ)
3. ของเดิมใน DB ไม่หาย และกดซ้ำไม่ได้ timeline ซ้อน

### ⚠️ Open decision — ต้องเคาะก่อนลงมือ
**จะ reset timeline เก่ายังไง** — prompt ใหม่ไม่มีผลกับ event ที่สกัดไปแล้ว เพราะ:
- route ใช้ **watermark** `cases.last_synced_message_id` → ข้อความที่ sync ไปแล้วไม่ถูกอ่านซ้ำ
- ต้องถอย watermark **และ** ลบ event เก่า แต่ `case_timeline` ปนกัน 2 source: `'ai'` กับที่คนพิมพ์เอง
- → ตัวเลือก: ลบเฉพาะ `source='ai'` + reset watermark ต่อเคส (ปุ่มใน UI? script?) — **ยังไม่เคาะ ถาม user ก่อน**

---

## 📁 Context

- **Branch `master`, working tree สะอาด** · commit ล่าสุด `a2f5b7f` · **ยังไม่ push**
- **`.wolf/STATUS.md` อยู่ใน .gitignore** — handoff รอบก่อนหายตอนย้ายเครื่อง เนื้อหาถูกกู้จาก commit message `a2f5b7f`
- **ห้ามรายงานสถานะ prod จากเอกสาร** — prod ไม่ได้อยู่เครื่อง dev, PENDING.md เป็นบันทึกไม่ใช่สถานะสด → ถาม user
- `.env` เครื่องนี้ผูกกับบอท **"Tester"** ไม่ใช่ MunMuang จริง — ห้าม verify state ของ prod ผ่าน token นี้

---

## ⚠️ ยังไม่มีใครกดทดสอบในเบราว์เซอร์ (build ผ่านอย่างเดียว)
- แยก route CASES (`/case` จัดการเคส + `/complaint` สาธารณะ) — รอบล่าสุด
- identity edit จาก kanban modal
- Kanban module ทั้งก้อน · Posts กันเซฟทับกัน · Docs คนนอก (Export PDF ใบคนนอกยังไม่เคยกดจริง)

---

## 🔧 Useful commands

```bash
cd web && npm test                     # vitest (486 tests)
cd web && PORT=3100 NEXT_DIST_DIR=.next-test npm run dev   # user เปิด :3000 ค้างไว้ ห้ามชน
openwolf find <symbol>                 # หาไฟล์/symbol ก่อนอ่าน
openwolf bug search "<error>"          # ก่อนแก้บั๊กทุกครั้ง
```

---

## 📚 References
- `md/PENDING.md` — backlog ตัวจริง (entry point ทุก session) · `NOTE.md` ห้ามแตะ
- `.wolf/cerebrum.md` — Do-Not-Repeat + User Preferences · `.wolf/buglog.json` — 191 bugs
