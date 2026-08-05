/**
 * GET /api/posts/assets/[id]/file — เสิร์ฟไฟล์ในคลัง
 *
 * ต้องมี route ของตัวเอง: `/api/posts/media/[id]` JOIN `post_episodes` เพื่อหาสิทธิ์
 * แต่รูปในคลัง**ไม่มีโพสต์เจ้าของ** · ไฟล์อยู่นอก `public/` จึงต้องผ่าน gate เสมอ
 */
import { readFile } from 'fs/promises'
import { assetContext } from '@/lib/postsGuard.js'
import { absPath, mimeOfPath } from '@/lib/postsStorage.js'

export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await assetContext(id)   // ไม่ผ่านสิทธิ์ = 404 (ไม่ยืนยันว่ามีอยู่)
  if (ctx.error) return ctx.error

  try {
    const buffer = await readFile(absPath(ctx.asset.path))
    return new Response(buffer, {
      headers: {
        'Content-Type': ctx.asset.mime || mimeOfPath(ctx.asset.path),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    if (error.code === 'ENOENT') return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
    console.error('[GET /api/posts/assets/[id]/file]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
