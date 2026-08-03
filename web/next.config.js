// override: true — .env เป็น source of truth; กัน env var ที่ export ค้างใน shell (เช่น ANTHROPIC_API_KEY ใน ~/.bashrc) มาทับ
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), override: true })

const createNextIntlPlugin = require('next-intl/plugin')
const withNextIntl = createNextIntlPlugin('./i18n/request.js')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // แยกโฟลเดอร์ build ได้ด้วย env — ให้ server เทส (เช่น `NEXT_DIST_DIR=.next-test next dev -p 3100`)
  // ไม่ไปชนกับ `next dev` ที่ dev เปิดค้างไว้ที่ :3000 · เคยชนแล้วได้ PageNotFoundError
  // ("Cannot find module for page") เพราะ .next มี artifact ของ prod build ปนกับ dev
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: require('path').resolve(__dirname, '../'),
  // native .node binary — ห้าม webpack bundle ให้ require ตอน runtime
  // sharp อยู่ด้วยเพราะ utils/quoteStyles.js (repo root) require มัน แล้วเว็บ import ไฟล์นั้นตรงๆ
  // ⚠️ quoteStyles.js ต้องอยู่ที่ repo root เท่านั้น — resolve ขึ้นไปเจอ canvas 0.1.97 ของราก
  //    ถ้าไปหยิบ web/node_modules/@napi-rs/canvas (1.0.0) จะพังทั้งระบบ: loadImage(path) โยน ERR_INVALID_URL
  serverExternalPackages: ['@napi-rs/canvas', 'sharp'],
  images: {
    domains: ['cdn.discordapp.com'],
    unoptimized: true,
  },
  async rewrites() {
    return [
      // ลิงก์สั้นแชร์เอกสาร — เสิร์ฟตรง URL ค้างเป็น /dl/... (ไม่ redirect ไป /api ยาวๆ)
      { source: '/dl/:token/:type(receipt|registration)', destination: '/api/docs/token/:token/:type' },
    ]
  },
  async redirects() {
    return [
      { source: '/calling/pending',     destination: '/calling/assignee',           permanent: true },
      { source: '/calling/create',      destination: '/calling/campaigns/create',   permanent: true },
      { source: '/calling/edit/:id',    destination: '/calling/campaigns/:id/edit', permanent: true },
      { source: '/calling/:id(\\d+)',   destination: '/calling/assignments/:id',    permanent: true },
    ]
  },
}
module.exports = withNextIntl(nextConfig)
