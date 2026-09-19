# STATUS — 2026-09-19

## ✅ Done (session นี้ · **ยังไม่ commit ทั้งหมด**)

ต้นเรื่อง: user ถามว่าทำไม `/finance/payouts/1` โชว์ "…· ปัญญาญาณ เกิดจากการศึกษา…"
→ ไม่ได้ hardcode แต่เป็น `cache_pple_event.name` ที่ join จาก `event_id` · รอบ 1 (บัญชี**ราชบุรี**)
ผูก `event_id=1382` ซึ่งเป็นกิจกรรม**สระบุรี** เพราะตอนสร้างเปิด dropdown แล้วคลิกโดนแถวแรก
(API เรียง `event_date DESC` · แถวโชว์แค่ชื่อ ไม่บอกจังหวัด) — ชื่อรอบที่พิมพ์ไม่มีใน cache เลย

- **`web/components/finance/EventCombobox.jsx` (ใหม่)** — ค้นที่ server ผ่าน `?q=` debounce 250ms ·
  ต้องพิมพ์ ≥2 ตัวก่อนถึงมีรายการ · ทุกแถวโชว์ `จังหวัด · วันที่`
- `web/app/finance/payouts/page.js` — ใช้ component กลาง · ลบตัวเดิม + `events` state
  (เดิมดึงมาทั้งก้อนแล้ว filter ฝั่ง client บน 100 ตัวล่าสุด ทั้งที่มี 157 → ตัวเก่าค้นไม่เจอเงียบๆ)
- `web/app/finance/payouts/[id]/page.js` — ปุ่มดินสอข้างชื่อรอบ + `RoundEditModal`
  (ชื่อ/ที่มา/กิจกรรม/ยอดตั้งต้น · ซ่อนเมื่อ `locked`) — เดิมแก้หัวรอบย้อนหลังไม่ได้เลย
- `web/db/finance/payouts.js` — **ถอด `account_id` ออกจาก whitelist `updateRound`** ปิดรูสิทธิ์
- `web/locales/{th,en}.json` — `payouts.editRound`, `eventSearchHint`, `errPeriod`
- `md/PENDING.md` — เพิ่ม spec งานแจ้งโอนเงิน (ท้ายไฟล์)

**ผ่าน `/scrutinize` แล้ว — แผนถูกปรับ 3 จุด (อย่ารื้อกลับ):**
1. ต้นเหตุคือ**เลือกผิดแบบเงียบ** ไม่ใช่ "ค้นไม่เจอ" → แถวต้องบอกจังหวัด/วันที่ + พิมพ์ก่อนถึงโชว์
2. **ไม่มีช่องแก้บัญชีต้นทาง** — exporter เขียนบัญชีต้นทางลงไฟล์ (`payoutExport/genericCsv.js`)
   แก้ย้อนหลัง = ระบบขัดกับไฟล์ที่อัปโหลด K BIZ ไปแล้ว + โมดูลนี้ไม่มี audit log
   → ปิดรูสิทธิ์ด้วยการ**ลบความสามารถ** (`_guard` เช็คสิทธิ์จากบัญชีปัจจุบันเท่านั้น)
3. ถ้า list มาจาก server ห้ามหาชื่อที่เลือกไว้ย้อนจาก list → เก็บ `selectedLabel` เป็น ref แยก

**Verify:** `npm run lint:all` 0 error · `cd web && npm test` 546 ผ่าน · `NEXT_DIST_DIR=.next-verify npm run build` ผ่าน
**ยังไม่ได้ทำ:** ยังไม่กดจริงในเบราว์เซอร์ · ยังไม่ mobile audit · **ยังไม่ commit**

## ✅ เสร็จรอบสอง: ปุ่มแจ้งโอนเงินทาง Discord DM (**ยังไม่ commit**)

user เคาะ: **DM Discord อย่างเดียว** (ไม่ทำ inbox บนเว็บ → ไม่ต้องสร้างตาราง notification เลย) ·
**ปุ่มกระดิ่งรายแถว กดซ้ำได้ไม่จำกัด** · ที่เหลือ "เอาตามคุณเลย" → mask 4 ตัวท้าย · คนนอก/ไม่มีบัญชี = ปุ่ม disabled

