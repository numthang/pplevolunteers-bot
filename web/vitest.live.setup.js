// live test ต่อ DB จริง — โหลด DB_* จาก .env ที่ราก repo (ปกติ Next เป็นคนโหลดให้)
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })
