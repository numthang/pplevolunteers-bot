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
- **Database:** PostgreSQL `pple_volunteers` — prefix `calling_`
- **Auth:** Discord OAuth (next-auth เดิม)
- **ข้อมูลสมาชิก:** ตอนนี้ดึงจาก `cache_pple_member` (import จาก NGS CSV export) / อนาคตเชื่อม BigQuery จริง

---

## Database

### 1. Identity — `users` + `org_members` (แทน `dc_members` เดิม)

หลัง identity-split migration: `dc_members` ถูก archive เป็น `_dc_members` (โค้ดไม่ใช้แล้ว) — identity/profile fields ย้ายไปคนละตารางตาม scope:

| Field | ตาราง | Note |
|---|---|---|
| `discord_id`, `phone`, `line_id`, `google_id`, `email` | `users` | ตัวตน 1 แถว/คน ข้าม guild/org |
| `display_name`, `province`, `primary_province`, `roles`, `web_roles`, `position` | `org_members` | membership/profile ต่อ guild-org (1 แถว/user/org, `user_id` → `users.id`) |

- `display_name` = `member.displayName` จาก Discord (server nickname → global name → username) sync เข้า `org_members.display_name` อัตโนมัติเมื่อ join / update
- sync ทุก guild member ด้วย `node scripts/calling/sync-discord-members.js <guildId> [--dry-run|--sql]` → upsert `users` + `org_members`
- assignee combobox (`/api/calling/users`) join `org_members.user_id = users.id`, fallback `display_name` → `username` ถ้ายังไม่ตั้ง

---

### 2. `cache_pple_member` — ข้อมูลสมาชิกพรรค (sync จาก NGS CSV export)

- ตาราง source หลักที่ `db/calling/members.js` และ `db/calling/tiers.js` query
- key field: `source_id` (= member_id ที่ใช้ join กับ `calling_*` tables), `home_province`, `org_id` (org-scope)
- sync ด้วย `node scripts/calling/import-member-csv.js <file.csv>` (upsert by `source_id`, ต้องตั้ง `GUILD_ID` env) — ไม่ต้องแตะ schema `calling_*` ถ้าเปลี่ยน source

---

### 3. Campaigns — ใช้ `cache_pple_event` (`type = 'campaign'`)

ไม่มีตาราง `calling_campaigns` แยก — campaign เก็บใน `cache_pple_event` เดียวกับ activity ทั่วไป โดยใช้ `type = 'campaign'` เพื่อแยกประเภท

- `cache_pple_event` ยังคง `guild_id` ไว้ (Discord/ACT artifact — ไม่ผ่าน org-scope migration) ส่วน roster (`cache_pple_member`) ผูก `org_id` ตรงๆ  
  → query campaign ของ org ต้อง join `guild_id IN (SELECT guild_id FROM dc_guilds WHERE org_id = $1)` (ดู `getCampaigns` ใน `db/calling/campaigns.js`)
- สร้างผ่าน Web UI: `/calling/campaigns/create`
- Import จาก XLSX: 1 ไฟล์ = 1 campaign ชื่อ campaign มาจาก filename (เช่น `กิจกรรมโทรหาสมาชิกราชบุรี.xlsx` → campaign name = `กิจกรรมโทรหาสมาชิกราชบุรี`)
- **สร้างได้เฉพาะ** Admin, ระดับภาค, ระดับจังหวัด (กรรมการจังหวัด / ผู้ประสานงานจังหวัด) — ทีมปฏิบัติการสร้างไม่ได้

Key fields: `id`, `name`, `province`, `description`, `event_date`, `event_end_date`, `guild_id`, `act_event_id`, `image_url`, `location`, `map_url`

#### ID Range Convention (`cache_pple_event.id`)

| Range | ใช้สำหรับ |
|---|---|
| **1 – 100** | สงวนไว้สำหรับ province xlsx imports — ใช้รหัสจังหวัดไทยเป็น ID (เช่น ราชบุรี = 70, นครปฐม = 73) |
| **101 – ∞** | Manual campaigns สร้างผ่าน Web UI (sequence เริ่มจาก 106) |
| — | ACT events ที่ sync เข้ามา — ได้ auto-increment ID เหมือน campaign แต่มี `act_event_id` เก็บ ACT URL ID แยกไว้ |

> ห้ามใช้ `id` ≤ 100 สำหรับ manual campaign — INSERT province xlsx ต้องระบุ `id` ตรงๆ เสมอ  
> `act_event_id` เป็น column แยก (partial unique index) ไม่ปนกับ `id`

#### type

