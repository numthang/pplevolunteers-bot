# STATUS — 2026-09-19

## ✅ จัดบ้าน `md/` ครบ 6 เฟส + กวาด PENDING.md (commit แล้วทั้งหมด)

session นี้ทำ 2 งานต่อกัน · ทุกเฟส commit แยก ย้อนได้ทีละขั้น

| | commit |
|---|---|
| กวาด PENDING.md 2,527 → 1,604 บรรทัด · แยกประวัติ 28 หัวข้อเข้า `md/archive/DONE-2026-0{7,8,9}.md` | `fc0eca34` |
| เฟส 1 ย้าย 9 โฟลเดอร์โมดูล → `md/modules/` · scratch 5 ไฟล์ → `md/archive/` | `b1a09783` |
| เฟส 2 สร้าง `rules/` `reference/` `decisions/` | `aa379470` |
| เฟส 3 **ผ่า `WEB.md` 674 บรรทัด** → DESIGN / ARCHITECTURE / CODE / FINANCE + เปลี่ยน hook | `b5cfbe64` |
| เฟส 4 `contact_type` เหลือที่เดียว · CALLING.md เลิกลอก schema | `86078a5a` |
| เฟส 6 `md/README.md` + Quick Links เป็น router | `3bd935d8` (user commit) + `c952e0d6` |

**โครงใหม่:** `md/` ที่รากเหลือ `README.md` + `PENDING.md` · ที่เหลืออยู่ใน
`rules/` (DESIGN 474 · CODE 161) · `reference/` (ARCHITECTURE 309 · DATABASE 1111 · DEPLOYMENT 578) ·
`modules/` (9 โฟลเดอร์) · `decisions/` (ว่าง) · `archive/` · `TEAM/` (⛔ ห้ามแตะ)

**ตรวจปิดงานแล้ว:** ไม่มีลิงก์เสีย (เหลือ `md/civicflow/CIVICFLOW.md` ที่ถูกลบไปใน `e3833800`
— เขียนวิธีกู้ไว้ในเนื้อแล้ว) · `npm run lint:all` 0 error · `cd web && npm test` 583/583 ผ่าน ·
ไม่มีบรรทัดเนื้อหาไหนหาย (ตรวจทุกเฟสด้วยการ diff ชุดบรรทัดเดิมกับไฟล์ปลายทางทั้งหมด)

## ⏭️ งานถัดไปที่เห็นชัดที่สุด

1. **`md/PENDING.md` §👁️** — 22 ข้อที่ "ขึ้น prod แล้วแต่ยังไม่มีใครกดดูด้วยตา" + 5 สคริปต์/คำสั่ง
   ที่ต้องยืนยันว่ารันบน prod แล้วหรือยัง (`backfill-avatars.js` · `backfillEntityCards.mjs` ·
   `moveWatermarksToOrg.js` · `npm run migrate up` · ตัวแปร `AI_KEY_SECRET` ในไฟล์ตั้งค่าของ prod)
2. **`rules/DESIGN.md` 474 บรรทัด ≈ 9,500 token ยังถูก hook inject ทั้งไฟล์** ทุกครั้งที่แก้ `web/`
   ถ้าจะลดอีกต้องเปลี่ยนกลไก hook (เตือน + ชี้ไฟล์ แทน inject เนื้อ) — ไม่ได้อยู่ในแผนจัดบ้าน ยังไม่ทำ
3. งานค้างเดิมทั้งหมดอยู่ `md/PENDING.md` (72 หัวข้อ) — §🔻 บนสุดคือรอบล่าสุด 2026-09-19

---

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

## ✅ เสร็จรอบสี่: ถังขยะ hover + `md/DESIGN.md` (**ยังไม่ commit**)

- `web/app/finance/payouts/page.js` — ถังขยะย้ายไปลอยมุมขวาบน `absolute` โผล่ตอน hover
  (`[@media(hover:hover)]:` ไม่ใช่ `sm:` · มือถือโชว์ถาวร + `pr-10` เฉพาะจอที่ไม่มี hover)
  · ป้ายสถานะ **ต่อท้ายบรรทัดยอดเงิน บรรทัดเดียวกัน** — user ลองครบ 4 ท่าในวันเดียวแล้วเคาะท่านี้
  ⛔ ห้ามย้ายป้ายกลับไปแถวเดียวกับชื่อรอบ (ทั้งหน้าและหลัง) และห้ามแยกเป็นบรรทัดของตัวเอง (การ์ดสูงขึ้นทุกใบ)
  ตารางเทียบทั้ง 4 ท่าพร้อมตัวเลขอยู่ `md/DESIGN.md §1`
