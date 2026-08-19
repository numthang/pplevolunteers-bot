// One-off: cooking v3 — pantry/history เดิมผูกกับ owner (คนเดียว) ต้องย้ายไปผูกกับ "ครัว" แทน
// (คนหลายคนช่วยกันจัดการครัวเดียวกันได้) สร้าง 1 ครัวต่อ owner เดิม ใส่เจ้าของเป็นสมาชิก แล้วเติม
// kitchen_id ให้ทุกแถวใน cooking_pantry/cooking_history — รันคั่นระหว่าง PART A กับ PART C ใน migration.sql
require('dotenv').config()
const pg = require('pg')

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'pple_dcbot',
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'pple_volunteers',
})

async function main() {
  const { rows: owners } = await pool.query(`
    SELECT DISTINCT owner FROM (
      SELECT owner FROM cooking_pantry
      UNION
      SELECT owner FROM cooking_history
    ) t
  `)

  console.log(`Fetched ${owners.length} distinct owners, creating kitchens...`)
  let ok = 0
  let errors = 0
  for (let i = 0; i < owners.length; i++) {
    const { owner } = owners[i]
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `INSERT INTO cooking_kitchens (name, owner) VALUES ($1, $2) RETURNING id`,
        ['ครัวของฉัน', owner]
      )
      const kitchenId = rows[0].id
      await client.query(
        `INSERT INTO cooking_kitchen_members (kitchen_id, member) VALUES ($1, $2)`,
        [kitchenId, owner]
      )
      await client.query(`UPDATE cooking_pantry SET kitchen_id = $1 WHERE owner = $2`, [kitchenId, owner])
      await client.query(`UPDATE cooking_history SET kitchen_id = $1 WHERE owner = $2`, [kitchenId, owner])
      await client.query('COMMIT')
      ok++
    } catch (e) {
      await client.query('ROLLBACK')
      errors++
      console.error(`\n  ${owner}: ${e.message}`)
    } finally {
      client.release()
    }
    process.stdout.write(`\r  ${i + 1}/${owners.length} (${errors} errors)`)
  }
  process.stdout.write('\n')

  const { rows: check } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM cooking_pantry WHERE kitchen_id IS NULL
     UNION ALL
     SELECT COUNT(*)::int FROM cooking_history WHERE kitchen_id IS NULL`
  )
  console.log(`Done: ${ok} kitchens created, ${errors} errors`)
  console.log(`Rows still missing kitchen_id — pantry: ${check[0]?.n}, history: ${check[1]?.n}`)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
