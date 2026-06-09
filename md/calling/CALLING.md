# ระบบโทรหาสมาชิก (Calling System)

> อ่านร่วมกับ `CLAUDE.md` ของ project เสมอ

---

## Overview

ระบบโทรหาสมาชิกพรรค ต่อเติมใน `pple-volunteers` (Next.js web)  
จุดประสงค์หลักคือให้คนโทรรู้ว่าควรโทรหาใคร ดูประวัติย้อนหลังได้ และบันทึกผลได้เร็วที่สุด

---

## Stack

- **Frontend:** Next.js App Router (เหมือน finance)
- **Backend:** Node.js API routes
- **Database:** MySQL `pple_volunteers` — prefix `calling_`
- **Auth:** Discord OAuth (next-auth เดิม)
- **ข้อมูลสมาชิก:** ตอนนี้ดึงจาก `bq_members` / อนาคตเชื่อม BigQuery จริง

---

## Database

### 1. แก้ไข `dc_members` — เพิ่ม identity fields

```sql
ALTER TABLE dc_members
  ADD COLUMN display_name VARCHAR(100) NULL AFTER username,
  ADD COLUMN phone        VARCHAR(20)  NULL,
  ADD COLUMN line_id      VARCHAR(100) NULL,
  ADD COLUMN google_id    VARCHAR(100) NULL;
```

- `display_name` = `member.displayName` จาก Discord (server nickname → global name → username) sync อัตโนมัติเมื่อ join / update
- sync ทุก guild member ครั้งแรกด้วย `node scripts/sync-discord-members.js`
- `member_id` มีอยู่แล้วใน `dc_members` แต่ยังไม่มีข้อมูล  
- ถ้า `phone IS NULL` → frontend random เบอร์ dummy แสดงบน UI ชั่วคราว **ไม่บันทึกลง DB**

---

### 2. `ngs_member_cache` — ข้อมูลสมาชิกพรรค (sync จาก ACT)

- ตาราง source หลักที่ `db/calling/members.js` และ `db/calling/tiers.js` query
- key field: `source_id` (= member_id ที่ใช้ join กับ `calling_*` tables), `home_province`
- sync มาจาก ACT ผ่าน script แยก — ไม่ต้องแตะ schema `calling_*` ถ้าเปลี่ยน source

---

### 3. Campaigns — ใช้ `act_event_cache` (`type = 'campaign'`)

ไม่มีตาราง `calling_campaigns` แยก — campaign เก็บใน `act_event_cache` เดียวกับ activity ทั่วไป โดยใช้ `type = 'campaign'` เพื่อแยกประเภท

- สร้างผ่าน Web UI: `/calling/create`
- Import จาก XLSX: 1 ไฟล์ = 1 campaign ชื่อ campaign มาจาก filename (เช่น `กิจกรรมโทรหาสมาชิกราชบุรี.xlsx` → campaign name = `กิจกรรมโทรหาสมาชิกราชบุรี`)
- **สร้างได้เฉพาะ** Admin, ระดับภาค, ระดับจังหวัด (กรรมการจังหวัด / ผู้ประสานงานจังหวัด) — ทีมปฏิบัติการสร้างไม่ได้

Key fields: `id`, `name`, `province`, `description`, `event_date`, `guild_id`

---

### 4. `calling_contacts` — ผู้ติดต่อ manual (ไม่ใช่สมาชิกพรรค)

ตารางนี้เพิ่มใหม่สำหรับ non-member contacts: ผู้บริจาค, คนสนใจ, อาสาสมัคร, อาสาส้ม, แกนนำ, ผู้นำชุมชน, ประชาสังคม, สื่อมวลชน, นักการเมือง/อปท., สถานที่, งานพิมพ์/ป้าย, บริการอีเวนต์

- CRUD ได้ (ต่างจาก `ngs_member_cache` ที่ sync-only)
- key fields: `id`, `first_name`, `last_name`, `phone`, `province`, `amphoe`, `tambon`, `category`, `created_by`
- `category`: `donor` | `prospect` | `volunteer` | `oranger` | `leader` | `community_leader` | `civil` | `media` | `politician` | `venue` | `print` | `event_service` | `other`
- province กรอกจาก dropdown Thailand geography (JSON static ที่ `web/lib/thailand-geography.json`)

