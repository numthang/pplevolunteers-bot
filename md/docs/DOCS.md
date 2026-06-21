# PPLE Docs — E-Signature & E-Document

ระบบสร้างใบสำคัญรับเงินสำหรับทีมงาน พร้อม e-signature และ PDF พร้อมพิมพ์

---

## Overview

- ผู้ใช้: ทีมงาน (dc_members) — ไม่เกี่ยวกับ ACT registrations ในระยะแรก
- Auth: Discord OAuth (next-auth เดิม)
- Stack: Next.js + pdf-lib (PDF overlay) + Canvas (signature)
- **Signature model:** Authenticated signature — วาดลายเซ็นบน Canvas ผูกกับ Discord login บันทึก `discord_id` + timestamp + IP เป็น audit trail
- ต้อง login ก่อนเซ็น — link ที่ส่งให้เป็น deeplink พอคลิกแล้ว login แล้วเด้งกลับมาหน้าเซ็นอัตโนมัติ
- **Signing token expire:** 2 เดือนหลังจากวันจบโครงการ (`act_event_cache.event_end_date + 60 วัน`)

---

## Flow

1. **Admin เลือก event** จาก `act_event_cache` (sync มาจาก act.pplethai.org แล้ว) — ได้ชื่องาน, วันที่, สถานที่, จังหวัด
2. **Admin กรอกเพิ่ม** — จำนวนผู้เข้าร่วม, งบรวม, รายการที่เบิกได้
3. **Budget planner** — ระบบ propose ยอดแต่ละรายการตามกฎกองทุน69 ให้รวมครบงบ
4. **Admin ติ๊กสมาชิก** — เลือกว่าใครได้รับอะไรเท่าไหร่ (เช่น คนนี้ได้ค่าเดินทาง คนนั้นได้ค่าวิทยากร)
5. **สร้าง entry ต่อคนต่อรายการ** → ดึงข้อมูลส่วนตัวจาก `ngs_member_cache` + `dc_members`
6. **ส่งลิงก์** ให้แต่ละคน → เปิด → ตรวจข้อมูล → วาด e-signature → submit → แสดงหน้า "สำเร็จ"
7. **Admin export** → PDF ครบชุด (ใบสำคัญรับเงิน + สำเนาบัตรประชาชน) พร้อมพิมพ์

---

## Schema

```sql
docs_projects
  id, guild_id
  act_event_cache_id INT  -- FK → act_event_cache (ชื่อ/วันที่/จังหวัดดึงจากนี้)
  is_mobile BOOLEAN       -- true = สัญจร (ออกบูธ/ลงพื้นที่) → ไม่มีวิทยากร/สถานที่
  participant_count, budget
  allowed_items (json array of strings)  -- ['food','travel','supplies',...]
  status, created_by, created_at

docs_activity_entries
  id, project_id, member_discord_id
  item_type   -- 'food' | 'speaker' | 'travel' | 'venue' | 'accommodation' | 'supplies'
  description, amount
  override_data (json)   -- แก้ข้อมูลตอนเซ็น
  status  -- pending | signed | printed
  sign_token UUID         -- token สำหรับ signing link
  token_expires_at TIMESTAMPTZ  -- act_event.event_end_date + 60 วัน
  signed_at, printed_at, pdf_url

docs_signatures
  id, entry_id
  signature_base64 (TEXT)
  signed_by_discord_id, signed_ip, created_at  -- audit trail
```

**แหล่งข้อมูลส่วนตัว:**
- ผูกกันด้วย `dc_members.member_id` = `ngs_member_cache.source_id`
- **ครั้งแรก:** ทีมงานค้นชื่อตัวเองใน ngs_member_cache → ยืนยัน → บันทึก `source_id` ลง `dc_members.member_id`
- **ครั้งถัดไป:** join ได้เลย ไม่ต้องค้นซ้ำ
- จาก `ngs_member_cache`: `identification_number` (เลขบัตรประชาชน), ชื่อ-นามสกุล, ที่อยู่ครบ
- จาก `dc_members`: `discord_id`, `roles`, `bank_name`, `account_no`, `account_holder` (มีอยู่แล้ว)

