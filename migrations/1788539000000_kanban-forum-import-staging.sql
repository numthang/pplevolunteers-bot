-- Up Migration
-- ตารางพักสำหรับคัดกระทู้ดิสฯ เข้า KANBAN (กระทู้คณะทำงาน / อำเภอ / สมาชิกพรรค)
--
-- ทำไมต้องมีตารางพัก ไม่อ่าน dc_forum_posts สดๆ:
--   1) ผล AI (สรุป + เดาสายงาน/พื้นที่/ผู้รับผิดชอบ) ต้องแคช — ไม่งั้นรีเฟรชหน้าทีเสียเงินที
--   2) ตัวที่กด "ไม่เอา" ต้องไม่กลับมาให้คัดซ้ำทุกรอบ (ปัญหาหลักของ user: noise เยอะ)
--   3) ค่าที่คนแก้ก่อนกดนำเข้า (ชื่อ/สายงาน/พื้นที่/ผู้รับผิดชอบ) ต้องอยู่ข้ามการรีเฟรช
--
-- ⛔ ไม่เก็บรูปตอนเตรียมข้อมูล — 256 กระทู้ × 4 รูปเป็นหลาย GB ทั้งที่ส่วนใหญ่จะถูกปัดทิ้ง
--    หน้าคัดดูรูปผ่าน proxy สดๆ · โหลดเก็บจริงตอนกด "นำเข้า" เท่านั้น (ลง kanban_card_attachments)
--
-- ai_* = ข้อเสนอของ AI (ยังไม่ใช่ค่าจริง) · pick_* = ค่าที่คนเคาะแล้ว (NULL = ยังไม่แตะ ใช้ตาม ai_)
--   ⚠️ แยก 2 ชุดโดยตั้งใจ: รู้ได้ว่าคนแก้อะไรบ้าง และรัน AI ใหม่ทับได้โดยไม่ลบสิ่งที่คนเคาะไปแล้ว

CREATE TABLE IF NOT EXISTS kanban_forum_import (
  id               SERIAL PRIMARY KEY,
  org_id           INTEGER     NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  guild_id         VARCHAR(20) NOT NULL,
  channel_id       VARCHAR(20) NOT NULL,
  thread_id        VARCHAR(20) NOT NULL UNIQUE,

  title            VARCHAR(255) NOT NULL,
  url              VARCHAR(255) NOT NULL,
  thread_created_at TIMESTAMPTZ NOT NULL,          -- วันตั้งกระทู้ = วันเริ่ม **และ** วันเสร็จของการ์ด
  author_discord_id VARCHAR(20),
  author_user_id   INTEGER          NULL REFERENCES users(id) ON DELETE SET NULL,

  first_message    TEXT,                            -- ข้อความเปิดกระทู้ (ดิบ)
  message_count    INTEGER     NOT NULL DEFAULT 0,
  image_count      INTEGER     NOT NULL DEFAULT 0,  -- จำนวนรูปในข้อความเปิด (ไว้โชว์ป้ายในหน้าคัด)
  participants     JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- [{discord_id, user_id, name, msgs}]

  ai_summary       TEXT,
  ai_is_project    BOOLEAN,                         -- true = โครงการงาน · false = กระทู้พูดคุย
  ai_reason        VARCHAR(500),
  ai_workstreams   JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- option id ของ field "สายงาน"
  ai_areas         JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- option id ของ field "พื้นที่"
  ai_assignee_user_id INTEGER       NULL REFERENCES users(id) ON DELETE SET NULL,
  ai_model         VARCHAR(50),
  ai_at            TIMESTAMPTZ,

  pick_title       VARCHAR(255),
  pick_detail      TEXT,
  pick_workstreams JSONB,
  pick_areas       JSONB,
  pick_assignee_user_id INTEGER  NULL REFERENCES users(id) ON DELETE SET NULL,

  status           VARCHAR(12) NOT NULL DEFAULT 'pending',   -- pending | imported | skipped
  card_id          BIGINT           NULL REFERENCES kanban_cards(id) ON DELETE SET NULL,
  dup_card_id      BIGINT           NULL REFERENCES kanban_cards(id) ON DELETE SET NULL,  -- การ์ดที่ชื่อใกล้เคียง (ธง "น่าจะซ้ำ")
  dup_score        NUMERIC(4,3),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE kanban_forum_import
  DROP CONSTRAINT IF EXISTS kanban_forum_import_status_chk;
ALTER TABLE kanban_forum_import
  ADD CONSTRAINT kanban_forum_import_status_chk CHECK (status IN ('pending', 'imported', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_kanban_forum_import_pick
  ON kanban_forum_import (org_id, status, channel_id, thread_created_at DESC);

COMMENT ON TABLE kanban_forum_import IS
  'ตารางพัก: กระทู้ดิสฯ ที่รอคัดเข้า KANBAN — ai_* = ข้อเสนอ · pick_* = ค่าที่คนเคาะ (NULL = ใช้ตาม ai_)';

-- Down Migration
DROP TABLE IF EXISTS kanban_forum_import;
