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

-- 2026-05-26 — IG ใช้ Page Token ไม่ได้แล้ว ต้องเก็บ User Token (long-lived) แยกไว้
ALTER TABLE dc_social_accounts
  ADD COLUMN user_token TEXT NULL AFTER access_token;
-- DROP TABLE dc_guild_config;

-- 2026-05-26 — Auto-refresh User Token: เก็บ expiry ของ long-lived user token
ALTER TABLE dc_social_accounts
  ADD COLUMN user_token_expires_at DATETIME NULL AFTER user_token;

-- 2026-05-26 — Redesign: user-owned accounts, 1 row per platform, visibility public/private
-- Step 1: เพิ่ม columns ใหม่
ALTER TABLE dc_social_accounts
  ADD COLUMN user_discord_id VARCHAR(20) NULL AFTER owner_id,
  ADD COLUMN guild_id        VARCHAR(20) NULL AFTER user_discord_id,
  ADD COLUMN platform_id       VARCHAR(50) NULL AFTER page_id,
  ADD COLUMN visibility      ENUM('public','private') NOT NULL DEFAULT 'public' AFTER ig_id,
  ADD COLUMN user_key        VARCHAR(20) GENERATED ALWAYS AS (IFNULL(user_discord_id, '')) STORED;

-- Step 2: migrate guild_id + platform_id จาก rows เดิม
UPDATE dc_social_accounts SET guild_id = owner_id, platform_id = page_id
  WHERE owner_type = 'guild';

-- Step 3: insert IG rows แยกจาก FB rows ที่มี ig_id
INSERT INTO dc_social_accounts (guild_id, name, platform, platform_id, access_token, user_token, user_token_expires_at, visibility)
SELECT guild_id, CONCAT(name, ' (IG)'), 'ig', ig_id, access_token, user_token, user_token_expires_at, 'public'
FROM dc_social_accounts
WHERE platform = 'fb' AND ig_id IS NOT NULL AND guild_id IS NOT NULL;

-- Step 4: drop unique key เดิม, เพิ่มอันใหม่ที่รองรับ NULL user_discord_id
ALTER TABLE dc_social_accounts DROP INDEX uq_account;
ALTER TABLE dc_social_accounts
  ADD UNIQUE KEY uq_account (user_key, guild_id, platform, platform_id);

-- Step 5: drop columns เดิม
ALTER TABLE dc_social_accounts
  DROP COLUMN owner_type,
  DROP COLUMN owner_id,
  DROP COLUMN page_id,
  DROP COLUMN ig_id;

-- 2026-05-26: dc_social_accounts — rename platform_id → social_id (ชื่อกลางๆ ครอบทุก platform)
ALTER TABLE dc_social_accounts CHANGE platform_id social_id VARCHAR(50) NULL;

-- 2026-05-27: dc_social_accounts — access_token เป็น NULL ได้ (IG row ใช้ user_token แทน)
ALTER TABLE dc_social_accounts MODIFY COLUMN access_token TEXT NULL;

-- 2026-05-27: dc_social_accounts — เพิ่ม group_name สำหรับจัดกลุ่ม (ปชช.ราชบุรี, Unnop ส่วนตัว, ฯลฯ)
ALTER TABLE dc_social_accounts ADD COLUMN group_name VARCHAR(100) NULL AFTER name;

-- 2026-06-04: รวม dc_server_settings เข้า dc_guild_config (สอง key-value table หน้าตาเหมือนกัน → เหลือตารางเดียว)
-- dc_server_settings.setting_value เป็น json อยู่แล้ว, dc_guild_config.value เป็น text (plain string)
-- Step 1: value TEXT → json (wrap plain string เดิมให้เป็น json string เช่น abc123 → "abc123")
ALTER TABLE dc_guild_config ALTER COLUMN value TYPE json USING to_jsonb(value);
-- Step 2: เพิ่ม updated_at (เก็บ timestamp ที่ย้ายมาจาก dc_server_settings)
ALTER TABLE dc_guild_config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT CURRENT_TIMESTAMP;
-- Step 3: ย้าย rows (setting_value json → value json copy ตรง ๆ, key ไม่ชนกัน)
INSERT INTO dc_guild_config (guild_id, "key", value, updated_at)
SELECT guild_id, setting_key, setting_value, updated_at
FROM dc_server_settings
ON CONFLICT (guild_id, "key") DO NOTHING;
-- Step 4: ตรวจสอบ (SELECT * FROM dc_guild_config ORDER BY guild_id, "key";) แล้วค่อย DROP
DROP TABLE dc_server_settings;

