-- dc_guilds: เก็บ guild ที่ bot อยู่ — upsert โดย bot ทุกครั้งที่ start
CREATE TABLE IF NOT EXISTS dc_guilds (
  guild_id   VARCHAR(20)  NOT NULL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  icon_url   VARCHAR(500) NULL,
  updated_at DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- finance_accounts: ให้ guild_id แก้ไขได้ (Admin)
-- ไม่มีอะไรเพิ่ม เพราะ guild_id มีอยู่แล้ว
