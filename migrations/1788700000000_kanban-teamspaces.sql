-- Up Migration
-- ═══════════════════════════════════════════════════════════════════════════
-- KANBAN — เพิ่มชั้น teamspace:  org > teamspace > boards > cards   (เคาะ 2026-09-07)
--
-- ทำไม: กระดานเดียวที่มีอยู่คืองานของ "ทีมราชบุรี" ทั้งกอง (การ์ดโพสต์ 914 ใบมาจากเซิร์ฟ
-- ประชาชนราชบุรี · เคส 175/176 ใบเป็นจังหวัดราชบุรี) แต่ org มีสมาชิก 6,774 คน — พอทีมที่ 2
-- ขอใช้จริง กองเดียวกันนี้ใช้ร่วมกันไม่ได้
--
-- ⛔ รอบนี้ **ไม่มีด่านสิทธิ์** — ทุกคนใน org เห็นทุก teamspace/board/card เหมือนเดิมเป๊ะ
--    ที่เปลี่ยนคือ "เปิดมาเจออะไรก่อน" ไม่ใช่ "เห็นอะไรได้" (user สั่ง: ค่อยจำกัดสิทธิ์ทีหลัง)
--    ตะเข็บวันที่จะกันจริงอยู่ที่ web/db/kanban/scopeSql.js — ที่เดียว
-- ⚠️ kanban_teamspaces ≠ หน้า /team (นั่นคือรายชื่อสมาชิกในเซิร์ฟดิสคอร์ด คนละเรื่องกัน)
-- ⚠️ FK วนกัน (boards.teamspace_id ↔ teamspaces.default_board_id) → ทั้งคู่ต้อง nullable
--    ลำดับ backfill จึงต้องเป็น INSERT teamspace → UPDATE boards → UPDATE default_board_id
-- ⚠️ teamspace_id ยังไม่ SET NOT NULL รอบนี้ — รันหลัง deploy + ตรวจว่าไม่มีแถว NULL แล้ว
--    (ท่าเดียวกับ kanban_field_defs.board_id ตอนก้อน 3) SQL อยู่ท้ายไฟล์นี้ในคอมเมนต์
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kanban_teamspaces (
  id            BIGSERIAL PRIMARY KEY,
  org_id        INTEGER      NOT NULL REFERENCES orgs(id),
  name          VARCHAR(100) NOT NULL,
  detail        TEXT,
  scope_node_id INTEGER      REFERENCES org_scope_nodes(id),
  guild_id      VARCHAR(20),
  sort_order    INTEGER      NOT NULL DEFAULT 0,
  archived_at   TIMESTAMPTZ,
  created_by    INTEGER      REFERENCES users(id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE kanban_teamspaces IS
  'ชั้นกลางของ KANBAN: org > teamspace > boards > cards (2026-09-07) — ไม่เกี่ยวกับหน้า /team';
COMMENT ON COLUMN kanban_teamspaces.scope_node_id IS
  'ผูกกับหน่วยงานใน org_scope_nodes (ทางเข้าสมาชิกแบบที่ 2 · ไม่บังคับ) — teamspace ที่ตั้งชื่อเองเป็น NULL';
COMMENT ON COLUMN kanban_teamspaces.guild_id IS
  'ป้าย + ให้บอทรู้ว่าเซิร์ฟนี้ลงงานที่ teamspace ไหน — guild_id เป็นป้าย ไม่ใช่ชั้นข้อมูล';

CREATE INDEX IF NOT EXISTS idx_kanban_teamspaces_org ON kanban_teamspaces (org_id, sort_order, id);

ALTER TABLE kanban_boards     ADD COLUMN IF NOT EXISTS teamspace_id     BIGINT REFERENCES kanban_teamspaces(id);
ALTER TABLE kanban_teamspaces ADD COLUMN IF NOT EXISTS default_board_id BIGINT REFERENCES kanban_boards(id);

COMMENT ON COLUMN kanban_boards.teamspace_id IS
  'teamspace ที่บอร์ดนี้สังกัด — nullable เพราะ FK วนกับ kanban_teamspaces.default_board_id';
COMMENT ON COLUMN kanban_teamspaces.default_board_id IS
  'บอร์ดตั้งต้นของ teamspace นี้ — บอทลงการ์ดใบนี้เมื่อสร้างจากเซิร์ฟที่ผูกกับ teamspace';

CREATE INDEX IF NOT EXISTS idx_kanban_boards_teamspace ON kanban_boards (teamspace_id);

-- ── backfill ──────────────────────────────────────────────────────────────
-- org 1 (อาสาประชาชน) = "ทีมราชบุรี" ผูก scope node ราชบุรี + เซิร์ฟประชาชนราชบุรี
-- org อื่นที่มีบอร์ดอยู่แล้ว = "ทีมหลัก" เปล่าๆ
INSERT INTO kanban_teamspaces (org_id, name, scope_node_id, guild_id, sort_order, created_by)
SELECT b.org_id,
       CASE WHEN b.org_id = 1 THEN 'ทีมราชบุรี' ELSE 'ทีมหลัก' END,
       (SELECT n.id FROM org_scope_nodes n
         WHERE n.org_id = b.org_id AND n.key = 'ราชบุรี' AND b.org_id = 1 LIMIT 1),
       CASE WHEN b.org_id = 1 THEN '1111998833652678757' END,
       0,
       MIN(b.created_by)
  FROM kanban_boards b
 WHERE NOT EXISTS (SELECT 1 FROM kanban_teamspaces t WHERE t.org_id = b.org_id)
 GROUP BY b.org_id;

UPDATE kanban_boards b
   SET teamspace_id = t.id
  FROM kanban_teamspaces t
 WHERE t.org_id = b.org_id
   AND b.teamspace_id IS NULL;

-- บอร์ดตั้งต้น = ใบแรกตามลำดับที่แสดง (ลำดับเดียวกับ ensureDefaultBoard ฝั่งเว็บ)
UPDATE kanban_teamspaces t
   SET default_board_id = (
        SELECT b.id FROM kanban_boards b
         WHERE b.teamspace_id = t.id AND b.archived_at IS NULL
         ORDER BY b.sort_order, b.id LIMIT 1)
 WHERE t.default_board_id IS NULL;

-- ⚠️ ตรวจหลัง deploy ("Applied:" ไม่ได้แปลว่าข้อมูลเปลี่ยนจริง):
--     SELECT count(*) FROM kanban_boards WHERE teamspace_id IS NULL;   -- ต้อง = 0
--   ได้ 0 แล้วค่อยรันในรอบ migration ถัดไป:
--     ALTER TABLE kanban_boards ALTER COLUMN teamspace_id SET NOT NULL;

-- Down Migration
ALTER TABLE kanban_boards DROP COLUMN IF EXISTS teamspace_id;
DROP TABLE IF EXISTS kanban_teamspaces;