-- 2026-06-04: dc_media_baskets — รองรับ type 'video' สำหรับ Reels
ALTER TYPE dc_media_baskets_type ADD VALUE IF NOT EXISTS 'video';
-- 2026-06-04: dc_basket_history — เพิ่ม video_count สำหรับ Reels
ALTER TABLE dc_basket_history ADD COLUMN IF NOT EXISTS video_count INT NULL DEFAULT 0;

-- 2026-06-05: dc_user_config — per-user settings (personal defaults) แยกจาก dc_guild_config
-- guild_id เป็น VARCHAR(20) ใส่ user_<discordId> (24 ตัว) ไม่ได้ → ตารางใหม่
-- 3 ระดับ config: personal (dc_user_config) > guild (dc_guild_config guild_id จริง) > global (dc_guild_config guild_id='global')
CREATE TABLE IF NOT EXISTS dc_user_config (
  discord_id VARCHAR(20)  NOT NULL,
  "key"      VARCHAR(100) NOT NULL,
  value      json,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (discord_id, "key")
);

-- 2026-06-06: dc_members — เพิ่ม position สำหรับ generic register form
ALTER TABLE dc_members ADD COLUMN IF NOT EXISTS position VARCHAR(100) NULL;

-- 2026-06-07: dc_media_baskets — sort_order สำหรับเรียงลำดับรูป (Discord modal + web drag-drop)
-- default 0 = ยังไม่เคยเรียง → fall back เป็น added_at (ลำดับที่เพิ่ม) รูปใหม่ได้ max+1 ต่อท้ายเสมอ
ALTER TABLE dc_media_baskets ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;


-- 2026-06-08: dc_basket_history — group_name สำหรับแสดงใน history ว่าโพสต์จาก group ไหน
ALTER TABLE dc_basket_history ADD COLUMN IF NOT EXISTS group_name VARCHAR(100) NULL;

-- 2026-06-08: rename dc_basket_history → dc_media_history
ALTER TABLE dc_basket_history RENAME TO dc_media_history;

-- 2026-06-08: dc_ai_modes — AI prompt modes แก้ผ่าน backoffice (/discord/config/ai)
-- guild_id = 'global' = ชุดกลางใช้ทุก guild; เก็บ column guild_id ไว้รองรับ per-guild ในอนาคต
--   bot resolver: guild row override global row ตาม value (ดู db/aiConfig.js) — ตอนนี้ UI แก้เฉพาะ global
-- agent config (provider/model/max_tokens) เก็บใน dc_guild_config guild_id='global' keys: ai.provider / ai.model / ai.max_tokens
CREATE TABLE IF NOT EXISTS dc_ai_modes (
  id         SERIAL PRIMARY KEY,
  guild_id   VARCHAR(20)  NOT NULL DEFAULT 'global',
  value      VARCHAR(50)  NOT NULL,
  label      VARCHAR(100) NOT NULL,
  prompt     TEXT         NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_at timestamptz  DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (guild_id, value)
);

-- seed 3 modes เริ่มต้น (ตรงกับ config/aiModes.js fallback) — idempotent, ไม่ทับ prompt ที่แก้ผ่านเว็บ
INSERT INTO dc_ai_modes (guild_id, value, label, prompt, sort_order) VALUES
('global', 'summary', '📋 สรุปประเด็น',
'สรุปบทสนทนานี้เป็นภาษาไทย กระชับ ชัดเจน ใช้ bullet points
ถ้ามี "หัวข้อ/เรื่องหลัก" ให้ยึดเรื่องนั้นเป็นแกน
จับเฉพาะประเด็นสำคัญ ตัดบทสนทนาจิปาถะ (เช่น ทักทาย ขอข้อมูล เลือกรูป) ออก
ตอบมาเฉพาะตัวสรุป ไม่ต้องเกริ่นนำหรือวิจารณ์', 1),
('global', 'social_post', '📣 โพสต์ Social',
'หน้าที่ของคุณคือเขียนโพสต์โซเชียลมีเดียภาษาไทยจากเนื้อหาที่ให้มา — ต้องเขียนโพสต์ออกมาเสมอ
ห้ามปฏิเสธ ห้ามตอบว่าเนื้อหาไม่เหมาะ ห้ามวิจารณ์หรือแนะนำ

ขั้นตอน:
1) อ่านเนื้อหาทั้งหมด แล้วแยกว่ามี "เรื่องที่โพสต์ได้" กี่เรื่อง — เรื่องที่ต่างกันชัดเจน เช่น ประชาสัมพันธ์งาน vs สรุปหลังจบงาน ถือเป็นคนละเรื่อง
2) บทสนทนาจิปาถะ (ทักทาย ขอข้อมูลสมาชิก เลือกรูป นัดเวลา) ไม่นับเป็นเรื่อง — มองข้าม
3) เขียนโพสต์ตามจำนวนเรื่องที่พบ — จำนวนโพสต์จะถูกกำหนดโดย context ที่เรียกใช้

