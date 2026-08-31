// web/db/kanban/statusSql.js — สูตร SQL ของ "การ์ดที่ผูกของจริง" ที่ใช้ร่วมกันหลายไฟล์
//
// ⭐ ทำไมต้องแยกไฟล์: สูตรแปลงสถานะถูกใช้ **3 ที่** (คอลัมน์ที่ SELECT · WHERE ตอนกรองงานที่ปิดแล้ว ·
//    UPDATE ตอนถอดลิงก์) ถ้าก็อปไว้ 3 ที่แล้วแก้ไม่ครบ = การ์ดโผล่ในกองหนึ่งแต่หายจากอีกกอง
//    ที่นี่คือ **จุดเดียว** ที่แปลงสถานะต้นทาง → status_type ของ kanban
//
// ⛔ ห้ามเพิ่ม entity_type ใหม่โดยไม่แก้ทั้ง 3 ก้อนในไฟล์นี้พร้อมกัน (สถานะ · การมองเห็น · ข้อมูลลิงก์)
//
// ⚠️ ทุกก้อนอ้าง `c` = แถวใน kanban_cards ของ query ที่เอาไปแปะ — เป็น correlated subquery ทั้งหมด
//    ตั้งใจไม่ใช้ JOIN เพื่อไม่ต้องไปแก้ FROM ของทุก query ที่มีอยู่

// ── สถานะต้นทาง → status_type (ตาราง md/kanban/KANBAN.md §ประเภทสถานะ) ──
//
// ⚠️ คืน NULL เมื่อแถวต้นทางหายไป (LEFT JOIN ไม่เจอ) — ให้ COALESCE ข้างนอกตกไปใช้ค่า cache
//    ไม่งั้นการ์ดกำพร้าจะเด้งไปกอง "รอทำ" พร้อมกันทั้งหมดโดยไม่มีใครสั่ง
const CASE_STATUS = `CASE cs.status
        WHEN 'open'        THEN 'backlog'
        WHEN 'in_progress' THEN 'doing'
        WHEN 'resolved'    THEN 'done'
        WHEN 'closed'      THEN 'done'
        WHEN 'rejected'    THEN 'cancelled'
        ELSE NULL END`

// โพสต์ไม่มีสถานะ "เผยแพร่แล้ว" ในตารางตัวเอง — ดูจากประวัติการส่งขึ้นโซเชียลว่ามีใบที่ posted_at แล้วไหม
// (post_episodes.status มีแค่ draft/review/approved ตาม CHECK)
//
// ⭐ `draft` คืน NULL โดยตั้งใจ (2026-08-25) — **ไม่ใช่ค่าที่ลืมใส่**
//    post_episodes ไม่มีคำว่า "ยังไม่มีใครลงมือ" อยู่ในคำศัพท์ของมันเลย มีแค่ 3 คำที่เป็น
//    สถานะ *บรรณาธิการ* (draft/review/approved) → เดิมแม็ป draft → 'doing' ทำให้โพสต์ทุกใบ
//    ตกกอง "กำลังทำ" ตั้งแต่วินาทีที่เกิด และกอง "รอทำ" ว่างตลอดกาล (dev: 31/31 ใบ)
//    → คืน NULL ให้ COALESCE ตกไปใช้ `c.status_type` แทน = **kanban ถือสถานะช่วงก่อนส่งตรวจ**
//      (backlog / doing / cancelled) ส่วน review เป็นต้นไปยังเป็นของต้นทางเหมือนเดิม
//
//    กฎเหล็กไม่แตก: ต้นทางยังเป็นเจ้าของทุกสถานะที่ต้นทาง**มีจริง** — kanban ถือเฉพาะช่วงที่
//    post_episodes ไม่มีความเห็น ⛔ ห้ามเติม `ELSE 'doing'` กลับมา จะพากอง "รอทำ" ตายอีกรอบ
const POST_STATUS = `CASE
        WHEN pe.id IS NULL THEN NULL
        WHEN EXISTS (SELECT 1 FROM post_social_history h
                      WHERE h.episode_id = pe.id AND h.posted_at IS NOT NULL) THEN 'done'
        WHEN pe.status = 'approved' THEN 'ready'
        WHEN pe.status = 'review'   THEN 'review'
        ELSE NULL END`

// ⚠️ entity_type ต้องอยู่ในเงื่อนไข JOIN ทุกครั้ง — cases.id กับ post_episodes.id ช่วงเลขทับกันเต็มๆ
//    (เคสเดียวกับ contact_type ใน calling — CLAUDE.md §Known Gotchas)
const LINK_FROM = `FROM kanban_card_links l
         LEFT JOIN cases cs         ON l.entity_type = 'case' AND cs.id = l.entity_id
         LEFT JOIN post_episodes pe ON l.entity_type = 'post' AND pe.id = l.entity_id
        WHERE l.card_id = c.id`

