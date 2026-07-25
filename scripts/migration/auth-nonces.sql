-- auth_nonces — nonce/challenge store keyed by user_id (แทนที่การยัดใน dc_user_config ที่ PK=discord_id)
-- ใช้กับ passkey (register challenge, auth challenge, login nonce) · รองรับ email-only user (ไม่มี discord_id)
-- purpose: 'passkey_reg_challenge' | 'passkey_auth_challenge' | 'passkey'
-- payload: challenge string (JSONB) สำหรับ *_challenge · NULL สำหรับ login nonce
-- user_id nullable: auth challenge เกิดก่อน login (ยังไม่รู้ว่าใคร)
CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce      TEXT PRIMARY KEY,
  user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_user_purpose ON auth_nonces (user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_created ON auth_nonces (created_at);
