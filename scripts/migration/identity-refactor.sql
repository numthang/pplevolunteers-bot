-- ═══════════════════════════════════════════════════════════════════════════
-- IDENTITY REFACTOR — consolidated migration (ไฟล์เดียว)
-- ═══════════════════════════════════════════════════════════════════════════
-- รวมจาก: migration.sql (Phase 0/1 identity) + identity-split-expand.sql
--         + identity-split-user-identities.sql + identity-users-seq.sql
--         + identity-rename-dc-members.sql
--
-- ทำอะไร: แปลงโลก dc_members → identity/tenant model ใหม่
--   • orgs                = tenant (rename จาก organizations)
--   • users               = LEAN identity (1 คน 1 แถว, canonical = MIN(dc_members.id)/discord_id)
--   • org_members         = membership + profile (1 คน×guild/org)
--   • user_identities     = ทุกประตู login → users.id (discord กลายเป็น provider row)
--   • dc_members          → rename เป็น _dc_members (contract, เก็บไว้ rollback ได้)
--
-- PREREQ (ไม่สร้างให้ = base PPLE schema): dc_members (คอลัมน์ครบ), dc_guilds,
--   dc_user_identities (หรือ user_identities ถ้า rename แล้ว)
-- OUT OF SCOPE (ไฟล์แยก): org_roles (RBAC) · finance org_id/owner_user_id expand
--   (FK → dc_members = งาน canonical remap แยก)
--
-- คุณสมบัติ: idempotent + rerunnable (normalize-source รองรับทั้ง dc_members และ
--   _dc_members เป็น input) · ทดสอบได้ใน BEGIN…ROLLBACK (DDL transactional)
-- ⚠️ DESTRUCTIVE: DROP+CREATE users/org_members (rebuild จาก dc_members) →
--   membership + identity ที่ไม่ได้ derive จาก dc_members (self-serve org, invite,
--   email/google signup) จะหาย · user_identities orphan ถูกลบ (step 7)
-- ⛔ prod: รันครั้งเดียวตอน cutover + backup ก่อน · dev: รันซ้ำได้
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0) NORMALIZE SOURCE — ให้ dc_members เป็นชื่อ source ระหว่าง migrate ──────
--    (rerun หลัง contract แล้ว: _dc_members → dc_members ชั่วคราว, ค่อย rename กลับตอนจบ)
DO $$ BEGIN
  IF to_regclass('public._dc_members') IS NOT NULL AND to_regclass('public.dc_members') IS NULL THEN
    ALTER TABLE _dc_members RENAME TO dc_members;
  END IF;
END $$;

-- ── 1) dc_members — email + web_roles + ปลด NOT NULL (email/shell row) ───────
ALTER TABLE dc_members ADD COLUMN IF NOT EXISTS email     VARCHAR(255);
ALTER TABLE dc_members ADD COLUMN IF NOT EXISTS web_roles TEXT;
ALTER TABLE dc_members ALTER COLUMN discord_id DROP NOT NULL;
ALTER TABLE dc_members ALTER COLUMN username   DROP NOT NULL;
ALTER TABLE dc_members ALTER COLUMN guild_id   DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dc_members_email ON dc_members (email) WHERE email IS NOT NULL;

