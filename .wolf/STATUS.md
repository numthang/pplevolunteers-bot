---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-09-01

---

## ✅ Done

### 📱 ตัวตรวจ layout มือถือ + /kanban ไม่ล้น (`8142a5f`, `1540f61` · 2026-09-01)
- **`scripts/dev/mobileAudit.mjs`** (+ `.routes.mjs`) — zero dependency ขับ chrome headless ผ่าน CDP
  `node scripts/dev/mobileAudit.mjs --routes /kanban` · `--all --width 320 --shot --debug` · exit 1 = ยังล้น
  อาการ: `A` หน้ากว้างเกิน · `D` จอถูกถ่าง · `B` element ล้นขอบ · `C` โดน overflow-hidden ตัด
  · `E` ตัวควบคุมไม่เต็มความกว้าง (**แนะนำ ไม่ทำให้ exit 1**)
- **⛔ 3 กับดักที่เสียเวลาไปแล้ว** (ละเอียดที่ `md/WEB.md §จอมือถือ` + cerebrum + bug-464):
  1. Chrome **ถ่าง viewport เองเมื่อเนื้อหาล้น** (สั่ง 375 ได้ `innerWidth` 409) แล้วย่อทั้งหน้า →
     วัดเทียบ `innerWidth` = "ไม่ล้น" ทั้งที่หน้าแหกจริง · **ต้องเทียบความกว้างจอที่สั่ง** (DevTools ก็หลอกตาแบบเดียวกัน)
  2. **`html { font-size: 18px }`** (`globals.css:22`) → `w-64` = **288px ไม่ใช่ 256** · rem ทุกตัว +12.5%
  3. Tailwind arbitrary value ต้องใช้ `_` แทนเว้นวรรค — `calc(100vw-1.5rem)` CSS ทิ้งทั้งบรรทัด**เงียบๆ**
- **/kanban ผ่าน 320/360/375/390px** — `Segmented` hybrid (มือถือ `<select>` + จำนวนในวงเล็บ · จอกว้างแถบปุ่มเดิม) ·
  ตัดป้าย "แสดง" บนมือถือ (เหลือใน `aria-label`) · dropdown+ช่องค้นหาเต็มความกว้าง · panel ลอย 6 จุดใส่ `max-w` ·
  เมนู "เรียงลำดับ" `static sm:relative` · `FieldRow` `flex-wrap` · `CardModal` `p-4 sm:p-6`
- `CLAUDE.md` บังคับรัน audit ก่อนปิดงาน UI · `/designqc` เขียนใหม่ (`openwolf designqc` **ตายแล้ว** ใน 2.5.0)
- verify: eslint · `npm test` 504/504 · audit 4 ความกว้าง · ดูรูปจริง — ⬜ **user ยังไม่ได้กดในมือถือจริง**

### หน้าเคส `/case/[ref]` ยกเครื่อง (2026-08-31 · ⬜ ยังไม่กดทดสอบ)
- โมดัลแก้ไขถูกลบ → แก้ในหน้า + autosave (`web/components/case/useCaseAutosave.js`)
  ⚠️ `title` เซฟตอน blur/Enter เท่านั้น (PATCH ที่แตะ title โพสต์ลงเธรด Discord ทุกครั้ง) ·
  PATCH คืน `fields` ที่ normalize แล้วให้ client sync · ช่องบังคับที่ว่างกันยิงที่ client
- เปลี่ยนสถานะ = บันทึกทันที ยกเว้น closed/rejected (เขียน `public_note` ที่ผู้ร้องเรียนเห็น)
- **ห้ามแก้ `template.docx` ด้วยมือใน Word** — แก้ `scripts/buildComplaintLetterTemplate.mjs` แล้วรันใหม่
- กฎถาวร: ทุก `<textarea>` ยืดตามข้อความผ่าน `web/lib/useAutoGrow.js`

### ค้างจากรอบก่อน (ต้องจำ)
- **`cases.archived_at` migration ยังไม่ลง prod** — ก่อน deploy รันท้าย `scripts/migration/migration.sql`
  แล้ว `node scripts/kanban/syncCaseAssignees.mjs --org 1 --dry` ก่อนของจริง
