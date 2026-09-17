import pool from '../index.js'

/**
 * รอบจ่ายเบี้ยเลี้ยง — ดู migrations/1788900000000_finance-payout-rounds.sql
 *
 * ⚠️ ผู้รับเป็น XOR: member_user_id (สมาชิก) หรือ external_payee_id (คนนอก) อย่างใดอย่างหนึ่ง
 *    ทุกที่ที่เขียนผู้รับต้องส่งสองคอลัมน์พร้อมกันเสมอ (CHECK finance_payout_items_recipient_xor)
 * ⚠️ สิทธิ์ไม่ได้อยู่ที่นี่ — route เป็นคนเช็ค canEditAccount() ของบัญชีต้นทาง (lib/financeAccess.js)
 *    ฟังก์ชันในไฟล์นี้บังคับแค่ org_id เพื่อกันข้าม tenant
 */

const ROUND_COLS = `r.id, r.org_id, r.account_id, r.title, r.source_type, r.event_id, r.period_ym,
                    r.default_amount, r.status, r.note, r.exported_at, r.paid_at,
                    r.created_by, r.created_at, r.updated_at`

export async function listRounds(orgId, { accountIds = null } = {}) {
  const { rows } = await pool.query(
    `SELECT ${ROUND_COLS},
            a.name AS account_name, a.bank AS account_bank, a.province AS account_province,
            e.name AS event_name,
            COALESCE(i.cnt, 0)::int AS item_count,
            COALESCE(i.total, 0)::numeric AS total_amount,
            COALESCE(i.paid_cnt, 0)::int AS paid_count,
            COALESCE(i.paid_total, 0)::numeric AS paid_total
       FROM finance_payout_rounds r
       JOIN finance_accounts a ON a.id = r.account_id
       LEFT JOIN cache_pple_event e ON e.id = r.event_id
       LEFT JOIN (
         SELECT round_id, COUNT(*) cnt, SUM(amount) total,
                COUNT(paid_at) paid_cnt, SUM(amount) FILTER (WHERE paid_at IS NOT NULL) paid_total
           FROM finance_payout_items GROUP BY round_id
       ) i ON i.round_id = r.id
      WHERE r.org_id = $1
        AND ($2::int[] IS NULL OR r.account_id = ANY($2))
      ORDER BY r.created_at DESC`,
    [orgId, accountIds]
  )
  return rows
}

export async function getRoundById(orgId, id) {
  const { rows } = await pool.query(
    `SELECT ${ROUND_COLS}, e.name AS event_name
       FROM finance_payout_rounds r
       LEFT JOIN cache_pple_event e ON e.id = r.event_id
      WHERE r.id = $1 AND r.org_id = $2`,
    [id, orgId]
  )
  return rows[0] || null
}

