/**
 * ล้างข้อมูลรับเงินของสมาชิกใน org_members (ธนาคาร/เลขบัญชี/พร้อมเพย์/ชื่อเจ้าของบัญชี)
 *
 * ใช้เมื่อข้อมูลไปอยู่ผิดคน — เคสจริง 2026-09-18: import xlsx เขียนเลขบัญชีของ @pang_pp69
 * ลงให้ @pang_piya ด้วย (ชื่อเล่นซ้ำ "แป้ง") → ถ้าไม่ล้าง รอบจ่ายจะโอนเข้าบัญชีผิดคนแบบเงียบๆ
 *
 * ล้างทุกแถวของ user ใน org (org_members มีแถวละ guild) — ไม่งั้นแต่ละ guild เห็นข้อมูลไม่ตรงกัน
 * หน้า /finance/payouts จะขึ้นธงแดง "ข้อมูลไม่ครบ" ให้เอง ซึ่งดีกว่าโอนผิดบัญชี
 *
 * รัน:
 *   node --import ./scripts/smoke/_envload.mjs scripts/finance/clearBankInfo.mjs --users 3895           # dry-run
 *   node --import ./scripts/smoke/_envload.mjs scripts/finance/clearBankInfo.mjs --users 3895 --apply
 */

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const pg = require('pg')

const args = process.argv.slice(2)
const flagValue = flag => (args.includes(flag) ? String(args[args.indexOf(flag) + 1] ?? '') : '')
const APPLY = args.includes('--apply')
const ORG_ID = Number(flagValue('--org')) || 1
const USERS = flagValue('--users').split(',').map(s => Number(s.trim())).filter(Boolean)

if (!USERS.length) {
  console.error('usage: clearBankInfo.mjs --users <user_id[,user_id…]> [--apply] [--org 1]')
  process.exit(1)
}

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'pple_volunteers',
})

const tail = v => (v ? `…${String(v).replace(/\D/g, '').slice(-4)}` : null)

const { rows: before } = await pool.query(
  `SELECT om.user_id, u.username, om.guild_id, om.account_holder, om.bank_code, om.account_no, om.promptpay_id
     FROM org_members om JOIN users u ON u.id = om.user_id
    WHERE om.org_id = $1 AND om.user_id = ANY($2::int[])
    ORDER BY om.user_id, om.guild_id`,
  [ORG_ID, USERS]
)

console.log(`พบ ${before.length} แถว (${new Set(before.map(r => r.user_id)).size} คน)`)
for (const r of before) {
  console.log(`  #${r.user_id} @${r.username} guild ${r.guild_id}: ${r.account_holder || '-'} · ${r.bank_code || '-'} · ${tail(r.account_no) || tail(r.promptpay_id) || '-'}`)
}

if (!APPLY) {
  console.log('\n(dry-run — ใส่ --apply เพื่อล้างจริง)')
  await pool.end()
  process.exit(0)
}

const { rowCount } = await pool.query(
  `UPDATE org_members
      SET account_holder = NULL, bank_name = NULL, bank_code = NULL,
          account_no = NULL, promptpay_id = NULL, payment_method = 'bank'
    WHERE org_id = $1 AND user_id = ANY($2::int[])`,
  [ORG_ID, USERS]
)
const { rows: after } = await pool.query(
  `SELECT count(*) FILTER (WHERE account_no IS NOT NULL OR promptpay_id IS NOT NULL OR account_holder IS NOT NULL) AS left_over
     FROM org_members WHERE org_id = $1 AND user_id = ANY($2::int[])`,
  [ORG_ID, USERS]
)
console.log(`\nDone: ล้าง ${rowCount} แถว · เหลือแถวที่ยังมีข้อมูล ${after[0].left_over}`)
await pool.end()