- `migrations/1789100000000_finance-payout-notify.sql` — `notified_at` / `notify_count` / `notified_by`
  (**รันบน local แล้ว** · ยังไม่ได้รันบน prod)
- `web/lib/payoutNotify.js` (pure) + `web/lib/__tests__/payoutNotify.test.js` 15 เคส
- `web/lib/discordDm.js` — REST `POST /users/@me/channels` → `POST /channels/{id}/messages`
- `web/app/api/finance/payouts/[id]/items/[itemId]/notify/route.js`
- `web/db/finance/payouts.js` — `ITEM_SELECT` + `u.discord_id`/`notified_at`/`notify_count` · `markNotified()`
- `web/app/api/finance/payouts/_guard.js` — flag `allowPaid`
- `web/app/finance/payouts/[id]/page.js` — ปุ่มกระดิ่ง (โชว์เฉพาะแถวที่ติ๊กจ่ายแล้ว · โชว์ตอน `locked` ด้วย)
- `web/locales/{th,en}.json` — `payouts.notify.*`

**ผ่าน `/scrutinize` — 3 จุดที่ถูกแก้ อย่ารื้อกลับ (เหตุผลเต็มอยู่ `md/PENDING.md`):**
1. `allowPaid` — `_guard` ตอบ 409 กับทุก write เมื่อ `status='paid'` แต่รอบที่ปิดแล้วคือจังหวะที่ต้องแจ้งพอดี
   ⛔ ห้ามเอา flag นี้ไปใส่ route ที่แก้ยอด/รายชื่อ/สถานะ
2. ภาษา DM ล็อก `th` ด้วย `createTranslator` — `getTranslations()` จะได้ locale จาก cookie ของ**คนกดปุ่ม**
3. ส่ง DM ไม่ผ่าน = ไม่เขียน `notified_at` (Discord 50007 = ผู้ใช้ปิด DM)

**รูปแบบข้อความ:** หัวข้อ 1 บรรทัด + เนื้อความรวบเป็นประโยคเดียว + mention คนกดปุ่มท้ายข้อความ
(user เคาะรอบสอง — ⛔ ห้ามแตกกลับเป็นบรรทัดละหัวข้อ · ตัวอย่างเต็มอยู่ `md/PENDING.md`)

**Verify:** `npm run lint:all` 0 error · `cd web && npm test` **562 ผ่าน** (เดิม 546) ·
`NEXT_DIST_DIR=.next-verify npm run build` ผ่าน · `mobileAudit --routes /finance/payouts/1` ✓ ไม่ล้น
**ยังไม่ได้ทำ:** ยังไม่เคยกดปุ่มจริง (= ยังไม่เคยส่ง DM ออกจริงสักครั้ง) · ยังไม่ commit · ยังไม่ deploy

## ✅ เสร็จรอบสาม: ป้ายสถานะ 6 ขั้น + ปุ่มแจ้งทุกคน (**ยังไม่ commit**)

ต้นเรื่อง: user ทักว่าที่ `/finance/payouts` "เอาสถานะไปเบียดรายละเอียด" + ถามว่า "ออกรายการแล้ว" แปลว่าอะไร

- **`web/lib/payoutStage.js` (ใหม่)** + เทส 12 เคส — ป้ายคำนวณจากตัวเลขจริง **ไม่เพิ่ม status ที่ 4 ใน DB**
  ร่าง → เตรียมโอน → โอนแล้ว 2/5 → โอนครบ·รอแจ้ง → แจ้งโอนแล้ว → ปิดรอบแล้ว (+ empty สำหรับรอบว่าง)
- `web/lib/payoutNotify.js` — แยก `unreachableReason()` ออกจาก `canNotify()` (นับ "แจ้งได้กี่คน" ต้องไม่ติด `not_paid`)
- `web/db/finance/payouts.js` — `listItemsForRounds()` ใช้ `ITEM_SELECT` เดิม
- `web/app/api/finance/payouts/route.js` — `withNotifyCounts()` แนบ `notifiable_count`/`notified_count`
  **เฉพาะรอบ `exported`** · ตัดสินด้วย `unreachableReason()` ฝั่ง JS
