---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-09-03

---

## ✅ Done

**Session นี้ (2026-09-03) — คุยแพลนทั้ง session แล้วลงมือเฟสแรก · working tree สะอาด**

- `3b1bd09` **checkpoint** ของค้าง session ก่อน (ChecklistBar แบ่งท่อน · แท่ง lifecycle เคสเลิกโกหก ·
  ผู้รับผิดชอบหลายคนของเคสในหน้า /case) — ไม่ได้อ่าน diff ตามกฎ ใช้ `--stat` เขียน message
- `a901d5b` **เฟส A เสร็จ** — `isMyCard()` เลิกนับงานไร้เจ้าภาพเป็น "ของฉัน" ของทุกคน
  ([lib/kanbanGrouping.js](../web/lib/kanbanGrouping.js)) · ปุ่มมุมมองบนจอใหญ่โชว์ตัวเลขแล้ว ("ยังไม่มีคนรับ (n)")
  · แถมแก้บั๊กเก่า **ตัวกรองคนไม่นับเจ้าภาพ** → กรองชื่อคนหนึ่งไม่เจอใบที่เขาเป็นแม่งาน
  ([KanbanHome.jsx](../web/components/kanban/KanbanHome.jsx)) · test 504 ผ่าน · build ผ่าน
- **ออกแบบเสร็จทั้งชุด** — 📄 **แพลนเต็มอยู่ที่ `/home/tee/.claude/plans/owner-user-id-wild-hinton.md`**
  (อ่านที่นั่นก่อนทำต่อ **อย่า re-derive** — คุยกันทั้ง session กว่าจะได้ + มีผล `/scrutinize` ครบ)

**ยังไม่ยืนยันสถานะ prod (ต้องถาม user — ห้ามรายงานจากเอกสาร):**
- ⬜ prod bot `pple-dcbot` restart แล้วหรือยัง (`ssh tee@202.183.141.78` · Claude สั่งเองไม่ได้)
- ⬜ หนังสือร้องเรียนชุดใหม่: ยังไม่ mobile audit · user ยังไม่กดเอง

---

## 🚀 Next quest — เฟส B: kanban ยุบ `owner_user_id` ลงตาราง

**เป้า:** ทุกระบบเหลือรูปเดียว — แถวหลักมีคอลัมน์คนตัวเดียวคือ `created_by` (= คนสร้าง · ให้สิทธิ์ลบ)
ส่วนผู้รับผิดชอบอยู่ในตาราง `<entity>_assignees` เสมอ (หลายคน ไม่มีหัวหน้า) เขียนผ่าน service ตัวเดียว
เลิกใช้คำว่า "เจ้าภาพ/ผู้ช่วย" ทั้งโค้ดและจอ เหลือ **"ผู้รับผิดชอบ"**

**เฟส B ทำอะไร:** `kanban_card_helpers` → rename `kanban_card_assignees` (+`joined_at`→`assigned_at`)
· ยก `kanban_cards.owner_user_id` ลงเป็นแถวหนึ่งแล้ว **DROP คอลัมน์ทิ้ง** · กวาดโค้ดทุกจุดเป็น EXISTS/join

**ห้ามพลาด 3 ข้อ (ผล `/scrutinize` — อยู่ในแพลนพร้อมหลักฐาน):**
1. trigger แทน CHECK **ต้องเป็น `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED`** เท่านั้น
   (`BEFORE`/`AFTER` ธรรมดาพัง 2 ทาง: sync แบบ DELETE-แล้ว-INSERT จะดันการ์ดตกกอง · สร้างการ์ดใหม่ติดด่านตัวเอง)
2. **บอทมีสำเนา `syncCaseCardPeople` ของตัวเอง** ที่ [db/kanbanCards.js:200](../db/kanbanCards.js) — เว็บ build ผ่าน ≠ บอทรอด
   · คอลัมน์หายเลย → **deploy เว็บ+บอทพร้อมกัน** · prod ต้อง `pg_dump` ตาราง kanban ก่อน
3. `GET /api/kanban/cards?view=mine` คืน `{mine, helping}` — grep ทั้งรีโปไม่เจอ caller
   **ถาม user ก่อนลบ** อย่าดัดให้รอด

**ทำก่อนเขียนโค้ด:** `/scrutinize` (CLAUDE.md บังคับ) · commit checkpoint
**ส่ง Sonnet subagent:** B2 กวาด `owner_user_id` + locale เป็น mechanical ล้วน ซอยทีละ 2-3 ไฟล์
(งานคิด/trigger/ตรวจผล ทำใน main thread)

**เคาะแล้ว ไม่ต้องถามซ้ำ:** ⛔ **ไม่ rename `post_episodes` → `posts`** (`episode` = `post` 1:1 อยู่แล้ว
เป็นซากจากยุคมี `post_series`) → ตาราง `post_assignees` ใช้คอลัมน์ **`episode_id`** ให้ล้อพี่น้อง 6 ตาราง ·
ไม่แตะ `dc_social_accounts`/`post_assets.owner_user_id` (ชื่อไม่ได้โกหก) · ร่างส่วนตัวไม่มีผู้รับผิดชอบเลย

**เฟสถัดไปหลัง B:** C = posts (`owner_user_id`→`created_by` + `post_assignees` + `postAssign.js` + UI) · D = แท่ง lifecycle ฝั่งโพสต์

---

## Context

- Branch `master` · **working tree สะอาด** ล่าสุด `a901d5b` · ยังไม่ push
- prod: `tee@202.183.141.78` · `/www/wwwroot/pple-volunteers` · wrap `sudo -u www bash -c '...'`
  · Claude สั่ง `pm2 restart` เองไม่ได้ (classifier บล็อก)
- `.env` dev ผูกกับบอท **"Tester"** · ห้าม `npm run build` ตอน dev server รันอยู่ (session นี้ไม่มีตัวไหนรัน จึง build ได้)
  · รันเทสเองใช้ `NEXT_DIST_DIR=.next-test npx next dev -p 3100` · ห้าม `rm -rf web/.next`
- `md/TEAM/TEE.md` เป็นของ user เอง **อย่าแตะ** · `NOTE.md` ห้ามอ่าน

---

## 🔧 Commands & References

```bash
cd web && npm test    ·    npm run build    ·    node scripts/dev/mobileAudit.mjs --routes /kanban
openwolf find <symbol>    ·    openwolf bug search "<error>"
```
📄 `/home/tee/.claude/plans/owner-user-id-wild-hinton.md` (แพลนตัวจริงของ quest นี้) ·
`md/PENDING.md` (backlog อื่น) · `md/kanban/KANBAN.md` · `md/WEB.md §จอมือถือ` `§Type scale`
