-- pending-2026-08-19.sql — DDL ที่ prod ยังไม่ได้รัน (ตัดมาจาก migration.sql หลัง marker)
--
-- ⛔ ต้อง TRUNCATE kanban_cards ก่อนรันไฟล์นี้ ไม่งั้นพัง 1 บรรทัด:
--    ALTER TABLE kanban_card_checklist ALTER COLUMN field_id SET NOT NULL
--    (field_id เพิ่งถูกเพิ่ม → แถวเช็คลิสต์เดิมมีค่าเป็น NULL หมด)
--    user เคาะแล้วว่าการ์ดบน prod ทิ้งได้ (เป็นก๊อปจาก local ก่อนย้ายเข้า custom field)
--
-- รัน:
--   sudo -u www psql -d pple_volunteers -v ON_ERROR_STOP=1 -f scripts/migration/pending-2026-08-19.sql
--
-- เสร็จแล้วเลื่อน marker ใน migration.sql ลงมาท้ายไฟล์ แล้ว commit

BEGIN;

-- 2026-08-18 · kanban: ลิงก์ต้นทางดิสฯ — บอทเคยทิ้ง msg.id ไปเฉยๆ ตอนสร้างการ์ดจาก "📌 สร้างเป็นการบ้าน"
-- บอท+importer เขียนเท่านั้น (ไม่ใช่ custom field ที่คนแก้ได้ — ดู md/kanban/CUSTOM-FIELDS.md §เส้นแบ่ง)
-- pattern เดียวกับ post_episode_media.source_url/source_message_id
ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS source_url        text;
ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS source_message_id varchar(20);


-- 2026-08-18 · kanban ขั้น 2: แกน custom field (5 ชนิดสเกลาร์)
-- ดีไซน์: md/kanban/CUSTOM-FIELDS.md · แผนเต็ม ~/.claude/plans/reactive-churning-falcon.md
-- type_options เก็บไว้เผื่ออนาคต (ลอก AppFlowy design) — รอบนี้ยังไม่มี config อะไรใช้จริง เก็บ '{}' เฉยๆ
CREATE TABLE IF NOT EXISTS kanban_field_defs (
  id          BIGSERIAL PRIMARY KEY,
  org_id      INTEGER      NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  board_id    BIGINT,                    -- NULL = ใช้ทุกกระดาน (ยังไม่มีกระดานจริง — ก้อน 3 ค่อยเปิดให้เลือก)
  key         VARCHAR(60)  NOT NULL,     -- ชื่อในโค้ด — ห้ามเปลี่ยนหลังสร้าง (label เปลี่ยนได้)
  label       VARCHAR(100) NOT NULL,
  help_text   TEXT,
  type        VARCHAR(20)  NOT NULL,     -- ก้อน 3 ค่อยเพิ่ม 'select'/'multi_select' เข้า CHECK นี้
  type_options jsonb       NOT NULL DEFAULT '{}'::jsonb,
  sort_order  INT          NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT kanban_field_defs_type_check CHECK (type IN ('text','number','url','date','checkbox'))
);

-- COALESCE(board_id, 0) กัน NULL≠NULL ของ unique index (แนวเดียวกับ uq_kanban_labels_name)
CREATE UNIQUE INDEX IF NOT EXISTS uq_kanban_field_defs_key
    ON kanban_field_defs (org_id, COALESCE(board_id, 0), key);
CREATE INDEX IF NOT EXISTS idx_kanban_field_defs_org
    ON kanban_field_defs (org_id, sort_order) WHERE archived_at IS NULL;

