-- ACT Event Cache Table
-- WordPress-style hierarchical events: campaigns and registrations

CREATE TABLE IF NOT EXISTS act_event_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT NULL,
  guild_id VARCHAR(20) NOT NULL DEFAULT '1',
  type ENUM('campaign', 'register') NOT NULL DEFAULT 'register',

  -- Campaign fields
  name VARCHAR(255),
  province VARCHAR(100),
  description TEXT,

  -- Registration fields
  user_id INT,
  serial_number VARCHAR(100),
  title VARCHAR(20),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  national_id VARCHAR(13),
  address TEXT,
  subdistrict VARCHAR(100),
  district VARCHAR(100),
  postal_code VARCHAR(10),
  age INT,
  gender VARCHAR(10),
  account_no VARCHAR(50),
  bank VARCHAR(50),
  membership_status VARCHAR(100),

  -- Cache metadata
  data_hash VARCHAR(64),
  synced_at TIMESTAMP,
  source_timestamp TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_parent (parent_id),
  INDEX idx_user (user_id),
  INDEX idx_guild (guild_id),
  INDEX idx_type (type),
  INDEX idx_synced (synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
