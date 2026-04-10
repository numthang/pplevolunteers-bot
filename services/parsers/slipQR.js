/**
 * slipQR.js
 * Decode QR code จากรูปสลิป — jimp@1.x API
 */

const { Jimp }  = require('jimp')
const jsQR      = require('jsqr')
const https     = require('https')
const http      = require('http')

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function decodeQR(imageUrl) {
  const buf = await fetchBuffer(imageUrl)
  const img  = await Jimp.fromBuffer(buf)

  // ลอง scale หลายขนาด + inversion
  // หมายเหตุ: ใช้ Uint8ClampedArray.from() เพื่อ copy buffer ถูกต้อง (jimp@1 bitmap.data เป็น Buffer)
  for (const scale of [1, 2, 0.75]) {
    const w = Math.round(img.bitmap.width  * scale)
    const h = Math.round(img.bitmap.height * scale)
    const scaled = await img.resize({ w, h })
    const { data, width, height } = scaled.bitmap
    const pixels = Uint8ClampedArray.from(data)
    for (const inv of ['dontInvert', 'onlyInvert']) {
      const result = jsQR(pixels, width, height, { inversionAttempts: inv })
      if (result?.data) return result.data
    }
  }

  return null
}

function parseQRPayload(qrString) {
  if (!qrString) return null

  const result = { _raw: qrString }

  // ── KBank ref_id pattern: 016DDDDDDDDDLLL DDDDD (20 chars) ──────────────
  // ฝังอยู่ใน QR ตรงๆ ไม่ใช่ EMV tag 62
  const kbankRef = qrString.match(/016\d{9}[A-Z]{3}\d{5}/)
  if (kbankRef) {
    result.ref_id = kbankRef[0]
    result._source = 'qr_kbank'
    return result
  }

  // ── URL verify slip ──────────────────────────────────────────────────────
  if (qrString.startsWith('http')) {
    try {
      const url = new URL(qrString)
      const pathParts = url.pathname.split('/').filter(Boolean)
      const ref_id = pathParts[pathParts.length - 1] || url.searchParams.get('ref') || null
      return ref_id ? { ref_id, _source: 'qr_url', _raw: qrString } : null
    } catch {
      return null
    }
  }

  // ── EMV tag 54 = amount, tag 62.05 = ref_id ──────────────────────────────
  try {
    let pos = 0
    while (pos < qrString.length) {
      const tag = qrString.slice(pos, pos + 2)
      const len = parseInt(qrString.slice(pos + 2, pos + 4), 10)
      if (isNaN(len)) break
      const val = qrString.slice(pos + 4, pos + 4 + len)
      pos += 4 + len

      if (tag === '54') result.amount = parseFloat(val)
      if (tag === '62') {
        let sp = 0
        while (sp < val.length) {
          const stag = val.slice(sp, sp + 2)
          const slen = parseInt(val.slice(sp + 2, sp + 4), 10)
          if (isNaN(slen)) break
          const sval = val.slice(sp + 4, sp + 4 + slen)
          sp += 4 + slen
          if (stag === '05') result.ref_id = sval
        }
      }
    }
  } catch { /* ignore */ }

  if (!result.ref_id) return null
  result._source = 'qr_emv'
  return result
}

module.exports = { decodeQR, parseQRPayload }
