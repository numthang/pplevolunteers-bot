// web/db/posts/episodes.js — โพสต์ (post_episodes) + autosave (optimistic lock) + ประวัติการแก้
//
// ⛔ 2026-07-29 (เย็น): **ไม่มี post_series แล้ว** — โพสต์ยืนเดี่ยว จัดกลุ่มด้วยคอลัมน์ `category`
//    ไม่มี seq/ลำดับตอน · เรียงตาม updated_at (แก้ล่าสุดขึ้นก่อน)
//
// 2 กติกาที่ห้ามพลาด (md/posts/POSTS.md):
//   grill ข้อ 14 — autosave ส่ง lockToken ที่โหลดมาด้วย ไม่ตรง = 409 **บล็อกการเซฟ** ไม่ใช่ last-write-wins
//   §สิทธิ์      — เขียน revision ก่อนทับ "ทุกครั้งที่คนแก้เปลี่ยนคน" + snapshot แรกตอนสร้างโพสต์
//                  (ใช้ post_episodes.last_edited_by เป็นตัวบอกว่าเนื้อหาที่อยู่ใน DB ตอนนี้เป็นของใคร
//                   ถ้าเดาจาก revision ล่าสุดจะจดชื่อผิด — snapshot ของ B ถูกจดเป็นของ A)
import pool from '../index.js'

