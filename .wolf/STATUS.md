---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-09-03

---

## ✅ Done

**แผน "ยุบ `owner_user_id` ทิ้งทั้งระบบ" จบครบ A→D** — ทั้ง 3 ระบบเก็บ "คน" รูปเดียวกันแล้ว:
`<entity>.created_by` (คนสร้าง ไม่เปลี่ยนตลอดชีวิตแถว) + `<entity>_assignees` (ผู้รับผิดชอบ หลายคน เท่ากันหมด)

| commit | ได้อะไร |
|---|---|
| `a901d5b` (A) | `isMyCard()` เลิกนับงานไร้คนรับเป็น "ของทุกคน" · มุมมอง "ยังไม่มีคนรับ (n)" |
| `dd7bb8f` `2ecaf2e` `66f4c89` (B) | kanban: `kanban_card_assignees` · ยุบ `owner_user_id` · CONSTRAINT TRIGGER 2 ตัว |
| `c9d64bd` (C) | posts: `owner_user_id`→`created_by` · ตาราง `post_assignees` · `web/lib/postAssign.js` ประตูเดียว · `postOfCard()` ดักฝั่งบอร์ด · ช่อง "ผู้รับผิดชอบ" ใน `PostMetaPanel.jsx` |
| `abc96d4` (D) | แท่ง lifecycle โพสต์: ไม่มีคนรับ = ไม่ขึ้นขั้นแรก |

**เฟส C ที่ต้องรู้** (กติกาเต็ม: `md/kanban/KANBAN.md §กติกา "คน"` · `md/PENDING.md §Posts`)
- ⛔ **ห้าม seed `<entity>_assignees` จาก `created_by`** — คนนำเข้า ≠ ผู้รับผิดชอบ (รากของ "เจ้าภาพปลอม 176 ใบ")
  migration ยกเฉพาะคนที่กดรับบนบอร์ดจริง (**1 แถวจาก 969**) ที่เหลือลบทิ้ง
- **ไม่ ping Discord ตอนมอบหมายโพสต์** (ต่างจากแพลนเดิม) — โพสต์ไม่มีเธรดต่อใบ มีแค่ห้องต้นทางตะกร้า
- `postsAccess.isOwner()` แยกเป็น `isPostCreator()` / `isAssetOwner()` — `post_assets` ยังใช้ `owner_user_id` จริง
- `ASSIGNEE_SOURCE.bumpsBacklog` จริงเฉพาะฝั่งโพสต์ — `POST_STATUS` คืน NULL ตอน draft = kanban เป็นเจ้าของสถานะช่วงนั้น
- ร่างส่วนตัวไม่มีผู้รับผิดชอบเลย (ทั้งสองประตูตอบ 400) · seed เจ้าของตอน `promoteToOrg`
- verify: build · test 506 · สโมค 4 ชุด (ใหม่ `scripts/smoke/kanbanPostSync.mjs`) · mobileAudit `/kanban`
  `/posts` `/posts/1046` · เทส HTTP จริงผ่านเบราว์เซอร์ที่ล็อกอินแล้ว ครบทั้งสองทิศ

**prod ขึ้นครบแล้ว (ตรวจของจริง 2026-09-03):** DB migrate ครบทั้ง 3 บล็อก (`created_by` · `post_assignees` ·
`search_path` ของ trigger) · โค้ดใหม่ pull ขึ้นแล้ว (`owner_user_id` เหลือ 0 จุดทุกไฟล์) · บอทรีสตาร์ตแล้ว

---

## 🚀 Next quest — user กดทดสอบของจริง แล้วไล่บั๊กที่เจอ

**deploy จบแล้ว ตรวจของจริง 09:27 UTC:** `pple-web` online (start 09:25:41) · `pple-dcbot` online ·
`next build` ไม่รันแล้ว · port 3000 ตอบ 200 · error log สะอาดหลังรีสตาร์ต
➜ เหลือแค่ **กดใช้จริง** · ถ้าเจอ 500 ให้เช็ค 42703 (`column … does not exist`) ก่อนอย่างอื่น —
แปลว่ายังมีจุดที่อ้าง `owner_user_id` หลงเหลือ (`grep -rn owner_user_id web/ db/`)

