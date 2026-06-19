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

## Template

- ต้นฉบับ PDF อยู่ใน `md/docs/example/`
- ใช้ **pdf-lib** overlay ข้อความลงบน PDF ต้นฉบับตามพิกัด XY
- **สีตัวอักษร: น้ำเงินหมึกปากกา** — ประมาณ `#1a47cc` หรือ `#2255bb` เพื่อให้ดูเหมือนเขียนด้วยมือ

**การ maintain พิกัดฟิลด์:**  
พิกัด XY ทุกฟิลด์ต้อง config แยกไว้ใน `web/config/pdf-fields.js` — ไม่ hardcode ใน logic  
ถ้า PDF form เปลี่ยน layout → แก้ไฟล์ config ไฟล์เดียวพอ

```js
// web/config/pdf-fields.js
export const RECEIPT_FIELDS = {
  project_name:  { x: 120, y: 680, size: 11 },
  sub_project:   { x: 120, y: 660, size: 11 },
  citizen_id:    { x: 320, y: 610, size: 11 },
  full_name:     { x: 120, y: 610, size: 11 },
  address:       { x: 120, y: 590, size: 10 },
  amount:        { x: 400, y: 540, size: 11 },
  signature:     { x: 280, y: 160, width: 120, height: 50 },
  // ...
}
```

---

## กฎกองทุน69 — ระเบียบการเบิกจ่าย ปี 2569

> ยังไม่ได้ encode ครบ — เพิ่มทีละ section ตามที่คุยกัน

### ค่าอาหาร

**หลักการสำคัญ:** เบิกได้เฉพาะมื้อที่ **เวลากิจกรรมครอบคลุมช่วงเวลาอาหารนั้นจริง** เท่านั้น

| มื้อ | เบิกได้ | เงื่อนไข |
|---|---|---|
| เช้า | ❌ | เบิกไม่ได้ทุกกรณี |
| กลางวัน | ✅ | กิจกรรมต้องครอบคลุม 12:00 |
| เย็น | ✅ | กิจกรรมต้องจบไม่เร็วกว่า 19:00 |
| ว่างสาย | ✅ | ตามช่วงพักตอนเช้า |
| ว่างบ่าย | ✅ | ตามช่วงพักตอนบ่าย |

ตัวอย่าง: เริ่ม 13:00 เลิก 18:00 → เบิกได้แค่อาหารว่าง **ไม่มีกลางวัน ไม่มีเย็น** (ไม่ถึง 19:00)

---

จำนวนมื้อ (ไม่ค้างคืน):
- `< 4 ชม.` → ❌ ไม่ได้เลย
- `4+ ชม.` → ว่าง 1 (+ หลักตามเวลา)
- `6+ ชม.` → ว่าง 2 (+ หลักตามเวลา)
- **มื้อหลักดูจากเวลาล้วน** — ครอบคลุมเที่ยง + จบ ≥ 19:00 → ได้ทั้งกลางวัน + เย็น (2 มื้อหลัก)

ค้างคืน (≥ 2 วัน):
- วันกลาง (เต็มวัน) → กลางวัน + เย็น + ว่างสาย + ว่างบ่าย
- วันสุดท้าย → ใช้กฎเวลาเหมือน 1 วันปกติ

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

- [ ] DB migration — `docs_projects`, `docs_activity_entries`, `docs_signatures`
- [ ] กฎกองทุน69 → `web/config/fund69-rules.js` สำหรับ validate ceiling แต่ละรายการ
- [ ] `web/config/pdf-fields.js` — map พิกัด XY ทุกฟิลด์ต่อแบบฟอร์ม
- [ ] `web/lib/docsAccess.js` — permission + scope (pattern เดียวกับ callingAccess + financeAccess)
- [ ] เพิ่ม `"docs"` ใน `enabled_features` ของ `dc_guild_config`
- [ ] `/docs` — รายการ event (filter ตาม scope) + เลือก event เพื่อตั้งงบ
- [ ] `/docs/[eventId]` — overview entries ต่อ event + status (pending/signed/printed)
- [ ] `/docs/[eventId]/setup` — กรอกงบ + รายการ + ติ๊กสมาชิก
- [ ] `/docs/sign/[token]` — signing page (deeplink, login required, expire 2 เดือนหลัง event)
  - ครั้งแรก: ค้นชื่อ link ngs + upload สำเนาบัตร
  - วาด e-signature → submit → หน้าสำเร็จ
- [ ] `/api/docs/id-card/[discordId]` — serve ไฟล์ + auth check (เจ้าของ / canManageDocs)
- [ ] Image processing — overlay ลายน้ำ + "สำเนาถูกต้อง" บนสำเนาบัตร (`@napi-rs/canvas`)
- [ ] Document generation — pdf-lib overlay ข้อมูล + signature บน PDF ต้นฉบับ (สีน้ำเงิน)
- [ ] Batch export — ZIP PDF ครบชุดต่อโครงการ
