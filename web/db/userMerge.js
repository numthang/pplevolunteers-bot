// relative ไม่ใช่ alias '@/db/index.js' โดยตั้งใจ — ฝั่งบอท (CommonJS นอก Next) ต้อง await import() ไฟล์นี้ได้
// alias '@/' resolve ได้เฉพาะใน Next ถ้าใช้ alias บอทจะ import ไม่ผ่าน
import pool from './index.js'

/**
 * mergeUsers(keepId, dropId) — ยุบ users 2 แถวที่เป็นคนเดียวกันให้เหลือแถวเดียว
 *
 * ใช้ตอนคนเดิมที่มี Discord เผลอ login ด้วย Google/อีเมล แล้วได้บัญชีใหม่ (แถวเก่า email = NULL
 * ประตูอีเมลเลยหาไม่เจอ → สร้างใหม่) · เรียกจาก flow "ผูก Discord" เท่านั้น = ผู้ใช้พิสูจน์ตัวตน
 * มาแล้วทั้งสองฝั่ง ไม่ใช่การเดาจากชื่อ
 *
 * ⚠️ keepId ต้องเป็นแถวฝั่ง Discord เสมอ — ข้อมูลบอทจำนวนมาก key ด้วย discord_id (varchar)
 *    ไม่ใช่ users.id (dc_user_config, _dc_members) ถ้ายุบกลับทางข้อมูลพวกนั้นหลุดทันที
 *
 * ⚠️ ห้ามเรียกจาก login path (resolveUserByDiscord) — ที่นั่น throw = ROLLBACK ทั้ง transaction
 *    แล้วโดน .catch(()=>null) กลืน → token.userId = null = คนเข้าระบบไม่ได้ทั้งระบบ
 *    ที่นี่ throw = ผู้ใช้เห็น error ของปุ่มที่ตัวเองกด login เดิมยังใช้ได้ปกติ
 *
 * ย้อนไม่ได้ → เก็บ snapshot ของแถวที่ลบไว้ใน user_merges.dropped_row (jsonb) สำหรับกู้มือ
 */
