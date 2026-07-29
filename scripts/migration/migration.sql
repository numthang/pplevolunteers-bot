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
-- 2026-07-29 — POSTS ก้อน 1: 7 ตารางของโมดูล posts (เครื่องมืองานสื่อ)
-- spec + เหตุผลรายข้อ: md/posts/POSTS.md §ผ่าน /grill
-- additive ล้วน (CREATE TABLE IF NOT EXISTS) — รันซ้ำได้ ไม่แตะตารางเดิม
-- ═══════════════════════════════════════════════════════════════════════════

-- ซีรีส์ = คอนเทนต์ 1 ชุดที่ซอยเป็นตอน · visibility เคาะตั้งแต่แรก ห้ามเติมทีหลัง
CREATE TABLE IF NOT EXISTS post_series (
  id                    bigserial    PRIMARY KEY,
  org_id                integer      NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_user_id         integer      NOT NULL REFERENCES users(id),
  visibility            varchar(10)  NOT NULL DEFAULT 'personal' CHECK (visibility IN ('personal','org')),
  title                 varchar(200) NOT NULL,
  summary               text,
  source_idea           text,        -- ไอเดียดิบที่โยนเข้ามา → กด "จัดโครงใหม่" ได้ไม่ต้องพิมพ์ซ้ำ
  created_via           varchar(10)  NOT NULL DEFAULT 'manual' CHECK (created_via IN ('ai','manual')),
  -- audit ตอนเปิดให้ทีมเห็น (personal → org ทางเดียว ย้อนไม่ได้ — grill ข้อ 1)
  visibility_changed_at timestamptz,
  visibility_changed_by integer      REFERENCES users(id),
  archived_at           timestamptz,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_series_org   ON post_series (org_id, visibility, archived_at);
CREATE INDEX IF NOT EXISTS idx_post_series_owner ON post_series (owner_user_id);

-- ตอน · status เก็บแค่ "สถานะงานเขียน" — scheduled/published เป็น derived จาก post_publish_jobs (grill ข้อ 10)
-- updated_at ใช้เป็น optimistic lock ของ autosave (grill ข้อ 14) — client ส่งค่าที่โหลดมา ไม่ตรง = 409
CREATE TABLE IF NOT EXISTS post_episodes (
  id               bigserial    PRIMARY KEY,
  series_id        bigint       NOT NULL REFERENCES post_series(id) ON DELETE CASCADE,
  seq              integer      NOT NULL,
  title            varchar(300),
  body             text,
  bodies           jsonb,       -- override รายแพลตฟอร์ม {"x":"...","fb":"..."} · ว่าง = ใช้ body
  format           varchar(10)  CHECK (format IS NULL OR format IN ('text','image','quote')),  -- hint เฉยๆ ไม่บังคับ
  status           varchar(10)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved')),
  approved_by      integer      REFERENCES users(id),
  approved_by_name varchar(100),  -- อนุมัติผ่านลิงก์ = ชื่อพิมพ์เอง ไม่ใช่ลายเซ็นผูกตัวตน
  approved_at      timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  -- ⚠️ สลับลำดับตอนต้อง 2 จังหวะ (update เป็นเลขลบก่อน) เพราะ unique นี้ไม่ deferrable
  CONSTRAINT uq_post_episode_seq UNIQUE (series_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_post_episodes_series ON post_episodes (series_id, seq);

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
