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

-- 2026-06-13: dc_guild_roles — is_managed สำหรับกรอง bot role ออกจาก UI
ALTER TABLE dc_guild_roles ADD COLUMN IF NOT EXISTS is_managed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2026-06-13: dc_media_baskets — channel_name เพื่อแสดงชื่อ thread ใน list view
ALTER TABLE dc_media_baskets ADD COLUMN IF NOT EXISTS channel_name VARCHAR(100) NULL;

-- 2026-06-17: dc_user_identities — multi-provider login (LINE, Google, Passkey)
--   discord_id = primary identity (ยังเป็น FK ของทุก table)
--   provider   = 'line' | 'google' | 'passkey'
--   provider_id = LINE sub / Google sub / WebAuthn credential_id
--   credential  = passkey เท่านั้น (public_key, counter, device_type, transports)
--   UNIQUE(provider, provider_id) — 1 LINE account ผูกได้แค่ 1 discord เท่านั้น
CREATE TABLE IF NOT EXISTS dc_user_identities (
  id          SERIAL PRIMARY KEY,
  discord_id  VARCHAR(20) NOT NULL,
  provider    VARCHAR(20) NOT NULL,
  provider_id TEXT        NOT NULL,
  credential  JSONB       NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_discord ON dc_user_identities (discord_id);

-- 2026-06-19: act_event_cache — sync events จาก act.pplethai.org
ALTER TABLE act_event_cache ADD COLUMN IF NOT EXISTS act_event_id INT NULL;
ALTER TABLE act_event_cache ADD COLUMN IF NOT EXISTS image_url TEXT NULL;
ALTER TABLE act_event_cache ADD COLUMN IF NOT EXISTS location TEXT NULL;
ALTER TABLE act_event_cache ADD COLUMN IF NOT EXISTS map_url TEXT NULL;
ALTER TABLE act_event_cache ADD COLUMN IF NOT EXISTS event_end_date TIMESTAMPTZ NULL;

-- partial unique index สำหรับ upsert by act_event_id (NULL rows ไม่ conflict กัน)
CREATE UNIQUE INDEX IF NOT EXISTS idx_act_event_cache_act_event_id
  ON act_event_cache (act_event_id) WHERE act_event_id IS NOT NULL;

-- type column เป็น PostgreSQL ENUM ชื่อ act_event_cache_type
ALTER TYPE act_event_cache_type ADD VALUE IF NOT EXISTS 'event';
ALTER TABLE act_event_cache ADD COLUMN IF NOT EXISTS map_url TEXT NULL;

-- 2026-06-19: act_event_cache — re-ID manual campaigns ให้อยู่ใน range 101+
--   สงวน 1-100 สำหรับ province xlsx imports (เช่น ราชบุรี=70, นครปฐม=73)
--   ลบ register rows ทิ้ง (ข้อมูล test เท่านั้น ยังไม่ได้ใช้จริง)
BEGIN;
DELETE FROM act_event_cache WHERE type = 'register';
DELETE FROM act_event_cache WHERE type = 'event';

UPDATE act_event_cache SET id = 101 WHERE id = 159214 AND type = 'campaign';
UPDATE calling_assignments SET campaign_id = 101 WHERE campaign_id = 159214;
UPDATE calling_logs SET campaign_id = 101 WHERE campaign_id = 159214;

UPDATE act_event_cache SET id = 102 WHERE id = 159258 AND type = 'campaign';
UPDATE calling_assignments SET campaign_id = 102 WHERE campaign_id = 159258;
UPDATE calling_logs SET campaign_id = 102 WHERE campaign_id = 159258;

UPDATE act_event_cache SET id = 103 WHERE id = 159531 AND type = 'campaign';
UPDATE calling_assignments SET campaign_id = 103 WHERE campaign_id = 159531;
UPDATE calling_logs SET campaign_id = 103 WHERE campaign_id = 159531;

UPDATE act_event_cache SET id = 104 WHERE id = 159959 AND type = 'campaign';
UPDATE calling_assignments SET campaign_id = 104 WHERE campaign_id = 159959;
UPDATE calling_logs SET campaign_id = 104 WHERE campaign_id = 159959;

UPDATE act_event_cache SET id = 105 WHERE id = 160456 AND type = 'campaign';
UPDATE calling_assignments SET campaign_id = 105 WHERE campaign_id = 160456;
UPDATE calling_logs SET campaign_id = 105 WHERE campaign_id = 160456;

SELECT setval('act_event_cache_id_seq', 106);
COMMIT;
--------------------------------
-- 2026-06-19: PPLE Docs — ใบสำคัญรับเงิน + e-signature
CREATE TABLE IF NOT EXISTS docs_projects (
  id                 SERIAL PRIMARY KEY,
  guild_id           VARCHAR(20)    NOT NULL,
  act_event_cache_id INT            NOT NULL REFERENCES act_event_cache(id),
  is_mobile          BOOLEAN        NOT NULL DEFAULT FALSE,
  participant_count  INT            NULL,
  budget             NUMERIC(12,2)  NULL,
  allowed_items      JSONB          NULL,   -- ['food','travel','supplies',...]
  status             VARCHAR(20)    NOT NULL DEFAULT 'draft',
  created_by         VARCHAR(20)    NOT NULL,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_projects_guild ON docs_projects (guild_id);
CREATE INDEX IF NOT EXISTS idx_docs_projects_event ON docs_projects (act_event_cache_id);

CREATE TABLE IF NOT EXISTS docs_activity_entries (
  id                 SERIAL PRIMARY KEY,
  project_id         INT            NOT NULL REFERENCES docs_projects(id) ON DELETE CASCADE,
  member_discord_id  VARCHAR(20)    NOT NULL,
  item_type          VARCHAR(20)    NOT NULL,  -- 'food'|'speaker'|'travel'|'venue'|'accommodation'|'supplies'
  description        TEXT           NULL,
  amount             NUMERIC(12,2)  NULL,
  override_data      JSONB          NULL,
  status             VARCHAR(20)    NOT NULL DEFAULT 'pending',  -- pending|signed|printed
  sign_token         UUID           NOT NULL DEFAULT gen_random_uuid(),
  token_expires_at   TIMESTAMPTZ    NULL,
  signed_at          TIMESTAMPTZ    NULL,
  printed_at         TIMESTAMPTZ    NULL,
  pdf_url            TEXT           NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_entries_token ON docs_activity_entries (sign_token);
CREATE INDEX IF NOT EXISTS idx_docs_entries_project ON docs_activity_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_docs_entries_member ON docs_activity_entries (member_discord_id);

CREATE TABLE IF NOT EXISTS docs_signatures (
  id                   SERIAL PRIMARY KEY,
  entry_id             INT         NOT NULL REFERENCES docs_activity_entries(id) ON DELETE CASCADE,
  signature_base64     TEXT        NOT NULL,
  signed_by_discord_id VARCHAR(20) NOT NULL,
  signed_ip            VARCHAR(45) NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2026-06-19: add project_name to docs_projects for {{project_name}} template field
ALTER TABLE docs_projects ADD COLUMN IF NOT EXISTS project_name TEXT NULL;

-- 2026-06-19: docs_projects — UNIQUE (guild_id, act_event_cache_id) สำหรับ upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_projects_guild_event
  ON docs_projects (guild_id, act_event_cache_id);

-- 2026-06-19: เปิด docs feature สำหรับ guild อาสาประชาชน
INSERT INTO dc_guild_config (guild_id, "key", value)
VALUES ('1340903354037178410', 'enabled_features', '["calling","contacts","docs"]'::json)
ON CONFLICT (guild_id, "key") DO UPDATE SET value = '["calling","contacts","docs"]'::json;

-- 2026-06-20: docs — สำเนาบัตรประชาชน เก็บใน dc_members (per-guild, resize เหลือขนาดพิมพ์ A4)
-- ไม่เก็บใน ngs_member_cache เพราะเป็น cache ที่ sync ทับจาก act.pplethai.org
ALTER TABLE dc_members ADD COLUMN IF NOT EXISTS id_card_image BYTEA NULL;

-- 2026-06-20: docs — กัน 2 Discord accounts ผูก NGS source_id เดียวกันใน guild เดียวกัน (anti-impersonation)
CREATE UNIQUE INDEX IF NOT EXISTS uq_dc_members_guild_member
  ON dc_members (guild_id, member_id)
  WHERE member_id IS NOT NULL;

-- 2026-06-20: docs — ผู้จ่ายเงิน (payer) 2-signer flow
-- docs_projects: เก็บ default payer สำหรับ project
ALTER TABLE docs_projects
  ADD COLUMN IF NOT EXISTS payer_discord_id VARCHAR(20) NULL;

-- docs_activity_entries: token + timestamp สำหรับผู้จ่าย (แยกจาก recipient)
ALTER TABLE docs_activity_entries
  ADD COLUMN IF NOT EXISTS payer_discord_id       VARCHAR(20)  NULL,
  ADD COLUMN IF NOT EXISTS payer_sign_token        UUID         NULL,
  ADD COLUMN IF NOT EXISTS payer_token_expires_at  TIMESTAMPTZ  NULL,
  ADD COLUMN IF NOT EXISTS payer_signed_at         TIMESTAMPTZ  NULL;

-- docs_signatures: แยก role ระหว่าง recipient vs payer (เพิ่ม DEFAULT เพื่อไม่ break row เดิม)
ALTER TABLE docs_signatures
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'recipient';

-- 2026-06-21: docs_payers — รายชื่อผู้จ่ายเงินที่ authorize ต่อ guild
-- signature_base64 NULL เผื่อไว้สำหรับ static-sig flow ในอนาคต (ตอนนี้ใช้ token-sign)
CREATE TABLE IF NOT EXISTS docs_payers (
  id               SERIAL PRIMARY KEY,
  guild_id         VARCHAR(20)  NOT NULL,
  discord_id       VARCHAR(20)  NOT NULL,
  display_name     TEXT         NOT NULL,
  position         TEXT         NOT NULL,
  sort_order       INT          NOT NULL DEFAULT 0,
  signature_base64 TEXT         NULL,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (guild_id, discord_id)
);
CREATE INDEX IF NOT EXISTS idx_docs_payers_guild ON docs_payers (guild_id, sort_order);


-- 2026-06-21: เลิกใช้สถานะ 'printed' — แค่เปิดลิงก์ PDF ไม่ควรนับว่าพิมพ์
-- รวมเข้ากับ 'signed' (printed เดิม = เคยเซ็นแล้วทั้งหมด) · printed_at ปล่อยไว้ไม่ใช้
UPDATE docs_activity_entries SET status = 'signed' WHERE status = 'printed';

-- 2026-06-23: เอกสารแนบโครงการ (ภาพถ่ายเอกสาร เช่น แนบท้าย 3 ที่เซ็นมือ)
-- file_path = path สัมพัทธ์จาก DOCS_UPLOAD_DIR (ไม่ใช่ URL สาธารณะ)
CREATE TABLE IF NOT EXISTS docs_project_attachments (
  id            SERIAL PRIMARY KEY,
  project_id    INT          NOT NULL REFERENCES docs_projects(id) ON DELETE CASCADE,
  guild_id      VARCHAR(20)  NOT NULL,
  original_name TEXT,
  file_path     TEXT         NOT NULL,
  sort_order    INT          NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_attachments_project ON docs_project_attachments (project_id, sort_order);

-- 2026-06-23: อนุญาตให้สร้าง entry โดยยังไม่มีผู้รับ (กำหนดทีหลังได้)
ALTER TABLE docs_activity_entries ALTER COLUMN member_discord_id DROP NOT NULL;

-- 2026-06-24: Payer redesign — clear stale assignments ที่ assigned ผิดจังหวัดก่อน redesign
-- Tee (1098111730015543386) = province_coordinator ราชบุรี → clear entry นอกราชบุรี
-- teerapon (899627308967690270) = regional ไม่มี scope_node → ถูก supersede โดย TADA (province_coordinator นครปฐม)
-- เฉพาะ entry ที่ยังไม่เซ็น (payer_signed_at IS NULL) เท่านั้น
UPDATE docs_activity_entries e
SET payer_discord_id       = NULL,
    payer_sign_token        = NULL,
    payer_token_expires_at  = NULL
FROM docs_projects p
JOIN act_event_cache ev ON ev.id = p.act_event_cache_id
WHERE e.project_id = p.id
  AND e.payer_signed_at  IS NULL
  AND (
    (e.payer_discord_id = '1098111730015543386' AND ev.province != 'ราชบุรี')
    OR
    (e.payer_discord_id = '899627308967690270'  AND ev.province  = 'นครปฐม')
  );

-- 2026-06-24: seed ngs_member_cache — ข้อมูลสมาชิก 23 ราย จาก NGS (ภาพหน้าจอ id 1-25)
-- ⚠️ กรุณาตรวจชื่อภาษาไทยก่อนรัน (อาจอ่านผิดจากภาพ)
INSERT INTO ngs_member_cache (
    source_id, title, first_name, last_name, full_name, old_full_name, 
    created_at, ect_register_date, expired_at, law_expired_at, gender, serial, race, guild_id
) VALUES
(1, 'นาย', 'วงศ์ศร', 'อุดมศิลป์', 'วงศ์ศร อุดมศิลป์', NULL, '2024-08-06 16:55:04', NULL, NULL, NULL, 'ชาย', '6712000001', 'ไทย',  '1340903354037178410'),
(2, 'นาย', 'เขมภัญ', 'ห้วยลึก', 'เขมภัญ ห้วยลึก', NULL, '2024-08-06 18:32:27', '2024-08-08', NULL, NULL, 'ชาย', '6710000001', 'ไทย',  '1340903354037178410'),
(3, 'นาย', 'ธีระพนธ์', 'เทศเกิด', 'ธีระพนธ์ เทศเกิด', NULL, '2024-08-08 12:06:31', '2024-08-08', NULL, NULL, 'ชาย', '6718000001', 'ไทย',  '1340903354037178410'),
(4, 'นางสาว', 'อัญมณี', 'เชาวลิต', 'อัญมณี เชาวลิต', NULL, '2024-08-08 13:16:19', '2024-08-08', '2026-08-08 00:00:00', '2028-08-08 00:00:00', 'หญิง', '6710000002', 'ไทย',  '1340903354037178410'),
(5, 'นาย', 'จามิกร', 'ผิวละออง', 'จามิกร ผิวละออง', NULL, '2024-08-08 13:17:01', '2024-08-08', NULL, NULL, 'ชาย', '6721000001', 'ไทย',  '1340903354037178410'),
(6, 'นาย', 'พชร', 'ชัยมงคลทรัพย์', 'พชร ชัยมงคลทรัพย์', NULL, '2024-08-08 14:06:31', '2024-08-08', NULL, NULL, 'ชาย', '6710000003', 'ไทย',  '1340903354037178410'),
(7, 'นางสาว', 'ธัญชนก', 'เดชประมวลพล', 'ธัญชนก เดชประมวลพล', NULL, '2024-08-08 14:07:12', '2024-08-08', '2026-08-08 00:00:00', '2028-08-08 00:00:00', 'หญิง', '6713000001', 'ไทย',  '1340903354037178410'),
(8, 'นาย', 'ธนธัช', 'มูลเสริฐ', 'ธนธัช มูลเสริฐ', NULL, '2024-08-08 14:13:02', '2024-08-08', NULL, NULL, 'ชาย', '6750000001', 'ไทย',  '1340903354037178410'),
(9, 'นางสาว', 'ลิตานันท์', 'ศรีสุวรรณ์', 'ลิตานันท์ ศรีสุวรรณ์', NULL, '2024-08-08 14:14:41', '2024-08-08', NULL, NULL, 'หญิง', '6774000001', 'ไทย',  '1340903354037178410'),
(10, 'นาย', 'กวีกานต์', 'กุณเวงค์', 'กวีกานต์ กุณเวงค์', NULL, '2024-08-08 14:17:39', '2024-08-08', NULL, NULL, 'ชาย', '6742000001', 'ไทย',  '1340903354037178410'),
(11, 'นางสาว', 'ศศิกมล', 'ศรีสุวรรณ์', 'ศศิกมล ศรีสุวรรณ์', NULL, '2024-08-08 14:17:42', '2024-08-08', NULL, NULL, 'หญิง', '6774000002', 'ไทย',  '1340903354037178410'),
(12, 'นางสาว', 'พรธีรา', 'มโนสิงห์กุล', 'พรธีรา มโนสิงห์กุล', NULL, '2024-08-08 14:17:55', '2024-08-08', NULL, NULL, 'หญิง', '6710000004', 'ไทย',  '1340903354037178410'),
(13, 'นางสาว', 'สุทธิดา', 'เชิดชู', 'สุทธิดา เชิดชู', NULL, '2024-08-08 14:19:57', '2024-08-08', NULL, NULL, 'หญิง', '6710000005', 'ไทย',  '1340903354037178410'),
(14, 'นางสาว', 'สุนีย์', 'กรุมรัมย์', 'สุนีย์ กรุมรัมย์', NULL, '2024-08-08 14:20:52', '2024-08-08', NULL, NULL, 'หญิง', '6731000001', 'ไทย',  '1340903354037178410'),
(15, 'นางสาว', 'ขณิษธิดา', 'ใหม่คาม', 'ขณิษธิดา ใหม่คาม', NULL, '2024-08-08 14:21:36', '2024-08-08', NULL, NULL, 'หญิง', '6710000006', 'ไทย',  '1340903354037178410'),
(17, 'นางสาว', 'อธิษฐาน', 'เหล็กเทส', 'อธิษฐาน เหล็กเทส', NULL, '2024-08-08 14:22:06', '2024-08-08', NULL, NULL, 'หญิง', '6757000001', 'ไทย',  '1340903354037178410'),
(18, 'นาย', 'กฤตภาส', 'เชษฐเจริญรัตน์', 'กฤตภาส เชษฐเจริญรัตน์', NULL, '2024-08-08 14:22:18', '2024-08-08', NULL, NULL, 'ชาย', '6775000001', 'ไทย',  '1340903354037178410'),
(20, 'นาย', 'มนทกานต์', 'รังสิพราหมณกุล', 'มนทกานต์ รังสิพราหมณกุล', NULL, '2024-08-08 14:25:24', '2024-08-08', NULL, NULL, 'ชาย', '6710000008', 'ไทย',  '1340903354037178410'),
(21, 'นางสาว', 'วรรณภา', 'มะโนทัย', 'วรรณภา มะโนทัย', NULL, '2024-08-08 14:25:31', '2024-08-08', NULL, NULL, 'หญิง', '6766000001', 'ไทย',  '1340903354037178410'),
(22, 'นาย', 'ประทีป', 'กุศลสนอง', 'ประทีป กุศลสนอง', NULL, '2024-08-08 14:26:16', '2024-08-08', NULL, NULL, 'ชาย', '6780000001', 'ไทย',  '1340903354037178410'),
(23, 'นางสาว', 'สุภาวดี', 'ทั้งพรม', 'สุภาวดี ทั้งพรม', NULL, '2024-08-08 14:29:12', '2024-08-08', NULL, NULL, 'หญิง', '6750000002', 'ไทย',  '1340903354037178410'),
(24, 'นางสาว', 'กชกร', 'พละพันธ์', 'กชกร พละพันธ์', NULL, '2024-08-08 14:30:31', '2024-08-08', NULL, NULL, 'หญิง', '6750000003', 'ไทย', '1340903354037178410'),
(25, 'นาย', 'วชิรวิทย์', 'เทศศรีเมือง', 'วชิรวิทย์ เทศศรีเมือง', NULL, '2024-08-08 14:30:55', '2024-08-08', NULL, NULL, 'ชาย', '6740000001', 'ไทย', '1340903354037178410');

-- 2026-06-25: public tokens สำหรับ share PDF ใบลงทะเบียน + export ใบสำคัญรับเงิน
ALTER TABLE docs_projects
  ADD COLUMN IF NOT EXISTS export_token         VARCHAR(8)  NULL,
  ADD COLUMN IF NOT EXISTS export_token_expires TIMESTAMP   NULL,
  ADD COLUMN IF NOT EXISTS pdf_token            VARCHAR(8)  NULL,
  ADD COLUMN IF NOT EXISTS pdf_token_expires    TIMESTAMP   NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_projects_export_token
  ON docs_projects (export_token) WHERE export_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_projects_pdf_token
  ON docs_projects (pdf_token) WHERE pdf_token IS NOT NULL;

-- 2026-06-28: Case System — case_config, cases, case_assignees, case_attachments, case_timeline
CREATE TABLE IF NOT EXISTS case_config (
  guild_id         VARCHAR(20) NOT NULL PRIMARY KEY,
  forum_channel_id VARCHAR(20) NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cases (
  id                     SERIAL PRIMARY KEY,
  guild_id               VARCHAR(20)  NOT NULL,
  ref                    VARCHAR(20)  NOT NULL,
  province               VARCHAR(100) NOT NULL,
  category               VARCHAR(50)  NULL,
  status                 VARCHAR(20)  NOT NULL DEFAULT 'open',
  close_reason           VARCHAR(40)  NULL,
  source                 VARCHAR(20)  NOT NULL DEFAULT 'web',
  complainant_name       VARCHAR(200) NOT NULL,
  complainant_phone      VARCHAR(30)  NULL,
  complainant_line_id    VARCHAR(100) NULL,
  consent_at             TIMESTAMPTZ  NULL,
  discord_thread_id      VARCHAR(20)  NULL,
  last_synced_message_id VARCHAR(20)  NULL,
  ai_summary             TEXT         NULL,
  ai_summary_updated_at  TIMESTAMPTZ  NULL,
  intake_ip              VARCHAR(45)  NULL,
  created_by             VARCHAR(20)  NULL,
  title                  VARCHAR(300) NULL,
  detail                 TEXT         NULL,
  letters                JSONB        NOT NULL DEFAULT '[]',
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cases_ref         ON cases (ref);
CREATE INDEX        IF NOT EXISTS idx_cases_guild      ON cases (guild_id, status, created_at DESC);
CREATE INDEX        IF NOT EXISTS idx_cases_province   ON cases (guild_id, province);
CREATE INDEX        IF NOT EXISTS idx_cases_thread     ON cases (discord_thread_id) WHERE discord_thread_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_cases_phone_time ON cases (complainant_phone, created_at DESC);
CREATE INDEX        IF NOT EXISTS idx_cases_ip_time    ON cases (intake_ip, created_at DESC);

CREATE TABLE IF NOT EXISTS case_assignees (
  case_id     INT         NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  guild_id    VARCHAR(20) NOT NULL,
  discord_id  VARCHAR(20) NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (case_id, discord_id)
);
CREATE INDEX IF NOT EXISTS idx_case_assignees_user ON case_assignees (guild_id, discord_id);

CREATE TABLE IF NOT EXISTS case_attachments (
  id            SERIAL       PRIMARY KEY,
  case_id       INT          NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  guild_id      VARCHAR(20)  NOT NULL,
  file_path     VARCHAR(300) NOT NULL,
  original_name VARCHAR(300) NULL,
  mime          VARCHAR(80)  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_attachments_case ON case_attachments (case_id);

CREATE TABLE IF NOT EXISTS case_timeline (
  id                  SERIAL PRIMARY KEY,
  case_id             INT          NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  guild_id            VARCHAR(20)  NOT NULL,
  discord_message_id  VARCHAR(20)  NULL,
  source              VARCHAR(20)  NOT NULL DEFAULT 'human',
  body                TEXT         NOT NULL,
  is_public           BOOLEAN      NOT NULL DEFAULT FALSE,
  occurred_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX        IF NOT EXISTS idx_case_timeline_case      ON case_timeline (case_id, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_case_timeline_message    ON case_timeline (case_id, discord_message_id) WHERE discord_message_id IS NOT NULL;

-- 2026-06-30: audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL    PRIMARY KEY,
  guild_id   VARCHAR(20)  NOT NULL,
  app        VARCHAR(20)  NOT NULL,
  action     VARCHAR(60)  NOT NULL,
  actor_id   VARCHAR(20)  NULL,
  target_id  VARCHAR(50)  NULL,
  meta       JSONB        NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_guild ON audit_logs (guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_app   ON audit_logs (guild_id, app, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

-- 2026-06-30: case_letter_config
CREATE TABLE IF NOT EXISTS case_letter_config (
  id                SERIAL       PRIMARY KEY,
  guild_id          VARCHAR(20)  NOT NULL,
  province          VARCHAR(100) NOT NULL,
  org_name          VARCHAR(200) NOT NULL,
  address           VARCHAR(300) NOT NULL,
  signer_name       VARCHAR(100) NOT NULL,
  signer_position   VARCHAR(200) NOT NULL,
  coordinator_name  VARCHAR(100) NULL,
  coordinator_phone VARCHAR(30)  NULL,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, province)
);

-- 2026-06-30: add letters column
ALTER TABLE cases ADD COLUMN IF NOT EXISTS letters JSONB NOT NULL DEFAULT '[]';

-- 2026-07-03: finance เปลี่ยนเป็น feature toggle (default ปิดทุก guild) — seed เปิดให้อาสาประชาชนที่ใช้อยู่จริง
UPDATE dc_guild_config
SET value = value::jsonb || '["finance"]'::jsonb, updated_at = CURRENT_TIMESTAMP
WHERE guild_id = '1340903354037178410' AND "key" = 'enabled_features'
  AND NOT value::jsonb ? 'finance';

-- 2026-07-05: phone OTP login บนเว็บ — เบอร์ใช้เป็น login credential ได้เฉพาะที่ verify ผ่าน OTP แล้ว
-- verifyHandler เซ็ตตอน OTP ผ่าน · user แก้เบอร์เองจากหน้า profile → reset เป็น NULL
ALTER TABLE dc_members ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ NULL;

-- 2026-07-05: Docs token consolidation — ยุบ pdf_token/export_token เหลือ project_token เดียว
-- แยกประเภทเอกสารด้วย URL path (/receipt, /registration) · backfill จาก export_token
-- → ลิงก์ receipt เก่าใช้ได้ต่อ, ลิงก์ registration เก่าต้อง copy ใหม่
ALTER TABLE docs_projects
  ADD COLUMN IF NOT EXISTS project_token         VARCHAR(8) NULL,
  ADD COLUMN IF NOT EXISTS project_token_expires TIMESTAMP  NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'docs_projects' AND column_name = 'export_token') THEN
    UPDATE docs_projects
       SET project_token = export_token, project_token_expires = export_token_expires
     WHERE project_token IS NULL AND export_token IS NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_projects_project_token
  ON docs_projects (project_token) WHERE project_token IS NOT NULL;
ALTER TABLE docs_projects
  DROP COLUMN IF EXISTS export_token,
  DROP COLUMN IF EXISTS export_token_expires,
  DROP COLUMN IF EXISTS pdf_token,
  DROP COLUMN IF EXISTS pdf_token_expires;

-- 2026-07-08: gogo panel session_id — roster ผูกกับ message_id ที่ churn ทุก sticky repost
-- → lazy re-seed ยิงซ้ำ copy roster ลง message_id ใหม่ = ข้อมูลซ้ำ
-- ย้าย key ไป session_id (mint ตอนสร้าง panel, นิ่งข้าม repost, แยกต่อ event, เก็บ log ได้)
-- backfill: session_id = message_id (ทุก panel เดิม = 1 session, log ครบ — channel mapping หายแล้ว consolidate ไม่ได้)
ALTER TABLE dc_gogo_entries ADD COLUMN IF NOT EXISTS session_id VARCHAR(30) NULL;
UPDATE dc_gogo_entries SET session_id = message_id WHERE session_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_gogo_session ON dc_gogo_entries (guild_id, session_id);

-- 2026-07-08: Org layer (Phase 1 — mapping) — หลาย guild ในเครือ = "องค์กร" เดียว
-- ปัญหา: ระบบ isolate ด้วย guild_id (1 guild = 1 องค์กร) แต่ อาสาฯ+ราชบุรี+(อีก 1) เป็นองค์กรเดียวกัน
--        roster (ngs_member_cache) อยู่ใต้ guild อาสาฯ ที่เดียว → verify/docs ที่ guild อื่นหาชื่อไม่เจอ
-- แก้: ผูก guild ในเครือเข้า org เดียว แล้วให้ roster match/dedup มองข้าม guild ระดับ org
CREATE TABLE IF NOT EXISTS organizations (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  slug       VARCHAR(60) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- org_id NULL = guild ที่ยังไม่ได้อยู่ org ไหน → พฤติกรรมเดิม (isolate per-guild) ยังคงอยู่
ALTER TABLE dc_guilds ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);

-- seed org แรก: อาสาประชาชน (tenant #1) + ผูก guild ในเครือ
INSERT INTO organizations (name, slug) VALUES ('อาสาประชาชน', 'pple')
  ON CONFLICT (slug) DO NOTHING;

-- ผูก 3 guild ในเครือเข้า org pple · upsert เพราะ people's party ยังไม่ถูก bot sync เข้า dc_guilds
-- (bot upsertGuilds ตั้งแค่ name/icon ไม่แตะ org_id → pre-seed org_id ที่นี่ จะอยู่ทนข้าม sync)
INSERT INTO dc_guilds (guild_id, name, org_id, updated_at) VALUES
  ('1340903354037178410', 'อาสาประชาชน',    (SELECT id FROM organizations WHERE slug = 'pple'), NOW()),  -- roster อยู่ที่นี่
  ('1111998833652678757', 'ประชาชนราชบุรี',  (SELECT id FROM organizations WHERE slug = 'pple'), NOW()),
  ('1115613658408566844', 'People''s Party', (SELECT id FROM organizations WHERE slug = 'pple'), NOW())
ON CONFLICT (guild_id) DO UPDATE SET org_id = EXCLUDED.org_id;

-- 2026-07-10: Cooking (/cooking) — ผู้ช่วยครัวส่วนตัว (personal app #1) · spec: md/cooking/COOKING.md
-- เมนู 121 อัน + ingredient master = static JSON (md/cooking/menus.seed.json) → ไม่เข้า DB
-- DB เก็บเฉพาะ state ที่เปลี่ยนต่อผู้ใช้: pantry (มี/หมด) + history (กันซ้ำ 3 วัน)
-- owner = discord user id (snowflake จาก next-auth) เก็บตั้งแต่แรก เผื่อ multi-user (v1 ใช้คนเดียว)
-- ไม่มี FK ผูกตาราง org → bounded ยกออกไป DB/repo ตัวเองทีหลังได้

-- ของในครัว: 1 แถวต่อ (owner, ingredient) ที่ผู้ใช้เคยแตะ
--   status 'have' = มีอยู่ (ใช้ match ว่าทำเมนูไหนได้) · 'out' = หมด → ขึ้น list ไปตลาดอัตโนมัติ
--   ไม่มีแถว = ไม่มีของนั้น และไม่ได้อยู่ list ตลาด (neutral) → กันหลุม "ต้องอัปเดต stock ทุกครั้ง"
CREATE TABLE IF NOT EXISTS cooking_pantry (
  owner       VARCHAR(20) NOT NULL,
  ingredient  VARCHAR(80) NOT NULL,
  status      VARCHAR(8)  NOT NULL DEFAULT 'have' CHECK (status IN ('have','out')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner, ingredient)
);
CREATE INDEX IF NOT EXISTS idx_cooking_pantry_owner_status ON cooking_pantry (owner, status);

-- ประวัติการทำ: กด "ทำแล้ว" → ลง 1 แถว → variety หัก score เมนูที่ซ้ำใน 3 วันล่าสุด
CREATE TABLE IF NOT EXISTS cooking_history (
  id         SERIAL PRIMARY KEY,
  owner      VARCHAR(20) NOT NULL,
  menu_id    VARCHAR(60) NOT NULL,   -- อ้าง id ใน menus.seed.json (ไม่มี FK เพราะเมนูอยู่ JSON)
  cooked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cooking_history_owner_time ON cooking_history (owner, cooked_at DESC);

-- 2026-07-10 (2): Cooking v2 — เมนูย้ายเข้า DB + owner, เข้าใช้ได้โดยไม่ต้อง login (anonymous cookie id)
--   ⚠️ กลับ decision เดิม: เดิมเมนู = static JSON, ไม่มี CRUD → ตอนนี้เมนูเข้า DB มี owner รองรับ
--      เพิ่ม/แก้เมนู, import ด้วย AI, ดูเมนูคนอื่น (public หมด ไม่มี privacy)
--   owner เดิม = discord snowflake (≤20). ตอนนี้ owner อาจเป็น anonymous uuid (cookie) → ขยายเป็น 64
--   widening อย่างเดียว (ไม่ DROP) — discord id เดิมยังพอดี, โค้ดเก่ายัง insert ได้ → deploy-safe
ALTER TABLE cooking_pantry  ALTER COLUMN owner TYPE VARCHAR(64);
ALTER TABLE cooking_history ALTER COLUMN owner TYPE VARCHAR(64);
ALTER TABLE cooking_history ALTER COLUMN menu_id TYPE VARCHAR(80);  -- match cooking_menus.id

-- เมนูทั้งหมด (seed 121 = ระบบ owner NULL · import ของผู้ใช้ = owner = uid) ทุกเมนู public เห็นได้หมด
--   id = slug (seed) หรือ generated (import) · fields ตรงกับ menus.seed.json + image_url
CREATE TABLE IF NOT EXISTS cooking_menus (
  id            VARCHAR(80) PRIMARY KEY,
  owner         VARCHAR(64),                    -- NULL = seed/ระบบ · else = uid เจ้าของ
  name          TEXT        NOT NULL,
  food_groups   JSONB       NOT NULL DEFAULT '[]',
  protein       JSONB       NOT NULL DEFAULT '[]',
  method        TEXT,
  cuisine       TEXT,
  flavor        JSONB       NOT NULL DEFAULT '[]',
  carb_in_dish  BOOLEAN     NOT NULL DEFAULT false,
  ingredients   JSONB       NOT NULL DEFAULT '{"core":[],"optional":[]}',
  staples_used  JSONB       NOT NULL DEFAULT '[]',
  steps         JSONB       NOT NULL DEFAULT '[]',
  gates         JSONB       NOT NULL DEFAULT '{"protein":[],"key":[]}',
  image_emoji   TEXT,
  image_url     TEXT,
  source        VARCHAR(2),                     -- A/B (seed) · U = user import
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cooking_menus_owner ON cooking_menus (owner);

-- วัตถุดิบที่ผู้ใช้เพิ่มเอง (#6) — canonical.json เป็น master static, ตารางนี้ต่อยอดเฉพาะ owner
--   grp = protein/veg/starch/dairy/seasoning (จัดกลุ่ม chip, เคาะ 2026-07-10) · token ไม่ซ้ำต่อ owner
CREATE TABLE IF NOT EXISTS cooking_ingredients (
  id          SERIAL PRIMARY KEY,
  owner       VARCHAR(64) NOT NULL,
  token       VARCHAR(80) NOT NULL,
  label       VARCHAR(80) NOT NULL,
  grp         VARCHAR(16) NOT NULL CHECK (grp IN ('protein','veg','special')),
  tier        VARCHAR(16) NOT NULL DEFAULT 'regular',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner, token)
);
CREATE INDEX IF NOT EXISTS idx_cooking_ingredients_owner ON cooking_ingredients (owner);

-- 2026-07-10: cooking_ingredients grp — เลิกใช้ "ของเฉพาะ" เป็นถังรวมสารพัด (user งงว่าคืออะไร)
--   เปลี่ยนเป็น 5 หมวดที่มีความหมายจริง: protein(เนื้อสัตว์/อาหารทะเล/ไข่/เต้าหู้) ·
--   veg(ผักและผลไม้/เห็ด) · starch(แป้ง/ธัญพืช/เส้น) · dairy(ไขมันและนม) ·
--   seasoning(เครื่องปรุงและสมุนไพร รวมผักสวนครัวอย่างหอมใหญ่) — ตรงกับ canonical.json ที่จัดใหม่แล้ว
-- ⚠️ ต้อง DROP constraint เดิมก่อน UPDATE เสมอ (ค่าใหม่ starch/dairy ยังไม่อยู่ใน constraint เก่า)
ALTER TABLE cooking_ingredients DROP CONSTRAINT cooking_ingredients_grp_check;

UPDATE cooking_ingredients SET grp = 'starch'
  WHERE grp = 'special' AND token IN ('วุ้นเส้น','เส้นก๋วยเตี๋ยว','เส้นราเมน','เส้นพาสต้า','ข้าวเหนียว');
UPDATE cooking_ingredients SET grp = 'dairy'
  WHERE grp = 'special' AND token IN ('ชีส','นมสด','คุกกี้ครีม');
UPDATE cooking_ingredients SET grp = 'veg'
  WHERE grp = 'special' AND token IN ('กุยช่าย','สับปะรด','มะพร้าว');
UPDATE cooking_ingredients SET grp = 'protein'
  WHERE grp = 'special' AND token IN ('เต้าหู้','ถั่วชิกพี','ไข่เค็ม');
UPDATE cooking_ingredients SET grp = 'seasoning'
  WHERE grp = 'special' AND token IN ('กะทิ','กะปิ','ผงกะหรี่','เครื่องแกง','มิโซะ','ซอสเกาหลี','มายองเนส','น้ำตาล','รสดี');
UPDATE cooking_ingredients SET grp = 'seasoning'
  WHERE grp = 'veg' AND token = 'หอมใหญ่';

ALTER TABLE cooking_ingredients ADD CONSTRAINT cooking_ingredients_grp_check
  CHECK (grp IN ('protein','veg','starch','dairy','seasoning'));

-- 2026-07-11: Cooking v3 — menus/ingredients กลับเป็น public wiki (ไม่มีเจ้าของ ใครก็แก้/ลบได้)
--   pantry(มี/หมด)+history(ทำแล้ว) แยกไปผูกกับ "ครัว" (kitchen) แทนคนคนเดียว — เพื่อให้หลายคนช่วยกัน
--   จัดการครัวเดียวกันได้ (เช่น Mean ช่วย Tee ซื้อของ/ติ๊กสถานะแทนได้) โดย pantry/history ยังเป็นส่วนตัวต่อครัว
-- ⚠️ ต้องรัน scripts/cooking/migrateOwnersToKitchens.js คั่นระหว่าง PART A กับ PART C ด้านล่าง
--   (PART A เปิดทางให้ backfill เขียนได้ก่อน, PART C ปิดผนึกหลัง backfill เสร็จ)

-- ── PART A: สร้างตาราง kitchen + เปิด column kitchen_id (nullable ชั่วคราว) ──
CREATE TABLE IF NOT EXISTS cooking_kitchens (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,
  owner       VARCHAR(64) NOT NULL,  -- ผู้สร้าง — เก็บไว้เป็นข้อมูล ไม่ได้ใช้ gate สิทธิ์
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cooking_kitchen_members (
  kitchen_id  INT NOT NULL REFERENCES cooking_kitchens(id) ON DELETE CASCADE,
  member      VARCHAR(64) NOT NULL,  -- discord id หรือ anon uid
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (kitchen_id, member)
);
CREATE INDEX IF NOT EXISTS idx_cooking_kitchen_members_member ON cooking_kitchen_members (member);

ALTER TABLE cooking_pantry  ADD COLUMN IF NOT EXISTS kitchen_id INT REFERENCES cooking_kitchens(id);
ALTER TABLE cooking_history ADD COLUMN IF NOT EXISTS kitchen_id INT REFERENCES cooking_kitchens(id);

-- ── (รัน scripts/cooking/migrateOwnersToKitchens.js ตรงนี้ — สร้าง 1 ครัวต่อ owner เดิม, เติม kitchen_id ให้ทุกแถว) ──

-- ── PART C: ปิดผนึก — kitchen_id เป็น NOT NULL, ตัด owner ออกจาก pantry/history ──
ALTER TABLE cooking_pantry  ALTER COLUMN kitchen_id SET NOT NULL;
ALTER TABLE cooking_history ALTER COLUMN kitchen_id SET NOT NULL;
ALTER TABLE cooking_pantry  DROP CONSTRAINT cooking_pantry_pkey;
ALTER TABLE cooking_pantry  DROP COLUMN owner;
ALTER TABLE cooking_pantry  ADD PRIMARY KEY (kitchen_id, ingredient);
ALTER TABLE cooking_history DROP COLUMN owner;
CREATE INDEX IF NOT EXISTS idx_cooking_pantry_kitchen_status ON cooking_pantry (kitchen_id, status);
CREATE INDEX IF NOT EXISTS idx_cooking_history_kitchen_time ON cooking_history (kitchen_id, cooked_at DESC);
DROP INDEX IF EXISTS idx_cooking_pantry_owner_status;
DROP INDEX IF EXISTS idx_cooking_history_owner_time;

-- ── cooking_ingredients: unique เดิมคือ (owner, token) → เปลี่ยนเป็น (token) เดียว (public wiki เดียว ไม่แยกต่อคน) ──
ALTER TABLE cooking_ingredients DROP CONSTRAINT cooking_ingredients_owner_token_key;
ALTER TABLE cooking_ingredients ADD CONSTRAINT cooking_ingredients_token_key UNIQUE (token);
-- cooking_menus.owner: เก็บคอลัมน์ไว้เป็นข้อมูล "ใครสร้าง" เฉยๆ ไม่ได้ ALTER อะไร — โค้ดแค่เลิกเช็คตอน update/delete

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-15 เป็นต้นไป — บล็อกของ org ทั้งหมดย้ายไป scripts/migration/org-scope/
--   · 00-org-roles.sql          คลังคำ permission (ไฟล์ 11 มี FK มาหา)
--   · 11-org-access-tables.sql  org_scope_nodes/org_role_defs/org_member_roles
--                               · enabled_features ขึ้น org_config · ที่อยู่ใน org_members
--   · _superseded/              ของที่ 01 ทำแทนแล้ว + finance expand ที่ตายแล้ว (ห้ามรัน)
-- ทั้งชุด cutover รันตามลำดับด้วย org-scope/rehearse.sh — ดู org-scope/README.md
-- ═══════════════════════════════════════════════════════════════════════════
