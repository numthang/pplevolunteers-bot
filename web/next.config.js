require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: require('path').resolve(__dirname, '../'),
  images: {
    domains: ['cdn.discordapp.com'],
    unoptimized: true,
  },
}
module.exports = nextConfig