-- ── 2) orgs (tenant) + dc_guilds.org_id + seed ──────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.organizations') IS NOT NULL AND to_regclass('public.orgs') IS NULL THEN
    ALTER TABLE organizations RENAME TO orgs;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS orgs (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  slug       VARCHAR(60) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE dc_guilds ADD COLUMN IF NOT EXISTS org_id INT REFERENCES orgs(id);
INSERT INTO orgs (name, slug) VALUES ('อาสาประชาชน', 'pple') ON CONFLICT (slug) DO NOTHING;
INSERT INTO dc_guilds (guild_id, name, org_id, updated_at) VALUES
  ('1340903354037178410', 'อาสาประชาชน',    (SELECT id FROM orgs WHERE slug = 'pple'), NOW()),
  ('1111998833652678757', 'ประชาชนราชบุรี',  (SELECT id FROM orgs WHERE slug = 'pple'), NOW()),
  ('1115613658408566844', 'People''s Party', (SELECT id FROM orgs WHERE slug = 'pple'), NOW())
ON CONFLICT (guild_id) DO UPDATE SET org_id = EXCLUDED.org_id;

-- ── 3) org_login_tokens (magic-link email login) ────────────────────────────
CREATE TABLE IF NOT EXISTS org_login_tokens (
  token      VARCHAR(64)  PRIMARY KEY,
  email      VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 4) user_identities — rename จาก dc_user_identities (ถ้ายัง) + base table ──
DO $$ BEGIN
  IF to_regclass('public.dc_user_identities') IS NOT NULL AND to_regclass('public.user_identities') IS NULL THEN
    ALTER TABLE dc_user_identities RENAME TO user_identities;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS user_identities (
  id          SERIAL PRIMARY KEY,
  discord_id  VARCHAR(20),                     -- nullable: email-only identity ผูกได้
  provider    VARCHAR(20) NOT NULL,
  provider_id TEXT        NOT NULL,
  credential  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_discord ON user_identities (discord_id);

-- ── 5) BUILD users + org_members จาก dc_members ─────────────────────────────
-- mapping ทุกแถว dc_members → canonical user id (MIN(id) ต่อ discord_id · email row = ตัวเอง)
CREATE TEMP TABLE _idmap ON COMMIT DROP AS
SELECT id AS member_id,
       CASE WHEN discord_id IS NULL THEN id
            ELSE MIN(id) OVER (PARTITION BY discord_id) END AS user_id
FROM dc_members;

DROP TABLE IF EXISTS org_members CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- users = LEAN identity (id = canonical dc_members.id)
CREATE TABLE users (
  id                INT PRIMARY KEY,
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

-- org_members = membership + profile (ต่อ คน×guild)
CREATE TABLE org_members (
  id                BIGSERIAL PRIMARY KEY,
  user_id           INT NOT NULL REFERENCES users(id),
  org_id            INT REFERENCES orgs(id),
  guild_id          VARCHAR(20),
  role              VARCHAR(40)  NOT NULL DEFAULT 'member',   -- owner/member (คุม org)
  status            VARCHAR(12)  NOT NULL DEFAULT 'active',   -- active/invited
  invited_by        INT REFERENCES users(id),
  joined_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  registered_at     TIMESTAMPTZ,
  roles             TEXT,                                     -- ชื่อ Discord role (ต่อ guild)
  web_roles         TEXT,                                     -- key จาก org_roles (web grant)
  roles_assigned_at TIMESTAMPTZ,
  position          VARCHAR(255),
  member_id         INT,
  serial            VARCHAR(64),
  province          TEXT,
  region            VARCHAR(255),
  display_name      VARCHAR(255),
  avatar            TEXT,
  nickname          VARCHAR(255),
  specialty         TEXT,
  interests         TEXT,
  referred_by       VARCHAR(255),
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

-- ── 6) users.id sequence default (create-on-login: discord/email door ใหม่) ──
CREATE SEQUENCE IF NOT EXISTS users_id_seq OWNED BY users.id;
SELECT setval('users_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM users), 1));
ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq');

-- ── 7) user_identities → key ด้วย user_id + discord = provider row ──────────
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS user_id INT;
ALTER TABLE user_identities ALTER COLUMN discord_id DROP NOT NULL;

-- backfill user_id ให้ row เดิม (line/google/passkey) จาก discord_id → users.id
UPDATE user_identities ui
   SET user_id = u.id
  FROM users u
 WHERE u.discord_id = ui.discord_id
   AND ui.user_id IS NULL;

-- Discord = provider row (provider_id = snowflake) ให้ users ที่มี discord ทุกคน
INSERT INTO user_identities (user_id, discord_id, provider, provider_id)
SELECT u.id, u.discord_id, 'discord', u.discord_id
  FROM users u
 WHERE u.discord_id IS NOT NULL
ON CONFLICT (provider, provider_id) DO NOTHING;

-- orphan cleanup: identity ที่ user_id ไม่มีใน users (rebuild ไม่ derive email-signup) → ลบ
--   cutover ครั้งแรก = no-op · rerun หลังมี email signup = ตัด stale link ตามธรรมชาติ rebuild
DELETE FROM user_identities ui
 WHERE ui.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ui.user_id);

