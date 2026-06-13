import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isSuperAdmin } from '@/lib/roles.js'
import { getAdminGuildIds, getGuilds } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import pool from '@/db/index.js'
import { writeFile, mkdir, unlink, readdir, readFile } from 'fs/promises'
import { existsSync, statSync, readdirSync } from 'fs'
import { join } from 'path'

const ASSETS_DIR = join(process.cwd(), '..', 'assets', 'watermark')
const IMG_RE      = /\.(png|jpe?g|webp)$/i
const SNOWFLAKE   = /^\d{15,20}$/
const MAX_FILES   = 15
const MAX_SIZE    = 5 * 1024 * 1024
const ALLOWED_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

// กลุ่ม "public" ของ guild เท่านั้น (whitelist สำหรับ validate path segment)
// private group = ลายน้ำอยู่ใน personal folder (user_<id>/) ตาม isPersonalGroup ใน basketHandler
// → จัดการที่หน้า /bot/media/settings (ส่วนตัว) ไม่ใช่ระดับ guild
async function getGuildGroups(guildId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT group_name FROM dc_social_accounts
     WHERE guild_id = $1 AND group_name IS NOT NULL AND group_name <> ''
       AND visibility = 'public'
     ORDER BY group_name`,
    [guildId]
  )
  return rows.map(r => r.group_name)
}

// auth: superadmin หรือ admin ของ guild นั้น + guild_id ถูก format
async function authGuild(guildId) {
  const session = await getServerSession(authOptions)
  if (!session) return { error: 'Unauthorized', status: 401 }
  if (!SNOWFLAKE.test(guildId || '')) return { error: 'invalid guild_id', status: 400 }
  if (isSuperAdmin(session.user.discordId)) return { ok: true }
  const adminGuildIds = await getAdminGuildIds(session.user.discordId)
  if (!adminGuildIds.includes(guildId)) return { error: 'Forbidden', status: 403 }
  return { ok: true }
}

// คืน path โฟลเดอร์เป้าหมาย — group ต้องผ่าน whitelist เท่านั้น ('' = guild root)
async function targetDir(guildId, group) {
  if (!group) return join(ASSETS_DIR, guildId)
  const groups = await getGuildGroups(guildId)
  if (!groups.includes(group)) return null // กัน path traversal — group ต้องมีจริง
  return join(ASSETS_DIR, guildId, group)
}

function listImgs(dir) {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir).filter(f => IMG_RE.test(f) && statSync(join(dir, f)).isFile())
  } catch { return [] }
}

// GET (ไม่มี guild_id) → { guilds: [{guild_id, name}] } รายการ guild ที่จัดการได้
// GET ?guild_id= → { groups, files: { '<group>': [...] , '': [...root] } }
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const guildId = searchParams.get('guild_id')

  if (!guildId) {
    const session = await getServerSession(authOptions)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const currentGuildId = await getGuildId(session)
    // superadmin เห็นทุก guild, admin เห็นเฉพาะ guild ที่ตัวเองมี role Admin
    if (isSuperAdmin(session.user.discordId)) {
      const all = await getGuilds()
      return Response.json({ currentGuildId, guilds: all.map(g => ({ guild_id: g.guild_id, name: g.name })) })
    }
    const ids = await getAdminGuildIds(session.user.discordId)
    const all = ids.length ? await getGuilds() : []
    const nameById = Object.fromEntries(all.map(g => [g.guild_id, g.name]))
    return Response.json({ currentGuildId, guilds: ids.map(id => ({ guild_id: id, name: nameById[id] || id })) })
  }

  const auth = await authGuild(guildId)
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

  // raw image serving — preview รูปในหน้าเว็บ: ?guild_id=&group=&file=&raw=1
  const rawFile = searchParams.get('file')
  if (rawFile && searchParams.get('raw')) {
    const dir = await targetDir(guildId, searchParams.get('group') || '')
    if (!dir || rawFile.includes('/') || rawFile.includes('..') || !IMG_RE.test(rawFile)) {
      return Response.json({ error: 'invalid file' }, { status: 400 })
    }
    const full = join(dir, rawFile)
    if (!existsSync(full)) return Response.json({ error: 'not found' }, { status: 404 })
    const ext = rawFile.match(IMG_RE)[1].toLowerCase()
    const ct  = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const buf = await readFile(full)
    return new Response(buf, { headers: { 'Content-Type': ct, 'Cache-Control': 'no-store' } })
  }

  const groups = await getGuildGroups(guildId)
  const files = { '': listImgs(join(ASSETS_DIR, guildId)) }
  for (const g of groups) files[g] = listImgs(join(ASSETS_DIR, guildId, g))

  const { rows: defRows } = await pool.query(
    `SELECT key, value FROM dc_guild_config
     WHERE guild_id = $1 AND (key = 'default_watermark' OR key LIKE 'default_watermark_group:%')`,
    [guildId]
  )
  const defaults = {}
  for (const r of defRows) {
    if (r.key === 'default_watermark') defaults[''] = r.value
    else defaults[r.key.slice('default_watermark_group:'.length)] = r.value
  }

  return Response.json({ groups, files, defaults })
}

// POST multipart: guild_id, group, file
export async function POST(req) {
  const form = await req.formData()
  const guildId = form.get('guild_id')
  const group   = form.get('group') || ''
  const file    = form.get('file')

  const auth = await authGuild(guildId)
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

  const dir = await targetDir(guildId, group)
  if (!dir) return Response.json({ error: 'invalid group' }, { status: 400 })
  if (!file) return Response.json({ error: 'No file' }, { status: 400 })

  const mime = file.type?.split(';')[0].trim()
  if (!ALLOWED_MIME[mime]) return Response.json({ error: 'ไฟล์ต้องเป็น PNG, JPG หรือ WebP เท่านั้น' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  if (bytes.byteLength > MAX_SIZE) return Response.json({ error: 'ไฟล์ต้องไม่เกิน 5 MB' }, { status: 400 })

  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
  const existing = (await readdir(dir)).filter(f => IMG_RE.test(f))
  if (existing.length >= MAX_FILES) {
    return Response.json({ error: `อัปโหลดได้สูงสุด ${MAX_FILES} ไฟล์ต่อโฟลเดอร์` }, { status: 400 })
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

// PATCH { guild_id, group, default_watermark } — ตั้ง/ล้าง default ต่อ group
export async function PATCH(req) {
  const { guild_id: guildId, group, default_watermark } = await req.json()
  const auth = await authGuild(guildId)
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

  let key
  if (!group) {
    key = 'default_watermark'
  } else {
    const groups = await getGuildGroups(guildId)
    if (!groups.includes(group)) return Response.json({ error: 'invalid group' }, { status: 400 })
    key = `default_watermark_group:${group}`
  }

  if (!default_watermark || default_watermark === 'none') {
    await pool.query(`DELETE FROM dc_guild_config WHERE guild_id = $1 AND "key" = $2`, [guildId, key])
  } else {
    await pool.query(
      `INSERT INTO dc_guild_config (guild_id, "key", value)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [guildId, key, JSON.stringify(default_watermark)]
    )
  }
  return Response.json({ ok: true })
}

// DELETE ?guild_id=&group=&file=
export async function DELETE(req) {
  const { searchParams } = new URL(req.url)
  const guildId = searchParams.get('guild_id')
  const group   = searchParams.get('group') || ''
  const file    = searchParams.get('file') || ''

  const auth = await authGuild(guildId)
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

  const dir = await targetDir(guildId, group)
  if (!dir) return Response.json({ error: 'invalid group' }, { status: 400 })

  // file ต้องเป็นชื่อไฟล์ล้วน (กัน ../) + เป็นรูป
  if (!file || file.includes('/') || file.includes('..') || !IMG_RE.test(file)) {
    return Response.json({ error: 'invalid file' }, { status: 400 })
  }
  const full = join(dir, file)
  if (existsSync(full)) await unlink(full)
  return Response.json({ ok: true })
}
