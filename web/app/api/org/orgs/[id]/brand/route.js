// GET/POST/PATCH/DELETE /api/org/orgs/[id]/brand — อัตลักษณ์ขององค์กร: ลายน้ำ + สี CI + สไตล์การ์ด
//
// ย้ายมาจาก /api/bot/guild-watermarks + /api/bot/quote-config (2026-08-10)
// สิ่งที่เปลี่ยน: scope เป็น org (ไม่ใช่ guild) · gate เป็น owner ของ org (ไม่ใช่ Discord admin)
// สิ่งที่ **ห้ามทิ้ง** จากของเดิม: เพดานไฟล์/ขนาด, whitelist ชื่อกลุ่มกัน path traversal,
//   ชื่อไฟล์ที่ sanitize แล้ว, และ raw preview ที่ไม่ยอมให้ '/' หรือ '..' หลุดเข้ามา
import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import { setOrgConfig, deleteOrgConfig } from '@/db/orgConfig.js'
import { QUOTE_STYLE_KEYS, normalizeStyle } from '@/lib/quoteStyles.js'
import pool from '@/db/index.js'
import { writeFile, mkdir, readdir, readFile, unlink } from 'fs/promises'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ASSETS_DIR = join(process.cwd(), '..', 'assets', 'watermark')
const IMG_RE = /\.(png|jpe?g|webp)$/i
const MAX_FILES = 15
const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

async function ownerGate(params) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return { error: 'unauthorized', status: 401 }
  const orgId = Number((await params).id)
  const m = await getOrgMembership(orgId, userId)
  if (!m || m.status !== 'active' || m.role !== 'owner') return { error: 'forbidden', status: 403 }
  return { orgId }
}

