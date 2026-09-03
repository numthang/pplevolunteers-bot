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

## 🚀 Next quest — user กดทดสอบ /kanban บน dev แล้วค่อยขึ้น prod

**ทำไปแล้ววันนี้ (รอบ 2): ถอดกฎ "ผู้รับผิดชอบผูกกับกอง" ออกจาก kanban ทั้งระบบ**
user เคาะเอง: *"ไปดู notion appflowy มันมีกฏหยุมหยิมพวกนี้ไหม ไม่มีหรอก"*

- **นิยามใหม่:** "รอทำ" = **ยังไม่ลงมือ (มีคนรับได้)** ⛔ ไม่ใช่ "ยังไม่มีคนรับ" อีกแล้ว
  ชื่อคนกับกองเป็นคนละแกน มนุษย์ตัดสินเอง · "ยังไม่มีคนรับ" เหลือเป็น**ตัวกรอง**ในแถบ "แสดง"
- **DROP trigger 2 ตัว** (`require_assignee` · `assignees_clamp`) + ลบ auto-status 8 จุด:
  `web/db/kanban/cards.js` (createCard · duplicateCard · setCardStatus ที่เคย DELETE ชื่อคนทิ้ง · addAssignee)
  · `links.js` bumpsBacklog + clamp ใน `unlinkCard` · `kanbanAccess.js` needAssignee
  · `KanbanHome.jsx` assignToMe (ตอนนี้ดูจาก**มุมมองที่กรองอยู่** ไม่ใช่จากกอง) · `db/kanbanCards.js` ฝั่งบอท
- **🐞 บั๊กที่เจอระหว่างทาง (STATUS เดิมเขียนผิดว่า "ห้ามรับเป็นบั๊ก"):** การ์ดโพสต์ backfill
  **953 ใบที่อยู่กอง "เสร็จ" มาตั้งแต่ 28 ส.ค. ตกกลับไปกอง "รอทำ"** ตอน migration เฟส B ลบชื่อปลอม
  → clamp ยิง → `completed_at` ถูกล้าง · คืนกอง "เสร็จ" แล้วโดยใช้ `completed_at = post_episodes.created_at`
- **backfill `post_assignees` จาก `created_by`** (user สั่ง) — 970 แถว + สำเนาลงการ์ด 968 แถว
  เฉพาะ `visibility='org'` · ⚠️ นี่คือการ**กลับคำ**จากกฎเดิม เพราะ `created_by` ของโพสต์ backfill
  คือเจ้าของกระทู้ดิสฯ ตัวจริง (65 คน) ไม่ใช่ "คนนำเข้า" อย่างที่เอกสารเก่าเขียน — ฝั่ง**เคส**ยังห้ามเหมือนเดิม

**verify บน dev แล้ว:** `npm test` 506 ผ่าน · build ผ่าน · สโมค 4 ชุดผ่านหมด (แก้ assertion เก่าที่ยืนยันกฎเดิม 14 จุด)
· mobileAudit `/kanban` ผ่าน · ข้อมูลจริง: การ์ด backfill 953 = `done` มี `completed_at` ย้อนหลังปี 2023–2026
(ไม่มีใบไหน completed วันนี้) · trigger เหลือ 0 · เลข "เสร็จ 30 วัน" = 17 (ไม่บวม)

**➜ ที่ user ต้องกด:**
1. `/kanban` — ลากการ์ดจาก "กำลังทำ" กลับ "รอทำ" → **ชื่อคนต้องยังอยู่** (เดิมหายเกลี้ยง)
2. มอบหมายคนให้การ์ดในกอง "รอทำ" → **การ์ดต้องไม่กระโดดไป "กำลังทำ"**
3. ลากการ์ดที่ไม่มีชื่อใครไป "กำลังทำ"/"เสร็จ" → **ต้องได้ ไม่มี error เด้ง**
4. กอง "เสร็จ" ต้องมีงานสื่อเก่าเป็นพันใบ พร้อมชื่อคนทำ · กอง "รอทำ" เหลือแต่งานจริง
5. เปิดเคสในดิสฯ / กด context menu สร้างการบ้าน → ต้องไม่ 500 และการ์ดลง "รอทำ"

**⛔ ยังไม่ขึ้น prod** — prod ยังมีบั๊ก 708 ใบตกกองรอทำอยู่ · ต้อง push โค้ด + รัน migration บล็อก
"2026-09-03 (รอบ 2)" ที่ท้าย `scripts/migration/migration.sql` (มี DROP TRIGGER — classifier อาจบล็อก
ให้ user รันเอง) แล้ว restart ทั้ง `pple-web` และ `pple-dcbot` (แก้ทั้งสองฝั่ง)

### 📌 งานสื่อ — ค้างไว้ให้ session หน้า (user ทัก 2026-09-03)

**คำถาม user:** "วันที่สร้างงานสื่อคือวันที่ import เหรอ มันควรเป็นวันที่ตั้งกระทู้ป่ะ"
**ตรวจแล้ว:** `post_episodes.created_at` = **วันตั้งกระทู้จริง ถูกอยู่แล้ว** (แกะ snowflake ใน
`backfillPostThreads.js`) และ `PostsHome.jsx:105` โชว์ฟิลด์นั้นตรงๆ · ที่ยังเป็นเวลา import คือ 2 จุด:

| ฟิลด์ | สภาพ | ผล |
|---|---|---|
| `post_episodes.updated_at` | 954 ใบกองใน 34 นาที (2026-08-27 19:35–20:09) | `listPosts` เรียง `updated_at DESC` → แท็บของเก่าเรียงตามลำดับที่สคริปต์ดึง ไม่ใช่ไทม์ไลน์ |
| `kanban_cards.created_at` | วัน mirror ทุกใบ | `sortCards` ใช้เป็นตัวตัดสินสุดท้าย → ลำดับในกอง "เสร็จ" มั่ว |

**ที่เสนอไว้ (ยังไม่ได้ทำ · รอ user เคาะ):**
1. `UPDATE kanban_cards.created_at = post_episodes.created_at` เฉพาะการ์ด backfill — ไม่มีผลข้างเคียง
2. ⛔ **ห้ามเขียนทับ `updated_at`** (มันคือ "แก้ล่าสุด" จริง) → แก้ที่ `ORDER BY` ของ `listPosts`
   ให้ `source=backfill` เรียงด้วย `created_at` แทน (`web/db/posts/episodes.js:94`)

**ค้างไว้คุยต่อ (ยังไม่ทำ):** WIP limit ต่อคน · ป้ายอายุการ์ด ("อยู่กองนี้มา 12 วัน") · `sort_order`
ให้ลากเรียงคิวเองได้ — 3 อย่างนี้คือของที่ควรมาแทน "กฎ" ที่เพิ่งถอดไป (เตือนคน ไม่ใช่บังคับคน)
· หน้าแรก `/` ยังใช้คำว่า "กำลังทำ" กับการ์ดที่แค่ *มีคนรับ* (เป็น convention ร่วมกับเคส/เอกสาร/โทร
ทั้ง 4 โมดูล — ถ้าจะแก้ต้องแก้ทั้งแผง)

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