- Docs — view `docs_entry_recipient` ลง prod แล้ว แต่**โค้ด 3 จุดยังไม่ deploy** · ผู้รับเงินคนนอกยังไม่ push

---

## 🚀 Next quest

**Goal:** ปิดงานมือถือให้ครบทุกโซน — ที่เหลือแก้คำเดียว (ผลสแกนเต็มอยู่ `md/PENDING.md §📱 Mobile layout`)

| File | ทำอะไร |
|---|---|
| `web/app/{calling,posts,docs}/layout.js:10` | `-mx-3` → **`-mx-1`** ให้ตรงกับ `main px-1` (`app/layout.js:64`) · `app/kanban/layout.js` ทำถูกอยู่แล้ว |
| `/integrations` ตาราง API docs | ครอบ `<div className="overflow-x-auto">` (ล้น 79px · ตารางอ้างอิง ปัดแนวนอนได้) |
| `/posts` การ์ด `rounded-xl p-4` | `E` เหลือที่ว่าง 330px + `rounded-xl` ผิดกฎการ์ด (`rounded-lg`) — ดูด้วยตาก่อนแก้ |

**Acceptance:** `--all` เหลือ 0 หน้าที่ล้น (E เหลือได้ถ้าอธิบายได้) · `sm:-mx-4` ห้ามแตะ · ส่งรูป before/after 375px ก่อน commit
**ไม่มี open decision** — user เคาะแล้วว่าสแกนทุกโซน แก้ /kanban ก่อน ซึ่งจบแล้ว

**คิวถัดไป (มี decision ค้าง):** timeline เคสที่ AI สกัด "ไม่ละเอียดพอ" — `config/aiPrompts.js:165` ·
`web/app/api/case/[ref]/timeline/refresh/route.js:100` (`maxTokens: 1024`) · `CaseTimeline.jsx:12` (`LONG_BODY_LENGTH`)
⚠️ **ถาม user ก่อน:** prompt ใหม่ไม่มีผลกับ event เก่า (watermark `cases.last_synced_message_id`) →
ต้องถอย watermark **และ** ลบ event เก่า แต่ `case_timeline` ปน `source='ai'` กับที่คนพิมพ์เอง

---

## Context

- Branch `master` · **ยังไม่ push**
- ⚠️ **มีหลาย session ทำงานพร้อมกันบน repo นี้** — รอบที่แล้วชนกลาง `KanbanHome.jsx` จริง
  → เช็ค `stat -c '%y'` ก่อนแก้ไฟล์ที่ไม่ใช่ของตัวเอง · **commit ด้วย path เจาะจงเสมอ ห้าม `git add -A`**
- ไฟล์ค้างใน tree ตอนนี้ (`commands/panel.js`, `db/case.js`, `handlers/caseImportHandler.js`,
  `scripts/migration/migration.sql`, `web/templates/complaint/template.docx`) = **ของอีก session** ห้ามเผลอ commit
- **ห้ามรายงานสถานะ prod จากเอกสาร** — `md/PENDING.md` เป็นบันทึก ไม่ใช่สถานะสด → ถาม user
- `.env` เครื่องนี้ผูกกับบอท **"Tester"** ไม่ใช่ MunMuang จริง · user เปิด dev server ค้างที่ `:3000`
  (จะรันเองต้อง `NEXT_DIST_DIR=.next-test npx next dev -p 3100` · **ห้าม `rm -rf web/.next`** — cache ใช้ร่วมกัน)

---

## 🔧 Commands

```bash
node scripts/dev/mobileAudit.mjs --routes /หน้า   # ก่อนปิดงาน UI ทุกครั้ง
cd web && npm test                                # vitest 504 tests
openwolf find <symbol>   ·   openwolf bug search "<error>"
```

## 📚 References
`md/PENDING.md` (backlog ตัวจริง · `NOTE.md` ห้ามแตะ) · `md/WEB.md §จอมือถือ` `§Type scale` ·
`.wolf/cerebrum.md` (Do-Not-Repeat) · `.wolf/buglog.json` (249 bugs)
