import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

const ALLOWED = ['Admin', 'Moderator']

function canViewLogs(roles = []) {
  return ALLOWED.some(r => roles.includes(r))
}

// PM2 log dir: /home/www/.pm2/logs/ หรือ ~/.pm2/logs/
const PM2_LOG_DIR = path.join(os.homedir(), '.pm2', 'logs')

// รายการ source ให้เลือก
const SOURCES = {
  'bot-out':   { file: path.join(PM2_LOG_DIR, 'pple-dcbot-out.log'),   label: 'Bot stdout' },
  'bot-err':   { file: path.join(PM2_LOG_DIR, 'pple-dcbot-error.log'), label: 'Bot stderr' },
  'web-out':   { file: path.join(PM2_LOG_DIR, 'pple-web-out.log'),     label: 'Web stdout' },
  'web-err':   { file: path.join(PM2_LOG_DIR, 'pple-web-error.log'),   label: 'Web stderr' },
  'app':       { file: path.join(process.cwd(), '..', 'logs', 'app.log'), label: 'App log (emailPoller)' },
}

function readTail(filePath, maxLines) {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    const lines = text.split('\n').filter(Boolean)
    return { lines: lines.slice(-maxLines), error: null }
  } catch (err) {
    if (err.code === 'ENOENT') return { lines: [], error: null }
    return { lines: [], error: err.message }
  }
}

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session || !canViewLogs(session.user.roles))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const p      = new URL(req.url).searchParams
  const maxLines = parseInt(p.get('lines') || '300')
  const source   = p.get('source') || 'bot-out'

  // ถ้า source = 'all' รวมทุกไฟล์เรียงตามเวลา
  if (source === 'all') {
    const all = []
    for (const [key, { file }] of Object.entries(SOURCES)) {
      const { lines } = readTail(file, maxLines)
      lines.forEach(l => all.push({ source: key, line: l }))
    }
    // sort by timestamp prefix ถ้ามี
    all.sort((a, b) => a.line.localeCompare(b.line))
    return Response.json({
      lines: all.slice(-maxLines).map(x => `[${x.source}] ${x.line}`),
      sources: Object.entries(SOURCES).map(([k, v]) => ({ key: k, label: v.label })),
    })
  }

  const src = SOURCES[source]
  if (!src) return Response.json({ error: 'Unknown source' }, { status: 400 })

  const { lines, error } = readTail(src.file, maxLines)
  return Response.json({
    lines,
    error,
    sources: Object.entries(SOURCES).map(([k, v]) => ({ key: k, label: v.label })),
  })
}
