# ระบบ Contacts (PPLE CRM)

> อ่านร่วมกับ `CLAUDE.md` และ `CALLING.md` เสมอ  
> Contacts ยังคงเป็นส่วนหนึ่งของ Calling system แต่มี route และ UI เป็นของตัวเอง

---

## Overview

ระบบบันทึก "คนนอก" ที่พบปะหรือรู้จักผ่านกิจกรรมของพรรค เช่น ผู้บริจาค คนสนใจ อาสาสมัคร  
ต่างจาก `ngs_member_cache` ซึ่งเป็นสมาชิกพรรคที่ sync มาจาก ACT (ไม่แตะ)

จุดประสงค์หลัก:
- บันทึกคนที่เจอได้เร็วที่สุด (เช่น ตอนลงพื้นที่ event)
- บันทึกการพบปะแต่ละครั้ง (interaction log พร้อม signals)
- ใช้ร่วมกับ calling campaigns เดิม (assign, log call)

---

## Route

```
/contacts          ← หน้าจัดการ contacts (เดิม: /calling/contacts)
/contacts/[id]     ← detail + interaction log ของ contact คนนั้น
```

- `/calling/contacts` → redirect ไป `/contacts` (backward compat)
- Nav: ยังอยู่ใต้ PPLE Calling group ใน Nav.jsx แต่ URL เป็น `/contacts`
- `isCallingApp` ต้องครอบ `/contacts` ด้วย:
  ```js
  const isCallingApp = pathname.startsWith('/calling') || pathname.startsWith('/contacts')
  ```
- CALLING_LINKS: เปลี่ยน href จาก `/calling/contacts` → `/contacts`

---

## Database

### ตาราง `calling_contacts` (ไม่เปลี่ยนชื่อ)

ยังคง prefix `calling_` ไว้ — ตารางนี้เป็นส่วนหนึ่งของ calling system (ใช้ร่วมกับ `calling_logs`, `calling_assignments`, `calling_member_tiers`)

**Field ที่เพิ่มใหม่:**

| Column | Type | Notes |
|--------|------|-------|
| `specialty` | TEXT NULL | **ใหม่** — อาชีพ/ตำแหน่ง/ความสามารถ รวม free text (ชื่อเดียวกับ `dc_members.specialty`) |

**Field ที่ยังอยู่ใน DB แต่ถอดออกจากฟอร์ม:**
- `last_name` — ไม่แสดง ไม่บันทึกจากฟอร์ม (เผื่อมีข้อมูลเดิม)
- `email` — ไม่แสดง ไม่บันทึกจากฟอร์ม

### ตาราง `calling_logs` — เพิ่ม status ใหม่

```sql
ALTER TABLE calling_logs
  MODIFY COLUMN status ENUM('answered','no_answer','not_called','met') NOT NULL;
```

| status | ความหมาย | signals | นับเข้า tier |
|--------|----------|---------|-------------|
| `answered` | รับสาย | ✓ | ✓ |
| `no_answer` | ไม่รับสาย | ✗ | ✗ |
| `not_called` | ยังไม่ได้โทร | ✗ | ✗ |
| `met` | **พบปะ (ใหม่)** | ✓ | ✓ |

`met` ใช้สำหรับบันทึกการพบปะ in-person — signals แสดงและนับเข้า tier เหมือน `answered`

### Migration SQL (เพิ่มใน `scripts/migration/migration.sql`)

```sql
-- 2025-05 Contacts module: specialty field + met status
ALTER TABLE calling_contacts
  ADD COLUMN specialty TEXT NULL AFTER note;

ALTER TABLE calling_logs
  MODIFY COLUMN status ENUM('answered','no_answer','not_called','met') NOT NULL;
```

---

## Signals — เปลี่ยนเป็น 3 ตัวเลือก

UI เปลี่ยนจาก 4 ปุ่มเป็น 3 ปุ่ม label: **น้อย / ปานกลาง / มาก** พร้อม hint text ใต้ปุ่ม  
DB ยัง store ค่า 1–4 เหมือนเดิม โดย map: น้อย=1, ปานกลาง=2, มาก=4 (ข้าม 3 เพื่อไม่ต้อง migrate ข้อมูลเดิม + formula tier ไม่ต้องแก้)

| Signal | น้อย (1) | ปานกลาง (2) | มาก (4) |
|--------|---------|------------|--------|
| **ที่อยู่** | ต่างจังหวัด+ | ในจังหวัด | ในอำเภอ |
| **เวลา** | ไม่ค่อยว่าง | ว่างบ้าง | ว่างมาก |
| **ความสนใจ** | ไม่ค่อยสนใจ | สนใจ | กระตือรือร้น |

```
ที่อยู่   [น้อย]        [ปานกลาง]    [มาก]
          ต่างจังหวัด+   ในจังหวัด    ในอำเภอ
```

แก้ที่ `RecordCallModal.jsx` — render signals เมื่อ `status === 'answered' || status === 'met'`

---

## Interaction Log (การพบปะ)

บันทึกใน `calling_logs` ด้วย:

```json
{
  "contact_type": "contact",
  "campaign_id": 0,
  "status": "met",
  "note": "...",
  "called_by": "<discord_id>",
  "sig_location": 1|2|4,
  "sig_availability": 1|2|4,
  "sig_interest": 1|2|4
}
```

