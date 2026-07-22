-- ============================================================================
-- cases-discord-guild-artifact.sql — 2026-07-21
-- แก้ของที่ cases-org-scope.sql ทำหาย (ต้องรันต่อกันทันที)
--
-- 🐛 ปัญหา: `cases.guild_id` เดิมทำ 2 หน้าที่ทับกัน
--    (1) scope ของ tenant        → ถูกต้องแล้วที่ยุบเป็น org_id
--    (2) **ชี้ว่า thread ของเคสนี้อยู่ forum ของ guild ไหน** → อันนี้หายไปด้วย
--    caseGate เขียนเตือนไว้เองว่า "guildId เจ้าของเคสจริง (ไม่ใช่ guild ที่ session
--    กำลัง browse) — ทุก write/config lookup ต่อจากนี้ต้องยึดตัวนี้" = กัน dangling
--    pointer · พอ org มีหลาย guild (org 1 มี 3) การเดาจาก session = ผิด guild ได้
--
-- ✅ วิธีแก้ตามหลักที่ใช้มาตลอด: **Discord artifact เก็บ guild แยกจาก scope**
--    (เหมือน finance_config / case_config / cache_pple_event ที่คง guild-based)
--    → เพิ่ม `discord_guild_id` เป็นคู่หูของ `discord_thread_id`
--    → NULL = เคสนี้ไม่มี Discord (org ที่ไม่ใช้ Discord ก็ NULL ทั้งคอลัมน์)
--
-- backfill: ค่าเดิมก่อนแปลง (บันทึกไว้ตอน query ก่อนรัน cases-org-scope.sql)
--    case 3 (70-69-2D8E) → 1340903354037178410 (อาสาประชาชน)
--    case 4 (70-69-F1E2) → 1111998833652678757 (ราชบุรี)
--    case 5 (70-69-2937) → 1111998833652678757 (ราชบุรี)  ← ตัวนี้มี thread จริง
--
-- ⚠️ prod cutover: รัน **ต่อจาก** cases-org-scope.sql ทันที · แต่ backfill ข้างล่าง
--    เป็นค่าของ localhost — **prod ต้องเปลี่ยนเป็น UPDATE จาก guild_id เดิมก่อนแปลง**
--    วิธีที่ปลอดภัยกว่าสำหรับ prod: เพิ่มคอลัมน์ + copy ค่าไว้ **ก่อน** rename
--    (ดูบล็อก PROD ข้างล่าง — ใช้แทน backfill ตายตัวนี้)
-- ============================================================================

BEGIN;

ALTER TABLE cases ADD COLUMN IF NOT EXISTS discord_guild_id VARCHAR(20);

COMMENT ON COLUMN cases.discord_guild_id IS
  'guild ที่ thread ของเคสนี้อยู่ (Discord artifact คู่กับ discord_thread_id) — ไม่ใช่ scope, scope ใช้ org_id';

-- backfill localhost (ค่าก่อนแปลง)
UPDATE cases SET discord_guild_id = '1340903354037178410' WHERE ref = '70-69-2D8E' AND discord_guild_id IS NULL;
UPDATE cases SET discord_guild_id = '1111998833652678757' WHERE ref IN ('70-69-F1E2','70-69-2937') AND discord_guild_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cases_discord_guild ON cases (discord_guild_id) WHERE discord_guild_id IS NOT NULL;

\echo '=== ทุกเคสที่มี thread ต้องรู้ guild ของตัวเอง (missing ต้องเป็น 0) ==='
SELECT count(*) AS threads_missing_guild
  FROM cases WHERE discord_thread_id IS NOT NULL AND discord_guild_id IS NULL;

SELECT id, ref, org_id, discord_guild_id, discord_thread_id FROM cases ORDER BY id;

COMMIT;

-- ============================================================================
-- 📋 บล็อก PROD — ใช้แทน backfill ตายตัวข้างบน (รัน "ก่อน" cases-org-scope.sql)
-- ----------------------------------------------------------------------------
-- ALTER TABLE cases ADD COLUMN IF NOT EXISTS discord_guild_id VARCHAR(20);
-- UPDATE cases SET discord_guild_id = guild_id WHERE discord_guild_id IS NULL;
-- -- ...แล้วค่อยรัน cases-org-scope.sql (ที่แปลง guild_id → org_id)
-- ============================================================================