**เอกสารแนบต่อใบ:** สำเนาบัตรประชาชน 1 ใบ (ดึง `identification_number` จาก `ngs_member_cache`)

**การเก็บสำเนาบัตรประชาชน:**
- สมาชิก upload ครั้งเดียวตอน link ngs → เก็บใน storage → ทุกใบสำคัญฯ ดึงใช้ซ้ำ ไม่ต้อง upload ซ้ำ
- **เก็บที่ `/private/uploads/id-cards/` — นอก `web/public/` ห้าม expose โดยตรง**
- เสิร์ฟผ่าน `/api/docs/id-card/[discordId]` เท่านั้น — เช็คก่อนส่งไฟล์:
  - เจ้าของ (`discordId === session.user.discordId`) → ผ่าน
  - `canManageDocs(access)` → ผ่าน
  - อื่นๆ → 403
- ตอน generate PDF ให้ประมวลผลภาพก่อน overlay ลงเอกสาร:
  1. **ลายน้ำ** — ข้อความ `"ใช้สำหรับพรรคประชาชนเท่านั้น"` เอียง ~30°, สีจางโปร่งใส ครอบกลางบัตร
  2. **สำเนาถูกต้อง** — ข้อความสีน้ำเงิน `"สำเนาถูกต้อง"` ใต้ภาพบัตร
- ใช้ `@napi-rs/canvas` (มีอยู่แล้วใน package.json) สำหรับ overlay ข้อความบนภาพ

---

## Template System

**Stack:** `docxtemplater` render `{{variable}}` ลงใน `.docx` → LibreOffice headless แปลงเป็น PDF → `pdf-lib` append หน้าสำเนาบัตรประชาชน

- Template ไฟล์อยู่ที่ `web/templates/receipts/`
- Logic อยู่ที่ `web/lib/generatePdf.js` — `buildData()` map entry → variables, `generateEntryPdf()` render + convert

### โครงสร้างไฟล์ template

```
web/templates/receipts/
  template-1.docx          ← ส่วน 1/2/4 (header, personal info, footer) — ไฟล์เดียวทุก type
  body-1/                  ← ส่วน 3 (รายละเอียดการรับเงิน) แยกต่อ item_type
    break.docx
    lunch.docx
    dinner.docx
    equipment.docx
    sound.docx
    speaker.docx
    supplies.docx
    transport.docx
    venue.docx
```

**กลไก:** ตอน generate — โหลด `template-1.docx` → inject XML จาก `body-1/[item_type].docx` แทน `{{payment_details}}` paragraph → `colorVariableRuns` ใส่สีน้ำเงิน → `docxtemplater` render → LibreOffice PDF

**ข้อดี:** แก้ส่วน 1/2/4 ที่ `template-1.docx` ที่เดียว → reflect ทุก type ทันที

### item_type ที่รองรับ

| item_type | HEADER_MAP | body file | สถานะ |
|---|---|---|---|
| `break` | ค่าอาหาร | `break.docx` | ✅ |
| `lunch` | ค่าอาหาร | `lunch.docx` | ✅ |
| `dinner` | ค่าอาหาร | `dinner.docx` | ✅ |
| `equipment` | ค่าเช่าอุปกรณ์ | `equipment.docx` | ✅ |
| `sound` | ค่าเช่าเครื่องเสียง | `sound.docx` | ✅ |
| `speaker` | ค่าวิทยากร | `speaker.docx` | ✅ |
| `supplies` | ค่าวัสดุอุปกรณ์ | `supplies.docx` | ✅ |
| `transport` | ค่าเดินทาง | `transport.docx` | ✅ |
| `venue` | ค่าสถานที่ | `venue.docx` | ✅ |

---

### โครงสร้างใบสำคัญรับเงิน — 4 ส่วน

#### ส่วน 1 — หัวเรื่อง

ชื่อฝังอยู่ใน template แต่ละไฟล์ (ไม่มี variable) เช่น "ใบสำคัญรับเงิน", "ใบสำคัญรับเงินค่าเบี้ยเลี้ยงเจ้าหน้าที่โครงการ"

#### ส่วน 2 — รายละเอียดคนรับเงิน (ทุก template เหมือนกัน)

