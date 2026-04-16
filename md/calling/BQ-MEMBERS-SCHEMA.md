# bq_members Schema Design

Based on actual data from: `bq_members-example.csv` (2,008 members from ACT)

---

## 📊 Real Data Analysis

**File:** bq_members-example.csv  
**Records:** 2,008 members  
**Columns:** 90+ (from ACT source)  
**Key identifier:** `serial` (maps to member_id)

### Sample Data Structure
```
id: 55 → serial: 6770000001
  name: ลัทธพล ยิ้มละมัย
  gender: ชาย
  phone: 0811492475
  membership_type: สมาชิกตลอดชีพ
  home_province: ราชบุรี
  home_amphure: เมืองราชบุรี
  home_district: เจดีย์หัก
```

---

## 🎯 Optimization Strategy

**Goal:** Fast lookup for Calling & Docs systems

**What to keep:**
- Essential identity (ID, name, phone, gender)
- Location (province, district, subdistrict)
- Contact info (phone, line_id, email, facebook_id)
- Membership info (type, status, dates)
- Address (for document generation)

**What to drop:**
- Payment details (payment_status, payment_type, amount)
- Approval metadata (approved_by, approved_at - for legal, keep minimal)
- Duplicate fields (full_name when we have first/last name)
- Unnecessary personal data (job_position, company, etc - not needed for Calling/Docs)

---

## 📋 Final Schema

```sql
CREATE TABLE bq_members (
  -- IDENTITY (immutable)
  member_id       VARCHAR(20)   PRIMARY KEY,      -- From serial field (6770000001)
  id_card_no      VARCHAR(13)   UNIQUE NULL,      -- Thai ID card number
  
  -- NAME (use components for flexibility)
  prefix          VARCHAR(10)   NULL,             -- นาย/นาง/นางสาว
  first_name      VARCHAR(100)  NOT NULL,
  last_name       VARCHAR(100)  NOT NULL,
  full_name       VARCHAR(200)  GENERATED ALWAYS AS (
    CONCAT(COALESCE(prefix, ''), ' ', first_name, ' ', last_name)
  ) VIRTUAL,
  
  -- DEMOGRAPHICS
  gender          VARCHAR(10)   NULL,             -- ชาย/หญิง
  date_of_birth   DATE          NULL,
  age             INT           GENERATED ALWAYS AS (
    YEAR(CURDATE()) - YEAR(date_of_birth) - 
    (DATE_FORMAT(CURDATE(), '%m%d') < DATE_FORMAT(date_of_birth, '%m%d'))
  ) VIRTUAL,
  
  -- CONTACT
  phone           VARCHAR(20)   NULL,             -- Mobile primary
  line_id         VARCHAR(100)  NULL,             -- LINE UID
  line_username   VARCHAR(100)  NULL,             -- LINE display name (human-readable)
  email           VARCHAR(100)  NULL,
  facebook_id     VARCHAR(100)  NULL,
  
  -- LOCATION
  home_house_no   VARCHAR(50)   NULL,             -- เลขที่
  home_village    VARCHAR(100)  NULL,             -- ชื่อหมู่บ้าน
  home_alley      VARCHAR(100)  NULL,             -- ซอย
  home_road       VARCHAR(100)  NULL,             -- ถนน
  home_subdistrict VARCHAR(100) NULL,             -- ตำบล
  home_district   VARCHAR(100)  NULL,             -- อำเภอ  ← KEY for Calling scope
  home_province   VARCHAR(100)  NOT NULL,         -- จังหวัด ← KEY for all queries
  home_postal_code VARCHAR(5)   NULL,             -- รหัสไปรษณีย์
  
  -- Full address for documents
  home_address    TEXT          GENERATED ALWAYS AS (
    CONCAT_WS(', ',
      home_house_no,
      home_village,
      home_alley,
      home_road,
      home_subdistrict,
      home_district,
      home_province,
      home_postal_code
    )
  ) VIRTUAL,
  
  -- MEMBERSHIP
  membership_type VARCHAR(50)   NULL,             -- สมาชิกตลอดชีพ / สมาชิกรายปี
  card_type       VARCHAR(50)   NULL,             -- DEFAULT, 2025_RECHARGE_LIMITED, etc
  
  -- TIMESTAMPS
  registered_at   DATETIME      NULL,             -- ect_register_date
  approved_at     DATETIME      NULL,             -- When approved
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  synced_at       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- INDEXES (optimize for common queries)
  INDEX idx_province (home_province),
  INDEX idx_district (home_district),
  INDEX idx_name (first_name, last_name),
  INDEX idx_phone (phone),
  INDEX idx_line_id (line_id),
  INDEX idx_id_card (id_card_no),
  INDEX idx_membership (membership_type),
  INDEX idx_created (created_at),
  
  -- COMPOSITE (for calling scope filtering)
  INDEX idx_prov_dist (home_province, home_district)
);
```

---

## 🔄 Import Strategy

### Step 1: Map CSV → SQL