| value | ความหมาย |
|---|---|
| `campaign` | สร้างเอง (Web UI หรือ xlsx import) |
| `event` | sync อัตโนมัติจาก act.pplethai.org |
| `register` | การลงทะเบียนเข้าร่วม event — เป็นลูกของ `campaign` หรือ `event` ผ่าน `parent_id` |

Calling system query ใช้ `WHERE type IN ('campaign', 'event')` สำหรับ READ  
WRITE queries (updateCampaign, deleteCampaign) ใช้ `WHERE type = 'campaign'` เท่านั้น — ป้องกันแก้ ACT event โดยไม่ตั้งใจ

#### parent_id — ความสัมพันธ์ parent/child

`register` rows มี `parent_id` ชี้ไปที่ `cache_pple_event.id` ของ parent (`campaign` หรือ `event`)

```
cache_pple_event (type='campaign', id=70)     ← parent
  └── cache_pple_event (type='register', parent_id=70)  ← ลงทะเบียนเข้าร่วม
```

- `parent_id` = `id` ของ parent row (ไม่ใช่ `act_event_id`)
- เมื่อ re-ID campaign ต้อง cascade `UPDATE cache_pple_event SET parent_id = <new> WHERE parent_id = <old>` ด้วยเสมอ — อยู่ใน migration.sql แล้ว
- import script (`scripts/calling/import-act-event-cache.js`) ต้องตั้ง `CAMPAIGN_ID` ให้ตรงกับ `id` ของ parent campaign

---

### 4. `calling_contacts` — ผู้ติดต่อ manual (ไม่ใช่สมาชิกพรรค)

ตารางนี้เพิ่มใหม่สำหรับ non-member contacts: ผู้บริจาค, คนสนใจ, อาสาสมัคร, อาสาส้ม, แกนนำ, ผู้นำชุมชน, ประชาสังคม, สื่อมวลชน, นักการเมือง/อปท., สถานที่, งานพิมพ์/ป้าย, บริการอีเวนต์

- CRUD ได้ (ต่างจาก `cache_pple_member` ที่ sync-only)
- key fields: `id`, `org_id`, `first_name`, `last_name`, `phone`, `province`, `amphoe`, `tambon`, `category`, `specialty`, `created_by`, `updated_by` (`created_by`/`updated_by` = `users.id`)
- `category`: `donor` | `prospect` | `volunteer` | `oranger` | `leader` | `community_leader` | `civil` | `media` | `politician` | `venue` | `print` | `event_service` | `other`
- province กรอกจาก dropdown Thailand geography (JSON static ที่ `web/lib/thailand-geography.json`)

**⚠️ ID Overlap:** `calling_contacts.id` (auto-increment) กับ `cache_pple_member.source_id` เป็น PK คนละตาราง — ทั้งคู่เริ่มนับจาก id เลขน้อยๆ จึงทับกันได้เสมอ  
→ ทุก SQL query ที่ JOIN ตาราง shared (`calling_logs`, `calling_assignments`, `calling_member_tiers`, `calling_starred`) **ต้องใส่ `AND contact_type = 'member'` หรือ `'contact'` เสมอ** ไม่งั้น ID จะปนกัน

---

### 5. `calling_assignments` — assign สมาชิก/contact ให้คนโทร

Schema ปัจจุบัน (Postgres):

```sql
id            SERIAL PRIMARY KEY
campaign_id   INTEGER      NULL              -- 0 = Undefined
contact_type  calling_assignments_contact_type NOT NULL DEFAULT 'member'  -- enum('member','contact')
member_id     VARCHAR(20)  NOT NULL          -- source_id หรือ calling_contacts.id
assigned_to   INTEGER      NOT NULL REFERENCES users(id)
assigned_by   INTEGER      NOT NULL REFERENCES users(id)
rsvp          calling_assignments_rsvp NULL  -- enum('yes','no','maybe') — member เท่านั้น
org_id        INTEGER      NOT NULL REFERENCES orgs(id)
created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP

UNIQUE (campaign_id, member_id, contact_type)
```

- unique key คือ `(campaign_id, member_id, contact_type)` — assign ได้ 1 ครั้งต่อ 1 campaign (ไม่ใช่ unique ทั้งระบบเหมือนที่เอกสารเดิมเขียนไว้ — คนละ campaign assign ซ้ำกันได้)
- `assigned_to` / `assigned_by` เก็บ `users.id` (INT, FK) — ไม่ใช่ discord_id string แล้ว
- แก้ไข `assigned_to` ได้เสมอ (`ON CONFLICT ... DO UPDATE`)
- **assign แล้ว → assignee เข้าถึงคนนั้นได้เลย ไม่เช็ค scope เพิ่ม**

