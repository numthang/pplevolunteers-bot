-- ⛔ ห้ามรัน — 01-identity-refactor.sql ทำให้ครบแล้วทุกบรรทัด (ยกออกจาก migration.sql 2026-07-23)
--
-- Phase 0 (email/DROP NOT NULL/uq_dc_members_email) · org_login_tokens · web_roles ·
-- rename organizations→orgs · rename dc_user_identities→user_identities
-- ทั้งหมดนี้อยู่ใน 01 แบบ idempotent อยู่แล้ว (ยืนยันตอนซ้อม 2026-07-23:
-- 01 ขึ้น NOTICE "already exists, skipping" ทุกอันเมื่อรันบน DB ที่มีของพวกนี้แล้ว)
-- เก็บไว้เป็นประวัติว่า dev เคยรันอะไรไปบ้างเท่านั้น

-- 2026-07-15: org core — identity/tenant ชั้นใหม่ (email-first) · spec เต็ม: md/civicflow/CIVICFLOW.md
-- เปลี่ยนแผน (จากตาราง `members` แยก → evolve dc_members เป็น universal user table):
--   identity = dc_members.id · tenant = org_id · Discord = adapter เสริม (optional)
-- role: reuse permissions.js (PERMISSIONS + CAPABILITIES) · org_members.role = ค่าใน PERMISSIONS (v1 hardcode)
-- Discord guild ↔ org: ใช้ dc_guilds.org_id ที่มีอยู่แล้ว (migration 2026-07-08) — org ไม่มี Discord = ไม่มีแถวชี้มา

-- ── ลบตาราง members ที่สร้างไว้รอบก่อน (2026-07-15 ต้นวัน) — ซ้ำซ้อนกับ dc_members ──
DROP TABLE IF EXISTS members;

-- ── Phase 0: เปิดทาง email identity บน dc_members (additive, ปลอดภัยต่อ PPLE) ──
-- email user / shell user (invite) = แถวที่ไม่มี discord/guild/username → ปลด NOT NULL ทั้ง 3
-- คง DEFAULT '' ของ guild_id ไว้ (PPLE insert เดิมไม่กระทบ) · โค้ด email-insert จะใส่ guild_id=NULL เอง
ALTER TABLE dc_members ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE dc_members ALTER COLUMN discord_id DROP NOT NULL;
ALTER TABLE dc_members ALTER COLUMN username   DROP NOT NULL;
ALTER TABLE dc_members ALTER COLUMN guild_id    DROP NOT NULL;
-- identity ยึด email เป็น global unique (partial — PPLE row email=NULL ไม่โดนคุม, กัน invite/login สร้าง dup)
CREATE UNIQUE INDEX IF NOT EXISTS uq_dc_members_email ON dc_members (email) WHERE email IS NOT NULL;

-- ── Phase 1: membership org_members — ⚠️ ย้ายไป scripts/migration/identity-split-expand.sql (2026-07-16) ──
-- identity-split DROP+CREATE org_members ใหม่ ด้วย schema เต็ม (id หน้าสุด, user_id→users, guild_id, roles, web_roles,
-- profile ทั้งหมด) → block CREATE เดิม (org_id,user_id,role,status) ตัดทิ้ง เพราะซ้ำซ้อน/โดน drop อยู่ดี

-- ── Phase 1: magic-link login token (email-keyed, pre-identity) ──
-- dc_user_config ใช้ไม่ได้ (PK = discord_id,key ต้องมี discord_id) → ตารางเล็กแยก · TTL เช็คใน query (15 นาที)
CREATE TABLE IF NOT EXISTS org_login_tokens (
  token      VARCHAR(64)  PRIMARY KEY,
  email      VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2026-07-16: web_roles — role ที่ grant ผ่านเว็บ (สำหรับคน email guildless + web-only grant)
-- เก็บ "key" จาก org_roles (เช่น 'treasurer,editor') ไม่ใช่ชื่อ Discord → resolveAccess ใช้เป็น permission ตรงๆ ไม่ต้องแปลผ่าน catalog
-- คน Discord = ยศไปเขียน Discord (dc_members.roles) · web_roles ไว้คน email เป็นหลัก · resolveAccess union 2 แหล่ง
ALTER TABLE dc_members ADD COLUMN IF NOT EXISTS web_roles TEXT;

-- 2026-07-16: rename organizations → orgs (เข้าชุด org_* family: org_members/org_roles/org_login_tokens) · FK auto-follow
ALTER TABLE IF EXISTS organizations RENAME TO orgs;

-- 2026-07-16: rename dc_user_identities → user_identities (identity ข้าม provider = user-level ไม่ใช่ Discord-specific) · key ด้วย user_id repoint ทีหลัง
ALTER TABLE IF EXISTS dc_user_identities RENAME TO user_identities;
