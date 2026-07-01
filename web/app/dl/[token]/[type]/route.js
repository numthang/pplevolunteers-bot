import { NextResponse } from 'next/server'

/** GET /dl/[token]/[type] — short URL → /api/docs/token/[token]/[type] */
export function GET(req, { params }) {
  const { token, type } = params
  if (type !== 'receipt' && type !== 'registration') {
    return new Response('Not found', { status: 404 })
  }
  const url = new URL(`/api/docs/token/${token}/${type}`, req.url)
  url.search = new URL(req.url).search
  return NextResponse.redirect(url, 302)
}