**⚠️ ID Overlap:** `calling_contacts.id` เป็น auto_increment เริ่มจาก 1 แต่ `ngs_member_cache.source_id` เริ่มจาก 55  
→ ทุก SQL query ที่ JOIN ตาราง shared (`calling_logs`, `calling_assignments`, `calling_member_tiers`) **ต้องใส่ `AND contact_type = 'member'` หรือ `'contact'` เสมอ** ไม่งั้น ID จะปนกันเมื่อมี contact ≥ 55 ตัว

---

### 5. `calling_assignments` — assign สมาชิก/contact ให้คนโทร

Schema ปัจจุบัน (หลัง migration):

```sql
id            INT AUTO_INCREMENT PRIMARY KEY
campaign_id   INT          NULL              -- 0 = Undefined
contact_type  ENUM('member','contact') NOT NULL DEFAULT 'member'
member_id     VARCHAR(20)  NOT NULL          -- source_id หรือ calling_contacts.id
assigned_to   VARCHAR(20)  NOT NULL          -- discord_id
assigned_by   VARCHAR(20)  NOT NULL          -- discord_id
rsvp          ENUM('yes','no','maybe') NULL  -- member เท่านั้น
created_at    DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_member_contact (member_id, contact_type)
```

- unique key คือ `(member_id, contact_type)` — 1 คน/contact assign ได้ครั้งเดียวทุก campaign
- แก้ไข `assigned_to` ได้เสมอ (ON DUPLICATE KEY UPDATE)
- **assign แล้ว → assignee เข้าถึงคนนั้นได้เลย ไม่เช็ค scope เพิ่ม**

---

### 6. `calling_logs` — บันทึกการโทรแต่ละครั้ง

Schema ปัจจุบัน:

```sql
id               INT AUTO_INCREMENT PRIMARY KEY
campaign_id      INT NULL                  -- 0 = Undefined
contact_type     ENUM('member','contact') NOT NULL DEFAULT 'member'
member_id        VARCHAR(20) NOT NULL
called_by        VARCHAR(20) NULL          -- discord_id (NULL = import จาก XLS)
caller_name      VARCHAR(100) NULL
called_at        DATETIME DEFAULT CURRENT_TIMESTAMP
status           ENUM('answered','no_answer','not_called') NOT NULL
sig_overall      TINYINT NULL
sig_location     TINYINT NULL              -- 1=ต่างประเทศ … 4=ในอำเภอ
sig_availability TINYINT NULL              -- 1=ไม่ว่างเลย … 4=ว่างมาก
sig_interest     TINYINT NULL              -- 1=ไม่สนใจ … 4=กระตือรือร้น
sig_reachable    TINYINT NULL              -- ไม่ใช้ใน UI แต่ column ยังอยู่
note             TEXT NULL
extra            JSON NULL
created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
```

- status enum จริง: `answered | no_answer | not_called` (ไม่มี `busy`, `wrong_number`)
- signals กรอกเฉพาะ `status = 'answered'`
- contact ไม่มี RSVP — `RecordCallModal` ซ่อน RSVP section อัตโนมัติเมื่อ `contact_type = 'contact'`

---

### 7. `calling_member_tiers` — tier ปัจจุบัน (ใช้ร่วมกัน)

Schema ปัจจุบัน:

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
contact_type    ENUM('member','contact') NOT NULL DEFAULT 'member'
member_id       VARCHAR(20) NOT NULL
tier            ENUM('A','B','C','D') NOT NULL
tier_source     ENUM('auto','manual') NOT NULL DEFAULT 'auto'
override_by     VARCHAR(20) NULL
override_reason TEXT NULL
custom_fields   JSON NULL
updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