// ป้ายเวลาที่ใช้เป็น optimistic lock token — ต้องเป็น "สตริงเดียวกันเป๊ะ" ทั้งตอนอ่านและตอนเทียบ
// (ห้ามส่ง Date ของ JS ไป-กลับ: PG เก็บ microsecond แต่ JS มีแค่ millisecond → เทียบไม่มีวันตรง)
const LOCK = `to_char(e.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

// เว้นช่วง snapshot ของคนเดิม — พิมพ์รัวๆ ไม่ควรได้ revision ทุก 800ms
const REVISION_INTERVAL_MS = 15 * 60 * 1000

const COLS = `
  e.id, e.org_id, e.owner_user_id, e.visibility, e.category, e.title, e.body, e.bodies, e.format,
  e.source_idea, e.created_via, e.status, e.approved_by, e.approved_by_name, e.approved_at,
  e.last_edited_by, e.visibility_changed_at, e.archived_at, e.created_at, e.updated_at,
  e.guild_id, e.channel_id, e.channel_name,   -- มีค่า = มาจากตะกร้าดิสฯ (badge + ลิงก์กลับเข้า Discord)
  -- ⛔ channel_name เป็นคอลัมน์ของตัวเองแล้ว (2026-07-30) — ห้ามยัดชื่อห้องกลับลง category อีก
  --    category = หมวดที่คนตั้งเอง · โพสต์จากดิสฯ เริ่มด้วยหมวดว่างเสมอ
  --    (อยู่ในเทมเพลตสตริง — ห้ามใส่ backtick ในคอมเมนต์ SQL เด็ดขาด มันปิดสตริง)
  ${LOCK} AS lock_token`

const OWNER_NAME = `COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), ''), u.username)`

/**
 * โพสต์ทั้งหมดที่ user คนนี้ "เห็นได้อย่างน้อยระดับ org"
 * personal ของคนอื่นถูกตัดใน SQL — admin god-mode ส่ง includeAllPersonal = true
 * (ชั้น API ยังต้องกรองด้วย canReadPost อีกที เมื่อ policy.read = 'team')
 */
export async function listPosts(orgId, userId, { visibility = null, category = null, status = null, includeArchived = false, includePosted = false, includeAllPersonal = false, source = null, limit = 200 } = {}) {
  const params = [orgId, userId]
  let where = `e.org_id = $1 AND (e.visibility = 'org' OR e.owner_user_id = $2${includeAllPersonal ? ' OR TRUE' : ''})`
  if (!includeArchived) where += ` AND e.archived_at IS NULL`
  // "โพสต์แล้วครบทุกช่องที่คิว" (เผยแพร่จบ ไม่มีคิวค้าง) = ซ่อนจากฟีดหลักโดย default (เคาะ 2026-08-08)
  // เช็คจาก post_social_history ไม่ใช่ status ของ e — published/queued เป็น derived state คนละแกนกับ draft/review/approved
  if (!includePosted) {
    where += ` AND NOT (
      EXISTS (SELECT 1 FROM post_social_history h WHERE h.episode_id = e.id AND h.status = 'done')
      AND NOT EXISTS (SELECT 1 FROM post_social_history h WHERE h.episode_id = e.id AND h.status IN ('pending','running'))
    )`
  }
  // ตะกร้าสื่อของ Discord เป็นโพสต์เหมือนกัน (ก้อน 4c) แต่ทีมสื่อหย่อนวันละหลายใบ
  // → **ซ่อนจากฟีดหลัก** ให้ไปดูที่แท็บ "จากดิสฯ" แทน (source='discord')
  if (source === 'discord')   where += ` AND e.channel_id IS NOT NULL`
  else if (source !== 'all')  where += ` AND e.channel_id IS NULL`
  if (visibility) { params.push(visibility); where += ` AND e.visibility = $${params.length}` }
  if (status)     { params.push(status);     where += ` AND e.status = $${params.length}` }
  // category = '' (สตริงว่าง) หมายถึง "ยังไม่จัดหมวด" — ต่างจาก null ที่แปลว่าไม่กรอง
  if (category === '')      where += ` AND e.category IS NULL`
  else if (category)      { params.push(category); where += ` AND e.category = $${params.length}` }

  params.push(limit)
  const { rows } = await pool.query(
    `SELECT ${COLS}, ${OWNER_NAME} AS owner_name,
            (SELECT COUNT(*) FROM post_episode_media m WHERE m.episode_id = e.id) AS media_count,
            (SELECT COUNT(*) FROM post_social_history h WHERE h.episode_id = e.id AND h.status = 'done') AS published_count,
            (SELECT COUNT(*) FROM post_social_history h WHERE h.episode_id = e.id AND h.status IN ('pending','running')) AS queued_count,
            g.name AS guild_name,   -- ชื่อเซิร์ฟเวอร์ Discord ต้นทาง (ใช้ทำ badge บนการ์ด)
            -- thumbnail บนการ์ด: ไฟล์ในดิสก์ก่อน (เสิร์ฟผ่าน /api/posts/media/[id] ซึ่งเช็คสิทธิ์ให้)
            (SELECT m.id FROM post_episode_media m
              WHERE m.episode_id = e.id AND m.path IS NOT NULL
                AND (lower(m.path) LIKE '%.jpg' OR lower(m.path) LIKE '%.jpeg'
                  OR lower(m.path) LIKE '%.png' OR lower(m.path) LIKE '%.gif' OR lower(m.path) LIKE '%.webp')
              ORDER BY m.sort_order, m.id LIMIT 1) AS thumb_media_id,
            -- ไม่มีไฟล์ในดิสก์ (ของตะกร้าดิสฯ ที่ยังไม่โหลด) → ใช้ CDN ของ Discord ไปก่อน
            -- ลิงก์พวกนี้มีลายเซ็นหมดอายุ (?ex=…) โหลดไม่ขึ้นได้ → ฝั่ง UI ซ่อนรูปเองเมื่อ error
            (SELECT m.source_url FROM post_episode_media m
              WHERE m.episode_id = e.id AND m.path IS NULL AND m.source_url IS NOT NULL
                AND (lower(m.source_url) LIKE '%.jpg%' OR lower(m.source_url) LIKE '%.jpeg%'
                  OR lower(m.source_url) LIKE '%.png%' OR lower(m.source_url) LIKE '%.webp%')
              ORDER BY m.sort_order, m.id LIMIT 1) AS thumb_source_url
       FROM post_episodes e
       LEFT JOIN users u ON u.id = e.owner_user_id
       LEFT JOIN dc_guilds g ON g.guild_id = e.guild_id
      WHERE ${where}
      ORDER BY e.updated_at DESC
      LIMIT $${params.length}`,
    params
  )
  return rows
}

/** หมวดที่มีอยู่จริงของ org (นับจำนวนโพสต์ในหมวด) — ไม่มีตาราง lookup หมวดคือค่าที่เคยพิมพ์ไว้ */
export async function listCategories(orgId, userId, { includeAllPersonal = false, visibility = null } = {}) {
  const params = [orgId, userId]
  // ต้องกรอง visibility ให้ตรงกับแท็บที่เปิดอยู่ ไม่งั้นแท็บส่วนตัวจะเห็นหมวดขององค์กร
  // กดแล้วได้ 0 โพสต์ และตัวเลขบนชิปไม่ตรงกับจำนวนการ์ดที่แสดง
  let extra = ''
  if (visibility) { params.push(visibility); extra = ` AND e.visibility = $${params.length}` }
  const { rows } = await pool.query(
    `SELECT e.category, COUNT(*)::int AS post_count, MAX(e.updated_at) AS last_used_at
       FROM post_episodes e
      -- ไม่ต้อง exclude channel_id แล้ว — ชื่อห้องย้ายไป channel_name (2026-07-30)
      -- โพสต์จากดิสฯ ที่คน "จัดหมวดเอง" จึงโผล่ในตัวกรองได้ตามที่ควรเป็น
      WHERE e.org_id = $1 AND e.archived_at IS NULL AND e.category IS NOT NULL
        AND (e.visibility = 'org' OR e.owner_user_id = $2${includeAllPersonal ? ' OR TRUE' : ''})${extra}
      GROUP BY e.category
      ORDER BY MAX(e.updated_at) DESC`,
    params
  )
  return rows
}

export async function getPost(id) {
  const { rows } = await pool.query(
    // org_name — ชื่อองค์กรเจ้าของโพสต์ ใช้เป็นตัวเลือกชื่อผู้พูดในการ์ดคำคม
    // (posts เป็น org-native ไม่มี guild เสมอไป → ห้ามดึงชื่อจาก dc_guilds)
    `SELECT ${COLS}, ${OWNER_NAME} AS owner_name, o.name AS org_name
       FROM post_episodes e
       LEFT JOIN users u ON u.id = e.owner_user_id
       LEFT JOIN orgs o ON o.id = e.org_id
      WHERE e.id = $1`,
    [id]
  )
  return rows[0] || null
}

/**
 * สร้างโพสต์ + snapshot แรกทันที (ต้นฉบับต้องไม่หายแม้บรรณาธิการเข้ามาทับ)
 *
 * `originalRevision` = ฉบับที่ "มาก่อน" เนื้อหาที่กำลังบันทึก — ใช้ตอน AI เรียบเรียง (`ai/compose`)
 * เพื่อเก็บข้อความดิบที่ user พิมพ์เองไว้เป็น revision แรก แล้วค่อยตามด้วยฉบับ AI
 */
export async function createPost({ orgId, ownerUserId, visibility = 'personal', category = null, title = null, body = null, format = null, sourceIdea = null, createdVia = 'manual', originalRevision = null }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO post_episodes
         (org_id, owner_user_id, visibility, category, title, body, format, source_idea, created_via, last_edited_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $2)
       RETURNING id`,
      [orgId, ownerUserId, visibility, category, title, body, format, sourceIdea, createdVia]
    )
    if (originalRevision && (originalRevision.title || originalRevision.body)) {
      // ถอยเวลา 1 วินาที — ทั้ง 2 แถวอยู่ transaction เดียวจึงได้ now() เท่ากันเป๊ะ
      // ในลิสต์ประวัติจะกลายเป็นเวลาเดียวกัน 2 บรรทัด แยกไม่ออกว่าอันไหนต้นฉบับ
      await client.query(
        `INSERT INTO post_revisions (episode_id, title, body, edited_by_user_id, created_at)
         VALUES ($1, $2, $3, $4, now() - interval '1 second')`,
        [rows[0].id, originalRevision.title ?? null, originalRevision.body ?? null, ownerUserId]
      )
    }
    await client.query(
      `INSERT INTO post_revisions (episode_id, title, body, edited_by_user_id) VALUES ($1, $2, $3, $4)`,
      [rows[0].id, title, body, ownerUserId]
    )
    await client.query('COMMIT')
    return await getPost(rows[0].id)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * autosave — เขียนเนื้อหาทับพร้อมเช็ค lock
 *
 * @param {number} id
 * @param {{title?, body?, bodies?, format?, category?}} fields   (undefined = ไม่แตะ)
 * @param {{lockToken:string, editorUserId:number|null, editorName?:string|null}} ctx
 * @returns {{ok:true, post:object} | {ok:false, conflict:true, post:object} | {ok:false, notFound:true}}
 *          conflict = คนอื่นแก้ไปแล้ว → คืนของจริงใน DB ให้ UI ถาม "โหลดใหม่ / เก็บฉบับของฉันเป็น revision"
 */
