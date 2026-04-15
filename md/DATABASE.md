# Database Schema — pple_volunteers

MySQL database supporting multi-guild Discord bot + Finance system.

**Host:** localhost  
**User:** pple_dcbot  
**Database:** pple_volunteers

---

## Conventions

- **Every table has `guild_id` (VARCHAR 20)** for multi-server support
- **Never use `LIMIT ?` in prepared statements** → use `LIMIT ${n}` instead
- **Always check `db/` files first** before assuming column names

---

## Bot Tables (prefix `dc_`)

### dc_members

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20) NOT NULL
discord_id      VARCHAR(20) NOT NULL
username        VARCHAR(100)
member_id       VARCHAR(50)        -- Party member ID
phone           VARCHAR(20)
line_id         VARCHAR(50)
google_id       VARCHAR(100)
act_id          VARCHAR(100)
province        VARCHAR(100)
role_main       VARCHAR(100)       -- Main role
role_sub        VARCHAR(100)       -- Sub role
activity_score  INT DEFAULT 0
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_discord (guild_id, discord_id)
```

### dc_activity_daily

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
discord_id      VARCHAR(20)
date            DATE
message_count   INT DEFAULT 0
voice_seconds   INT DEFAULT 0      -- Total voice time
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_daily (guild_id, discord_id, date)
```

### dc_activity_mentions

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
mention_from    VARCHAR(20)        -- Who mentioned
mention_to      VARCHAR(20)        -- Who was mentioned
count           INT DEFAULT 0
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
```

### dc_ratings

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
rated_user      VARCHAR(20)
rating_user     VARCHAR(20)        -- Who gave the rating
score           INT (1-5)
comment         TEXT
date            DATE
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_rating (guild_id, rated_user, rating_user, date)
```

### dc_settings

```sql
guild_id        VARCHAR(20) PRIMARY KEY
log_channel_id  VARCHAR(20)
activity_threshold INT DEFAULT 10
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
```

### dc_orgchart_config

```sql
guild_id        VARCHAR(20) PRIMARY KEY
config_data     JSON               -- Org structure JSON
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
```

### dc_forum_config

```sql
guild_id        VARCHAR(20)
channel_id      VARCHAR(20)        -- Forum channel
dashboard_msg_id VARCHAR(20)       -- Dashboard thread ID (not message ID)
items_per_page  INT DEFAULT 10
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

PRIMARY KEY (guild_id, channel_id)
```

### dc_forum_posts

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
channel_id      VARCHAR(20)
post_id         VARCHAR(20)        -- Thread ID
post_name       VARCHAR(255)
post_url        TEXT
content_snippet TEXT
creator_id      VARCHAR(20)
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at      DATETIME

UNIQUE KEY uq_post (guild_id, post_id)
INDEX idx_name (guild_id, post_name)
```

### dc_calling_campaigns

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guid_id         VARCHAR(20)
name            VARCHAR(255)
email_address   VARCHAR(100)       -- Email to monitor
imap_host       VARCHAR(100)
imap_user       VARCHAR(100)
imap_pass       VARCHAR(255)       -- Encrypted
folder_name     VARCHAR(100)
from_filter     VARCHAR(255)
subject_filter  VARCHAR(255)
regex_pattern   VARCHAR(500)
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
updated_at      DATETIME
```

### dc_calling_logs

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
campaign_id     INT
phone           VARCHAR(20)
email_subject   VARCHAR(255)
email_body      TEXT
parsed_data     JSON               -- Extracted fields
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
```

### dc_reports

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
report_type     VARCHAR(50)
report_data     JSON
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
```

---

## Finance Tables (prefix `finance_`)

### finance_accounts

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
owner_id        VARCHAR(20)        -- Discord user ID
name            VARCHAR(100)
bank            VARCHAR(50)        -- Bank name (KBank, SCB, etc)
account_no      VARCHAR(50)        -- For matching slip/email
type            ENUM('personal','organization')
visibility      ENUM('private','internal','public')
notify_income   TINYINT DEFAULT 1
notify_expense  TINYINT DEFAULT 1
email_inbox     VARCHAR(100)       -- Email forwarded from
thread_id       VARCHAR(20)        -- Discord thread (optional)
usage_count     INT DEFAULT 0      -- Sort by frequency
updated_by      VARCHAR(20)
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

INDEX idx_owner (guild_id, owner_id)
INDEX idx_usage (guild_id, usage_count DESC)
```

### finance_transactions

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)
account_id      INT                -- FK → finance_accounts
type            ENUM('income','expense')
amount          DECIMAL(12,2)
description     VARCHAR(255)
category_id     INT                -- FK → finance_categories (nullable)
source          VARCHAR(255)       -- 'email', 'manual', 'slip', etc
evidence_url    TEXT               -- Slip photo URL
ref_id          VARCHAR(100)       -- Transaction reference
discord_msg_id  VARCHAR(20)        -- Discord message link
txn_at          DATETIME           -- Transaction date
updated_by      VARCHAR(20)
updated_at      DATETIME
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_ref (ref_id)
INDEX idx_account (account_id)
INDEX idx_date (txn_at DESC)
```

### finance_categories

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
guild_id        VARCHAR(20)        -- NULL = global category
name            VARCHAR(100)
is_global       TINYINT DEFAULT 0
usage_count     INT DEFAULT 0
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP

UNIQUE KEY uq_name (guild_id, name)
```

### finance_account_rules

```sql
id              INT AUTO_INCREMENT PRIMARY KEY
account_id      INT                -- FK → finance_accounts
match_name      VARCHAR(255)       -- From/to name to match
category_id     INT                -- FK → finance_categories
usage_count     INT DEFAULT 0
updated_at      DATETIME

INDEX idx_account (account_id)
```

### finance_config

```sql
guild_id        VARCHAR(20) PRIMARY KEY
channel_id      VARCHAR(20)        -- Finance channel
thread_id       VARCHAR(20)        -- Dashboard thread
dashboard_msg_id VARCHAR(20)       -- Dashboard message
updated_at      DATETIME

INDEX idx_channel (channel_id)
```

---

## Score Calculation

```
score = messages × 10 + voiceSeconds + mentions × 30
```

Used in `dc_members.activity_score` and ranking queries.

---

## Multi-Guild Support

Every table with `guild_id` supports multiple Discord servers in a single database. Always filter by `guild_id` in queries:

```js
const [rows] = await pool.query(
  'SELECT * FROM dc_members WHERE guild_id = ?',
  [guildId]
);
```

---

## Backups

Backups stored in `/backups/` directory. Production backups automated via cron.

---

## Common Queries

### Get user activity score (today)

```sql
SELECT SUM(message_count * 10) + SUM(voice_seconds) + 
       COALESCE((SELECT COUNT(*) * 30 FROM dc_activity_mentions WHERE mention_to = ?), 0) as score
FROM dc_activity_daily
WHERE guild_id = ? AND discord_id = ? AND date = CURDATE();
```

### Get accounts accessible to user

```sql
SELECT * FROM finance_accounts
WHERE guild_id = ?
  AND (
    visibility = 'public'
    OR owner_id = ?
    OR (visibility = 'internal' AND ? IN (SELECT user_id FROM <role_table>))
  );
```

### Get transactions by date range

```sql
SELECT * FROM finance_transactions
WHERE guild_id = ? AND account_id = ?
  AND txn_at BETWEEN ? AND ?
ORDER BY txn_at DESC;
```
