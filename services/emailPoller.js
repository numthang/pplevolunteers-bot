/**
 * emailPoller.js
 * ดึง email แจ้งเตือนจากธนาคาร → insert transaction → แจ้ง Discord
 */

const { ImapFlow }  = require('imapflow')
const { simpleParser } = require('mailparser')
const pool          = require('../db/index')
const kbank         = require('./parsers/kbank')
const kbankSms      = require('./parsers/kbankSms')
const log           = require('../utils/logger')

const POLL_INTERVAL = parseInt(process.env.EMAIL_POLL_INTERVAL || '60000')

// parsers ที่รองรับ — เพิ่ม parser ใหม่ตรงนี้
const PARSERS = [kbank, kbankSms]

let discordClient = null

function init(client) {
  discordClient = client
  log.info('[emailPoller] init, polling every', POLL_INTERVAL / 1000, 's')
  poll()
  setInterval(poll, POLL_INTERVAL)
}

async function poll() {
  if (!process.env.EMAIL_IMAP_HOST) return
  const client = new ImapFlow({
    host:   process.env.EMAIL_IMAP_HOST,
    port:   parseInt(process.env.EMAIL_IMAP_PORT || '993'),
    secure: true,
    auth: {
      user: process.env.EMAIL_IMAP_USER,
      pass: process.env.EMAIL_IMAP_PASS,
    },
    logger: false,
  })

  client.on('error', (err) => {
    log.error('[emailPoller] imap error:', err.message)
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      const kbankUids  = await client.search({ seen: false, from: 'kplus@kasikornbank.com' }, { uid: true })
      const taskerUids = await client.search({ seen: false, subject: '[Tasker]' }, { uid: true })
      const uids = [...new Set([...kbankUids, ...taskerUids])]

      if (uids.length) {
        log.info('[emailPoller] found uids:', uids.length)
        const seenUids = []

        for await (const msg of client.fetch(uids, { flags: true, source: true }, { uid: true })) {
          if (msg.flags?.has('\\Seen')) continue

          const parsed = await simpleParser(Buffer.from(msg.source))
          const text = parsed.text || ''

          for (const parser of PARSERS) {
            const txn = parser.parse(text)
            log.info('[emailPoller] parse result:', txn)
            if (!txn) continue

            await processTransaction(txn, text)
            break
          }
          seenUids.push(msg.uid)
        }

        if (seenUids.length) {
          log.info('[emailPoller] marking as seen:', seenUids.length, 'messages')
          await client.messageFlagsAdd(seenUids, ['\\Seen'], { uid: true })
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (err) {
    log.error('[emailPoller] error:', err.message)
  }
}

async function processTransaction(txn, rawText) {
  try {
    const account = await matchAccount(txn)
    if (!account) {
      log.warn('[emailPoller] no matching account for ref_id:', txn.ref_id,
        '\n  from_acct_masked:', txn.from_acct_masked,
        '\n  counterpart_account:', txn.counterpart_account,
        '\n  bank:', txn.bank,
        '\n--- raw email ---\n' + (rawText || '').substring(0, 800) + '\n---')
      return
    }

    if (account._matchType === 'internal') {
      await insertTransaction(txn, account.expenseAcc, 'expense', txn.balance_after)
      // ref_id ของ income ตั้งให้ตรงกับ smsWebhook format → INSERT IGNORE dedup อัตโนมัติ
      const last4    = account.incomeAcc.account_no.slice(-4)
      const refDate  = (txn.txn_at || '').replace(/[-: ]/g, '').substring(0, 12) || Date.now().toString()
      const smsRefId = `SMS-${last4}-${refDate}`
      await insertTransaction({ ...txn, ref_id: smsRefId }, account.incomeAcc, 'income', null)
      return
    }

    // balance_after จาก KBank email คือยอดของบัญชีต้นทาง (FROM) เสมอ
    const balanceAfter = account._matchType === 'expense' ? txn.balance_after : null
    await insertTransaction(txn, account, account._matchType, balanceAfter)

  } catch (err) {
    log.error('[emailPoller] processTransaction error:', err.message)
  }
}

async function insertTransaction(txn, account, type, balanceAfter) {
  const description = (() => {
    const base = type === 'income' ? `รับโอนจาก ${txn.counterpart_name || ''}` : `โอนให้ ${txn.counterpart_name || ''}`
    return txn.merchant_ref ? `${base} · ${txn.merchant_ref}` : base
  })()

  const [result] = await pool.query(
    `INSERT IGNORE INTO finance_transactions
      (guild_id, account_id, type, amount, description, counterpart_name, counterpart_account, counterpart_bank, fee, balance_after, ref_id, txn_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', NOW())`,
    [
      account.guild_id,
      account.id,
      type,
      txn.amount,
      description,
      txn.counterpart_name,
      txn.counterpart_account,
      txn.counterpart_bank,
      txn.fee,
      balanceAfter,
      txn.ref_id,
      txn.txn_at || new Date(),
    ]
  )

  if (result.affectedRows === 0) {
    log.warn('[emailPoller] duplicate ref_id+account, skipping:', txn.ref_id, account.id)
    return
  }

  log.info(`[emailPoller] inserted txn ref_id=${txn.ref_id} type=${type} amount=${txn.amount} account=${account.id}`)

  const shouldNotify = type === 'income' ? account.notify_income : account.notify_expense
  if (shouldNotify) await notifyDiscord(account, type, txn)
}

async function matchAccount(txn) {
  const [accounts] = await pool.query(
    `SELECT * FROM finance_accounts WHERE archived = 0`
  )

  let incomeAcc = null
  let expenseAcc = null

  for (const acc of accounts) {
    const accNo = (acc.account_no || '').replace(/-/g, '')

    if (!incomeAcc && txn.counterpart_account && txn.counterpart_account === accNo) {
      incomeAcc = acc
    }

    // SMS transaction: last_digits = ผู้รับเงิน (income) เช่น "4882"
    if (!incomeAcc && txn.last_digits && accNo.endsWith(txn.last_digits)) {
      incomeAcc = acc
    }

    if (!expenseAcc && txn.from_acct_masked) {
      const lastDigits = txn.from_acct_masked.replace(/x|-/gi, '').trim()
      if (lastDigits && accNo.includes(lastDigits)) {
        expenseAcc = acc
      }
    }
  }

  // internal transfer: ทั้งต้นทางและปลายทางอยู่ในระบบ
  if (incomeAcc && expenseAcc) {
    return { _matchType: 'internal', incomeAcc, expenseAcc }
  }

  if (expenseAcc) return { ...expenseAcc, _matchType: 'expense' }
  if (incomeAcc)  return { ...incomeAcc,  _matchType: 'income' }

  return null
}

async function notifyDiscord(account, type, txn) {
  if (!discordClient) return

  try {
    const [cfg] = await pool.query(
      `SELECT thread_id, account_ids FROM finance_config WHERE guild_id = ?`,
      [account.guild_id]
    )
    const threadId  = cfg[0]?.thread_id
    if (!threadId) return

    // ถ้า thread กำหนด account_ids ไว้ → เช็คว่าบัญชีนี้อยู่ในนั้นด้วย
    const accountIds = cfg[0]?.account_ids ? cfg[0].account_ids.split(',').map(Number) : []
    if (accountIds.length && !accountIds.includes(account.id)) return

    const channel = await discordClient.channels.fetch(threadId)
    if (!channel) return

    const sign  = type === 'income' ? '+' : '-'
    const color = type === 'income' ? 0x22c55e : 0xef4444
    const label = type === 'income' ? 'รายรับ' : 'รายจ่าย'

    await channel.send({
      embeds: [{
        color,
        title: `💸 ${label} — ${account.name}`,
        fields: [
          { name: 'จำนวน',     value: `${sign}${txn.amount?.toLocaleString('th-TH')} ฿`, inline: true },
          { name: 'คู่โอน',    value: txn.counterpart_name  || '—', inline: true },
          { name: 'ธนาคาร',   value: txn.counterpart_bank  || '—', inline: true },
          { name: 'เลขที่',    value: txn.ref_id             || '—', inline: false },
          ...(txn.balance_after != null ? [{ name: 'ยอดคงเหลือ', value: `${txn.balance_after.toLocaleString('th-TH')} ฿`, inline: true }] : []),
        ],
        timestamp: txn.txn_at ? new Date(txn.txn_at).toISOString() : new Date().toISOString(),
      }]
    })
  } catch (err) {
    log.error('[emailPoller] notifyDiscord error:', err.message)
  }
}

module.exports = { init }
