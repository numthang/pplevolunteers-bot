/**
 * smsWebhook.js
 * รับ HTTP POST จาก SMS Forwarder app (Android) → parse KBank SMS → insert income → แจ้ง Discord
 *
 * ENV:
 *   SMS_WEBHOOK_PORT   = 3099   (default)
 *   SMS_WEBHOOK_SECRET = <token>  (required — ใส่ใน Authorization: Bearer <token>)
 */

const http   = require('http')
const pool   = require('../db/index')
const kbankSms = require('./parsers/kbankSms')
const log    = require('../utils/logger')

const PORT   = parseInt(process.env.SMS_WEBHOOK_PORT || '3099')
const SECRET = process.env.SMS_WEBHOOK_SECRET

let discordClient = null

function init(client) {
	discordClient = client
	const server = http.createServer(handleRequest)
	server.listen(PORT, () => {
		log.info(`[smsWebhook] listening on port ${PORT}`)
	})
}

async function handleRequest(req, res) {
	if (req.method !== 'POST') {
		res.writeHead(405).end('Method Not Allowed')
		return
	}

	// auth
	if (SECRET) {
		const auth = req.headers['authorization'] || ''
		const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
		if (token !== SECRET) {
			res.writeHead(401).end('Unauthorized')
			return
		}
	}

	let body = ''
	req.on('data', (chunk) => { body += chunk })
	req.on('end', async () => {
		try {
			const payload = JSON.parse(body)

			// รองรับหลาย field name ที่ SMS Forwarder แต่ละตัวส่งมา
			const smsText = payload.message || payload.body || payload.sms_body
				|| payload.text || payload.amount || ''

			const from = (payload.from || '').toUpperCase()
			if (from && from !== 'KBANK') {
				res.writeHead(200).end(JSON.stringify({ ok: false, reason: 'sender not KBANK' }))
				return
			}

			const txn = kbankSms.parse(smsText)
			if (!txn) {
				log.warn('[smsWebhook] SMS ไม่ใช่รายการโอนเข้า KBank:', smsText.substring(0, 80))
				res.writeHead(200).end(JSON.stringify({ ok: false, reason: 'not income SMS' }))
				return
			}

			log.info('[smsWebhook] parsed txn:', txn)
			await processSmsIncome(txn)

			res.writeHead(200).end(JSON.stringify({ ok: true, ref_id: txn.ref_id }))
		} catch (err) {
			log.error('[smsWebhook] error:', err.message)
			res.writeHead(500).end(JSON.stringify({ ok: false, error: err.message }))
		}
	})
}

async function processSmsIncome(txn) {
	const account = await matchAccount(txn.last_digits)
	if (!account) {
		log.warn('[smsWebhook] ไม่พบบัญชีที่ตรงกับ last_digits:', txn.last_digits)
		return
	}

	const description = `รับโอนจาก ${txn.counterpart_name || ''}`.trim()

	const [result] = await pool.query(
		`INSERT IGNORE INTO finance_transactions
		  (guild_id, account_id, type, amount, description, counterpart_name, fee, balance_after,
		   ref_id, source, txn_at, updated_by, updated_at)
		 VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?, 'sms', ?, 'system', NOW())`,
		[
			account.guild_id,
			account.id,
			txn.amount,
			description,
			txn.counterpart_name,
			txn.fee,
			txn.balance_after,
			txn.ref_id,
			txn.txn_at || new Date(),
		]
	)

	if (result.affectedRows === 0) {
		log.warn('[smsWebhook] duplicate ref_id, skipping:', txn.ref_id)
		return
	}

	log.info(`[smsWebhook] inserted income ref_id=${txn.ref_id} amount=${txn.amount}`)

	if (account.notify_income) await notifyDiscord(account, txn)
}

async function matchAccount(lastDigits) {
	if (!lastDigits) return null

	const [accounts] = await pool.query(
		`SELECT * FROM finance_accounts WHERE bank = 'กสิกรไทย' AND archived = 0`
	)

	for (const acc of accounts) {
		const accNo = (acc.account_no || '').replace(/-/g, '')
		if (accNo.endsWith(lastDigits)) return acc
	}

	return null
}

async function notifyDiscord(account, txn) {
	if (!discordClient) return

	try {
		const [cfg] = await pool.query(
			`SELECT thread_id, account_ids FROM finance_config WHERE guild_id = ?`,
			[account.guild_id]
		)
		const threadId = cfg[0]?.thread_id
		if (!threadId) return

		const accountIds = cfg[0]?.account_ids ? cfg[0].account_ids.split(',').map(Number) : []
		if (accountIds.length && !accountIds.includes(account.id)) return

		const channel = await discordClient.channels.fetch(threadId)
		if (!channel) return

		await channel.send({ content: txn.raw })
	} catch (err) {
		log.error('[smsWebhook] notifyDiscord error:', err.message)
	}
}

module.exports = { init }