CSV column → SQL column mapping:
```
serial                  → member_id         (PRIMARY KEY)
title                   → prefix
first_name              → first_name
last_name               → last_name
full_name               → (generated from prefix + first + last)
gender                  → gender
date_of_birth           → date_of_birth
identification_number   → id_card_no
mobile_number           → phone
line_id                 → line_id
line_username           → line_username (seems to be "username" not id)
email                   → email
facebook_id             → facebook_id
membership_type         → membership_type
card_type               → card_type
home_house_number       → home_house_no
home_village            → home_village
home_alley              → home_alley
home_road               → home_road
home_district/subdistrict → home_subdistrict
home_amphure            → home_district     (อำเภอ = district)
home_province           → home_province
home_zip_code           → home_postal_code
ect_register_date       → registered_at
approved_at             → approved_at
created_at              → created_at
```

### Step 2: Normalization Rules

```javascript
// Handle dates
date_of_birth: parseDate(row.date_of_birth) || null

// Handle gender
gender: row.gender?.trim() || null

// Handle phone (remove spaces, standardize format)
phone: row.mobile_number?.replace(/\s/g, '') || null

// Handle location (trim whitespace)
home_province: row.home_province?.trim() || null
home_district: row.home_amphure?.trim() || null
home_subdistrict: row.home_district?.trim() || null

// Skip invalid rows
IF member_id IS NULL THEN SKIP
IF first_name IS NULL THEN SKIP
IF home_province IS NULL THEN SKIP
```

### Step 3: Import Flow

```bash
# 1. Run import script (validates + imports in one go)
node scripts/calling/import-members-csv.js /path/to/bq_members-example.csv

# 2. Script outputs statistics during import
# ✓ Reading CSV header...
# 📊 Import Summary:
#   Total rows read:    2,009
#   Valid rows:         2,008
#   Inserted/Updated:   2,008
# ✅ Import complete!

# 3. Verify data in database
mysql> SELECT COUNT(*) FROM bq_members;
mysql> SELECT COUNT(DISTINCT home_province) as provinces FROM bq_members;
mysql> SELECT home_province, COUNT(*) FROM bq_members GROUP BY home_province ORDER BY COUNT(*) DESC;
```

---

## ✅ Verification Queries

After import, verify data:

```sql
-- Total members
SELECT COUNT(*) as total_members FROM bq_members;
-- Expected: 2,008

-- Members by province
SELECT home_province, COUNT(*) as count
FROM bq_members
GROUP BY home_province
ORDER BY count DESC;

-- Members by membership type
SELECT membership_type, COUNT(*) as count
FROM bq_members
GROUP BY membership_type;

-- Members with contact info
SELECT 
  COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as has_phone,
  COUNT(CASE WHEN line_id IS NOT NULL THEN 1 END) as has_line,
  COUNT(CASE WHEN email IS NOT NULL THEN 1 END) as has_email
FROM bq_members;

-- Check for duplicates (by ID card)
SELECT id_card_no, COUNT(*) as count
FROM bq_members
WHERE id_card_no IS NOT NULL
GROUP BY id_card_no
HAVING count > 1;
```

---

## 🔗 Integration with Calling System

### Query: Get members for campaign filtering

```sql
-- Example: Members in ราชบุรี province, ต.ปากท่อ district, Tier A
SELECT
  m.member_id,
  m.full_name,
  m.phone,
  m.line_id,
  m.home_district,
  m.home_province,
  t.tier
FROM bq_members m
LEFT JOIN calling_member_tiers t ON m.member_id = t.member_id
WHERE m.home_province = 'ราชบุรี'
  AND m.home_district = 'ปากท่อ'
  AND (t.tier = 'A' OR t.tier IS NULL)
ORDER BY m.full_name;
```

### Query: Get members for assignment (permission check)

```sql
-- Calling worker scope: ผู้ประสานงานจังหวัด for ราชบุรี
-- Can see all in that province + their assigned districts

SELECT m.*
FROM bq_members m
WHERE m.home_province = 'ราชบุรี'
ORDER BY m.home_district, m.full_name;
```

### Query: Get members for docs signing

```sql
-- Event 101 registrations with member data

SELECT
  r.id as registration_id,
  m.member_id,
  m.full_name,
  m.phone,
  m.home_address,
  m.home_province,
  m.home_district
FROM act_event_registers r
JOIN bq_members m ON r.member_id = m.member_id
WHERE r.event_id = 101
ORDER BY m.home_province, m.home_district, m.full_name;
```

---

## 📝 Notes

- **member_id:** From ACT's `serial` field (unique identifier)
- **Full name:** Computed from prefix + first + last (for flexibility if name updates)
- **Age:** Computed from birth date (always current)
- **Location:** 4-level hierarchy: province → district → subdistrict → house
- **Indexes:** Primary on member_id, then province + district (Calling scope), then name (search)
- **Synced_at:** Tracks last update from ACT API (for sync monitoring)
- **Generated columns:** full_name, home_address, age (MySQL 5.7+)

---

## Storage Estimate

```
2,008 members × ~500 bytes/row ≈ 1 MB
+ indexes ≈ 500 KB
Total: ~1.5 MB (negligible)

Query performance: <10ms for province filter with proper index
```