/** กลุ่มโซเชียลของ org — เป็น whitelist ของชื่อโฟลเดอร์ด้วย ห้าม trust ค่าจาก client */
async function orgGroups(orgId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT group_name FROM dc_social_accounts
      WHERE org_id = $1 AND group_name IS NOT NULL AND group_name <> ''
        AND visibility = 'public'
      ORDER BY group_name`,
    [orgId]
  )
  return rows.map(r => r.group_name)
}

async function targetDir(orgId, group) {
  if (!group) return join(ASSETS_DIR, `org_${orgId}`)
  const groups = await orgGroups(orgId)
  if (!groups.includes(group)) return null
  return join(ASSETS_DIR, `org_${orgId}`, group)
}

function listImgs(dir) {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir).filter(f => IMG_RE.test(f) && statSync(join(dir, f)).isFile()).sort()
  } catch { return [] }
}

const QUOTE_KEYS = ['quote_default_template', 'quote_ci_accent']

export async function GET(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const { searchParams } = new URL(req.url)

  // preview รูปในหน้าเว็บ: ?group=&file=&raw=1
  const rawFile = searchParams.get('file')
  if (rawFile && searchParams.get('raw')) {
    const dir = await targetDir(g.orgId, searchParams.get('group') || '')
    if (!dir || rawFile.includes('/') || rawFile.includes('..') || !IMG_RE.test(rawFile)) {
      return Response.json({ error: 'invalid file' }, { status: 400 })
    }
    const full = join(dir, rawFile)
    if (!existsSync(full)) return Response.json({ error: 'not found' }, { status: 404 })
    const ext = rawFile.match(IMG_RE)[1].toLowerCase()
    const ct = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return new Response(await readFile(full), { headers: { 'Content-Type': ct, 'Cache-Control': 'no-store' } })
  }

  const groups = await orgGroups(g.orgId)
  const files = { '': listImgs(join(ASSETS_DIR, `org_${g.orgId}`)) }
  for (const name of groups) files[name] = listImgs(join(ASSETS_DIR, `org_${g.orgId}`, name))

  const { rows } = await pool.query(
    `SELECT key, value FROM org_config
      WHERE org_id = $1
        AND (key = 'default_watermark' OR key LIKE 'default_watermark_group:%' OR key = ANY($2))`,
    [g.orgId, QUOTE_KEYS]
  )
  const defaults = {}
  const quote = {}
  for (const r of rows) {
    if (r.key === 'default_watermark') defaults[''] = r.value
    else if (r.key.startsWith('default_watermark_group:')) defaults[r.key.slice('default_watermark_group:'.length)] = r.value
    else quote[r.key] = r.value
  }

  return Response.json({ groups, files, defaults, quote, styles: QUOTE_STYLE_KEYS })
}

// POST multipart: group, file
export async function POST(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const form = await req.formData()
  const dir = await targetDir(g.orgId, form.get('group') || '')
  if (!dir) return Response.json({ error: 'ไม่รู้จักกลุ่มนี้' }, { status: 400 })

  const file = form.get('file')
  if (!file) return Response.json({ error: 'ไม่ได้แนบไฟล์' }, { status: 400 })

  const mime = file.type?.split(';')[0].trim()
  if (!ALLOWED_MIME[mime]) return Response.json({ error: 'ไฟล์ต้องเป็น PNG, JPG หรือ WebP เท่านั้น' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  if (bytes.byteLength > MAX_SIZE) return Response.json({ error: 'ไฟล์ต้องไม่เกิน 5 MB' }, { status: 400 })

  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
  const existing = (await readdir(dir)).filter(f => IMG_RE.test(f))
  if (existing.length >= MAX_FILES) {
    return Response.json({ error: `อัปโหลดได้สูงสุด ${MAX_FILES} ไฟล์ต่อกลุ่ม` }, { status: 400 })
  }

  const safe = (file.name || 'watermark').replace(/[^a-zA-Z0-9ก-๙._-]/g, '_').slice(0, 80)
  const base = safe.replace(/\.[^.]+$/, '') || 'watermark'
  const filename = `${base}.${ALLOWED_MIME[mime]}`
  if (existsSync(join(dir, filename))) {
    return Response.json({ error: `ไฟล์ชื่อ "${filename}" มีอยู่แล้ว` }, { status: 409 })
  }

  await writeFile(join(dir, filename), Buffer.from(bytes))
  return Response.json({ filename })
}

/**
 * PATCH — ตั้งค่าของ org
 *   { group, default_watermark }              ตั้ง/ล้างลายน้ำ default ของกลุ่ม ('' = ค่ากลางของ org)
 *   { quote_default_template, quote_ci_accent } สไตล์การ์ด + สี CI
 */
export async function PATCH(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const body = await req.json().catch(() => ({}))

  if ('default_watermark' in body) {
    let key = 'default_watermark'
    if (body.group) {
      const groups = await orgGroups(g.orgId)
      if (!groups.includes(body.group)) return Response.json({ error: 'ไม่รู้จักกลุ่มนี้' }, { status: 400 })
      key = `default_watermark_group:${body.group}`
    }
    const v = body.default_watermark
    if (!v || v === 'none') await deleteOrgConfig(g.orgId, key)
    else await setOrgConfig(g.orgId, key, String(v))
  }

  if (body.quote_default_template !== undefined) {
    const v = String(body.quote_default_template || '')
    if (v && !QUOTE_STYLE_KEYS.includes(normalizeStyle(v))) {
      return Response.json({ error: 'ไม่รู้จักสไตล์นี้' }, { status: 400 })
    }
    if (v) await setOrgConfig(g.orgId, 'quote_default_template', v)
    else await deleteOrgConfig(g.orgId, 'quote_default_template')
  }

  if (body.quote_ci_accent !== undefined) {
    const v = String(body.quote_ci_accent || '')
    if (v && !/^#[0-9a-fA-F]{6}$/.test(v)) return Response.json({ error: 'สีต้องเป็น #rrggbb' }, { status: 400 })
    if (v) await setOrgConfig(g.orgId, 'quote_ci_accent', v)
    else await deleteOrgConfig(g.orgId, 'quote_ci_accent')
  }

  return Response.json({ ok: true })
}

// DELETE ?group=&file=
export async function DELETE(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const { searchParams } = new URL(req.url)
  const dir = await targetDir(g.orgId, searchParams.get('group') || '')
  if (!dir) return Response.json({ error: 'ไม่รู้จักกลุ่มนี้' }, { status: 400 })

  const file = searchParams.get('file') || ''
  if (!file || file.includes('/') || file.includes('..') || !IMG_RE.test(file)) {
    return Response.json({ error: 'ชื่อไฟล์ไม่ถูกต้อง' }, { status: 400 })
  }
  const full = join(dir, file)
  if (!existsSync(full)) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })

  await unlink(full)
  return Response.json({ ok: true })
}