ถ้ามีมากกว่า 1 โพสต์ ให้คั่นแต่ละโพสต์ด้วยบรรทัดนี้ (ใส่หัวข้อสั้นๆ แทน X):
════════ โพสต์: X ════════

ทุกโพสต์:
- บรรทัดแรกของทุกโพสต์ต้องเป็นหัวเรื่องในรูปแบบ [ชื่อเรื่องสั้นกระชับ 5-15 คำ] — เช่น [ราชบุรี Open Call and Beyond กับการพัฒนาระบบการโทรหาสมาชิกพรรค]
- รักษาคำพูดและสำนวนเดิมของคนเขียนไว้ให้มากที่สุด อย่าเกลาใหม่จนอารมณ์และตัวตนเดิมหาย — เน้นจัดระเบียบ ไม่ใช่เขียนใหม่
- สั้น กระชับ น่าอ่าน มี emoji พอเหมาะ
- ใช้ข้อความธรรมดา ห้ามใช้ markdown (**ตัวหนา**, # หัวข้อ) เพราะ Facebook/IG ไม่ render
- สอดแทรก hashtag แบบ inline ในเนื้อหา ห้ามรวมกันท้ายโพสต์
  - ต้องใส่เสมอถ้าเนื้อหาเกี่ยวข้อง: #พรรคประชาชน #ประชาชนราชบุรี #อาสาประชาชน
  - นอกจากนั้น AI เลือกเองได้ — รวมทั้งหมดไม่เกิน 5 hashtag ต่อโพสต์

"หัวข้อ/เรื่องหลัก" ที่ให้มาใช้เป็นบริบทช่วยได้ แต่ไม่ต้องยึดจนมองข้ามเรื่องอื่น
ตอบมาเฉพาะตัวโพสต์ ไม่ต้องเกริ่นนำหรืออธิบาย', 2)
ON CONFLICT (guild_id, value) DO NOTHING;

-- 2026-06-08: รวม hashtag_inline เข้า social_post — ลบ mode แยกออก + อัปเดต prompt
DELETE FROM dc_ai_modes WHERE guild_id = 'global' AND value = 'hashtag_inline';
UPDATE dc_ai_modes SET
  prompt = 'หน้าที่ของคุณคือเขียนโพสต์โซเชียลมีเดียภาษาไทยจากเนื้อหาที่ให้มา — ต้องเขียนโพสต์ออกมาเสมอ
ห้ามปฏิเสธ ห้ามตอบว่าเนื้อหาไม่เหมาะ ห้ามวิจารณ์หรือแนะนำ

ขั้นตอน:
1) อ่านเนื้อหาทั้งหมด แล้วแยกว่ามี "เรื่องที่โพสต์ได้" กี่เรื่อง — เรื่องที่ต่างกันชัดเจน เช่น ประชาสัมพันธ์งาน vs สรุปหลังจบงาน ถือเป็นคนละเรื่อง
2) บทสนทนาจิปาถะ (ทักทาย ขอข้อมูลสมาชิก เลือกรูป นัดเวลา) ไม่นับเป็นเรื่อง — มองข้าม
3) เขียนโพสต์ตามจำนวนเรื่องที่พบ — จำนวนโพสต์จะถูกกำหนดโดย context ที่เรียกใช้

ถ้ามีมากกว่า 1 โพสต์ ให้คั่นแต่ละโพสต์ด้วยบรรทัดนี้ (ใส่หัวข้อสั้นๆ แทน X):
════════ โพสต์: X ════════

