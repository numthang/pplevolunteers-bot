# Kanban — จุดรับช่วง session หน้า (เขียนใหม่ 2026-08-19 เช้ามืด)

> อ่านไฟล์นี้แล้วทำต่อได้เลย ไม่ต้องไล่ถามซ้ำ
> เสร็จเรื่องไหนให้ลบหัวข้อนั้นทิ้ง · เคลียร์หมดแล้วลบไฟล์นี้ได้

## สถานะ

**20 commit บน `master` เครื่อง dev — ยังไม่ push ยังไม่ deploy** (`bc44bf5` … `253ea71`)

| กลุ่ม | commit |
|---|---|
| ลบถาวรแบบ Notion · duplicate card · checklist ดึงจากคลัง | `bc44bf5` `0f67bd9` `fdadd17` `a61b22c` |
| กล่องลบทรง posts (เข้ากรุ/ลบถาวร/ยกเลิก) | `2fccb12` |
| รื้อ UI ทั้ง modal เป็นแถว `label \| ค่า` แบบ Notion | `b9a2f07` `fb76771` `d21ce16` |
| combobox เดียวใช้ทั้ง custom field + สถานะ/เจ้าภาพ/คนช่วย | `d21ce16` |
| ลาก field (เงา + เส้นบอกจุดวาง) | `72ce849` `2460604` `cdeb9ca` |
| ก้อน A ใน modal · ก้อน B กระดาน | `7d74006` `d923ed4` |
| แก้ i18n / บั๊ก | `2fdfc07` `253ea71` |

`npm test` 419 ผ่าน · build ผ่าน · **smoke DB เขียนใหม่ 4 ชุด ผ่านหมด**

⚠️ **user กดจริงแล้วเฉพาะก้อน A** — ก้อน B (กระดาน) กับเส้นลาก field **ยังไม่เคยกด**

---

## ⚠️ กับดักตอน deploy

1. **migration ค้าง 21 statement** หลัง marker `-- production ทำถึงตรงนี้`
   (user ขยับ marker ลง 1 ขั้นแล้ว = รัน orgchart บน prod ไปแล้ว)
2. **`ALTER TABLE kanban_card_checklist ALTER COLUMN field_id SET NOT NULL` พังถ้า prod มีข้อมูลเช็คลิสต์**
   เช็คก่อน: `SELECT count(*) FROM kanban_card_checklist;` (dev มี 0 แถวตอนแปลง)
3. **บอทกับเว็บต้องขึ้นพร้อมกัน** — `db/kanbanCards.js` เขียน `source_url`/`source_message_id`
4. ⛔ **ลำดับบน prod ห้ามสลับ** (dev ทำครบแล้ว · migration.sql เขียนกำกับไว้ท้ายไฟล์)
   1) รัน `scripts/migration/kanbanLabelsToFields.mjs` dry-run → 2) `--commit` ย้ายข้อมูล
   3) deploy โค้ดใหม่ → 4) ตรวจว่าแท็กขึ้นครบ → 5) ค่อย `DROP TABLE kanban_card_labels, kanban_labels`
   ขึ้นโค้ดก่อนย้าย = แท็กหายต่อหน้า · ลบตารางก่อนย้าย = กู้ไม่ได้
5. **`blocked`/`blocked_reason` ถูก DROP แล้ว** — เช็คก่อนบน prod: `SELECT count(*) FROM kanban_cards WHERE blocked;` (dev ได้ 0)
6. ⛔ **ห้ามเชื่อว่า prod อยู่สถานะไหนจากไฟล์นี้ — ถาม user เสมอ**

---

## งานที่เหลือ

### 1. 🔴 ให้ user กดก้อน B + เส้นลาก field
- กระดาน: ปุ่ม **+** บนหัวกอง → พิมพ์ชื่อ Enter · **hover การ์ด** → ปากกา (แก้ชื่อ) + จุดไข่ปลา (ทำสำเนา/ลบ)
- ⚠️ `+` โผล่เฉพาะโหมด "ตามสถานะ" · กองที่ไม่ใช่ "รอทำ" จะตั้งคนกดเป็นเจ้าภาพ (`assignToMe`)
  เพราะ DB CHECK ห้ามการ์ดไม่มีเจ้าภาพออกจาก backlog — **ถ้า user ไม่ชอบพฤติกรรมนี้ต้องเปลี่ยน**
- ลาก field: เส้นเดียวตรงที่เมาส์อยู่ + แถวต้นทางจางลง
- **ลองบนมือถือ ~390px ด้วย** (แถว 2 คอลัมน์ต้องพับเป็นบนล่าง)

