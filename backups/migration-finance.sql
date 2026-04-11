-- Migration: Finance System
-- รัน: mysql -u pple_dcbot -p pple_volunteers < scripts/migration-finance.sql

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS finance_account_rules;
DROP TABLE IF EXISTS finance_transactions;
DROP TABLE IF EXISTS finance_accounts;
DROP TABLE IF EXISTS finance_categories;
DROP TABLE IF EXISTS finance_config;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS finance_accounts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  guild_id        VARCHAR(20)  NOT NULL,
  owner_id        VARCHAR(20)  NOT NULL,
  name            VARCHAR(100) NOT NULL,
  bank            VARCHAR(50)  DEFAULT NULL,
  account_no      VARCHAR(50)  DEFAULT NULL,
  visibility      ENUM('private','internal','public') NOT NULL DEFAULT 'private',
  province        VARCHAR(50)  DEFAULT NULL,
  notify_income   TINYINT      NOT NULL DEFAULT 1,
  notify_expense  TINYINT      NOT NULL DEFAULT 1,
  email_inbox     VARCHAR(100) DEFAULT NULL,
  usage_count     INT          NOT NULL DEFAULT 0,
  updated_by      VARCHAR(20)  DEFAULT NULL,
  updated_at      DATETIME     DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild (guild_id),
  INDEX idx_owner (owner_id)
);

CREATE TABLE IF NOT EXISTS finance_categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  guild_id    VARCHAR(20)  DEFAULT NULL,
  owner_id    VARCHAR(20)  DEFAULT NULL,
  name        VARCHAR(100) NOT NULL,
  icon        VARCHAR(10)  DEFAULT NULL,
  is_global   TINYINT      NOT NULL DEFAULT 0,
  usage_count INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild (guild_id)
);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  guild_id       VARCHAR(20)    NOT NULL,
  account_id     INT            NOT NULL,
  type           ENUM('income','expense') NOT NULL,
  amount         DECIMAL(12,2)  NOT NULL,
  description    TEXT           DEFAULT NULL,
  category_id    INT            DEFAULT NULL,
  counterpart_name    VARCHAR(100)   DEFAULT NULL,
  counterpart_account VARCHAR(50)    DEFAULT NULL,
  counterpart_bank    VARCHAR(50)    DEFAULT NULL,
  fee                 DECIMAL(8,2)   DEFAULT NULL,
  balance_after       DECIMAL(12,2)  DEFAULT NULL,
  evidence_url        TEXT           DEFAULT NULL,
  ref_id         VARCHAR(100)   DEFAULT NULL,
  discord_msg_id VARCHAR(20)    DEFAULT NULL,
  txn_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by     VARCHAR(20)    DEFAULT NULL,
  updated_at     DATETIME       DEFAULT NULL,
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ref (ref_id),
  INDEX idx_guild (guild_id),
  INDEX idx_account (account_id),
  INDEX idx_txn_at (txn_at),
  FOREIGN KEY (account_id)  REFERENCES finance_accounts(id)  ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES finance_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS finance_account_rules (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  account_id  INT          NOT NULL,
  match_name  VARCHAR(255) NOT NULL,
  category_id INT          DEFAULT NULL,
  usage_count INT          NOT NULL DEFAULT 0,
  updated_at  DATETIME     DEFAULT NULL,
  INDEX idx_account (account_id),
  FOREIGN KEY (account_id)  REFERENCES finance_accounts(id)  ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES finance_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS finance_config (
  guild_id         VARCHAR(20) PRIMARY KEY,
  channel_id       VARCHAR(20) DEFAULT NULL,
  thread_id        VARCHAR(20) DEFAULT NULL,
  account_ids      TEXT        DEFAULT NULL,
  dashboard_msg_id VARCHAR(20) DEFAULT NULL,
  updated_at       DATETIME    DEFAULT NULL
);

-- Global categories เริ่มต้น
INSERT IGNORE INTO finance_categories (guild_id, name, is_global) VALUES
  (NULL, 'ค่าอาหาร',        1),
  (NULL, 'ค่าเดินทาง',      1),
  (NULL, 'ค่าอุปกรณ์',      1),
  (NULL, 'ค่าสถานที่',      1),
  (NULL, 'ค่าสื่อและพิมพ์', 1),
  (NULL, 'รายรับบริจาค',    1),
  (NULL, 'รายรับค่าสมาชิก', 1),
  (NULL, 'อื่นๆ',           1);
