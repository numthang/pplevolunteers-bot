---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-09-03

---

## ✅ Done

**Session นี้ (2026-09-03) — แท่ง progress บนการ์ด kanban** · ยังไม่ commit
- `ChecklistBar` ([web/components/kanban/ChecklistFieldBox.jsx](../web/components/kanban/ChecklistFieldBox.jsx)) —
  แบ่งเป็น **ท่อนตามจำนวนขั้น** (เดิมเป็นแท่งไล่ระดับต่อเนื่อง) + บางลงเป็น `h-1` + รับ prop `tone`
- แท่ง lifecycle เคส/โพสต์ใช้ **cyan** แยกจากเช็คลิสต์ที่ยังเป็น `bg-teal`
  (⚠️ `teal` ใน tailwind.config.js จริงๆ คือ `var(--brand-orange)` — ชื่อคลาสหลอก)
- **แท่ง lifecycle ของเคสเลิกโกหก** ([KanbanHome.jsx](../web/components/kanban/KanbanHome.jsx) `linkStage`) —
  เดิม `status='open'` = ขึ้นขั้น "รับเรื่องแล้ว" ทันทีที่เคสเกิด ทั้งที่ยังไม่มีใครรับ
  (assign ไม่แตะ `cases.status` เลย) → ตอนนี้ `!card.owner_user_id` = แท่งว่าง (0 ท่อน)
- **ยังไม่ได้ทำฝั่ง post** ของ `linkStage` โดยตั้งใจ — รอทำพร้อมงาน `post_assignees` (ดู Next quest)

**ค้างจาก session ก่อน (ยังไม่ยืนยันสถานะ prod — ต้องถาม user):**
- ⬜ prod bot `pple-dcbot` restart แล้วหรือยัง (โค้ด `created_at` fix pull ลงเครื่องแล้ว)
  `ssh tee@202.183.141.78 "sudo -u www pm2 restart pple-dcbot"` — Claude สั่งเองไม่ได้
- ⬜ หนังสือร้องเรียนชุดใหม่: ยังไม่ mobile audit · ยังไม่เทส route จริง · user ยังไม่กดเอง

---

## 🚀 Next quest

**Posts — ผู้รับผิดชอบหลายคน ให้ consistent กับ cases** · แพลนเต็ม + เหตุผลอยู่หัว `md/PENDING.md`
(อ่านที่นั่นก่อน อย่า re-derive — ใช้เวลาคุยกันทั้ง session)

**แก่นของปัญหา:** `owner_user_id` แปลคนละเรื่องใน 2 ตาราง — `kanban_cards` = **เจ้าภาพ**,
`post_episodes` = **เจ้าของร่าง/คนสร้าง** แล้ว `SOURCE_SQL.post` ([web/db/kanban/links.js](../web/db/kanban/links.js))
ก็อปข้ามความหมายกัน = "คนนำเข้า" กลายเป็น "ผู้รับผิดชอบ" ทุกใบเงียบๆ
3 บทบาทที่ห้ามยุบรวม: **ผู้สร้าง** (`created_by`) · **เจ้าของสิทธิ์** · **ผู้รับผิดชอบ**

**ลำดับงาน:** `post_assignees` (migration) → `web/lib/postAssign.js` (ทางเข้าเดียว) →
`syncPostCardPeople()` → `/api/posts/[id]/assign` → ดัก `postOfCard()` ใน
`/api/kanban/cards/[id]/route.js` → ช่องผู้รับผิดชอบใน `PostMetaPanel.jsx` → ค่อยแก้ `linkStage` ฝั่ง post

**เคาะแล้ว ไม่ต้องถามซ้ำ:** ร่างส่วนตัวไม่มีผู้รับผิดชอบเลย ("ก็มันร่างส่วนตัว") →
**ไม่ต้องแตะ `lib/postsAccess.js` และ `visibleLinkSql`** · ping เธรดดิสฯ ตอนมอบหมาย = เอา ·
`post_episodes.owner_user_id` คงความหมายเดิมทุกอย่าง
**ก่อนเขียนโค้ด:** CLAUDE.md บังคับรัน `/scrutinize` ก่อนทุกฟีเจอร์ใหม่

**อีก 2 quest ที่จดไว้แล้ว อย่าลืม (อยู่ `md/PENDING.md`):**
- 🧺 `isMyCard()` นับงานไม่มีเจ้าภาพเป็น "ของฉัน" ของทุกคน = รากของเจ้าภาพปลอม — ควรทำ**ก่อน**
  งานที่จะสร้างการ์ดไร้เจ้าภาพเพิ่มทีละเยอะ · ⛔ อย่าเสนอล้าง assignee 176 ใบอีก (user จัดการเองบน prod แล้ว)
- 📅 `created_at` ผิดตอนนำเข้ากระทู้เก่า **ฝั่ง posts** (แบบเดียวกับที่แก้ให้ cases ไปแล้ว) —
  `db/postsImport.js` · `scripts/data/backfillPostThreads.js` · เขียน backfill ถอด snowflake

---

## Context

- Branch `master` · ไม่มี commit ค้าง push แต่ **working tree มีของค้างเยอะกว่างาน session นี้**
  (`CaseMetaEditor.jsx`, `statusSql.js`, locales, `LabelChips.jsx`, `md/*` — งานผู้รับผิดชอบหลายคน
  ของเคสที่ทำก่อนหน้า) · `md/TEAM/TEE.md` เป็นของ user เอง **อย่าแตะ**
- prod: `tee@202.183.141.78` · `/www/wwwroot/pple-volunteers` · ทุกคำสั่ง wrap `sudo -u www bash -c '...'`
  · Claude สั่ง `pm2 restart` เองไม่ได้ (classifier บล็อก) · ห้ามรายงานสถานะ prod จากเอกสาร — ถามสดเสมอ
- `.env` dev ผูกกับบอท **"Tester"** · user เปิด dev server ค้างที่ `:3000` → รันเองใช้
  `NEXT_DIST_DIR=.next-test npx next dev -p 3100` · **ห้าม `rm -rf web/.next`** · ห้าม `npm run build` ตอน dev รันอยู่
- ต่อ DB จากสคริปต์ชั่วคราว: อ่านเฉพาะคีย์ `DB_*` จาก `.env` เองในไฟล์ `.mjs` แล้ว import
  `web/db/index.js` (อย่าใช้ `--env-file` — hook บล็อกกันซีเคร็ตหลุด)

---

## 🔧 Commands & References

```bash
node scripts/dev/mobileAudit.mjs --routes /หน้า   # ก่อนปิดงาน UI ทุกครั้ง
cd web && npm test    ·    openwolf find <symbol>    ·    openwolf bug search "<error>"
```
`md/PENDING.md` (backlog ตัวจริง — 3 quest ข้างบนอยู่ที่นั่นหมด · `NOTE.md` ห้ามแตะ) ·
`md/kanban/KANBAN.md` · `md/WEB.md §จอมือถือ` `§Type scale` · `.wolf/cerebrum.md` (Do-Not-Repeat)
