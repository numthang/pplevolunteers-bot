import { spawnSync } from 'child_process'
import fs from 'fs'

// path หา binary ต่างกันทุก platform — Linux (prod, apt) ต่างจาก Mac (brew/LibreOffice.app)
// `which` หาให้อัตโนมัติก่อน ถ้าไม่เจอค่อย fallback ไป path ที่รู้จัก
const CANDIDATES = {
  libreoffice: [
    '/usr/bin/libreoffice',
    '/usr/bin/soffice',
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ],
  pdftoppm: [
    '/usr/bin/pdftoppm',
    '/opt/homebrew/bin/pdftoppm',
    '/usr/local/bin/pdftoppm',
  ],
}

const cache = {}

function which(name) {
  const result = spawnSync('which', [name])
  if (result.status === 0) {
    const out = result.stdout.toString().trim()
    return out || null
  }
  return null
}

/** หา absolute path ของ binary ('libreoffice' | 'pdftoppm') — cache ผลไว้ในโปรเซส, null ถ้าไม่เจอเลย */
export function resolveBinary(name) {
  if (name in cache) return cache[name]

  const whichNames = name === 'libreoffice' ? ['soffice', 'libreoffice'] : [name]
  for (const wn of whichNames) {
    const found = which(wn)
    if (found) return (cache[name] = found)
  }

  for (const candidate of CANDIDATES[name] ?? []) {
    if (fs.existsSync(candidate)) return (cache[name] = candidate)
  }

  return (cache[name] = null)
}