---

### 6. `calling_logs` — บันทึกการโทรแต่ละครั้ง

Schema ปัจจุบัน (Postgres):

```sql
id               SERIAL PRIMARY KEY
campaign_id      INTEGER NULL              -- 0 = Undefined
contact_type     calling_logs_contact_type NOT NULL DEFAULT 'member'  -- enum('member','contact')
member_id        VARCHAR(20) NOT NULL
called_by        INTEGER NULL REFERENCES users(id)   -- NULL = import จาก XLS
caller_name      VARCHAR(100) NULL
caller_image     TEXT NULL
called_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
status           calling_logs_status NOT NULL
sig_overall      SMALLINT NULL
sig_location     SMALLINT NULL             -- 1=ต่างประเทศ … 4=ในอำเภอ
sig_availability SMALLINT NULL             -- 1=ไม่ว่างเลย … 4=ว่างมาก
sig_interest     SMALLINT NULL             -- 1=ไม่สนใจ … 4=กระตือรือร้น
sig_reachable    SMALLINT NULL             -- ไม่ใช้ใน UI แต่ column ยังอยู่
note             TEXT NULL
extra            TEXT NULL                 -- JSON.stringify จากแอป (column ไม่ใช่ JSON type แล้ว)
org_id           INTEGER NOT NULL REFERENCES orgs(id)
created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
```

- `called_by` เก็บ `users.id` (INT, FK) — ไม่ใช่ discord_id string แล้ว
- status enum จริง: `answered | no_answer | not_called | met | sms_sent | sms_delivered | sms_failed`  
  (`met` มาจาก Contacts module ดู [CONTACT.md](CONTACT.md) · `sms_*` มาจาก SMS feature ที่ `/api/calling/sms` — ยังไม่มีเอกสารแยก)
- signals กรอกเฉพาะ `status IN ('answered', 'met')`
- contact ไม่มี RSVP — `RecordCallModal` ซ่อน RSVP section อัตโนมัติเมื่อ `contact_type = 'contact'`

---

### 7. `calling_member_tiers` — tier ปัจจุบัน (ใช้ร่วมกัน)

Schema ปัจจุบัน (Postgres):

```sql
id              SERIAL PRIMARY KEY
contact_type    calling_member_tiers_contact_type NOT NULL DEFAULT 'member'  -- enum('member','contact')
member_id       VARCHAR(20) NOT NULL
tier            calling_member_tiers_tier NOT NULL         -- enum('A','B','C','D')
tier_source     calling_member_tiers_tier_source NOT NULL DEFAULT 'auto'  -- enum('auto','manual')
override_by     INTEGER NULL REFERENCES users(id)
override_reason TEXT NULL
custom_fields   TEXT NULL          -- JSON.stringify จากแอป (column ไม่ใช่ JSON type แล้ว)
flag            VARCHAR(20) NULL   -- flag ต่อ member/contact (ตั้งผ่าน RecordCallModal, ไม่เข้าสูตร tier — db/calling/tiers.js: updateFlag)
org_id          INTEGER NOT NULL REFERENCES orgs(id)
updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP

UNIQUE (member_id, contact_type)
```

- `override_by` เก็บ `users.id` (INT, FK) — ไม่ใช่ discord_id string แล้ว
- 1 member/contact = 1 record (upsert)
- tier คำนวณอัตโนมัติหลัง log answered/met ทุกครั้ง

---

### 8. `calling_starred` — รายการโปรดต่อผู้ใช้ (ยังไม่มีในเอกสารเดิม)

```sql
id            SERIAL PRIMARY KEY
org_id        INTEGER NOT NULL REFERENCES orgs(id)
user_id       INTEGER NOT NULL REFERENCES users(id)
member_id     VARCHAR(20) NOT NULL
contact_type  calling_starred_contact_type NOT NULL DEFAULT 'member'  -- enum('member','contact')
note          TEXT NULL
created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

UNIQUE (org_id, user_id, member_id, contact_type)
```

- ใช้โดย `db/calling/starred.js` + `components/calling/StarredStar.jsx` + `/api/calling/starred`
- ต่างจาก `calling_assignments`: starred = ผู้ใช้ mark เองรายบุคคล ไม่ผูก campaign ไม่กระทบ scope/permission

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

