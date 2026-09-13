/**
 * Backfill ข้อมูลรับเงินของสมาชิก (ธนาคาร/เลขบัญชี/พร้อมเพย์) จากไฟล์ xlsx
 *
 * ใช้กับระบบจ่ายเบี้ยเลี้ยง (/finance/payouts) — ไฟล์โอนออกไม่ได้ถ้าคนในรอบไม่มีข้อมูลรับเงิน
 *
 * ⛔ ไฟล์ข้อมูลมีเลขบัญชี + เบอร์โทร + ชื่อจริงของคนจำนวนมาก — **ห้าม commit เข้า repo**
 *    repo นี้เป็น public · ดู .gitignore ท้ายไฟล์ §ข้อมูลส่วนบุคคล
 *    วิธีใช้บน prod: ก๊อปไฟล์ขึ้นเครื่องแล้วรันที่นั่น (ไฟล์ไม่ต้องเดินผ่าน git)
 *
 * ⚠️ ทำเป็น scripts/ ไม่ใช่ migration — ต้องรันซ้ำได้เมื่อแก้ไฟล์แล้วรันใหม่
 *    (node-pg-migrate จำว่า "รันแล้ว" ถาวร)
 *
 * คอลัมน์ที่อ่าน (ชื่อหัวตารางต้องตรง):
 *   discord username · แก้เป็น username นี้ 👉 · discord_id
 *   เลขบัญชี/พร้อมเพย์ · รหัสธนาคาร · วิธีรับเงิน · ชื่อจริง (ที่ให้มา)
 *   ถ้ามีค่าในช่อง "แก้เป็น username นี้ 👉" จะชนะ username/discord_id ที่ระบบเดาไว้เสมอ
 *
 * รัน:
 *   node --import ./scripts/smoke/_envload.mjs scripts/finance/backfillBankInfo.mjs <file.xlsx>           # dry-run
 *   node --import ./scripts/smoke/_envload.mjs scripts/finance/backfillBankInfo.mjs <file.xlsx> --apply   # เขียนจริง
 *   … --org 1     ระบุ org (ค่าเริ่มต้น 1)
 */

import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(import.meta.url)
// xlsx เป็น CJS — ต้องผ่าน createRequire (ลอก pattern จาก scripts/import/kanbanFromAppflowy.mjs)
const XLSX = require('xlsx')
const pg = require('pg')

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const APPLY = args.includes('--apply')
const ORG_ID = Number(args[args.indexOf('--org') + 1]) || 1

if (!file) {
  console.error('usage: backfillBankInfo.mjs <file.xlsx> [--apply] [--org 1]')
  process.exit(1)
}

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'pple_volunteers',
})

const digits = v => String(v ?? '').replace(/\D/g, '')
const col = (row, ...names) => {
  for (const n of names) {
    const key = Object.keys(row).find(k => k.trim().startsWith(n))
    if (key && String(row[key]).trim()) return String(row[key]).trim()
  }
  return ''
}

const wb = XLSX.readFile(file)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
console.log(`อ่าน ${rows.length} แถวจาก ${path.basename(file)} · org ${ORG_ID} · ${APPLY ? '⚠️ APPLY (เขียนจริง)' : 'DRY-RUN'}\n`)

const skipped = []
const ambiguous = []
const planned = []

