require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: require('path').resolve(__dirname, '../'),
  images: {
    domains: ['cdn.discordapp.com'],
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: '/calling/pending',     destination: '/calling/assignee',           permanent: true },
      { source: '/calling/create',      destination: '/calling/campaigns/create',   permanent: true },
      { source: '/calling/edit/:id',    destination: '/calling/campaigns/:id/edit', permanent: true },
      { source: '/calling/:id(\\d+)',   destination: '/calling/assignments/:id',    permanent: true },
      // 2026-06-07: จัดกลุ่มเมนู discord ใหม่ → media/ + config/
      { source: '/discord/quote',           destination: '/discord/media/quote',      permanent: true },
      { source: '/discord/social/accounts', destination: '/discord/config/platforms', permanent: true },
      { source: '/discord/guild-watermark', destination: '/discord/config/watermark', permanent: true },
      { source: '/discord/watermark',       destination: '/discord/config/watermark', permanent: true },
    ]
  },
}
module.exports = nextConfig