```
วันที่ {{day}} เดือน {{month}} พ.ศ. {{year}}
ข้าพเจ้า (นาย/นาง/นางสาว) {{full_name}} นามสกุล {{last_name}}
หมายเลขประจำตัวประชาชน (13 หลัก) {{id_number}} อยู่บ้านเลขที่ {{house_no}} หมู่ที่ {{moo}}
ซอย {{road}} ถนน  ตำบล/แขวง {{subdistrict}}
อำเภอ/เขต {{district}} จังหวัด {{province_addr}} หมายเลขโทรศัพท์ {{phone}}
ข้าพเจ้าขอรับรองว่าได้รับเงินจากพรรค/สาขาพรรค {{branch_province}} ลำดับที่ {{branch_no}}
ประจำจังหวัด {{branch_province}} ตามรายละเอียด ดังต่อไปนี้
```

| variable | แหล่งข้อมูล |
|---|---|
| `day` / `month` / `year` | `parseThaiDate(entry.event_date)` |
| `full_name` | `override_data.full_name` → `ngs_member_cache.title + first_name` |
| `last_name` | `override_data.last_name` → `ngs_member_cache.last_name` |
| `id_number` | `override_data.id_number` → `ngs_member_cache.identification_number` |
| `house_no` / `moo` / `road` | `override_data` → `ngs_member_cache.home_*` |
| `subdistrict` / `district` / `province_addr` | `override_data` → `ngs_member_cache.home_*` |
| `phone` | `override_data.phone` (ไม่มีใน ngs — ต้องกรอกเอง) |
| `branch_no` | `override_data.branch_no` (ลำดับที่ของสาขา) |
| `branch_province` | `override_data.branch_province` (ชื่อจังหวัดที่สาขาสังกัด) |

#### ส่วน 3 — รายละเอียดการรับเงิน (แตกต่างกันตาม template)

**1 / food / accommodation / photo — generic (ตารางอิสระ):**
```
{{items_desc}}     {{total_amount}}
{{item_2}}
{{item_3}}
{{item_4}}
{{item_5}}
รวมเป็นเงิน       {{total_amount}}
จำนวนเงิน (ตัวอักษร) {{amount_text}}
```

**1.1 — ค่าสถานที่:**
```
ค่าเช่าสถานที่ {{venue}} ระยะเวลา {{duration}}
ผู้เข้าร่วม {{participant_count}} คน
```

**1.2 — ค่าเช่าอุปกรณ์:**
```
{{equipment_desc}} จำนวน {{quantity}} ชิ้น ราคา {{unit_price}} บาท/ชิ้น
```

**1.3 — ค่าเช่าเครื่องเสียง:**
```
{{equipment_desc}} จำนวน {{quantity}} ชุด ราคา {{unit_price}} บาท/ชุด
```

**1.4 — ค่าซื้อวัสดุอุปกรณ์:**
```
{{items_desc}}
{{item_2}} / {{item_3}} / {{item_4}} / {{item_5}}
```

**1.5 — ค่าวิทยากร:**
```
หัวข้อ {{topic}}
ชื่อโครงการใหญ่ {{project_name}}
ชื่อโครงการย่อย {{sub_project_name}}
ระยะเวลา {{duration}}
```

**2 — ค่าเบี้ยเลี้ยงเจ้าหน้าที่ (pre-structured):**
```
จ่ายค่าเบี้ยเลี้ยงเจ้าหน้าที่โครงการ
ชื่อโครงการใหญ่ {{project_name}}
ชื่อโครงการย่อย {{sub_project_name}}
จำนวน {{days}} วัน เป็นเงินคนละ {{daily_rate}} บาท/วัน
รวม {{total_amount}} บาท
*แนบสำเนาบัตรประจำตัวประชาชนและรับรองสำเนาถูกต้อง
```
> มี `เลขที่ {{receipt_no}}` ที่มุมบนขวาด้วย (template อื่นไม่มี)

**3 — แบบรายชื่อผู้เข้าร่วม + ค่าพาหนะ:**
> ⚠️ ยังไม่ได้ document variables — ดู `md/docs/example/docx/3-แบบรายชื่อฯ.docx` โดยตรง

