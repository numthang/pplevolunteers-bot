# pple-volunteers — Web App

อ่าน `/home/tee/VSites/node/pple-volunteers/CLAUDE.md` ด้วยเสมอ (project conventions)

## Stack
- Runtime: Node.js
- Framework: Next.js (App Router)
- Database: MySQL (`pple_volunteers`)
- Auth: Discord OAuth
- Path: `/home/tee/VSites/node/pple-volunteers/web/`
- Domain: pplethai.org (subdomain TBD)

## Project Structure
```
app/         Next.js App Router (pages + API routes)
components/  React components
db/          database access functions
lib/         utilities, helpers
public/      static assets
```

## Deploy
```bash
cd /home/tee/VSites/node/pple-volunteers/web
sudo -u www npm run build
pm2 restart pple-web
```

---

## Next.js Conventions

- ใช้ **App Router** (ไม่ใช่ Pages Router)
- API routes อยู่ใน `app/api/`
- Auth ผ่าน Discord OAuth → `next-auth` หรือ custom OAuth flow
- ไม่ต้องสร้าง user system ใหม่ → ใช้ `dc_members.discord_id` เป็น FK

---

## Finance System

### DB Tables (prefix `finance_`)

```sql
finance_accounts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  guild_id        VARCHAR(20),
  owner_id        VARCHAR(20),        -- discord user id
  name            VARCHAR(100),
  bank            VARCHAR(50),
  account_no      VARCHAR(50),        -- ใช้ match slip/email
  type            ENUM('personal','organization'),
  visibility      ENUM('private','internal','public'),
  notify_income   TINYINT DEFAULT 1,
  notify_expense  TINYINT DEFAULT 1,
  email_inbox     VARCHAR(100),       -- email ที่ forward มา
  thread_id       VARCHAR(20),        -- Discord thread (optional)
  usage_count     INT DEFAULT 0,      -- frequency sort
  updated_by      VARCHAR(20),
  updated_at      DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
)

finance_transactions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  guild_id        VARCHAR(20),
  account_id      INT,
  type            ENUM('income','expense'),
  amount          DECIMAL(12,2),
  description     VARCHAR(255),
  category_id     INT,                -- nullable
  source          VARCHAR(255),
  evidence_url    TEXT,
  ref_id          VARCHAR(100),
  discord_msg_id  VARCHAR(20),
  txn_at          DATETIME,
  updated_by      VARCHAR(20),
  updated_at      DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ref (ref_id)
)

finance_categories (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  guild_id        VARCHAR(20),        -- NULL = global
  name            VARCHAR(100),
  is_global       TINYINT DEFAULT 0,
  usage_count     INT DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
)

finance_account_rules (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  account_id      INT,
  match_name      VARCHAR(255),       -- ชื่อบัญชีที่เคยโอน
  category_id     INT,
  usage_count     INT DEFAULT 0,
  updated_at      DATETIME
)

finance_config (
  guild_id        VARCHAR(20) PRIMARY KEY,
  channel_id      VARCHAR(20),
  thread_id       VARCHAR(20),
  dashboard_msg_id VARCHAR(20),
  updated_at      DATETIME
)
```

### Access Control
```
private account          → เจ้าของเท่านั้น
เหรัญญิก + ทีมจังหวัด   → แก้ไขได้ทุกบัญชีของจังหวัด
เหรัญญิก + ทีมภาค       → แก้ไขได้ทุกบัญชีในภาค
เหรัญญิก + Admin        → แก้ไขได้ทั้งหมด
```

สิทธิ์ตรวจจาก Discord role ผ่าน OAuth token

### Account Visibility
```
private  → เจ้าของเท่านั้น
internal → คนในองค์กรตาม hierarchy
public   → ทุกคนดูได้ ไม่ต้อง login
```

### UX Rules
- dropdown เรียงตาม `usage_count DESC` (ใช้บ่อย → ขึ้นก่อน)
- category มีทั้ง global และ per-guild
- notification ตั้งค่าผ่านเว็บเท่านั้น (ไม่มี Discord command)

### Pages
```
/                → public dashboard (ไม่ต้อง login)
/login           → Discord OAuth
/dashboard       → overview ทุก account ที่มีสิทธิ์
/accounts        → CRUD accounts
/transactions    → CRUD transactions + filter
/categories      → จัดการ categories
/settings        → notification, email forward config
```

### Deferred (คิดทีหลัง)
```
- report / export Excel/PDF
- budget / approval flow
- donate button หน้า public
- recurring transaction
- สรุปรายเดือนอัตโนมัติ
```

---

## Preferences
- ยืนยัน Q&A ก่อนเขียน code เสมอ
- ถามตรงๆ ได้ ไม่ต้อง formal
- Code ต้องเป็น runnable / copy-paste friendly
- ไม่ over-engineer

## Off-limits
- `.env` อย่าอ่านหรือแสดงค่า
