// One-off: transfer all seed menus (owner IS NULL) in cooking_menus to one Discord id,
// so they become editable/deletable through the UI (edit/delete buttons only show for m.mine).
// After this, seedMenus.js will no longer touch these rows (its UPDATE is WHERE owner IS NULL) —
// re-running it just re-inserts nothing new since the ids already exist under a non-null owner.
//
// Owner defaults to the first id in DEV_DISCORD_IDS; override with an arg:
//   node scripts/cooking/migrateMenusToOwn.js [discordId]
require('dotenv').config()
const pg = require('pg')

const owner = process.argv[2] || (process.env.DEV_DISCORD_IDS || '').split(',')[0].trim()
if (!owner) {
  console.error('No owner: pass a discordId arg or set DEV_DISCORD_IDS in .env')
  process.exit(1)
}

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'pple_dcbot',
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'pple_volunteers',
})

async function main() {
  const { rowCount } = await pool.query(
    `UPDATE cooking_menus SET owner = $1 WHERE owner IS NULL`,
    [owner]
  )
  console.log(`Done: ${rowCount} seed menus transferred to owner=${owner}`)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