- `web/app/finance/payouts/[id]/page.js` — ตัดทศนิยม (`intAmount`/`fmtBaht` — pg คืน numeric เป็น `'800.00'`)
  · กล่องยอดรายแถว `h-11 w-20 sm:w-24` → `h-9 w-16 sm:w-20` (สูงเท่าปุ่มไอคอนข้างๆ)
  · **ถังขยะในแถว = hover-reveal (อยู่ใน flow ไม่ใช่ absolute — แถวต้องเรียงคอลัมน์ตรงกัน)**
  · **กระดิ่งย้ายไปท้ายสุดของแถว** — เดิมอยู่กลางแถว พอติ๊ก "จ่ายแล้ว" ปุ่มโผล่มาดันทั้งแถวเลื่อน
  · **แถบปุ่มท้ายหน้า 4 ปุ่ม → `grid grid-cols-1 gap-2 sm:flex sm:flex-wrap`** (มือถือเต็มความกว้าง)
  ⚠️ หน้านี้เคยถูกจดไว้ว่า "ห้ามแก้ UI ก่อนกฎ mobileAudit ใหม่เสร็จ" — user สั่งแก้เอง เคสทดสอบเปลี่ยนแล้ว
- **`md/DESIGN.md` (ใหม่ 240 บรรทัด)** — กฎ "วางตรงไหน ทำไม" คนละชั้นกับ `md/WEB.md` ("ใช้คลาสอะไร")
  กายวิภาคการ์ด · ท่า hover-reveal · ปุ่มทำลาย · ขนาดปุ่มไอคอน · ป้ายสถานะ · เช็คลิสต์ปิดงาน
  ท้ายไฟล์มีหนี้ค้าง 3 จุดที่ยังไม่ตรงกฎ (kanban:290 · payouts/[id] · AccountCard)
- `md/DESIGN.md` เพิ่ม §0.5 พจนานุกรมคำสั่ง user (หน้า/หลัง = บรรทัดเดิม · บน/ใต้ = บรรทัดใหม่)
  และ §8 แถวปุ่ม fluid บนมือถือ
- `md/WEB.md:280` — แก้กฎ hover ที่จดผิด (`sm:` → `[@media(hover:hover)]:`) + ลิงก์ไป DESIGN.md
- `CLAUDE.md` — เพิ่ม DESIGN.md ใน Quick Links + Required Reading
- ลบ `web/.next-verify` ที่ค้าง (ทำให้ `lint:all` ขึ้น 1288 error หลอกๆ ตามที่เตือนไว้ใน §Context)

**Verify:** `lint:all` 0 error · `npm test` 573 ผ่าน · `mobileAudit /finance/payouts` ✓ ไม่ล้น
**ยังไม่ได้ทำ:** ยังไม่ commit

## ✅ เสร็จรอบสาม: mobileAudit กฎ unreadable/squeezed/ragged + เคสทดสอบที่ไม่เน่า (**ยังไม่ commit**)

user สั่งทำตามโจทย์ท้าย `md/PENDING.md` — บันทึกเต็มอยู่ที่นั่น (§mobileAudit รอบ 2) ตรงนี้เอาแค่หัวข้อ:

- `scripts/dev/mobileAudit.mjs` — กฎ **unreadable** (truncate ตัดหนัก = **error**) · **squeezed**
  (คอลัมน์ข้อความถูกบีบ) · **ragged** (แถวปุ่มแหว่ง) ทั้งหมดอยู่ในโหมด overflow (ค่าเริ่มต้น) · P/Q เป็นคำแนะนำ ไม่ทำให้ exit 1
  · ทุกกฎพิมพ์ตัวเลขจริง · ปิดเสียงรายจุดด้วย `data-audit-ok="unreadable|squeezed|ragged|all"`
