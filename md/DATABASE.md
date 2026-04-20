# Database Schema — pple_volunteers

MySQL database supporting Discord bot + Finance + Calling systems.

**Host:** localhost  
**User:** pple_dcbot  
**Database:** pple_volunteers

---

## Conventions

- `guild_id VARCHAR(20)` — multi-server support, always filter by it
- `discord_id VARCHAR(20)` — Discord user ID (snowflake)
- **Always check `db/` files first** before assuming column names
- Calling tables: `campaign_id = 0` = "Undefined" (no specific campaign)

---

## Bot Tables (prefix `dc_`)

### dc_members

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20) NOT NULL
discord_id      VARCHAR(20) NOT NULL
username        VARCHAR(100)              -- Discord username
display_name    VARCHAR(100) NULL         -- member.displayName (server nick → global name → username)
nickname        VARCHAR(100) NULL         -- self-reported ชื่อเล่น จาก register form
firstname       VARCHAR(100) NULL
lastname        VARCHAR(100) NULL
member_id       VARCHAR(50)  NULL         -- Party member ID
specialty       VARCHAR(100) NULL
amphoe          VARCHAR(100) NULL
province        VARCHAR(100) NULL         -- derived จาก PROVINCE_ROLES
region          VARCHAR(100) NULL
roles           TEXT         NULL         -- comma-separated role names
interests       TEXT         NULL         -- comma-separated interest/skill roles
referred_by     VARCHAR(100) NULL
phone           VARCHAR(20)  NULL
line_id         VARCHAR(100) NULL
google_id       VARCHAR(100) NULL
activity_score  INT DEFAULT 0
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_discord (guild_id, discord_id)
```

> `display_name` sync อัตโนมัติเมื่อ `guildMemberAdd` / `guildMemberUpdate`  
> sync ครั้งแรกด้วย `node scripts/sync-discord-members.js`

### dc_activity_daily

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
discord_id      VARCHAR(20)
date            DATE
message_count   INT DEFAULT 0
voice_seconds   INT DEFAULT 0
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_daily (guild_id, discord_id, date)
```

### dc_activity_mentions

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
mention_from    VARCHAR(20)
mention_to      VARCHAR(20)
count           INT DEFAULT 0
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
```

> Score = `messages × 10 + voice_seconds + mentions × 30`

### dc_ratings

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
rated_user      VARCHAR(20)
rating_user     VARCHAR(20)
score           INT         -- 1–5
comment         TEXT
date            DATE
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_rating (guild_id, rated_user, rating_user, date)
```

### dc_settings

```sql
guild_id              VARCHAR(20) PRIMARY KEY
log_channel_id        VARCHAR(20)
activity_threshold    INT DEFAULT 10
updated_at            DATETIME
created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
```

### dc_orgchart_config

```sql
guild_id        VARCHAR(20) PRIMARY KEY
config_data     JSON
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
```

### dc_forum_config

```sql
guild_id          VARCHAR(20)
channel_id        VARCHAR(20)
dashboard_msg_id  VARCHAR(20)   -- Dashboard thread ID
items_per_page    INT DEFAULT 10
updated_at        DATETIME
created_at        DATETIME DEFAULT CURRENT_TIMESTAMP

PRIMARY KEY (guild_id, channel_id)
```

### dc_forum_posts

```sql
id               INT AUTO_INCREMENT PRIMARY KEY
guild_id         VARCHAR(20)
channel_id       VARCHAR(20)
post_id          VARCHAR(20)     -- Thread ID
post_name        VARCHAR(255)
post_url         TEXT
content_snippet  TEXT
creator_id       VARCHAR(20)
created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at       DATETIME

UNIQUE KEY uq_post (guild_id, post_id)
INDEX idx_name (guild_id, post_name)
```

---

## Finance Tables (prefix `finance_`)

### finance_accounts

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
owner_id        VARCHAR(20)       -- Discord user ID
name            VARCHAR(100)
bank            VARCHAR(50)
account_no      VARCHAR(50)
type            ENUM('personal','organization')
visibility      ENUM('private','internal','public')
notify_income   TINYINT DEFAULT 1
notify_expense  TINYINT DEFAULT 1
email_inbox     VARCHAR(100)
thread_id       VARCHAR(20)
usage_count     INT DEFAULT 0
updated_by      VARCHAR(20)
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

INDEX idx_owner (guild_id, owner_id)
INDEX idx_usage (guild_id, usage_count DESC)
```

### finance_transactions

```sql
id                  INT AUTO_INCREMENT PRIMARY KEY
guild_id            VARCHAR(20)
account_id          INT               -- FK → finance_accounts
type                ENUM('income','expense')
amount              DECIMAL(12,2)
description         VARCHAR(255)
category_id         INT NULL          -- FK → finance_categories
counterpart_name    VARCHAR(255)
counterpart_account VARCHAR(100)
counterpart_bank    VARCHAR(100)
fee                 DECIMAL(12,2)
balance_after       DECIMAL(12,2)
evidence_url        TEXT
ref_id              VARCHAR(100)
discord_msg_id      VARCHAR(20)
txn_at              DATETIME
updated_by          VARCHAR(20)
updated_at          DATETIME
created_at          DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_ref (ref_id, account_id)
INDEX idx_account (account_id)
INDEX idx_date (txn_at DESC)
```

### finance_categories

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20) NULL  -- NULL = global
name            VARCHAR(100)
is_global       TINYINT DEFAULT 0
usage_count     INT DEFAULT 0
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_name (guild_id, name)
```

### finance_account_rules

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
account_id      INT               -- FK → finance_accounts
match_name      VARCHAR(255)
category_id     INT               -- FK → finance_categories
usage_count     INT DEFAULT 0
updated_at      DATETIME

