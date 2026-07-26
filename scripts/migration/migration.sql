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
