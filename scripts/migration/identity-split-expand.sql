-- ═══════════════════════════════════════════════════════════════════════════
-- Identity / Membership split — BUILD users + org_members  (2026-07-16 final)
-- ═══════════════════════════════════════════════════════════════════════════
-- users = LEAN identity (แค่ตัวตนสำหรับ login) · org_members = ทุกอย่างที่เหลือ (profile+membership)
-- เหตุผล: 1 คนมักอยู่ 1 org → ไม่ห่วง duplication → identity นิ่ง สะอาด
-- dedup: dc_members หลายแถว/คน (per guild) → users 1 แถว/คน (canonical = MIN(id) ต่อ discord_id)
-- dc_members ไม่แตะ (bot+web เดิมรันต่อได้) · repoint โค้ด + contract เฟสถัดไป
--
-- ⚠️ REBUILD: DROP + CREATE users & org_members ใหม่ (derive จาก dc_members ทั้งหมด)
--    org_members เดิม (email memberships) หาย · PROD: backup ก่อนถ้ามีของจริง
-- ⚠️ ไม่ auto-link Discord↔email → คนละ users · merge บัญชีตัวเองทำแยก
-- ═══════════════════════════════════════════════════════════════════════════

-- 0) mapping ทุกแถว dc_members → canonical user id
CREATE TEMP TABLE _idmap ON COMMIT DROP AS
SELECT id AS member_id,
       CASE WHEN discord_id IS NULL THEN id
            ELSE MIN(id) OVER (PARTITION BY discord_id) END AS user_id
FROM dc_members;

DROP TABLE IF EXISTS org_members CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ── users = LEAN identity (1 คน 1 แถว) · id = canonical dc_members.id ──
CREATE TABLE users (
  id                INT PRIMARY KEY,            -- = canonical dc_members.id (ไม่ churn ref)
  discord_id        VARCHAR(20),
  email             VARCHAR(255),
  google_id         VARCHAR(64),
  username          VARCHAR(255),
  phone             VARCHAR(32),
  phone_verified_at TIMESTAMPTZ,
  line_id           VARCHAR(255),
  firstname         VARCHAR(255),
  lastname          VARCHAR(255),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_users_discord ON users (discord_id) WHERE discord_id IS NOT NULL;
CREATE UNIQUE INDEX uq_users_email   ON users (email)      WHERE email IS NOT NULL;

INSERT INTO users (id, discord_id, email, google_id, username, phone, phone_verified_at, line_id, firstname, lastname)
SELECT m.id, m.discord_id, m.email, m.google_id, m.username, m.phone, m.phone_verified_at, m.line_id, m.firstname, m.lastname
FROM dc_members m
JOIN _idmap im ON im.member_id = m.id AND im.user_id = m.id;   -- canonical เท่านั้น

-- ── org_members = membership + profile (ต่อ คน×guild) · id หน้าสุด ──
CREATE TABLE org_members (
  id                BIGSERIAL PRIMARY KEY,
  -- keys
  user_id           INT NOT NULL REFERENCES users(id),
  org_id            INT REFERENCES orgs(id),
  guild_id          VARCHAR(20),
  -- membership
  role              VARCHAR(40)  NOT NULL DEFAULT 'member',   -- owner/member (คุม org)
  status            VARCHAR(12)  NOT NULL DEFAULT 'active',   -- active/invited
  invited_by        INT REFERENCES users(id),
  joined_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  registered_at     TIMESTAMPTZ,
  -- roles (feature permission)
  roles             TEXT,                                     -- ชื่อ Discord role (ต่อ guild)
  web_roles         TEXT,                                     -- key จาก org_roles (web grant)
  roles_assigned_at TIMESTAMPTZ,
  -- ตำแหน่งใน org
  position          VARCHAR(255),
  member_id         INT,                                      -- เลขสมาชิกองค์กร
  serial            VARCHAR(64),
  -- พื้นที่ปักหลักใน org (scope งาน — จังหวัดรับผิดชอบจริงมาจาก roles)
  province          TEXT,
  region            VARCHAR(255),
  -- โชว์ต่อ server
  display_name      VARCHAR(255),
  avatar            TEXT,
  nickname          VARCHAR(255),
  specialty         TEXT,
  -- context
  interests         TEXT,
  referred_by       VARCHAR(255),
  -- profile ส่วนตัว (ย้ายจาก dc_members — lean users) · line_id อยู่ users (contact คู่ phone)
  amphoe            VARCHAR(255),
  primary_province  VARCHAR(255),
  bank_name         VARCHAR(255),
  account_no        VARCHAR(64),
  account_holder    VARCHAR(255),
  id_card_image     BYTEA,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- Discord = 1/user/guild · email (guild_id NULL) = 1/user/org
CREATE UNIQUE INDEX uq_om_user_guild ON org_members (user_id, guild_id) WHERE guild_id IS NOT NULL;
CREATE UNIQUE INDEX uq_om_user_org   ON org_members (user_id, org_id)   WHERE guild_id IS NULL;
CREATE INDEX idx_om_user ON org_members (user_id);
CREATE INDEX idx_om_org  ON org_members (org_id);

-- backfill membership จาก dc_members (แถว Discord) → 1 แถว/คน/guild
INSERT INTO org_members (
  user_id, org_id, guild_id, roles, web_roles, roles_assigned_at,
  position, member_id, serial, province, region,
  display_name, avatar, nickname, specialty, interests, referred_by, registered_at,
  amphoe, primary_province, bank_name, account_no, account_holder, id_card_image,
  role, status
)
SELECT
  im.user_id, g.org_id, m.guild_id, m.roles, m.web_roles, m.roles_assigned_at,
  m.position, m.member_id, m.serial, m.province, m.region,
  m.display_name, m.avatar, m.nickname, m.specialty, m.interests, m.referred_by, m.registered_at,
  m.amphoe, m.primary_province, m.bank_name, m.account_no, m.account_holder, m.id_card_image,
  'member', 'active'
FROM dc_members m
JOIN _idmap im   ON im.member_id = m.id
JOIN dc_guilds g ON g.guild_id  = m.guild_id
WHERE m.discord_id IS NOT NULL
ON CONFLICT (user_id, guild_id) WHERE guild_id IS NOT NULL DO NOTHING;
