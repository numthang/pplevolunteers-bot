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

-- production ทำถึงตรงนี้ 


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
