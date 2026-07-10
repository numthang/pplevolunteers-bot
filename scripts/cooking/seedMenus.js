// Seed the 121 static menus into cooking_menus (owner = NULL = ระบบ). Idempotent.
// Source of truth = md/cooking/menus.seed.json. Re-run to refresh seed rows only
// (ON CONFLICT updates rows WHERE owner IS NULL — never clobbers a user's imported menu).
//
// PRODUCTION: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/cooking/seedMenus.js'
// Dev: node scripts/cooking/seedMenus.js
require('dotenv').config()
const path = require('path')
const pg = require('pg')

const SEED = require(path.resolve(__dirname, '../../md/cooking/menus.seed.json'))
const menus = SEED.menus || SEED

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'pple_dcbot',
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'pple_volunteers',
})

const J = (v) => JSON.stringify(v ?? null)

async function main() {
  console.log(`Fetched ${menus.length} seed menus, upserting...`)
  let ok = 0
  let errors = 0
  for (let i = 0; i < menus.length; i++) {
    const m = menus[i]
    try {
      await pool.query(
        `INSERT INTO cooking_menus
           (id, owner, name, food_groups, protein, method, cuisine, flavor,
            carb_in_dish, ingredients, staples_used, steps, gates,
            image_emoji, image_url, source)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, food_groups = EXCLUDED.food_groups,
           protein = EXCLUDED.protein, method = EXCLUDED.method,
           cuisine = EXCLUDED.cuisine, flavor = EXCLUDED.flavor,
           carb_in_dish = EXCLUDED.carb_in_dish, ingredients = EXCLUDED.ingredients,
           staples_used = EXCLUDED.staples_used, steps = EXCLUDED.steps,
           gates = EXCLUDED.gates, image_emoji = EXCLUDED.image_emoji,
           image_url = EXCLUDED.image_url, source = EXCLUDED.source
         WHERE cooking_menus.owner IS NULL`,
        [
          m.id, m.name, J(m.food_groups), J(m.protein), m.method || null,
          m.cuisine || null, J(m.flavor), !!m.carb_in_dish, J(m.ingredients),
          J(m.staples_used), J(m.steps), J(m.gates),
          m.image?.emoji || null, m.image?.url || null, m.source || null,
        ]
      )
      ok++
    } catch (e) {
      errors++
      console.error(`\n  ${m.id}: ${e.message}`)
    }
    process.stdout.write(`\r  ${i + 1}/${menus.length} (${errors} errors)`)
  }
  process.stdout.write('\n')
  console.log(`Done: ${ok} upserted, ${errors} errors`)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