- `scripts/dev/mobileAudit.fixture.html` (ใหม่) + `--selftest` — 9 เคสที่รู้คำตอบ (ยิง 5 เงียบ 4)
  **เคสทดสอบใน PENDING เน่าไปแล้วตอนลงมือ** (commit `d08408a8` แก้ layout ทั้ง 3 จุดไปก่อน)
  → ต้องมี fixture ที่คุมความกว้างเอง ไม่งั้นแยกไม่ออกว่า "ผ่าน" เพราะหน้าดีหรือเพราะกฎตาย
- **บั๊กเก่าที่เจอระหว่างทาง:** `steps: [{ wait: n }]` หัวแถวไม่เคยทำให้วัดซ้ำ (sleep แล้ว continue)
  ⇒ หน้าที่ fetch หลัง mount ถูกวัดตอน "กำลังโหลด…" มาตลอด (74 element เทียบกับ 167)
  แก้แล้ว + เพิ่ม `{ waitFor: '<selector>' }` เพราะเวลาตายตัวแพ้เวลา compile เป็นบางรอบ

**Verify:** `--selftest` 9/9 · `lint:all` 0 error · `--all` 21 หน้า → exit 1 ที่ 3 หน้าเดิม
(`/calling`, `/calling/assignments/70`, `/integrations` — พังที่ A/B/D อยู่ก่อนแล้ว) **กฎใหม่ไม่ได้
ทำให้หน้าไหนกลายเป็น error ใหม่** · คำแนะนำรวม 10 จุดทั้งเว็บ
**ยังไม่ได้ทำ:** ยังไม่ commit · ยังไม่ตัดสินใจเรื่องโน้ตการโทรที่โดนตัดเหลือ 16% (ดู PENDING)

## ✅ เสร็จรอบสี่: design system ชั้นแรก — primitive + /styleguide (**ยังไม่ commit**)

user ถามว่าจะทำ design system ต้องเริ่มยังไง → วัดแล้วพบว่ากฎมีครบบนกระดาษ แต่ไม่มีตัวบังคับ
(กฎ dark mode ที่มีเครื่องบังคับ ละเมิด 0/2845 · กฎที่มีแต่ข้อความ ละเมิด 16-403 จุดทุกข้อ)
รายละเอียดเต็ม + ขั้นถัดไปอยู่ท้าย `md/PENDING.md`

- `web/components/ui/` 5 ไฟล์ใหม่ (Button/Field/Textarea/Card/Badge) — ห่อกฎที่เคยเป็นข้อความไว้ในโค้ด
- `web/app/styleguide/page.js` — 9 หัวข้อ import ของจริง · ยกเว้น i18n โดยตั้งใจ (หน้าสำหรับ dev)
- แก้ `mobileAudit` 2 บั๊กที่เจอตอนเอากฎมาตรวจหน้าตัวเอง (กฎ ragged ยิงปุ่มไอคอน · `data-audit-ok` ใช้ไม่ได้เลย)
- `md/WEB.md` + `md/DESIGN.md §8` ชี้มาที่ primitive แล้ว

**Verify:** lint 0 error · /styleguide 200 · mobileAudit ✓ 375+320 · selftest 9/9 · ดูภาพจริงแล้ว
**ยังไม่ได้ทำ:** ยังไม่ commit · ยังไม่ migrate ปุ่ม 714 ตัว · ยังไม่ทำ ESLint rule หยุดเลือด (ขั้นถัดไปข้อ 1)

## ✅ เปลี่ยนชื่อกฎ mobileAudit เป็นคำอังกฤษ (2026-09-19 · **ยังไม่ commit**)

A/B/C/D/E/N/P/Q/T/F/K/G/H → `overflow` `zoomed` `offscreen` `clipped` `slack` `unreadable`
`squeezed` `ragged` `tiny` `loose` `crowded` `uneven` `wrapped` — ตารางแปลงเต็มอยู่ท้าย `md/PENDING.md`
(user: "อยากเปลี่ยน code name ย่อๆ เป็นคำที่คนทั่วไปใช้พูดกัน") · selftest 9/9 ผ่านด้วยชื่อใหม่

## 🧹 จัด PENDING.md (2026-09-19)

