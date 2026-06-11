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
    ]
  },
}
module.exports = nextConfig
