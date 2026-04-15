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
- **ข้อมูลสมาชิก:** ตอนนี้ดึงจาก `calling_members_bq` / อนาคตเชื่อม BigQuery จริง

---

## Database

### 1. แก้ไข `dc_members` — เพิ่ม identity fields

```sql
ALTER TABLE dc_members
  ADD COLUMN phone      VARCHAR(20)  NULL,
  ADD COLUMN line_id    VARCHAR(100) NULL,
  ADD COLUMN google_id  VARCHAR(100) NULL;
```

> `member_id` มีอยู่แล้วใน `dc_members` แต่ยังไม่มีข้อมูล  
> ถ้า `phone IS NULL` → frontend random เบอร์ dummy แสดงบน UI ชั่วคราว **ไม่บันทึกลง DB**

---

### 2. `calling_members_bq` — จำลอง BigQuery (import จาก XLS)

```sql
CREATE TABLE calling_members_bq (
  member_id     VARCHAR(20)   NOT NULL PRIMARY KEY,
  prefix        VARCHAR(20)   NULL,
  name          VARCHAR(200)  NOT NULL,
  member_type   VARCHAR(50)   NULL COMMENT 'รายปี / ตลอดชีพ',
  district      VARCHAR(100)  NULL COMMENT 'อำเภอ',
  subdistrict   VARCHAR(100)  NULL COMMENT 'ตำบล',
  province      VARCHAR(100)  NULL,
  phone         VARCHAR(20)   NULL,
  line_id       VARCHAR(100)  NULL COMMENT 'LINE Identity (ใช้ link)',
  line_username VARCHAR(100)  NULL COMMENT 'LINE contact ที่สมาชิกให้มา',
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP
);
```

- import มาจาก XLS ราชบุรี (และจังหวัดอื่นๆ ในอนาคต) ผ่าน `scripts/calling/import-members-xls.js`
- อนาคตเมื่อเชื่อม BigQuery จริง → เปลี่ยน query source ใน `db/calling/members.js` โดยไม่ต้องแตะ schema calling_ tables

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

| Signal | 1 | 2 | 3 | 4 |
|--------|---|---|---|---|
| ที่อยู่ | ต่างประเทศ | ต่างจังหวัด | ในจังหวัด | ในอำเภอ |
| เวลา | ไม่ว่างเลย | ไม่ค่อยว่าง | ว่างบ้าง | ว่างมาก |
| ความสนใจ | ไม่สนใจ | สนใจนิดหน่อย | สนใจ | กระตือรือร้น |
| ติดต่อได้ | ไม่ติดเลย | ติดยาก | ติดได้ | รับสายทันที |

### Formula คำนวณ tier อัตโนมัติ

```
score = เฉลี่ย signals ทุก call ที่รับสาย (ไม่รับสายไม่นับ)

A = 3.5 - 4.0
B = 2.5 - 3.4
C = 1.5 - 2.4
D = 1.0 - 1.4
```

- call ที่ไม่รับสาย → แสดงใน UI ว่า "รับสาย X/Y ครั้ง" แต่ไม่นับเข้า formula
- ระบบ calculate tier อัตโนมัติหลังบันทึกทุกครั้ง
- คนโทร override tier ได้เสมอ พร้อมใส่เหตุผล → บันทึกใน `calling_member_tiers`

---

## Permission

ใช้ role hierarchy เดิมใน `config/roles.js` ไม่สร้างใหม่

| Role | Default scope | Override โดย admin |
|------|-------------|-------------------|
| Admin / เลขาธิการ | ทั้งประเทศ | — |
| รองเลขาธิการภาค / ผู้ประสานงานภาค | ทุกจังหวัดในภาค | ขยายข้ามภาคได้ |
| ผู้ประสานงานจังหวัด / กรรมการจังหวัด | ทุกอำเภอในจังหวัด | ขยายข้ามจังหวัดได้ |
| ตทอ. | อำเภอที่ admin กำหนด | เพิ่ม/ลด อำเภอได้ |

- ทุก role override ได้รายคนโดย admin
- deny ชนะเสมอ
- assign แล้ว → คนที่ถูก assign เข้าถึงสมาชิกคนนั้นได้เลย ไม่เช็ค scope เพิ่ม

### สิทธิ์ assign

| Role | assign ได้ |
|------|-----------|
| Admin / เลขาธิการ | ทุกคน ทุกพื้นที่ |
| รองเลขาธิการภาค / ผู้ประสานงานภาค | สมาชิกในภาคตัวเอง |
| ผู้ประสานงานจังหวัด / กรรมการจังหวัด | สมาชิกในจังหวัดตัวเอง |
| ตทอ. | สมาชิกในอำเภอที่ได้รับมอบหมาย |

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

### Bulk Assign

```
filter: [ อำเภอ ▼ ] [ ระดับ ▼ ] [ ยังไม่ assign ▼ ]

[ ✓ ] เลือกทั้งหมด (120/320)    [ assign ให้... ]

[✓] ชื่อ A  ระดับ A  โพธาราม   Tee
[✓] ชื่อ B  ระดับ B  เมือง     แอม
[ ] ชื่อ C  ระดับ C  บ้านโป่ง  —
```

- check all → เลือกทุกแถวที่ filter อยู่ (ไม่ใช่ทั้งหมดใน campaign)
- ตัวเลขบอกว่าเลือกอยู่กี่คนจากกี่คน
- พอ filter เปลี่ยน → check all ปรับตามที่ filter เห็นอยู่

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
ติดต่อได้: [ ไม่ติดเลย | ติดยาก | ติดได้ | รับสายทันที ]
```

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
      page.js                       ← รายการ campaigns
      members/
        [memberId]/
          page.js                   ← profile สมาชิก + ประวัติโทรทุก campaign
      [campaignId]/
        page.js                     ← รายชื่อสมาชิกใน campaign + bulk assign
        [memberId]/
          page.js                   ← หน้าโทร + ประวัติใน campaign นี้ + บันทึก
    api/
      calling/
        campaigns/
        assignments/
        logs/
        tiers/
        members/
  components/
    calling/
      CampaignCard.jsx
      MemberCallCard.jsx            ← summary card
      CallLogger.jsx                ← form บันทึกหลังโทร
      BulkAssign.jsx                ← checkbox + filter + assign
      MemberProfile.jsx             ← profile + ประวัติโทรรวมทุก campaign
  db/
    calling/
      campaigns.js
      assignments.js
      logs.js
      tiers.js
      members.js                    ← query calling_members_bq (จำลอง BigQuery)
scripts/
  calling/
    import-members-xls.js          ← normalize + import XLS → calling_members_bq
```

---

## อนาคต

- **BigQuery:** เมื่อเชื่อมได้ → เปลี่ยน query source ใน `db/calling/members.js` โดยไม่ต้องแตะ schema calling_ tables
- **ACT:** เมื่อได้ API → ดึง activity list มาให้เลือกใน dropdown แทนกรอกเอง schema ไม่ต้องเปลี่ยน
- **Bot integration:** Discord bot ดึงข้อมูลจาก MySQL ตัวเดียวกันได้เลย