ใช้ฟังก์ชันใน `web/lib/callingAccess.js` — กิน `access = { permissions: Set, scopeGrants: string[] }` จาก `resolveAccess()` (`web/lib/resolveAccess.js`) แทนการเทียบชื่อ Discord role ตรงๆ แบบเดิม permission/scope ต่อ role name ถูกย้ายไปตั้งค่าใน `dc_guild_roles` (data-driven ต่อ guild ไม่ hardcode ในโค้ดแล้ว)

### Role Hierarchy

| ระดับ | Permission token (`dc_guild_roles.permission`) | Scope | เห็น phone/LINE | สร้าง campaign | Override tier |
|-------|--------------------------------------------------|-------|-----------------|----------------|---------------|
| **Admin** | `admin` หรือ `secretary_general` (เลขาธิการ) | ทุกจังหวัด | ✓ | ✓ | ✓ |
| **ภาค** | `regional_coordinator` (ผู้ประสานงานภาค/รองเลขาธิการ) | จังหวัดทั้งหมดใน sub-region ที่ถือ grant | ✓ | ✓ | ✗ |
| **จังหวัด** | `province_coordinator` หรือ `district_coordinator` (ตทอ.) | จังหวัดจาก `province:` grant ที่ถือ (ถือหลาย role ได้หลายจังหวัด) | ✓ | ✓ | ✗ |
| **ทีม** | ไม่มี permission พิเศษ — มีแค่ `province:` scope grant | จังหวัดจาก `province:` grant ที่ถือ | ✗ | ✗ | ✗ |

> `เหรัญญิก` = permission `treasurer` — override tier ได้เท่านั้น (capability `overrideTier`) ไม่มี calling scope อื่น  
> user ถือหลาย role พร้อมกันได้ → permissions/scope เป็น union ของทุก role (ไม่ต้องถือ role คู่กันแบบ "ต้องมีครบ" เหมือนเดิม)  
> capability matrix เต็มอยู่ที่ `web/lib/permissions.js: CAPABILITIES`

### Scope Resolution (`getUserScope`)

scope คือรายการจังหวัดที่ user เข้าถึงได้ — คำนวณใน `lib/callingAccess.js: getUserScope(access)`

```
admin / secretary_general → null (ทุกจังหวัด)
regional_coordinator      → expandGrants(scopeGrants ที่ขึ้นต้น 'subregion:', { mode: 'calling' })
                             (mode 'calling' ไม่รู้จัก grant ระดับ 'region:' ใหญ่ — ดู web/lib/geography.js)
province / district / ทีม → scopeGrants ทุกตัวที่ขึ้นต้น 'province:' (union จากทุก role ที่ถือ)
ไม่มี scope grant เลย     → [] (ห้ามเข้า)
```

- ไม่ได้ผูกกับ `session.user.primary_province` แบบเดิมแล้ว — scope คำนวณจาก role ที่ user ถือ (`org_members.roles` → catalog ใน `dc_guild_roles`) โดยตรง ผ่าน `resolveAccess()`
- `web/lib/geography.js: SUB_REGION_MAP` = จังหวัด → ชื่อ role ภาคย่อย (แทนแนวคิด `REGION_PROVINCES` เดิม)

### Contact Permission

| Action | ทีม | จังหวัด+ |
|--------|-----|---------|
| สร้าง contact | ✓ | ✓ |
| เห็น phone / LINE / email | ✗ | ✓ |
| แก้ไข / ลบ contact | เฉพาะที่ตัวเองสร้าง (`created_by`) | ทุก contact |
| assign contact ใน campaign | ✓ (เช็ค scope) | ✓ |

> `/api/calling/members` (member list): ระดับจังหวัด/ตทอ. (ไม่ใช่ admin/ภาค) เห็น phone/LINE เฉพาะแถวที่ `home_province` ตรงกับ `session.user.primary_province` เท่านั้น — แคบกว่า `scope` ที่ใช้กรอง list (ซึ่งเป็น union ทุก `province:` role ที่ถือ) ถ้าถือหลาย province role พร้อมกัน

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
- multi-select autocomplete เลือกผู้รับผิดชอบหลายคน (ดึงจาก `/api/calling/users` → `org_members.display_name`, fallback `users.username`)
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

