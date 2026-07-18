/**
 * smsWebhook.js
 * รับ HTTP POST จาก SMS Forwarder app (Android) → parse KBank SMS → insert income → แจ้ง Discord
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

async function handleSmsBulkCallback(req, res) {
	try {
		const url = new URL(req.url, 'http://localhost')
		const transaction = url.searchParams.get('Transaction')
		const status = url.searchParams.get('Status')

		if (!transaction || !status) {
			res.writeHead(400).end(JSON.stringify({ ok: false, reason: 'missing params' }))
			return
		}

		const logStatus = status === 'delivery' ? 'sms_delivered' : 'sms_failed'

		const result = await pool.query(
			`UPDATE calling_logs SET status = $1 WHERE extra->>'message_id' = $2`,
			[logStatus, transaction]
		)

		log.info(`[smsWebhook] /sms-bulk: ${transaction} → ${logStatus} (${result.rowCount} rows)`)
		res.writeHead(200).end(JSON.stringify({ ok: true }))
	} catch (err) {
		log.error('[smsWebhook] /sms-bulk error:', err.message)
		res.writeHead(500).end(JSON.stringify({ ok: false, error: err.message }))
	}
}

async function handleRequest(req, res) {
	const urlPath = (req.url || '/').split('?')[0]

	if (req.method === 'GET' && urlPath === '/thaibulksms') {
		return handleSmsBulkCallback(req, res)
	}

	if (req.method !== 'POST') {
		res.writeHead(405).end('Method Not Allowed')
		return
	}

	let body = ''
	req.on('data', (chunk) => { body += chunk })
	req.on('end', async () => {
		try {
			const payload = JSON.parse(body)

			if (SECRET) {
				const token = payload.token || ''
				if (token !== SECRET) {
					res.writeHead(401).end('Unauthorized')
					return
				}
			}

			const smsText = payload.message || payload.body || payload.sms_body
				|| payload.text || payload.amount || ''

			const from = (payload.from || '').toUpperCase()
			if (from && from !== 'KBANK') {
				res.writeHead(200).end(JSON.stringify({ ok: false, reason: 'sender not KBANK' }))
				return
			}

			const txn = kbankSms.parse(smsText)
			await logIncoming(smsText, !!txn)

			if (!txn) {
				log.warn('[smsWebhook] SMS ไม่ใช่รายการที่รองรับ:', smsText.substring(0, 80))
				res.writeHead(200).end(JSON.stringify({ ok: false, reason: 'unrecognized SMS' }))
				return
			}

			log.info('[smsWebhook] parsed txn:', txn)
			if (txn.type === 'expense') {
				await processSmsExpense(txn)
			} else {
				await processSmsIncome(txn)
			}

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

	const result = await pool.query(
		`INSERT INTO finance_transactions
		  (org_id, account_id, type, amount, description, counterpart_name, fee, balance_after,
		   ref_id, source, txn_at, updated_by, updated_at)
		 VALUES ($1, $2, 'income', $3, $4, $5, $6, $7, $8, 'sms', $9, NULL, NOW())
		 ON CONFLICT DO NOTHING
		 RETURNING id`,
		[
			account.org_id,
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

	if (result.rowCount === 0) {
		log.warn('[smsWebhook] duplicate ref_id, skipping:', txn.ref_id)
		return
	}

	log.info(`[smsWebhook] inserted income ref_id=${txn.ref_id} amount=${txn.amount}`)

	if (account.notify_income) await notifyDiscord(account, txn)
}

async function processSmsExpense(txn) {
	const account = await matchAccount(txn.last_digits)
	if (!account) {
		log.warn('[smsWebhook] expense: ไม่พบบัญชีที่ตรงกับ last_digits:', txn.last_digits)
		return
	}

	const txnAt = new Date(txn.txn_at || new Date())
	const { rows: dup } = await pool.query(
		`SELECT id FROM finance_transactions
		 WHERE account_id = $1 AND amount = $2 AND balance_after = $3 AND balance_after IS NOT NULL
		   AND txn_at BETWEEN $4::timestamp - INTERVAL '5 minutes' AND $4::timestamp + INTERVAL '5 minutes'
		 LIMIT 1`,
		[account.id, txn.amount, txn.balance_after, txnAt]
	)

	if (dup[0]) {
		log.info(`[smsWebhook] expense dup id=${dup[0].id} (email record exists), skipping`)
		await updateIncomingLog(txn.raw, dup[0].id)
		return
	}

	const result = await pool.query(
		`INSERT INTO finance_transactions
		  (org_id, account_id, type, amount, description, balance_after,
		   ref_id, source, txn_at, updated_by, updated_at)
		 VALUES ($1, $2, 'expense', $3, 'เงินออก', $4, $5, 'sms', $6, NULL, NOW())
		 ON CONFLICT DO NOTHING
		 RETURNING id`,
		[account.org_id, account.id, txn.amount, txn.balance_after,
		 txn.ref_id, txn.txn_at || new Date()]
	)

	if (result.rowCount === 0) {
		log.warn('[smsWebhook] expense duplicate ref_id, skipping:', txn.ref_id)
		return
	}

	log.info(`[smsWebhook] inserted expense id=${result.rows[0].id} amount=${txn.amount}`)
	await updateIncomingLog(txn.raw, result.rows[0].id)

	if (account.notify_expense) await notifyDiscord(account, txn)
}

async function logIncoming(rawText, parsed) {
	try {
		await pool.query(
			`INSERT INTO finance_incoming_log (source, raw_text, parsed) VALUES ('sms', $1, $2)`,
			[rawText, parsed ? 1 : 0]
		)
	} catch (err) {
		log.error('[smsWebhook] logIncoming error:', err.message)
	}
}

async function updateIncomingLog(rawText, transactionId) {
	try {
		await pool.query(
			`UPDATE finance_incoming_log SET transaction_id = $1
			 WHERE id = (SELECT id FROM finance_incoming_log
			             WHERE source = 'sms' AND raw_text = $2 AND transaction_id IS NULL
			             ORDER BY created_at DESC LIMIT 1)`,
			[transactionId, rawText]
		)
	} catch (err) {
		log.error('[smsWebhook] updateIncomingLog error:', err.message)
	}
}

async function matchAccount(lastDigits) {
	if (!lastDigits) return null

	const { rows: accounts } = await pool.query(
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
		const { rows: cfg } = await pool.query(
			// finance_config = Discord artifact คง guild-keyed (bot single-guild = env.GUILD_ID)
			`SELECT thread_id, account_ids FROM finance_config WHERE guild_id = $1`,
			[process.env.GUILD_ID]
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
