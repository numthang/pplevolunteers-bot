-- Calling System — Database Migration
-- รัน script นี้ครั้งเดียวก่อน import ข้อมูล
-- ตรวจ error แต่ละ statement ก่อน proceed ถัดไป

-- ─────────────────────────────────────────────
-- 1. dc_members — เพิ่ม identity fields
-- ─────────────────────────────────────────────
ALTER TABLE dc_members
  ADD COLUMN phone      VARCHAR(20)  NULL AFTER discord_id,
  ADD COLUMN line_id    VARCHAR(100) NULL AFTER phone,
  ADD COLUMN google_id  VARCHAR(100) NULL AFTER line_id;

-- ─────────────────────────────────────────────
-- 2. calling_members_bq — จำลอง BigQuery (import จาก XLS)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calling_members_bq (
  member_id     VARCHAR(20)   NOT NULL,
  prefix        VARCHAR(20)   NULL,
  name          VARCHAR(200)  NOT NULL,
  member_type   VARCHAR(50)   NULL COMMENT 'รายปี / ตลอดชีพ',
  district      VARCHAR(100)  NULL COMMENT 'อำเภอ',
  subdistrict   VARCHAR(100)  NULL COMMENT 'ตำบล',
  province      VARCHAR(100)  NULL,
  phone         VARCHAR(20)   NULL,
  line_id       VARCHAR(100)  NULL COMMENT 'LINE Identity (ใช้ link)',
  line_username VARCHAR(100)  NULL COMMENT 'LINE contact ที่สมาชิกให้มา',
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id)
);

-- ─────────────────────────────────────────────
-- 3. calling_campaigns — รอบ/กิจกรรมการโทร
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calling_campaigns (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200)  NOT NULL,
  description  TEXT          NULL,
  province     VARCHAR(100)  NULL COMMENT 'จังหวัดที่ campaign นี้ดูแล',
  act_id       VARCHAR(100)  NULL COMMENT 'ref ไปยัง ACT activity (optional)',
  created_by   VARCHAR(20)   NOT NULL COMMENT 'discord_id',
  created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- 4. calling_assignments — assign สมาชิกให้คนโทร
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calling_assignments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id   INT          NOT NULL,
  member_id     VARCHAR(20)  NOT NULL COMMENT 'รหัสสมาชิกพรรค',
  assigned_to   VARCHAR(20)  NOT NULL COMMENT 'discord_id ของคนรับผิดชอบ',
  assigned_by   VARCHAR(20)  NOT NULL COMMENT 'discord_id ของคนที่ assign',
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_member (campaign_id, member_id)
);

-- ─────────────────────────────────────────────
-- 5. calling_logs — บันทึกการโทรแต่ละครั้ง
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calling_logs (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id        INT          NOT NULL,
  member_id          VARCHAR(20)  NOT NULL COMMENT 'รหัสสมาชิกพรรค',
  called_by          VARCHAR(20)  NULL     COMMENT 'discord_id คนที่โทร (NULL ถ้า import จาก XLS)',
  caller_name        VARCHAR(100) NULL     COMMENT 'display_name ตอนโทร',
  called_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  status             ENUM('answered','no_answer','busy','wrong_number') NOT NULL,
  sig_overall        TINYINT NULL COMMENT '1=D 2=C 3=B 4=A (caller overall grade per call)',
  sig_location       TINYINT NULL COMMENT '1=ต่างประเทศ 2=ต่างจังหวัด 3=ในจังหวัด 4=ในอำเภอ',
  sig_availability   TINYINT NULL COMMENT '1=ไม่ว่างเลย 2=ไม่ค่อยว่าง 3=ว่างบ้าง 4=ว่างมาก',
  sig_interest       TINYINT NULL COMMENT '1=ไม่สนใจ 2=สนใจนิดหน่อย 3=สนใจ 4=กระตือรือร้น',
  sig_reachable      TINYINT NULL COMMENT '1=ไม่ติดเลย 2=ติดยาก 3=ติดได้ 4=รับสายทันที',
  note               TEXT NULL,
  extra              JSON NULL COMMENT 'custom fields เพิ่มเติม',
  created_at         DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- 6. calling_member_tiers — tier ปัจจุบันของสมาชิก
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calling_member_tiers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  member_id       VARCHAR(20)  NOT NULL,
  tier            ENUM('A','B','C','D') NOT NULL,
  tier_source     ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  override_by     VARCHAR(20)  NULL COMMENT 'discord_id คนที่ override (manual เท่านั้น)',
  override_reason TEXT         NULL,
  custom_fields   JSON         NULL,
  updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_member (member_id)
);
