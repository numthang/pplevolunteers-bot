/**
 * logger.js — simple file logger that mirrors console.log to logs/app.log
 * Usage: const log = require('./utils/logger')
 *        log.info('hello', { foo: 'bar' })
 *        log.error('something broke', err)
 */

const fs   = require('fs')
const path = require('path')

const LOG_DIR  = path.join(__dirname, '..', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'app.log')
const MAX_BYTES = 5 * 1024 * 1024  // 5 MB — rotate when exceeded

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

function rotate() {
  try {
    const stat = fs.statSync(LOG_FILE)
    if (stat.size > MAX_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.1')
    }
  } catch (_) {}
}

function stringify(args) {
  return args.map(a => {
    if (a === null || a === undefined) return String(a)
    if (a instanceof Error) return a.stack || a.message
    if (typeof a === 'object') {
      try { return JSON.stringify(a, null, 2) } catch (_) { return String(a) }
    }
    return String(a)
  }).join(' ')
}

function write(level, args) {
  const ts   = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const line = `[${ts}] [${level}] ${stringify(args)}\n`

  // mirror to terminal
  if (level === 'ERROR') process.stderr.write(line)
  else process.stdout.write(line)

  // write to file
  rotate()
  try { fs.appendFileSync(LOG_FILE, line) } catch (_) {}
}

const logger = {
  info:  (...args) => write('INFO',  args),
  warn:  (...args) => write('WARN',  args),
  error: (...args) => write('ERROR', args),
  debug: (...args) => write('DEBUG', args),
}

module.exports = logger
