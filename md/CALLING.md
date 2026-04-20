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

### 3. `calling_campaigns` — รอบ/กิจกรรมการโทร

```sql
CREATE TABLE calling_campaigns (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200)  NOT NULL,
  description  TEXT          NULL,
  province     VARCHAR(100)  NULL COMMENT 'จังหวัดที่ campaign นี้ดูแล',
  act_id       VARCHAR(100)  NULL COMMENT 'ref ไปยัง ACT activity (optional)',
  created_by   VARCHAR(20)   NOT NULL COMMENT 'discord_id',
  created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP
);
```

- **ทุก role สร้างได้** รวมถึง ตทอ. และผู้ประสานงานทุกระดับ
- ไม่ผูก guild_id เพราะสมาชิกเป็นชุดเดียวใช้ร่วมกันทุก guild
- `act_id` กรอกเองก่อน อนาคตเชื่อม ACT API ดึง dropdown มาให้เลือกได้เลยโดยไม่ต้องเปลี่ยน schema

---

### 4. `calling_assignments` — assign สมาชิกให้คนโทร

```sql
CREATE TABLE calling_assignments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id   INT          NOT NULL,
  member_id     VARCHAR(20)  NOT NULL COMMENT 'รหัสสมาชิกพรรค',
  assigned_to   VARCHAR(20)  NOT NULL COMMENT 'discord_id ของคนรับผิดชอบ',
  assigned_by   VARCHAR(20)  NOT NULL COMMENT 'discord_id ของคนที่ assign',
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_member (campaign_id, member_id)
);
```

- 1 สมาชิก : 1 คนรับผิดชอบ ต่อ campaign (unique constraint)
- แก้ไข `assigned_to` ได้เสมอ รองรับ bulk reassign
- `assigned_by` คือใครก็ได้ (admin assign หรือรับงานเอง)
- **assign แล้ว → คนที่ถูก assign เข้าถึงสมาชิกคนนั้นได้เลย ไม่เช็ค scope เพิ่ม**

---

### 5. `calling_logs` — บันทึกการโทรแต่ละครั้ง

```sql
CREATE TABLE calling_logs (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id        INT          NOT NULL,
  member_id          VARCHAR(20)  NOT NULL COMMENT 'รหัสสมาชิกพรรค',
  called_by          VARCHAR(20)  NULL     COMMENT 'discord_id คนที่โทร (NULL ถ้า import จาก XLS)',
  caller_name        VARCHAR(100) NULL     COMMENT 'display_name ตอนโทร (sync จาก Discord หรือชื่อเล่นจาก XLS)',
  called_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  status             ENUM('answered', 'no_answer', 'busy', 'wrong_number') NOT NULL,
  -- signals (กรอกเฉพาะตอน status = answered)
  sig_location       TINYINT NULL COMMENT '1=ต่างประเทศ 2=ต่างจังหวัด 3=ในจังหวัด 4=ในอำเภอ',
  sig_availability   TINYINT NULL COMMENT '1=ไม่ว่างเลย 2=ไม่ค่อยว่าง 3=ว่างบ้าง 4=ว่างมาก',
  sig_interest       TINYINT NULL COMMENT '1=ไม่สนใจ 2=สนใจนิดหน่อย 3=สนใจ 4=กระตือรือร้น',
  sig_reachable      TINYINT NULL COMMENT '1=ไม่ติดเลย 2=ติดยาก 3=ติดได้ 4=รับสายทันที',
  note               TEXT NULL,
  extra              JSON NULL COMMENT 'custom fields เพิ่มเติม (progressive disclosure)',
  created_at         DATETIME     DEFAULT CURRENT_TIMESTAMP
);
```

- call จากระบบจริง → มีทั้ง `called_by` (discord_id) และ `caller_name` (display_name ขณะโทร)
- call จาก XLS import → มีแค่ `caller_name` (ชื่อเล่น เช่น "Tee", "แอม")
- signals กรอกเฉพาะตอนรับสาย ไม่รับสายไม่นับเข้า formula

---

### 6. `calling_member_tiers` — tier ปัจจุบันของสมาชิก

```sql
CREATE TABLE calling_member_tiers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  member_id       VARCHAR(20)  NOT NULL,
  tier            ENUM('A','B','C','D') NOT NULL,
  tier_source     ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  override_by     VARCHAR(20)  NULL COMMENT 'discord_id คนที่ override (manual เท่านั้น)',
  override_reason TEXT         NULL,
  custom_fields   JSON         NULL COMMENT 'field พิเศษที่แต่ละแผนกเพิ่มเองได้',
  updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_member (member_id)
);
```

- 1 สมาชิก = 1 record (upsert)
- `tier_source` บอกว่ามาจาก auto หรือ manual override
- audit trail ดูได้จาก signals ใน `calling_logs`

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

### Role hierarchy (ตาม callingAccess.js)

| กลุ่ม | Roles | Scope |
|-------|-------|-------|
| Admin | `Admin`, `เลขาธิการ` | ทั่วประเทศ |
| ภาค | `ผู้ประสานงานภาค`, `รองเลขาธิการ` + `ทีมภาค...` | จังหวัดในภาคที่ตัวเองสังกัด (มีได้หลายภาค) |
| จังหวัด | `ผู้ประสานงานจังหวัด`, `กรรมการจังหวัด` + `ทีมXXX` | จังหวัดตัวเอง |

> `ตทอ.` = `กรรมการจังหวัด`  
> `เลขาธิการ` ยังไม่มี Discord role — ทิ้งไว้ใน code สำหรับอนาคต

### Assign Permission

- เช็คที่ **assigner** คนเดียว — ดูว่า role ครอบ `campaign.province` ไหม
- **ไม่เช็ค** home_province ของสมาชิกที่จะถูก assign (assignee)
- assignee คือใครก็ได้ — เมื่อถูก assign แล้วเข้าถึงสมาชิกนั้นได้เลย (bypass scope)

### Special Rules

```
✅ Assign แล้ว → assignee เข้าถึงสมาชิกคนนั้นได้เลย (bypass scope)
⚙️ Override tier ได้รายคน → Admin หรือ เหรัญญิก เท่านั้น
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

## Folder Structure

```
web/
  app/
    calling/
      page.js                       ← รายการ campaigns (card grid)
      [campaignId]/
        page.js                     ← รายชื่อสมาชิกใน campaign + auto-split
      pending/
        page.js                     ← pending calls ที่ assign มาให้ user
    api/
      calling/
        campaigns/                  ← GET รองรับ ?active=true&limit= และ pending_count ต่อ user
        assignments/
        logs/                       ← GET ดึง logs ต่อ member+campaign, POST บันทึก + auto-calculate tier
        tiers/
        members/
        users/                      ← dc_members for assignee combobox
  components/
    calling/
      SplitModal.jsx                ← auto-split modal
      UserCombobox.jsx              ← multi-select autocomplete (ดึง display_name)
      CallingBreadcrumb.jsx         ← สร้างแล้วแต่ไม่ได้ใช้ (ย้าย campaign selector ไป Nav แทน)
  db/
    calling/
      campaigns.js
      assignments.js
      logs.js
      tiers.js
      members.js                    ← query ngs_member_cache
scripts/
  calling/
    import-calling-logs-xlsx.js    ← import call logs จาก XLS
  sync-discord-members.js          ← one-time sync guild members → dc_members
  migration-add-display-name.sql   ← ALTER TABLE dc_members ADD display_name
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
