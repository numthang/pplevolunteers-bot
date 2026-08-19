// One-off: move the 44-slot static checklist (canonical.json) into cooking_ingredients,
// owned by one Discord id, so it becomes editable (add/delete) instead of hardcoded.
// Idempotent — ON CONFLICT (owner, token) DO NOTHING, safe to re-run.
//
// Owner defaults to the first id in DEV_DISCORD_IDS; override with an arg:
//   node scripts/cooking/migrateCanonicalToOwn.js [discordId]
//
// ⚠️ After this runs, CookingClient.jsx must stop double-rendering canonicalData
// for tokens that now exist in the owner's cooking_ingredients (see byGroup()).
require('dotenv').config()
const path = require('path')
const pg = require('pg')

const canonical = require(path.resolve(__dirname, '../../web/app/cooking/data/canonical.json'))

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
  const rows = []
  for (const grp of ['protein', 'veg', 'special']) {
    for (const item of canonical[grp] || []) {
      rows.push({
        token: item.token,
        label: item.label || item.token,
        grp,
        tier: item.tier || 'regular',
      })
    }
  }

  console.log(`Fetched ${rows.length} canonical items, inserting for owner=${owner}...`)
  let inserted = 0
  let skipped = 0
  let errors = 0
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    try {
      const { rowCount } = await pool.query(
        `INSERT INTO cooking_ingredients (owner, token, label, grp, tier)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (owner, token) DO NOTHING`,
        [owner, r.token, r.label, r.grp, r.tier]
      )
      if (rowCount > 0) inserted++
      else skipped++
    } catch (e) {
      errors++
      console.error(`\n  ${r.token}: ${e.message}`)
    }
    process.stdout.write(`\r  ${i + 1}/${rows.length} (${errors} errors)`)
  }
  process.stdout.write('\n')
  console.log(`Done: ${inserted} inserted, ${skipped} already existed, ${errors} errors`)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
