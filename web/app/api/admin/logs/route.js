import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
const ALLOWED = ['Admin', 'Moderator']

function canViewLogs(roles = []) {
  return ALLOWED.some(r => roles.includes(r))
}
import fs from 'fs'
import path from 'path'

const LOG_FILE = path.join(process.cwd(), '..', 'logs', 'app.log')

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session || !canViewLogs(session.user.roles))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const lines = parseInt(new URL(req.url).searchParams.get('lines') || '200')

  try {
    const text = fs.readFileSync(LOG_FILE, 'utf8')
    const all  = text.split('\n').filter(Boolean)
    return Response.json({ lines: all.slice(-lines) })
  } catch (err) {
    if (err.code === 'ENOENT') return Response.json({ lines: [] })
    return Response.json({ error: err.message }, { status: 500 })
  }
}