export async function mergeUsers(keepId, dropId, reason = 'link_discord') {
  keepId = Number(keepId); dropId = Number(dropId)
  if (!keepId || !dropId) throw new Error('merge_bad_args')
  if (keepId === dropId) throw new Error('merge_same_user')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ล็อกเรียงตาม id เสมอ — กัน deadlock ถ้ามี merge 2 คู่วิ่งสวนกัน
    // และกันประตู google (INSERT ... ON CONFLICT (email)) แทรกกลางคัน
    const [lo, hi] = keepId < dropId ? [keepId, dropId] : [dropId, keepId]
    const { rows: locked } = await client.query(
      `SELECT id FROM users WHERE id IN ($1, $2) ORDER BY id FOR UPDATE`, [lo, hi]
    )
    if (locked.length !== 2) throw new Error('merge_user_missing')

    const fks = await listUserFks(client)

    // 1) org_members — ห้าม dedupe ด้วยการลบทิ้งเฉยๆ เพราะแถวนี้พกโปรไฟล์ 30+ คอลัมน์
    //    (province, bank_name, display_name, roles, ...) ค่าที่มีอยู่ฝั่งเดียวจะหายไป
    await mergeOrgMembers(client, keepId, dropId)

    // 2) ตารางอื่นที่มี unique index คร่อมคอลัมน์ user — ลบแถวฝั่ง drop ที่จะไปชนของ keep
    //    (ที่เหลือคือ log/ownership ซ้ำกันไม่ได้ให้ค่าอะไร ทิ้งได้)
    for (const fk of fks) await dropCollisions(client, fk, keepId, dropId)

    // 3) ย้าย FK ที่เหลือทั้งหมด (ตอนนี้ 40 คอลัมน์ · อ่านสดจาก pg_constraint ตารางใหม่จะติดมาเอง)
    for (const fk of fks) {
      await client.query(
        `UPDATE ${qi(fk.table)} SET ${qi(fk.column)} = $1 WHERE ${qi(fk.column)} = $2`,
        [keepId, dropId]
      )
    }

    // 4) discord_id ใน user_identities เป็น denormalized column — FK sweep จับไม่ได้
    //    ถ้าไม่แก้ แถว passkey/line ที่ย้ายมาจะพก discord_id ของแถวที่ถูกลบ (NULL) ติดมา
    //    แล้ว getPasskeyCredential จะคืน discordId ผิด
    await client.query(
      `UPDATE user_identities ui SET discord_id = u.discord_id
         FROM users u WHERE u.id = $1 AND ui.user_id = $1`,
      [keepId]
    )

    // 5) กันพลาด: ตาราง ON DELETE CASCADE จะถูกลบ "เงียบๆ ไม่ error" ตอน DELETE users
    //    ต่างจากอีก 36 คอลัมน์ที่ FK เตะกลับให้เห็น → ต้องเช็คเองว่าไม่มีอะไรค้างจริง
    for (const t of ['user_identities', 'org_member_roles', 'auth_nonces', 'user_config']) {
      const { rows } = await client.query(`SELECT 1 FROM ${qi(t)} WHERE user_id = $1 LIMIT 1`, [dropId])
      if (rows.length) throw new Error(`merge_leftover_${t}`)
    }

    // 6) snapshot แถวที่จะลบ (ทางกู้มือทางเดียวที่มี) แล้วลบ
    const { rows: dropRow } = await client.query(`SELECT * FROM users WHERE id = $1`, [dropId])
    await client.query(
      `INSERT INTO user_merges (keep_id, drop_id, reason, dropped_row) VALUES ($1, $2, $3, $4)`,
      [keepId, dropId, reason, JSON.stringify(dropRow[0] || {})]
    )
    await client.query(`DELETE FROM users WHERE id = $1`, [dropId])

    // 7) ยกค่าที่ keeper ยังว่างมาจากแถวที่ลบ — ต้องทำ "หลัง" DELETE
    //    ไม่งั้นชน uq_users_email / uq_users_phone ที่แถวเดิมถืออยู่
    const d = dropRow[0] || {}
    await client.query(
      `UPDATE users SET
         email     = COALESCE(email, $2),
         google_id = COALESCE(google_id, $3),
         line_id   = COALESCE(line_id, $4),
         phone     = COALESCE(phone, $5),
         phone_verified_at = COALESCE(phone_verified_at, $6),
         firstname = COALESCE(firstname, $7),
         lastname  = COALESCE(lastname, $8),
         username  = COALESCE(username, $9),
         updated_at = NOW()
       WHERE id = $1`,
      [keepId, d.email, d.google_id, d.line_id, d.phone, d.phone_verified_at, d.firstname, d.lastname, d.username]
    )

    await client.query('COMMIT')
    return { keepId, dropId }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/**
 * ตาม id ที่ถูกยุบไปแล้ว → id ปลายทางที่ยังมีอยู่จริง
 * JWT ของคนที่เพิ่งถูก merge ยังถือ id ที่โดนลบ → ถ้าไม่ตามให้ เขาจะกลายเป็นผีทั้ง session
 * วน while เผื่อถูก merge ซ้อน (A→B แล้ว B→C ภายหลัง) · จำกัดรอบกัน data ผิดรูปทำ loop ค้าง
 */
export async function followMerge(userId) {
  let id = Number(userId) || null
  for (let i = 0; id && i < 5; i++) {
    const { rows } = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [id])
    if (rows.length) return id
    const { rows: m } = await pool.query(
      `SELECT keep_id FROM user_merges WHERE drop_id = $1 ORDER BY at DESC LIMIT 1`, [id]
    )
    if (!m[0]) return null
    id = m[0].keep_id
  }
  return id
}

/** ทุกคอลัมน์ที่เป็น FK ชี้ users(id) — อ่านจาก pg_constraint (information_schema ช้ากว่าและติดเรื่อง privilege) */
async function listUserFks(client) {
  const { rows } = await client.query(`
    SELECT c.conrelid::regclass::text AS table, a.attname AS column
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
       AND c.conrelid <> 'user_merges'::regclass   -- log ของการ merge เอง ห้ามย้าย
     ORDER BY 1, 2`)
  return rows
}