export async function createRound(orgId, data, userId) {
  const { account_id, title, source_type, event_id, period_ym, default_amount, note } = data
  const { rows } = await pool.query(
    `INSERT INTO finance_payout_rounds
       (org_id, account_id, title, source_type, event_id, period_ym, default_amount, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [orgId, account_id, title, source_type || 'event',
     source_type === 'period' ? null : (event_id || null),
     source_type === 'period' ? (period_ym || null) : null,
     default_amount ?? null, note || null, userId]
  )
  return rows[0].id
}

/** autosave หน้าแก้รอบ — เขียนเฉพาะ field ที่ส่งมาจริง (ห้าม SET ทุกคอลัมน์รวด) */
export async function updateRound(orgId, id, data) {
  const allowed = ['account_id', 'title', 'source_type', 'event_id', 'period_ym', 'default_amount', 'note']
  const sets = []
  const vals = []
  for (const k of allowed) {
    if (!(k in data)) continue
    vals.push(data[k] === '' ? null : data[k])
    sets.push(`${k} = $${vals.length}`)
  }
  if (!sets.length) return
  vals.push(id, orgId)
  await pool.query(
    `UPDATE finance_payout_rounds SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${vals.length - 1} AND org_id = $${vals.length}`,
    vals
  )
}

export async function setRoundStatus(orgId, id, status) {
  const stamp = status === 'exported' ? 'exported_at = NOW(),'
              : status === 'paid'     ? 'paid_at = NOW(),'
              : ''
  await pool.query(
    `UPDATE finance_payout_rounds SET status = $1, ${stamp} updated_at = NOW()
      WHERE id = $2 AND org_id = $3`,
    [status, id, orgId]
  )
}

export async function deleteRound(orgId, id) {
  await pool.query(`DELETE FROM finance_payout_rounds WHERE id = $1 AND org_id = $2`, [id, orgId])
}

// ── รายการในรอบ ───────────────────────────────────────────────────────────
// ข้อมูลรับเงิน "สด" มาจากทะเบียน (org_members / docs_external_payees) จนกว่าจะ export
// พอ export แล้ว snapshot_at ถูกเขียน → ใช้ค่าที่ snapshot ไว้แทน (ประวัติรอบเก่าไม่เพี้ยนตามทะเบียน)
const ITEM_SELECT = `
  SELECT i.id, i.round_id, i.member_user_id, i.external_payee_id, i.amount, i.note, i.snapshot_at, i.paid_at,
         COALESCE(i.payee_name, om.display_name,
                  NULLIF(TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), ''), u.username,
                  NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.entity_name) AS payee_name,
         COALESCE(i.payment_method, om.payment_method, p.payment_method, 'bank') AS payment_method,
         COALESCE(i.bank_code,    om.bank_code,    p.bank_code)    AS bank_code,
         COALESCE(i.account_no,   om.account_no,   p.account_no)   AS account_no,
         COALESCE(i.promptpay_id, om.promptpay_id, p.promptpay_id) AS promptpay_id,
         COALESCE(om.account_holder, p.account_holder) AS account_holder,
         COALESCE(u.phone, p.phone) AS phone
    FROM finance_payout_items i
    LEFT JOIN users u ON u.id = i.member_user_id
    -- ⚠️ org_members มีได้หลายแถวต่อ user (แถวละ guild — org 1 มี 3 guild)
    --    JOIN ตรงๆ = รายการในรอบซ้ำ 3 เท่า → LATERAL หยิบแถวเดียว เลือกแถวที่มีเลขบัญชีก่อน
    LEFT JOIN LATERAL (
      SELECT om2.* FROM org_members om2
       WHERE om2.user_id = i.member_user_id AND om2.org_id = $2
       ORDER BY (COALESCE(om2.account_no, om2.promptpay_id) IS NOT NULL) DESC, om2.id
       LIMIT 1
    ) om ON TRUE
    LEFT JOIN docs_external_payees p ON p.id = i.external_payee_id AND p.org_id = $2`

export async function listItems(orgId, roundId) {
  const { rows } = await pool.query(
    `${ITEM_SELECT}
      WHERE i.round_id = (SELECT id FROM finance_payout_rounds WHERE id = $1 AND org_id = $2)
      ORDER BY i.id`,
    [roundId, orgId]
  )
  return rows
}

export async function addItem(orgId, roundId, { member_user_id = null, external_payee_id = null, amount, note = null }) {
  const { rows } = await pool.query(
    // ผู้รับต้องอยู่ org เดียวกับรอบ — ไม่งั้นเดา id แล้วดึงชื่อ/เลขบัญชีคนของ org อื่นมาดูได้
    `INSERT INTO finance_payout_items (round_id, member_user_id, external_payee_id, amount, note)
     SELECT $1, $2::int, $3::int, $4, $5
      WHERE ($2::int IS NOT NULL AND EXISTS (SELECT 1 FROM org_members WHERE user_id = $2::int AND org_id = $6))
         OR ($3::int IS NOT NULL AND EXISTS (SELECT 1 FROM docs_external_payees WHERE id = $3::int AND org_id = $6))
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [roundId, member_user_id || null, external_payee_id || null, amount, note, orgId]
  )
  return rows[0]?.id || null
}

export async function updateItem(orgId, roundId, itemId, { amount, note, paid }) {
  const sets = []
  const vals = []
  if (amount !== undefined) { vals.push(amount); sets.push(`amount = $${vals.length}`) }
  if (note   !== undefined) { vals.push(note || null); sets.push(`note = $${vals.length}`) }
  // ติ๊ก/เอาติ๊กออกตอนไล่กดโอน — เก็บเวลาไว้ด้วยเพื่อรู้ว่าใครโอนเมื่อไหร่
  if (paid   !== undefined) { sets.push(paid ? 'paid_at = NOW()' : 'paid_at = NULL') }
  if (!sets.length) return
  vals.push(itemId, roundId)
  await pool.query(
    `UPDATE finance_payout_items SET ${sets.join(', ')}
      WHERE id = $${vals.length - 1} AND round_id = $${vals.length}`,
    vals
  )
}