- `campaign_id = 0` = ไม่ผูกกับ campaign ใด
- signals optional (กรอกได้ เหมือน answered)
- tier คำนวณอัตโนมัติหลังบันทึก (เหมือนกับการโทร)
- POST ไป `/api/calling/logs` ที่มีอยู่แล้ว (ไม่ต้องเพิ่ม endpoint ใหม่)

**UI ใน `/contacts/[id]`:** expand section "บันทึกการพบปะ" — ใช้ RecordCallModal component เดิมแต่กระชับกว่า (inline ไม่ใช่ modal popup)

---

## Contact Form (ContactForm.jsx)

### Fields ที่แสดง (เรียงตามลำดับ)

1. ชื่อ `first_name` (required)
2. ประเภท `category` — dropdown: ผู้บริจาค / คนสนใจ / อาสาสมัคร / อื่นๆ
3. เบอร์โทร `phone` + LINE ID `line_id` (2 columns)
4. อาชีพ/ตำแหน่ง/ความสามารถ `specialty` — textarea 2 rows
5. จังหวัด → อำเภอ → ตำบล (cascade dropdown เดิม)
6. หมายเหตุ `note` — textarea 3 rows

### Fields ที่ถูกถอดออกจากฟอร์ม
- `last_name`, `email` — ไม่แสดง ไม่บันทึก (ยังอยู่ใน DB)
- `occupation`, `position`, `skills` — **ไม่สร้าง** รวมเป็น `specialty` field เดียว

---

## หน้า /contacts (List)

- Header: "Contacts" + ปุ่ม "+ เพิ่ม Contact"
- Search bar: ค้นชื่อ / เบอร์ / LINE
- List: card แต่ละคน กดไป `/contacts/[id]`

### Contact Card

```
[ ชื่อ ]  [ badge: คนสนใจ ]
specialty (ถ้ามี, 1 บรรทัด)
จังหวัด › อำเภอ  |  เบอร์  |  LINE (ถ้ามีสิทธิ์)
note ย่อ (line-clamp-1, italic)
```

---

## หน้า /contacts/[id] (Detail)

### ส่วนข้อมูล
- แสดงทุก field
- ปุ่มแก้ไข (modal `ContactForm`) + ปุ่มลบ

### ส่วน Interaction Log (expand section)

```
▼ บันทึกการพบปะ / ประวัติ

  [inline form: status=met, signals, note → POST /api/calling/logs]

  ─────────────────────────────
  3 พ.ค. 68 — พบปะ — "เจอที่งาน event ราชบุรี"   (บันทึกโดย ชื่อ)
  2 มี.ค. 68 — รับสาย — "ทำงานลาดกระบัง"          (campaign: กิจกรรมราชบุรี)
  10 ก.พ. 68 — ไม่รับสาย                           (campaign: กิจกรรมราชบุรี)
```

- รวม log ทุกประเภท (`met`, `answered`, `no_answer`) เรียง desc
- แสดง campaign name ถ้า `campaign_id != 0` (join `act_event_cache`)
- Inline form ไม่ใช่ modal popup — expand อยู่แล้วพร้อมกรอก

---

## API Routes

### เดิม (ไม่เปลี่ยน path)

```
GET  /api/calling/contacts
POST /api/calling/contacts
GET  /api/calling/contacts/[id]
PUT  /api/calling/contacts/[id]
DEL  /api/calling/contacts/[id]
GET  /api/calling/contacts/campaign
POST /api/calling/logs              ← บันทึกพบปะ (body: status='met', campaign_id=0)
```

### ใหม่

```
GET  /api/calling/contacts/[id]/logs
     query: calling_logs WHERE member_id=? AND contact_type='contact'
     LEFT JOIN act_event_cache ON id=campaign_id AND type='campaign'
     ORDER BY called_at DESC
```

---

## Backend (db/calling/contacts.js)

- **ไม่เปลี่ยนชื่อตาราง**
- เพิ่ม `specialty` ใน `createContact`, `updateContact`, `getContactsList`, `getContactById`
- ฟังก์ชันใหม่ `getContactLogs(contactId)` — query `calling_logs` join `act_event_cache` เรียง desc

---

## Components

| File | การเปลี่ยนแปลง |
|------|--------------|
| `ContactForm.jsx` | ลบ `last_name`, `email` / เพิ่ม `specialty` textarea |
| `RecordCallModal.jsx` | signals แสดงเมื่อ `status === 'answered' \|\| status === 'met'` / ปุ่ม signal เปลี่ยนเป็น 3 ตัวพร้อม hint |

---

## Permission

ใช้ `callingAccess.js` เดิม ไม่เปลี่ยน:

| Action | ทีม | จังหวัด+ |
|--------|-----|---------|
| ดู list / detail | ✓ | ✓ |
| สร้าง / แก้ไข contact ของตัวเอง | ✓ | ✓ |
| แก้ไข / ลบ contact ทุกคน | ✗ | ✓ |
| บันทึกการพบปะ | ✓ | ✓ |
| เห็น phone / LINE | ✗ | ✓ |

---

## Not in Scope

- `ngs_member_cache` / member CRM → ระบบพรรคจัดการแยก ไม่แตะ
- Photo / social media / export CSV → ไม่ทำในรอบนี้
- Signal threshold / tier formula → ยังใช้เดิม (ไม่แก้ในรอบนี้)
