---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-09-03

---

## ✅ Done

**เฟส C + D เสร็จบน dev (2026-09-03) — โพสต์มีผู้รับผิดชอบหลายคนแบบเดียวกับเคส**
`c9d64bd` เฟส C · `abc96d4` เฟส D · **แผนทั้งก้อน (A→D) จบแล้ว**

รายละเอียดเต็มอยู่ `md/PENDING.md §Posts` + `md/kanban/KANBAN.md §กติกา "คน"` — **อ่านที่นั่น อย่า re-derive**

- DB: `post_episodes.owner_user_id` → **`created_by`** · ตารางใหม่ **`post_assignees`**
  ครบสามระบบ: `<entity>.created_by` (คนสร้าง ไม่เปลี่ยน) + `<entity>_assignees` (ผู้รับผิดชอบ)
- `web/lib/postAssign.js` = **ประตูเดียว** · `postOfCard()` ดักฝั่งบอร์ด → เขียนกลับต้นทางเสมอ
- **⛔ ไม่ seed จากคนสร้าง** — ยกเฉพาะคนที่กดรับบนบอร์ดจริง (1 แถวจาก 969) ที่เหลือลบทิ้ง
- **ร่างส่วนตัวไม่มีผู้รับผิดชอบเลย** — ทั้งสองประตู 400 · seed เจ้าของตอน `promoteToOrg`
- **3 ข้อที่กลับคำจากแพลนเดิม:** ไม่ backfill · **ไม่ ping Discord** (โพสต์ไม่มีเธรดต่อโพสต์
  มีแค่ห้องต้นทางตะกร้า = สแปมห้องรวม) · **ต้องแตะ `postsAccess.js`** (`isOwner` ใช้ร่วมกับ
  `post_assets` ที่ยังใช้ `owner_user_id` จริง → rename ครึ่งเดียว = fail-closed เงียบๆ)
- **verify:** build · test 506 · สโมค 4 ชุด (ใหม่ `kanbanPostSync.mjs`) · mobileAudit
  `/kanban` `/posts` `/posts/1046` · **เทส HTTP จริงผ่านเบราว์เซอร์ที่ล็อกอินแล้ว ครบทั้งสองทิศ**
  (สคริปต์ one-off อยู่ scratchpad `httpPostAssign.mjs` — CDP + magic token)

**เฟส B ขึ้น prod แล้ว** (user รัน migration + deploy เอง 2026-09-03)

---

## 🔴 ค้างอยู่ — prod ครึ่งๆ อยู่ตอนนี้ (ตรวจของจริงแล้ว 2026-09-03 16:2x)

**DB prod migrate ครบแล้ว แต่โค้ด prod ยังเป็นตัวก่อนเฟส C** (ยังไม่ push)
- ✅ prod DB: `post_episodes.created_by` มีแล้ว · `owner_user_id` หายแล้ว · `post_assignees` 1 แถว ·
  การ์ดโพสต์ไม่เหลือคนลอย 0 · `search_path` ของ trigger 2 ตัวตรึงแล้ว (บล็อก "รอบสอง" ลงไปด้วย)
- ❌ โค้ด prod ยังอ้าง `owner_user_id`: `web/db/posts/episodes.js` 17 จุด · `web/db/kanban/links.js` 5 ·
  `web/db/kanban/statusSql.js` 2 · `db/mediaBasket.js` 1
- ⇒ **`/posts` และ `/kanban` ทั้งบอร์ด จะโยน 42703** (visibleLinkSql อ้างคอลัมน์นี้ = listCards ล้มทั้งก้อน)
  · บอทเปิดตะกร้าสื่อก็ INSERT ไม่ผ่าน · ตอนตรวจยังไม่มี 42703 ใน log = ยังไม่มีใครเปิด 2 หน้านั้น

**ต้องทำ (เรียงตามนี้ ห้ามสลับ):**
1. `git push` — 4 commit local: `c9d64bd` `abc96d4` `56382bc` `7883c67` (**ต้องขออนุญาต user ก่อน**)
2. prod: `git pull` → `npm run build` (web) → `pm2 restart pple-web pple-dcbot` — **พร้อมกันทั้งคู่**
3. **user ยังไม่ได้กดทดสอบเอง** ทั้งเฟส B และ C — รายการอยู่ §ให้ user กด ข้างล่าง

**⚠️ สิ่งที่จะเห็นบน prod หลัง deploy — เป็นของที่ตั้งใจ ไม่ใช่บั๊ก:**
- การ์ดโพสต์เกือบพันใบขึ้นว่า **"ยังไม่มีคนรับ"** และแท่ง lifecycle ขั้นแรกว่าง
  (968 แถวที่ก็อป "คนสร้าง" มาเป็นผู้รับผิดชอบถูกลบตอน migration — ⛔ อย่าเสนอ backfill กลับ)