-- คอลัมน์แยกตามชนิด ไม่ใช่ jsonb ก้อนเดียว — ต้อง WHERE/SUM ด้วย SQL จริงได้ (ต่างจาก AppFlowy ที่คำนวณในเครื่องบน CRDT)
CREATE TABLE IF NOT EXISTS kanban_card_field_values (
  card_id    BIGINT NOT NULL REFERENCES kanban_cards(id)      ON DELETE CASCADE,
  field_id   BIGINT NOT NULL REFERENCES kanban_field_defs(id) ON DELETE CASCADE,
  value_text TEXT,
  value_num  NUMERIC(18,4),
  value_date DATE,
  value_bool BOOLEAN,
  PRIMARY KEY (card_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_kanban_card_field_values_field ON kanban_card_field_values (field_id);


-- 2026-08-18 (รอบเย็น) · kanban: select/multi_select + checklist เป็น custom field type
-- กลับคำรอบที่ 3 ของโมดูลนี้ (ดู md/kanban/CUSTOM-FIELDS.md §กลับคำ):
--   1) "งานย่อย" เดิมเคาะไว้เป็นคอลัมน์จริง (เส้นแบ่งตอนต้นแผน) → ตอนนี้เป็น custom field type แทน
--      ไม่มีข้อมูลจริงใน kanban_card_checklist เลย (โมดูลยังไม่เคย deploy) — replace ได้เต็มๆ ไม่ต้อง migrate
--   2) ตัดเรื่อง admin gate ทั้งชุดของ custom field (fields+options+checklist) — user เคาะ "ไม่ต้องมี field
--      manager ให้ยุ่งยาก" ทุกอย่าง manage ได้จากในการ์ดที่กำลังแก้เลย (เหมือน canEditCard) ไม่ใช่หน้าแอดมินแยก
ALTER TABLE kanban_field_defs DROP CONSTRAINT IF EXISTS kanban_field_defs_type_check;
ALTER TABLE kanban_field_defs ADD CONSTRAINT kanban_field_defs_type_check
  CHECK (type IN ('text','number','url','date','checkbox','select','multi_select','checklist'));

