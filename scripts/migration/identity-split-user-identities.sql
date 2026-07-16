-- ═══════════════════════════════════════════════════════════════════════════
-- Identity split #0 — user_identities: key on user_id + discord = provider row
-- ═══════════════════════════════════════════════════════════════════════════
-- ก่อนหน้านี้ user_identities ผูก discord_id (NOT NULL) → email-only user ผูก identity ไม่ได้
-- และ Discord ถูกฝังเป็น users.discord_id column ไม่ใช่ provider row → auth ยัง anchor discordId
--
-- migration นี้ทำให้ user_identities เป็น "ทุก login door → users.id":
--   1) เพิ่ม user_id → users(id)  · 2) discord_id nullable (email-only ผูกได้)
--   3) backfill user_id ให้ 3 rows เดิม (line/google/passkey)
--   4) สร้าง provider='discord' row ให้ users ทุกคนที่มี discord_id (Discord กลายเป็น provider ธรรมดา)
--   5) rename PK/seq/constraint dc_user_identities_* → user_identities_* (สะสางชื่อค้างจาก rename table)
--
-- idempotent: rerun ได้ (เผื่อ identity-split-expand.sql rerun แล้ว CASCADE ทิ้ง FK)
-- ⚠️ additive: discord_id column ยังอยู่ (authOptions/userIdentities.js เดิมยังอ่าน) — drop ตอน contract
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) เพิ่ม user_id + 2) discord_id nullable ------------------------------------
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS user_id INT;
ALTER TABLE user_identities ALTER COLUMN discord_id DROP NOT NULL;

-- 3) backfill user_id ให้ rows เดิม (map discord_id → users.id, 0 orphan ยืนยันแล้ว) --
UPDATE user_identities ui
   SET user_id = u.id
  FROM users u
 WHERE u.discord_id = ui.discord_id
   AND ui.user_id IS NULL;

-- 4) Discord = provider row (provider_id = snowflake) ให้ users ที่มี discord ทุกคน --
--    unique(provider, provider_id) กันซ้ำ → rerun ปลอดภัย
INSERT INTO user_identities (user_id, discord_id, provider, provider_id)
SELECT u.id, u.discord_id, 'discord', u.discord_id
  FROM users u
 WHERE u.discord_id IS NOT NULL
ON CONFLICT (provider, provider_id) DO NOTHING;

-- FK + index (idempotent ผ่าน DO block / IF NOT EXISTS) -----------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_identities_user_id_fkey'
       AND conrelid = 'user_identities'::regclass
  ) THEN
    ALTER TABLE user_identities
      ADD CONSTRAINT user_identities_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities (user_id);

-- ตอนนี้ทุกแถวควรมี user_id (0 orphan) → บังคับ NOT NULL
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM user_identities WHERE user_id IS NULL;
  IF n = 0 THEN
    ALTER TABLE user_identities ALTER COLUMN user_id SET NOT NULL;
  ELSE
    RAISE NOTICE '⚠️  % rows ยังไม่มี user_id — ข้าม SET NOT NULL (ตรวจ orphan)', n;
  END IF;
END $$;

-- 5) สะสางชื่อ constraint/seq ที่ค้างจาก rename table (cosmetic, ปลอดภัย) -------
DO $$
BEGIN
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

-- verify ----------------------------------------------------------------------
\echo '=== user_identities per provider (หลัง migrate) ==='
SELECT provider, count(*) FROM user_identities GROUP BY provider ORDER BY 2 DESC;
\echo '=== orphan (user_id NULL) ควรเป็น 0 ==='
SELECT count(*) AS orphan_user_id FROM user_identities WHERE user_id IS NULL;
\echo '=== discord rows == users ที่มี discord_id ไหม ==='
SELECT (SELECT count(*) FROM user_identities WHERE provider='discord') AS discord_rows,
       (SELECT count(*) FROM users WHERE discord_id IS NOT NULL)        AS users_with_discord;
