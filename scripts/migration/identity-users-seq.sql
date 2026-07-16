-- ═══════════════════════════════════════════════════════════════════════════
-- Identity — เติม sequence default ให้ users.id (create-on-login)
-- ═══════════════════════════════════════════════════════════════════════════
-- users.id เดิม = canonical dc_members.id (set ตายตัวตอน migrate, ไม่มี default)
-- → login door ใหม่ (discord/email ที่ยังไม่มี users row) insert ไม่ได้
-- เติม sequence เริ่มเหนือ max(id) เดิม → INSERT users ไม่ต้องระบุ id
-- idempotent (IF NOT EXISTS + setval ทุกครั้งปลอดภัย)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS users_id_seq OWNED BY users.id;
SELECT setval('users_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM users), 1));
ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq');

\echo '=== users.id default (ควรเห็น nextval) ==='
SELECT column_default FROM information_schema.columns
 WHERE table_name = 'users' AND column_name = 'id';