ทุกโพสต์:
- บรรทัดแรกของทุกโพสต์ต้องเป็นหัวเรื่องในรูปแบบ [ชื่อเรื่องสั้นกระชับ 5-15 คำ] — เช่น [ราชบุรี Open Call and Beyond กับการพัฒนาระบบการโทรหาสมาชิกพรรค]
- รักษาคำพูดและสำนวนเดิมของคนเขียนไว้ให้มากที่สุด อย่าเกลาใหม่จนอารมณ์และตัวตนเดิมหาย — เน้นจัดระเบียบ ไม่ใช่เขียนใหม่
- สั้น กระชับ น่าอ่าน มี emoji พอเหมาะ
- ใช้ข้อความธรรมดา ห้ามใช้ markdown (**ตัวหนา**, # หัวข้อ) เพราะ Facebook/IG ไม่ render
- สอดแทรก hashtag แบบ inline ในเนื้อหา ห้ามรวมกันท้ายโพสต์
  - ต้องใส่เสมอถ้าเนื้อหาเกี่ยวข้อง: #พรรคประชาชน #ประชาชนราชบุรี #อาสาประชาชน
  - นอกจากนั้น AI เลือกเองได้ — รวมทั้งหมดไม่เกิน 5 hashtag ต่อโพสต์

"หัวข้อ/เรื่องหลัก" ที่ให้มาใช้เป็นบริบทช่วยได้ แต่ไม่ต้องยึดจนมองข้ามเรื่องอื่น
ตอบมาเฉพาะตัวโพสต์ ไม่ต้องเกริ่นนำหรืออธิบาย',
  updated_at = CURRENT_TIMESTAMP
WHERE guild_id = 'global' AND value = 'social_post'
  AND prompt NOT LIKE '%hashtag%';

-- 2026-06-09: archive schema สำหรับ dc_activity_* — รัน scripts/archive-activity.js ปีละครั้ง
CREATE SCHEMA IF NOT EXISTS archive;
CREATE TABLE IF NOT EXISTS archive.dc_activity_daily    (LIKE dc_activity_daily    INCLUDING CONSTRAINTS EXCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS archive.dc_activity_mentions (LIKE dc_activity_mentions INCLUDING CONSTRAINTS EXCLUDING DEFAULTS);

-- 2026-06-10: Per-guild Role Config (RBAC + Picker) — SPEC.md กอง A
--   2 ตาราง: นิยามกลุ่ม picker ต่อ guild + catalog ของทุก role (ป้าย A picker + ป้าย B RBAC)
--   seed อาสาประชาชน ด้วย scripts/migration/seed-guild-roles.js (idempotent)

-- นิยามกลุ่ม picker ต่อ guild (รอบนี้ fix 3 กลุ่ม, kind เผื่อ dynamic groups ทำต่อทีหลัง)
CREATE TABLE IF NOT EXISTS dc_guild_role_groups (
  guild_id   VARCHAR(20)  NOT NULL,
  group_key  VARCHAR(40)  NOT NULL,                    -- 'interest' | 'skill' | 'province'
  label      VARCHAR(100) NOT NULL,                    -- ชื่อโชว์ เช่น 'ความสนใจ'
  kind       VARCHAR(20)  NOT NULL DEFAULT 'plain',    -- 'plain' | 'province'
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, group_key)
);

-- catalog ของทุก role + ป้าย A (picker) + ป้าย B (RBAC) — ป้าย A/B เป็น human-set sparse ที่เหลือ null
CREATE TABLE IF NOT EXISTS dc_guild_roles (
  guild_id     VARCHAR(20)  NOT NULL,
  role_id      VARCHAR(20)  NOT NULL,                  -- discord snowflake (anchor สำหรับ rename)
  role_name    VARCHAR(100) NOT NULL,                  -- ตรงกับที่ dc_members.roles เก็บ
  -- ป้าย B (RBAC)
  permission   VARCHAR(40),                            -- nullable
  scope_node   VARCHAR(80),                            -- nullable; 'province:ราชบุรี'|'subregion:<role>'|'region:<role>'
  -- ป้าย A (Picker)
  picker_group VARCHAR(40),                            -- nullable; → dc_guild_role_groups.group_key
  picker_label VARCHAR(100),                           -- nullable; ข้อความบนปุ่ม (default = role_name)
  picker_emoji VARCHAR(40),                            -- nullable
  picker_order INT,                                    -- nullable; ลำดับในกลุ่ม
  updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, role_id)                      -- key ด้วย id (Discord ตั้งชื่อ role ซ้ำได้)
);
CREATE INDEX IF NOT EXISTS idx_dc_guild_roles_lookup ON dc_guild_roles (guild_id, role_name);   -- web lookup by name
CREATE INDEX IF NOT EXISTS idx_dc_guild_roles_picker ON dc_guild_roles (guild_id, picker_group);

