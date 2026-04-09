import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'pple_dcbot',
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'pple_volunteers',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  timezone: '+07:00',
})

export default pool