#### ส่วน 4 — Footer (ทุก template เหมือนกัน)

```
ลงชื่อ    {{%sig}}      ผู้รับเงิน
           ({{payee_name}})
ลงชื่อ    {{%paysig}}   ผู้จ่ายเงิน
           ({{payer_name}})
ตำแหน่ง   {{payer_position}}
```

| variable | หมายเหตุ |
|---|---|
| `{{%sig}}` | รูปลายเซ็นผู้รับเงิน — ImageModule syntax (double-brace บังคับ) |
| `{{%paysig}}` | รูปลายเซ็นผู้จ่ายเงิน |
| `payee_name` | `full_name + ' ' + last_name` |
| `payer_name` | ชื่อผู้จ่ายเงิน — ดึงจาก `docs_payers` (pending) |
| `payer_position` | ✅ มีใน `buildData()` แล้ว — ส่งผ่าน `payerPosition` param |

---

## กฎกองทุน69 — ระเบียบการเบิกจ่าย ปี 2569

> ยังไม่ได้ encode ครบ — เพิ่มทีละ section ตามที่คุยกัน

### ค่าอาหาร

**อาหารว่าง** (ดูแค่ระยะเวลา ไม่ต้องคร่อมเวลา):
- ทุกกรณี (รวม < 4 ชม.) → ว่าง **1**
- ≥ 6 ชม. → ว่าง **2**

**มื้อหลัก** (ต้องผ่านทั้ง 2 เงื่อนไขพร้อมกัน — เช้าเบิกไม่ได้ทุกกรณี):

งานวันเดียว (ไม่ค้างคืน):
| เงื่อนไข 1: ระยะเวลา | เงื่อนไข 2: คร่อมเวลา | ได้มื้อหลัก |
|---|---|---|
| < 4 ชม. | ใดก็ตาม | ❌ ไม่ได้ |
| ≥ 4 ชม. | คร่อม 17:00 (ไม่คร่อม 12:00) | เย็น 1 |
| ≥ 4 ชม. | คร่อม 12:00 (จบก่อน 20:00) | กลางวัน 1 |
| ≥ 4 ชม. | คร่อม 12:00 **และ** จบ ≥ 20:00 | กลางวัน + เย็น |

งานค้างคืน (≥ 2 วัน) — เงื่อนไขคร่อมเวลาปกติ ไม่มีเงื่อนไขจบ 20:00:
- คร่อม 12:00 → กลางวัน
- คร่อม 17:00 → เย็น
- วันกลาง (เต็มวัน) → ได้ทั้งกลางวัน + เย็น + ว่าง 2 อัตโนมัติ

ตัวอย่าง:
- เริ่ม 09:00 เลิก 12:00 (3 ชม.) → ว่าง 1 / มื้อหลัก ❌ (< 4 ชม.)
- เริ่ม 14:00 เลิก 18:00 (4 ชม.) → คร่อม 17:00 → **เย็น 1 + ว่าง 1**
- เริ่ม 09:00 เลิก 16:00 (7 ชม.) → คร่อม 12:00 จบก่อน 20:00 → **กลางวัน 1 + ว่าง 2**
- เริ่ม 09:00 เลิก 20:30 (11.5 ชม.) → คร่อม 12:00 + จบ ≥ 20:00 → **กลางวัน + เย็น + ว่าง 2**

อัตราต่อคนต่อมื้อ:
| ประเภทสถานที่ | อาหารหลัก | อาหารว่าง |
|---|---|---|
| ทั่วไป (ราชการ, สนง., ไม่ใช่โรงแรม) | ≤ 300 บ. | ≤ 50 บ. |
| โรงแรม / รีสอร์ท / ศูนย์แสดงสินค้าฯ | ≤ 400 บ. | ≤ 100 บ. |

### ค่าตอบแทนวิทยากร
- เบิกได้ไม่เกิน 5 คน/เวที (ทุกรูปแบบ — ประชุม อบรม เวทีสาธารณะ กิจกรรมเคลื่อนที่)
- ข้าราชการ/เจ้าหน้าที่รัฐ ≤ 600 บ./ชม. | บุคคลทั่วไป ≤ 1,200 บ./ชม.
- ถ้าไม่ถึงชั่วโมง คิดนาทีละ 20 บาท

