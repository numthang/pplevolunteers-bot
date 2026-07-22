-- ⛔ ห้ามรัน — ตายแล้ว เก็บไว้เป็นประวัติเท่านั้น (ยกออกจาก migration.sql 2026-07-23)
--
-- บล็อกนี้เติมคอลัมน์ additive ให้ finance (org_id / owner_user_id / updated_by_user_id)
-- แล้ว backfill · แต่ `02-finance-org-scope.sql` **เปิดหัวไฟล์ด้วยการ DROP COLUMN IF EXISTS
-- ทั้งสามคอลัมน์นี้ทิ้ง** แล้วแปลง guild_id→org_id แบบ in-place แทน
--   → รันก่อน 02 = เสียเวลา UPDATE ทั้งตารางเปล่าๆ แล้วโดนลบทิ้ง
--   → รันหลัง 01 = **ERROR** เพราะอ้าง `organizations` และ `dc_members` ซึ่ง 01 rename ไปแล้ว
--      (organizations→orgs · dc_members→_dc_members)
-- สรุป: ไม่มีจังหวะไหนที่ควรรัน — ตัดออกจากลำดับ cutover ถาวร

-- 2026-07-16: Phase 2 EXPAND — finance ownership/tenant → user_id/org_id (additive · PPLE code ยังใช้ guild_id/owner_id เดิม)
-- person-ref (discord_id) → *_user_id (→dc_members.id, match ด้วย discord_id+guild_id) · tenant (guild_id ของ data) → org_id (→organizations.id ผ่าน dc_guilds)
-- ⚠️ finance_config คง guild_id (config ต่อ Discord server ไม่ยุบเป็น org) · discord_msg_id คง (artifact) · ยังไม่แตะ code = expand เฉยๆ
ALTER TABLE finance_accounts     ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id),
                                 ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES dc_members(id),
                                 ADD COLUMN IF NOT EXISTS updated_by_user_id INT REFERENCES dc_members(id);
ALTER TABLE finance_categories   ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id),
                                 ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES dc_members(id);
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id),
                                 ADD COLUMN IF NOT EXISTS updated_by_user_id INT REFERENCES dc_members(id);
ALTER TABLE finance_incoming_log ADD COLUMN IF NOT EXISTS org_id INT REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_org ON finance_transactions (org_id);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_org     ON finance_accounts (org_id);
CREATE INDEX IF NOT EXISTS idx_finance_categories_org   ON finance_categories (org_id);

-- backfill org_id (via dc_guilds) — data tables เท่านั้น (ไม่แตะ finance_config)
UPDATE finance_accounts a     SET org_id=g.org_id FROM dc_guilds g WHERE g.guild_id=a.guild_id AND a.org_id IS NULL;
UPDATE finance_categories a   SET org_id=g.org_id FROM dc_guilds g WHERE g.guild_id=a.guild_id AND a.org_id IS NULL;
UPDATE finance_transactions a SET org_id=g.org_id FROM dc_guilds g WHERE g.guild_id=a.guild_id AND a.org_id IS NULL;
-- backfill user_id (person-ref → dc_members row ของ discord_id+guild_id นั้น)
UPDATE finance_accounts a     SET owner_user_id=m.id      FROM dc_members m WHERE m.discord_id=a.owner_id   AND m.guild_id=a.guild_id AND a.owner_user_id IS NULL;
UPDATE finance_accounts a     SET updated_by_user_id=m.id FROM dc_members m WHERE m.discord_id=a.updated_by AND m.guild_id=a.guild_id AND a.updated_by_user_id IS NULL;
UPDATE finance_categories a   SET owner_user_id=m.id      FROM dc_members m WHERE m.discord_id=a.owner_id   AND m.guild_id=a.guild_id AND a.owner_user_id IS NULL;
UPDATE finance_transactions a SET updated_by_user_id=m.id FROM dc_members m WHERE m.discord_id=a.updated_by AND m.guild_id=a.guild_id AND a.updated_by_user_id IS NULL;
