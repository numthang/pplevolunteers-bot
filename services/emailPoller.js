/**
 * emailPoller.js
 * ดึง email แจ้งเตือนจากธนาคาร → insert transaction → แจ้ง Discord
 */

const { ImapFlow }  = require('imapflow')
const { simpleParser } = require('mailparser')
const pool          = require('../db/index')
const kbank         = require('./parsers/kbank')

const POLL_INTERVAL = parseInt(process.env.EMAIL_POLL_INTERVAL || '60000')
const GUILD_ID      = process.env.GUILD_ID

// parsers ที่รองรับ — เพิ่ม parser ใหม่ตรงนี้
const PARSERS = [kbank]

let discordClient = null

function init(client) {
  discordClient = client
  console.log('[emailPoller] init, polling every', POLL_INTERVAL / 1000, 's')
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

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      // ดึงเฉพาะ email ที่ยังไม่ได้อ่าน
      for await (const msg of client.fetch('1:*', { envelope: true, bodyStructure: true }, { uid: false })) {
        if (msg.flags.has('\\Seen')) continue

        const raw = await client.download(msg.seq)
        const parsed = await simpleParser(raw.content)
        const text = parsed.text || ''

        for (const parser of PARSERS) {
          const txn = parser.parse(text)
          if (!txn) continue

          await processTransaction(txn, msg.seq, client)
          break
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (err) {
    console.error('[emailPoller] error:', err.message)
  }
}

async function processTransaction(txn, msgSeq, imapClient) {
  try {
    // หา finance_account ที่ตรงกับ transaction นี้
    const account = await matchAccount(txn)
    if (!account) {
      console.log('[emailPoller] no matching account for ref_id:', txn.ref_id)
      return
    }

    // กำหนด type จากการ match
    // ถ้า counterpart_account ตรงกับบัญชีเรา → income (คนอื่นโอนมาให้เรา)
    // ถ้า from_acct_masked ตรงกับบัญชีเรา → expense (เราโอนออก)
    const type = account._matchType

    // insert transaction (ถ้า ref_id ซ้ำจะ skip เพราะ UNIQUE constraint)
    const [result] = await pool.query(
      `INSERT IGNORE INTO finance_transactions
        (guild_id, account_id, type, amount, description, counterpart_name, counterpart_account, counterpart_bank, fee, balance_after, ref_id, txn_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', NOW())`,
      [
        GUILD_ID,
        account.id,
        type,
        txn.amount,
        type === 'income' ? `รับโอนจาก ${txn.counterpart_name || ''}` : `โอนให้ ${txn.counterpart_name || ''}`,
        txn.counterpart_name,
        txn.counterpart_account,
        txn.counterpart_bank,
        txn.fee,
        txn.balance_after,
        txn.ref_id,
        txn.txn_at || new Date(),
      ]
    )

    if (result.affectedRows === 0) {
      // ref_id ซ้ำ ข้ามไป
      await imapClient.messageFlagsAdd(msgSeq, ['\\Seen'])
      return
    }

    console.log(`[emailPoller] inserted txn ref_id=${txn.ref_id} type=${type} amount=${txn.amount}`)

    // mark email as read
    await imapClient.messageFlagsAdd(msgSeq, ['\\Seen'])

    // แจ้ง Discord
    await notifyDiscord(account, type, txn)

  } catch (err) {
    console.error('[emailPoller] processTransaction error:', err.message)
  }
}

async function matchAccount(txn) {
  const [accounts] = await pool.query(
    `SELECT * FROM finance_accounts WHERE guild_id = ?`,
    [GUILD_ID]
  )

  for (const acc of accounts) {
    const accNo = (acc.account_no || '').replace(/-/g, '')

    // income: เพื่อเข้าบัญชีของเรา
    if (txn.counterpart_account && txn.counterpart_account === accNo) {
      return { ...acc, _matchType: 'income' }
    }

    // expense: โอนจากบัญชีของเรา (masked: xxx-x-x8045-x → last digits)
    if (txn.from_acct_masked) {
      const lastDigits = txn.from_acct_masked.replace(/x|-/gi, '').trim()
      if (lastDigits && accNo.endsWith(lastDigits)) {
        return { ...acc, _matchType: 'expense' }
      }
    }
  }

  return null
}

async function notifyDiscord(account, type, txn) {
  if (!discordClient) return

  try {
    const [cfg] = await pool.query(
      `SELECT channel_id FROM finance_config WHERE guild_id = ?`,
      [GUILD_ID]
    )
    const channelId = cfg[0]?.channel_id
    if (!channelId) return

    const channel = await discordClient.channels.fetch(channelId)
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
        timestamp: txn.txn_at ? txn.txn_at.toISOString() : new Date().toISOString(),
      }]
    })
  } catch (err) {
    console.error('[emailPoller] notifyDiscord error:', err.message)
  }
}

module.exports = { init }
