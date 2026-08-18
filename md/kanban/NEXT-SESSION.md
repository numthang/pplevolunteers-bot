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
4. **DROP ตารางป้ายค้างไว้** — `kanban_labels` / `kanban_card_labels` ไม่มีโค้ดอ่านแล้วแต่ยังไม่ลบ
   ตั้งใจ: ให้ deploy + ดู prod จนนิ่งก่อน แล้วค่อยลงเป็น DDL ใน migration.sql รอบถัดไป
   บน prod ต้องรัน `scripts/migration/kanbanLabelsToFields.mjs --commit` **ก่อน** ขึ้นโค้ดใหม่
   ไม่งั้นแท็กบนการ์ดจะหายไปต่อหน้า (โค้ดใหม่อ่านจาก field อย่างเดียว)
5. ⛔ **ห้ามเชื่อว่า prod อยู่สถานะไหนจากไฟล์นี้ — ถาม user เสมอ**

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

### 3. ⬜ import 82 ใบจาก xlsx ← **งานถัดไป (user จะทำเอง session หน้า)**
`node --env-file=.env scripts/import/kanbanFromAppflowy.mjs` (dry-run) → `--commit` → `--all` เอาที่จบแล้ว 50 ใบด้วย
✅ สคริปต์ชี้ไป custom field แล้ว (ไม่ใช่ป้าย) · dry-run ล่าสุด: การ์ด 32 · แท็ก 76 · error 0
⚠️ **ยังไม่มี dedupe** — รัน `--all` วันนี้ = ทับของเดิม 32 ใบ ต้องทำ dedupe ก่อน
`Checklist` จาก AppFlowy **กู้ไม่ได้ถาวร** (export มาเป็น % ไม่มีตัวข้อความ)

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
