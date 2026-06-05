import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isSuperAdmin } from '@/lib/roles.js'
import { getAdminGuildIds } from '@/db/guilds.js'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

const ASSETS_DIR = join(process.cwd(), '..', 'assets', 'watermark')
const IMG_RE = /\.(png|jpe?g|webp)$/i
const SNOWFLAKE = /^\d{15,20}$/

function stripExt(f) {
  return f.split('/').pop().replace(/\.[^.]+$/, '').replace(/^\d+\.?\s*/, '')
}

// top-level files + ลง subfolder 1 ชั้น (ตรงกับ listFilesRec ใน handlers/quoteHandler.js)
function listFilesRec(dir) {
  const out = []
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.isFile() && IMG_RE.test(e.name)) out.push(e.name)
    else if (e.isDirectory()) {
      try {
        for (const f of readdirSync(join(dir, e.name)).filter(x => IMG_RE.test(x)))
          out.push(`${e.name}/${f}`)
      } catch { /* skip */ }
    }
  }
  return out
}
// top-level only (สำหรับ global — ไม่ดึงไฟล์ในโฟลเดอร์ guild/user)
function listTopLevel(dir) {
  try { return readdirSync(dir).filter(f => IMG_RE.test(f)) } catch { return [] }
}

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const scope    = searchParams.get('scope')
  const guildId  = searchParams.get('guild_id')
  const discordId = session.user.discordId

  let files = []
  let prefix = 'guild'

  if (scope === 'personal') {
    prefix = 'personal'
    files = listFilesRec(join(ASSETS_DIR, `user_${discordId}`))
  } else if (scope === 'guild') {
    if (!SNOWFLAKE.test(guildId || '')) return Response.json({ error: 'invalid guild_id' }, { status: 400 })
    const superAdmin = isSuperAdmin(discordId)
    if (!superAdmin) {
      const adminGuildIds = await getAdminGuildIds(discordId)
      if (!adminGuildIds.includes(guildId)) return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    // guild default = ไฟล์ flat ของ guild เท่านั้น (ไม่ลง subfolder ตาม group)
    // เพราะ value 'guild:<file>' ต้องไม่มี '/' ไม่งั้น basket resolve ผิด (group dimension)
    // group watermark เป็น basket-internal จัดการแยก ไม่ใช่ default ระดับ guild
    const guildDir = join(ASSETS_DIR, guildId)
    files = listTopLevel(existsSync(guildDir) ? guildDir : ASSETS_DIR)
  } else if (scope === 'global') {
    if (!isSuperAdmin(discordId)) return Response.json({ error: 'Forbidden' }, { status: 403 })
    files = listTopLevel(ASSETS_DIR)
  } else {
    return Response.json({ error: 'invalid scope' }, { status: 400 })
  }

  // value ตรง format ที่ bot resolveWatermarkPath เข้าใจ: "<prefix>:<relpath>"
  const choices = files.slice(0, 50).map(f => ({ value: `${prefix}:${f}`, label: stripExt(f) }))
  return Response.json(choices)
}