**ข้อมูลที่ต้องกรอกในใบเบิก:**
- ชื่อโครงการใหญ่ → **"การจัดประชุมสมาชิกสัมพันธ์และผู้สนับสนุนพรรคทั่วประเทศ ปี 2569"** (hardcode ปี 2569)
- ชื่อโครงการย่อย → ดึงจาก `act_event_cache.name`
- หัวข้อเรื่อง
- จำนวนชั่วโมง/นาทีที่ดำเนินการ

เอกสารแนบ: สำเนาบัตรประชาชน/บัตรราชการ พร้อมลายเซ็น

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

### ค่าเดินทาง
**รายบุคคล (ตามระยะทาง):**
| ระยะทาง | เพดาน |
|---|---|
| ≤ 100 กม. | 300 บาท |
| 101–200 กม. | 500 บาท |
| 201–500 กม. | 800 บาท (ไม่เกิน 1,000) |
| 501–700 กม. | 1,500 บาท |
| 701 กม. ขึ้นไป | ตามที่จ่ายจริง |

**หมู่คณะ (เหมาคัน/วัน):**
| ประเภท | ผู้โดยสารขั้นต่ำ | เพดาน |
|---|---|---|
| รถตู้ | 5 คน | ≤ 2,000 บ./วัน |
| มินิบัส | 17 คน | ≤ 4,000 บ./วัน |
| รถบัส / รถตู้ร่วม | 40 คน | ≤ 10,000 บ./วัน |

หมู่คณะเบิกได้เพิ่ม: ค่าน้ำมัน + ค่าทางด่วน (ตามที่จ่ายจริง)

### ค่าที่พัก (ต่อห้อง/คืน)
- ห้องเดี่ยว ≤ 1,200 บาท
- ห้องคู่ ≤ 1,600 บาท
- มากกว่า 2 คน → ห้องเดี่ยว + เพิ่มไม่เกิน 400 บาท/คน/คืน
- **เรทพรรคให้ 800 บาท/คืน**

### ใบ VAT กับใบสำคัญรับเงิน

ร้านค้า โรงแรม หรือห้างที่ออกใบกำกับภาษี (VAT) ได้ **ไม่ต้องทำใบสำคัญรับเงิน** — ใช้ใบ VAT แทนได้เลย โดยคิดตามยอดที่จ่ายจริง

ส่วนที่เหลือจากที่จ่ายด้วยใบ VAT ไปแล้ว ค่อยมาเขียนใบสำคัญรับเงินในส่วนที่เหลือ

ตัวอย่าง: จัดงานในโรงแรม ใบ VAT โรงแรมมักครอบคลุม ค่าเช่าสถานที่ + ค่าอาหาร → รายการที่เหลือ เช่น ค่าเดินทาง ค่าวิทยากร ค่าวัสดุ ค่อยทำใบสำคัญรับเงินแยก

**ที่อยู่สำหรับออกใบกำกับภาษีในนามพรรค:**
> พรรคประชาชน 167 ชั้น 4 ซอยรามคำแหง 42 แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร 10240 โทร 020385100 เลขประจำตัวผู้เสียภาษีอากร 099-4-00246880-3 

**ที่อยู่ส่งเอกสาร:**
> นาย ธีระพนธ์ เทศเกิด (เอกสาร เคลียร์งบกองทุนพัฒนาการเมือง)
> พรรคประชาชน 167 ชั้น 4 ซอยรามคำแหง 42 แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร 10240 โทร. 020385100

---

### ค่าวัสดุ/อุปกรณ์สิ้นเปลือง
- ตามที่จ่ายจริง + มีใบเสร็จ

### ค่าเช่าเครื่องเสียง
- ตามที่จ่ายจริง + มีสัญญาเช่า

### ค่าถ่ายภาพ/วิดีโอ
- มีข้อความการอนุญาต และระบุชื่อผู้รับค่าถ่าย, จำนวนที่ถ่าย, งบประมาณที่ใช้, วัน/เดือน/ปีที่ถ่าย

---

### ประเภทกิจกรรม — สัญจร vs อยู่กับที่

