import { readFile } from 'fs/promises'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { absPath, mimeOfPath } from '@/lib/postsStorage.js'
import { getBasketMediaWithScope } from '@/db/posts/basket.js'
import pool from '@/db/index.js'

/**
 * GET /api/bot/basket/media/[id] — เสิร์ฟไฟล์สื่อของตะกร้า (ไฟล์อยู่นอก `public/` ต้องผ่าน gate เสมอ)
 *
 * ⚠️ ใช้ `/api/posts/media/[id]` แทนไม่ได้ — ตัวนั้นเทียบ `org_id` ของโพสต์กับ org ของ session
 *    แต่ตะกร้าของ guild ที่ยังไม่ผูก org มี `org_id` NULL → จะตก 404 เสมอ
 *    ที่นี่จึงใช้ gate เดียวกับ `/api/bot/basket`: เป็นสมาชิกของ guild ที่สื่อชิ้นนั้นสังกัด
 *
 * ไม่ผ่าน = 404 (ห้าม 403 กันยืนยันว่ามีไฟล์นี้อยู่)
 */
export async function GET(req, { params }) {
  const { id } = await params
  const mediaId = Number(id)
  if (!Number.isInteger(mediaId)) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })

  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await getBasketMediaWithScope(mediaId)
  // ไฟล์ยังโหลดไม่เสร็จ (path NULL) หรือไม่ใช่สื่อของตะกร้า (ไม่มี guild) → ไม่มีอะไรให้เสิร์ฟ
  if (!row?.path || !row.guild_id) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })

  // สิทธิ์มาจาก guild ของสื่อชิ้นนั้นเอง — ไม่ใช่ guild ที่ผู้เรียกอ้าง (กันข้าม guild)
  const { rows: membership } = await pool.query(
    'SELECT 1 FROM org_members om JOIN users u ON u.id = om.user_id WHERE om.guild_id = $1 AND u.discord_id = $2 LIMIT 1',
    [row.guild_id, session.user.discordId]
  )
  if (!membership.length) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })

  try {
    const buffer = await readFile(absPath(row.path))
    return new Response(buffer, {
      headers: {
        'Content-Type': row.kind === 'video' ? 'video/mp4' : mimeOfPath(row.path),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    if (error.code === 'ENOENT') return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
    console.error('[GET /api/bot/basket/media/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
