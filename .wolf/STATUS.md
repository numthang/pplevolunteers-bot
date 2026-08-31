---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-08-31 (เย็น)

---

## ✅ Done

### 📱 ตรวจ layout มือถือเองได้แล้ว + แก้ /kanban (2026-08-31 กลางคืน · ⬜ **user ยังไม่ได้กดทดสอบ**)
- **ของใหม่: `scripts/dev/mobileAudit.mjs`** (+ `mobileAudit.routes.mjs`) — zero dependency
  `node scripts/dev/mobileAudit.mjs --routes /kanban` · `--all` · `--width 320` · `--shot` · `--debug`
  ขับ google-chrome headless ผ่าน CDP (WebSocket ในตัวของ Node 24) · login ด้วย insert `org_login_tokens`
  ⛔ **ต้องวัดเทียบความกว้างจอที่สั่ง ไม่ใช่ `innerWidth`** — Chrome ถ่าง viewport เองเมื่อเนื้อหาล้น (bug-464)
- **แก้ /kanban แล้ว: ไม่ล้นที่ 375px** (`--routes /kanban` ผ่าน)
  - `Segmented` เป็น hybrid: `sm:hidden` = `<select>` · `hidden sm:inline-flex` = แถบปุ่มเดิม
  - `FieldRow.jsx` ช่องค่าเติม `flex-wrap` · `CardModal.jsx` `p-6` → `p-4 sm:p-6`
  - `ChecklistFieldBox.jsx` ปุ่มลบเห็นได้บนจอสัมผัส (`opacity-100 sm:opacity-0 sm:group-hover:…`)
- กฎถาวร: `md/WEB.md §จอมือถือ` (งบความกว้างจริงที่ 375 = **336px**) · `CLAUDE.md` บังคับรัน audit ก่อนปิดงาน
  · `.claude/commands/designqc.md` เขียนใหม่ (`openwolf designqc` ตายแล้วใน openwolf 2.5.0)
- ผลสแกน 16 โซนอยู่ `md/PENDING.md §📱 Mobile layout` — เหลือ `/calling` `/posts` `/docs` (`-mx-3`→`-mx-1`) + `/integrations` (ตารางล้น 79px)
- **รอบเก็บตก 2026-09-01 (หลัง session อื่นปล่อย `KanbanHome.jsx`) — ทำครบแล้ว:**
  - เลขในวงเล็บใน dropdown "แสดง" (`scopeCounts`) · คีย์ `kanban.controls.optionWithCount`
  - **มือถือ: ตัดป้าย "แสดง" ออก (เหลือใน `aria-label`) · dropdown + แถบค้นหาเต็มความกว้าง** (user สั่ง)
  - `max-w-[calc(100vw_-_1.5rem)]` ที่ panel 6 จุด · เมนู "เรียงลำดับ" เป็น `static sm:relative` (เกาะขอบแถวบนมือถือ)
  - ช่องกำหนดส่งในโมดัลเติม `w-full min-w-0` (เดิมไม่มี ต่างจาก pattern ร่วมใน `CardFieldsBox.jsx:106`)
- **audit เพิ่มอาการ `E`** (แถวที่มี select/input แล้วเหลือที่ว่างท้ายแถว > 32px = ไม่เต็มความกว้าง)
  ตามที่ user สั่ง — เป็นคำแนะนำ ไม่ทำให้ exit 1
- ⛔ **`html { font-size: 18px }`** (`globals.css:22`) → `w-64` = 288px ไม่ใช่ 256 · จดไว้ที่ `md/WEB.md` + cerebrum
- ⛔ Tailwind arbitrary value ต้องใช้ `_` แทนเว้นวรรค: `calc(100vw_-_1.5rem)` (เขียนผิดเองมาแล้ว 6 จุด CSS ทิ้งเงียบๆ)
- verify: eslint ผ่าน · `npm test` 504/504 · audit `/kanban` ผ่าน **320 / 360 / 375 / 390px** · ดูรูปจริงแล้ว


