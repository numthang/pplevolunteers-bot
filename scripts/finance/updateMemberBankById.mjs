/**
 * อัพเดทบัญชีธนาคาร (payment_method/bank_code/bank_name/account_no/account_holder)
 * ให้สมาชิกทีละคนด้วย discord_id ตรงๆ — ใช้กับเคสแก้มือ 1-2 คน (ไฟล์ xlsx ทั้งชีตใช้ backfillBankInfo.mjs แทน)
 *
 * รัน:
 *   node --import ./scripts/smoke/_envload.mjs scripts/finance/updateMemberBankById.mjs           # dry-run
 *   node --import ./scripts/smoke/_envload.mjs scripts/finance/updateMemberBankById.mjs --apply    # เขียนจริง
 */
import pg from 'pg'
const { bankByCode } = await import('../../web/config/banks.js')

const APPLY = process.argv.includes('--apply')
const ORG_ID = 1

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'pple_volunteers',
})

const PEOPLE = [
  { label: 'Namfon',      discord_id: '1528301547891593306', account_holder: 'ธิดารัตน์', bank_code: '004', account_no: '0758765113' },
  { label: 'Pang',        discord_id: '1470429716707016715', account_holder: 'ชุดาภรณ์', bank_code: '004', account_no: '1431280899' },
  { label: 'tractor2270', discord_id: '649588517420400650',  account_holder: 'พีรสิทธิ์', bank_code: '004', account_no: '1878923290' },
]

console.log(`org ${ORG_ID} · ${APPLY ? '⚠️ APPLY (เขียนจริง)' : 'DRY-RUN'}\n`)

for (const p of PEOPLE) {
  const bank = bankByCode(p.bank_code)
  if (!bank) { console.log(`  ✗ ${p.label}: รหัสธนาคาร ${p.bank_code} ไม่อยู่ในตาราง web/config/banks.js`); continue }

  const { rows: found } = await pool.query(
    `SELECT u.id, u.username, u.discord_id, u.firstname, u.lastname
       FROM users u WHERE u.discord_id = $1`,
    [p.discord_id]
  )
  if (found.length === 0) { console.log(`  ✗ ${p.label}: ไม่พบ user discord_id=${p.discord_id}`); continue }
  const user = found[0]

  const { rows: before } = await pool.query(
    `SELECT id, guild_id, bank_name, bank_code, account_no, account_holder, payment_method
       FROM org_members WHERE user_id = $1 AND org_id = $2`,
    [user.id, ORG_ID]
  )
  if (before.length === 0) { console.log(`  ✗ ${p.label}: ไม่พบแถว org_members (user_id=${user.id}, org=${ORG_ID})`); continue }

  console.log(`  ✓ ${p.label.padEnd(8)} @${user.username || '(no username)'} (user_id=${user.id}) → ${bank.name} ${p.account_no} · ผู้ถือ "${p.account_holder}"`)
  for (const row of before) {
    console.log(`      แถว id=${row.id} guild_id=${row.guild_id || 'NULL'} เดิม: ${row.bank_name || '-'} ${row.account_no || '-'} (${row.account_holder || '-'})`)
  }

  if (!APPLY) continue

  const { rowCount } = await pool.query(
    `UPDATE org_members
        SET payment_method = 'bank', bank_code = $1, bank_name = $2, account_no = $3, account_holder = $4
      WHERE user_id = $5 AND org_id = $6`,
    [p.bank_code, bank.name, p.account_no, p.account_holder, user.id, ORG_ID]
  )
  console.log(`      → เขียนแล้ว ${rowCount} แถว`)
}

await pool.end()