/**
 * สถานะที่ต้องเอาไปแสดงจริง — สดจากต้นทางถ้าผูกไว้ · ไม่ผูกก็ใช้คอลัมน์เดิม
 * ⛔ กฎเหล็ก: การ์ดที่ผูกของจริง **ไม่เก็บสถานะเอง** — `c.status_type` เป็น cache เท่านั้น
 */
export const LIVE_STATUS_SQL = `COALESCE((
      SELECT CASE l.entity_type WHEN 'case' THEN ${CASE_STATUS} ELSE ${POST_STATUS} END
      ${LINK_FROM}), c.status_type)`

/** ก้อนข้อมูลลิงก์ให้ UI (แถบ "การ์ดนี้ผูกกับ…" + ปุ่มเปิดต้นทาง) · null = การบ้านธรรมดา */
export const LINK_JSON_SQL = `(
      SELECT json_build_object(
        'entity_type',   l.entity_type,
        'entity_id',     l.entity_id,
        'is_auto',       l.is_auto,
        'title',         CASE l.entity_type WHEN 'case' THEN cs.title ELSE pe.title END,
        'ref',           CASE l.entity_type WHEN 'case' THEN cs.ref ELSE NULL END,
        'source_status', CASE l.entity_type WHEN 'case' THEN cs.status ELSE pe.status END,
        -- ⚠️ /complaint/[ref] คือหน้าติดตาม **สาธารณะ** ของผู้ร้อง — คนทำงานต้องไป /case/[ref] (จัดการเคส 2026-08-30)
        'href',          CASE l.entity_type WHEN 'case' THEN '/case/' || cs.ref
                                                        ELSE '/posts/' || pe.id END)
      ${LINK_FROM})`

/**
 * ⭐ ด่านการมองเห็น — user เคาะ 2026-08-24: **ไม่มีสิทธิ์เห็นต้นทาง = ซ่อนการ์ดทั้งใบ**
 *
 * ทำไมต้องมี: kanban เปิดทั้ง org แต่ต้นทางไม่ได้เปิดขนาดนั้น
 *   - เคส  → ต้องมียศ `manageCases` **และ** อยู่ในจังหวัดนั้น (db/cases.js:listCases กรอง provinces)
 *            ชื่อเรื่อง/รายละเอียดเป็น PII ของผู้ร้อง หลุดข้ามจังหวัดไม่ได้
 *   - โพสต์ → `visibility='personal'` = ของเจ้าของคนเดียว **คนอื่นห้ามเห็นเด็ดขาด**
 *            ⭐ ตั้งแต่ 2026-08-24 (รอบสอง) ร่างส่วนตัว **มีการ์ด** แล้ว → ท่อน
 *            `OR p.owner_user_id = $pUser` ข้างล่างเลิกเป็น dead code กลายเป็น**ด่านจริง**
 *            ที่กันร่างส่วนตัวของคนอื่นไม่ให้โผล่บนบอร์ด · แก้ท่อนนั้นเมื่อไหร่ = รั่วทันที
 *
 * **fail closed**: ส่ง scope มาไม่ครบ → ซ่อนการ์ดที่ผูกทุกใบ (ยอมให้เห็นน้อยไป ไม่ยอมให้หลุด)
 *
 * @param {number} pUser       ลำดับพารามิเตอร์ของ user id คนดู
 * @param {number} pCases      ลำดับพารามิเตอร์ของ "เห็นเคสได้ไหม" (boolean)
 * @param {number} pProvinces  ลำดับพารามิเตอร์ของจังหวัดในอำนาจ (text[] · NULL = ทุกจังหวัด/admin)
 */
export function visibleLinkSql(pUser, pCases, pProvinces) {
  return `NOT EXISTS (
      SELECT 1 FROM kanban_card_links l
       WHERE l.card_id = c.id
         AND NOT (
           (l.entity_type = 'case' AND $${pCases}::boolean AND EXISTS (
              SELECT 1 FROM cases s
               WHERE s.id = l.entity_id AND s.org_id = c.org_id AND s.archived_at IS NULL
                 AND ($${pProvinces}::text[] IS NULL OR s.province = ANY($${pProvinces}::text[]))))
           OR
           (l.entity_type = 'post' AND EXISTS (
              SELECT 1 FROM post_episodes p
               WHERE p.id = l.entity_id AND p.org_id = c.org_id AND p.archived_at IS NULL
                 AND (p.visibility = 'org' OR p.owner_user_id = $${pUser}::int)))
         ))`
}
