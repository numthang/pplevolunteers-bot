---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-09-01 (เย็น)

---

## ✅ Done

### 📄 หนังสือร้องเรียน — ลิงก์ PDF สาธารณะ + ลบร่าง (`7b0abc1`, `647915f` · 2026-09-01)
- **ลิงก์ PDF เปิดได้ไม่ต้องล็อกอิน** `GET /complaint/[ref]/letter/[draftId]` (route handler ไม่มี gate)
  · capability URL: ความลับคือ draftId (uuid ใน `cases.letters`) รู้แค่ ref เปิดไม่ได้ · ลบร่าง = 404 ทันที
  · **สร้าง PDF สดทุกครั้ง ไม่แช่ไฟล์** (user เคาะ) → แก้ร่างแล้วลิงก์เดิมได้ฉบับใหม่ + หัวจดหมายตาม config ล่าสุด
- **`web/lib/caseLetterPdf.js`** = ตัวประกอบ PDF ที่ใช้ร่วมกัน 2 ทาง (พรีวิวในโมดัล + ลิงก์สาธารณะ)
  ⚠️ แก้ที่นี่ที่เดียวเสมอ · `logo_path` ต้องอยู่**หลัง** spread ของ letterFields (ไม่งั้น client สั่งอ่านไฟล์ไหนก็ได้)
- `CaseLetterModal.jsx`: ปุ่ม "ย้อนกลับ" โผล่ทันทีหลังบันทึกร่างแรก · แถวร่างมี 3 ไอคอน (เปิด/คัดลอก/ลบ)
  · fix `onClick={loadAiDraft}` ส่ง SyntheticEvent แทน signerDefaults → ช่องผู้ลงนามว่าง (bug-20260901)
- verify: build ผ่าน · vitest 504/504 · **กดจริงใน headless Chrome 375px ครบลูป** · curl ไม่มี cookie ได้ PDF จริง
  ⬜ user ยังไม่ได้กดเอง

### 📱 ตัวตรวจ layout มือถือ (`8142a5f`, `1540f61`)
- `node scripts/dev/mobileAudit.mjs --routes /หน้า` · exit 1 = ยังล้น · /kanban ผ่าน 320-390px แล้ว
- ⛔ กับดักทั้งชุด (Chrome ถ่าง viewport เอง · `html{font-size:18px}` · Tailwind `_`) อยู่ `md/WEB.md §จอมือถือ`

### ค้างจากรอบก่อน (ต้องจำ)
- **`cases.archived_at` migration ยังไม่ลง prod** — รันท้าย `scripts/migration/migration.sql` แล้ว
  `node scripts/kanban/syncCaseAssignees.mjs --org 1 --dry` ก่อนของจริง
- Docs — view `docs_entry_recipient` ลง prod แล้ว แต่โค้ด 3 จุดยังไม่ deploy

---

## 🚀 Next quest

**Goal:** รื้อ "หนังสือร้องเรียน" ทำใหม่ทั้งชุด — user จะส่ง **เทมเพลต `.docx` ใหม่** มาให้ (เคาะแล้วว่า docx ไม่ใช่ odt)

**สภาพปัจจุบันของราง (อย่า re-derive):**
| จุด | สภาพ |
|---|---|
| `web/lib/generateComplaintLetter.js` | PizZip + docxtemplater → LibreOffice → PDF · สลับโลโก้โดยเขียนทับ `word/media/logo.png` ใน zip |
| `web/templates/complaint/template.docx` | ของจริงที่ใช้อยู่ · มี placeholder 11 ตัว |
| `template-v2.docx` / `template-v2.odt` | ร่างของ user (untracked) — **ยังไม่มี placeholder สักตัว** เป็นแค่ layout |
| `scripts/buildComplaintLetterTemplate.mjs` | กฎเดิม: "ห้ามแก้ template.docx ด้วยมือ ให้แก้ script แล้ว build" |

placeholder ที่โค้ดส่งให้ตอนนี้: `{org_name} {address} {date} {subject} {recipient_title} {recipient_name}
{attachments} {body} {signer_name} {signer_position} {signer_phone_line}`

**✅ user เคาะแล้ว (2026-09-01 เย็น):**
1. งานนี้ **ส่วนใหญ่เป็น layout** — ไม่ได้รื้อ flow (ไม่มีเลขที่หนังสือ/ทะเบียนส่ง/ผู้รับหลายราย ในรอบนี้)
2. **เลิกใช้ `buildComplaintLetterTemplate.mjs`** → docx ที่ user ทำมือคือตัวจริง commit เข้า repo
   (เหตุผล: งาน layout ต้องลากเองใน LibreOffice · สคริปต์เคยล้างตราพรรคที่ user ยัดมือทุกครั้งที่รัน)
   ⚠️ แลกกับ git diff อ่านไม่ออก → ต้องจดว่าเวอร์ชันไหนเปลี่ยนอะไร ก่อน commit ทับ
   ⚠️ โค้ดสลับโลโก้ยิงที่ entry `word/media/logo.png` — docx ที่ Word/LO สร้างจะชื่อ `image1.png`
      → ตอนไฟล์มาถึงต้องเช็ค `unzip -l` แล้วปรับชื่อ entry หรือปรับค่าคงที่ในโค้ดให้ตรง
3. placeholder เพิ่ม 2 อย่าง:
   - `{reference}` (อ้างถึง) — **ต้องทำเป็น section `{#reference}อ้างถึง {reference}{/reference}`**
     ไม่งั้นเว้นว่างแล้วเหลือบรรทัดเปล่าค้างในหนังสือ · AI ไม่ต้องเดาช่องนี้ ให้คนกรอกเอง
   - `attachments` เปลี่ยน `<input>` → `<textarea>` + `useAutoGrow` (ฝั่ง PDF ไม่ต้องแก้ `linebreaks: true` เปิดอยู่แล้ว)

**Acceptance:** พรีวิวในโมดัล + ลิงก์สาธารณะต้องออกไฟล์เดียวกัน (ทั้งคู่วิ่งผ่าน `caseLetterPdf.js`) ·
เช็ค placeholder ไม่โดนตัด run ด้วย `unzip -p ไฟล์.docx word/document.xml | grep -o '{[^}<]*}'`

**คิวรอง (ยังไม่แตะ):** `web/app/{calling,posts,docs}/layout.js:10` `-mx-3`→`-mx-1` · `/integrations` ตารางต้อง
`overflow-x-auto` · `/posts` การ์ด `rounded-xl`→`rounded-lg` (ผลสแกนเต็มที่ `md/PENDING.md §📱 Mobile layout`)

---

## Context

- Branch `master` · **ยังไม่ push** (2 commit ของ session นี้)
- ค้างใน tree: `template-v2.{docx,odt}` = ของ user (quest ถัดไป) · `md/TEAM/TEE.md`, `.wolf/anatomy.md` ไม่ใช่ของ session นี้
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