UNIQUE KEY uq_member_contact (member_id, contact_type)
```

- 1 member/contact = 1 record (upsert)
- tier คำนวณอัตโนมัติหลัง log answered ทุกครั้ง

---

## Tier System

### Signals — บันทึกแต่ละครั้งที่โทร (เฉพาะ call ที่รับสาย)

| Signal | field | 1 | 2 | 3 | 4 |
|--------|-------|---|---|---|---|
| ที่อยู่ | `sig_location` | ต่างประเทศ | ต่างจังหวัด | ในจังหวัด | ในอำเภอ |
| เวลา | `sig_availability` | ไม่ว่างเลย | ไม่ค่อยว่าง | ว่างบ้าง | ว่างมาก |
| ความสนใจ | `sig_interest` | ไม่สนใจ | สนใจนิดหน่อย | สนใจ | กระตือรือร้น |

> `sig_reachable` ถูกเอาออกจาก UI แล้ว (column ยังอยู่ใน DB แต่ไม่ใช้)  
> ถ้าเพิ่มหรือลด signal field ต้องแก้ตัวหาร (`/ 3.0`) ใน `web/db/calling/tiers.js` ด้วย

### `sig_overall` — เกรดรวมต่อ call

- คนโทรกด A/B/C/D (= 4/3/2/1) บน UI "เกรดรวม" → บันทึกใน `calling_logs.sig_overall`
- **ไม่ได้ใช้คำนวณ tier** — เป็นแค่ข้อมูลเสริมต่อ call นั้น
- tier คำนวณจาก signal fields เท่านั้น

### Formula คำนวณ tier อัตโนมัติ

```sql
score = AVG(sig_location + sig_availability + sig_interest) / 3.0
        -- เฉลี่ยทุก call ที่รับสาย (status='answered')
        -- NULL → COALESCE เป็น 0 ทำให้ลด score ถ้ากรอกไม่ครบ