-- FK + index + NOT NULL (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_identities_user_id_fkey' AND conrelid = 'user_identities'::regclass
  ) THEN
    ALTER TABLE user_identities
      ADD CONSTRAINT user_identities_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities (user_id);

DO $$ DECLARE n INT; BEGIN
  SELECT count(*) INTO n FROM user_identities WHERE user_id IS NULL;
  IF n = 0 THEN
    ALTER TABLE user_identities ALTER COLUMN user_id SET NOT NULL;
  ELSE
    RAISE NOTICE '⚠️  % user_identities ยังไม่มี user_id — ข้าม SET NOT NULL', n;
  END IF;
END $$;

-- สะสางชื่อ constraint/seq ที่ค้างจาก rename table (เฉพาะ path ที่ rename dc_user_identities มา)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'dc_user_identities_pkey') THEN
    ALTER INDEX dc_user_identities_pkey RENAME TO user_identities_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'dc_user_identities_provider_provider_id_key') THEN
    ALTER INDEX dc_user_identities_provider_provider_id_key RENAME TO user_identities_provider_provider_id_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'dc_user_identities_id_seq') THEN
    ALTER SEQUENCE dc_user_identities_id_seq RENAME TO user_identities_id_seq;
  END IF;
END $$;

-- ── 8) CONTRACT — rename dc_members → _dc_members (เก็บไว้ rollback ได้) ──────
--    ROLLBACK ด้วยมือ:  ALTER TABLE _dc_members RENAME TO dc_members;
ALTER TABLE dc_members RENAME TO _dc_members;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
\echo '=== counts ==='
SELECT 'users' t, count(*) n FROM users
UNION ALL SELECT 'org_members', count(*) FROM org_members
UNION ALL SELECT 'user_identities', count(*) FROM user_identities
UNION ALL SELECT '_dc_members(source)', count(*) FROM _dc_members;
\echo '=== integrity (ควรเป็น 0 ทั้งคู่) ==='
SELECT (SELECT count(*) FROM org_members om LEFT JOIN users u ON u.id=om.user_id WHERE u.id IS NULL) AS om_orphan,
       (SELECT count(*) FROM user_identities WHERE user_id IS NULL)                                   AS ui_orphan;
\echo '=== discord provider rows == users ที่มี discord ==='
SELECT (SELECT count(*) FROM user_identities WHERE provider='discord') AS discord_rows,
       (SELECT count(*) FROM users WHERE discord_id IS NOT NULL)        AS users_with_discord;

-- ── ORG INFRA (2026-07-17) — org-level KV config ─────────────────────────────
-- setting ระดับ org จริงๆ (เช่น appoint_policy, enabled_features ตอน migrate)
-- ⚠️ ไม่ใช่ dc_guild_config: นั่นคือ config/artifact ของ Discord server (channel/msg/role)
--    คง guild-keyed · org_config = ของ org (ข้าม guild / รองรับ guildless org)
CREATE TABLE IF NOT EXISTS org_config (
  org_id     INTEGER      NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key        VARCHAR(60)  NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ  DEFAULT now(),
  PRIMARY KEY (org_id, key)
);

-- org icon: emoji string หรือ url รูปที่อัปโหลด (/uploads/org/xxx) · OrgAvatar detect: path→img, สั้น→emoji
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS icon TEXT;