**สัญจร** = ออกบูธ, ลงพื้นที่ — ทีมงานเคลื่อนที่ ไม่มีสถานที่จัดงานประจำ

| รายการ | อยู่กับที่ | สัญจร |
|---|---|---|
| ค่าอาหาร | ✅ | ✅ |
| ค่าเดินทาง | ✅ | ✅ |
| ค่าวัสดุ/อุปกรณ์ | ✅ | ✅ |
| ค่าที่พัก | ✅ (ถ้าค้างคืน) | ✅ (ถ้าค้างคืน) |
| ค่าเช่าเครื่องเสียง | ✅ | ✅ |
| ค่าวิทยากร | ✅ | ❌ |
| ค่าสถานที่ | ✅ | ❌ |

**auto-detect ไม่ได้จาก act_event** — admin ต้องติ๊กเองว่ากิจกรรมนี้เป็น "สัญจร" ตอน setup

---

## Budget Planner — Logic

- Admin กรอกยอดแต่ละรายการเองและปรับแต่งได้อิสระ (ยังไม่มี auto-calculate จากกฎ)
- ระบบ validate ว่าแต่ละรายการไม่เกิน ceiling ของกฎกองทุน69 และรวมไม่เกินงบ
- แจ้งเตือนถ้าเกินเพดาน ไม่ block การ save

---

## Permission & Scope

**ใครจัดการเอกสารได้:** `admin` · `secretary_general` · `regional_coordinator` · `province_coordinator` · `district_coordinator` · `treasurer`

**ใครเซ็นได้:** ทุกคนที่ login Discord (ทีมงานทั่วไป)

**Scope การมองเห็น event (ตาม province ของ event):**
| Permission | scope |
|---|---|
| `admin` / `secretary_general` | ทุกจังหวัด |
| `regional_coordinator` | expand subregion — เหมือน calling |
| `province_coordinator` / `district_coordinator` | จังหวัดที่ติดยศ — เหมือน calling |
| `treasurer` | `exactProvinces` เท่านั้น — เหมือน finance |

→ สร้าง `web/lib/docsAccess.js` แยก (pattern เดียวกับ `callingAccess.js` + `financeAccess.js`)

---

## UI Convention

ก่อนเขียนทุกหน้าใน `/docs` — **อ่านหน้า calling ที่เทียบเคียงได้ก่อนเสมอ** แล้ว copy CSS class pattern จากนั้น  
ห้าม invent class ใหม่ — ใช้ที่มีอยู่แล้วใน calling/finance เท่านั้น

---

## Checklist

### ✅ Done
- DB migration — `docs_projects`, `docs_activity_entries`, `docs_signatures`
- `web/lib/generatePdf.js` — docxtemplater + LibreOffice + id-card append + `injectBodyIntoTemplate` + `colorVariableRuns` (สีน้ำเงิน #1A47CC)
- `web/lib/idCard.js` — watermark + สำเนาถูกต้อง overlay
- API routes — projects, entries, sign, id-card, export (ทุก route ส่ง `payerPosition` แล้ว)
- Sign page — `/docs/sign/[token]`
- `web/lib/docsAccess.js` — permission + scope
- `"docs"` ใน `enabled_features`
- Template system — `template-1.docx` + `body-1/` (break/lunch/dinner/equipment/sound/speaker/supplies/transport/venue) ✅ ครบ
- `buildData()` — `header`, `amount`, `total`, `payer_position` ✅

### 🔧 Pending
- [ ] **`docs_payers` table** — guild_id, discord_id, display_name, position, sort_order; auto-select payer ≠ recipient; รัน `/scrutinize` ก่อน
- [ ] `section 3` ของ body files — ตรวจ variable ครบทุกไฟล์ (เช็คกับ `buildData()`)

### 🔧 Web UI
- [ ] `/docs` — รายการ project + สถานะ
- [ ] `/docs/create` — เลือก event + ตั้งงบ + ติ๊กสมาชิก + เลือกผู้จ่าย
- [ ] `/docs/[id]` — overview entries ต่อ project + status (pending/signed/printed)
- [ ] Batch export — ZIP PDF ครบชุดต่อโครงการ