### รอบล่าสุด — หน้าเคส `/case/[ref]` ยกเครื่อง (2026-08-31 เย็น · ⬜ **user ยังไม่ได้กดทดสอบในเบราว์เซอร์**)
- **เลิกใช้โมดัลแก้ไข → แก้ในหน้า + autosave** · `CaseEditButton.jsx` ถูกลบ
  โครงคอลัมน์เลียนแบบ `/posts/[id]` (`lg:grid-cols-[1fr_360px]`):
  ซ้าย = เนื้อหา (หัวข้อ/รายละเอียด/สรุป AI) + ปุ่มลบมุมขวาล่าง + timeline ·
  ขวา = ไฟล์แนบ → จัดการเคส → ข้อมูลเคส (รวมผู้รับผิดชอบ) → ผู้ร้องเรียน
- hook กลาง `web/components/case/useCaseAutosave.js` — debounce 800ms · คิวคำขอเรียงตัว · ป้ายสถานะ · `beforeunload`
  - ⚠️ **`title` เซฟตอน blur/Enter เท่านั้น** (`manualKeys`) — PATCH ที่แตะ title โพสต์แจ้งลงเธรด Discord ทุกครั้ง
  - ⚠️ PATCH คืน `fields` ของค่าที่เปลี่ยนกลับมา (เบอร์ผ่าน `normalizePhone` แล้ว) ให้ client sync เข้ากล่อง
  - ⚠️ ช่องบังคับที่ว่างระหว่างพิมพ์ = กันที่ client ไม่ยิง (ไม่งั้นโดน 400 รัวๆ)
- **เปลี่ยนสถานะ = บันทึกทันที ไม่มีปุ่มอัปเดต** · ยกเว้น closed/rejected ที่ยังต้องกดยืนยัน
  เพราะ `public_note` ถูกเขียนเป็น timeline **สาธารณะ** ที่ผู้ร้องเรียนเห็น
- ปุ่มส่ง SMS ซ้ำ = คำสั่งเดี่ยว `PATCH { resend_sms: true }` (branch ใหม่ใน `api/case/[ref]/route.js`)
- แก้ได้เฉพาะคนที่ผ่าน `canManageCases` — คนอื่นเห็นเป็นข้อความ ไม่ใช่ช่องกรอกที่กดแล้วเด้ง 403
- **หนังสือร้องเรียน**: เทมเพลตมีโลโก้ + footer จริงชิดขวาก้นหน้าแล้ว
  สร้างด้วย `scripts/buildComplaintLetterTemplate.mjs` — **ห้ามแก้ `template.docx` ด้วยมือใน Word**
  (ไบนารี diff ไม่ได้ + รูปแบบ link-to-file คือเหตุที่ "โลโก้หาย" มาก่อน) แก้สคริปต์แล้วรันใหม่
- **กฎใหม่ถาวร**: ทุก `<textarea>` ต้องยืดตามข้อความ ใช้ hook กลาง `web/lib/useAutoGrow.js`
  (user ทักซ้ำหลายรอบ) → จดที่ `md/WEB.md` §Component Patterns + cerebrum + memory
- verify: `npm run build` + eslint ผ่าน · เรนเดอร์ PDF จริงดูด้วยตา (โลโก้ขึ้น · footer ชิดขวา)

### ยังค้างจากรอบก่อนๆ (ต้องจำ)
- **`cases.archived_at` migration ยังไม่ลง prod** — ก่อน deploy: รันท้าย `scripts/migration/migration.sql`
  แล้ว `node scripts/kanban/syncCaseAssignees.mjs --org 1 --dry` ก่อนของจริง (dev = 0/0, prod ยังไม่นับ)
- sync ผู้รับผิดชอบเคส ↔ การ์ด kanban 2 ทิศ ผ่าน `web/lib/caseAssign.js` (ทางเดียวที่เปลี่ยนคนได้)
- Docs — ตัวตนผู้รับเป็น "ต่อคน" ไม่ใช่ "ต่อใบ" (view `docs_entry_recipient`) · **SQL ลง prod แล้ว 10:05**
  แต่ **โค้ด 3 จุดยังไม่ deploy** (เก็บ `title` ลง `docs_self_info` ×2 route + `verify` has_self_info)