export async function updatePostContent(id, fields, { lockToken, editorUserId, editorName = null }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // ล็อกแถวไว้ก่อน — กัน 2 request ที่ถือ token เดียวกันผ่านพร้อมกันทั้งคู่
    const { rows: cur } = await client.query(
      `SELECT e.id, e.title, e.body, e.last_edited_by, ${LOCK} AS lock_token
         FROM post_episodes e WHERE e.id = $1 FOR UPDATE`,
      [id]
    )
    const before = cur[0]
    if (!before) { await client.query('ROLLBACK'); return { ok: false, notFound: true } }

    // ⚠️ ไม่มี token = conflict เหมือนกัน **ห้ามปล่อยผ่าน** (bug-071 2026-07-30)
    // เดิมเขียน `if (lockToken && …)` → คำขอที่ไม่ส่ง token มาเลยข้ามด่านนี้ทั้งด่าน
    // editor ส่ง lockToken = null ตอนที่ยังโหลดเนื้อหาไม่เสร็จ (title/body ยังเป็น '')
    // → PATCH ทับโพสต์ให้ว่างเปล่าแล้วตอบ 200 · เนื้อหาหายจริงมาแล้ว 3 ตอน
    if (before.lock_token !== lockToken) {
      await client.query('ROLLBACK')
      return { ok: false, conflict: true, post: await getPost(id) }
    }

    // เปลี่ยนคนแก้ → เก็บของเดิมไว้ก่อนทับ (attribution = คนที่เขียนของเดิมจริงๆ)
    // คนเดิมแก้ต่อ → เก็บทุก REVISION_INTERVAL_MS พอ ไม่งั้น revision บวมจาก autosave
    const changedHands = (before.last_edited_by ?? null) !== (editorUserId ?? null)
    let needRevision = changedHands
    if (!needRevision) {
      const { rows: last } = await client.query(
        `SELECT created_at FROM post_revisions WHERE episode_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id]
      )
      const lastAt = last[0]?.created_at ? new Date(last[0].created_at).getTime() : 0
      needRevision = Date.now() - lastAt > REVISION_INTERVAL_MS
    }
    if (needRevision) {
      await client.query(
        `INSERT INTO post_revisions (episode_id, title, body, edited_by_user_id, edited_by_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, before.title, before.body, before.last_edited_by ?? null, changedHands ? null : editorName]
      )
    }

    const sets = []
    const params = []
    for (const [col, val] of [['title', fields.title], ['body', fields.body], ['format', fields.format], ['category', fields.category]]) {
      if (val === undefined) continue
      params.push(val === '' && col === 'category' ? null : val)   // หมวดว่าง = ถอดออกจากหมวด
      sets.push(`${col} = $${params.length}`)
    }
    if (fields.bodies !== undefined) {
      params.push(fields.bodies === null ? null : JSON.stringify(fields.bodies))
      sets.push(`bodies = $${params.length}::jsonb`)
    }
    params.push(editorUserId ?? null)
    sets.push(`last_edited_by = $${params.length}`)
    params.push(id)

    await client.query(
      `UPDATE post_episodes SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
      params
    )
    await client.query('COMMIT')
    return { ok: true, post: await getPost(id) }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** เปลี่ยนสถานะงานเขียน — draft/review/approved เท่านั้น (เผยแพร่เป็น derived จาก post_social_history) */
export async function setPostStatus(id, status, { approvedBy = null, approvedByName = null } = {}) {
  const approving = status === 'approved'
  await pool.query(
    `UPDATE post_episodes
        SET status = $2,
            approved_by      = ${approving ? '$3' : 'NULL'},
            approved_by_name = ${approving ? '$4' : 'NULL'},
            approved_at      = ${approving ? 'now()' : 'NULL'},
            updated_at = now()
      WHERE id = $1`,
    approving ? [id, status, approvedBy, approvedByName] : [id, status]
  )
  return await getPost(id)
}

/** เปลี่ยนหมวดอย่างเดียว (ลากการ์ดข้ามหมวดในหน้า list — ไม่ต้องผ่าน lock ของ editor) */
export async function setPostCategory(id, category) {
  await pool.query(
    `UPDATE post_episodes SET category = $2, updated_at = now() WHERE id = $1`,
    [id, category || null]
  )
  return await getPost(id)
}

/** เปลี่ยนชื่อหมวดทั้งกอง — ไม่มีตาราง lookup จึงเป็น UPDATE หลายแถว (ต้นทุนที่ยอมรับตอนเคาะ)
 *  ต้อง scope visibility/owner เหมือน listCategories — ไม่งั้นแก้โพสต์ personal ของคนอื่นที่ตัวเองมองไม่เห็นได้ (/scrutinize 2026-08-01)
 *  ห้ามแตะ updated_at — เป็น lock_token ของ editor ด้วย (bug-071) รีเนมทีเดียวหลายแถวจะทำ autosave ของคนอื่นเด้ง 409 */
export async function renameCategory(orgId, userId, from, to, { includeAllPersonal = false } = {}) {
  const { rowCount } = await pool.query(
    `UPDATE post_episodes
        SET category = $4
      WHERE org_id = $1 AND category = $3
        AND (visibility = 'org' OR owner_user_id = $2${includeAllPersonal ? ' OR TRUE' : ''})`,
    [orgId, userId, from, to || null]
  )
  return rowCount
}

/**
 * ปุ่มลบปกติ = เก็บเข้ากรุ (grill ข้อ 6) · undo ได้ด้วย archived = false
 *
 * ⚠️ กู้คืนโพสต์ที่เคยเป็นตะกร้าของห้อง กลับเข้าห้องที่**มีตะกร้าใหม่เปิดอยู่แล้ว** —
 * partial unique index จะบล็อก → **ล้าง `channel_id` ทิ้ง** (กลายเป็นโพสต์บนเว็บธรรมดา)
 * เงียบกว่าและไม่บล็อกคนใช้ ดีกว่าตอบ error ว่า "ห้องนั้นมีตะกร้าเปิดอยู่" (เคาะ 2026-07-30)
 */
export async function archivePost(id, archived = true) {
  if (archived) {
    await pool.query(`UPDATE post_episodes SET archived_at = now(), updated_at = now() WHERE id = $1`, [id])
    return
  }
  await pool.query(
    `UPDATE post_episodes e
        SET archived_at = NULL, updated_at = now(),
            channel_id = CASE WHEN EXISTS (
                           SELECT 1 FROM post_episodes o
                            WHERE o.channel_id = e.channel_id AND o.archived_at IS NULL AND o.id <> e.id
                         ) THEN NULL ELSE e.channel_id END
      WHERE e.id = $1`,
    [id]
  )
}

/** ลบถาวร — ไฟล์สื่อ **ไม่ unlink ที่นี่** (grill ข้อ 6: ให้ scripts/posts/gc-media.js เก็บทีหลัง) */
export async function deletePost(id) {
  await pool.query(`DELETE FROM post_episodes WHERE id = $1`, [id])
}

/** ห้ามลบถาวรถ้ายังมีงานโพสต์ค้างในคิว (grill ข้อ 6) */
export async function hasPendingJobs(id) {
  const { rows } = await pool.query(
    `SELECT 1 FROM post_social_history WHERE episode_id = $1 AND status IN ('pending','running') LIMIT 1`,
    [id]
  )
  return rows.length > 0
}

/** ของที่ทำให้ "เปิดให้ทีมเห็น" ไม่ได้แล้ว (grill ข้อ 1) — คอมเมนต์/อนุมัติ/งานโพสต์ผูกไปแล้ว */
export async function getPostUsage(id) {
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM post_comments       WHERE episode_id = $1) AS has_comments,
            (SELECT approved_at IS NOT NULL FROM post_episodes WHERE id = $1) AS has_approvals,
            EXISTS (SELECT 1 FROM post_social_history WHERE episode_id = $1) AS has_jobs`,
    [id]
  )
  const r = rows[0] || {}
  return { hasComments: !!r.has_comments, hasApprovals: !!r.has_approvals, hasJobs: !!r.has_jobs }
}