- `web/app/finance/payouts/page.js` — ป้ายย้ายลงใต้บรรทัดยอดเงิน · สีตาม `tone` ไม่ผูกกับ status
- `web/app/finance/payouts/[id]/page.js` — `sendNotify()` แยกจาก `notify()` · ปุ่ม **"แจ้งทุกคนที่จ่ายแล้ว (n คน)"**
- `scripts/dev/mobileAudit.routes.mjs` — เพิ่ม 2 เส้นทางพร้อม `wait: 2500`
- `web/locales/{th,en}.json` — `payouts.stage.*` (ลบ `statusDraft/statusExported/statusPaid`) + `payouts.notify.*`

**ผ่าน `/scrutinize` — 3 จุดที่ถูกแก้ อย่ารื้อกลับ:**
1. ปุ่มแจ้งทุกคน = **เบราว์เซอร์วนเรียก route รายคนเดิม เว้น 300ms** ⛔ ห้ามทำเป็น route ก้อนเดียว
   (50 คน ~20-40 วิ เสี่ยง nginx ตัดสายทั้งที่ DM ออกไปครึ่งนึง แล้ว client ไม่รู้ว่าใครได้แล้ว)
2. ⛔ ห้ามเขียนกติกา "ใครแจ้งได้" เป็น SQL ใน `listRounds` — ข้อมูลรับเงินมาจาก COALESCE 3 ชั้น + LATERAL
   ลอกไปอีกที่ = กติกาแตกสองชุด → ดึงแถวจริงมาตัดสินด้วย `unreachableReason()` ที่เดียว
3. รอบที่ไม่มีใครแจ้งได้เลย (คนนอกล้วน) **ห้ามขึ้น "แจ้งโอนแล้ว"** — `0 >= 0` จริงแบบว่างเปล่า → stage `paidAll`

**เคาะเพิ่มระหว่างทาง:** ⛔ ห้ามผูก DM กับ checkbox (ติ๊กพลาดแก้ได้ DM แก้ไม่ได้) · ⛔ ห้ามข้ามคนที่แจ้งแล้ว
(ส่งซ้ำเป็นเรื่องของ user · ป๊อปยืนยันบอกจำนวนคนที่จะได้ซ้ำแทน) · ส่งไม่ผ่าน = ไม่เขียน `notified_at` ตามเดิม

**Verify:** `npm run lint:all` 0 error · `cd web && npm test` **573 ผ่าน** (เดิม 561) ·
`NEXT_DIST_DIR=.next-verify npm run build` ผ่าน · `mobileAudit /finance/payouts,/finance/payouts/1` ✓ (มีข้อมูล render จริงแล้ว)
**ยังไม่ได้ทำ:** ยังไม่เคยกดปุ่ม "แจ้งทุกคน" จริง · ยังไม่ commit · ยังไม่ deploy

## 🚀 Next quest

1. **user กดปุ่มกระดิ่ง + ปุ่ม "แจ้งทุกคนที่จ่ายแล้ว (2 คน)" ที่ `/finance/payouts/1`**
   → ควรได้ DM จากบอท · ถ้าไม่เข้าให้ดู log เว็บหา `[discordDm...]`
2. commit + deploy (**ต้องรัน `npm run migrate up` บน prod ก่อน restart** ไม่งั้น route 500)
3. **mobileAudit รอบ 2 — ตรวจ "เบียดกันเหมือนตาราง" + "ปุ่มไม่ fluid"** (user สั่งตั้งโจทย์ไว้ 2026-09-19)
   โจทย์เต็มอยู่ท้าย `md/PENDING.md` · จุดบอดที่ยืนยันแล้ว: `scripts/dev/mobileAudit.mjs:261`
   ข้าม `textOverflow: ellipsis` ทั้งหมด → ชื่อที่เหลือ 100px จาก 412px ก็ "ผ่าน"
   ⚠️ **ห้ามแก้ UI ของ `/finance/payouts/1` ก่อนกฎใหม่เสร็จ** — ต้องเหลือไว้เป็นเคสทดสอบที่รู้คำตอบ

**ค้างจากงานก่อนหน้า:** ข้อมูลรอบ 1 — user แก้ event ให้ชี้ "แกะงบราชบุรี 70" (ราชบุรี) เรียบร้อยแล้ว

## Context

