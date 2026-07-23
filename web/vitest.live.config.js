import { defineConfig } from 'vitest/config'
import path from 'path'

// config แยกสำหรับ *.live.test.js (ต่อ DB จริง) — vitest merge --exclude จาก CLI
// เข้ากับ config แทนที่จะแทนที่ จึงกันไม่ให้ live test ถูก exclude ด้วยวิธีนี้ไม่ได้
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['**/*.live.test.js'],
    setupFiles: ['./vitest.live.setup.js'],
    exclude: ['**/node_modules/**'],
  },
})
