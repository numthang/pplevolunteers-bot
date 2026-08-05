// web/db/posts/assets.js — คลังภาพ (post_assets)
//
// ต่างจาก `media.js` ตรงที่นี่คือ **วัตถุดิบที่ตั้งใจเก็บ ไม่มี retention** ส่วนสื่อแนบโพสต์
// โดน `services/postsRetention.js` ลบไฟล์ 30/180 วันหลังเผยแพร่ → คนละ lifecycle คนละตาราง
//
// ⛔ หยิบรูปจากคลังไปใช้ = **คัดลอกไฟล์เป็น uuid ใหม่** (ดู /api/posts/[id]/media/from-asset)
//    ห้ามเอา path ของ asset ไปใส่ post_episode_media.path ตรงๆ — DELETE ของสื่อโพสต์ลบไฟล์จริง
//    จะลากไฟล์ในคลังหายไปด้วย · สายสัมพันธ์เก็บที่ `post_episode_media.source_asset_id` แทน
import pool from '../index.js'

const COLS = `id, org_id, owner_user_id, visibility, path, mime, width, height, bytes, sha256,
              title, tags, consent_note, usable_until, created_at, updated_at`

export const MAX_TAGS = 10

/**
 * แท็กต้อง normalize ตอนเขียนเสมอ — ไม่งั้นแตกเป็น "ราชบุรี" กับ "ราชบุรี " แล้วชิปกรองไม่ตรงกัน
 * รับได้ทั้ง string ("a, b") และ array · lower เฉพาะอังกฤษ (ไทยไม่มีตัวพิมพ์)
 */
