---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — pple-volunteers

> อ่านไฟล์นี้ก่อนเสมอเมื่อเริ่ม session ใหม่ · อัปเดตทุกครั้งที่จบก้อนงาน
> Last updated: 2026-09-01 (ดึกมาก)

---

## ✅ Done (สรุปย่อ — รายละเอียดดู git log)

- **cases.created_at บั๊ก: แก้เสร็จ + backfill dev/prod แล้ว (commit `b08009e`, push แล้ว)**
  - สาเหตุ: `createCase()` ทั้งฝั่งบอท (`db/case.js`) ไม่เคยรับ `created_at` override → insert ใช้ `NOW()` เสมอ
    เคสที่ "นำเข้ากระทู้เก่า" (`handlers/caseImportHandler.js` manual import) เลยได้วันที่ = เวลากดนำเข้า ไม่ใช่วันตั้งกระทู้จริง
  - แก้: `db/case.js` `createCase()` รับ `created_at` param แล้ว (`COALESCE($15, NOW())`) · `caseImportHandler.js` ส่ง `thread.createdAt` เข้าไป
  - Backfill เก่า: `scripts/data/backfillCaseCreatedAt.js` (ถอดวันที่จาก `discord_thread_id` snowflake ตรงๆ ไม่ยิง Discord API) — รันแล้วทั้ง dev (179 ใบ) และ prod (180 ใบ) 0 errors
  - ⬜ **prod bot `pple-dcbot` ยังไม่ restart** — code ใหม่ pull ลงเครื่องแล้ว (`git pull` ผ่าน `sudo -u www`) แต่ process ยังรันโค้ดเก่าค้างอยู่ใน memory · permission classifier บล็อกไม่ให้ Claude สั่ง `pm2 restart` เอง → **user ต้องรันเอง**: `ssh tee@202.183.141.78 "sudo -u www pm2 restart pple-dcbot"`
- หนังสือร้องเรียน รื้อทั้งชุด (session ก่อนหน้า, commit `5f63f60`..`d809f4a`) — push แล้ว แต่ยังค้าง:
  - ⬜ ยังไม่ได้รัน mobile audit ของช่อง reference/attachments ใหม่
  - ⬜ ยังไม่ได้เทสผ่าน route จริง (authed preview + public link)
  - ⬜ user ยังไม่ได้กดเองในแอป

---

## 🚀 Next quest

**Goal:** แก้บั๊กเดียวกัน (created_at ผิดตอนนำเข้ากระทู้เก่า) ในโมดูล **posts**

**จุดที่ต้องแก้ (สำรวจแล้ว แต่ยังไม่ได้ลงมือ):**
1. `db/postsImport.js` → `createImportedPost()` (บรรทัด 27-40): INSERT `post_episodes` ไม่รับ `created_at` เลย ใช้ `NOW()` เสมอ — เพิ่ม param แบบเดียวกับที่ทำใน `db/case.js`
2. `scripts/data/backfillPostThreads.js` — ตัวกวาดกระทู้เก่า ใช้ `createdVia: 'backfill'` อยู่แล้ว แต่ยังไม่ส่ง `created_at` → ต้องส่ง `thread.createdAt` เข้าไป
3. `handlers/postImportHandler.js` — เช็คว่ามี manual-import path (กด context menu นำเข้ากระทู้ที่ตั้งมานานแล้ว) เหมือน `caseImportHandler.js` หรือไม่ ถ้ามีต้องส่ง `created_at` ด้วยเช่นกัน
4. เขียน backfill script คล้าย `scripts/data/backfillCaseCreatedAt.js` — ถอดวันที่จาก snowflake ของ `channel_id` (หรือ field ที่เก็บ thread id ของ post_episodes ที่ `created_via='backfill'`) แล้ว UPDATE ย้อนหลัง
5. **dry-run ก่อนเสมอ** แล้วรันทั้ง dev และ prod ตามลำดับเดียวกับที่ทำกับ cases วันนี้ (commit → push → ssh prod git pull → dry-run prod → confirm → run จริง)

**ข้อควรระวังที่ต่างจาก cases:** posts มี `created_via` แยก 'ai' vs 'backfill' อยู่แล้ว (backfill ถูกซ่อนจากฟีดหลัก) — เช็คว่า field เก็บ thread/channel id ของ `post_episodes` ชื่ออะไรแน่ (`channel_id`?) ก่อนเขียน snowflake decode

---

## Context

- Branch `master` · sync กับ origin แล้ว (ไม่มี commit ค้าง push)
- Uncommitted: `.wolf/anatomy.md` (auto), `md/TEAM/TEE.md` (ของ user เอง ไม่ใช่ของ session ไหน — อย่าแตะ)
- prod: `tee@202.183.141.78` · `/www/wwwroot/pple-volunteers` · ทุกคำสั่งต้อง `sudo -u www` (ไม่งั้น `.env` ไม่โหลด) · git มี "dubious ownership" ถ้ารันด้วย `tee` ตรงๆ ต้อง wrap `sudo -u www bash -c '...'` เท่านั้น
- **Claude สั่ง `pm2 restart` บน prod เองไม่ได้** (permission classifier บล็อก) — ต้องขอ user รันเอง หรือถามอนุญาตแบบเจาะจงก่อน
- ห้ามรายงานสถานะ prod จากเอกสาร (`md/PENDING.md` เป็นบันทึก ไม่ใช่สถานะสด) → ถาม/เช็คสดเสมอ
- `.env` dev ผูกกับบอท **"Tester"** · user เปิด dev server ค้างที่ `:3000` → รันเองใช้
  `NEXT_DIST_DIR=.next-test npx next dev -p 3100` · **ห้าม `rm -rf web/.next`**

---

## 🔧 Commands

```bash
node scripts/data/backfillCaseCreatedAt.js --dry-run   # ตัวอย่างแพทเทิร์นที่ posts จะลอกไปทำ
node scripts/dev/mobileAudit.mjs --routes /หน้า         # ก่อนปิดงาน UI ทุกครั้ง
cd web && npm test                                      # vitest 504 tests
openwolf find <symbol>   ·   openwolf bug search "<error>"
```

## 📚 References
`md/PENDING.md` (backlog ตัวจริง · `NOTE.md` ห้ามแตะ) · `md/case/CASE.md` · `md/WEB.md §จอมือถือ` `§Type scale` ·
`.wolf/cerebrum.md` (Do-Not-Repeat) · `.wolf/buglog.json` (281 bugs)