for (const r of rows) {
  const label = col(r, 'ชื่อเล่น') || '(ไม่มีชื่อเล่น)'
  const acct = digits(col(r, 'เลขบัญชี'))
  if (!acct) { skipped.push([label, 'ไม่มีเลขบัญชี']); continue }

  const isPromptpay = col(r, 'วิธีรับเงิน').includes('พร้อมเพย์')
  const bankCode = digits(col(r, 'รหัสธนาคาร')).padStart(3, '0')

  if (!isPromptpay && bankCode.length !== 3) { skipped.push([label, 'ไม่มีรหัสธนาคาร']); continue }
  if (isPromptpay && ![10, 13].includes(acct.length)) { skipped.push([label, `เลขพร้อมเพย์ ${acct.length} หลัก`]); continue }

  // ช่องแก้มือชนะเสมอ — เป็นคำตอบสุดท้ายจากคนที่รู้จักตัวจริง
  const fixUser = col(r, 'แก้เป็น username', 'แก้ discord')
  const username = fixUser || col(r, 'discord username')
  const discordId = fixUser ? '' : digits(col(r, 'discord_id'))

  if (!username && !discordId) { skipped.push([label, 'ไม่มี username/discord_id']); continue }

  const { rows: found } = await pool.query(
    `SELECT DISTINCT u.id, u.username, u.discord_id, u.firstname, u.lastname
       FROM users u JOIN org_members om ON om.user_id = u.id AND om.org_id = $3
      WHERE ($1 <> '' AND lower(u.username) = lower($1))
         OR ($2 <> '' AND u.discord_id = $2)`,
    [username, discordId, ORG_ID]
  )

  if (found.length === 0) { skipped.push([label, `ไม่พบผู้ใช้ @${username || discordId}`]); continue }
  if (found.length > 1)   { ambiguous.push([label, found.map(f => `@${f.username}(${f.id})`).join(' / ')]); continue }

  planned.push({
    label,
    user: found[0],
    payment_method: isPromptpay ? 'promptpay' : 'bank',
    bank_code: isPromptpay ? null : bankCode,
    account_no: isPromptpay ? null : acct,
    promptpay_id: isPromptpay ? acct : null,
    account_holder: col(r, 'ชื่อจริง (ที่ให้มา)') || null,
  })
}

for (const p of planned) {
  const dest = p.payment_method === 'promptpay'
    ? `พร้อมเพย์ ${p.promptpay_id}`
    : `ธนาคาร ${p.bank_code} ${p.account_no}`
  console.log(`  ✓ ${p.label.padEnd(12)} @${(p.user.username || '').padEnd(22)} → ${dest}`)
}

if (ambiguous.length) {
  console.log('\n⚠️ username ตรงหลายคน — ข้ามไว้ ต้องระบุ discord_id แทน')
  for (const [l, d] of ambiguous) console.log(`  ${l}: ${d}`)
}
if (skipped.length) {
  console.log('\n— ข้าม —')
  for (const [l, why] of skipped) console.log(`  ${l}: ${why}`)
}

console.log(`\nสรุป: เขียนได้ ${planned.length} · กำกวม ${ambiguous.length} · ข้าม ${skipped.length}`)

if (!APPLY) {
  console.log('\n(dry-run — ใส่ --apply เพื่อเขียนจริง)')
  await pool.end()
  process.exit(0)
}

// ⚠️ org_members มีหลายแถวต่อ user (แถวละ guild) — เขียนทุกแถวของ user นั้นใน org นี้
//    ไม่งั้นหน้าจอที่หยิบคนละ guild จะเห็นข้อมูลไม่ตรงกัน
let updated = 0
for (const p of planned) {
  const { rowCount } = await pool.query(
    `UPDATE org_members
        SET payment_method = $1, bank_code = $2, account_no = $3, promptpay_id = $4,
            bank_name = COALESCE($5, bank_name),
            account_holder = COALESCE(account_holder, $6)
      WHERE user_id = $7 AND org_id = $8`,
    [p.payment_method, p.bank_code, p.account_no, p.promptpay_id,
     null, p.account_holder, p.user.id, ORG_ID]
  )
  updated += rowCount
}

const { rows: after } = await pool.query(
  `SELECT COUNT(DISTINCT user_id)::int AS people
     FROM org_members
    WHERE org_id = $1 AND COALESCE(account_no, promptpay_id) IS NOT NULL`, [ORG_ID])

console.log(`\n✅ เขียนแล้ว ${updated} แถว (${planned.length} คน)`)
console.log(`   ตอนนี้มีข้อมูลรับเงินทั้งหมด ${after[0].people} คนใน org ${ORG_ID}`)
await pool.end()
