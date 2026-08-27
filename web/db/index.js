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
    // ⚠️ prod ล่ม 504 ทั้งเว็บ 2026-08-27 เพราะ 3 เส้นนี้ (bug-459)
    //    process ไม่ได้ตาย ไม่มี error log เลย — แค่ทุกคำขอไปยืนรอ connection ที่ไม่มีวันว่าง
    //    (บอทที่ db/index.js ตั้ง max: 10 มานานแล้ว ส่วนเว็บที่เสิร์ฟคนจริงกลับได้ 3)
    max: 12,
    // ⭐ วาล์วนิรภัย — ค่า default ของ pg คือ "รอตลอดกาล" ซึ่งแปลว่า pool ตัน = เว็บล่มทั้งเว็บแบบเงียบๆ
    //    มี timeout แล้วอาการเปลี่ยนเป็น "บางคำขอ error" ซึ่งกู้ตัวเองได้และมี log ให้ตามด้วย
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    // query ที่กินเกิน 30 วิในคำขอเว็บ = พังอยู่แล้ว (nginx ตอบ 504 ไปก่อนแล้วด้วยซ้ำ)
    // แต่ถ้าปล่อยไว้มันจะยึด connection ค้างจนคนอื่นอดใช้ → ต้องมีเพดาน
    options: '-c timezone=Asia/Bangkok -c statement_timeout=30000',
  })
}

export default g._pgPool
