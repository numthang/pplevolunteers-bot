# Finance System — RBAC, Schema & UX

👉 See [md/DATABASE.md](DATABASE.md) for full table schemas

---

## Access Control (RBAC)

### การดู (View Access) — Different by Account Visibility

#### Public Account
```
ดูได้ทั้งหมด (ไม่ต้อง login)
```

#### Private Account
```
เจ้าของ || Admin
```

#### Internal Account
```
เจ้าของ 
|| Admin 
|| เลขาธิการ 
|| เหรัญญิก 
|| กรรมการจังหวัด (ของบัญชีนั้น)
|| ผู้ประสานงาน (ของบัญชีจังหวัดนั้น)
|| ผู้ประสานงานภาค (ของบัญชีจังหวัดนั้น)
|| รองเลขาภาค (ของบัญชีจังหวัดนั้น)
```

### การแก้ไข (Edit Access)

#### Public Account
```
เจ้าของ || Admin || เหรัญญิก
```

#### Private Account
```
เจ้าของ || Admin
```

#### Internal Account
```
เจ้าของ 
|| Admin 
|| เลขาธิการ 
|| (เหรัญญิก && {
    กรรมการจังหวัด (ของบัญชีนั้น)
    || ผู้ประสานงาน (ของบัญชีจังหวัดนั้น)
    || ผู้ประสานงานภาค (ของบัญชีจังหวัดนั้น)
    || รองเลขาภาค (ของบัญชีจังหวัดนั้น)
  })
```

---

## UX Requirements

## 1. Category Picker แบบ Icon Grid

แทน dropdown ให้เปลี่ยนเป็น icon grid แบบ Money+ app

```
UI:
┌────┬────┬────┬────┐
│ 🍜 │ ⛽ │ 🏠 │ 🚌 │
│อาหาร│น้ำมัน│ที่พัก│เดินทาง│
├────┼────┼────┼────┤
│ 💊 │ 🎁 │ 📱 │ ➕ │
│ยา  │ของขวัญ│สื่อสาร│อื่นๆ  │
└────┴────┴────┴────┘
```

- กดจิ้ม icon ได้เลย ไม่ต้อง dropdown
- เรียงตาม `usage_count DESC` (ใช้บ่อย → ขึ้นก่อน) — Recommended tab
- มี tab "ทั้งหมด" แสดง category ทุกตัว
- กดได้จาก transaction list โดยตรง ไม่ต้องเข้าหน้าแก้ไข

---

## 2. เครื่องคิดเลขในตัว (Inline Calculator)

ตอนกรอกจำนวนเงิน ให้มี calculator keyboard แทน keyboard ตัวเลขธรรมดา

```
┌─────────────────────┐
│ Note    660 + 100 = │  ← แสดง expression
│                 760 │  ← แสดงผล
├────┬────┬────┬──────┤
│ x  │ 7  │ 8  │  9   │
│ /  │ 4  │ 5  │  6   │
│ -  │ 1  │ 2  │  3   │
│ +  │ .  │ 0  │  ✓   │
└────┴────┴────┴──────┘
```

- รองรับ +, -, ×, ÷
- กด ✓ เพื่อยืนยันยอด
- ใช้ได้ทั้งหน้า add transaction และ edit transaction

---

## 3. Slip OCR — อ่านบันทึกช่วยจำอัตโนมัติ

### Flow
```
user ส่ง slip รูปใน Discord thread
  → Tesseract.js อ่านรูป
  → parse ข้อมูลจาก slip:
      - ref_id (เลขที่รายการ)
      - จำนวนเงิน
      - เลขบัญชีผู้รับ
      - บันทึกช่วยจำ ← ใช้เป็น note/category hint
  → validate ref_id ตรงกับ transaction ที่รอ category
      ตรง → update note + category อัตโนมัติ
      ไม่ตรง → แจ้ง error "slip นี้ไม่ตรงกับรายการที่รอยืนยัน"
  → Bot mention เหรัญญิกถ้า category ยังไม่รู้จัก
```

### ตัวอย่าง slip K-Plus ที่ parse ได้
```
เลขที่รายการ: 016098205038BTF04425  → ref_id
จำนวน: 1.00 บาท                    → amount (ใช้ validate)
เข้าบัญชี: xxx-x-x7749-x           → match account
บันทึกช่วยจำ: ทดสอบหมวดหมู่        → note + category hint
```

### Validation Rules
- ส่ง slip ห้องไหนก็ได้ใน Discord
- match account จากเลขบัญชีใน slip ก่อน
- ถ้า slip เป็นบัญชีที่ไม่ได้ผูกกับระบบ → แจ้ง error
- ถ้า ref_id ซ้ำ (เคย process แล้ว) → แจ้งว่า "รายการนี้ถูกบันทึกแล้ว"

### Library
- Tesseract.js (ฟรี รันบน server)
- ถ้าแม่นไม่พอค่อย switch ไป Google Vision API

---

## หมายเหตุ
- Category icon ให้ใช้ emoji ก่อน ไม่ต้องทำ custom icon
- Calculator ทำเป็น React component แยก reuse ได้
- OCR slip ทำใน `services/financeOCR.js` ใน pple-dcbot