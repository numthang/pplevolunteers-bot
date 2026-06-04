require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  max: 10,
});

pool.on('connect', (client, done) => {
  client.query("SET TIME ZONE 'Asia/Bangkok'", done);
});

module.exports = pool;