ย้าย 5 หัวข้อที่เสร็จจบแล้ว (244 บรรทัด) ออกไป `md/archive/DONE-2026-09.md` · PENDING เหลือ 2,527 บรรทัด
· งานค้างที่ยังเหลือจากหัวข้อพวกนั้นถูกสกัดกลับมาเป็นหัวข้อแรกของ PENDING (§งานค้างจากรอบ 2026-09-19)
**ยังไม่ได้กวาดลึก** — ยังมีอีกหลายหัวข้อที่ "เสร็จบางส่วน/เสร็จ local ยังไม่ deploy" ที่ควรสรุปสั้นแล้ว
ย้ายรายละเอียดไป archive (เช่น POSTS 293 บรรทัด · org_members 146 · backfillCaseThreads 143 · Posts เฟส C 103)
→ รวมไว้เป็นเฟส 5 ของงานจัดบ้าน md/ แล้ว

## 🚀 Next quest

### ▶️ session หน้าเริ่มตรงนี้ — user สั่งไว้ 2026-09-19: *"ผมจะจัดระเบียบมาตรฐาน md"*

**โจทย์เต็มอยู่ท้าย `md/PENDING.md` §จัดบ้าน `md/` ให้เป็นมาตรฐาน** — อ่านแล้วทำต่อได้เลย
ไม่ต้องวัดอะไรใหม่ (ตัวเลข · จุดที่ต้องไล่แก้ลิงก์ · ลำดับ 6 เฟส · ข้อห้าม จดไว้ครบแล้ว)
⚠️ ทำทีละเฟส commit แยก · ห้ามแตะ `md/TEAM/*` และ `.wolf/`

### ที่เหลือ

1. **user กดปุ่มกระดิ่ง + ปุ่ม "แจ้งทุกคนที่จ่ายแล้ว (2 คน)" ที่ `/finance/payouts/1`**
   → ควรได้ DM จากบอท · ถ้าไม่เข้าให้ดู log เว็บหา `[discordDm...]`
2. commit + deploy (**ต้องรัน `npm run migrate up` บน prod ก่อน restart** ไม่งั้น route 500)
3. ~~mobileAudit รอบ 2~~ **เสร็จแล้ว** (ดูหัวข้อข้างบน) — เหลือให้ user เคาะจุดเดียว:
   `/calling/assignments/70` โน้ตการโทรโดนตัดเหลือ 16% (205px จาก 1247px) ซ้ำ 6 แถว
   จะ `line-clamp-2` / ตัดที่ server / หรือประกาศ `data-audit-ok="unreadable"` ว่าตั้งใจ?
4. **จัดบ้าน `md/` ให้เป็นมาตรฐาน** — user เคาะแล้วว่าเอาแบบย้ายเข้าโฟลเดอร์
   (`rules/` `reference/` `modules/` `archive/`) แต่สั่งให้**จดเป็นโจทย์ไว้ก่อน ยังไม่ลงมือ**
   โจทย์เต็ม + ตัวเลขที่วัดไว้แล้ว + ลำดับ 6 เฟส อยู่ท้าย `md/PENDING.md`
5. **ESLint หยุดเลือดกฎหน้าตา** (`text-xs` 403 จุด · `rounded-xl` 160 · ปุ่มนอกสเกล 51)
   — เสนอไว้แล้ว user ยังไม่เคาะ · ท่าเดียวกับ `eslint.db-allowlist.mjs`

**ยังไม่ commit ทั้งหมด (งาน 4 รอบของวันนี้):**
`scripts/dev/mobileAudit.mjs` · `mobileAudit.routes.mjs` · `mobileAudit.fixture.html` (ใหม่) ·
`web/components/ui/` (ใหม่ 5 ไฟล์) · `web/app/styleguide/` (ใหม่) · `md/DESIGN.md` · `md/WEB.md` ·
`md/PENDING.md` · `md/archive/DONE-2026-09.md` (ใหม่) · `.wolf/{STATUS,cerebrum,buglog}`
⚠️ ในเครื่องมีไฟล์ที่ **user กำลังแก้เองปนอยู่ด้วย** (`web/components/Nav.jsx` · `web/lib/permissions.js` ·
`web/app/api/finance/payouts/_guard.js` · `web/app/finance/payouts/layout.js` · `md/TEAM/TEE.md`)
→ ถ้าจะ commit ให้เลือกเฉพาะไฟล์ อย่า `git add -A`

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