### 2. ✅ ยุบป้าย → custom field — **เสร็จแล้ว 2026-08-19**
ข้อมูลย้ายครบ **ตกหล่น 0** (พื้นที่ 13 · สายงาน 57 · อุปกรณ์ 16 เส้น) · ตารางป้ายยังอยู่ครบ ยังไม่ DROP
สคริปต์: `node --env-file=.env scripts/migration/kanbanLabelsToFields.mjs [--commit]` — dry-run ก่อนเสมอ · รันซ้ำได้
ทางเขียนแท็กจุดเดียว = `web/db/kanban/tags.js` · ทางแปลง field→ชิปจุดเดียว = `cardTags()` ใน `lib/kanbanTagFilter.js`
⛔ **prod ไม่มี field พวกนี้** (user สร้างเองผ่าน UI บน dev) — สคริปต์สร้างให้เองจาก **ชื่อ** ห้ามอ้าง id/key

### 3. ✅ import 82 ใบจาก xlsx — **เสร็จแล้ว 2026-08-19**
`TRUNCATE kanban_cards RESTART IDENTITY CASCADE` แล้ว import ใหม่ทั้งชุด (user เคาะ: ล้างแล้วเอาเข้าใหม่หมด)
→ **82 ใบ K-1..K-82 · แท็ก 288 · งบประมาณ 13 · คนช่วย 72 · error 0**
สำรองก่อนล้าง: `backups/kanban/pre-truncate-20260819-1010.sql`

**คอลัมน์ xlsx → ปลายทาง (11/12 เข้าระบบ):**
Title→title · Description→detail · ผู้รับผิดชอบ→เจ้าภาพ+คนช่วย · Date→start/due · Status→status_type
category→field สายงาน · อำเภอ→field พื้นที่ · อุปกรณ์→field อุปกรณ์ (checklist) · งบประมาณ→field งบประมาณ (number)
**Discord→`kanban_cards.source_url`** (ช่องประจำ ไม่ใช่ custom field — บอทใช้ช่องเดียวกัน)
⛔ **FB Post ไม่เอาเข้า** (user เคาะ) — ลิงก์โพสต์อยู่โมดูล posts แล้ว ทำซ้ำ = 2 ที่ไม่ตรงกัน
❌ **Checklist กู้ไม่ได้ถาวร** — AppFlowy export มาเป็น % (`0.73`) ไม่มีตัวข้อความ

⚠️ **งบประมาณในไฟล์มีแค่ 13/82** — user ยังไม่ได้เติมตอน import · เติมเพิ่มได้ 2 ทาง:
กรอกในเว็บทีละใบ **หรือ** เติม xlsx แล้ว truncate+import ใหม่ (จะทับของที่กรอกในเว็บไปแล้ว)

### 4. ✅ ติดตั้ง ESLint — **เสร็จแล้ว 2026-08-19**
`npm run lint:all` ที่ root = ตรวจทั้งบอทและเว็บ · baseline **0 error** (web 97 warn / bot 42 warn)
เปิดเฉพาะ rule ที่จับบั๊กจริง (`no-undef` = error) rule สไตล์ปิดหมด — **ห้ามเปิดเพิ่มโดยไม่ถาม**
รันครั้งแรกเจอบั๊กจริง 2 ตัวที่ build + test 419 ข้อจับไม่ได้ (bug-427, bug-428)
→ **หลังลบ/ย้ายฟังก์ชันทุกครั้ง ให้รัน `npm run lint:all` ไม่ใช่แค่ build**

---

## เอกสารที่ต้องอ่านก่อนแตะโค้ด

- `md/kanban/KANBAN.md` §ลบถาวร · §ทำสำเนาการ์ด · §"พักไว้" กับ "กรุ" (ห้ามยุบเข้าหากัน)
- `md/kanban/CUSTOM-FIELDS.md` §กลับคำรอบเย็น
- `.wolf/cerebrum.md` §Do-Not-Repeat 2026-08-18/19
- `web/components/kanban/FieldRow.jsx` — **ของระบบกับ custom field ใช้แถวตัวนี้ตัวเดียวกัน ห้ามเขียน grid ซ้ำ**
- `web/components/kanban/TagCombobox.jsx` — 3 โหมด (`field`/`static`/`search`) · โหมด field คือเส้นเดิม **ห้ามแตะ**
- `web/db/kanban/tags.js` — **ทางเขียนแท็กจุดเดียว** (สคริปต์ import + สคริปต์ย้ายข้อมูล ใช้ตัวนี้ร่วมกัน)
- `web/lib/kanbanTagFilter.js` §`cardTags()` — **ทางแปลง field → ชิปจุดเดียว** ห้ามเขียนซ้ำที่อื่น
