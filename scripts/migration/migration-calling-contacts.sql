-- Migration: calling_contacts + contact_type support
-- Run: mysql -u pple_dcbot -p pple_volunteers < scripts/calling/migration-calling-contacts.sql

-- 1. New table for manual contacts
CREATE TABLE IF NOT EXISTS calling_contacts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  guild_id    VARCHAR(20)  NOT NULL,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  phone       VARCHAR(20)  NULL,
  email       VARCHAR(150) NULL,
  line_id     VARCHAR(100) NULL,
  category    VARCHAR(50)  NULL COMMENT 'donor, prospect, volunteer, other',
  province    VARCHAR(100) NULL,
  amphoe      VARCHAR(100) NULL,
  tambon      VARCHAR(100) NULL,
  note        TEXT         NULL,
  created_by  VARCHAR(20)  NULL COMMENT 'discord_id',
  updated_by  VARCHAR(20)  NULL COMMENT 'discord_id',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_province (province),
  INDEX idx_phone    (phone),
  INDEX idx_guild    (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. calling_logs: add contact_type
ALTER TABLE calling_logs
  ADD COLUMN contact_type ENUM('member','contact') NOT NULL DEFAULT 'member' AFTER campaign_id;

-- 3. calling_assignments: add contact_type, update unique key
ALTER TABLE calling_assignments
  ADD COLUMN contact_type ENUM('member','contact') NOT NULL DEFAULT 'member' AFTER campaign_id,
  DROP INDEX uq_member,
  ADD UNIQUE KEY uq_member_contact (member_id, contact_type);

-- 4. calling_member_tiers: add contact_type, update unique key
ALTER TABLE calling_member_tiers
  ADD COLUMN contact_type ENUM('member','contact') NOT NULL DEFAULT 'member' AFTER id,
  DROP INDEX uq_member,
  ADD UNIQUE KEY uq_member_contact (member_id, contact_type);