- `assigned_to` เก็บ `users.id` (INT) แสดงเป็น `display_name` client-side
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
      page.js                       ← Dashboard (`/calling`)
      campaigns/
        page.js                     ← รายการ campaigns (card grid) (`/calling/campaigns`)
        create/page.js               ← สร้าง campaign
        [id]/edit/page.js            ← แก้ไข campaign
      assignments/
        [campaignId]/page.js         ← รายชื่อ member/contact ใน campaign — tab Member | Contact
      assignee/
        page.js                     ← pending calls ของ assignee ปัจจุบัน (`/calling/assignee`)
      contacts/
        page.js                     ← จัดการ contacts (list, create, edit, delete)
        [id]/page.js                  ← contact detail + interaction log
      stats/
        page.js                     ← calling dashboard stats
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
          [id]/logs/route.js         ← GET interaction log ของ contact นั้น
          campaign/route.js         ← GET contacts ใน campaign (province match)
        users/                      ← assignee combobox source (org_members + users)
        pending/                    ← pending calls (member/contact) ของ assignee
        starred/                    ← รายการโปรด (calling_starred)
        stats/                     ← calling dashboard stats
        dial/                      ← log audit event ตอนกด `tel:`
        districts/                  ← district cache ต่อ campaign+amphure (7 วัน)
        sms/                       ← ส่ง SMS จำนวนมาก (Thaibulksms) — ยังไม่มีเอกสารแยก
  components/
    calling/
      SplitModal.jsx
      UserCombobox.jsx
      ContactForm.jsx               ← form create/edit contact + cascading province→amphoe→tambon
      ContactModal.jsx              ← modal wrapper ของ ContactForm
      InteractionLogForm.jsx         ← inline form บันทึกการพบปะใน `/calling/contacts/[id]`
      RecordCallModal.jsx           ← รองรับทั้ง member และ contact (normalized fields)
      CampaignCard.jsx
      StarredStar.jsx               ← toggle รายการโปรด
      SmsModal.jsx
      PdpaAgreementModal.jsx
  db/
    calling/
      campaigns.js
      assignments.js                ← ทุกฟังก์ชัน default contactType = 'member'
      logs.js                       ← ทุกฟังก์ชัน default contactType = 'member'
      tiers.js                      ← ทุกฟังก์ชัน default contactType = 'member'
      members.js                    ← ทุก SQL JOIN ใส่ AND contact_type = 'member'
      contacts.js                   ← CRUD + campaign queries + getContactLogs สำหรับ contacts
      starred.js                    ← calling_starred CRUD
  lib/
    callingAccess.js                ← permission/scope logic (กิน access จาก resolveAccess)
    resolveAccess.js                ← role name → { permissions, scopeGrants } (อ่าน dc_guild_roles)
    permissions.js                  ← CAPABILITIES matrix (universal ทุกระบบ)
    geography.js                    ← SUB_REGION_MAP + expandGrants({ mode })
    thailand-geography.json         ← 77 จังหวัด, 928 อำเภอ, 7436 ตำบล (static import ใน ContactForm)
scripts/
  calling/
    import-member-csv.js            ← cache_pple_member จาก NGS CSV export
    import-act-event-cache.js       ← cache_pple_event (campaign/event) จาก ACT xlsx
    import-calling-xlsx.js          ← calling_logs (+ partial cache_pple_member) จาก xlsx log เดิม
    import-contact-xlsx.js          ← calling_contacts จาก xlsx บริจาค/contact
    seed-contacts.js                ← seed ตัวอย่าง contacts (dev)
    sync-discord-members.js         ← sync guild member → users + org_members
```

---

## Nav — Campaign Selector

`components/Nav.jsx` — calling section มี 5 ลิงก์ (`CALLING_LINKS`): Dashboard (`/calling`), Campaigns (`/calling/campaigns`), Assignee (`/calling/assignee`), Contacts (`/calling/contacts`, hamburger only), Statistics (`/calling/stats`, hamburger only)

"Campaigns" link เป็น split button:

- **กดที่ "Campaigns"** → ไป `/calling/campaigns` (all campaigns list)
- **กดที่ลูกศร ▾** → dropdown รายชื่อ active campaigns → navigate ไป `/calling/assignments/[campaignId]`
- **Mobile hamburger** → Campaigns มี tree expand แสดงรายชื่อ campaigns ใต้
- Fetch จาก `/api/calling/campaigns?active=true` เฉพาะตอนอยู่ใน `/calling/*`
- Campaign ที่ active = ยังไม่ถึง `event_date` (หรือไม่มี event_date)

---

## อนาคต

- **BigQuery:** เมื่อเชื่อมได้ → เปลี่ยน query source ใน `db/calling/members.js` โดยไม่ต้องแตะ schema calling_ tables
- **ACT:** เมื่อได้ API → ดึง activity list มาให้เลือกใน dropdown แทนกรอกเอง schema ไม่ต้องเปลี่ยน
- **Bot integration:** Discord bot ดึงข้อมูลจาก PostgreSQL ตัวเดียวกันได้เลย