-- ตัวเลือกของ select/multi_select ผูกกับ field เดียว (ต่างจาก kanban_labels ที่เป็นคำศัพท์กลางทั้ง org)
-- ⛔ ห้ามลบถาวร — archived_at เท่านั้น (บทเรียนเดียวกับป้าย: ตัวเลือกที่ติดค่าการ์ดอยู่ห้ามหายเงียบ)
CREATE TABLE IF NOT EXISTS kanban_field_options (
  id          BIGSERIAL PRIMARY KEY,
  field_id    BIGINT       NOT NULL REFERENCES kanban_field_defs(id) ON DELETE CASCADE,
  name        VARCHAR(60)  NOT NULL,
  color       VARCHAR(20),              -- NULL = สีอัตโนมัติจากชื่อ (แนวเดียวกับ kanban_labels.color)
  sort_order  INT          NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kanban_field_options_name ON kanban_field_options (field_id, name);
CREATE INDEX IF NOT EXISTS idx_kanban_field_options_field
    ON kanban_field_options (field_id, sort_order) WHERE archived_at IS NULL;

-- select ใช้ array ยาว ≤1 · multi_select ยาวเท่าไหร่ก็ได้ — คอลัมน์เดียวพอ ไม่ต้องแยกตามชนิด
ALTER TABLE kanban_card_field_values ADD COLUMN IF NOT EXISTS value_options BIGINT[];

-- checklist ย้ายจาก "1 การ์ด 1 เช็คลิสต์ตายตัว" → ผูกกับ field แทน (1 การ์ดมีได้หลายเช็คลิสต์ ถ้า org สร้างหลาย field)
-- 0 แถวตอนนี้ (ยังไม่เคย deploy) → ใส่ NOT NULL ตรงๆ ไม่ต้อง backfill
ALTER TABLE kanban_card_checklist ADD COLUMN IF NOT EXISTS field_id BIGINT REFERENCES kanban_field_defs(id) ON DELETE CASCADE;
ALTER TABLE kanban_card_checklist ALTER COLUMN field_id SET NOT NULL;

DROP INDEX IF EXISTS idx_kanban_checklist_card;
CREATE INDEX IF NOT EXISTS idx_kanban_checklist_card_field
    ON kanban_card_checklist (card_id, field_id, sort_order);



-- 2026-08-18 — กันใบสรุป "📤 โพสต์ออกแล้ว" แจ้งซ้ำ
-- notifyBatchDone เดิมเช็คแค่ "ตอนนี้ทั้ง batch จบหรือยัง" ไม่มีบันทึกว่าเคยแจ้งแล้ว
-- → ทุกครั้งที่ batch กลับมาจบครบอีกรอบ (กดลองใหม่ / worker คืนแถวเข้าคิว) จะแจ้งซ้ำทั้งชุด
-- NULL = ยังไม่เคยแจ้ง · แถวเก่าทั้งหมดเป็น NULL ตั้งต้น (แจ้งไปแล้วแต่ batch จบไปนานแล้ว ไม่ถูกแตะอีก)
ALTER TABLE post_social_history ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-18 (รอบดึก) · kanban: checklist ดึงรายการจากคลัง option + ลบตัวเลือกถาวร
--
-- ทำไมต้องมาก่อนโค้ดลบตัวเลือก: deleteFieldOption() ต้องคัดชื่อลง checklist.text
-- ก่อน DELETE ไม่งั้นรายการที่ติ๊กไว้กลายเป็นบรรทัดว่าง → ต้องมีคอลัมน์นี้ก่อน
--
-- option_id มีค่า  → แสดงชื่อจาก kanban_field_options (เปลี่ยนชื่อในคลัง = ทุกการ์ดเปลี่ยนตาม)
-- option_id = NULL → ใช้ text (ของเดิม + รายการครั้งเดียวที่ไม่อยากลงคลัง)
-- ⚠️ SET NULL ไม่ใช่ CASCADE — ลบตัวเลือกออกจากคลังแล้วรายการบนการ์ดต้องยังอยู่
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE kanban_card_checklist
  ADD COLUMN IF NOT EXISTS option_id BIGINT REFERENCES kanban_field_options(id) ON DELETE SET NULL;

-- text ว่างได้แล้ว เพราะชื่ออาจมาจาก option แทน
ALTER TABLE kanban_card_checklist ALTER COLUMN text DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kanban_checklist_option ON kanban_card_checklist (option_id)
    WHERE option_id IS NOT NULL;

-- 2026-08-19 · kanban: ถอด "ติดปัญหา" ออกจากตารางให้หมด
-- ฟีเจอร์ถูกถอดจาก UI ไปแล้ว 2026-08-18 · user สั่งลบคอลัมน์ทิ้ง 2026-08-19
-- ⚠️ ลบข้อมูลถาวร — ตรวจก่อนบน prod: SELECT count(*) FROM kanban_cards WHERE blocked;
ALTER TABLE kanban_cards DROP COLUMN IF EXISTS blocked;
ALTER TABLE kanban_cards DROP COLUMN IF EXISTS blocked_reason;

-- 2026-08-19 · kanban: ลบตารางป้ายทิ้ง (ยุบเข้า custom field แล้ว)
--
-- ⛔⛔ ลำดับบน production ห้ามสลับ:
--   1. รัน  node --env-file=.env scripts/migration/kanbanLabelsToFields.mjs           (dry-run ดูก่อน)
--   2. รัน  node --env-file=.env scripts/migration/kanbanLabelsToFields.mjs --commit  (ย้ายข้อมูลจริง)
--   3. deploy โค้ดใหม่ (อ่านแท็กจาก custom field อย่างเดียวแล้ว)
--   4. ตรวจว่าแท็กบนการ์ดขึ้นครบ แล้วค่อยรัน 2 บรรทัดล่างนี้
--
-- ทำสลับ = แท็กบนการ์ดหายไปต่อหน้า (ขึ้นโค้ดก่อนย้าย) หรือกู้ไม่ได้ (ลบตารางก่อนย้าย)
DROP TABLE IF EXISTS kanban_card_labels;
DROP TABLE IF EXISTS kanban_labels;

COMMIT;
