# PPLE Docs — E-Signature & Document Management

System for managing legal documents and digital signatures for volunteers and party members to sign activity documents (e.g., fund disbursement forms for election commission).

---

## Overview

### Purpose
- Quick & mobile-friendly document signing
- Preserve member data snapshot on event date (immutable for legal compliance)
- Generate PDF with member info + signature at specified coordinates
- Batch print organized by province/region

### Tech Stack
- **Auth:** Discord OAuth (next-auth, same as Finance/Calling)
- **Identity:** Discord ID (primary), maps to `member_id` via bq_members
- **Database:** MySQL `pple_volunteers` — prefix `docs_`
- **Signature:** HTML Canvas → Base64 → Store in DB
- **PDF Generation:** PDFKit or similar (fill template + coordinates)

---

## 🏗️ Architecture — 3-Layer Schema

### Layer 1: bq_members (Central Cache)
```
~100k members from ACT party system via API
Primary key: member_id
Fields: name, phone, province, district, age, gender, address, ...
```
- Synced daily/nightly from ACT API (via adapter)
- Used for quick search in Calling system
- Referenced by both Calling & Docs

### Layer 2: act_members & act_events (Event Snapshot)
```
act_events
  - event_id (ACT event)
  - name, date, location
  - (other metadata from ACT)

act_event_registers
  - id (unique registration ID from ACT)
  - event_id → FK act_events
  - member_id → FK bq_members
  - registration_data (JSON snapshot at event date)
  - timestamp, user_id, ...
```
- Frozen data on event day (legal immutability)
- Synced from ACT when event is published/locked
- 1 event → many registrations

### Layer 3: docs_signatures & docs_activity_entries (Ops)
```
docs_activity_entries
  - id (document instance)
  - event_id → FK act_events
  - member_id → FK bq_members
  - status: ENUM('pending', 'signed', 'printed', 'rejected')
  - override_data: JSON (corrections made at signing time)
  - signed_by: discord_id
  - signed_at: DATETIME
  - printed_at: DATETIME (NULL if not printed)
  - notes: TEXT

docs_signatures
  - id
  - docs_activity_entry_id → FK
  - signature_base64: LONGTEXT (Canvas image)
  - x_coord, y_coord: INT (where to place signature on PDF)
  - created_at: DATETIME
```
- Lightweight ops layer (signatures in separate table for performance)
- Allow override_data for corrections without touching act_event_registers
- Track full audit trail (signed_by, signed_at, printed_at)

---

## 🔄 Workflow (Expected)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. REGISTRATION & CALLBACK                                  │
├─────────────────────────────────────────────────────────────┤
│ ACT event published
│   → Send callback to Discord with event_id
│   → System snapshots act_event_registers from ACT
│   → Creates docs_activity_entries (status=pending) for each
│
├─────────────────────────────────────────────────────────────┤
│ 2. MAPPING & NOTIFICATION                                   │
├─────────────────────────────────────────────────────────────┤
│ System matches act_userid → discord_id via bq_members
│   → Sends Discord DM or generates signing link
│   → Member receives mobile-friendly link
│
├─────────────────────────────────────────────────────────────┤
│ 3. SIGNING                                                  │
├─────────────────────────────────────────────────────────────┤
│ Member opens link
│   → Reviews data (from act_event_registers snapshot)
│   → Can override fields in override_data (JSON)
│   → Draws signature on Canvas
│   → Submits
│
├─────────────────────────────────────────────────────────────┤
│ 4. GENERATION                                               │
├─────────────────────────────────────────────────────────────┤
│ System merges:
│   - act_event_registers data
│   - override_data
│   - signature_base64 at (x_coord, y_coord)
│   → Generates PDF from template
│   → Stores in storage (S3? Local?)
│
├─────────────────────────────────────────────────────────────┤
│ 5. BATCH PRINTING                                           │
├─────────────────────────────────────────────────────────────┤
│ Admin/ผู้ประสานงานเขต
│   → Select event
│   → Group by province/region (or custom)
│   → Export PDFs (ZIP?)
│   → Send to printer / email
│
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Tables (Outline)

### act_events
```sql
id            INT PRIMARY KEY
act_id        VARCHAR(100) UNIQUE -- Link to ACT system
name          VARCHAR(255)
date          DATE
location      VARCHAR(255)
status        ENUM('draft', 'published', 'locked', 'printed')
created_at    DATETIME
-- Other fields from ACT (optional)
```

### act_event_registers
```sql
id            INT PRIMARY KEY
event_id      INT FK → act_events
member_id     VARCHAR(20) FK → bq_members
registration_data JSON -- Full snapshot at registration time
timestamp     DATETIME
act_user_id   VARCHAR(100) -- From ACT
act_ref_id    INT -- ACT's unique registration ID
-- ...other fields from act_event_register.xlsx
```

### docs_activity_entries
```sql
id            INT PRIMARY KEY
event_id      INT FK → act_events
member_id     VARCHAR(20) FK → bq_members
status        ENUM('pending', 'signed', 'printed', 'rejected')
override_data JSON -- Corrections made during signing
signed_by     VARCHAR(20) -- discord_id
signed_at     DATETIME NULL
printed_at    DATETIME NULL
pdf_url       TEXT -- Link to generated PDF (S3/local)
notes         TEXT
created_at    DATETIME
updated_at    DATETIME ON UPDATE CURRENT_TIMESTAMP
```

### docs_signatures
```sql
id            INT PRIMARY KEY
entry_id      INT FK → docs_activity_entries
signature_base64 LONGTEXT -- Canvas image in Base64
x_coord       INT -- Position on PDF template
y_coord       INT
created_at    DATETIME
```

---

## 🔗 Integration Points

### With PPLE Calling
- Both use `bq_members` for member identity
- Calling campaigns can link to ACT events (via `act_id` in calling_campaigns)
- Potentially: Call members before they sign docs? (workflow TBD)

### With ACT System
- **Adapter Pattern:** `services/act-adapter.js` fetches via API
  - Pull event metadata
  - Pull registration data (act_event_registers)
  - Normalize → cache in local tables
- **One-way sync:** ACT → Our DB (not bidirectional)
- **Future:** Real-time sync via webhooks or polling

### With bq_members
- Join on `member_id` for name, phone, address
- Use bq_members as identity bridge (bq_members.member_id = act_event_registers.member_id)

---

## ❓ Questions to Clarify

**Missing Info:**
- [ ] ACT has actual API? Which endpoints?
- [ ] ACT schema for events & registrations?
- [ ] How often does member data change in ACT?
- [ ] Is there a PDF template already? Where stored?
- [ ] Who has permission to create/publish documents? (RBAC TBD)
- [ ] PDF coordinate mapping — manual or auto-detect fields?
- [ ] Storage for PDFs — S3, local filesystem, database?
- [ ] How to handle errors in signature/generation?

---

## 🚀 Next Actions (Development Priority)

- [ ] Schema finalization (wait for ACT schema)
- [ ] ACT adapter setup (fetch events & registrations via API)
- [ ] PDF template management UI (admin sets field coordinates)
- [ ] Mobile signature component (Canvas + Base64)
- [ ] Document generation pipeline
- [ ] RBAC for document management (TBD with product)
- [ ] Batch printing & export

---

## Permission (TBD)

Document management permissions not yet defined. Will be added after clarification with product team.

---

## See Also

- [md/DATABASE.md](DATABASE.md) — Full schema when finalized
- [md/CALLING.md](CALLING.md) — Related system using bq_members
- [md/BOT.md](BOT.md) — Bot side (Discord integration)
- [md/DEPLOYMENT.md](DEPLOYMENT.md) — Production setup
