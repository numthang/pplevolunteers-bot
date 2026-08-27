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

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-29 — POSTS ก้อน 1: 6 ตารางของโมดูล posts (เครื่องมืองานสื่อ)
-- ⛔ แก้ 2026-07-29 เย็น: ทิ้ง post_series (จาก 7 เหลือ 6) — หน่วยหลักคือ post_episodes + คอลัมน์ category
-- spec + เหตุผลรายข้อ: md/posts/POSTS.md §ผ่าน /grill
-- additive ล้วน (CREATE TABLE IF NOT EXISTS) — รันซ้ำได้ ไม่แตะตารางเดิม
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ post_episodes — **หน่วยงานหลักของโมดูล** (1 แถว = 1 โพสต์) ═══
-- ⛔ 2026-07-29 (เย็น) user เคาะ: **ทิ้ง post_series ทั้งตาราง** — "ผมทำงานเป็น episode
--    แล้วแยกด้วย category เอา · จะแยกกลุ่มก็ใช้ category ใน column ก็ได้"
--    → org_id/owner_user_id/visibility/source_idea/created_via ย้ายจาก series ลงมาที่นี่
--    → ทิ้ง series_id + seq: ตอนไม่มีเลขลำดับ เรียงตามเวลาที่แก้ล่าสุด
-- category = **คอลัมน์ ไม่ใช่ตาราง lookup** (rename หมวด = UPDATE ทุกแถวของหมวดนั้น — ยอมรับแล้ว)
--    1 โพสต์ = 1 หมวด (ไม่ใช่ tag หลายอัน) · NULL = ยังไม่จัดหมวด
-- status เก็บแค่ "สถานะงานเขียน" — scheduled/published เป็น derived จาก post_social_history (grill ข้อ 10)
-- updated_at ใช้เป็น optimistic lock ของ autosave (grill ข้อ 14) — client ส่งค่าที่โหลดมา ไม่ตรง = 409
CREATE TABLE IF NOT EXISTS post_episodes (
  id               bigserial    PRIMARY KEY,
  org_id           integer      NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_user_id    integer      NOT NULL REFERENCES users(id),
  visibility       varchar(10)  NOT NULL DEFAULT 'personal' CHECK (visibility IN ('personal','org')),
  category         varchar(60),   -- ป้ายจัดกลุ่ม · NULL = ยังไม่จัดหมวด
  title            varchar(300),
  body             text,
  bodies           jsonb,       -- override รายแพลตฟอร์ม {"x":"...","fb":"..."} · ว่าง = ใช้ body
  format           varchar(10)  CHECK (format IS NULL OR format IN ('text','image','quote')),  -- hint เฉยๆ ไม่บังคับ
  source_idea      text,        -- ไอเดียดิบที่โยนเข้ามา → กด "ร่างใหม่" ได้ไม่ต้องพิมพ์ซ้ำ
  created_via      varchar(10)  NOT NULL DEFAULT 'manual' CHECK (created_via IN ('ai','manual')),
  status           varchar(10)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved')),
  approved_by      integer      REFERENCES users(id),
  approved_by_name varchar(100),  -- อนุมัติผ่านลิงก์ = ชื่อพิมพ์เอง ไม่ใช่ลายเซ็นผูกตัวตน
  approved_at      timestamptz,
  last_edited_by   integer      REFERENCES users(id),  -- เนื้อหาที่อยู่ใน DB ตอนนี้เป็นของใคร → ใช้ตัดสินว่าต้องเขียน revision ก่อนทับไหม
  -- audit ตอนเปิดร่างส่วนตัวให้ทีมเห็น (personal → org ทางเดียว ย้อนไม่ได้ — grill ข้อ 1)
  visibility_changed_at timestamptz,
  visibility_changed_by integer  REFERENCES users(id),
  archived_at      timestamptz,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_episodes_org      ON post_episodes (org_id, visibility, archived_at);
CREATE INDEX IF NOT EXISTS idx_post_episodes_owner    ON post_episodes (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_post_episodes_category ON post_episodes (org_id, category);

-- สื่อของตอน · เก็บ params ของการ์ดคำคม ไม่ใช่แค่ PNG → แก้ข้อความแล้ว render ใหม่ได้
-- path = relative จาก repo root เช่น 'storage/posts/<uuid>.jpg' (นอก public/ — grill ข้อ 5)
CREATE TABLE IF NOT EXISTS post_episode_media (
  id          bigserial   PRIMARY KEY,
  episode_id  bigint      NOT NULL REFERENCES post_episodes(id) ON DELETE CASCADE,
  kind        varchar(10) NOT NULL CHECK (kind IN ('upload','quote')),
  path        text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  quote_text  text,
  quote_style varchar(60),
  bg_path     text,
  source_hash varchar(64),  -- hash ของข้อความต้นทางตอน render → ขึ้นป้าย "ต้นทางเปลี่ยนแล้ว"
  added_by    integer     REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_media_episode ON post_episode_media (episode_id, sort_order);

-- ประวัติการแก้ · เขียนก่อนทับทุกครั้งที่คนแก้เปลี่ยนคน + snapshot แรกตอนสร้างตอน
CREATE TABLE IF NOT EXISTS post_revisions (
  id                 bigserial   PRIMARY KEY,
  episode_id         bigint      NOT NULL REFERENCES post_episodes(id) ON DELETE CASCADE,
  title              varchar(300),
  body               text,
  edited_by_user_id  integer     REFERENCES users(id),  -- NULL = คนที่เข้ามาทางลิงก์รีวิว
  edited_by_name     varchar(100),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_revisions_episode ON post_revisions (episode_id, created_at DESC);

-- ลิงก์รีวิว — อนุมัติได้เต็มตัวเท่า editor · **1 ลิงก์ = 1 ตอน** (เคาะ 2026-07-29 หลัง grill:
-- อนุมัติเป็นรายตอนอยู่แล้ว ลิงก์ที่ผูกทั้งชุดจึงซับซ้อนเกินเหตุ + เพิกถอนรายตอนไม่ได้)
-- ความเสียหายจำกัดเพราะปุ่มโพสต์ยังต้อง login เสมอ
CREATE TABLE IF NOT EXISTS post_review_links (
  id           bigserial   PRIMARY KEY,
  token        varchar(64) NOT NULL UNIQUE,   -- randomBytes(32).toString('hex')
  episode_id   bigint      NOT NULL REFERENCES post_episodes(id) ON DELETE CASCADE,
  created_by   integer     NOT NULL REFERENCES users(id),
  can_edit     boolean     NOT NULL DEFAULT false,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  uses         integer     NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  last_used_ip varchar(45),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_review_links_episode ON post_review_links (episode_id);

-- คอมเมนต์ติดกับเนื้อหา (anchor = ย่อหน้า · NULL = ทั้งตอน)
CREATE TABLE IF NOT EXISTS post_comments (
  id             bigserial   PRIMARY KEY,
  episode_id     bigint      NOT NULL REFERENCES post_episodes(id) ON DELETE CASCADE,
  anchor         text,
  body           text        NOT NULL,
  author_user_id integer     REFERENCES users(id),  -- NULL = คนที่เข้ามาทางลิงก์รีวิว
  author_name    varchar(100),
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_comments_episode ON post_comments (episode_id, created_at);

-- ═══ post_social_history — คิวงานโพสต์ **และ** ประวัติการโพสต์ ตารางเดียวกัน (เคาะ 2026-07-29) ═══
-- ⚠️ ชื่อว่า history แต่เก็บงานที่ยังไม่เกิดด้วย: แถว pending/running = **คิว** (โพสต์ตั้งเวลาไว้)
--    แถว done/failed/stale = **ประวัติ** · ข้อมูลชุดเดียวกัน จึงไม่เขียน 2 ที่ (user เคาะชื่อนี้เอง)
-- ใช้ร่วมกับตะกร้าสื่อใน Discord ที่โพสต์ทันที → เขียนแถว status='done' หลังยิงเสร็จ
--   → ก้อน 4 ย้าย 10 แถวจาก dc_media_history เข้ามาแล้ว drop ตารางนั้น (ประวัติมีที่เดียว)
-- prefix `post_` ใช้ได้เพราะก้อน 4 ยุบตะกร้าดิสฯ เป็น episode ของ posts แล้ว (ตะกร้าไม่ใช่ของนอกอีกต่อไป)
-- 1 แถว = 1 ตอน × 1 แพลตฟอร์ม (grill ข้อ 7) → retry ต่อแพลตฟอร์ม ไม่มีทางโพสต์ซ้ำ
-- 'stale' = เลยเวลาเกิน grace 2 ชม. เพราะบอทดับ → ไม่ยิงเอง ถามคนสั่งก่อน (grill ข้อ 15)
CREATE TABLE IF NOT EXISTS post_social_history (
  id                bigserial   PRIMARY KEY,
  org_id            integer     REFERENCES orgs(id) ON DELETE CASCADE,  -- NULL ได้: แถวตะกร้าจาก guild ที่ยังไม่ผูก org
  episode_id        bigint      REFERENCES post_episodes(id) ON DELETE SET NULL,  -- NULL = มาจากตะกร้าดิสฯ ไม่ใช่ posts
  batch_id          uuid        NOT NULL,   -- มัดแถวที่กดโพสต์พร้อมกันให้ UI แสดงเป็นก้อนเดียว
  platform          varchar(10) NOT NULL CHECK (platform IN ('fb','ig','threads','x','news')),
  social_account_id integer     REFERENCES dc_social_accounts(id),
  -- Discord artifact: guild/ห้องของตะกร้าที่สั่งโพสต์ · โพสต์จากเว็บเป็น NULL ได้ทั้งคู่
  guild_id          varchar(20),
  channel_id        varchar(20),
  wm_type           varchar(50),
  caption           text,
  media             jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- snapshot [{kind,path}] ตอนกดโพสต์
  scheduled_at      timestamptz,            -- NULL = โพสต์ทันที · คิวเราถือเวลาเอง ไม่ส่งให้ FB
  status            varchar(10) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','done','failed','stale','canceled')),
  attempts          integer     NOT NULL DEFAULT 0,
  last_error        text,
  result            jsonb,                  -- {url, id, ...} ที่แพลตฟอร์มคืนมา (แทน fb_url/ig_url/... เดิม)
  created_by        integer     REFERENCES users(id),
  created_by_discord_id varchar(20),        -- artifact: คนกดในดิสฯ ที่อาจยังไม่มี users row
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  posted_at         timestamptz             -- เวลาที่ออกจริง (ประวัติเรียงด้วยตัวนี้)
);
-- worker: WHERE status='pending' AND (scheduled_at IS NULL OR scheduled_at <= now()) ... FOR UPDATE SKIP LOCKED
CREATE INDEX IF NOT EXISTS idx_post_social_history_due     ON post_social_history (scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_post_social_history_episode ON post_social_history (episode_id);
CREATE INDEX IF NOT EXISTS idx_post_social_history_batch   ON post_social_history (batch_id);
CREATE INDEX IF NOT EXISTS idx_post_social_history_org ON post_social_history (org_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_social_history_channel ON post_social_history (guild_id, channel_id, posted_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-29 — POSTS ก้อน 1 (ต่อ): dc_user_config → user_config (key ด้วย user_id)
-- ไม่สร้างตาราง prefs ใหม่สำหรับ posts — แปลงของเดิมให้เป็น org-native identity
-- ⚠️ คีย์จริงต้องมีตัวเดียว = user_id · ห้ามให้ prefs เขียนได้ 2 คีย์ (บอทใต้ discord / เว็บใต้ user)
--    ไม่งั้นค่าแตกเป็น 2 ชุด = ปัญหาเดิมที่ unify identity เพิ่งปิดไป
-- dc_user_config **ยังอยู่** แต่เหลือแค่ state ชั่วคราวของ OTP (otp_quota / otp_verify_<guildId>)
--    ที่ยังต้อง key ด้วย discord_id เพราะตอนยืนยันตัวตน users row อาจยังไม่เกิด
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.user_config') IS NULL THEN
    CREATE TABLE user_config (
      user_id    integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "key"      varchar(100) NOT NULL,
      value      json,
      updated_at timestamptz  DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT user_config_pkey PRIMARY KEY (user_id, "key")
    );

    -- ย้ายเฉพาะ prefs ถาวร · ทิ้ง passkey_reg_challenge (ตายแล้ว ย้ายไป auth_nonces ตั้งแต่ 2026-07-25)
    INSERT INTO user_config (user_id, "key", value, updated_at)
    SELECT u.id, c."key", c.value, c.updated_at
    FROM dc_user_config c
    JOIN users u ON u.discord_id = c.discord_id
    WHERE c."key" <> 'passkey_reg_challenge'
      AND c."key" <> 'otp_quota'
      AND c."key" NOT LIKE 'otp_verify_%'
    ON CONFLICT (user_id, "key") DO NOTHING;

    DELETE FROM dc_user_config WHERE "key" = 'passkey_reg_challenge';
    -- ลบเฉพาะแถวที่ย้ายสำเร็จจริง (discord_id ที่ยังไม่มี users row ให้ค้างไว้ก่อน ไม่ทำข้อมูลหาย)
    DELETE FROM dc_user_config c
    WHERE c."key" <> 'otp_quota'
      AND c."key" NOT LIKE 'otp_verify_%'
      AND EXISTS (SELECT 1 FROM users u WHERE u.discord_id = c.discord_id);
  END IF;
END $$;

COMMENT ON TABLE user_config IS 'prefs ถาวรของ user (key=users.id) — เดิมคือ dc_user_config';
COMMENT ON TABLE dc_user_config IS 'เหลือแค่ OTP state ชั่วคราว (otp_quota, otp_verify_<guildId>) ที่ยัง key ด้วย discord_id · prefs ย้ายไป user_config แล้ว 2026-07-29';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-29 — app creds โซเชียล: dc_guild_config → org_config (ราย org)
-- เดิม meta_app_id/secret + x_consumer_key/secret ผูกราย Discord guild
--   → org ที่ไม่มี Discord "ถือครองบัญชีโซเชียลได้ แต่กด Connect บัญชีใหม่ไม่ได้"
--   = ตัวบล็อกเป้าหมาย "ใช้ระบบได้โดยไม่ต้องมี Discord"
-- ⚠️ คัดลอกอย่างเดียว **ไม่ลบ** แถวเดิมใน dc_guild_config — โค้ดอ่าน org ก่อนแล้ว fallback guild
--    (เก็บเป็น fallback ช่วงเปลี่ยนผ่าน · ลบรอบหน้าเมื่อทุก org ย้ายครบ)
-- ⚠️ ชนิดคอลัมน์ต่างกัน: dc_guild_config.value = json (ค่ามี " ครอบ) · org_config.value = text
--    ต้องแกะด้วย #>> '{}' ไม่งั้นได้ค่าติดเครื่องหมายคำพูดไปด้วย
-- DISTINCT ON (org_id, key): 2 guild ใน org เดียวกันค่าเหมือนกันเป๊ะ (md5 ตรงกัน) เอาแถวเดียวพอ
-- news_channel_id ไม่ย้าย — เป็น Discord artifact (channel id) คงราย guild ตามหลักเดิม
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO org_config (org_id, key, value, updated_at)
SELECT DISTINCT ON (g.org_id, c."key")
       g.org_id, c."key", c.value #>> '{}', now()
  FROM dc_guild_config c
  JOIN dc_guilds g ON g.guild_id = c.guild_id
 WHERE c."key" IN ('meta_app_id', 'meta_app_secret', 'x_consumer_key', 'x_consumer_secret')
   AND g.org_id IS NOT NULL
   AND COALESCE(c.value #>> '{}', '') <> ''
 ORDER BY g.org_id, c."key", c.updated_at DESC NULLS LAST
ON CONFLICT (org_id, key) DO NOTHING;

-- เศษที่ไม่มีผลแล้ว: feature toggle ย้ายขึ้น org_config key 'enabled_features' ตั้งแต่ 2026-07-22
-- (web/lib/orgFeatures.js เป็นที่เดียวที่เปิด/ปิดฟีเจอร์แล้ว) เหลือ 2 แถวหลอกตาใน dc_guild_config
DELETE FROM dc_guild_config WHERE "key" = 'enabled_features';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-29 — POSTS ก้อน 4 ขั้น 3: รวมประวัติการโพสต์ไว้ที่ post_social_history
-- เดิมประวัติของตะกร้าสื่ออยู่ dc_media_history (1 แถว = 1 ครั้ง หลายแพลตฟอร์มรวมใน 'fb,ig,x')
-- ใหม่: 1 แถว = 1 แพลตฟอร์ม มัดด้วย batch_id → retry รายแพลตฟอร์มได้ + ที่เก็บเดียวกับคิวของเว็บ
-- 🐛 พบระหว่างทาง: addHistory() พังเงียบตั้งแต่ 2026-06-05 (INSERT ใส่คอลัมน์ group_name
--    ที่ไม่มีอยู่จริง แล้วโดน .catch(()=>{}) กลืน) → ประวัติไม่ได้บันทึกมา 2 เดือน · แก้ด้วยการย้ายมาที่นี่
-- ═══════════════════════════════════════════════════════════════════════════

-- group_name = กลุ่มบัญชีที่ใช้โพสต์ (ตะกร้าเลือกบัญชีด้วยตัวนี้) — ของเดิมไม่เคยมีคอลัมน์นี้จริง
ALTER TABLE post_social_history ADD COLUMN IF NOT EXISTS group_name varchar(100);

DO $$
BEGIN
  IF to_regclass('public.dc_media_history') IS NULL THEN RETURN; END IF;

  INSERT INTO post_social_history
    (org_id, batch_id, platform, guild_id, channel_id, wm_type, caption, media,
     scheduled_at, status, result, created_by, created_by_discord_id, group_name,
     created_at, updated_at, posted_at)
  SELECT
    g.org_id,
    -- batch_id คงที่ต่อแถวเดิม (ไม่สุ่ม) → รันซ้ำไม่ได้แถวซ้ำ + ยังมัดแพลตฟอร์มของครั้งเดียวกันไว้ด้วยกัน
    ('00000000-0000-0000-0000-' || lpad(h.id::text, 12, '0'))::uuid,
    p.platform,
    h.guild_id, h.channel_id, h.wm_type, h.caption,
    -- ⚠️ ต้อง COALESCE **ทั้งสองฝั่ง** ก่อน || : NULL || jsonb = NULL
    --    (เจอตอนเทส: แถวที่มีแต่วิดีโอ image_count=0 → agg เป็น NULL → media หายทั้งก้อน)
    COALESCE((SELECT jsonb_agg(jsonb_build_object('kind','image')) FROM generate_series(1, GREATEST(h.image_count,0))), '[]'::jsonb)
    || COALESCE((SELECT jsonb_agg(jsonb_build_object('kind','video')) FROM generate_series(1, GREATEST(COALESCE(h.video_count,0),0))), '[]'::jsonb),
    CASE WHEN h.schedule_time IS NOT NULL THEN to_timestamp(h.schedule_time) END,
    CASE WHEN h.status = 'success' THEN 'done'
         WHEN u.url IS NOT NULL     THEN 'done'
         ELSE 'failed' END,
    CASE WHEN u.url IS NOT NULL THEN jsonb_build_object('url', u.url) END,
    (SELECT id FROM users WHERE discord_id = h.posted_by),
    h.posted_by,
    NULL,                       -- ของเดิมไม่เคยเก็บ group_name ได้จริง (คอลัมน์ไม่มี)
    h.created_at, h.created_at, h.created_at
  FROM dc_media_history h
  LEFT JOIN dc_guilds g ON g.guild_id = h.guild_id
  -- แตกคอลัมน์ platform ตาม comma · 'all'/'both' เป็นค่าเก่าสมัยมีแค่ FB+IG
  CROSS JOIN LATERAL unnest(
    CASE WHEN h.platform IN ('all','both') THEN ARRAY['fb','ig']
         ELSE string_to_array(h.platform, ',') END
  ) AS p(platform)
  CROSS JOIN LATERAL (SELECT CASE p.platform
      WHEN 'fb' THEN h.fb_url WHEN 'ig' THEN h.ig_url
      WHEN 'threads' THEN h.threads_url WHEN 'x' THEN h.x_url END AS url) u
  WHERE NOT EXISTS (
    SELECT 1 FROM post_social_history x
     WHERE x.batch_id = ('00000000-0000-0000-0000-' || lpad(h.id::text, 12, '0'))::uuid
       AND x.platform = p.platform
  );

  -- ⚠️ ลำดับ deploy: รัน migration → **restart บอททันที** (โค้ดเก่าอ่านตารางนี้อยู่)
  DROP TABLE dc_media_history;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-30 — posts: ลายน้ำจากเว็บเก็บเป็น path ที่ resolve แล้ว (`path:<guild>/<group>/<file>`)
-- ไม่ใช่ token สั้นๆ แบบตะกร้าดิสฯ (`guild:<file>`) เพราะกลุ่มที่เว็บเลือกอาจอยู่คนละ guild
-- กับ guild ที่ผู้ใช้อยู่ → varchar(50) สั้นเกิน (ชื่อกลุ่มไทย + ชื่อไฟล์ยาวได้)
ALTER TABLE post_social_history ALTER COLUMN wm_type TYPE text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-30 — ก้อน 4c: ยุบตะกร้าสื่อ Discord (dc_media_baskets) เข้า post_episodes
-- แผน: md/posts/PLAN-4.md §เคาะแล้ว 2026-07-30
-- ⛔ ห้ามเพิ่มตาราง slot — "ตะกร้าที่เปิดอยู่ของห้อง" = post_episodes.channel_id + partial unique index
--    (post_basket_slots / dc_basket_slots ยกเลิกถาวร ห้ามเอากลับมา)

-- 1) post_episodes รับตะกร้าได้
--    org_id NULL   = guild ที่ยังไม่ผูก org → โผล่แค่ในดิสฯ ไม่เข้าฟีดองค์กร (ห้ามมี fallback เส้นที่ 2)
--    owner NULL    = คนหย่อนยังไม่มีแถวใน users (ตะกร้าดิสฯ ไม่บังคับ login)
ALTER TABLE post_episodes ALTER COLUMN org_id        DROP NOT NULL;
ALTER TABLE post_episodes ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE post_episodes ADD COLUMN IF NOT EXISTS guild_id   varchar(20);
ALTER TABLE post_episodes ADD COLUMN IF NOT EXISTS channel_id varchar(20);
-- channel_name ต้องมาก่อน step 3 ข้างล่าง — ชื่อห้อง Discord ยาวได้ถึง 100 ตัวอักษร
-- ห้ามยัดผ่าน category (varchar(60)) แม้ชั่วคราว: ของจริงบน prod มีชื่อห้อง >60 ตัวอักษร ทำ INSERT ล้ม (22001)
ALTER TABLE post_episodes ADD COLUMN IF NOT EXISTS channel_name varchar(100);

-- invariant: 1 ห้อง เปิดตะกร้าได้ทีละใบ — บังคับที่ DB ไม่ใช่ที่โค้ด
-- ล้างตะกร้า = archived_at = now() → หลุดจาก index เอง ห้องว่างพร้อมเปิดใบใหม่
-- (และยังรู้ว่าโพสต์เก่ามาจากห้องไหน — ตารางแยกจะทิ้ง provenance นี้ตอนลบแถว)
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_basket_per_channel ON post_episodes (channel_id)
  WHERE channel_id IS NOT NULL AND archived_at IS NULL;

-- 2) post_episode_media รับสื่อจากดิสฯ
--    path NULL = แถวมีแล้วแต่ยังโหลดไฟล์ไม่เสร็จ (โหลด background หลัง ack — ห้ามให้ interaction รอไฟล์)
--    source_url/source_message_id = ทางกลับไปต้นทาง + fallback ตอน path ยัง NULL
ALTER TABLE post_episode_media ALTER COLUMN path DROP NOT NULL;
ALTER TABLE post_episode_media ADD COLUMN IF NOT EXISTS source_url        text;
ALTER TABLE post_episode_media ADD COLUMN IF NOT EXISTS source_message_id varchar(20);
ALTER TABLE post_episode_media DROP CONSTRAINT IF EXISTS post_episode_media_kind_check;
ALTER TABLE post_episode_media ADD  CONSTRAINT post_episode_media_kind_check
  CHECK (kind IN ('upload', 'quote', 'video'));

-- 3) ย้ายตะกร้าที่ค้างอยู่ → เป็นโพสต์ (idempotent: ห้องที่มีตะกร้าเปิดแล้วข้าม)
DO $$
BEGIN
  IF to_regclass('public.dc_media_baskets') IS NULL THEN RETURN; END IF;

  INSERT INTO post_episodes (org_id, owner_user_id, visibility, channel_name, body,
                             created_via, status, guild_id, channel_id, created_at, updated_at)
  SELECT g.org_id,
         (SELECT u.id FROM users u WHERE u.discord_id = MIN(b.added_by)),
         'org',
         NULLIF(MAX(b.channel_name), ''),
         MAX(CASE WHEN b.type = 'caption' THEN b.caption END),
         'manual', 'draft',
         b.guild_id, b.channel_id, MIN(b.added_at), MAX(b.added_at)
    FROM dc_media_baskets b
    LEFT JOIN dc_guilds g ON g.guild_id = b.guild_id
   WHERE NOT EXISTS (
     SELECT 1 FROM post_episodes e
      WHERE e.channel_id = b.channel_id AND e.archived_at IS NULL
   )
   GROUP BY b.guild_id, b.channel_id, g.org_id;

  -- รูป/วิดีโอ → post_episode_media (path NULL = ยังไม่มีไฟล์บนดิสก์ ใช้ source_url ไปก่อน)
  -- sort_order เริ่มที่ 0 ตามของ post_episode_media (ของเดิมเริ่มที่ 1)
  INSERT INTO post_episode_media (episode_id, kind, path, sort_order, source_url,
                                  source_message_id, added_by, created_at)
  SELECT e.id,
         CASE b.type WHEN 'video' THEN 'video' ELSE 'upload' END,
         NULL,
         ROW_NUMBER() OVER (PARTITION BY b.channel_id, b.type
                            ORDER BY b.sort_order NULLS LAST, b.added_at) - 1,
         b.image_url, b.message_id,
         (SELECT u.id FROM users u WHERE u.discord_id = b.added_by),
         b.added_at
    FROM dc_media_baskets b
    JOIN post_episodes e ON e.channel_id = b.channel_id AND e.archived_at IS NULL
   WHERE b.type IN ('image', 'video')
     AND NOT EXISTS (
       SELECT 1 FROM post_episode_media m
        WHERE m.episode_id = e.id AND m.source_url = b.image_url
     );
END $$;

-- ⚠️ DROP TABLE dc_media_baskets — ทำใน commit ถัดไป **หลัง deploy prod ครบทั้งบอทและเว็บ**
--    (บอท/เว็บ deploy คนละรอบ · โค้ดเก่าฝั่งที่ยังไม่ deploy อ่านตารางนี้อยู่)

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-30: post_episodes.channel_name — เผื่อทำความสะอาด env ที่รัน ก้อน 4c เวอร์ชันแรกไปแล้ว
-- ═══════════════════════════════════════════════════════════════════════════
-- ก้อน 4c แรกยัดชื่อห้อง (dc_media_baskets.channel_name) ลง `category` เพื่อไม่ต้องเพิ่มคอลัมน์
-- ผลคือ `category` ทำ 2 หน้าที่: taxonomy ที่คนตั้ง + ป้ายบอกที่มาที่ระบบตั้ง แถมชื่อห้อง >60 ตัวอักษร
-- ล้น varchar(60) (22001) → แก้ที่ต้นเหตุแล้ว: step 1 ข้างบนเพิ่ม channel_name ก่อน step 3 insert ตรงเข้าคอลัมน์นี้เลย
-- เหลือ block นี้ไว้เป็น no-op safety net เฉพาะ env ที่เคยรันเวอร์ชันแรก (เช่น local dev) ที่ category ยังมีชื่อห้องค้างอยู่
ALTER TABLE post_episodes ADD COLUMN IF NOT EXISTS channel_name VARCHAR(100) NULL;

UPDATE post_episodes
   SET channel_name = category, category = NULL
 WHERE channel_id IS NOT NULL AND channel_name IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-31: post_ai_suggestions — เก็บข้อเสนอ AI (แคปชัน/ไอเดียภาพ) ไว้อ่านซ้ำ
-- ═══════════════════════════════════════════════════════════════════════════
-- เดิม /api/posts/ai/caption ไม่เขียนลง DB เลย → ปิดกล่อง/รีเฟรชแล้วหาย ต้องกดใหม่
-- ซึ่ง **กินโควตา AI รายวัน** ทุกครั้ง (postsAiQuota) = เสียของเปล่า
--
-- ⚠️ ห้ามเก็บเป็นคอลัมน์บน post_episodes — ทุก UPDATE ที่นั่น bump updated_at
--    ทำให้ lockToken ของ PostEditor หมดอายุ แล้ว autosave เด้ง 409 ทุกครั้งที่ขอแคปชัน (bug-071)
CREATE TABLE IF NOT EXISTS post_ai_suggestions (
  id              BIGSERIAL PRIMARY KEY,
  episode_id      BIGINT NOT NULL REFERENCES post_episodes(id) ON DELETE CASCADE,
  kind            VARCHAR(20) NOT NULL,          -- 'caption' (เผื่อชนิดอื่นในอนาคต)
  payload         JSONB NOT NULL,                -- { captions: [...], imageIdeas: [...] }
  created_by_user_id INTEGER REFERENCES users(id),
  created_by_name VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_ai_suggestions_episode
    ON post_ai_suggestions (episode_id, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-04: post_assets — คลังภาพ (media library) · ดีไซน์ md/PENDING.md §🎨 คลังภาพ
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ ทำไมต้องเป็นตารางใหม่ ไม่ใช้ post_episode_media: `services/postsRetention.js` ลบไฟล์
--    30/180 วันหลังเผยแพร่ (เซ็ต path=NULL) → คลังที่อ่านจากตารางนั้นจะเน่าเงียบๆ
--    คลัง = ของที่ตั้งใจเก็บ **ไม่มี retention** · สื่อแนบโพสต์ = ของใช้แล้วทิ้ง คนละ lifecycle
--
-- ⛔ หยิบรูปจากคลังไปใช้ = **คัดลอกไฟล์เป็น uuid ใหม่ ห้ามแชร์ path เดียวกัน**
--    เพราะ /api/posts/media/[id] DELETE และ postsRetention ลบไฟล์จาก path ของแถวโพสต์ตรงๆ
--    แชร์ path เมื่อไหร่ = ไฟล์ในคลังหายจากดิสก์แต่แถวคลังยังชี้ path เดิม (ธัมบ์เนลแตกทีหลัง)
--    "ถูกใช้ที่ไหน" ตอบด้วย post_episode_media.source_asset_id ข้างล่างแทน
CREATE TABLE IF NOT EXISTS post_assets (
  id            BIGSERIAL PRIMARY KEY,
  org_id        INTEGER     NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  -- เจ้าของกอง = คนอัป · ไม่เปลี่ยนตอนเลื่อนขึ้นกองกลาง (คีย์ dedupe ต้องนิ่ง)
  owner_user_id INTEGER     NOT NULL REFERENCES users(id),
  visibility    VARCHAR(10) NOT NULL DEFAULT 'personal' CHECK (visibility IN ('personal','org')),
  path          TEXT        NOT NULL,   -- storage/posts/<uuid>.<ext> (relative จาก repo root)
  mime          VARCHAR(40) NOT NULL,
  width         INTEGER,
  height        INTEGER,
  bytes         BIGINT,
  sha256        VARCHAR(64),            -- dedupe **ในกองตัวเองเท่านั้น** (ดู unique ข้างล่าง)
  title         VARCHAR(200),
  tags          TEXT[]      NOT NULL DEFAULT '{}',   -- แทน folder (1 รูปอยู่ได้หลายเรื่อง)
  consent_note  TEXT,                   -- ขอไว้ยังไง/ใครอนุญาต — ภาพคนจริงในงานพรรค
  usable_until  DATE,                   -- ใช้ได้ถึงเมื่อไหร่ (NULL = ไม่จำกัด)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_assets_org  ON post_assets (org_id, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_assets_tags ON post_assets USING GIN (tags);
-- dedupe ต้องมีขอบเขต — ไฟล์เดียวกันคนละ org/คนละเจ้าของ = คนละใบ (กันแชร์ไฟล์ข้าม tenant)
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_assets_hash
    ON post_assets (org_id, owner_user_id, sha256) WHERE sha256 IS NOT NULL;

-- "รูปนี้ถูกใช้ที่ไหนบ้าง" + smart view "ยังไม่เคยใช้" · ON DELETE SET NULL = ลบรูปในคลัง
-- ไม่กระทบสำเนาที่โพสต์ถืออยู่ (ไฟล์คนละใบ) แค่เสียสายสัมพันธ์
ALTER TABLE post_episode_media ADD COLUMN IF NOT EXISTS source_asset_id BIGINT
      REFERENCES post_assets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_post_media_asset ON post_episode_media (source_asset_id)
    WHERE source_asset_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-04: เติมชื่อเรื่องให้ตะกร้าดิสฯ เก่า (บรรทัดแรกของ body)
-- ═══════════════════════════════════════════════════════════════════════════
-- ตะกร้าดิสฯ ไม่มีช่องกรอกชื่อ → โพสต์ที่มาจากดิสฯ ขึ้น "ไม่มีชื่อ" ทุกใบในหน้า /posts
-- ตั้งแต่นี้ `db/mediaBasket.js:setCaption()` เติมให้ตอนหย่อนข้อความ · บล็อกนี้ตามเก็บของเก่า
-- เฉพาะแถวที่มาจากดิสฯ (channel_id IS NOT NULL) และยังไม่มีชื่อ — ไม่แตะโพสต์ที่เขียนบนเว็บ
UPDATE post_episodes
   SET title = LEFT(
         regexp_replace(
           btrim((regexp_split_to_array(btrim(body), E'\n'))[1], E' \t'),
           '^[#>*\-–—•[:space:]]+', ''
         ), 120)
 WHERE channel_id IS NOT NULL
   AND COALESCE(btrim(title), '') = ''
   AND COALESCE(btrim(body), '') <> '';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-07: แก้ case_timeline.occurred_at เพี้ยน +543 ปี (AI สกัด timeline)
-- ═══════════════════════════════════════════════════════════════════════════
-- root cause: services/caseTimeline.js + web timeline/refresh ป้อนข้อความให้ AI ด้วย
-- new Date(m.timestamp).toLocaleString('th-TH') ซึ่ง default เป็นปี พ.ศ. (+543) —
-- AI เห็นเลขปีนั้นแล้วยัดเป็น "ISO 8601" ตรงๆ โดยไม่รู้ว่าต้องลบ 543 กลับ → occurred_at
-- ที่บันทึกจริงในนี้เพี้ยนไป +543 ปีจากของจริง (ฝั่งแสดงผล fmtDate ทำ th-TH ซ้ำอีกที
-- ทำให้ที่ user เห็นบนจอเพี้ยนสะสม +1086 ปี — โค้ดฝั่งแสดงผลไม่ผิด ผิดที่ค่าที่บันทึกไว้)
-- แก้ต้นตอแล้วที่โค้ด (calendar:'gregory') — บล็อกนี้แก้ข้อมูลเก่าที่บันทึกผิดไปแล้วเท่านั้น
--
-- วิธีคัดแถวที่ต้องแก้: source='ai' ที่ occurred_at ห่างจาก created_at เกิน 100 ปี
-- (แถวที่ AI ไม่ได้สกัดวันที่ ตอน insert จะ COALESCE เป็น NOW() → occurred_at ใกล้ created_at เสมอ
--  แถวที่ AI สกัดวันที่แต่เพี้ยน +543 ปี จะห่างจาก created_at มากผิดปกติ)
--
-- ⬇️ รันดูก่อนเสมอ (dry-run preview ไม่แก้อะไร):
-- SELECT ct.id, c.ref, ct.body, ct.occurred_at AS before_fix,
--        ct.occurred_at - interval '543 years' AS after_fix
-- FROM case_timeline ct JOIN cases c ON c.id = ct.case_id
-- WHERE ct.source = 'ai'
--   AND EXTRACT(YEAR FROM ct.occurred_at) - EXTRACT(YEAR FROM ct.created_at) > 100
-- ORDER BY ct.occurred_at;
--
-- ⬇️ แก้จริง (รันเฉพาะหลังเช็ค preview ข้างบนแล้วว่าตรงเคสนี้จริง):
UPDATE case_timeline
   SET occurred_at = occurred_at - interval '543 years'
 WHERE source = 'ai'
   AND EXTRACT(YEAR FROM occurred_at) - EXTRACT(YEAR FROM created_at) > 100;



-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-08 — auth_login_events: บันทึกทุกความพยายาม login (สำเร็จ + ไม่สำเร็จ)
-- ═══════════════════════════════════════════════════════════════════════════
-- ทำไม: ก่อนหน้านี้ระบบไม่จดการ login เลยสักบรรทัด → ตอบไม่ได้ว่าใครเข้ามาทางไหนตอนไหน
-- เคสจริง: user บอกว่า "ลอง login ด้วยเบอร์แล้วไม่ได้" แต่ไล่ย้อนไม่ได้เพราะ
--   (1) auth_nonces ถูก DELETE ทั้งตอนขอ OTP ใหม่และตอนสำเร็จ → ไม่เหลือร่องรอย
--   (2) เบอร์ที่ไม่มีเจ้าของ → request route คืน genericOk() (กัน enumeration) ไม่ส่ง SMS เงียบๆ
--   (3) org_login_tokens ของ magic link ก็ DELETE...RETURNING ตอนใช้ → คลิกช้าเกิน 15 นาทีก็ไม่มีร่องรอย
--
-- user_id เป็น ON DELETE SET NULL โดยตั้งใจ — log ต้องไม่ไปบล็อกการลบ user
-- (เคสรวมบัญชีที่แตกร่าง ต้อง DELETE FROM users ได้) · ตัวตนยังไล่ได้จากคอลัมน์ identity
CREATE TABLE IF NOT EXISTS auth_login_events (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  provider   VARCHAR(20)  NOT NULL,   -- discord/google/magic/phone/line/passkey
  outcome    VARCHAR(30)  NOT NULL,   -- ok | no_owner | bad_otp | sms_failed | token_expired | ...
  user_id    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  identity   VARCHAR(255),            -- ค่าที่เขาพยายามใช้: อีเมล / เบอร์ / snowflake
  ip         VARCHAR(64),
  user_agent TEXT,
  meta       JSONB
);
CREATE INDEX IF NOT EXISTS idx_ale_at       ON auth_login_events (at DESC);
CREATE INDEX IF NOT EXISTS idx_ale_user     ON auth_login_events (user_id, at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ale_identity ON auth_login_events (identity, at DESC) WHERE identity IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ale_outcome  ON auth_login_events (outcome, at DESC);

-- retention 90 วัน — ลบให้เองแบบ opportunistic ใน db/authLog.js (ไม่ต้องตั้ง cron)

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-08 — user_merges: log การยุบบัญชีที่แตกร่าง (web/db/userMerge.js)
-- ═══════════════════════════════════════════════════════════════════════════
-- merge ย้อนไม่ได้ (ย้าย FK 40 คอลัมน์ + DELETE users) → เก็บ snapshot ของแถวที่ลบไว้เป็น jsonb
-- เพื่อให้กู้มือได้ถ้ารวมผิดคน · keep_id ไม่ผูก FK ไป users โดยตั้งใจ (ถ้าวันหน้าแถวนั้นถูกลบ log ต้องไม่หาย)
CREATE TABLE IF NOT EXISTS user_merges (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  keep_id     INTEGER     NOT NULL,
  drop_id     INTEGER     NOT NULL,
  reason      VARCHAR(40) NOT NULL DEFAULT 'link_discord',
  dropped_row JSONB
);
CREATE INDEX IF NOT EXISTS idx_user_merges_keep ON user_merges (keep_id, at DESC);
-- ตาม id ที่ถูกยุบ → id ปลายทาง (followMerge) ตอน refresh session
CREATE INDEX IF NOT EXISTS idx_user_merges_drop ON user_merges (drop_id, at DESC);



-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-09 — ลบ app creds ที่ค้างใน dc_guild_config (fallback ช่วงเปลี่ยนผ่าน)
-- ═══════════════════════════════════════════════════════════════════════════
-- creds ย้ายขึ้น org_config ตั้งแต่ 2026-07-29 · web/lib/socialAppCreds.js อ่าน org ก่อน
-- แล้วเติมเฉพาะคีย์ที่ขาดจาก dc_guild_config (fallback ที่ตั้งใจให้ชั่วคราว)
--
-- เช็คก่อนลบแล้ว (2026-08-09): 8 แถว ของ 2 guild ใน org 1 · ค่าตรงกับ org_config ทุกแถว
-- และไม่มีคีย์ไหนที่ guild มีแต่ org ไม่มี → ลบทิ้งได้ไม่กระทบ
--
-- ⚠️ DELETE นี้ปลอดภัยเฉพาะเมื่อ org ของ guild นั้นมีคีย์ครบแล้ว — เงื่อนไข NOT EXISTS
-- ด้านล่างบังคับไว้ในตัว ถ้ามี guild ไหนที่ org ยังไม่มีคีย์ แถวนั้นจะถูกเก็บไว้
DELETE FROM dc_guild_config c
 USING dc_guilds g
 WHERE g.guild_id = c.guild_id
   AND c."key" IN ('meta_app_id', 'meta_app_secret',
                   'threads_app_id', 'threads_app_secret',
                   'x_consumer_key', 'x_consumer_secret')
   AND EXISTS (
     SELECT 1 FROM org_config o
      WHERE o.org_id = g.org_id AND o.key = c."key" AND o.value IS NOT NULL
   );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-08-10 · AI per-org (BYO-key) — seed โควตายืม key กลางให้ org ที่มีอยู่
--
-- org ทุกเจ้าวันนี้ใช้ key กลางจาก .env อยู่ · ถ้าไม่ seed แล้ว deploy โค้ดใหม่
-- ทุก org จะตกไปใช้โควตา default (30 ครั้ง/วัน) ทันที = AI ดับกลางวันโดยไม่มีใครทำอะไรผิด
-- org ที่สร้าง "หลังจากนี้" ไม่มีแถวนี้ → ได้ default 30 ตามเจตนา (ทดลองใช้แล้วต้องกรอก key เอง)
-- ตัวเลขนี้แก้ทีหลังได้ที่ org_config — 0 = ยืมไม่ได้เลย
INSERT INTO org_config (org_id, key, value, updated_at)
SELECT id, 'ai_shared_quota_daily', '100000', now() FROM orgs
ON CONFLICT (org_id, key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-08-10 · ลายน้ำ/อัตลักษณ์ ย้ายจาก guild → org (คู่กับ scripts/migration/moveWatermarksToOrg.js)
--
-- ย้ายเฉพาะ `default_watermark_group:<กลุ่ม>` — คีย์นี้ไม่ชนกันเพราะชื่อกลุ่มต่างกันต่อแบรนด์
-- แปลง json → text และถอด prefix `guild:` ทิ้ง (org_config.value เป็น text ล้วน)
--
-- ⛔ **ไม่ย้าย** `default_watermark` ราย guild โดยตั้งใจ — org เดียวมีหลาย guild และแต่ละ guild
--    ตั้งค่าคนละไฟล์ (ราชบุรี='pple-orange.png' · อาสาฯ='asa-no-txt.png') ยัดเข้า org เดียว
--    ต้องเลือกทิ้งอันหนึ่งแบบมั่ว · ทุกกลุ่มมี default ของตัวเองครบแล้ว จึงไม่กระทบการใช้งาน
-- ⛔ **ไม่ย้าย** `quote_default_template` ราย guild — ค่าเท่ากับแถว global อยู่แล้ว (ผลลัพธ์เท่าเดิม)
INSERT INTO org_config (org_id, key, value, updated_at)
SELECT DISTINCT ON (g.org_id, c."key")
       g.org_id,
       c."key",
       regexp_replace(c.value #>> '{}', '^(guild|personal):', ''),
       now()
  FROM dc_guild_config c
  JOIN dc_guilds g ON g.guild_id = c.guild_id
 WHERE c."key" LIKE 'default_watermark_group:%'
   AND g.org_id IS NOT NULL
 ORDER BY g.org_id, c."key", c.guild_id
ON CONFLICT (org_id, key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-08-10 · ตำแหน่งลายน้ำที่ผู้ใช้เลือกตอนกดเผยแพร่
-- NULL = สุ่ม (พฤติกรรมเดิม) — งานที่เข้าคิวไว้ก่อน deploy จึงไม่เปลี่ยนพฤติกรรม
ALTER TABLE post_social_history ADD COLUMN IF NOT EXISTS wm_pos VARCHAR(20);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-08-12 · newsWatch — จำว่าข่าวชิ้นไหนส่งเข้าห้องไปแล้ว
-- ถ้าไม่มีตารางนี้ digest รอบ 17:00 จะซ้ำกับรอบ 8:00 ทั้งหมด
-- item_key = sha1 ของ guid จาก RSS (guid ดิบยาวเฉลี่ย 360 ตัวอักษร สูงสุด 1,425 → hash กันดัชนีบวม)
-- ⚠️ channel_id อยู่ใน PK ด้วย เพราะ 1 guild มีได้หลาย feed (คนละห้อง คนละคำค้น)
--    ถ้าคีย์แค่ guild_id ห้องที่สองจะไม่เห็นข่าวที่ห้องแรกส่งไปแล้ว ทั้งที่คนละกลุ่มผู้อ่าน
CREATE TABLE IF NOT EXISTS news_watch_seen (
  guild_id   VARCHAR(20)  NOT NULL,
  channel_id VARCHAR(20)  NOT NULL,
  item_key   VARCHAR(40)  NOT NULL,
  title      TEXT,
  seen_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, channel_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_news_watch_seen_at ON news_watch_seen (seen_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-08-12 · ห้องข่าวสารผูกรายกลุ่ม social (เดิมผูกราย guild ที่ dc_guild_config)
-- เหตุ: กล่องเผยแพร่ /posts เลือก "กลุ่ม" ข้ามเซิร์ฟได้ แต่ห้องข่าวสารเดินตาม guild ที่เปิดหน้าอยู่
--       → โพสต์ในนามเพจราชบุรีไปลงห้องข่าวของเซิร์ฟอาสาฯ เงียบๆ
-- เก็บที่ dc_social_accounts เพราะตารางนี้เก็บค่าระดับกลุ่มซ้ำทุกแถวอยู่แล้ว (group_name/guild_id/visibility)
--       ห้ามเก็บเป็นแถว platform='news' — ตารางนี้ถูกอ้าง 23 ไฟล์ จะกลายเป็น "บัญชีปลอมไม่มี token"
-- ค่า 3 สถานะ: NULL = ใช้ห้องของ guild (ของเดิม, เฉพาะกลุ่ม public) · '<channel id>' = ห้องนี้ · 'off' = ไม่ส่ง
ALTER TABLE dc_social_accounts ADD COLUMN IF NOT EXISTS news_channel_id VARCHAR(20);
COMMENT ON COLUMN dc_social_accounts.news_channel_id IS
  'ห้องข่าวสาร Discord ของกลุ่มนี้ · NULL = fallback dc_guild_config (public เท่านั้น) · off = ไม่ส่ง'; 


-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-08-12 · org_ai_prompts — prompt ของ AI ทุกจุด แก้ได้จาก backoffice ระดับ org
--              (แทนที่ dc_ai_modes ซึ่งคีย์ด้วย guild_id ทั้งที่ไม่เคย per-guild จริง)
-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ ทำไมไม่สร้างตารางใหม่แยกจาก dc_ai_modes: ทั้งคู่คือ "prompt ที่มีชื่อ" เหมือนกัน
--    ต่างแค่ lifecycle → คุมด้วยคอลัมน์ `kind` แทนการมีตาราง prompt 2 ใบให้สับสน
--      kind='mode' = รายการที่ผู้ใช้สร้าง/ลบเองได้ โผล่เป็นเมนูในบอท (มี label/sort_order/enabled)
--      kind='slot' = ช่องผูกกับโค้ด (`/api/posts/ai/caption` ต้องการ prompt ตัวนั้นตัวเดียว)
--                    **ลบไม่ได้** — ลบแล้ว route ไม่มี prompt ใช้ · enabled ไม่มีความหมาย
--
-- ⛔ ไม่ seed แถว kind='slot' ลง DB เลย — ค่าตั้งต้นอยู่ใน config/aiPrompts.js (โค้ด)
--    เหตุ: คัดลอก prompt ยาวๆ มาแปะใน SQL = เสี่ยงพิมพ์ตกแล้ว AI เปลี่ยนพฤติกรรมเงียบๆ
--    แถวใน DB จึงมีเฉพาะ "ที่ org แก้ทับ" · ไม่มีแถว = ใช้ค่าโค้ด (เหมือน getModes เดิม fallback AI_MODES)
--
-- ⚠️ org_id NULL = ชุดกลางใช้ทุก org · PostgreSQL 14 **ไม่มี** UNIQUE NULLS NOT DISTINCT (PG15+)
--    UNIQUE (org_id, value) เฉยๆ จะปล่อยให้มีแถว org_id=NULL ซ้ำ value ได้ → ต้องแยก 2 partial index
CREATE TABLE IF NOT EXISTS org_ai_prompts (
  id         BIGSERIAL PRIMARY KEY,
  org_id     INTEGER      REFERENCES orgs(id) ON DELETE CASCADE,  -- NULL = ชุดกลางของทั้งระบบ
  kind       VARCHAR(10)  NOT NULL DEFAULT 'mode' CHECK (kind IN ('mode','slot')),
  value      VARCHAR(50)  NOT NULL,   -- slot: 'posts.caption' · mode: 'summary'
  label      VARCHAR(100) NOT NULL,
  prompt     TEXT         NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_by INTEGER      REFERENCES users(id),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_ai_prompts_org
    ON org_ai_prompts (org_id, value) WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_ai_prompts_global
    ON org_ai_prompts (value) WHERE org_id IS NULL;

-- ย้าย mode เดิมของบอทมาทั้งดุ้น (ทุกแถวเป็น guild_id='global' อยู่แล้ว → org_id NULL)
-- ⚠️ ต้องย้ายค่าจาก DB ไม่ใช่ re-seed จาก config/aiModes.js — สองที่นี้ **diverge กันแล้ว**
--    (getModes เดิมคืนแถว DB ถ้ามี → prompt ที่บอทใช้จริงวันนี้คือของใน DB ไม่ใช่ของในโค้ด)
INSERT INTO org_ai_prompts (org_id, kind, value, label, prompt, sort_order, enabled)
SELECT NULL, 'mode', value, label, prompt, sort_order, enabled
  FROM dc_ai_modes WHERE guild_id = 'global'
ON CONFLICT DO NOTHING;

-- ⚠️ DROP ทีหลังสุด และ **บอท + เว็บต้อง deploy พร้อมกัน** — db/aiConfig.js (โปรเซสบอท)
--    กับ web/app/api/bot/ai-modes/route.js ยิงตารางนี้ทั้งคู่ ปล่อยฝั่งเดียวไป = บอทพังเงียบ
DROP TABLE IF EXISTS dc_ai_modes;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-14 — kanban ก้อน 1: "การบ้านของฉัน" (3 ตาราง · ยังไม่มีกระดาน)
--
-- ดีไซน์เต็ม: md/kanban/KANBAN.md · ก้อน 0 ปิดแล้ว (grill 13 + /scrutinize + เช็คข้อมูลจริง)
-- ก้อนนี้ตั้งใจ **ไม่มี** kanban_boards / kanban_columns / การลาก / auto-mirror
-- เหตุผล: ความเสี่ยงอันดับ 1 คือ "ไม่มีใครใช้" → พิสูจน์ด้วย 3 ตารางก่อนจ่ายค่ากระดาน
--
-- 2 จุดที่ต่างจากเอกสารดีไซน์ (เกิดจากการสลับลำดับก้อน — บันทึกไว้กันงงตอนถึงก้อน 3):
--   1. ref เป็นเลขรันต่อ **org** ไม่ผูกกระดาน (ดีไซน์เดิม = <board.key>-<เลขรัน>)
--      เพราะกระดานมาทีหลัง + ย้ายกระดานแล้วเลขต้องไม่เปลี่ยน ไม่งั้นลิงก์ที่แชร์ใน Discord ตาย
--   2. status_type อยู่บน **การ์ด** (ดีไซน์เดิมอยู่บน kanban_columns)
--      ก้อนนี้ไม่มีช่อง การ์ดเลยต้องถือสถานะเอง · ถึงก้อน 3 ช่องเป็นแค่ "การจัดกลุ่มบนจอ"
--      ⛔ ห้ามให้ช่องกลายเป็นแหล่งสถานะที่ 2 — ลากเข้าช่อง = เขียน status_type ของการ์ด
--      ⛔ ก้อน 4 การ์ดที่ผูกเคส/โพสต์ **ห้ามอ่าน status_type คอลัมน์นี้** ต้องคำนวณสดจาก entity
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kanban_cards (
  id             BIGSERIAL PRIMARY KEY,
  org_id         INTEGER      NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  ref_no         INTEGER      NOT NULL,               -- เลขรันต่อ org · แสดงผลเป็น K-42
  title          VARCHAR(200) NOT NULL,
  detail         TEXT,
  status_type    VARCHAR(12)  NOT NULL DEFAULT 'backlog'
                 CHECK (status_type IN ('backlog','doing','review','ready','done','cancelled')),
  owner_user_id  INTEGER      REFERENCES users(id) ON DELETE SET NULL,   -- เจ้าภาพ · NULL = ยังไม่มีคนรับ
  due_at         TIMESTAMPTZ,                         -- ⚠️ local Thai time จากฟอร์ม — ห้าม toISOString() (เคสเดียวกับ txn_at)
  priority       SMALLINT     NOT NULL DEFAULT 0,     -- 0 ปกติ · 1 สำคัญ · 2 ด่วน
  blocked        BOOLEAN      NOT NULL DEFAULT FALSE, -- "ติดปัญหา" เป็นธง ไม่ใช่สถานะ (ดีไซน์ §ประเภทสถานะ)
  blocked_reason TEXT,
  created_by     INTEGER      NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(), -- optimistic lock token ของ autosave (เคสเดียวกับ post_episodes)
  completed_at   TIMESTAMPTZ,
  archived_at    TIMESTAMPTZ,                         -- soft delete — ไม่มี hard delete ในโมดูลนี้

  -- ดีไซน์ §ช่องโหว่ข้อ 5: การ์ดไม่มีเจ้าภาพ อยู่ได้ที่ backlog เท่านั้น (บังคับที่ DB ไม่ใช่แค่ UI)
  CONSTRAINT kanban_cards_owner_required
    CHECK (owner_user_id IS NOT NULL OR status_type = 'backlog')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kanban_cards_ref  ON kanban_cards (org_id, ref_no);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_owner      ON kanban_cards (org_id, owner_user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kanban_cards_due        ON kanban_cards (org_id, due_at)        WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kanban_cards_status     ON kanban_cards (org_id, status_type)   WHERE archived_at IS NULL;

-- คนช่วย — กี่คนก็ได้ (เจ้าภาพอยู่บนการ์ด ไม่ต้องมีแถวที่นี่ซ้ำ)
CREATE TABLE IF NOT EXISTS kanban_card_helpers (
  card_id   BIGINT      NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  user_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_kanban_helpers_user ON kanban_card_helpers (user_id);

-- งานย่อยในการ์ด (user เคาะเพิ่มจาก grill ข้อ 11 — งานอีเวนต์/ลงพื้นที่ต้องใช้จริง)
CREATE TABLE IF NOT EXISTS kanban_card_checklist (
  id         BIGSERIAL PRIMARY KEY,
  card_id    BIGINT       NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  text       VARCHAR(300) NOT NULL,
  done       BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kanban_checklist_card ON kanban_card_checklist (card_id, sort_order);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-15 — kanban: ป้าย (มีกลุ่ม) + ช่วงวันที่
--
-- ที่มา: วิเคราะห์ backups/kanban/kanban_import.xlsx (83 การ์ดจาก AppFlowy ของราชบุรี)
-- เจอ 3 field ที่หน้าตาการใช้งานเหมือนกันเป๊ะ (เลือกได้หลายค่าจากรายการ):
--     category 13 ค่า · อำเภอ 11 ค่า · อุปกรณ์ 22 ค่า
--   → ยุบเป็นกลไกเดียว = ป้ายที่มี "กลุ่ม" กำกับ (md/kanban/CUSTOM-FIELDS.md)
--
-- ⛔ ห้ามเพิ่มคอลัมน์ district/area ลง kanban_cards เด็ดขาด
--    "อำเภอ" เป็นคำของ PPLE ราชบุรีเท่านั้น — org กรุงเทพใช้เขต ทีมชาติใช้ภาค
--    และในข้อมูลจริงมีค่า "ทีมจังหวัด" ปนอยู่ ซึ่งไม่ใช่อำเภอด้วยซ้ำ
--    → ทุกอย่างต้องเป็นข้อมูลที่ org ตั้งเอง ไม่มีชื่อพื้นที่ใดๆ ใน schema
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
COMMENT ON COLUMN kanban_cards.start_at IS
  'วันเริ่มงาน — งานอีเวนต์กินหลายวัน (ข้อมูลจริง 4/52 ใบเป็นช่วง) · NULL = งานจุดเดียวใช้ due_at พอ';

CREATE TABLE IF NOT EXISTS kanban_labels (
  id         BIGSERIAL PRIMARY KEY,
  org_id     INTEGER      NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  group_name VARCHAR(60),              -- 'สายงาน' · 'พื้นที่' · 'อุปกรณ์' · NULL = ไม่จัดกลุ่ม
                                       -- ("group" เป็นคำสงวนของ SQL จึงใช้ group_name)
  name       VARCHAR(60)  NOT NULL,
  color      VARCHAR(20),              -- token สีของ UI · NULL = ให้ UI เลือกเอง
  sort_order INT          NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,             -- ซ่อน ไม่ใช่ลบ — ลบป้ายที่ติดการ์ดอยู่ = ข้อมูลหายเงียบ
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ชื่อซ้ำได้ถ้าอยู่คนละกลุ่ม ("เมือง" เป็นได้ทั้งพื้นที่และสายงาน)
-- COALESCE เพราะ NULL ไม่เท่ากับ NULL ใน unique index — ไม่งั้นป้ายไม่จัดกลุ่มซ้ำได้ไม่จำกัด
CREATE UNIQUE INDEX IF NOT EXISTS uq_kanban_labels_name
    ON kanban_labels (org_id, COALESCE(group_name, ''), name);
CREATE INDEX IF NOT EXISTS idx_kanban_labels_org
    ON kanban_labels (org_id, group_name, sort_order) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS kanban_card_labels (
  card_id  BIGINT NOT NULL REFERENCES kanban_cards(id)  ON DELETE CASCADE,
  label_id BIGINT NOT NULL REFERENCES kanban_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_kanban_card_labels_label ON kanban_card_labels (label_id);

-- 2026-08-17 · kanban: ช่อง "ยกเลิก" → "กรุ" (พักไว้ รอปัดฝุ่น)
-- user ไม่ใช้ "ยกเลิก" เลย (0 ใบ — งานที่ไม่เอาเขาลบทิ้ง) แต่ต้องการที่พักงานที่ยังไม่ทำตอนนี้
-- ป้ายเปลี่ยนที่ i18n · ฝั่ง DB ต้องผ่อน CHECK เพราะ "งานที่ยังไม่มีเจ้าภาพ" ต้องเข้ากรุได้
-- (ของเดิม: ไม่มีเจ้าภาพ = อยู่ได้แค่ backlog เท่านั้น)
ALTER TABLE kanban_cards DROP CONSTRAINT IF EXISTS kanban_cards_owner_required;
ALTER TABLE kanban_cards ADD CONSTRAINT kanban_cards_owner_required
  CHECK (owner_user_id IS NOT NULL OR status_type IN ('backlog', 'cancelled'));


-- 2026-08-18 · avatar ย้ายมาอยู่ที่ users (เป็นของบัญชี ไม่ใช่ของ guild)
-- เดิมเก็บที่ org_members ต่อ guild → คนเดียวกันต้อง backfill ซ้ำทุก guild (prod มี 5 guild)
-- และไม่มีใครอัปเดตตอนเจ้าตัวเปลี่ยนรูป (URL ฝัง hash ไว้ → ของเก่ากลายเป็น 404 เงียบๆ)
-- ตั้งแต่นี้ users.avatar คือแหล่งจริง · org_members.avatar เหลือไว้เป็น fallback ของเก่าเท่านั้น
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

-- ยกของเดิมขึ้นมา: เอาแถวที่ sync ล่าสุดของแต่ละคน
UPDATE users u
   SET avatar = s.avatar
  FROM (SELECT DISTINCT ON (user_id) user_id, avatar
          FROM org_members
         WHERE avatar IS NOT NULL AND user_id IS NOT NULL
         ORDER BY user_id, roles_assigned_at DESC NULLS LAST) s
 WHERE s.user_id = u.id AND u.avatar IS NULL;



-- 2026-08-18 · คืน DEFAULT ให้ dc_orgchart_config.excluded
-- prod มีคอลัมน์ NOT NULL แต่ DEFAULT หาย (group_name ในแถวเดียวกันยังได้ 'other' ปกติ)
-- → /orgchart scan ตายที่ role ใหม่ตัวแรกด้วย 23502 เพราะ INSERT ไม่ได้ระบุ excluded
-- ลายเซ็นของตารางที่เคยถูก DBeaver auto-create ตอนย้าย data (ทิ้ง DEFAULT)
ALTER TABLE dc_orgchart_config ALTER COLUMN excluded SET DEFAULT FALSE;

--
-- ⬇⬇ ทุกอย่างใต้บรรทัดนี้ = ยังไม่ได้รันบน production ⬇⬇
--    วิธีรัน (user รันทุกอย่างหลัง marker เสมอ — ห้ามทำไฟล์แยก มันหลุดจากกันแน่นอน):
--      คัดตั้งแต่ BEGIN; ถึง COMMIT; ข้างล่างไปรัน แล้วเลื่อน marker นี้ลงมาท้ายไฟล์ + commit
--
-- ⛔ รอบ 2026-08-19: ต้อง TRUNCATE kanban_cards ก่อน ไม่งั้นพัง 1 บรรทัด
--    ALTER TABLE kanban_card_checklist ALTER COLUMN field_id SET NOT NULL
--    (field_id เพิ่งถูกเพิ่ม → แถวเช็คลิสต์เดิมเป็น NULL หมด)
--    user เคาะแล้วว่าการ์ดบน prod ทิ้งได้:
--      TRUNCATE kanban_cards RESTART IDENTITY CASCADE;

BEGIN;

-- 2026-08-18 · kanban: ลิงก์ต้นทางดิสฯ — บอทเคยทิ้ง msg.id ไปเฉยๆ ตอนสร้างการ์ดจาก "📌 สร้างเป็นการบ้าน"
-- บอท+importer เขียนเท่านั้น (ไม่ใช่ custom field ที่คนแก้ได้ — ดู md/kanban/CUSTOM-FIELDS.md §เส้นแบ่ง)
-- pattern เดียวกับ post_episode_media.source_url/source_message_id
ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS source_url        text;
ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS source_message_id varchar(20);


-- 2026-08-18 · kanban ขั้น 2: แกน custom field (5 ชนิดสเกลาร์)
-- ดีไซน์: md/kanban/CUSTOM-FIELDS.md · แผนเต็ม ~/.claude/plans/reactive-churning-falcon.md
-- type_options เก็บไว้เผื่ออนาคต (ลอก AppFlowy design) — รอบนี้ยังไม่มี config อะไรใช้จริง เก็บ '{}' เฉยๆ
CREATE TABLE IF NOT EXISTS kanban_field_defs (
  id          BIGSERIAL PRIMARY KEY,
  org_id      INTEGER      NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  board_id    BIGINT,                    -- NULL = ใช้ทุกกระดาน (ยังไม่มีกระดานจริง — ก้อน 3 ค่อยเปิดให้เลือก)
  key         VARCHAR(60)  NOT NULL,     -- ชื่อในโค้ด — ห้ามเปลี่ยนหลังสร้าง (label เปลี่ยนได้)
  label       VARCHAR(100) NOT NULL,
  help_text   TEXT,
  type        VARCHAR(20)  NOT NULL,     -- ก้อน 3 ค่อยเพิ่ม 'select'/'multi_select' เข้า CHECK นี้
  type_options jsonb       NOT NULL DEFAULT '{}'::jsonb,
  sort_order  INT          NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT kanban_field_defs_type_check CHECK (type IN ('text','number','url','date','checkbox'))
);

-- COALESCE(board_id, 0) กัน NULL≠NULL ของ unique index (แนวเดียวกับ uq_kanban_labels_name)
CREATE UNIQUE INDEX IF NOT EXISTS uq_kanban_field_defs_key
    ON kanban_field_defs (org_id, COALESCE(board_id, 0), key);
CREATE INDEX IF NOT EXISTS idx_kanban_field_defs_org
    ON kanban_field_defs (org_id, sort_order) WHERE archived_at IS NULL;

-- คอลัมน์แยกตามชนิด ไม่ใช่ jsonb ก้อนเดียว — ต้อง WHERE/SUM ด้วย SQL จริงได้ (ต่างจาก AppFlowy ที่คำนวณในเครื่องบน CRDT)
CREATE TABLE IF NOT EXISTS kanban_card_field_values (
  card_id    BIGINT NOT NULL REFERENCES kanban_cards(id)      ON DELETE CASCADE,
  field_id   BIGINT NOT NULL REFERENCES kanban_field_defs(id) ON DELETE CASCADE,
  value_text TEXT,
  value_num  NUMERIC(18,4),
  value_date DATE,
  value_bool BOOLEAN,
  PRIMARY KEY (card_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_kanban_card_field_values_field ON kanban_card_field_values (field_id);


-- 2026-08-18 (รอบเย็น) · kanban: select/multi_select + checklist เป็น custom field type
-- กลับคำรอบที่ 3 ของโมดูลนี้ (ดู md/kanban/CUSTOM-FIELDS.md §กลับคำ):
--   1) "งานย่อย" เดิมเคาะไว้เป็นคอลัมน์จริง (เส้นแบ่งตอนต้นแผน) → ตอนนี้เป็น custom field type แทน
--      ไม่มีข้อมูลจริงใน kanban_card_checklist เลย (โมดูลยังไม่เคย deploy) — replace ได้เต็มๆ ไม่ต้อง migrate
--   2) ตัดเรื่อง admin gate ทั้งชุดของ custom field (fields+options+checklist) — user เคาะ "ไม่ต้องมี field
--      manager ให้ยุ่งยาก" ทุกอย่าง manage ได้จากในการ์ดที่กำลังแก้เลย (เหมือน canEditCard) ไม่ใช่หน้าแอดมินแยก
ALTER TABLE kanban_field_defs DROP CONSTRAINT IF EXISTS kanban_field_defs_type_check;
ALTER TABLE kanban_field_defs ADD CONSTRAINT kanban_field_defs_type_check
  CHECK (type IN ('text','number','url','date','checkbox','select','multi_select','checklist'));

-- ตัวเลือกของ select/multi_select ผูกกับ field เดียว (ต่างจาก kanban_labels ที่เป็นคำศัพท์กลางทั้ง org)
-- ⛔ ห้ามลบถาวร — archived_at เท่านั้น (บทเรียนเดียวกับป้าย: ตัวเลือกที่ติดค่าการ์ดอยู่ห้ามหายเงียบ)
CREATE TABLE IF NOT EXISTS kanban_field_options (
  id          BIGSERIAL PRIMARY KEY,
  field_id    BIGINT       NOT NULL REFERENCES kanban_field_defs(id) ON DELETE CASCADE,
  name        VARCHAR(60)  NOT NULL,
  color       VARCHAR(20),              -- NULL = สีอัตโนมัติจากชื่อ (แนวเดียวกับ kanban_labels.color)
  sort_order  INT          NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kanban_field_options_name ON kanban_field_options (field_id, name);
CREATE INDEX IF NOT EXISTS idx_kanban_field_options_field
    ON kanban_field_options (field_id, sort_order) WHERE archived_at IS NULL;

-- select ใช้ array ยาว ≤1 · multi_select ยาวเท่าไหร่ก็ได้ — คอลัมน์เดียวพอ ไม่ต้องแยกตามชนิด
ALTER TABLE kanban_card_field_values ADD COLUMN IF NOT EXISTS value_options BIGINT[];

-- checklist ย้ายจาก "1 การ์ด 1 เช็คลิสต์ตายตัว" → ผูกกับ field แทน (1 การ์ดมีได้หลายเช็คลิสต์ ถ้า org สร้างหลาย field)
-- 0 แถวตอนนี้ (ยังไม่เคย deploy) → ใส่ NOT NULL ตรงๆ ไม่ต้อง backfill
ALTER TABLE kanban_card_checklist ADD COLUMN IF NOT EXISTS field_id BIGINT REFERENCES kanban_field_defs(id) ON DELETE CASCADE;
ALTER TABLE kanban_card_checklist ALTER COLUMN field_id SET NOT NULL;

DROP INDEX IF EXISTS idx_kanban_checklist_card;
CREATE INDEX IF NOT EXISTS idx_kanban_checklist_card_field
    ON kanban_card_checklist (card_id, field_id, sort_order);



-- 2026-08-18 — กันใบสรุป "📤 โพสต์ออกแล้ว" แจ้งซ้ำ
-- notifyBatchDone เดิมเช็คแค่ "ตอนนี้ทั้ง batch จบหรือยัง" ไม่มีบันทึกว่าเคยแจ้งแล้ว
-- → ทุกครั้งที่ batch กลับมาจบครบอีกรอบ (กดลองใหม่ / worker คืนแถวเข้าคิว) จะแจ้งซ้ำทั้งชุด
-- NULL = ยังไม่เคยแจ้ง · แถวเก่าทั้งหมดเป็น NULL ตั้งต้น (แจ้งไปแล้วแต่ batch จบไปนานแล้ว ไม่ถูกแตะอีก)
ALTER TABLE post_social_history ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-18 (รอบดึก) · kanban: checklist ดึงรายการจากคลัง option + ลบตัวเลือกถาวร
--
-- ทำไมต้องมาก่อนโค้ดลบตัวเลือก: deleteFieldOption() ต้องคัดชื่อลง checklist.text
-- ก่อน DELETE ไม่งั้นรายการที่ติ๊กไว้กลายเป็นบรรทัดว่าง → ต้องมีคอลัมน์นี้ก่อน
--
-- option_id มีค่า  → แสดงชื่อจาก kanban_field_options (เปลี่ยนชื่อในคลัง = ทุกการ์ดเปลี่ยนตาม)
-- option_id = NULL → ใช้ text (ของเดิม + รายการครั้งเดียวที่ไม่อยากลงคลัง)
-- ⚠️ SET NULL ไม่ใช่ CASCADE — ลบตัวเลือกออกจากคลังแล้วรายการบนการ์ดต้องยังอยู่
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE kanban_card_checklist
  ADD COLUMN IF NOT EXISTS option_id BIGINT REFERENCES kanban_field_options(id) ON DELETE SET NULL;

-- text ว่างได้แล้ว เพราะชื่ออาจมาจาก option แทน
ALTER TABLE kanban_card_checklist ALTER COLUMN text DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kanban_checklist_option ON kanban_card_checklist (option_id)
    WHERE option_id IS NOT NULL;

-- 2026-08-19 · kanban: ถอด "ติดปัญหา" ออกจากตารางให้หมด
-- ฟีเจอร์ถูกถอดจาก UI ไปแล้ว 2026-08-18 · user สั่งลบคอลัมน์ทิ้ง 2026-08-19
-- ⚠️ ลบข้อมูลถาวร — ตรวจก่อนบน prod: SELECT count(*) FROM kanban_cards WHERE blocked;
ALTER TABLE kanban_cards DROP COLUMN IF EXISTS blocked;
ALTER TABLE kanban_cards DROP COLUMN IF EXISTS blocked_reason;

-- 2026-08-19 · kanban: ลบตารางป้ายทิ้ง (ยุบเข้า custom field แล้ว)
--
-- ⛔⛔ ลำดับบน production ห้ามสลับ:
--   1. รัน  node --env-file=.env scripts/migration/kanbanLabelsToFields.mjs           (dry-run ดูก่อน)
--   2. รัน  node --env-file=.env scripts/migration/kanbanLabelsToFields.mjs --commit  (ย้ายข้อมูลจริง)
--   3. deploy โค้ดใหม่ (อ่านแท็กจาก custom field อย่างเดียวแล้ว)
--   4. ตรวจว่าแท็กบนการ์ดขึ้นครบ แล้วค่อยรัน 2 บรรทัดล่างนี้
--
-- ทำสลับ = แท็กบนการ์ดหายไปต่อหน้า (ขึ้นโค้ดก่อนย้าย) หรือกู้ไม่ได้ (ลบตารางก่อนย้าย)
DROP TABLE IF EXISTS kanban_card_labels;
DROP TABLE IF EXISTS kanban_labels;

-- 2026-08-19 · ชื่อคนที่โชว์ ย้ายมาเอาจาก org_members.display_name เป็นอันดับแรก
-- (เดิมเริ่มที่ users.firstname ซึ่งมีแค่ 19% ของสมาชิก → 81% ตกไปโชว์ username ดิบ เช่น 'mark30260')
-- สูตรอยู่ที่ web/db/displayName.js — มันยิง subquery ต่อ 1 คนต่อ 1 แถว ต้องมี index ไม่งั้น seq scan
CREATE INDEX IF NOT EXISTS idx_org_members_user_org ON org_members (user_id, org_id);

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-24 — kanban ก้อน 3: กระดาน (board) จริง
--
-- ดีไซน์: md/kanban/KANBAN.md §Data model · แผนที่ประเมินไว้: md/PENDING.md §🗂️
-- migration แบบ **เติมล้วน** ไม่มีแปลง type (รางวางไว้ตั้งแต่ก้อน 1: kanban_field_defs.board_id
-- มีอยู่แล้ว และ unique index ใช้ COALESCE(board_id, 0) มาตั้งแต่แรก)
--
-- ⭐ เคาะ 2026-08-24 — guild ไม่ใช่ชั้นข้อมูล แต่บอร์ดผูก guild ได้:
--   user มอง guild เป็น workspace (org 1 คร่อม 3 guild: 5563/1478/458 คน) แต่ถ้าให้ kanban
--   อ่านงานผ่าน guild_id เป็นชั้นบังคับ = ผูกตายกับ Discord ขัดเป้าหมาย "ไม่มี Discord ก็ใช้ได้"
--   → kanban_boards.guild_id **nullable** = ป้ายบอกว่าบอร์ดนี้ของทีมในเซิร์ฟไหน
--     (ใช้จัดกลุ่มรายชื่อบอร์ดบนเว็บ + ให้ context menu ในดิสฯ เสนอบอร์ดของเซิร์ฟนั้นก่อน)
--     ตารางยังเป็น org > board > card สามชั้นเท่าเดิม
--
-- ⛔ ก้อนนี้ตั้งใจ **ไม่มี** kanban_columns — ช่องยังเป็น status_type 6 แบบตรงๆ เหมือนเดิม
--    (MVP เขียนไว้เองว่า "ปุ่มแก้ช่องวางโครงไว้เฉยๆ" · เพิ่มตอนนี้เสี่ยงให้ช่องกลายเป็น
--     แหล่งสถานะที่ 2 ซึ่งเป็นข้อห้ามข้อแรกของทั้งดีไซน์)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS kanban_boards (
  id          BIGSERIAL PRIMARY KEY,
  org_id      INTEGER      NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  guild_id    VARCHAR(20),                          -- NULL = ไม่ผูกเซิร์ฟไหน (ทีมที่ไม่ใช้ Discord)
  name        VARCHAR(100) NOT NULL,
  detail      TEXT,
  open_to_org BOOLEAN      NOT NULL DEFAULT TRUE,   -- เปิดให้ทุกคนใน org เห็น (ดีไซน์ §สิทธิ์ ข้อ 1)
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_by  INTEGER      NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kanban_boards_org ON kanban_boards (org_id, sort_order, id);

-- ยศที่เห็นบอร์ดได้ (ดีไซน์ §สิทธิ์ ข้อ 2) — ใช้ยศเดิมใน lib/permissions.js ไม่สร้าง permission ใหม่
CREATE TABLE IF NOT EXISTS kanban_board_permissions (
  board_id   BIGINT      NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  permission VARCHAR(40) NOT NULL,
  PRIMARY KEY (board_id, permission)
);

-- คนที่เชิญเพิ่มรายคน (ดีไซน์ §สิทธิ์ ข้อ 3)
CREATE TABLE IF NOT EXISTS kanban_board_members (
  board_id  BIGINT      NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  user_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'member' | 'manager'
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS board_id BIGINT REFERENCES kanban_boards(id);

-- ── backfill: ทุก org ที่มีการ์ดอยู่แล้ว ได้กระดานตั้งต้น 1 ใบ แล้วยกการ์ดเข้าไปทั้งหมด ──
-- ทำได้ใน 1 statement เพราะตอนนี้ทีมเดียว งานชุดเดียว (81 ใบ · org 1)
-- ยิ่งเลื่อนยิ่งแพง: มีทีมที่ 2 ลงงานเมื่อไหร่ ต้องมานั่งแยกทีละใบด้วยมือว่าใบไหนของกระดานไหน
INSERT INTO kanban_boards (org_id, name, open_to_org, created_by, created_at)
SELECT c.org_id, 'กระดานหลัก', TRUE,
       (SELECT created_by FROM kanban_cards x WHERE x.org_id = c.org_id ORDER BY x.id LIMIT 1),
       now()
  FROM kanban_cards c
 WHERE NOT EXISTS (SELECT 1 FROM kanban_boards b WHERE b.org_id = c.org_id)
 GROUP BY c.org_id;

UPDATE kanban_cards c
   SET board_id = (SELECT b.id FROM kanban_boards b
                    WHERE b.org_id = c.org_id ORDER BY b.id LIMIT 1)
 WHERE c.board_id IS NULL;

ALTER TABLE kanban_cards ALTER COLUMN board_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kanban_cards_board ON kanban_cards (board_id, status_type);

-- ── custom field: ยกเข้ากระดานเดียวกัน แล้วปิดความหมาย "NULL = ของกลางข้ามบอร์ด" ──
-- ข้อขัดแย้งที่ PENDING.md เตือนไว้ (schema เขียน NULL = ใช้ทุกกระดาน แต่ user เคาะทีหลังว่า
-- "คลังตัวเลือกห้ามข้าม board") — เลือกทาง (ก): backfill ทั้งหมดเข้ากระดาน + SET NOT NULL
-- ตอนนี้ข้อมูลเป็น NULL หมด 5 ตัว = กวาดทีเดียวสะอาด · บอร์ดใหม่ตั้ง field ของตัวเอง
UPDATE kanban_field_defs d
   SET board_id = (SELECT b.id FROM kanban_boards b
                    WHERE b.org_id = d.org_id ORDER BY b.id LIMIT 1)
 WHERE d.board_id IS NULL
   AND EXISTS (SELECT 1 FROM kanban_boards b WHERE b.org_id = d.org_id);

COMMIT;

-- ⚠️ ยังไม่ SET NOT NULL ให้ kanban_field_defs.board_id — ทำหลัง deploy โค้ดใหม่แล้วตรวจว่า
--    field ขึ้นครบทุกการ์ด (โค้ดเก่าอ่าน d.board_id IS NULL อยู่ ถ้าบังคับก่อน field หายทั้งหน้า)


-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-24: kanban_card_links — ผูกการ์ดกับ "ของจริง" (เคส / โพสต์)
--
-- ⭐ กฎเหล็กของดีไซน์ (md/kanban/KANBAN.md §กฎเหล็ก): การ์ดที่ผูกของจริง **ไม่เก็บสถานะเอง**
--    `kanban_cards.status_type` ของการ์ดพวกนี้เป็นแค่ cache — ตอนแสดงต้องคำนวณสดจากตารางต้นทาง
--    ถ้าเผลอเก็บสถานะซ้ำ = kanban กลายเป็น "ที่เก็บงานที่ 6" ทันที ทั้งดีไซน์พังทั้งอัน
--
-- ⭐ 1:1 สองทาง (ต่างจากร่างเดิมที่เขียน PK (card_id, entity_type)) — เปลี่ยนเพราะ:
--    ถ้าการ์ดใบเดียวผูกได้ทั้งเคสและโพสต์ = มีสถานะสด 2 แหล่งบนการ์ดใบเดียว ตัดสินไม่ได้ว่าอันไหนชนะ
--    → PK (card_id) = 1 การ์ด ผูกได้อย่างเดียว · UNIQUE (entity_type, entity_id) = 1 ของจริง มีการ์ดใบเดียว
--      (ตัวหลังคือตัวกันการ์ดซ้ำตอน auto-mirror ยิงพร้อมกัน 2 ทาง — เว็บ + บอท)
--
-- ⚠️ entity_type ต้องใส่ทุก JOIN/WHERE เสมอ — `cases.id` (1..) กับ `post_episodes.id` (1..)
--    ช่วงเลขทับกันเต็มๆ อยู่แล้ว (เคสเดียวกับ contact_type ใน calling ที่ CLAUDE.md เตือนไว้)
--
-- ⚠️ FK มีได้ข้างเดียว (card_id) เพราะ entity ชี้ได้ 2 ตาราง
--    → ฝั่ง entity ต้องกวาดด้วยโค้ด: deletePost ลบถาวรจริง (DELETE FROM post_episodes)
--      ถ้าไม่กวาด = การ์ดกำพร้าที่เปิดแล้ว error · เคสไม่มี hard delete จึงไม่มีปัญหานี้
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS kanban_card_links (
  card_id     BIGINT      NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  entity_type VARCHAR(10) NOT NULL,
  entity_id   BIGINT      NOT NULL,
  is_auto     BOOLEAN     NOT NULL DEFAULT TRUE,   -- TRUE = ระบบสร้างให้ (auto-mirror) · FALSE = คนกดผูกเอง
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id),
  CONSTRAINT kanban_card_links_entity_type_check CHECK (entity_type IN ('case', 'post'))
);

-- 1 ของจริง = การ์ดใบเดียวตลอดกาล (กันการ์ดซ้ำตอน mirror ยิงพร้อมกัน)
CREATE UNIQUE INDEX IF NOT EXISTS uq_kanban_card_links_entity
  ON kanban_card_links (entity_type, entity_id);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-25 — ปลดล็อกกอง "รอทำ" ของงานสื่อ (แก้คู่กับ web/db/kanban/statusSql.js)
--
-- ปัญหา: `post_episodes` มีสถานะแค่ draft/review/approved = สถานะ **บรรณาธิการ** ล้วนๆ
--   ไม่มีคำว่า "ยังไม่มีใครลงมือ" อยู่เลย → POST_STATUS เดิมแม็ป draft → 'doing'
--   ทำให้งานสื่อทุกใบตกกอง "กำลังทำ" ตั้งแต่วินาทีที่เกิด และกอง "รอทำ" ว่างตลอดกาล
--   (dev 2026-08-25: 31/31 ใบ · เจ้าภาพเป็นคนเดียวกันหมด = คนที่ import ไม่ใช่คนรับงานจริง)
--
-- แก้ที่โค้ดแล้ว: POST_STATUS คืน NULL ตอน draft → COALESCE ตกไปใช้ `c.status_type`
--   = kanban ถือสถานะ **ช่วงก่อนส่งตรวจ** (backlog/doing/cancelled) ส่วน review ขึ้นไปยังเป็นของต้นทาง
--
-- ที่ต้องทำที่นี่: การ์ดที่ mirror มาก่อนหน้านี้ถูกตั้ง 'doing' + เจ้าภาพลอกจากคนสร้างโพสต์ไว้แล้ว
--   ค่านั้นค้างอยู่ในคอลัมน์ cache ซึ่งตอนนี้กลายเป็นค่าที่ "ใช้จริง" → ต้องล้างครั้งเดียว
--
-- ⚠️ แตะเฉพาะใบที่ **ไม่มีใครรับงานจริง** — ดูจาก `c.owner_user_id = p.owner_user_id`
--    (เจ้าภาพยังเป็นคนสร้างโพสต์ตรงๆ = ไม่เคยมีใครกด "อาสาทำเอง") ใครคว้าไปแล้วไม่แตะ
-- ⚠️ ย้อนได้เสมอ — `post_episodes.owner_user_id` ไม่ถูกแตะ ดึงกลับมาได้ทุกเมื่อ
-- ⚠️ ผลข้างเคียงที่ตั้งใจ: การ์ดไม่มีเจ้าภาพจะโผล่ในหน้า "การบ้านของฉัน" ของทุกคน
--    (isMyCard นับงานไม่มีเจ้าภาพเป็นของทุกคน — kanbanGrouping.js:69) นั่นคือความหมายของกอง
--    "รอทำ" อยู่แล้ว: ใครก็หยิบได้ · ถ้าวันไหนกองนี้ใหญ่จนหน้าแรกรก ค่อยแยกกองต่างหาก
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE kanban_cards c
   SET owner_user_id = NULL,
       status_type   = 'backlog',
       completed_at  = NULL,
       updated_at    = now()
  FROM kanban_card_links l
  JOIN post_episodes p ON p.id = l.entity_id
 WHERE l.card_id = c.id
   AND l.entity_type = 'post'
   AND p.status = 'draft'
   AND p.archived_at IS NULL
   AND c.status_type = 'doing'
   AND c.owner_user_id IS NOT NULL
   AND c.owner_user_id = p.owner_user_id          -- ยังไม่มีใครคว้าไป
   AND NOT EXISTS (SELECT 1 FROM post_social_history h
                    WHERE h.episode_id = p.id AND h.posted_at IS NOT NULL);

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-25 — docs: ผู้รับเงินคนนอก (external payee)
--
-- ปัญหา: ออกใบสำคัญรับเงินให้คนที่ไม่มี user/Discord/ไม่อยู่ทะเบียนสมาชิกไม่ได้เลย
--   (วิทยากรนอก คนขับรถตู้ เจ้าของสถานที่) — ทางเดียวที่ทำได้วันนี้คือยืมบัญชีคนอื่น
--   มาผูกแล้ว override ชื่อทับ = ได้ใบที่ "ลายเซ็นเป็นของคนที่ไม่ใช่เจ้าของชื่อ"
--
-- ⚠️ member_user_id กับ external_payee_id เป็น XOR — ห้ามมีค่าพร้อมกัน
--    updateEntry() เดิมใช้ COALESCE เขียนคอลัมน์ผู้รับ = ล้างเป็น NULL ไม่ได้
--    ต้องแก้ให้เขียนทั้งสองคอลัมน์พร้อมกันเสมอ ไม่งั้นสลับสมาชิก→คนนอกจะชน CHECK นี้
--
-- ⚠️ view docs_entry_recipient มีไว้กัน getEntriesByProject กับ getEntryById แตกกัน
--    (วันนี้ select ฟิลด์ผู้รับคนละชุดอยู่แล้ว — ตัวลิสต์ไม่มี identification_number)
--    ชื่อคอลัมน์ในวิวตั้งให้ตรงกับที่ buildData() อ่านอยู่แล้ว → generatePdf ไม่ต้องแก้
--
-- ⚠️ signed_on_behalf: คนนอกไม่มีบัญชีให้ล็อกอิน → เซ็นบนเครื่องคนในทีม
--    signed_by_user_id จึงหมายถึง "คนที่ถือเครื่องตอนนั้น" ไม่ใช่ "ผู้รับเงิน"
--    ต้องแยกด้วยแฟล็กนี้ ห้ามปล่อยให้สองความหมายปนกันในคอลัมน์เดียว
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE docs_external_payees (
  id             SERIAL PRIMARY KEY,
  org_id         INT NOT NULL REFERENCES orgs(id),
  payee_type     VARCHAR(10)  NOT NULL DEFAULT 'person',   -- person | entity (ร้านค้า/นิติบุคคล)
  title          VARCHAR(20),                              -- นาย/นาง/นางสาว
  first_name     VARCHAR(100),
  last_name      VARCHAR(100),
  entity_name    VARCHAR(200),                             -- ใช้เมื่อ payee_type = 'entity'
  id_number      VARCHAR(20),                              -- บัตร ปชช. 13 หลัก หรือเลขผู้เสียภาษี
  house_no       VARCHAR(50),
  moo            VARCHAR(20),
  road           VARCHAR(100),
  subdistrict    VARCHAR(100),                             -- ตำบล/แขวง  → home_district
  district       VARCHAR(100),                             -- อำเภอ/เขต  → home_amphure
  province       VARCHAR(100),
  zip_code       VARCHAR(10),
  phone          VARCHAR(20),                              -- บัตรไม่มี — กรอกเอง
  id_card_image  BYTEA,                                    -- สำเนาบัตร (ย่อ+strip EXIF แล้ว)
  linked_user_id INT REFERENCES users(id),                 -- เผื่อวันหนึ่งเขาสมัครเป็นสมาชิก → merge ได้
  created_by     INT NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- กันสร้างซ้ำ: คนเดิมกลับมาอีกงานต้องเจอของเดิม ไม่ใช่แถวใหม่
CREATE UNIQUE INDEX docs_external_payees_idnum_uniq
  ON docs_external_payees (org_id, id_number) WHERE id_number IS NOT NULL;
CREATE INDEX docs_external_payees_name_idx
  ON docs_external_payees (org_id, first_name, last_name);

ALTER TABLE docs_activity_entries
  ADD COLUMN external_payee_id INT REFERENCES docs_external_payees(id),
  ADD CONSTRAINT docs_entry_recipient_xor
    CHECK (NOT (member_user_id IS NOT NULL AND external_payee_id IS NOT NULL));

ALTER TABLE docs_signatures
  ADD COLUMN signed_on_behalf BOOLEAN NOT NULL DEFAULT false;

-- ตัวตนผู้รับเงินของแต่ละ entry — resolve จากสองแหล่งครั้งเดียว
-- ชื่อคอลัมน์ตรงกับที่ generatePdf.buildData() อ่านอยู่แล้ว
-- ⚠️ ต้อง NULLIF(...,'') ทุกช่องของคนนอก — ฟอร์มส่งช่องที่ไม่ได้กรอกมาเป็น '' ซึ่ง COALESCE
--    ถือว่าเป็นค่าที่มีอยู่ → ชื่อ/ที่อยู่กลายเป็นช่องว่างแทนที่จะ fallback (เจอจริงตอนเทส 2026-08-25)
CREATE VIEW docs_entry_recipient AS
SELECT e.id AS entry_id,
  CASE WHEN e.external_payee_id IS NOT NULL THEN 'external' ELSE 'member' END AS recipient_kind,
  COALESCE(NULLIF(x.title,''), n.title)            AS title,
  COALESCE(NULLIF(x.first_name,''), n.first_name)  AS ngs_first_name,
  COALESCE(NULLIF(x.last_name,''),  n.last_name)   AS ngs_last_name,
  COALESCE(NULLIF(x.entity_name,''),
           NULLIF(TRIM(CONCAT(x.first_name,' ',x.last_name)),''),
           m.display_name)                         AS display_name,
  COALESCE(NULLIF(x.first_name,''), u.firstname)   AS firstname,
  COALESCE(NULLIF(x.last_name,''),  u.lastname)    AS lastname,
  COALESCE(NULLIF(x.id_number,''),  n.identification_number) AS identification_number,
  COALESCE(NULLIF(x.house_no,''),    n.home_house_number)    AS home_house_number,
  COALESCE(NULLIF(x.moo,''),         n.home_alley)           AS home_alley,
  COALESCE(NULLIF(x.road,''),        n.home_road)            AS home_road,
  COALESCE(NULLIF(x.subdistrict,''), n.home_district)        AS home_district,
  COALESCE(NULLIF(x.district,''),    n.home_amphure)         AS home_amphure,
  COALESCE(NULLIF(x.province,''),    n.home_province)        AS home_province,
  COALESCE(NULLIF(x.zip_code,''),    n.home_zip_code)        AS home_zip_code,
  COALESCE(NULLIF(x.phone,''),       n.mobile_number)        AS mobile_number,
  COALESCE(x.id_card_image, u.id_card_image)                 AS id_card_image,
  n.road AS road, m.member_id AS member_id, u.discord_id AS member_discord_id
FROM docs_activity_entries e
JOIN docs_projects p ON p.id = e.project_id
LEFT JOIN users u ON u.id = e.member_user_id
LEFT JOIN LATERAL (
  SELECT om.display_name, om.member_id
  FROM org_members om
  WHERE om.user_id = u.id AND om.org_id = p.org_id
  -- คนเดียวมีหลายแถว (แถวละ guild) · LIMIT 1 เฉยๆ = หยิบมั่ว ได้แถวที่ยังไม่ผูกเลขสมาชิก
  ORDER BY (om.member_id IS NOT NULL) DESC, om.joined_at DESC NULLS LAST
  LIMIT 1
) m ON true
LEFT JOIN cache_pple_member n ON n.source_id = m.member_id
LEFT JOIN docs_external_payees x ON x.id = e.external_payee_id;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-26 — docs: แก้ LATERAL หยิบแถว org_members มั่ว → ชื่อ/ที่อยู่หายทั้งใบ
--
-- อาการ: ใบสำคัญรับเงินของสมาชิกบางคนออกมาไม่มีชื่อ/ที่อยู่/เลขบัตร ทั้งที่ข้อมูล
--        อยู่ครบใน cache_pple_member (เจอกับ user 865 — ผูกเลขสมาชิก 111475 ไว้แล้ว)
--
-- ต้นตอ: คนเดียวมีได้หลายแถวใน org_members (แถวละ guild ใน org เดียวกัน — org นี้มี 3 guild)
--        LATERAL ที่ดึงข้อมูลใช้ `LIMIT 1` โดยไม่มี ORDER BY = หยิบแถวไหนก็ได้
--        ถ้าไปโดนแถวที่ member_id ยังเป็น NULL → join cache_pple_member ไม่ติด → ว่างทั้งใบ
--
-- แก้ 2 ชั้น:
--   1. view + คิวรีฝั่ง payer ใส่ ORDER BY (member_id IS NOT NULL) DESC ก่อน LIMIT 1
--   2. backfill ข้างล่างนี้ — เลขสมาชิกเป็นข้อเท็จจริงระดับ org (link-ngs เขียนทุกแถวใน org
--      อยู่แล้วตั้งแต่ 2026-07-21) แถวที่เหลื่อมกันคือของเก่าก่อนกฎนั้น · มี 3 คน
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE org_members om
   SET member_id = src.member_id
  FROM (
    SELECT user_id, org_id, MAX(member_id) AS member_id
      FROM org_members
     GROUP BY user_id, org_id
    HAVING COUNT(member_id) > 0 AND COUNT(member_id) < COUNT(*)
  ) src
 WHERE om.user_id = src.user_id
   AND om.org_id  = src.org_id
   AND om.member_id IS NULL;

COMMIT;

-- 2026-08-26 — ลิงก์เซ็นเอกสารไม่มีวันหมดอายุอีกต่อไป
-- เดิมหน้าสร้างใบตั้ง token_expires_at = +2 เดือนอัตโนมัติ พอเลยกำหนดผู้รับเปิดใบไม่ได้เลย
-- (410 ลิงก์หมดอายุ) และไม่มีปุ่มขอลิงก์ใหม่ให้เขาด้วย — ตัวกันการเข้าถึงจริงคือ login + ownership
-- โค้ดเลิกอ่าน/เลิกเขียน 2 คอลัมน์นี้แล้ว · ล้างค่าเก่าให้ไม่มีอะไรค้างเป็นระเบิดเวลา
-- คอลัมน์ยังไม่ DROP — เผื่อกลับคำ ค่อยลบทีหลังตอนแน่ใจ
UPDATE docs_activity_entries
   SET token_expires_at = NULL, payer_token_expires_at = NULL
 WHERE token_expires_at IS NOT NULL OR payer_token_expires_at IS NOT NULL;



-- ===========================================================================
-- 2026-08-26 — docs_entry_recipient: ที่อยู่/เลขบัตรใน override_data ต้องชนะทะเบียน
--
-- อาการ: description ค่าเดินทางนอกจังหวัดออกมาเป็น "ค่าเดินทางจาก ......... ไป-กลับ N กม."
-- เหตุ: DocEntryList สร้าง description จาก r.home_district/home_amphure/home_province
--       ซึ่งวิวนี้ดึงมาจาก cache_pple_member (ทะเบียนพรรค) หรือ docs_external_payees เท่านั้น
--       — ไม่เคยอ่าน override_data · คนที่ไม่ได้ผูกทะเบียนแล้วกรอกที่อยู่เองผ่านการถ่ายบัตร
--       ที่อยู่จะลง override_data อย่างเดียว วิวจึงมองไม่เห็น → ได้จุดไข่ปลา
--       (คนที่ผูกทะเบียนไว้ยังทำงานปกติ = "เคยทำงานได้" ที่ user เจอ)
-- แก้: ให้วิวคืน "ค่าที่ใช้จริง" — override ชนะก่อน แล้วค่อยคนนอก แล้วค่อยทะเบียน
--      ลำดับเดียวกับ buildData() ใน web/lib/generatePdf.js เป๊ะ เพื่อไม่ให้เว็บกับ PDF เห็นคนละค่า
-- ===========================================================================
CREATE OR REPLACE VIEW docs_entry_recipient AS
 SELECT e.id AS entry_id,
        CASE
            WHEN e.external_payee_id IS NOT NULL THEN 'external'::text
            ELSE 'member'::text
        END AS recipient_kind,
    COALESCE(NULLIF(e.override_data->>'title', ''), NULLIF(x.title::text, ''::text), n.title::text) AS title,
    COALESCE(NULLIF(x.first_name::text, ''::text), n.first_name::text) AS ngs_first_name,
    COALESCE(NULLIF(x.last_name::text, ''::text), n.last_name::text) AS ngs_last_name,
    COALESCE(NULLIF(x.entity_name::text, ''::text), NULLIF(TRIM(BOTH FROM concat(x.first_name, ' ', x.last_name)), ''::text), m.display_name::text) AS display_name,
    COALESCE(NULLIF(x.first_name::text, ''::text), u.firstname::text) AS firstname,
    COALESCE(NULLIF(x.last_name::text, ''::text), u.lastname::text) AS lastname,
    COALESCE(NULLIF(e.override_data->>'id_number', ''), NULLIF(x.id_number::text, ''::text), n.identification_number::text) AS identification_number,
    COALESCE(NULLIF(e.override_data->>'house_no', ''), NULLIF(x.house_no::text, ''::text), n.home_house_number::text) AS home_house_number,
    COALESCE(NULLIF(e.override_data->>'moo', ''), NULLIF(x.moo::text, ''::text), n.home_alley::text) AS home_alley,
    COALESCE(NULLIF(e.override_data->>'road', ''), NULLIF(x.road::text, ''::text), n.home_road::text) AS home_road,
    COALESCE(NULLIF(e.override_data->>'subdistrict', ''), NULLIF(x.subdistrict::text, ''::text), n.home_district::text) AS home_district,
    COALESCE(NULLIF(e.override_data->>'district', ''), NULLIF(x.district::text, ''::text), n.home_amphure::text) AS home_amphure,
    COALESCE(NULLIF(e.override_data->>'province_addr', ''), NULLIF(x.province::text, ''::text), n.home_province::text) AS home_province,
    COALESCE(NULLIF(x.zip_code::text, ''::text), n.home_zip_code::text) AS home_zip_code,
    COALESCE(NULLIF(e.override_data->>'phone', ''), NULLIF(x.phone::text, ''::text), n.mobile_number::text) AS mobile_number,
    COALESCE(x.id_card_image, u.id_card_image) AS id_card_image,
    n.road,
    m.member_id,
    u.discord_id AS member_discord_id
   FROM docs_activity_entries e
     JOIN docs_projects p ON p.id = e.project_id
     LEFT JOIN users u ON u.id = e.member_user_id
     LEFT JOIN LATERAL ( SELECT om.display_name,
            om.member_id
           FROM org_members om
          WHERE om.user_id = u.id AND om.org_id = p.org_id
          ORDER BY (om.member_id IS NOT NULL) DESC, om.joined_at DESC NULLS LAST
         LIMIT 1) m ON true
     LEFT JOIN cache_pple_member n ON n.source_id = m.member_id
     LEFT JOIN docs_external_payees x ON x.id = e.external_payee_id;


-- production ทำถึงตรงนี้


-- ═══ 2026-08-28 — created_via รับค่า 'backfill' (กระทู้เก่านำเข้าย้อนหลัง) ═══
-- ⭐ ทำไมต้องมีค่าที่ 3: `channel_id` บอกได้แค่ "มาจากดิสคอร์ดไหม" แต่แยกไม่ออกว่าเป็น
--    **งานปัจจุบัน** (ตะกร้าสื่อที่ทีมหย่อนวันนี้ · context menu "นำเข้าเป็นโพสต์") หรือ
--    **ของเก่าที่จบไปแล้ว** (scripts/data/backfillPostThreads.js กวาดกระทู้ย้อนหลังทีละ 500+ ใบ)
--    ถ้าไม่แยก ของเก่าจะท่วมทั้งฟีดหลักและแท็บ "จากดิสคอร์ด" (limit 200 → งานจริงตกขอบ)
--
-- ⛔ ห้ามแก้ปัญหานี้ด้วยการทำให้ของเก่าเป็น "โพสต์แล้ว" (แทรก post_social_history)
--    = ปั้นใบเสร็จปลอม (ไม่รู้ platform/posted_at/ลิงก์จริง) + ทำให้ postsRetention.js
--      ลบไฟล์รูปที่เพิ่งโหลดมาทิ้งทันที (เข้าเงื่อนไข "เผยแพร่เกิน 180 วัน")
-- ⛔ ห้ามแก้ด้วย archived_at เช่นกัน — kanban ซ่อนการ์ดที่ต้นทาง archived ทั้งตอนสร้าง
--    (web/db/kanban/links.js SOURCE_SQL.post) และตอนแสดง (statusSql.js visibleLinkSql)
ALTER TABLE post_episodes DROP CONSTRAINT IF EXISTS post_episodes_created_via_check;
ALTER TABLE post_episodes ADD CONSTRAINT post_episodes_created_via_check
  CHECK (created_via IN ('ai', 'manual', 'backfill'));
