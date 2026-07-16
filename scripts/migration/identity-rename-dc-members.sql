-- ═══════════════════════════════════════════════════════════════════════════
-- Identity repoint — RENAME dc_members → _dc_members  (forcing function)
-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔⛔ LOCALHOST / org-core ONLY — ห้ามรันบน prod (master) เด็ดขาด
--     dc_members บน prod = แกนของ PPLE ทั้งระบบ · rename = พังทั้ง bot+web
--
-- จุดประสงค์: ตั้งใจให้ทุกโค้ดที่ยังอ่าน dc_members "throw ทันที" (relation does not exist)
--   เพื่อไล่ repoint → users + org_members ให้ครบ ไม่มี straggler อ่านข้อมูลเก่าเงียบๆ
--
-- FK 4 ตัวจาก finance_* → dc_members(id) จะยกตามมาชี้ _dc_members เอง (ไม่พังระดับ DB)
--   ⚠️ finance owner_user_id/updated_by_user_id อ้าง dc_members.id (อาจ non-canonical ≠ users.id)
--      → repoint finance ต้อง remap เป็น canonical users.id แยกต่างหาก
--
-- ROLLBACK (บรรทัดเดียว):  ALTER TABLE _dc_members RENAME TO dc_members;
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE dc_members RENAME TO _dc_members;

\echo '=== renamed. เหลือ dc_members ไหม (ควร error/0) — _dc_members count: ==='
SELECT count(*) AS underscore_rows FROM _dc_members;
