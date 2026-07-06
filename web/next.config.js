// override: true — .env เป็น source of truth; กัน env var ที่ export ค้างใน shell (เช่น ANTHROPIC_API_KEY ใน ~/.bashrc) มาทับ
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), override: true })

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: require('path').resolve(__dirname, '../'),
  // @napi-rs/canvas มี native .node binary — ห้าม webpack bundle ให้ require ตอน runtime
  serverExternalPackages: ['@napi-rs/canvas'],
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
module.exports = nextConfig
