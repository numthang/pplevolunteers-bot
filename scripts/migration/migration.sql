-- migration.sql — PostgreSQL migration log (append ต่อท้ายพร้อมวันที่)
--
-- convention:
--   • migration ใหม่ → append บล็อกใหม่ท้ายไฟล์ พร้อม comment วันที่ `-- YYYY-MM-DD: ...`
--   • ทุกบล็อกต้อง idempotent (IF NOT EXISTS / guarded) — ไฟล์นี้ถูกรัน "ทั้งไฟล์ซ้ำ" ได้เสมอ
--   • บล็อกที่ต้อง CONCURRENTLY (สร้าง index บนตารางใหญ่โดยไม่ล็อก) ให้แยกไฟล์ต่างหาก ห้ามใส่ที่นี่
--
-- ประวัติก่อน 2026-07-25 (ยุค MySQL + ก่อน/ระหว่าง org-scope cutover):
--   scripts/migration/_archive/migration-archive-2026-07-25.sql   ← reset ออกมา 2026-07-25
-- org-scope cutover (one-shot, รันตามเลข 00–12):
--   scripts/migration/org-scope/
--
-- deploy prod:
--   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && \
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/migration.sql'


-- 2026-07-25: auth_nonces — nonce/challenge store keyed by user_id (แทน dc_user_config ที่ PK=discord_id)
-- ใช้กับ passkey (register/auth challenge, login nonce) + phone bind OTP · รองรับ email-only (ไม่มี discord_id)
CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce      TEXT PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_user_purpose ON auth_nonces (user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_created ON auth_nonces (created_at);


-- 2026-07-25: phone เป็น login identity ที่ verify ได้ (Phase 4 slice 1 — ผูกเบอร์เองจากหน้า profile)
-- (1) hygiene: phone = '' คือ "ไม่มีเบอร์" ไม่ใช่ค่าจริง → NULL (เศษจากตอน identity split เขียน '' แทน NULL)
UPDATE users SET phone = NULL WHERE phone = '';
-- (2) เบอร์ที่ verify แล้วต้องไม่ซ้ำข้ามคน (1 เบอร์ = login ได้บัญชีเดียว) · partial: บังคับเฉพาะแถว verified
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone
  ON users (phone)
  WHERE phone IS NOT NULL AND phone_verified_at IS NOT NULL;

-- 2026-07-27: invite link เข้า org แบบ Notion (ลิงก์เดียวแชร์ได้ ใครเปิด+login ก็เข้าร่วม)
-- ต่างจาก email invite (org_members status=invited ต่อคน): ลิงก์ไม่รู้ user_id ล่วงหน้า + มี token/uses/expiry
CREATE TABLE IF NOT EXISTS org_invite_links (
  org_id      integer      NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by  integer      NOT NULL REFERENCES users(id),
  token       text         PRIMARY KEY,
  role        varchar(40)  NOT NULL DEFAULT 'member',
  expires_at  timestamptz,           -- NULL = ไม่หมดอายุ
  max_uses    integer,               -- NULL = ไม่จำกัดจำนวนครั้ง
  uses        integer      NOT NULL DEFAULT 0,
  revoked_at  timestamptz,           -- NULL = ยัง active
  created_at  timestamptz  NOT NULL DEFAULT now()
);
-- 1 org มี active link ได้หลายอัน แต่ query หลักคือ "active link ล่าสุดของ org"
CREATE INDEX IF NOT EXISTS idx_org_invite_links_active
  ON org_invite_links (org_id, created_at DESC) WHERE revoked_at IS NULL;

-- 2026-07-28: นำเข้าไฟล์แนบ (รูป/เสียง) จากเธรด Discord ของเคส
-- เดิมรูปที่คนโพสต์ในเธรดไม่เคยเข้าระบบเลย (timeline sync อ่านแค่ m.content, ฝั่งบอทไม่เก็บ)
-- → ไฟล์เข้าได้ทางเดียวคือฟอร์ม intake บนเว็บ ทั้งที่เคสร้องเรียนส่งรูปพื้นที่ในเธรดเป็นปกติ
ALTER TABLE case_attachments ADD COLUMN IF NOT EXISTS discord_attachment_id VARCHAR(20) NULL;
ALTER TABLE case_attachments ADD COLUMN IF NOT EXISTS discord_message_id    VARCHAR(20) NULL;
-- dedup: attachment id เป็น snowflake ต่อ "ไฟล์" (1 ข้อความแนบได้หลายไฟล์) → กัน sync ซ้ำโหลดรูปเดิมวนไม่จบ
CREATE UNIQUE INDEX IF NOT EXISTS uq_case_attachments_discord
  ON case_attachments (discord_attachment_id) WHERE discord_attachment_id IS NOT NULL;

-- watermark เส้นที่ 2 แยกจาก last_synced_message_id (ของ AI timeline)
-- เริ่มจาก NULL โดยตั้งใจ → รอบแรกกวาดตั้งแต่ข้อความแรกสุดของเธรด = backfill รูปเก่าที่เส้นแรกเลยไปแล้ว
ALTER TABLE cases ADD COLUMN IF NOT EXISTS last_attachment_message_id VARCHAR(20) NULL;


-- 2026-07-29: dc_social_accounts → org-native (Phase 0 ของโมดูล posts — md/posts/POSTS.md)
--
-- ตารางสุดท้ายในท่อ publish ที่ยังเป็น guild-only → org ที่ไม่มี guild / user ที่ล็อกอินด้วยอีเมล
-- เป็นเจ้าของบัญชีโซเชียลไม่ได้เลย  · scope หลัก = org_id · guild_id คงไว้เป็น Discord artifact
-- (ตะกร้าสื่อในบอทเป็น guild-based โดยธรรมชาติ — ยังอ่าน guild_id เหมือนเดิม ไม่แตะ)
--
-- rebuild ตาราง (10 แถว) แทน ADD COLUMN เพื่อวางคอลัมน์ in-place ตาม convention เดียวกับ finance
-- ทิ้ง user_key (สำเนา user_discord_id ที่มีไว้ใช้ใน unique index เก่าอย่างเดียว)
-- PG14 ไม่มี NULLS NOT DISTINCT → unique เป็น expression index COALESCE (ON CONFLICT ต้องเขียนให้ตรง)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'dc_social_accounts' AND column_name = 'org_id') THEN
    RETURN;
  END IF;

  -- sequence เป็นของตารางเดิม → DROP TABLE จะลากไปด้วย ต้องปลดเจ้าของก่อนแล้วผูกคืนทีหลัง
  ALTER SEQUENCE dc_social_accounts_id_seq OWNED BY NONE;

  CREATE TABLE dc_social_accounts_new (
    id                    integer      NOT NULL DEFAULT nextval('dc_social_accounts_id_seq'),
    org_id                integer      REFERENCES orgs(id),   -- scope หลัก (NULL = แถวเก่าที่ guild ยังไม่ผูก org)
    owner_user_id         integer      REFERENCES users(id),  -- เจ้าของบัญชี private (แทน user_discord_id)
    guild_id              varchar(20),                        -- artifact: guild ที่ใช้บัญชีนี้เป็น default
    user_discord_id       varchar(20),                        -- artifact: ฝั่งบอทค้นด้วยตัวนี้
    name                  varchar(100) NOT NULL,
    group_name            varchar(100),
    platform              varchar(20)  NOT NULL,
    social_id             varchar(50),
    access_token          text,
    user_token            text,
    user_token_expires_at timestamptz,
    visibility            dc_social_accounts_visibility NOT NULL DEFAULT 'public',
    created_at            timestamptz  DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dc_social_accounts_pkey PRIMARY KEY (id)
  );

  INSERT INTO dc_social_accounts_new
    (id, org_id, owner_user_id, guild_id, user_discord_id, name, group_name, platform,
     social_id, access_token, user_token, user_token_expires_at, visibility, created_at)
  -- owner_user_id = เจ้าของบัญชี private เท่านั้น · แถว public เป็นของ org (owner NULL)
  -- ถ้าเซ็ต owner บนแถว public ด้วย คีย์จะไม่ตรงกับที่ upsert เขียนเข้ามา → reconnect ทีเดียวได้แถวซ้ำ
  SELECT a.id, g.org_id, CASE WHEN a.visibility = 'private' THEN u.id END, a.guild_id, a.user_discord_id, a.name, a.group_name, a.platform,
         a.social_id, a.access_token, a.user_token, a.user_token_expires_at, a.visibility, a.created_at
  FROM dc_social_accounts a
  LEFT JOIN dc_guilds g ON g.guild_id = a.guild_id
  LEFT JOIN users    u ON u.discord_id = a.user_discord_id;

  DROP TABLE dc_social_accounts;
  ALTER TABLE dc_social_accounts_new RENAME TO dc_social_accounts;
  ALTER TABLE dc_social_accounts RENAME CONSTRAINT dc_social_accounts_new_org_id_fkey        TO dc_social_accounts_org_id_fkey;
  ALTER TABLE dc_social_accounts RENAME CONSTRAINT dc_social_accounts_new_owner_user_id_fkey TO dc_social_accounts_owner_user_id_fkey;
  ALTER SEQUENCE dc_social_accounts_id_seq OWNED BY dc_social_accounts.id;
  PERFORM setval('dc_social_accounts_id_seq', COALESCE((SELECT MAX(id) FROM dc_social_accounts), 1));

  -- identity ของแถว = บัญชีนี้ ในองค์กรนี้ ของเจ้าของคนนี้ ใน guild นี้
  -- guild_id ยังอยู่ในคีย์เพราะบัญชีเดียวถูกใช้ข้าม guild ในองค์กรเดียวกันได้จริง (Threads id 4/5)
  -- และ OAuth reconnect ของ guild เดิมต้องเข้า DO UPDATE แถวเดิม ไม่ใช่เกิดแถวใหม่
  CREATE UNIQUE INDEX uq_social_account ON dc_social_accounts
    (COALESCE(org_id, 0), COALESCE(owner_user_id, 0), COALESCE(guild_id, ''), platform, social_id);
  CREATE INDEX idx_social_accounts_org   ON dc_social_accounts (org_id, visibility);
  CREATE INDEX idx_social_accounts_owner ON dc_social_accounts (owner_user_id) WHERE visibility = 'private';
END $$;
