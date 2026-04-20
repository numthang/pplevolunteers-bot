import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET(req, { params }) {
  const { filename } = await params
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return new Response('Not Found', { status: 404 })
  }
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'uploads', 'evidence', filename))
    const ext = filename.split('.').pop().toLowerCase()
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'
    return new Response(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('Not Found', { status: 404 })
  }
}
