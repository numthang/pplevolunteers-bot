/**
 * financeOCR.js
 * รับรูปสลิปจาก Discord → OCR → match/merge transaction
 */

const { createWorker } = require('tesseract.js')
const pool   = require('../db/index')
const log    = require('../utils/logger')

const GUILD_ID  = process.env.GUILD_ID
const SLIP_PARSERS = [require('./parsers/kbankSlip')]

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
    worker = await createWorker(['tha', 'eng'])
    const { data: { text } } = await worker.recognize(imageUrl)
    log.info('[financeOCR] OCR text:\n' + text.substring(0, 500))

    let slip = null
    for (const parser of SLIP_PARSERS) {
      slip = parser.parse(text)
      if (slip) break
    }

    if (!slip) return '❌ ไม่สามารถอ่านข้อมูลสลิปได้ — ลองส่งรูปที่ชัดขึ้น'

    log.info('[financeOCR] parsed slip:', JSON.stringify(slip))

    const accounts = await matchAccount(slip)
    if (!accounts.length) {
      return `❌ ไม่พบบัญชีที่ตรงกับสลิปนี้ในระบบ\n` +
             `from: \`${slip.from_acct_masked || '-'}\` · to: \`${slip.to_acct_masked || '-'}\``
    }

    const resultLines = []

    for (const account of accounts) {
      const [existing] = await pool.query(
        `SELECT id, description FROM finance_transactions WHERE ref_id = ? AND account_id = ? AND guild_id = ?`,
        [slip.ref_id, account.id, GUILD_ID]
      )

      if (existing.length) {
        const txn = existing[0]
        const newDesc = slip.memo && !txn.description ? slip.memo : txn.description
        await pool.query(
          `UPDATE finance_transactions
           SET description = ?, discord_msg_id = ?, updated_by = ?, updated_at = NOW()
           WHERE id = ?`,
          [newDesc, message.id, message.author.id, txn.id]
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

async function matchAccount(slip) {
  const [accounts] = await pool.query(
    `SELECT * FROM finance_accounts WHERE guild_id = ?`, [GUILD_ID]
  )

  // สลิปอาจ match ได้ 2 บัญชีพร้อมกัน (expense + income) คืน array
  const matches = []

  for (const acc of accounts) {
    const accNo = (acc.account_no || '').replace(/-/g, '')

    if (slip.from_digits && accNo.includes(slip.from_digits)) {
      matches.push({ ...acc, _matchType: 'expense' })
    } else if (slip.to_digits && accNo.includes(slip.to_digits)) {
      matches.push({ ...acc, _matchType: 'income' })
    }
  }

  return matches  // [] = ไม่พบ, [1] = พบ 1 บัญชี, [2] = transfer ภายใน
}

function buildReply(header, account, slip, txnId, merged) {
  const sign = account._matchType === 'income' ? '+' : '-'
  const lines = [
    `${header} · \`#${txnId}\``,
    `💳 **${account.name}** (${account._matchType === 'income' ? 'รายรับ' : 'รายจ่าย'})`,
    `💰 \`${sign}${slip.amount?.toLocaleString('th-TH')} ฿\``,
  ]
  if (slip.memo)            lines.push(`📝 ${slip.memo}`)
  if (slip.counterpart_name) lines.push(`👤 ${slip.counterpart_name}`)
  if (!merged)              lines.push(`🔢 \`${slip.ref_id}\``)
  return lines.join('\n')
}

module.exports = { handleSlipMessage }