INDEX idx_account (account_id)
```

### finance_config

```sql
guild_id          VARCHAR(20) PRIMARY KEY
channel_id        VARCHAR(20)
thread_id         VARCHAR(20)
dashboard_msg_id  VARCHAR(20)
updated_at        DATETIME

INDEX idx_channel (channel_id)
```

---

## Calling Tables

### ngs_member_cache

Party member data synced from NGS (party system). **ห้ามแก้โดยตรง** — sync ผ่าน `scripts/calling/import-ngs-member-cache.js`

```sql
source_id       INT PRIMARY KEY           -- id จาก ngs_member (ใช้เป็น member_id ใน calling_*)
serial          VARCHAR(20) NULL          -- หมายเลขสมาชิก (display only)
title           VARCHAR(20) NULL
first_name      VARCHAR(100) NOT NULL
last_name       VARCHAR(100) NOT NULL
full_name       VARCHAR(200) NULL
gender          VARCHAR(10) NULL
date_of_birth   DATE NULL
identification_number VARCHAR(20) NULL

-- Contact
mobile_number   VARCHAR(20) NULL
email           VARCHAR(150) NULL
line_id         VARCHAR(100) NULL

-- Home address (used for province/district filtering)
home_district   VARCHAR(100) NULL         -- ตำบล
home_amphure    VARCHAR(100) NULL         -- อำเภอ ← ใช้บ่อย
home_province   VARCHAR(100) NULL         -- จังหวัด ← ใช้บ่อย
home_zip_code   VARCHAR(10) NULL

-- Membership
membership_type VARCHAR(50) NULL
latest_state    VARCHAR(50) NULL
expired_at      DATETIME NULL

-- Sync
synced_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

INDEX idx_home_province (home_province)
INDEX idx_home_amphure  (home_amphure)
INDEX idx_mobile        (mobile_number)
```

> มี ~100 columns ทั้งหมด ดู schema เต็มใน `scripts/calling/migration-ngs-member-cache.sql`

### act_event_cache

Events จาก ACT system (WordPress-based). ใช้แทน calling_campaigns.

```sql
id          INT AUTO_INCREMENT PRIMARY KEY
parent_id   INT NULL
guild_id    VARCHAR(20) NOT NULL DEFAULT '1'
type        ENUM('campaign','register') NOT NULL

-- Campaign fields (type='campaign')
name        VARCHAR(255)
province    VARCHAR(100)
description TEXT

-- Registration fields (type='register')
user_id     INT NULL
first_name  VARCHAR(100) NULL
last_name   VARCHAR(100) NULL
phone       VARCHAR(20) NULL

-- Cache metadata
data_hash   VARCHAR(64)
synced_at   TIMESTAMP
created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

INDEX idx_parent (parent_id)
INDEX idx_type   (type)
```

> `id = 0` = "Undefined" campaign (catch-all สำหรับ log ที่ไม่ผูก campaign)  
> `calling_*.campaign_id` → FK ชี้ที่ `act_event_cache.id` WHERE `type = 'campaign'`

### calling_assignments

```sql
id            INT AUTO_INCREMENT PRIMARY KEY
campaign_id   INT NOT NULL              -- act_event_cache.id (0 = Undefined)
member_id     INT NOT NULL              -- ngs_member_cache.source_id
assigned_to   VARCHAR(20) NOT NULL      -- discord_id
assigned_by   VARCHAR(20) NOT NULL      -- discord_id
created_at    DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_campaign_member (campaign_id, member_id)
```

### calling_logs

```sql
id               INT AUTO_INCREMENT PRIMARY KEY
campaign_id      INT NOT NULL              -- act_event_cache.id (0 = Undefined)
member_id        INT NOT NULL              -- ngs_member_cache.source_id
called_by        VARCHAR(20) NULL          -- discord_id (NULL ถ้า import จาก XLS)
caller_name      VARCHAR(100) NULL         -- display_name ขณะโทร
called_at        DATETIME DEFAULT CURRENT_TIMESTAMP
status           ENUM('answered','no_answer','busy','wrong_number') NOT NULL
sig_overall      TINYINT NULL              -- 1=D 2=C 3=B 4=A
sig_location     TINYINT NULL              -- 1=ต่างประเทศ … 4=ในอำเภอ
sig_availability TINYINT NULL              -- 1=ไม่ว่างเลย … 4=ว่างมาก
sig_interest     TINYINT NULL              -- 1=ไม่สนใจ … 4=กระตือรือร้น
sig_reachable    TINYINT NULL              -- 1=ไม่ติดเลย … 4=รับสายทันที
note             TEXT NULL
extra            JSON NULL
created_at       DATETIME DEFAULT CURRENT_TIMESTAMP

INDEX idx_campaign (campaign_id)
INDEX idx_member   (member_id)
```

> signals กรอกเฉพาะ `status = 'answered'`  
> `sig_overall` required เมื่อ answered, ที่เหลือ optional

### calling_member_tiers

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
member_id       INT NOT NULL              -- ngs_member_cache.source_id
tier            ENUM('A','B','C','D') NOT NULL
tier_source     ENUM('auto','manual') NOT NULL DEFAULT 'auto'
override_by     VARCHAR(20) NULL          -- discord_id (manual เท่านั้น)
override_reason TEXT NULL
custom_fields   JSON NULL
updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

UNIQUE KEY uq_member (member_id)
```

> คำนวณ tier อัตโนมัติจาก `sig_overall` เฉลี่ยทุก answered call  
> A ≥ 3.5 / B ≥ 2.5 / C ≥ 1.5 / D < 1.5

---

## Backups

Backups stored in `/backups/`. Production backups automated via cron.
