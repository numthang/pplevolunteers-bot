---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-09-01 (ดึก)

---

## ✅ Done (สรุปย่อ — รายละเอียดดู git log)

- **หนังสือร้องเรียน รื้อทั้งชุด — เสร็จ + swap เข้า `template.docx` แล้ว + commit แล้ว 2026-09-01 ดึก** (ยัง**ไม่ push**)
  - `generateComplaintLetter.js`: เลิก zip-swap โลโก้ → ใช้ `docxtemplater-image-module-free` (pattern เดียวกับ `generatePdf.js`) แทรกที่ tag `{%LOGO}` ตอน render · เพิ่ม `reference` → compose `reference_line` (ว่าง = ไม่โชว์บรรทัด) · เพิ่ม `nullGetter: () => ''` (บั๊กจริงที่เจอ: ไม่มีอันนี้ tag ว่างขึ้นคำว่า "undefined" ในเอกสาร — bug-20260901-letter-undefined-nullgetter)
  - `CaseLetterModal.jsx`: เพิ่มช่อง reference · attachments เป็น `<textarea>`+`useAutoGrow`
  - ลบ `buildComplaintLetterTemplate.mjs` + `template.base.docx` แล้ว (เลิกใช้ build step ถาวร)
  - verify: build ผ่าน, test 504/504 ผ่าน, เรนเดอร์จริงผ่าน `generateComplaintLetterPdf()` ตรงๆ (ไม่ผ่าน route) เช็ค PDF ภาพจริงทั้ง 2 กรณี (reference ว่าง/มีค่า) สะอาด ไม่มี `{`/`undefined` หลุด
  - ⬜ **ยังไม่ได้รัน mobile audit** ของช่อง reference/attachments ใหม่ (ต้อง login+case จริงเปิด modal — :3000 เป็นของ user ห้ามยุ่ง)
  - ⬜ **ยังไม่ได้เทสผ่าน route จริง** (authed preview + public capability URL) — เทสแค่เรียกฟังก์ชันตรงๆ เท่านั้น
  - ⬜ user ยังไม่ได้กดเองในแอป
- หนังสือร้องเรียน: ลิงก์ PDF สาธารณะไม่ต้องล็อกอิน (`7b0abc1`,`647915f`) — `caseLetterPdf.js` คือจุดประกอบร่วม 2 เส้นทาง, `logo_path` ต้องอยู่หลัง spread เสมอ (security)
- mobileAudit.mjs ใช้งานได้แล้ว (`8142a5f`,`1540f61`) — กับดักอยู่ `md/WEB.md §จอมือถือ`
- ค้าง prod: `cases.archived_at` migration ยังไม่ลง (รันท้าย `scripts/migration/migration.sql`), docs `docs_entry_recipient` view ลงแล้วแต่โค้ด 3 จุดยังไม่ deploy

---

## 🚀 Next quest

**Goal:** ปิดงานหนังสือร้องเรียน — เหลือ mobile audit + เทส route จริง (authed preview + public link) แล้วให้ user กดทดสอบเอง จากนั้นค่อย push

**คิวรอง (ยังไม่แตะ):** `web/app/{calling,posts,docs}/layout.js:10` `-mx-3`→`-mx-1` · `/integrations` ตารางต้อง
`overflow-x-auto` · `/posts` การ์ด `rounded-xl`→`rounded-lg` (ผลสแกนเต็มที่ `md/PENDING.md §📱 Mobile layout`)

---

## Context

- Branch `master` · **ยังไม่ push**
- `md/TEAM/TEE.md`, `.wolf/anatomy.md` ไม่ใช่ของ session นี้
- ⚠️ หลาย session ทำงานพร้อมกันบน repo นี้ → **commit ด้วย path เจาะจงเสมอ ห้าม `git add -A`**
- ห้ามรายงานสถานะ prod จากเอกสาร (`md/PENDING.md` เป็นบันทึก ไม่ใช่สถานะสด) → ถาม user
- `.env` ผูกกับบอท **"Tester"** · user เปิด dev server ค้างที่ `:3000` → รันเองใช้
  `NEXT_DIST_DIR=.next-test npx next dev -p 3100` · **ห้าม `rm -rf web/.next`**

---

## 🔧 Commands

```bash
node scripts/dev/mobileAudit.mjs --routes /หน้า   # ก่อนปิดงาน UI ทุกครั้ง
cd web && npm test                                # vitest 504 tests
openwolf find <symbol>   ·   openwolf bug search "<error>"
```

## 📚 References
`md/PENDING.md` (backlog ตัวจริง · `NOTE.md` ห้ามแตะ) · `md/case/CASE.md` · `md/WEB.md §จอมือถือ` `§Type scale` ·
`.wolf/cerebrum.md` (Do-Not-Repeat) · `.wolf/buglog.json` (273 bugs)