- branch `master` สะอาดถึง `151f1103` · งานของ 2 รอบนี้ยัง uncommitted ทั้งหมด (stage ไว้แล้ว)
- ⛔ **`md/TEAM/TEE.md` เป็น scratchpad ส่วนตัวของ user — อ่านได้ ห้ามเขียนลงไป** · `md/TEAM/bubu.md` ก็ห้ามแตะ
- ⛔ **ห้าม `npm run build` ตอน `next dev` ของ user รันอยู่พอร์ต 3000** — ใช้ `.next` ร่วมกัน
  ✅ `NEXT_DIST_DIR=.next-verify npm run build` · เช็ค `lsof -ti:3000` ก่อน
  ⚠️ **build เสร็จต้อง `rm -rf web/.next-verify` ทุกครั้ง** ไม่งั้น `lint:all` รอบถัดไปพัง 1288 error
  จากไฟล์ bundle (ESLint ไม่อ่าน .gitignore) — อาการหลอกมาก เหมือนโค้ดพังทั้งที่ไม่ได้แตะ
- **mobileAudit บนเครื่อง Mac ต้องส่ง `CHROME_PATH`** (สคริปต์ default เป็น path ของ Linux):
  `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/dev/mobileAudit.mjs --routes …`
  รอบแรกมักตาย "Chrome ไม่ยอมเปิด debugging port ภายใน 10 วิ" เพราะ cold start — **รันซ้ำอีกครั้งผ่านเอง**
- **ปิดรอบจ่ายทำได้ครั้งเดียว ย้อนไม่ได้** — `_guard.js` ตอบ 409 กับทุกคำสั่งเขียนเมื่อ `status='paid'`
  (ยกเว้น route ที่ส่ง `allowPaid` มาเอง) → ห้ามผูกงานที่ต้องทำซ้ำได้ไว้กับจังหวะปิดรอบ

---

## 🔜 ค้างจาก session ก่อนๆ (ยังจริงอยู่)

- `web/lib/officeBinaries.js` untracked — ไม่มีใครเรียก ยังไม่ commit
- backfill เลขบัญชีค้าง 5 คน: Namfon (ไฟล์เขียน `@namfon05__52871` แต่ prod มี `@namfon05_` id 17996
  — รอ user ยืนยันว่าคนเดียวกันไหม) · Tor P' / กาจชัย (มีเลขบัญชี ไม่มี username) · Aommie / Phon (ไม่มีเลขบัญชี)
- **DB local (`platfor`) เป็นก๊อปปี้เก่า ไม่ตรง prod** — "ไม่พบผู้ใช้" ไม่ได้แปลว่าไม่มีจริง
- query ผู้ติดต่อคืนแถวซ้ำ — `web/db/calling/contacts.js` `GROUP BY` มี `l.called_at, l.status, l.note`
  → คนถูกโทร 3 ครั้งโผล่ 3 แถว (ท่าที่ถูกคือ LATERAL แบบฝั่ง members) · แก้แล้วต้องขยับตัวกรองใน HAVING ตาม
- mobile audit ยัง exit 1 ที่ 9px — `app/calling/layout.js:10` `-mx-3 sm:-mx-4` ล้นทั้งโซน `/calling`
- `ALTER TABLE kanban_boards ALTER COLUMN teamspace_id SET NOT NULL;` เขียน migration แล้ว ยังไม่รันบน prod
- หนี้ i18n โซน posts (`PostEditor.jsx` 764 บรรทัดยังไม่มี `t()`) — ดู `md/PENDING.md`
- คลิปอัดในเว็บไม่มี `source_url` → `services/postsRetention.js:46` ไม่เก็บกวาดให้ ดิสก์โตทางเดียว
- 🧷 **ของ user ในเครื่อง dev ห้าม commit ห้ามรื้อ:** `utils/quoteStyleKeys.js` · `web/lib/quoteStyles.js`
  \+ คำ "การ์ดคำคม → การ์ดโควต" ใน `web/locales/th.json`
- ⛔ สาย faceless: ห้ามเสนอ TTS/avatar/เจนภาพ · ห้ามให้ AI แต่งเนื้อหาใหม่ในบทพูด ·
  คิวถัดไปคือ user เอาคลิปโพสต์ขึ้นเพจจริง 1 คลิป (ยังไม่เคยพิสูจน์ปลายท่อ)
- `getUserMedia` ทำงานเฉพาะ https หรือ localhost · prod ยังมี GitHub token ฝังใน remote url
