ALTER TABLE finance_transactions
  DROP INDEX uq_ref,
  ADD UNIQUE KEY uq_ref (ref_id, account_id);


-- 1. Rename member_id → serial
ALTER TABLE dc_members CHANGE member_id serial VARCHAR(50) NULL;

-- 2. Add new member_id column (future link to ngs_member_cache.source_id)
ALTER TABLE dc_members ADD COLUMN member_id INT NULL AFTER serial;

-- 3. Add index on serial for join performance
ALTER TABLE dc_members ADD INDEX idx_serial (serial);

---

ALTER TABLE act_event_cache ADD COLUMN event_date DATE NULL AFTER description;
-- 1. migrate busy records
UPDATE calling_logs SET status = 'no_answer' WHERE status = 'busy';

-- 2. remove busy from ENUM
ALTER TABLE calling_logs 
  MODIFY COLUMN status ENUM('answered','no_answer','wrong_number') NOT NULL;

-- 3. เพิ่ม rsvp column (ถ้ายังไม่ได้ทำ)
ALTER TABLE calling_assignments
  ADD COLUMN rsvp ENUM('yes','no','maybe') NULL AFTER assigned_by;

-- 2026-05-03: เพิ่ม primary_province ใน dc_members สำหรับ user ที่ถือหลายจังหวัด ใช้เป็น default province ตอนเพิ่ม Contact ใหม่
ALTER TABLE dc_members ADD COLUMN primary_province VARCHAR(100) NULL AFTER province;

-- 2026-05-04: Contacts module — เพิ่ม specialty (รวม อาชีพ/ตำแหน่ง/ความสามารถ ใน field เดียว, ชื่อตาม dc_members.specialty)
ALTER TABLE calling_contacts ADD COLUMN specialty TEXT NULL AFTER note;

-- 2026-05-04: Contacts module — last_name optional (ฟอร์มไม่ใช้แล้ว แต่ column เก็บไว้ใน DB)
ALTER TABLE calling_contacts MODIFY COLUMN last_name VARCHAR(100) NULL;

-- 2026-05-04: Contacts module — เพิ่ม status 'met' ใน calling_logs (ใช้บันทึกการพบปะ in-person, signals + tier นับเหมือน answered)
ALTER TABLE calling_logs
  MODIFY COLUMN status ENUM('answered','no_answer','not_called','met')
  COLLATE utf8mb4_unicode_ci NOT NULL;

-- 2026-05-04: calling_assignments — เปลี่ยน unique key ให้รวม campaign_id เพื่อให้แต่ละกิจกรรม assign คนชุดเดิมได้อิสระ
ALTER TABLE calling_assignments
  DROP INDEX uq_member_contact,
  ADD UNIQUE KEY uq_campaign_member_contact (campaign_id, member_id, contact_type);

-- 2026-05-07: dc_members — เพิ่มข้อมูลบัญชีธนาคาร สำหรับโอนเบี้ยเลี้ยง/เงินอุดหนุน
ALTER TABLE dc_members
  ADD COLUMN bank_name VARCHAR(50) NULL AFTER primary_province,
  ADD COLUMN account_no VARCHAR(50) NULL AFTER bank_name,
  ADD COLUMN account_holder VARCHAR(100) NULL AFTER account_no;

-- 2026-05-08: calling_logs — เพิ่ม SMS statuses สำหรับ bulk SMS ผ่าน ThaiBulkSMS
ALTER TABLE calling_logs
  MODIFY COLUMN status ENUM('answered','no_answer','not_called','met','sms_sent','sms_delivered','sms_failed')
  COLLATE utf8mb4_unicode_ci NOT NULL;

-- 2026-05-09: act_event_cache — เปลี่ยน event_date เป็น DATETIME เพื่อเก็บเวลาจัดกิจกรรมด้วย
ALTER TABLE act_event_cache MODIFY COLUMN event_date DATETIME NULL;

