-- Up Migration
-- ไฟล์แนบของการ์ด KANBAN — รูปจากกระทู้ดิสฯ (backfill) + รูปที่คนลากใส่เอง
--
-- ทำไมเป็นตารางแยก ไม่ใช่ custom field ชนิด upload (เคาะ 2026-09-04):
--   `kanban_card_field_values` เป็น 1 แถวต่อ (การ์ด, field) คอลัมน์ตายตัว → เก็บหลายรูปต้องยัด jsonb
--   ซึ่งทำให้ **กันรูปซ้ำตอน import รันซ้ำไม่ได้** · งาน backfill กระทู้ต้องรันซ้ำแน่นอน
--   (คัดเพิ่มทีหลังเรื่อยๆ) → dedupe ด้วย discord_attachment_id UNIQUE คือเหตุผลหลักของตารางนี้
--
-- ⭐ field_id เผื่อ custom field ชนิด upload ในอนาคต — **จงใจใส่ตั้งแต่วันแรก อย่าลบทิ้ง**
--   NULL      = ไฟล์แนบประจำการ์ด (ทุกใบมีได้ · ที่ import ใช้)
--   มีค่า     = ไฟล์ของช่อง upload ตัวนั้น (วันที่เพิ่มชนิด 'file' เข้า FIELD_TYPES ให้ชนิดนี้
--               อ่านจากตารางนี้แทน ไม่ต้องเขียนลง kanban_card_field_values และไม่ต้อง migrate ของเก่า)
--   ⚠️ วันนั้นต้องแก้ตัวนับ "field นี้มีข้อมูลกี่การ์ด" ใน web/db/kanban/fields.js ให้ชนิด file
--      มานับจากตารางนี้ ไม่งั้นระบบจะบอกว่า "ช่องว่าง ลบได้" ทั้งที่มีรูปอยู่
--
-- ⛔ ห้ามเก็บ URL ของ Discord ลง file_path — CDN URL มี ?ex=&is=&hm= หมดอายุใน 24 ชม.
--    ต้องโหลด bytes มาเก็บดิสก์เอง (บทเรียนเดียวกับ web/lib/caseAttachmentSync.js)
--
-- คู่กับโค้ด: web/lib/kanbanUploads.js · web/db/kanban/attachments.js
--   · web/app/api/kanban/cards/[id]/attachments/**

CREATE TABLE IF NOT EXISTS kanban_card_attachments (
  id                    SERIAL PRIMARY KEY,
  card_id               BIGINT      NOT NULL REFERENCES kanban_cards(id)      ON DELETE CASCADE,
  org_id                INTEGER     NOT NULL REFERENCES orgs(id)              ON DELETE CASCADE,
  field_id              BIGINT          NULL REFERENCES kanban_field_defs(id) ON DELETE CASCADE,
  file_path             VARCHAR(255) NOT NULL,
  original_name         VARCHAR(255),
  mime                  VARCHAR(100),
  discord_attachment_id VARCHAR(30),
  discord_message_id    VARCHAR(30),
  sort_order            INTEGER     NOT NULL DEFAULT 0,
  created_by            INTEGER          NULL REFERENCES users(id)            ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- กันรูปเดิมเข้าซ้ำตอน import รันรอบสอง (เหตุผลหลักของทั้งตาราง — ห้ามถอด)
CREATE UNIQUE INDEX IF NOT EXISTS uq_kanban_card_attachments_discord
  ON kanban_card_attachments (discord_attachment_id)
  WHERE discord_attachment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kanban_card_attachments_card
  ON kanban_card_attachments (card_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_kanban_card_attachments_field
  ON kanban_card_attachments (field_id)
  WHERE field_id IS NOT NULL;

COMMENT ON TABLE kanban_card_attachments IS
  'ไฟล์แนบของการ์ด KANBAN — bytes อยู่ใน uploads/kanban/<card_id>/ เสิร์ฟผ่าน API ที่เช็คสิทธิ์เท่านั้น';
COMMENT ON COLUMN kanban_card_attachments.field_id IS
  'NULL = ไฟล์แนบประจำการ์ด · มีค่า = ของ custom field ชนิด upload (ยังไม่มีชนิดนี้ — คอลัมน์นี้จงใจรอไว้ ห้ามลบ)';
COMMENT ON COLUMN kanban_card_attachments.discord_attachment_id IS
  'id ไฟล์แนบฝั่ง Discord — UNIQUE partial index กัน import ซ้ำ · NULL สำหรับไฟล์ที่คนอัปเอง';

-- Down Migration
DROP TABLE IF EXISTS kanban_card_attachments;
