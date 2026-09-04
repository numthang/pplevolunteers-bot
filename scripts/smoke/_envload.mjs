// preload สำหรับสคริปต์สโมคที่ import โมดูลฝั่ง web/ (ปกติพึ่ง Next.js โหลดตัวแปรสภาพแวดล้อมให้)
//
//   node --import ./scripts/smoke/_envload.mjs scripts/smoke/kanbanCards.mjs
//
// เทียบเท่า `node --env-file=.env` แต่เขียนเป็นไฟล์ไว้เพื่อให้คำสั่งที่พิมพ์สั้นและซ้ำได้
import dotenv from 'dotenv'
// ⚠️ override: true — **ห้ามถอด** (เจ็บมาแล้ว 2026-09-04 เสียเวลาไล่หาเป็นชั่วโมง)
//    เครื่อง dev มี ANTHROPIC_API_KEY เก่าค้างใน ~/.bashrc และ dotenv ปกติ "ไม่เขียนทับค่าที่มีอยู่
//    ใน process.env แล้ว" → สคริปต์หยิบ key ที่ยอด $0 ไปใช้ ขึ้น "credit balance is too low"
//    ทั้งที่ .env มี key ที่มีเครดิตอยู่ (เว็บอ่านไฟล์เองเลยไม่พัง = อาการหลอกว่า "โค้ดสคริปต์ผิด")
//    ค่าในไฟล์ของโปรเจกต์ต้องชนะ shell เสมอ ไม่ใช่แค่เรื่อง key นี้
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname, quiet: true, override: true })

// ⭐ alias `@/…` ของ Next — สโมครันด้วย node เปล่าจึงไม่มีตัว resolve ให้ พอสคริปต์ไหน import
//    โมดูลที่ใช้ alias (เช่น web/lib/postAssign.js) จะพังด้วย ERR_MODULE_NOT_FOUND ทันที
//    ⚠️ ต้องแมปให้เหมือน jsconfig.json ของ web/ เป๊ะ — `@/x` = `web/x`
import { registerHooks } from 'node:module'
const WEB_ROOT = new URL('../../web/', import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) return nextResolve(new URL(specifier.slice(2), WEB_ROOT).href, context)
    return nextResolve(specifier, context)
  },
})