/**
 * ลบแถวฝั่ง drop ที่ย้ายไปแล้วจะชน unique index ของ keep
 * derive จาก pg_index → ตารางใหม่ที่มี unique คร่อม user column จะถูกจัดการเองโดยไม่ต้องแก้โค้ดนี้
 * (คอลัมน์อื่นใน index ใช้ IS NOT DISTINCT FROM เพื่อให้ NULL = NULL แบบเดียวกับ partial unique ที่ใช้จริง)
 */
async function dropCollisions(client, fk, keepId, dropId) {
  const { rows: idx } = await client.query(`
    -- ::text จำเป็น — attname เป็น type "name" (name[] ไม่มี parser ใน node-postgres → คืนมาเป็น string)
    SELECT array_agg(a.attname::text ORDER BY k.ord) AS cols,
           COALESCE(pg_get_expr(i.indpred, i.indrelid), 'true') AS pred
      FROM pg_index i
      JOIN unnest(i.indkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
     WHERE i.indisunique AND i.indrelid = $1::regclass
     GROUP BY i.indexrelid, i.indpred, i.indrelid`, [fk.table])

  const T = qi(fk.table)
  for (const { cols, pred } of idx) {
    if (!cols.includes(fk.column)) continue
    const others = cols.filter(c => c !== fk.column)

    // ⚠️ ต้องเคารพ partial index (`WHERE ...`) ไม่งั้นลบแถวที่ไม่ได้ชนกันจริง
    // เคสจริงที่เจอตอนเทสต์: org_members มี uq_om_user_org (user_id, org_id) WHERE guild_id IS NULL
    // ถ้ามองแค่ (user_id, org_id) แถว org-level ของ drop จะถูกนับว่าชนกับแถว guild-level ของ keep
    // ทั้งที่คนละ index กัน → แถว org-level หายไปเฉยๆ
    //
    // pred เป็นข้อความ SQL ที่อ้างชื่อคอลัมน์แบบไม่มี prefix → ต้องให้มันอยู่ใน subquery
    // ที่ FROM เป็นตารางชื่อจริง (unqualified resolve เข้าตารางนั้น) ส่วนแถวฝั่ง drop อ้างผ่าน alias d
    const matchK = others.map(c => `${T}.${qi(c)} IS NOT DISTINCT FROM d.${qi(c)}`).join(' AND ') || 'true'
    await client.query(
      `DELETE FROM ${T} d
        WHERE d.${qi(fk.column)} = $2
          AND EXISTS (SELECT 1 FROM ${T} WHERE ${T}.ctid = d.ctid AND (${pred}))
          AND EXISTS (SELECT 1 FROM ${T} WHERE ${T}.${qi(fk.column)} = $1 AND (${pred}) AND ${matchK})`,
      [keepId, dropId]
    )
  }
}

/**
 * org_members: แถวของ keep กับ drop ที่อยู่ org/guild เดียวกัน ต้องรวมค่าทีละคอลัมน์
 * (COALESCE ให้ค่าเดิมของ keep ชนะ · เติมเฉพาะช่องที่ keep ว่าง) แล้วค่อยลบแถวของ drop ทิ้ง
 * แถวที่ไม่ชนกันปล่อยให้ UPDATE รอบใหญ่ย้ายไปตามปกติ
 */
async function mergeOrgMembers(client, keepId, dropId) {
  const { rows: cols } = await client.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'org_members'
       AND column_name NOT IN ('id','user_id','org_id','guild_id','joined_at','created_at')`)
  const sets = cols.map(c => `${qi(c.column_name)} = COALESCE(k.${qi(c.column_name)}, d.${qi(c.column_name)})`).join(', ')

  await client.query(
    `UPDATE org_members k SET ${sets}
       FROM org_members d
      WHERE k.user_id = $1 AND d.user_id = $2
        AND k.org_id IS NOT DISTINCT FROM d.org_id
        AND k.guild_id IS NOT DISTINCT FROM d.guild_id`,
    [keepId, dropId]
  )
}

/** ชื่อ table/column จาก catalog — ใส่ quote กัน identifier แปลกๆ (ไม่ใช่ค่าจาก user input) */
function qi(name) {
  return String(name).split('.').map(p => `"${p.replace(/"/g, '""')}"`).join('.')
}
