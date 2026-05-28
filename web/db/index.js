import pg from 'pg'
const { Pool } = pg

const g = globalThis

if (!g._pgPool) {
  g._pgPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'pple_dcbot',
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'pple_volunteers',
    max: 3,
  })
  g._pgPool.on('connect', (client) => {
    client.query("SET TIME ZONE 'Asia/Bangkok'")
  })
}

export default g._pgPool
