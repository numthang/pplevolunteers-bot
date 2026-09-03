---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-09-03

---

## ✅ Done

**เฟส B เสร็จ (2026-09-03) — kanban ยุบ `owner_user_id` ลง `kanban_card_assignees`**

- `dd7bb8f` **เฟส B ตัวหลัก** · `2ecaf2e` กวาดคำบนจอที่ตกค้าง
- DB (รันบน **dev แล้ว** · prod ยังไม่): `kanban_card_helpers` → `kanban_card_assignees`
  (`joined_at`→`assigned_at`) · ยกเจ้าภาพลงเป็นแถว (1302 = 1221 + 81) · **DROP `owner_user_id`**
- CHECK เดิม → **CONSTRAINT TRIGGER 2 ตัว `DEFERRABLE INITIALLY DEFERRED`**
  `trg_kanban_cards_require_assignee` (ไม่มีคนรับ ห้ามออกจาก backlog → 23514) ·
  `trg_kanban_assignees_clamp` (ถอดคนสุดท้าย → การ์ดกลับ backlog เอง)
  → logic clamp ที่เคยก็อป 2 ที่ (เว็บ + บอท) หายทั้งคู่
- `setCardOwner`/`addHelper`/`removeHelper` → `addAssignee`/`removeAssignee` · `canAssignOwner`→`canAssign`
  · `/helpers` → `/assignees` · **ลบ `?view=mine` + `listMyCards()`** (user เคาะ — ไม่มี caller)
  · `createCard` ทั้งเว็บ+บอทเป็น **ทรานแซกชัน** (จำเป็นเพราะ trigger) · UI ยุบเหลือแถวเดียว "คนแรก +N"
  · URL `?helper=` → `?assignee=` (ยังรับคีย์เก่า)
- **verify:** build · test 506 · สโมค 3 ชุด · mobileAudit `/kanban` `/` · กดครบวงผ่าน HTTP — ผ่านหมด
  สโมคใหม่ `scripts/smoke/kanbanCaseSync.mjs` (ตะเข็บ `case_assignees` ↔ การ์ด ทั้งเว็บ+บอท)

**⬜ ยังไม่ได้ทำ — user ยังไม่ได้กดเอง** (dev server ค้างอยู่ที่ `:3100`, `NEXT_DIST_DIR=.next-test`)
รายการที่ต้องกด อยู่ใน §ให้ user กด ข้างล่าง

**ยังไม่ยืนยันสถานะ prod (ต้องถาม user — ห้ามรายงานจากเอกสาร):**
- ⬜ prod bot `pple-dcbot` restart แล้วหรือยัง (`ssh tee@202.183.141.78`)
- ⬜ หนังสือร้องเรียนชุดใหม่: ยังไม่ mobile audit · user ยังไม่กดเอง

---

## 🚀 Next quest — เฟส C: posts ให้เหมือนอีกสองระบบ

📄 **แพลนเต็มอยู่ที่ `/home/tee/.claude/plans/owner-user-id-wild-hinton.md` §เฟส C — อ่านที่นั่น อย่า re-derive**

ย่อ: `post_episodes.owner_user_id` → `created_by` · สร้าง `post_assignees` · `web/lib/postAssign.js`
ประตูเดียว (ลอก `caseAssign.js`) · `syncPostCardPeople()` · `/api/posts/[id]/assign` ·
ช่อง "ผู้รับผิดชอบ" ใน `PostMetaPanel.jsx` · **3 กับดักอยู่ในแพลน อ่านก่อนลงมือ**

**ของค้างจากเฟส B ที่เฟส C ต้องเก็บ** — ยังก็อป "คนสร้างโพสต์ → ผู้รับผิดชอบการ์ด" อยู่ **4 จุด**
(มีคอมเมนต์ ⚠️ กำกับทุกจุด): `SOURCE_SQL.post` ใน `web/db/kanban/links.js` ·
`web/db/posts/episodes.js` ×2 · `db/postsImport.js` · `db/mediaBasket.js` — เฟส C ตัดทิ้งทั้งชุด
**เฟส D (ท้ายสุด):** แท่ง lifecycle ฝั่งโพสต์ (`KanbanHome.jsx` สาขา `entity_type === 'post'`)

---

## 🖐️ ให้ user กด (เฟส B — ยังไม่ได้ทำ)

เปิด http://localhost:3100/kanban (dev server รันค้างอยู่แล้ว)
1. มอบหมาย 2 คนในการ์ดใบเดียว → **ทั้งคู่ขึ้นเท่ากัน** บนการ์ด ("คนแรก +1")
2. กรองด้วยชื่อคนแรก → **ต้องเจอ** (บั๊กเดิม: กรองแล้วไม่เจอใบที่เขาเป็นแม่งาน)
3. ถอดคนสุดท้ายออก → การ์ด**เด้งกลับกอง "รอทำ" เอง**
4. **เปิดเคสในดิสฯ ให้บอทสร้างการ์ด 1 ใบ ต้องไม่ 500** (บอทต้องรันด้วย code ใหม่)

---

## Context

- Branch `master` · ล่าสุด `2ecaf2e` · **ยังไม่ push** · `md/TEAM/TEE.md` มีของ user แก้ไว้ ไม่ได้ commit
- ⚠️ **ขึ้น prod เฟส B:** `pg_dump -t kanban_cards -t kanban_card_helpers` ก่อนรัน migration ·
  แล้ว **deploy เว็บ + บอทพร้อมกัน** (คอลัมน์หายไปเลย ตัวที่ขึ้นทีหลัง 500 ทันที)
- prod: `tee@202.183.141.78` · `/www/wwwroot/pple-volunteers` · wrap `sudo -u www bash -c '...'`
  · Claude สั่ง `pm2 restart` เองไม่ได้ · **รัน migration ที่ DROP คอลัมน์เองก็ไม่ได้** (classifier บล็อก)
- `.env` dev ผูกกับบอท **"Tester"** · ล็อกอินเทสในเบราว์เซอร์: ยัด magic token ลง `org_login_tokens`
  ตรงๆ ⚠️ เขียน token ลง**ไฟล์** ไม่ใช่ stdout (dotenv พิมพ์แบนเนอร์ปนมา)

---

## 🔧 Commands & References

```bash
cd web && npm test    ·    npm run build    ·    node scripts/dev/mobileAudit.mjs --routes /kanban --base http://localhost:3100
node --import ./scripts/smoke/_envload.mjs scripts/smoke/kanbanCards.mjs     # + kanbanBot.mjs · kanbanCaseSync.mjs
openwolf find <symbol>    ·    openwolf bug search "<error>"
```
📄 `/home/tee/.claude/plans/owner-user-id-wild-hinton.md` (แพลนตัวจริงของ quest นี้) ·
`md/kanban/KANBAN.md §กติกา "คน"` (กติกาใหม่ทั้งชุด) · `md/PENDING.md` · `md/WEB.md §จอมือถือ`