- โพสต์ที่ import แบบ `createdVia='backfill'` การ์ดจะลงกอง **"รอทำ"** ไม่ใช่ "เสร็จ" อีกต่อไป
  (ไม่มีผู้รับผิดชอบ = `createCard` clamp กลับ backlog ตามกติกา)

---

## 🖐️ ให้ user กด

เปิด http://localhost:3100 (dev server รันค้างอยู่แล้ว · ข้อมูลจริงจาก prod)

**เฟส C/D — /posts**
1. เปิดโพสต์องค์กรใบหนึ่ง → การ์ด "รายละเอียด" ขวามือมีช่อง **"ผู้รับผิดชอบ"** เพิ่มคนได้
2. เปิด /kanban หาการ์ดใบเดียวกัน → **ต้องเห็นชื่อเดียวกัน** และการ์ดออกจากกอง "รอทำ"
3. กด "รับงาน" บนบอร์ด → กลับไป /posts **ต้องเห็นชื่อตัวเองในช่องผู้รับผิดชอบ**
4. เปิด**ร่างส่วนตัว** → **ต้องไม่มีช่องผู้รับผิดชอบเลย** (ไม่ใช่ช่องว่าง)
5. กด "เปิดให้ทีมเห็น" บนร่างส่วนตัว → เจ้าของกลายเป็นผู้รับผิดชอบให้เอง

**เฟส B — /kanban** (ยังไม่เคยกด)
6. มอบหมาย 2 คนในการ์ดใบเดียว → ทั้งคู่ขึ้นเท่ากัน ("คนแรก +1")
7. กรองด้วยชื่อคนแรก → **ต้องเจอ** (บั๊กเดิม)
8. ถอดคนสุดท้ายออก → การ์ด**เด้งกลับกอง "รอทำ" เอง**
9. **เปิดเคสในดิสฯ ให้บอทสร้างการ์ด 1 ใบ ต้องไม่ 500**

---

## Context

- Branch `master` · ล่าสุด `abc96d4` · **ยังไม่ push** · `md/TEAM/TEE.md` มีของ user แก้ไว้ ไม่ได้ commit
- ⚠️ ข้อมูล `cases` บนเครื่อง dev เป็น **PII จริงของผู้ร้อง** (โคลนจาก prod)
- prod: `tee@202.183.141.78` · `/www/wwwroot/pple-volunteers` · wrap `sudo -u www bash -c '...'`
  · Claude สั่ง `pm2 restart` เองไม่ได้ · รัน migration ที่ rename/DROP คอลัมน์เองก็ไม่ได้
- `.env` dev ผูกกับบอท **"Tester"** · ล็อกอินเทสในเบราว์เซอร์: ยัด magic token ลง `org_login_tokens`
  ตรงๆ ⚠️ เขียน token ลง**ไฟล์** ไม่ใช่ stdout · **curl ใช้ไม่ได้** (session cookie เกิดจาก
  client-side signIn) ต้องขับผ่าน headless Chrome + CDP
- หนี้ i18n: `PostMetaPanel.jsx` string ใหม่ผ่าน `t()` แล้ว แต่ทั้งไฟล์/ทั้งโซน posts ยังไม่ migrate

---

## 🚀 Next quest — ยังไม่มี (แผน owner_user_id จบครบ A→D)

ถ้าจะทำต่อ ดู `md/PENDING.md` เป็น entry point · ตัวเลือกใกล้มือ:
- เธรดต่อโพสต์ในดิสฯ → ปลดล็อก "ping ตอนมอบหมาย" ที่เฟส C ตัดออกเพราะไม่มีเธรด
- migrate i18n ทั้งโซน posts (7 ไฟล์ · งาน mechanical → `i18n-migrator` ทีละ 2-3 ไฟล์)

---

## 🔧 Commands & References

```bash
cd web && npm test    ·    NEXT_DIST_DIR=<scratch> npm run build    # ห้าม build ทับ .next ตอน dev รัน
node scripts/dev/mobileAudit.mjs --routes /kanban,/posts --base http://localhost:3100
node --import ./scripts/smoke/_envload.mjs scripts/smoke/kanbanPostSync.mjs
#   + kanbanCards.mjs · kanbanBot.mjs · kanbanCaseSync.mjs
openwolf find <symbol>    ·    openwolf bug search "<error>"
```
📄 `/home/tee/.claude/plans/owner-user-id-wild-hinton.md` (แพลนตัวจริง — เสร็จหมดแล้ว) ·
`md/kanban/KANBAN.md §กติกา "คน"` · `md/posts/POSTS.md §Data model` · `md/PENDING.md` · `md/WEB.md §จอมือถือ`
