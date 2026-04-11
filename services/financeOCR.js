/**
 * financeOCR.js
 * รับรูปสลิปจาก Discord → QR decode (primary) → OCR (fallback) → match/merge transaction
 */

const { createWorker } = require('tesseract.js')
const { Jimp } = require('jimp')
const pool   = require('../db/index')
const log    = require('../utils/logger')
const { decodeQR, parseQRPayload } = require('./parsers/slipQR')

const GUILD_ID  = process.env.GUILD_ID
const SLIP_PARSERS = [require('./parsers/kbankSlip'), require('./parsers/scbSlip')]

/**
 * Preprocess รูปก่อน OCR: greyscale + contrast boost
 * ช่วยให้อ่านพื้นหลังสีเขียว/ลายน้ำได้ดีขึ้น
 * คืน Buffer (PNG) สำหรับส่งให้ Tesseract
 */
async function preprocessForOCR(imageUrl) {
  try {
    const { fetchBuffer } = require('./parsers/slipQR')
    const buf = await fetchBuffer(imageUrl)
    const img = await Jimp.fromBuffer(buf)
    img.greyscale().contrast(0.3)
    return await img.getBuffer('image/png')
  } catch {
    return imageUrl  // fallback ใช้ URL ตรง
  }
}

/**
 * เรียกเมื่อมี message ที่มีรูปแนบ — เช็คเองว่าเป็น finance thread หรือเปล่า
 */
async function handleSlipMessage(message) {
  if (!message.guild || message.author.bot) return

  // เช็คว่าอยู่ใน finance thread
  const [cfgRows] = await pool.query(
    `SELECT thread_id FROM finance_config WHERE guild_id = ?`, [GUILD_ID]
  )
  const threadId = cfgRows[0]?.thread_id
  if (!threadId || message.channel.id !== threadId) return

  // หารูปภาพ
  const images = message.attachments.filter(a =>
    a.contentType?.startsWith('image/')
  )
  if (!images.size) return

  const count = images.size
  const reply = await message.reply(`🔍 กำลังอ่านสลิป${count > 1 ? ` ${count} รูป` : ''}...`)

  const results = []
  for (const [, attachment] of images) {
    const result = await processSlipImage(attachment.url, message)
    results.push(result)
  }

  await reply.edit(results.join('\n━━━━━━━━━━━━\n'))
}

