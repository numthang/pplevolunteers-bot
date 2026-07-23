import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    // *.live.test.js ต่อ DB จริง → ไม่รันในรอบปกติ (npm test ต้องรันได้โดยไม่มี DB)
    // รันเอง: npm run test:live  (ต้องมี DB_* ใน env)
    exclude: ['**/node_modules/**', '**/*.live.test.js'],
  },
})