-- 2026-06-11: calling_member_tiers — เพิ่ม flag column (green/yellow/red สำหรับ mark สมาชิก)
ALTER TABLE calling_member_tiers ADD COLUMN IF NOT EXISTS flag VARCHAR(20);

-- 2026-06-11: dc_guild_roles — parent_role_id สำหรับ cascade role
--   กด role ที่มี parent → แปะ parent ด้วย (chain); ถอด → ถ้าไม่มี sibling เหลือ ถอด parent ด้วย
--   ใช้คลุมทั้ง MEDIA_TEAM (ทีมกราฟิก→ทีมสื่อ) และ province hierarchy (จังหวัด→ภาคย่อย→ภาคใหญ่)
--   seed ด้วย: node scripts/migration/seed-parent-roles.js
ALTER TABLE dc_guild_roles ADD COLUMN IF NOT EXISTS parent_role_id VARCHAR(20) NULL;

-- 2026-06-12: Calling — เพิ่ม guild_id ใน 4 tables + backfill สำหรับ multi-tenant support
--   GUILD_ID อาสาประชาชน = 1340903354037178410 (hardcode สำหรับ backfill ข้อมูลเดิม)

-- Step 1: ngs_member_cache — ข้อมูลทั้งหมดเป็นของ guild อาสาประชาชน
ALTER TABLE ngs_member_cache ADD COLUMN IF NOT EXISTS guild_id VARCHAR(20);
UPDATE ngs_member_cache SET guild_id = '1340903354037178410' WHERE guild_id IS NULL;
ALTER TABLE ngs_member_cache ALTER COLUMN guild_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ngs_member_cache_guild ON ngs_member_cache (guild_id);

-- Step 2: calling_logs — JOIN act_event_cache; guild_id='1' คือ legacy value ของ guild อาสาประชาชน
ALTER TABLE calling_logs ADD COLUMN IF NOT EXISTS guild_id VARCHAR(20);
UPDATE calling_logs cl
SET guild_id = COALESCE(NULLIF(aec.guild_id, '1'), '1340903354037178410')
FROM act_event_cache aec
WHERE cl.campaign_id = aec.id;
-- fallback: campaign_id=0 ไม่มี act_event_cache row หรือ rows ที่ยังไม่ match
UPDATE calling_logs SET guild_id = '1340903354037178410' WHERE guild_id IS NULL;
ALTER TABLE calling_logs ALTER COLUMN guild_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calling_logs_guild ON calling_logs (guild_id);

-- Step 3: calling_assignments — JOIN act_event_cache
ALTER TABLE calling_assignments ADD COLUMN IF NOT EXISTS guild_id VARCHAR(20);
UPDATE calling_assignments ca
SET guild_id = COALESCE(NULLIF(aec.guild_id, '1'), '1340903354037178410')
FROM act_event_cache aec
WHERE ca.campaign_id = aec.id;
UPDATE calling_assignments SET guild_id = '1340903354037178410' WHERE guild_id IS NULL;
ALTER TABLE calling_assignments ALTER COLUMN guild_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calling_assignments_guild ON calling_assignments (guild_id);

-- Step 4: calling_member_tiers — JOIN ngs_member_cache (member) / calling_contacts (contact)
ALTER TABLE calling_member_tiers ADD COLUMN IF NOT EXISTS guild_id VARCHAR(20);
UPDATE calling_member_tiers cmt
SET guild_id = nmc.guild_id
FROM ngs_member_cache nmc
WHERE cmt.member_id::int = nmc.source_id AND cmt.contact_type = 'member';
UPDATE calling_member_tiers cmt
SET guild_id = cc.guild_id
FROM calling_contacts cc
WHERE cmt.member_id::int = cc.id AND cmt.contact_type = 'contact';
UPDATE calling_member_tiers SET guild_id = '1340903354037178410' WHERE guild_id IS NULL;
ALTER TABLE calling_member_tiers ALTER COLUMN guild_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calling_member_tiers_guild ON calling_member_tiers (guild_id);

-- 2026-06-13: Feature toggle ต่อ guild — calling/contacts เปิดเฉพาะ guild ที่ตั้ง
--   finance + bot เปิดตลอดทุก guild (ไม่อยู่ใน toggle) · default (ไม่มี row) = []
--   value json array · Nav อ่านผ่าน getEnabledFeatures() ซ่อน/แสดงเมนู
INSERT INTO dc_guild_config (guild_id, "key", value) VALUES
  ('1340903354037178410', 'enabled_features', '["calling","contacts"]'::json)
ON CONFLICT (guild_id, "key") DO UPDATE SET value = EXCLUDED.value;
