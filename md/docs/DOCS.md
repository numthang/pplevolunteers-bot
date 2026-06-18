# PPLE Docs — E-Signature & E-Document

ระบบสร้างใบสำคัญรับเงินสำหรับทีมงาน พร้อม e-signature และ PDF พร้อมพิมพ์

---

## Overview

- ผู้ใช้: ทีมงาน (dc_members) — ไม่เกี่ยวกับ ACT registrations ในระยะแรก
- Auth: Discord OAuth (next-auth เดิม)
- Stack: Next.js + HTML template + Puppeteer (PDF) + Canvas (signature)

---

## Flow

1. **Admin สร้างโครงการ** — ชื่องาน, วันที่, จำนวนคน, งบรวม, รายการที่เบิกได้
2. **Budget planner** — ระบบ propose ยอดแต่ละรายการตามกฎกองทุน69 ให้รวมครบงบ (เกินนิดได้)
3. **Admin ยืนยัน** → สร้าง entry ต่อคน ต่อรายการ
4. **ส่งลิงก์** ให้ทีมงาน → เปิด → ตรวจข้อมูล → วาด e-signature → submit
5. **Admin export** → PDF ครบชุด พร้อมพิมพ์

---

## Schema

```sql
docs_projects
  id, guild_id, name, activity_date, participant_count
  budget, allowed_items (json array), status
  created_by, created_at

docs_activity_entries
  id, project_id, member_discord_id
  item_type   -- 'food' | 'speaker' | 'travel' | 'venue' | 'accommodation' | 'supplies'
  description, amount
  override_data (json)   -- แก้ข้อมูลตอนเซ็น
  status  -- pending | signed | printed
  signed_at, printed_at, pdf_url

docs_signatures
  id, entry_id
  signature_base64 (LONGTEXT)
  created_at
```

**fields เพิ่มใน member profile** (ยังไม่มีใน dc_members):
- `citizen_id` — เลขบัตรประชาชน
- `bank_account` — บัญชีธนาคาร
- `address_full` — ที่อยู่
- → กรอกครั้งแรกตอนเซ็น แล้วเก็บไว้ใช้ครั้งต่อไป

---

## Template

`md/docs/example/ใบสำคัญรับเงิน.html` — HTML + placeholders
- PDF ตัวอย่างหลายประเภทอยู่ใน `md/docs/example/`
- Render → PDF ด้วย Puppeteer

---

## กฎกองทุน69 — ระเบียบการเบิกจ่าย ปี 2569

> ยังไม่ได้ encode ครบ — เพิ่มทีละ section ตามที่คุยกัน

### ค่าอาหาร
- `< 4 ชม.` → อาหารว่าง 1 มื้อ
- `4+ ชม.` → อาหารหลัก 1 + ว่าง 1
- `6+ ชม.` → อาหารหลัก 1 + ว่าง 2
- ค่าที่พัก: เบิกได้เฉพาะกิจกรรม ≥ 2 วัน
- กรณีเบิกค้างคืน: วันแรกเริ่มไม่เกิน 09:00, วันสุดท้ายเลิกไม่เร็วกว่า 12:00

### ค่าตอบแทนวิทยากร
- บรรยาย → 1 คน
- อภิปรายกลุ่ม/เวทีสัมมนา → 5 คน (รวมผู้ดำเนินรายการ)
- ฝึกปฏิบัติ/กลุ่มย่อย → 2 คน/กลุ่ม
- เพดานชั่วโมง: 25–50 ชม. = ขึ้นครึ่งหนึ่ง, ≥50 ชม. = เต็มจำนวน

### ค่าเช่าสถานที่ (tier ตามจำนวนผู้เข้าร่วม)
| ผู้เข้าร่วม | เพดาน (บาท) |
|---|---|
| < 50 | 2,500 |
| 50–99 | 5,000 |
| 100–149 | 7,500 |
| 150–199 | 10,000 |
| 200–249 | 12,500 |
| 250+ | ตามที่จ่ายจริง |
> โรงแรม/รีสอร์ท/ศูนย์แสดงสินค้าฯ เพดานสูงกว่า (x2)

### ค่าเดินทาง (ต่อคน)
| ระยะทาง | เพดาน |
|---|---|
| ≤ 100 กม. | 300 บาท |
| 101–200 กม. | 500 บาท |
| 201–500 กม. | 800 บาท (ไม่เกิน 1,000) |
| 501–700 กม. | 1,500 บาท |
| รถบัส/รถตู้ | เหมาต่อวัน ตามที่จ่ายจริง |

### ค่าที่พัก (ต่อห้อง/คืน)
- ห้องเดี่ยว ≤ 1,200 บาท
- ห้องคู่ ≤ 1,600 บาท
- มากกว่า 2 คน → ห้องเดี่ยว + เพิ่มไม่เกิน 400 บาท/คน/คืน

### ค่าวัสดุ/อุปกรณ์สิ้นเปลือง
- ตามที่จ่ายจริง + มีใบเสร็จ

### ค่าเช่าเครื่องเสียง
- ตามที่จ่ายจริง + มีสัญญาเช่า

### ค่าถ่ายภาพ/วิดีโอ
- มีข้อความการอนุญาต และระบุชื่อผู้รับค่าถ่าย, จำนวนที่ถ่าย, งบประมาณที่ใช้, วัน/เดือน/ปีที่ถ่าย

---

## Budget Planner — Logic

Input: `{ activityName, date, durationHours, participants, budget, allowedItems[] }`

Output: `[{ itemType, description, unitRate, qty, total }]` → รวมแล้ว ≤ budget (เกินนิดได้)

ลำดับการ allocate:
1. คำนวณ fixed items ก่อน (วิทยากร, สถานที่) — ยอดแน่นอน
2. คำนวณ per-person items (อาหาร, เดินทาง) — คูณจำนวนคน
3. adjust ให้รวมครบงบ หรือแจ้งถ้างบไม่พอ

---

## Checklist

- [ ] DB migration — `docs_projects`, `docs_activity_entries`, `docs_signatures`
- [ ] เพิ่ม `citizen_id` / `bank_account` / `address` ใน member profile
- [ ] กฎกองทุน69 → JS config สำหรับ validate + คำนวณ
- [ ] Budget planner UI — admin กรอกงาน+งบ+รายการ → propose ยอด
- [ ] Mobile signature component — Canvas → base64
- [ ] Document generation — merge data + signature → PDF (Puppeteer)
- [ ] RBAC — permission สำหรับ create/sign/print
- [ ] Storage decision — S3 / local
- [ ] Batch export — PDF ครบชุดต่อโครงการ
