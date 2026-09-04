---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-09-03

---

## ✅ Done (committed, prod ขึ้นครบ — verify 2026-09-03)

- **ยุบ `owner_user_id` ทิ้งทั้งระบบ (A→D)**: `<entity>.created_by` (คนสร้าง) + `<entity>_assignees`
  (ผู้รับผิดชอบ หลายคน) กติกาเต็ม: `md/kanban/KANBAN.md §กติกา "คน"` · `md/PENDING.md §Posts`
- **ถอดกฎ "ผู้รับผิดชอบผูกกับกอง" ทั้งชุด** — "รอทำ" = ยังไม่ลงมือ (มีคนรับได้) ไม่ใช่ "ยังไม่มีคนรับ"
  DROP trigger `require_assignee`/`assignees_clamp` · ชื่อคนกับกองเป็นคนละแกนแล้ว

---

## 🚀 Next quest — user กดทดสอบ `/kanban` บน dev แล้วค่อยขึ้น prod

**⛔ ยังไม่ push/deploy** — โค้ด kanban รอบนี้ (ถอดกฎ, claim fix bug-362) ยังอยู่ dev เท่านั้น

**➜ ที่ user ต้องกด (dev :3100):**
1. ลากการ์ดจาก "กำลังทำ" กลับ "รอทำ" → ชื่อคนต้องยังอยู่
2. มอบหมายคนในกอง "รอทำ" → การ์ดต้องไม่กระโดดไป "กำลังทำ" เอง
3. ลากการ์ดไม่มีชื่อใครไป "กำลังทำ"/"เสร็จ" → ต้องไม่ error
4. กอง "เสร็จ" ต้องมีงานสื่อเก่าเป็นพันใบพร้อมชื่อคน · "รอทำ" เหลือแต่งานจริง
5. เปิดเคส/สร้างการบ้านจาก context menu ดิสฯ → ต้องไม่ 500

**Migration ค้าง prod (ทำพร้อม push โค้ดรอบนี้):**
- `scripts/migration/migration.sql` ท้ายไฟล์บล็อก "2026-09-03 (รอบ 2)" — มี DROP TRIGGER (classifier
  อาจบล็อก ให้ user รันเอง) แล้ว restart ทั้ง `pple-web` + `pple-dcbot`
- `migrations/1788447993748_..case-cards..`, `1788448639938_..appflowy-backfilled-cards..`,
  `1788449462956_..completed-at-from-due-at..`, `1788454524874_..done-case-cards..` (`npm run migrate
  up`) — แก้ `kanban_cards.created_at`/`completed_at` ผิด (mirror เคส/โพสต์/import AppFlowy ไม่มีวันจริง
  → ใช้ `due_at`/`created_at` แทนตามที่ user เคาะ) dev รันแล้วถูกทั้ง 4 ไฟล์
- prod รันบล็อก "รอบ 3" (โพสต์ created_at) เองแล้ว — "รอบ 4" (เคส created_at) ยังไม่รัน รอทำทีเดียวกับข้างบน
- **โค้ดใหม่ (dev เท่านั้น):** กอง "เสร็จ" เรียงด้วย `completed_at` ใหม่สุดก่อนแทน `due_at` (user ทัก:
  งานเก่าที่ due ผ่านมานานลอยขึ้นบน) — `sortDoneCards()` ใหม่ใน `kanbanGrouping.js` · `sortCardsBy(cards,
  spec, {doneMode})` ใน `kanbanSort.js` · เรียกจาก `KanbanHome.jsx` ตอน `key==='done'`
- **🐞 บั๊กที่เจอระหว่างทาง+แก้แล้ว:** `completed_at` ของการ์ดเคสไม่เคยถูกซิงก์เลยตอนปิดเคสที่หน้า
  `/cases` (ต่างจาก `status_type` ที่คำนวณสดตลอด) — ปิดเคสแล้ว `completed_at` ค้าง NULL ตลอดกาล
  แก้ที่ `db/cases.js:updateStatus()` เพิ่ม UPDATE ซิงก์ `kanban_cards.completed_at` ตาม
  resolved/closed/rejected (COALESCE กันเขียนทับ, NULL คืนถ้าเปิดใหม่) — เทสมือยืนยันแล้ว (ปิด→มีวันที่,
  เปิดใหม่→ว่าง) · test 511 ผ่าน

**ค้างไว้คุยต่อ (ยังไม่ทำ):** WIP limit ต่อคน · ป้ายอายุการ์ด · `sort_order` ลากเรียงคิวเอง
· หน้าแรก `/` ยังใช้ "กำลังทำ" กับการ์ดที่แค่มีคนรับ (convention ร่วม 4 โมดูล ถ้าแก้ต้องแก้ทั้งแผง)

---

## Context

- Branch `master` · local **ahead 1** (`45cd240` docs) · `md/TEAM/TEE.md` เป็นของ user
- prod: `ssh tee@202.183.141.78` · `/www/wwwroot/pple-volunteers` · wrap `sudo -n -u www bash -c '...'`
  · **รัน migration ที่ rename/DROP คอลัมน์เองไม่ได้** (classifier บล็อก ให้ user รัน)
- **Migration เปลี่ยนมาใช้ `node-pg-migrate`** (2026-09-03) — `scripts/migration/migration.sql` archive
  แล้ว งานใหม่: `npm run migrate create "<ชื่อ>"` → SQL ใน `migrations/*.sql` → `npm run migrate up`
- dev: server ค้างที่ **:3100** (`.env` ผูกบอท "Tester") · **ห้าม `npm run build` ทับ `.next`** ตอน dev รัน
  → ใช้ `NEXT_DIST_DIR=<scratch>` · login เทส: ยัด magic token ลง `org_login_tokens` (เขียนไฟล์)
  curl ล็อกอินไม่ได้ (client-side signIn) → ต้อง headless Chrome + CDP
- ⚠️ `cases` บนเครื่อง dev เป็น **PII จริง** (โคลนจาก prod)
- หนี้จงใจค้าง: ping ดิสฯ ตอนมอบหมายโพสต์ (ต้องมีเธรดต่อโพสต์ก่อน) · i18n โซน posts

---

## 🔧 Commands

```bash
cd web && npm test    ·    NEXT_DIST_DIR=<scratch> npm run build
node scripts/dev/mobileAudit.mjs --routes /kanban,/posts --base http://localhost:3100
node --import ./scripts/smoke/_envload.mjs scripts/smoke/kanbanPostSync.mjs
#   + kanbanCards.mjs · kanbanBot.mjs · kanbanCaseSync.mjs
openwolf find <symbol>    ·    openwolf bug search "<error>"
```
