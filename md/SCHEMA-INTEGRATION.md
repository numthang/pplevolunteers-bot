# Schema Integration — 3 Systems (Calling + Docs + ACT)

**Comprehensive schema design showing how PPLE Calling, PPLE Docs, and ACT system work together.**

---

## 🏗️ Architectural Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: CENTRAL IDENTITY CACHE                                 │
├─────────────────────────────────────────────────────────────────┤
│ bq_members  (100k party members synced from ACT)                 │
│   PK: member_id                                                  │
│   Fields: name, phone, province, district, age, gender, etc     │
│   Sync: Daily via services/act-adapter.js                        │
└─────────────────────────────────────────────────────────────────┘
         ↑                              ↑                    ↑
         │                              │                    │
    (join on member_id everywhere)     │                    │
         │                              │                    │
┌────────┴──────┐          ┌───────────┴──────┐      ┌──────┴──────┐
│ LAYER 2: ACT  │          │ LAYER 3: CALLING │      │ LAYER 3: DOCS
├───────────────┤          ├────────────────────┤     ├──────────────┤
│ EVENT SNAPSHOT│          │ OPERATIONS        │     │ OPERATIONS   │
└───────┬───────┘          └────────────────────┘     └──────────────┘
```

---

## 📊 Complete Schema Map

### LAYER 1: bq_members (Central Cache)

```sql
CREATE TABLE bq_members (
  member_id       VARCHAR(20)   PRIMARY KEY,     -- Party member ID
  prefix          VARCHAR(20)   NULL,            -- นาย/นาง/นางสาว
  name            VARCHAR(200)  NOT NULL,
  member_type     VARCHAR(50)   NULL,            -- รายปี / ตลอดชีพ
  district        VARCHAR(100)  NULL,
  subdistrict     VARCHAR(100)  NULL,
  province        VARCHAR(100)  NOT NULL,
  phone           VARCHAR(20)   NULL,
  line_id         VARCHAR(100)  NULL,
  line_username   VARCHAR(100)  NULL,
  age             INT           NULL,
  gender          VARCHAR(10)   NULL,            -- ชาย/หญิง
  id_card_no      VARCHAR(13)   UNIQUE NULL,
  address         TEXT          NULL,
  postal_code     VARCHAR(5)    NULL,
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_province (province),
  INDEX idx_district (district),
  INDEX idx_name (name)
);
```

**Purpose:** Fast lookup for both Calling & Docs  
**Sync:** Daily from ACT API via `services/act-adapter.js`

---

### LAYER 2a: ACT Event Tables (Snapshot)

```sql
CREATE TABLE act_events (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  act_id          VARCHAR(100)  UNIQUE NOT NULL, -- ACT system event ID
  name            VARCHAR(255)  NOT NULL,        -- Event name
  date            DATE          NOT NULL,
  location        VARCHAR(255)  NULL,
  status          ENUM(
    'draft',      -- Being prepared
    'published',  -- Registrations open
    'locked',     -- Registrations closed, snapshot frozen
    'printed'     -- Documents printed
  ) DEFAULT 'draft',
  template_id     INT           NULL,            -- Link to PDF template
  created_by      VARCHAR(20)   NULL,            -- discord_id
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_act_id (act_id),
  INDEX idx_date (date),
  INDEX idx_status (status)
);
```

**Purpose:** Event metadata (when are signatures due, etc)  
**Data Flow:** ACT → Adapter → act_events

---

```sql
CREATE TABLE act_event_registers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  event_id        INT           NOT NULL,        -- FK → act_events
  member_id       VARCHAR(20)   NOT NULL,        -- FK → bq_members
  
  -- Snapshot data (frozen when event locks)
  registration_data JSON        NOT NULL,        -- Full member data at registration time
  -- Contains: name, phone, address, age, gender, district, etc as registered
  
  -- Metadata
  act_ref_id      INT           UNIQUE,          -- ACT's registration ID (146356, etc)
  act_user_id     VARCHAR(100)  NULL,            -- ACT user ID (17233, etc)
  timestamp       DATETIME      NOT NULL,        -- When registered in ACT
  
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints & Indexes
  UNIQUE KEY uq_event_member (event_id, member_id),
  FOREIGN KEY (event_id) REFERENCES act_events(id),
  FOREIGN KEY (member_id) REFERENCES bq_members(member_id),
  INDEX idx_event (event_id),
  INDEX idx_member (member_id)
);
```

**Purpose:** Who registered for what event (snapshot)  
**Data Flow:** ACT → Adapter → act_event_registers (when event locks)  
**Why snapshot?** Legal immutability - preserve exact data signed on

---

### LAYER 3a: PPLE Calling Tables (Existing)

```sql
CREATE TABLE calling_campaigns (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(200)  NOT NULL,
  description     TEXT          NULL,
  province        VARCHAR(100)  NULL,
  act_id          VARCHAR(100)  NULL,            -- OPTIONAL: Link to act_events(act_id)
  created_by      VARCHAR(20)   NOT NULL,        -- discord_id
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_province (province),
  INDEX idx_act_id (act_id)
);
```

**Purpose:** Calling campaign metadata  
**Relation:** 1 campaign may be tied to 1 ACT event (optional, TBD)

---

```sql
CREATE TABLE calling_assignments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id     INT           NOT NULL,        -- FK → calling_campaigns
  member_id       VARCHAR(20)   NOT NULL,        -- FK → bq_members
  assigned_to     VARCHAR(20)   NOT NULL,        -- discord_id (caller)
  assigned_by     VARCHAR(20)   NOT NULL,        -- discord_id (who assigned)
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY uq_campaign_member (campaign_id, member_id),
  FOREIGN KEY (campaign_id) REFERENCES calling_campaigns(id),
  FOREIGN KEY (member_id) REFERENCES bq_members(member_id),
  INDEX idx_assigned_to (assigned_to)
);
```

**Purpose:** Map caller → members to call  
**Permission:** Scoped by role (admin → all, regional → in-region, etc)

---

```sql
CREATE TABLE calling_logs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id     INT           NOT NULL,        -- FK → calling_campaigns
  member_id       VARCHAR(20)   NOT NULL,        -- FK → bq_members
  called_by       VARCHAR(20)   NULL,            -- discord_id (can be NULL if import)
  caller_name     VARCHAR(100)  NULL,            -- Display name at time of call
  called_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  status          ENUM(
    'answered',
    'no_answer',
    'busy',
    'wrong_number'
  ) NOT NULL,
  
  -- Signals (only if status = answered)
  sig_location    TINYINT       NULL,            -- 1=abroad, 2=other prov, 3=same prov, 4=same dist
  sig_availability TINYINT      NULL,            -- 1=none, 2=low, 3=some, 4=lots
  sig_interest    TINYINT       NULL,            -- 1=no, 2=low, 3=yes, 4=very much
  sig_reachable   TINYINT       NULL,            -- 1=never, 2=hard, 3=yes, 4=very easy
  
  note            TEXT          NULL,
  extra           JSON          NULL,            -- Custom fields
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (campaign_id) REFERENCES calling_campaigns(id),
  FOREIGN KEY (member_id) REFERENCES bq_members(member_id),
  INDEX idx_member (member_id),
  INDEX idx_campaign (campaign_id),
  INDEX idx_date (called_at)
);
```

**Purpose:** Log each call attempt  
**Data:** Signals + notes → calculate tier

---

```sql
CREATE TABLE calling_member_tiers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  member_id       VARCHAR(20)   NOT NULL UNIQUE, -- FK → bq_members
  tier            ENUM('A','B','C','D') NOT NULL,
  tier_source     ENUM('auto', 'manual') NOT NULL DEFAULT 'auto',
  override_by     VARCHAR(20)   NULL,            -- discord_id (if manual)
  override_reason TEXT          NULL,
  custom_fields   JSON          NULL,
  updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (member_id) REFERENCES bq_members(member_id),
  INDEX idx_member (member_id),
  INDEX idx_tier (tier)
);
```

**Purpose:** Tier classification (A/B/C/D based on signals)  
**Calculation:** Auto from avg signals, or manual override by caller

---

### LAYER 3b: PPLE Docs Tables (New)

```sql
CREATE TABLE docs_templates (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255)  NOT NULL,
  description     TEXT          NULL,
  event_id        INT           NULL,            -- FK → act_events (optional)
  pdf_file_path   VARCHAR(255)  NOT NULL,        -- Path to base PDF
  created_by      VARCHAR(20)   NOT NULL,        -- discord_id
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_event (event_id)
);
```

**Purpose:** PDF template library (base file + field definitions)  
**Fields:** Where to put: name, address, signature, etc (coordinates)

---

```sql
CREATE TABLE docs_template_fields (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  template_id     INT           NOT NULL,        -- FK → docs_templates
  field_name      VARCHAR(100)  NOT NULL,        -- e.g., "signature", "member_name"
  x_coord         INT           NOT NULL,        -- Position on PDF
  y_coord         INT           NOT NULL,
  width           INT           NULL,            -- Optional dimensions
  height          INT           NULL,
  data_source     VARCHAR(255)  NOT NULL,        -- Where to get data
                                                 -- e.g., "registration_data.name",
                                                 -- "override_data.address",
                                                 -- "signature"
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (template_id) REFERENCES docs_templates(id),
  INDEX idx_template (template_id)
);
```

**Purpose:** Define field locations on PDF  
**Example:**
```
template_id=1, field_name="signature", x_coord=100, y_coord=500,
data_source="signature"
```

---

```sql
CREATE TABLE docs_activity_entries (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  event_id        INT           NOT NULL,        -- FK → act_events
  member_id       VARCHAR(20)   NOT NULL,        -- FK → bq_members
  
  status          ENUM(
    'pending',      -- Waiting for signature
    'signed',       -- Signature collected
    'rejected',     -- Member refused
    'printed'       -- Document printed
  ) DEFAULT 'pending',
  
  -- Member data used for this document
  registration_data JSON        NULL,            -- Copy from act_event_registers
  override_data   JSON          NULL,            -- Corrections made during signing
                                                 -- e.g., {"address": "new address"}
  
  -- Signature info
  signed_by       VARCHAR(20)   NULL,            -- discord_id
  signed_at       DATETIME      NULL,
  
  -- Audit trail
  printed_at      DATETIME      NULL,
  pdf_url         VARCHAR(255)  NULL,            -- Link to generated PDF
  notes           TEXT          NULL,
  
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (event_id) REFERENCES act_events(id),
  FOREIGN KEY (member_id) REFERENCES bq_members(member_id),
  UNIQUE KEY uq_event_member (event_id, member_id),
  INDEX idx_event (event_id),
  INDEX idx_member (member_id),
  INDEX idx_status (status),
  INDEX idx_signed_at (signed_at)
);
```

**Purpose:** Track document signing status for each member  
**Key insight:** Keeps override_data separate from immutable act_event_registers

---

```sql
CREATE TABLE docs_signatures (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  entry_id        INT           NOT NULL UNIQUE, -- FK → docs_activity_entries
  
  signature_base64 LONGTEXT     NOT NULL,        -- Canvas image encoded as Base64
  
  -- Coordinate on PDF where signature goes
  x_coord         INT           NOT NULL,
  y_coord         INT           NOT NULL,
  
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (entry_id) REFERENCES docs_activity_entries(id),
  INDEX idx_entry (entry_id)
);
```

**Purpose:** Store signatures separately (performance + reusability)  
**Why separate table?** Base64 is large; might retrieve entry without signature frequently

---

## 🔄 Data Flow Diagram

```
EXTERNAL ACT SYSTEM
│
├─ Events (101, 102, ...)
├─ Members (~100k)
└─ Event Registrations (81 per event)
│
│ API Call (daily)
│
├─→ services/act-adapter.js
│   │ Normalize & validate
│   │
│   ├─→ bq_members (upsert 100k)
│   ├─→ act_events (new/update events)
│   └─→ act_event_registers (snapshot when event locks)
│
└─ MySQL pple_volunteers database
   │
   ├─ PPLE CALLING (worker flow)
   │  │
   │  ├─ Pick campaign
   │  │
   │  ├─ Get member list from bq_members
   │  │  (+ assignment + tier from calling_*)
   │  │
   │  ├─ Call → Log signal → Update tier
   │  │
   │  └─ calling_logs, calling_member_tiers updated
   │
   └─ PPLE DOCS (signing flow)
      │
      ├─ Event published → act_events status = 'published'
      │
      ├─ Members register → act_event_registers populated
      │
      ├─ Event locked → act_events status = 'locked'
      │  (snapshot frozen, can't change member data anymore)
      │
      ├─ Create docs → docs_activity_entries (status='pending')
      │  for each member who registered
      │
      ├─ Member signs
      │  │
      │  ├─ Review data (from act_event_registers)
      │  ├─ Can override fields → override_data JSON
      │  ├─ Draw signature → Canvas → Base64
      │  │
      │  └─ Save: docs_signatures + docs_activity_entries update
      │
      └─ Admin prints
         │
         ├─ Generate PDF (merge:
         │  - registration_data from act_event_registers
         │  - override_data from docs_activity_entries
         │  - signature from docs_signatures
         │  at coordinates from docs_template_fields)
         │
         ├─ Store PDF (S3 or local)
         │
         └─ docs_activity_entries.printed_at = now()
```

---

## 🔗 Foreign Key Relationships

```
bq_members (identity cache, central point)
    ↑
    ├─ called from: calling_assignments.member_id
    ├─ called from: calling_logs.member_id
    ├─ called from: calling_member_tiers.member_id
    ├─ called from: act_event_registers.member_id
    └─ called from: docs_activity_entries.member_id

act_events (event metadata)
    ↑
    ├─ referenced by: act_event_registers.event_id
    ├─ referenced by: calling_campaigns.act_id (optional)
    ├─ referenced by: docs_templates.event_id (optional)
    └─ referenced by: docs_activity_entries.event_id

act_event_registers (immutable snapshot)
    │ Data copied to:
    └─ docs_activity_entries.registration_data (JSON)

docs_templates (PDF layouts)
    │ Field definitions:
    └─ docs_template_fields (coordinates + data mapping)
       │ Data merged from:
       ├─ docs_activity_entries.registration_data
       ├─ docs_activity_entries.override_data
       └─ docs_signatures.signature_base64
       │ Produces:
       └─ Generated PDF (stored at docs_activity_entries.pdf_url)
```

---

## 🎯 Query Examples

### Example 1: Get all members registered for event 101

```sql
SELECT
  r.*,
  m.phone,
  m.line_id,
  m.province
FROM act_event_registers r
JOIN bq_members m ON r.member_id = m.member_id
WHERE r.event_id = 101;
```

### Example 2: Get signing status for event 101, group by province

```sql
SELECT
  m.province,
  COUNT(*) as total_registered,
  SUM(CASE WHEN d.status = 'signed' THEN 1 ELSE 0 END) as signed_count,
  SUM(CASE WHEN d.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
  SUM(CASE WHEN d.status = 'printed' THEN 1 ELSE 0 END) as printed_count
FROM act_event_registers r
JOIN docs_activity_entries d ON r.event_id = d.event_id AND r.member_id = d.member_id
JOIN bq_members m ON r.member_id = m.member_id
WHERE r.event_id = 101
GROUP BY m.province
ORDER BY m.province;
```

### Example 3: Member's calling history + tier

```sql
SELECT
  m.name,
  m.phone,
  t.tier,
  COUNT(l.id) as total_calls,
  SUM(CASE WHEN l.status = 'answered' THEN 1 ELSE 0 END) as answered_calls,
  MAX(l.called_at) as last_called
FROM bq_members m
LEFT JOIN calling_member_tiers t ON m.member_id = t.member_id
LEFT JOIN calling_logs l ON m.member_id = l.member_id
WHERE m.province = 'ราชบุรี'
GROUP BY m.member_id
ORDER BY t.tier ASC, answered_calls DESC;
```

### Example 4: Prepare batch print (event 101, ชลบุรี province)

```sql
SELECT
  d.id,
  r.registration_data,
  d.override_data,
  s.signature_base64,
  m.province,
  m.district
FROM docs_activity_entries d
JOIN act_event_registers r ON d.event_id = r.event_id AND d.member_id = r.member_id
JOIN docs_signatures s ON d.id = s.entry_id
JOIN bq_members m ON d.member_id = m.member_id
WHERE d.event_id = 101
  AND m.province = 'ชลบุรี'
  AND d.status = 'signed'
ORDER BY m.district, r.registration_data->>'$.name';
```

---

## 🚀 Workflow Summary

### Calling System Workflow
```
1. Admin creates campaign
2. System fetches members from bq_members
3. Admin assigns members to callers
4. Caller calls member, logs status + signals
5. System auto-calculates tier from signals
```

### Docs System Workflow
```
1. ACT event created + registrations open
2. Adapter syncs: ACT → act_events + act_event_registers
3. Admin publishes event → status = 'published'
4. Members register in ACT
5. Admin locks event → status = 'locked' (snapshot frozen)
6. System creates docs_activity_entries (pending)
7. Member signs via mobile link
   - Reviews data (from registration_data)
   - Can correct → override_data
   - Draws signature → Base64
   - docs_activity_entries.status = 'signed'
8. Admin batches print → Generate PDFs
   - Merge registration_data + override_data + signature
   - Save PDF, update printed_at
```

### Integration Points
```
✓ Calling.bq_members = Docs.bq_members (same cache)
✓ Calling.calling_campaigns.act_id → Docs.act_events.act_id (optional link)
✓ Both systems respect same role hierarchy
✓ Both use member_id as universal identifier
```

---

## 📝 Notes

- **bq_members syncs daily** (cron job via adapter)
- **act_event_registers snapshots on event lock** (immutable for legal compliance)
- **docs_activity_entries override_data lets corrections without changing snapshot**
- **Calling tier auto-calculated from signals** (can be manually overridden)
- **All dates/times in UTC recommended**, but app can use local in UI