async function processSlipImage(imageUrl, message) {
  let worker
  try {
    // ── ขั้น 1: QR decode (เร็วกว่า, แม่นกว่า) ──────────────────────────────
    let slip = null
    let method = 'ocr'

    try {
      const qrString = await decodeQR(imageUrl)
      if (qrString) {
        log.info('[financeOCR] QR raw:', qrString.substring(0, 200))
        const qrData = parseQRPayload(qrString)
        log.info('[financeOCR] QR parsed:', JSON.stringify(qrData))
        if (qrData?.ref_id) {
          slip = await enrichSlipFromOCR(imageUrl, qrData)
          method = 'qr'
        } else {
          log.info('[financeOCR] QR decoded but no ref_id — fallback OCR')
        }
      } else {
        log.info('[financeOCR] QR not found in image — fallback OCR')
      }
    } catch (qrErr) {
      log.info('[financeOCR] QR decode error — fallback OCR:', qrErr.message)
    }

    // ── ขั้น 2: OCR fallback ถ้า QR ล้มเหลว ──────────────────────────────────
    if (!slip) {
      worker = await createWorker(['tha', 'eng'])
      const imgInput = await preprocessForOCR(imageUrl)
      const { data: { text } } = await worker.recognize(imgInput)
      log.info('[financeOCR] OCR text:\n' + text.substring(0, 500))

      for (const parser of SLIP_PARSERS) {
        slip = parser.parse(text)
        if (slip) break
      }
    }

    if (!slip) {
      log.info('[financeOCR] all parsers failed — no slip extracted')
      return '❌ ไม่สามารถอ่านข้อมูลสลิปได้ — ลองส่งรูปที่ชัดขึ้น'
    }

    if (!slip.amount) {
      log.info('[financeOCR] slip parsed but amount=null ref_id=' + slip.ref_id)
      return `⚠️ อ่านจำนวนเงินไม่ได้ (OCR ไม่ชัด)\n` +
             `ref: \`${slip.ref_id}\`\nกรุณาบันทึกรายการเองผ่านเว็บ`
    }

    log.info(`[financeOCR] parsed slip (${method}):`, JSON.stringify(slip))

    const accounts = await matchAccount(slip)
    log.info(`[financeOCR] matchAccount from_digits=${slip.from_digits} to_digits=${slip.to_digits} matched=${accounts.map(a=>a.name+'('+a._matchType+')').join(', ')||'none'}`)
    if (!accounts.length) {
      return `❌ ไม่พบบัญชีที่ตรงกับสลิปนี้ในระบบ\n` +
             `from: \`${slip.from_acct_masked || '-'}\` · to: \`${slip.to_acct_masked || '-'}\``
    }

    const resultLines = []

    for (const account of accounts) {
      // 1) หาด้วย ref_id ก่อน
      let [existing] = await pool.query(
        `SELECT id, description FROM finance_transactions WHERE ref_id = ? AND account_id = ? AND guild_id = ?`,
        [slip.ref_id, account.id, GUILD_ID]
      )

      // 2) fallback: หาด้วย amount + txn_at ±5 นาที (สำหรับ statement rows ที่มี ref_id=NULL)
      // ใช้ local time เพราะ statement เก็บ Bangkok time ไม่ใช่ UTC
      if (!existing.length && slip.txn_at && slip.amount) {
        const d = new Date(slip.txn_at)
        const pad = n => String(n).padStart(2, '0')
        const txnAtStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
        ;[existing] = await pool.query(
          `SELECT id, description FROM finance_transactions
           WHERE account_id = ? AND guild_id = ? AND amount = ?
             AND ABS(TIMESTAMPDIFF(MINUTE, txn_at, ?)) <= 5
             AND ref_id IS NULL`,
          [account.id, GUILD_ID, slip.amount, txnAtStr]
        )
        if (existing.length) log.info(`[financeOCR] matched statement row id=${existing[0].id} by amount+txn_at`)
      }

      if (existing.length) {
        const txn = existing[0]
        const newDesc = slip.memo || txn.description
        await pool.query(
          `UPDATE finance_transactions
           SET ref_id = ?, evidence_url = ?,
               description = ?,
               counterpart_name = COALESCE(counterpart_name, ?),
               discord_msg_id = ?, updated_by = ?, updated_at = NOW()
           WHERE id = ?`,
          [slip.ref_id, message.attachments.first()?.url || null,
           newDesc,
           slip.counterpart_name || null,
           message.id, message.author.id, txn.id]
        )
        log.info(`[financeOCR] merged txn id=${txn.id} ref_id=${slip.ref_id}`)
        resultLines.push(buildReply('✅ รวมกับรายการเดิม', account, slip, txn.id, true))
      } else {
        const type = account._matchType
        const description = slip.memo
          || (type === 'income' ? `รับโอนจาก ${slip.counterpart_name || ''}` : `โอนให้ ${slip.counterpart_name || ''}`)

        const txnAtStr = slip.txn_at
          ? new Date(slip.txn_at).toISOString().slice(0, 19).replace('T', ' ')
          : new Date().toISOString().slice(0, 19).replace('T', ' ')

        const [result] = await pool.query(
          `INSERT INTO finance_transactions
            (guild_id, account_id, type, amount, description, counterpart_name, counterpart_bank,
             ref_id, discord_msg_id, txn_at, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [GUILD_ID, account.id, type, slip.amount, description,
           slip.counterpart_name || null, slip.bank || null,
           slip.ref_id, message.id, txnAtStr, message.author.id]
        )
        log.info(`[financeOCR] inserted txn id=${result.insertId} ref_id=${slip.ref_id} type=${type}`)
        resultLines.push(buildReply('✅ บันทึกรายการใหม่', account, slip, result.insertId, false))
      }
    }

    return resultLines.join('\n─────────────\n')
  } catch (err) {
    log.error('[financeOCR] error:', err.message)
    return '❌ เกิดข้อผิดพลาดขณะอ่านสลิป: ' + err.message
  } finally {
    await worker?.terminate()
  }
}

/**
 * มี QR data แล้ว แต่ยัง OCR เพิ่มเพื่อเอา from/to digits, memo, counterpart_name
 * merge ข้อมูลเข้ากัน โดย QR data มี priority สูงกว่า
 */
async function enrichSlipFromOCR(imageUrl, qrData) {
  let worker
  try {
    worker = await createWorker(['tha', 'eng'])
    const imgInput = await preprocessForOCR(imageUrl)
    const { data: { text } } = await worker.recognize(imgInput)
    log.info('[financeOCR] enrich OCR text:\n' + text.substring(0, 400))

    let ocrSlip = null
    for (const parser of SLIP_PARSERS) {
      ocrSlip = parser.parse(text)
      if (ocrSlip) break
    }

    if (!ocrSlip) {
      // OCR ล้มเหลว แต่ QR สำเร็จ — คืนข้อมูล QR ที่มี
      return {
        ref_id: qrData.ref_id,
        amount: qrData.amount || null,
        fee: null, memo: null, txn_at: null,
        from_digits: null, to_digits: null,
        from_acct_masked: null, to_acct_masked: null,
        counterpart_name: null, bank: 'กสิกรไทย',
      }
    }

    // merge: QR ref_id และ amount มี priority สูงกว่า OCR
    return {
      ...ocrSlip,
      ref_id: qrData.ref_id,
      amount: qrData.amount ?? ocrSlip.amount,
    }
  } finally {
    await worker?.terminate()
  }
}

async function matchAccount(slip) {
  const [accounts] = await pool.query(
    `SELECT * FROM finance_accounts WHERE guild_id = ?`, [GUILD_ID]
  )

  const matches = []

  for (const acc of accounts) {
    const accNo = (acc.account_no || '').replace(/-/g, '')

    if (slip.from_digits && accNo.includes(slip.from_digits)) {
      matches.push({ ...acc, _matchType: 'expense' })
    } else if (slip.to_digits && accNo.includes(slip.to_digits)) {
      matches.push({ ...acc, _matchType: 'income' })
    }
  }

  return matches
}

function buildReply(header, account, slip, txnId, merged) {
  const sign = account._matchType === 'income' ? '+' : '-'
  const lines = [
    `${header} · \`#${txnId}\``,
    `💳 **${account.name}** (${account._matchType === 'income' ? 'รายรับ' : 'รายจ่าย'})`,
    `💰 \`${sign}${slip.amount?.toLocaleString('th-TH')} ฿\``,
  ]
  if (slip.memo)             lines.push(`📝 ${slip.memo}`)
  if (slip.counterpart_name) lines.push(`👤 ${slip.counterpart_name}`)
  if (!merged)               lines.push(`🔢 \`${slip.ref_id}\``)
  return lines.join('\n')
}

module.exports = { handleSlipMessage }
