-- ============================================================
-- ngs_member_cache — Cache table from party ngs_member
-- Source: ngs_member (remote DB, party system)
-- Sync:   scripts/calling/import-ngs-member-cache.js
-- ⚠️  Do NOT edit rows directly — pull from source only
-- ============================================================

CREATE TABLE IF NOT EXISTS ngs_member_cache (
  -- Identity
  source_id                               INT             NOT NULL PRIMARY KEY,  -- id from ngs_member
  serial                                  VARCHAR(20)     NULL,                  -- หมายเลขสมาชิก (display only)
  title                                   VARCHAR(20)     NULL,
  first_name                              VARCHAR(100)    NOT NULL,
  last_name                               VARCHAR(100)    NOT NULL,
  full_name                               VARCHAR(200)    NULL,
  old_full_name                           VARCHAR(200)    NULL,
  gender                                  VARCHAR(10)     NULL,
  date_of_birth                           DATE            NULL,
  race                                    VARCHAR(50)     NULL,
  was_born_in_thai_nationality            VARCHAR(10)     NULL,
  is_foreigner                            TINYINT         DEFAULT 0,
  identification_number                   VARCHAR(20)     NULL,

  -- Contact
  mobile_number                           VARCHAR(20)     NULL,
  email                                   VARCHAR(150)    NULL,
  line_id                                 VARCHAR(100)    NULL,
  line_group_joined                       VARCHAR(50)     NULL,
  facebook_id                             TEXT            NULL,
  facebook_group_joined                   VARCHAR(50)     NULL,

  -- Home address (registered)
  register_home_address_id               INT             NULL,
  home_house_number                       VARCHAR(50)     NULL,
  home_house_group_number                 VARCHAR(20)     NULL,
  home_village                            VARCHAR(100)    NULL,
  home_alley                              VARCHAR(100)    NULL,
  home_road                               VARCHAR(100)    NULL,
  home_district                           VARCHAR(100)    NULL,   -- ตำบล
  home_amphure                            VARCHAR(100)    NULL,   -- อำเภอ
  home_province                           VARCHAR(100)    NULL,   -- จังหวัด
  home_zip_code                           VARCHAR(10)     NULL,
  home_constituency                       VARCHAR(20)     NULL,
  home_province_id                        INT             NULL,

  -- Current address
  house_number                            VARCHAR(50)     NULL,
  house_group_number                      VARCHAR(20)     NULL,
  village                                 VARCHAR(100)    NULL,
  alley                                   VARCHAR(100)    NULL,
  road                                    VARCHAR(100)    NULL,
  district                                VARCHAR(100)    NULL,   -- ตำบล
  amphure                                 VARCHAR(100)    NULL,   -- อำเภอ
  province                                VARCHAR(100)    NULL,   -- จังหวัด
  zip_code                                VARCHAR(10)     NULL,
  province_id                             INT             NULL,
  address                                 TEXT            NULL,
  address_complement                      TEXT            NULL,
  city                                    VARCHAR(100)    NULL,
  state                                   VARCHAR(100)    NULL,
  country                                 VARCHAR(100)    NULL,

  -- Membership
  membership_type                         VARCHAR(50)     NULL,
  card_type                               VARCHAR(50)     NULL,
  ect_register_date                       DATE            NULL,
  expired_at                              DATETIME        NULL,
  law_expired_at                          DATETIME        NULL,
  renew_at                                DATETIME        NULL,
  registration_method                     VARCHAR(50)     NULL,

  -- Membership status
  latest_state                            VARCHAR(50)     NULL,
  latest_card_state                       VARCHAR(100)    NULL,
  latest_ect_state                        VARCHAR(50)     NULL,
  latest_province_state                   VARCHAR(100)    NULL,
  ect_state                               VARCHAR(50)     NULL,
  ect_remark                              VARCHAR(200)    NULL,
  ect_description                         TEXT            NULL,

  -- Approval
  created_by                              VARCHAR(100)    NULL,
  created_at                              DATETIME        NULL,
  approved_at                             DATETIME        NULL,
  approved_by                             VARCHAR(100)    NULL,
  province_document_approved_at           DATETIME        NULL,
  province_document_approved_by           VARCHAR(100)    NULL,
  province_document_rejected_at           DATETIME        NULL,
  province_document_rejected_by          VARCHAR(100)    NULL,

  -- Payment
  order_id                                VARCHAR(50)     NULL,
  receipt_book                            VARCHAR(20)     NULL,
  receipt_number                          VARCHAR(50)     NULL,
  payment_status                          VARCHAR(50)     NULL,
  payment_type                            VARCHAR(100)    NULL,
  amount                                  DECIMAL(10,2)   NULL,
  description                             TEXT            NULL,
  paid_at                                 DATETIME        NULL,
  first_approved_payment_at               DATETIME        NULL,

  -- Card delivery
  card_delivery_method                    VARCHAR(200)    NULL,
  card_delivery_address                   TEXT            NULL,

  -- Work & background
  current_job                             VARCHAR(100)    NULL,
  job_position                            VARCHAR(100)    NULL,
  company                                 VARCHAR(200)    NULL,
  job_experience                          VARCHAR(200)    NULL,
  network                                 VARCHAR(100)    NULL,
  network_description                     TEXT            NULL,

  -- Political background
  has_registered_any_political_position   VARCHAR(50)     NULL,
  has_took_any_political_position         VARCHAR(50)     NULL,
  property_question_one                   VARCHAR(50)     NULL,
  property_question_two                   VARCHAR(50)     NULL,
  property_question_two_political_party_name VARCHAR(100) NULL,
  is_privacy_accepted                     VARCHAR(20)     NULL,

  -- Sync tracking
  synced_at                               DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_serial        (serial),
  INDEX idx_home_province (home_province),
  INDEX idx_home_amphure  (home_amphure),
  INDEX idx_province      (province),
  INDEX idx_amphure       (amphure),
  INDEX idx_name          (first_name, last_name),
  INDEX idx_mobile        (mobile_number),
  INDEX idx_line_id       (line_id),
  INDEX idx_membership    (membership_type),
  INDEX idx_latest_state  (latest_state),
  INDEX idx_prov_dist     (home_province, home_amphure)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
