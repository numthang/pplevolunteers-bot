/**
 * ค้นเบอร์โทรจาก discord_id — one-off lookup, ไม่เขียนข้อมูล
 *
 * รัน: node --import ./scripts/smoke/_envload.mjs scripts/finance/lookupPhonesById.mjs
 */
import pg from 'pg'
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'pple_volunteers',
})

const PEOPLE = [
  { label: 'นพรัตน์',   discord_id: '1267015166869110866' },
  { label: 'สิรีธร',    discord_id: '1112626843930083338' },
  { label: 'ภานุพงศ์',  discord_id: '796759508692762655' },
  { label: 'จิราภรณ์',  discord_id: '1267015240789524480' },
  { label: 'สุดหล้า',   discord_id: '1116616319169728602' },
  { label: 'ปัญญา',     discord_id: '1223166717929459773' },
  { label: 'ชยานันท์',  discord_id: '796339488477020171' },
]

for (const p of PEOPLE) {
  const { rows } = await pool.query(
    `SELECT id, username, firstname, lastname, phone FROM users WHERE discord_id = $1`,
    [p.discord_id]
  )
  if (rows.length === 0) {
    console.log(`✗ ${p.label} (${p.discord_id}): ไม่พบ user`)
    continue
  }
  const u = rows[0]
  console.log(`✓ ${p.label.padEnd(10)} @${(u.username || '-').padEnd(20)} ${(u.firstname||'')} ${(u.lastname||'')} → เบอร์: ${u.phone || '(ไม่มี)'}`)
}
await pool.end()