/** personal → org ทางเดียว (ย้อนกลับไม่ได้ — ดู canDemoteToPersonal) · เก็บ audit ว่าใครเปิดเมื่อไหร่ */
export async function promoteToOrg(id, byUserId) {
  await pool.query(
    `UPDATE post_episodes
        SET visibility = 'org', visibility_changed_at = now(), visibility_changed_by = $2, updated_at = now()
      WHERE id = $1 AND visibility = 'personal'`,
    [id, byUserId]
  )
  return await getPost(id)
}

export async function listRevisions(episodeId, limit = 30) {
  const { rows } = await pool.query(
    `SELECT r.id, r.title, r.body, r.edited_by_user_id, r.edited_by_name, r.created_at,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), ''), u.username) AS editor_name
       FROM post_revisions r
       LEFT JOIN users u ON u.id = r.edited_by_user_id
      WHERE r.episode_id = $1
      -- id เป็นตัวตัดสินเสมอกัน: 2 revision ที่ insert ใน transaction เดียว (ai/compose = ต้นฉบับ+ฉบับ AI)
      -- ได้ created_at เท่ากันเป๊ะ (now() = เวลาเริ่ม transaction) → ไม่มี tiebreak = ลำดับสลับมั่ว
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $2`,
    [episodeId, limit]
  )
  return rows
}

/** เก็บฉบับของฉันเป็น revision (ทางออกฝั่ง 409 — ไม่ทับของคนอื่น แต่ไม่ทำงานที่พิมพ์ไว้หาย) */
export async function saveRevisionOnly(episodeId, { title, body, editedByUserId = null, editedByName = null }) {
  const { rows } = await pool.query(
    `INSERT INTO post_revisions (episode_id, title, body, edited_by_user_id, edited_by_name)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    [episodeId, title ?? null, body ?? null, editedByUserId, editedByName]
  )
  return rows[0]
}