export function normalizeTags(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(',')
  const out = []
  for (const t of raw) {
    const tag = String(t).trim().toLowerCase().slice(0, 40)
    if (tag && !out.includes(tag)) out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/**
 * รายการรูปในคลังที่คนนี้เห็นได้ + จำนวนครั้งที่ถูกใช้
 * @param {object} p
 * @param {number} p.orgId
 * @param {number|null} p.userId       users.id ของ session (null ตอน debug mode → เห็นแต่กองกลาง)
 * @param {'all'|'personal'|'org'} [p.pile]
 * @param {'recent'|'unused'} [p.view]
 * @param {string} [p.q]               ค้นจากชื่อ
 * @param {string} [p.tag]
 * @param {boolean} [p.isAdmin]        god-mode: เห็นกองส่วนตัวของคนอื่นด้วย
 */
export async function listAssets({ orgId, userId, pile = 'all', view = 'recent', q = null, tag = null, isAdmin = false, limit = 200, offset = 0 }) {
  const where = ['a.org_id = $1']
  const args = [orgId]

  // มองเห็นได้ = กองกลาง หรือ กองตัวเอง (admin เห็นหมด)
  if (!isAdmin) {
    args.push(userId)
    where.push(`(a.visibility = 'org' OR a.owner_user_id = $${args.length})`)
  }

  if (pile === 'org') where.push(`a.visibility = 'org'`)
  if (pile === 'personal') {
    args.push(userId)
    where.push(`a.visibility = 'personal' AND a.owner_user_id = $${args.length}`)
  }

  if (q) {
    args.push(`%${q}%`)
    where.push(`a.title ILIKE $${args.length}`)
  }
  if (tag) {
    args.push([tag])
    where.push(`a.tags && $${args.length}::text[]`)
  }
  // "ยังไม่เคยใช้" — ไม่มีโพสต์ไหนหยิบไปทำสำเนา
  if (view === 'unused') {
    where.push(`NOT EXISTS (SELECT 1 FROM post_episode_media m WHERE m.source_asset_id = a.id)`)
  }

  args.push(limit, offset)
  const { rows } = await pool.query(
    `SELECT ${COLS},
            (SELECT COUNT(*)::int FROM post_episode_media m WHERE m.source_asset_id = a.id) AS used_count
       FROM post_assets a
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args
  )
  return rows
}

export async function getAsset(id) {
  const { rows } = await pool.query(`SELECT ${COLS} FROM post_assets a WHERE id = $1`, [id])
  return rows[0] || null
}

/** dedupe — **ในกองของคนนี้เท่านั้น** ไฟล์เดียวกันคนละเจ้าของ = คนละใบ (กันแชร์ข้าม tenant) */
export async function findAssetByHash(orgId, ownerUserId, sha256) {
  if (!sha256) return null
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM post_assets a WHERE org_id = $1 AND owner_user_id = $2 AND sha256 = $3`,
    [orgId, ownerUserId, sha256]
  )
  return rows[0] || null
}

/** มี asset ที่ชี้ไฟล์นี้ไหม — ใช้กันไม่ให้ path ของคลังไหลไปเป็น bg_path ของการ์ดคำคม */
export async function findAssetByPath(path) {
  const { rows } = await pool.query(`SELECT id FROM post_assets WHERE path = $1 LIMIT 1`, [path])
  return rows[0] || null
}

export async function createAsset({
  orgId, ownerUserId, visibility = 'personal', path, mime,
  width = null, height = null, bytes = null, sha256 = null,
  title = null, tags = [], consentNote = null, usableUntil = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO post_assets (org_id, owner_user_id, visibility, path, mime, width, height, bytes, sha256,
                              title, tags, consent_note, usable_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12,$13)
     RETURNING ${COLS}`,
    [orgId, ownerUserId, visibility, path, mime, width, height, bytes, sha256,
     title, tags, consentNote, usableUntil]
  )
  return rows[0]
}

/** แก้เฉพาะฟิลด์ที่ส่งมา — undefined = ไม่แตะ (autosave ฝั่ง UI ส่งทีละช่องได้) */
export async function updateAsset(id, { title, tags, consentNote, usableUntil, visibility }) {
  const sets = []
  const args = [id]
  const put = (col, val, cast = '') => {
    args.push(val)
    sets.push(`${col} = $${args.length}${cast}`)
  }
  if (title !== undefined) put('title', title)
  if (tags !== undefined) put('tags', tags, '::text[]')
  if (consentNote !== undefined) put('consent_note', consentNote)
  if (usableUntil !== undefined) put('usable_until', usableUntil)
  if (visibility !== undefined) put('visibility', visibility)
  if (!sets.length) return getAsset(id)

  const { rows } = await pool.query(
    `UPDATE post_assets SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
    args
  )
  return rows[0] || null
}

/** คืน path ไว้ให้ route ลบไฟล์ต่อ — สำเนาที่โพสต์ถืออยู่เป็นคนละไฟล์ ไม่กระทบ */
export async function deleteAsset(id) {
  const { rows } = await pool.query(`DELETE FROM post_assets WHERE id = $1 RETURNING path`, [id])
  return rows[0] || null
}

/** "รูปนี้ถูกใช้ที่ไหนบ้าง" — ตอบจาก source_asset_id ไม่ใช่จาก path ที่แชร์กัน */
export async function listAssetUsage(assetId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.status, e.visibility, m.created_at
       FROM post_episode_media m
       JOIN post_episodes e ON e.id = m.episode_id
      WHERE m.source_asset_id = $1
      ORDER BY m.created_at DESC`,
    [assetId]
  )
  return rows
}

/** แท็กทั้งหมดที่คนนี้เห็น + จำนวนรูป — ใช้ทำแถบชิปกรอง */
export async function listAssetTags({ orgId, userId, isAdmin = false }) {
  const args = [orgId]
  let visible = ''
  if (!isAdmin) {
    args.push(userId)
    visible = `AND (a.visibility = 'org' OR a.owner_user_id = $2)`
  }
  const { rows } = await pool.query(
    `SELECT tag, COUNT(*)::int AS n
       FROM post_assets a, unnest(a.tags) AS tag
      WHERE a.org_id = $1 ${visible}
      GROUP BY tag
      ORDER BY n DESC, tag
      LIMIT 50`,
    args
  )
  return rows
}
