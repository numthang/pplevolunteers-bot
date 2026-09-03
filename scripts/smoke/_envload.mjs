// preload สำหรับสคริปต์สโมคที่ import โมดูลฝั่ง web/ (ปกติพึ่ง Next.js โหลดตัวแปรสภาพแวดล้อมให้)
//
//   node --import ./scripts/smoke/_envload.mjs scripts/smoke/kanbanCards.mjs
//
// เทียบเท่า `node --env-file=.env` แต่เขียนเป็นไฟล์ไว้เพื่อให้คำสั่งที่พิมพ์สั้นและซ้ำได้
import dotenv from 'dotenv'
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname, quiet: true })