A = score >= 3.5
B = score >= 2.5
C = score >= 1.5
D = score < 1.5
```

- call ที่ไม่รับสาย → แสดงใน UI ว่า "รับสาย X/Y ครั้ง" แต่ไม่นับเข้า formula
- ระบบ calculate tier อัตโนมัติหลังบันทึกทุกครั้ง (`web/db/calling/tiers.js: calculateTierFromSignals`)
- คนโทร override tier ได้เสมอ พร้อมใส่เหตุผล → บันทึกใน `calling_member_tiers`

---

## Permission & Access Control

ใช้ฟังก์ชันใน `web/lib/callingAccess.js`

### Role Hierarchy

| ระดับ | Discord Roles (ต้องมีครบ) | Scope | เห็น phone/LINE | สร้าง campaign | Override tier |
|-------|--------------------------|-------|-----------------|----------------|---------------|
| **Admin** | `Admin` หรือ `เลขาธิการ` | ทุกจังหวัด | ✓ | ✓ | ✓ |
| **ภาค** | `ผู้ประสานงานภาค` หรือ `รองเลขาธิการ` **+** `ทีมภาค...` | จังหวัดทั้งหมดในภาคที่ถือ | ✓ | ✓ | ✗ |
| **จังหวัด** | `กรรมการจังหวัด` หรือ `ผู้ประสานงานจังหวัด` **+** `ทีม{จังหวัด}` | `primary_province` เดียว | ✓ | ✓ | ✗ |
| **ทีม** | `ทีม{จังหวัด}` อย่างเดียว | `primary_province` เดียว | ✗ | ✗ | ✗ |

> `ตทอ.` = `กรรมการจังหวัด`  
> `เลขาธิการ` ยังไม่มี Discord role จริง — ทิ้งไว้ใน code สำหรับอนาคต  
> `เหรัญญิก` — override tier ได้เท่านั้น ไม่มี calling scope

### Scope Resolution (`getUserScope`)

scope คือรายการจังหวัดที่ user เข้าถึงได้ — คำนวณใน `lib/callingAccess.js: getUserScope(roles, primaryProvince)`

```
Admin                        → null (ทุกจังหวัด)
ระดับภาค                     → จังหวัดทั้งหมดจาก REGION_PROVINCES[ทีมภาค...]
ระดับจังหวัด / ทีม           → [primaryProvince]  (ถ้าตั้งไว้)
ระดับจังหวัด / ทีม (fallback) → [ทีม{จังหวัด} แรกที่เจอใน roles]  (ถ้าไม่มี primaryProvince)
ไม่มี team role เลย          → [] (ห้ามเข้า)
```

`primaryProvince` มาจาก `session.user.primary_province` ซึ่ง user ตั้งได้ใน Edit Profile  
API routes ทุกตัวส่ง `session.user.primary_province` ให้ `getUserScope` เสมอ

### Contact Permission

| Action | ทีม | จังหวัด+ |
|--------|-----|---------|
| สร้าง contact | ✓ | ✓ |
| เห็น phone / LINE / email | ✗ | ✓ |
| แก้ไข / ลบ contact | เฉพาะที่ตัวเองสร้าง (`created_by`) | ทุก contact |
| assign contact ใน campaign | ✓ (เช็ค scope) | ✓ |

### Assign Permission

- เช็คที่ **assigner** คนเดียว — ดูว่า scope ครอบ `campaign.province` ไหม
- ไม่เช็ค `home_province` ของสมาชิกที่จะถูก assign
- **assign แล้ว → assignee เข้าถึงคนนั้นได้เลย (bypass scope)**

### Special Rules

```
✅ Assign แล้ว → assignee เข้าถึงคนนั้นได้เลย (bypass scope)
✅ Override tier → Admin และ เหรัญญิก เท่านั้น
⚠️ Contact ไม่มี RSVP — UI ซ่อน section นั้นอัตโนมัติ
```

---

## UX / UI

### หน้ารายชื่อสมาชิกใน Campaign

แสดง summary ต่อคนก่อนเลย:
```
[ ชื่อ ] [ ระดับ B ] [ อำเภอ ]
โทรล่าสุด: 2 เดือนก่อน — "ทำงานลาดกระบัง กลับเดือนละครั้ง"
รับสาย 2/3 ครั้ง
[ กดโทร ]
```

เรียงลำดับ: ระดับ A ก่อน → ยังไม่ได้โทรก่อน → โทรไม่ติดบ่อยไว้ท้าย

---

### Auto-split (แบ่งงาน)

ปุ่ม "แบ่งงาน" → modal:
- multi-select autocomplete เลือกผู้รับผิดชอบหลายคน (ดึงจาก `dc_members.display_name`)
- pool = unassigned เท่านั้น แสดง preview "Alice: 50 คน (#1–#50), Bob: 50 คน (#51–#100)"
- confirm → bulk assign แบ่งเท่าๆ กัน
- รองรับการเพิ่มคนโทรทีหลัง — เปิด modal แล้วระบบดึง unassigned ที่เหลือให้อัตโนมัติ

```
[ Alice × ] [ Bob × ]  ค้นหาชื่อ...
┌──────────────────────────────────┐
│ Alice              50 คน (#1–#50)│
│ Bob              50 คน (#51–#100)│
└──────────────────────────────────┘
[ ยืนยัน (2 คน) ]  [ ยกเลิก ]
```

### Member List Table

```
filter: [ อำเภอ ▼ ] [ ระดับ ▼ ] [ สถานะ ▼ ]

[ ✓ ] ชื่อ (320)                  [ แบ่งงาน ↗ ]

[✓] ชื่อ A  A  โพธาราม   Alice   โทรแล้ว
[✓] ชื่อ B  B  เมือง      Bob    มอบหมายแล้ว
[ ] ชื่อ C  C  บ้านโป่ง   —      รอมอบหมาย
```

- `assigned_to` เก็บ `discord_id` แสดงเป็น `display_name` client-side
- mobile: 4 คอลัมน์ (checkbox | ชื่อ+subtitle | tier | status)
- desktop: 7 คอลัมน์ เพิ่ม อำเภอ, มอบหมายให้, จำนวนโทร

---

### หน้าบันทึกหลังโทร (Progressive Disclosure)

**Default — กรอกน้อยสุด:**
```
[ สถานะ: รับสาย / ไม่รับ / ไม่ติด ]   ← บังคับเสมอ
[ note... ]                            ← optional
[ บันทึก ]
```

**ถ้า "รับสาย" → แสดง signals เพิ่ม:**
```
ที่อยู่:    [ ต่างประเทศ | ต่างจังหวัด | ในจังหวัด | ในอำเภอ ]
เวลา:      [ ไม่ว่างเลย | ไม่ค่อยว่าง | ว่างบ้าง | ว่างมาก ]
ความสนใจ:  [ ไม่สนใจ | สนใจนิดหน่อย | สนใจ | กระตือรือร้น ]
```

> `sig_reachable` column ยังอยู่ใน DB แต่ไม่แสดงใน UI และไม่นับเข้า formula tier

**Toggle "ปรับระดับ manually":**
```
+ [ A / B / C / D ] + เหตุผล   ← override tier auto ได้
+ custom fields อื่นๆ
```

> signals → บันทึกใน `calling_logs` ทุกครั้ง  
> tier → คำนวณอัตโนมัติจาก signals สะสม อัปเดตใน `calling_member_tiers` (1 record ต่อสมาชิก)

- กดโทรผ่าน `tel:` link (รองรับ mobile)
- บันทึกได้ในขั้นตอนเดียว

---

### CSS Conventions

→ ดู [md/WEB.md — Theming & CSS Conventions](WEB.md#theming--css-conventions) (ใช้ทั้งโปรเจกต์)

---

## Folder Structure

```
web/
  app/
    calling/
      page.js                       ← รายการ campaigns (card grid)
      contacts/
        page.js                     ← จัดการ contacts (list, create, edit, delete)
      [campaignId]/
        page.js                     ← รายชื่อ member/contact ใน campaign — tab Member | Contact
      pending/
        page.js                     ← pending calls — tab Member | Contact
    api/
      calling/
        campaigns/
        assignments/                ← POST/DELETE รองรับ contact_type ใน body
        logs/                       ← GET รองรับ ?contactType=, POST รองรับ contact_type ใน body
        tiers/
        members/
        contacts/
          route.js                  ← GET list, POST create
          [id]/route.js             ← GET/PUT/DELETE single contact
          campaign/route.js         ← GET contacts ใน campaign (province match)
        users/
  components/
    calling/
      SplitModal.jsx
      UserCombobox.jsx
      ContactForm.jsx               ← form create/edit contact + cascading province→amphoe→tambon
      RecordCallModal.jsx           ← รองรับทั้ง member และ contact (normalized fields)
  db/
    calling/
      campaigns.js
      assignments.js                ← ทุกฟังก์ชัน default contactType = 'member'
      logs.js                       ← ทุกฟังก์ชัน default contactType = 'member'
      tiers.js                      ← ทุกฟังก์ชัน default contactType = 'member'
      members.js                    ← ทุก SQL JOIN ใส่ AND contact_type = 'member'
      contacts.js                   ← CRUD + campaign queries สำหรับ contacts
  lib/
    thailand-geography.json         ← 77 จังหวัด, 928 อำเภอ, 7436 ตำบล (static import ใน ContactForm)
scripts/
  calling/
    import-calling-logs-xlsx.js
    import-ngs-member-cache.js
    migration-calling-contacts.sql  ← สร้าง calling_contacts + เพิ่ม contact_type ใน 3 ตาราง
```

---

## Nav — Campaign Selector

`components/Nav.jsx` — "Campaigns" link ใน calling section เป็น split button:

- **กดที่ "Campaigns"** → ไป `/calling` (all campaigns list)
- **กดที่ลูกศร ▾** → dropdown รายชื่อ active campaigns → navigate ไป `/calling/[id]`
- **Mobile hamburger** → Campaigns มี tree expand แสดงรายชื่อ campaigns ใต้
- Fetch จาก `/api/calling/campaigns?active=true` เฉพาะตอนอยู่ใน `/calling/*`
- Campaign ที่ active = ยังไม่ถึง `event_date` (หรือไม่มี event_date)

---

## อนาคต

- **BigQuery:** เมื่อเชื่อมได้ → เปลี่ยน query source ใน `db/calling/members.js` โดยไม่ต้องแตะ schema calling_ tables
- **ACT:** เมื่อได้ API → ดึง activity list มาให้เลือกใน dropdown แทนกรอกเอง schema ไม่ต้องเปลี่ยน
- **Bot integration:** Discord bot ดึงข้อมูลจาก MySQL ตัวเดียวกันได้เลย