- Docs ผู้รับเงินคนนอก: code เสร็จ ยังไม่ push/deploy · migration ลง dev แล้ว prod ยังไม่รัน

---

## 🚀 Next quest

**Goal:** timeline เคสที่ AI สกัดออกมา "ไม่ละเอียดพอ" — ทำให้ได้เนื้อครบใจความ

| File | ทำอะไร |
|---|---|
| `config/aiPrompts.js:165` | prompt `case.timeline` — ปรับกฎ `body` ให้ยาว/ละเอียดขึ้น |
| `web/app/api/case/[ref]/timeline/refresh/route.js:100` | `maxTokens: 1024` → เพิ่ม (ตัวจำกัดจริงที่ทำให้ event ขาด) |
| `web/components/case/CaseTimeline.jsx:12` | `LONG_BODY_LENGTH = 180` → เพิ่ม ไม่งั้น body ยาวขึ้นแล้วโดนตัด `…` หมด |

**Acceptance criteria**
1. กด refresh timeline บนเคสที่มีเธรด Discord จริง แล้ว event มีบริบท เหตุ→ดำเนินการ→ผลลัพธ์ ครบ ไม่ห้วน
2. body ยาวขึ้นแล้วยังอ่านได้ในหน้าเคส (ไม่โดน truncate ทันทีทุกใบ)
3. ของเดิมใน DB ไม่หาย · กดซ้ำไม่ได้ timeline ซ้อน

**⚠️ Open decision — ต้องเคาะก่อนลงมือ: จะ reset timeline เก่ายังไง**
prompt ใหม่ไม่มีผลกับ event ที่สกัดไปแล้ว — route ใช้ watermark `cases.last_synced_message_id`
ต้องถอย watermark **และ** ลบ event เก่า แต่ `case_timeline` ปน source `'ai'` กับที่คนพิมพ์เอง
→ ตัวเลือก: ลบเฉพาะ `source='ai'` + reset watermark ต่อเคส (ปุ่มใน UI? script?) — **ถาม user ก่อน**

**Open decision อีกข้อ (เล็ก):** ตราองค์กรบนหัวหนังสือตอนนี้เป็นมาสคอต ไม่ใช่ตราพรรค —
user ส่งไฟล์มาเมื่อไหร่ วางแทน `web/public/logo.png` แล้วรันสคริปต์ 1 บรรทัด (ดู `md/PENDING.md`)

---

## Context

- Branch `master` · **ยังไม่ push** · `.wolf/STATUS.md` อยู่ใน `.gitignore`
- ⬜ **ยังไม่มีใครกดทดสอบในเบราว์เซอร์**: หน้าเคสรอบนี้ · แยก route `/case` ↔ `/complaint` ·
  identity edit จาก kanban modal · Kanban ทั้งก้อน · Posts กันเซฟทับกัน · Docs คนนอก
- **ห้ามรายงานสถานะ prod จากเอกสาร** — prod ไม่ได้อยู่เครื่อง dev, `md/PENDING.md` เป็นบันทึกไม่ใช่สถานะสด → ถาม user
- `.env` เครื่องนี้ผูกกับบอท **"Tester"** ไม่ใช่ MunMuang จริง — ห้าม verify state ของ prod ผ่าน token นี้
- user เปิด dev server ที่ `:3000` ค้างไว้ — จะรันเองต้อง `PORT=3100 NEXT_DIST_DIR=.next-test`

---

## 🔧 Useful commands

```bash
cd web && npm test                     # vitest (486 tests)
cd web && NEXT_DIST_DIR=.next-verify npx next build --no-lint
node scripts/buildComplaintLetterTemplate.mjs      # สร้างเทมเพลตหนังสือใหม่
openwolf find <symbol>                 # หาไฟล์/symbol ก่อนอ่าน
openwolf bug search "<error>"          # ก่อนแก้บั๊กทุกครั้ง
```

## 📚 References
- `md/PENDING.md` — backlog ตัวจริง (entry point ทุก session) · `NOTE.md` ห้ามแตะ
- `.wolf/cerebrum.md` — Do-Not-Repeat + User Preferences · `.wolf/buglog.json` — 212 bugs
