import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join, basename, resolve } from 'path'

const ASSETS_DIR = join(process.cwd(), '..', 'assets', 'watermark')
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

function userDir(discordId) {
  return join(ASSETS_DIR, `user_${discordId}`)
}

function safePath(discordId, filename) {
  const dir      = userDir(discordId)
  const safe     = basename(filename)
  const resolved = resolve(join(dir, safe))
  if (!resolved.startsWith(resolve(dir) + '/') && resolved !== resolve(dir)) return null
  return resolved
}

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const filePath = safePath(session.user.discordId, params.filename)
  if (!filePath || !existsSync(filePath)) return new Response('Not Found', { status: 404 })

  const ext  = params.filename.split('.').pop().toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'
  const buf  = await readFile(filePath)
  return new Response(buf, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const filePath = safePath(session.user.discordId, params.filename)
  if (!filePath || !existsSync(filePath)) return Response.json({ error: 'Not Found' }, { status: 404 })

  await unlink(filePath)
  return Response.json({ ok: true })
}