**รายการที่ user ยังไม่เคยกดเลย (เฟส B + C):**
1. /posts เปิดโพสต์องค์กร → การ์ด "รายละเอียด" ขวามือ มีช่อง **"ผู้รับผิดชอบ"** เพิ่มคนได้
2. /kanban การ์ดใบเดียวกัน → **เห็นชื่อเดียวกัน** และการ์ดออกจากกอง "รอทำ"
3. กด "รับงาน" บนบอร์ด → กลับไป /posts **เห็นชื่อตัวเองในช่องผู้รับผิดชอบ**
4. เปิด**ร่างส่วนตัว** → **ไม่มีช่องผู้รับผิดชอบเลย** (ไม่ใช่ช่องว่าง) · กด "เปิดให้ทีมเห็น" → เจ้าของกลายเป็นผู้รับผิดชอบเอง
5. /kanban มอบหมาย 2 คนใบเดียว → ขึ้นเท่ากัน ("คนแรก +1") · กรองด้วยชื่อคนแรก **ต้องเจอ**
6. ถอดคนสุดท้ายออก → การ์ด**เด้งกลับกอง "รอทำ" เอง** (trigger)
7. เปิดเคสในดิสฯ ให้บอทสร้างการ์ด 1 ใบ **ต้องไม่ 500**

**⚠️ 2 อย่างนี้เป็นของที่ตั้งใจ ห้ามรับเป็นบั๊ก:**
- การ์ดโพสต์เกือบพันใบขึ้น **"ยังไม่มีคนรับ"** + แท่ง lifecycle ขั้นแรกว่าง — ⛔ **อย่าเสนอ backfill กลับ**
- โพสต์ที่ import แบบ `createdVia='backfill'` การ์ดลงกอง **"รอทำ"** ไม่ใช่ "เสร็จ" (ไม่มีคนรับ = clamp)

---

## Context

- Branch `master` · local **ahead 1** (`45cd240` เป็น docs · ที่เหลือ push แล้ว) · `md/TEAM/TEE.md` เป็นของ user
- prod: `ssh tee@202.183.141.78` · `/www/wwwroot/pple-volunteers` · wrap `sudo -n -u www bash -c '...'`
  อ่านสถานะ/log ได้จริง · **รัน migration ที่ rename/DROP คอลัมน์เองไม่ได้** (classifier บล็อก)
- dev: server ค้างที่ **:3100** (`.env` ผูกบอท "Tester") · **ห้าม `npm run build` ทับ `.next`** ตอน dev รัน
  → ใช้ `NEXT_DIST_DIR=<scratch>` · ล็อกอินเทส: ยัด magic token ลง `org_login_tokens` (เขียนลง**ไฟล์**)
  **curl ล็อกอินไม่ได้** (cookie เกิดจาก client-side signIn) → ต้อง headless Chrome + CDP
- ⚠️ ข้อมูล `cases` บนเครื่อง dev เป็น **PII จริงของผู้ร้อง** (โคลนจาก prod)
- หนี้ที่จงใจค้าง: ping ดิสฯ ตอนมอบหมายโพสต์ (ต้องมีเธรดต่อโพสต์ก่อน) · i18n ทั้งโซน posts

---

## 🔧 Commands

```bash
cd web && npm test    ·    NEXT_DIST_DIR=<scratch> npm run build
node scripts/dev/mobileAudit.mjs --routes /kanban,/posts --base http://localhost:3100
node --import ./scripts/smoke/_envload.mjs scripts/smoke/kanbanPostSync.mjs
#   + kanbanCards.mjs · kanbanBot.mjs · kanbanCaseSync.mjs
openwolf find <symbol>    ·    openwolf bug search "<error>"
```