-- 2026-05-13: dc_gogo_entries — เก็บรายชื่อผู้เข้าร่วม GoGo panel แทนการ parse embed field
CREATE TABLE IF NOT EXISTS dc_gogo_entries (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id   VARCHAR(20)  NOT NULL,
  message_id VARCHAR(20)  NOT NULL,
  user_id    VARCHAR(20)  NOT NULL,
  name       VARCHAR(200) NOT NULL DEFAULT '',
  joined_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_panel (guild_id, message_id),
  INDEX idx_user  (guild_id, message_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-05-14: media_baskets — ตะกร้าสื่อ บก. รวมรูป+caption จากหลาย message ก่อนโพสต์ FB/IG
CREATE TABLE IF NOT EXISTS dc_media_baskets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  guild_id   VARCHAR(20)  NOT NULL,
  channel_id VARCHAR(20)  NOT NULL,
  added_by   VARCHAR(20)  NOT NULL,
  type       ENUM('image','caption') NOT NULL DEFAULT 'image',
  image_url  TEXT         NULL,
  caption    TEXT         NULL,
  message_id VARCHAR(20)  NULL,
  added_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild_channel (guild_id, channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-05-15: finance_incoming_log — เก็บ raw SMS และ email ทุกตัวที่เข้าระบบการเงิน
CREATE TABLE IF NOT EXISTS finance_incoming_log (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  guild_id       VARCHAR(20)          NULL,
  source         ENUM('sms','email')  NOT NULL,
  raw_text       TEXT                 NOT NULL,
  parsed         TINYINT              NOT NULL DEFAULT 0,
  transaction_id INT                  NULL,
  created_at     DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at DESC),
  INDEX idx_txn (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-05-14: dc_guild_config — key-value config ต่อ guild (Meta social, bot config, feature flags ฯลฯ)
CREATE TABLE IF NOT EXISTS dc_guild_config (
  guild_id  VARCHAR(20)   NOT NULL,
  `key`     VARCHAR(100)  NOT NULL,
  value     TEXT          NULL,
  PRIMARY KEY (guild_id, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-05-14: meta social config per guild — รัน scripts/meta-setup.js แทนการใส่เองตรงนี้
-- INSERT INTO dc_guild_config (guild_id, `key`, value) VALUES
--   ('GUILD_ID', 'meta_page_id',    'FB_PAGE_ID'),
--   ('GUILD_ID', 'meta_ig_id',      'IG_BUSINESS_ID'),
--   ('GUILD_ID', 'meta_page_token', 'PAGE_ACCESS_TOKEN')
-- ON DUPLICATE KEY UPDATE value = VALUES(value);

-- 2026-05-16: dc_basket_history — ประวัติการโพสต์ผ่าน basket
CREATE TABLE IF NOT EXISTS dc_basket_history (
  id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  guild_id      VARCHAR(20)      NOT NULL,
  channel_id    VARCHAR(20)      NOT NULL,
  posted_by     VARCHAR(20)      NOT NULL,
  platform      VARCHAR(10)      NOT NULL COMMENT 'fb / ig / both',
  image_count   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  wm_type       VARCHAR(100)     NULL,
  caption       TEXT             NULL,
  schedule_time INT UNSIGNED     NULL COMMENT 'unix timestamp, null = โพสต์ทันที',
  fb_url        VARCHAR(500)     NULL,
  status        VARCHAR(20)      NOT NULL DEFAULT 'success' COMMENT 'success / partial / failed',
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_channel (guild_id, channel_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-05-17: dc_basket_history — เพิ่ม ig_url, threads_url
ALTER TABLE dc_basket_history
  ADD COLUMN ig_url      VARCHAR(500) NULL AFTER fb_url,
  ADD COLUMN threads_url VARCHAR(500) NULL AFTER ig_url;

-- 2026-05-20: calling_favorites — bookmark สมาชิก/contact ส่วนตัวต่อ user
CREATE TABLE IF NOT EXISTS calling_favorites (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  guild_id        VARCHAR(20) NOT NULL,
  user_discord_id VARCHAR(20) NOT NULL,
  member_id       VARCHAR(20) NOT NULL COMMENT 'source_id หรือ calling_contacts.id',
  contact_type    ENUM('member','contact') NOT NULL DEFAULT 'member',
  note            TEXT NULL COMMENT 'บันทึกส่วนตัวว่าทำไมติดดาว',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_target (guild_id, user_discord_id, member_id, contact_type),
  INDEX idx_user (guild_id, user_discord_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-05-20: calling_logs — เพิ่ม caller_image เก็บ Discord CDN URL ของคนโทร
ALTER TABLE calling_logs ADD COLUMN IF NOT EXISTS caller_image TEXT NULL AFTER caller_name;

-- 2026-05-20: dc_members — เพิ่ม avatar เก็บ Discord CDN URL ของ member (update ทุกครั้งที่ login)
ALTER TABLE dc_members ADD COLUMN IF NOT EXISTS avatar TEXT NULL AFTER display_name;

-- 2026-05-20: เปลี่ยนชื่อ calling_favorites → calling_starred
RENAME TABLE calling_favorites TO calling_starred;

-- 2026-05-21: finance_funds — แยกเงินหลายก้อนในบัญชีเดียว (เช่น ทุนทั่วไป vs เงินบริจาคส้มสู้ไฟ)
CREATE TABLE IF NOT EXISTS finance_funds (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  account_id INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE finance_transactions
  ADD COLUMN fund_id INT NULL AFTER category_id;




-- 2026-05-26: dc_basket_history — เพิ่ม x_url สำหรับ X (Twitter) platform + ลบ schedule_time (ใช้ post now เท่านั้น)
ALTER TABLE dc_basket_history ADD COLUMN x_url VARCHAR(512) NULL AFTER threads_url;

-- 2026-05-26: dc_social_accounts — รวม guild และ personal social accounts ในตารางเดียว (แทน dc_guild_config)
CREATE TABLE IF NOT EXISTS dc_social_accounts (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  owner_type   VARCHAR(10)  NOT NULL,
  owner_id     VARCHAR(20)  NOT NULL,
  name         VARCHAR(100) NOT NULL,
  platform     VARCHAR(20)  NOT NULL,
  page_id      VARCHAR(50)  NOT NULL,
  access_token TEXT         NOT NULL,
  ig_id        VARCHAR(50)  NULL,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account (owner_type, owner_id, platform, page_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrate FB accounts (รวม IG ไว้ใน row เดียวกัน)
INSERT INTO dc_social_accounts (owner_type, owner_id, name, platform, page_id, access_token, ig_id)
SELECT
  'guild', guild_id, 'เพจหลัก', 'fb',
  MAX(CASE WHEN `key` = 'meta_page_id'    THEN value END),
  MAX(CASE WHEN `key` = 'meta_page_token' THEN value END),
  MAX(CASE WHEN `key` = 'meta_ig_id'      THEN value END)
FROM dc_guild_config
WHERE `key` IN ('meta_page_id', 'meta_page_token', 'meta_ig_id')
GROUP BY guild_id
HAVING MAX(CASE WHEN `key` = 'meta_page_id' THEN value END) IS NOT NULL
   AND MAX(CASE WHEN `key` = 'meta_page_token' THEN value END) IS NOT NULL;

-- Migrate Threads accounts
INSERT INTO dc_social_accounts (owner_type, owner_id, name, platform, page_id, access_token)
SELECT
  'guild', guild_id, 'Threads', 'threads',
  MAX(CASE WHEN `key` = 'meta_threads_id'    THEN value END),
  MAX(CASE WHEN `key` = 'meta_threads_token' THEN value END)
FROM dc_guild_config
WHERE `key` IN ('meta_threads_id', 'meta_threads_token')
GROUP BY guild_id
HAVING MAX(CASE WHEN `key` = 'meta_threads_id' THEN value END) IS NOT NULL
   AND MAX(CASE WHEN `key` = 'meta_threads_token' THEN value END) IS NOT NULL;

-- ตรวจสอบข้อมูลก่อน DROP:
-- SELECT * FROM dc_social_accounts;
-- DROP TABLE dc_guild_config;