export async function deleteItem(orgId, roundId, itemId) {
  await pool.query(`DELETE FROM finance_payout_items WHERE id = $1 AND round_id = $2`, [itemId, roundId])
}

/** ลอกรายชื่อจากรอบก่อน — ยอดใช้ default ของรอบปลายทาง ถ้าไม่ได้ตั้งไว้ใช้ยอดเดิม */
export async function copyItemsFromRound(orgId, targetRoundId, sourceRoundId) {
  const { rowCount } = await pool.query(
    `INSERT INTO finance_payout_items (round_id, member_user_id, external_payee_id, amount, note)
     SELECT $1, s.member_user_id, s.external_payee_id,
            COALESCE(t.default_amount, s.amount), s.note
       FROM finance_payout_items s
       JOIN finance_payout_rounds src ON src.id = s.round_id AND src.org_id = $3
       JOIN finance_payout_rounds t   ON t.id   = $1         AND t.org_id   = $3
      WHERE s.round_id = $2
     ON CONFLICT DO NOTHING`,
    [targetRoundId, sourceRoundId, orgId]
  )
  return rowCount
}

/** เขียน snapshot ข้อมูลรับเงินลงทุกบรรทัด — เรียกตอน export */
export async function snapshotItems(orgId, roundId, items) {
  for (const it of items) {
    await pool.query(
      `UPDATE finance_payout_items
          SET payee_name = $1, payment_method = $2, bank_code = $3,
              account_no = $4, promptpay_id = $5, snapshot_at = NOW()
        WHERE id = $6 AND round_id = $7`,
      [it.payee_name, it.payment_method, it.bank_code || null,
       it.account_no || null, it.promptpay_id || null, it.id, roundId]
    )
  }
}

/** ค้นผู้รับเงินสำหรับช่อง "เพิ่มคนเข้ารอบ" — สมาชิก + คนนอก ในผลลัพธ์เดียว */
export async function searchPayees(orgId, q, limit = 20) {
  const like = `%${String(q || '').trim()}%`
  const { rows } = await pool.query(
    `(SELECT * FROM (
        -- DISTINCT ON กันคนเดียวขึ้นหลายแถว (1 แถวต่อ guild) — เอาแถวที่มีข้อมูลรับเงินก่อน
        SELECT DISTINCT ON (om.user_id)
               'member' AS kind, om.user_id AS id,
               COALESCE(om.display_name, NULLIF(TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), ''), u.username) AS name,
               om.province, om.bank_code, om.account_no, om.promptpay_id, om.payment_method
          FROM org_members om
          JOIN users u ON u.id = om.user_id
         WHERE om.org_id = $1
           AND (om.display_name ILIKE $2 OR u.firstname ILIKE $2 OR u.lastname ILIKE $2 OR u.username ILIKE $2)
         ORDER BY om.user_id, (COALESCE(om.account_no, om.promptpay_id) IS NOT NULL) DESC, om.id
      ) m LIMIT $3)
     UNION ALL
     (SELECT 'external' AS kind, p.id,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.entity_name) AS name,
             p.province, p.bank_code, p.account_no, p.promptpay_id, p.payment_method
        FROM docs_external_payees p
       WHERE p.org_id = $1
         AND (p.first_name ILIKE $2 OR p.last_name ILIKE $2 OR p.entity_name ILIKE $2)
       LIMIT $3)`,
    [orgId, like, limit]
  )
  return rows
}

/**
 * คนนอกคนนี้อยู่ในรอบนี้ และบรรทัดของเขายังไม่ถูก snapshot หรือเปล่า
 * — ด่านของหน้ารอบจ่ายก่อนแก้ข้อมูลบัญชีในทะเบียนคนนอก (สิทธิ์การเงินแก้ได้เฉพาะคนในรอบตัวเอง)
 * ⚠️ บรรทัดที่ snapshot แล้วแสดงค่าที่ล็อกไว้ แก้ทะเบียนไปก็ไม่เห็นผล → ไม่ให้แก้ผ่านทางนี้
 */
export async function isEditableExternalPayeeInRound(orgId, roundId, payeeId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM finance_payout_items i
       JOIN finance_payout_rounds r ON r.id = i.round_id AND r.org_id = $1
      WHERE i.round_id = $2 AND i.external_payee_id = $3 AND i.snapshot_at IS NULL`,
    [orgId, roundId, payeeId]
  )
  return rowCount > 0
}
