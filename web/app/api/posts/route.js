import { postsContext } from '@/lib/postsGuard.js'
import { canReadPost, canWritePost, isAdmin } from '@/lib/postsAccess.js'
import * as postDB from '@/db/posts/episodes.js'

/**
 * GET /api/posts?visibility=personal|org&category=<ชื่อ|__none__>&status=&archived=1&source=discord|all
 *
 * `source` — ตะกร้าสื่อของ Discord เป็นโพสต์เหมือนกัน (ก้อน 4c) แต่หย่อนกันวันละหลายใบ
 *   ไม่ส่ง = ฟีดหลัก (ซ่อนของจากดิสฯ) · `discord` = แท็บ "จากดิสฯ" · `all` = รวมทุกอย่าง
 */
export async function GET(req) {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error

  const { searchParams } = new URL(req.url)
  const visibility = searchParams.get('visibility') || null
  const categoryParam = searchParams.get('category')
  const category = categoryParam === '__none__' ? '' : categoryParam
  const status = searchParams.get('status') || null
  const includeArchived = searchParams.get('archived') === '1'
  const source = ['discord', 'all'].includes(searchParams.get('source')) ? searchParams.get('source') : null

  try {
    const rows = await postDB.listPosts(ctx.orgId, ctx.userId, {
      visibility, category, status, includeArchived, source,
      includeAllPersonal: isAdmin(ctx.access),
    })
    // SQL กรองแค่ personal ของคนอื่น ยังไม่รู้เรื่อง policy.read='team' — กรองซ้ำที่นี่
    const data = rows.filter(p => canReadPost(p, ctx.access, ctx.userId, ctx.policy))
    return Response.json({ success: true, data })
  } catch (error) {
    console.error('[GET /api/posts]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/posts — สร้างโพสต์ใหม่ { title?, body?, category?, visibility?='personal', format?, sourceIdea? }
 */
export async function POST(req) {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => ({}))
  const visibility = body.visibility === 'org' ? 'org' : 'personal'

  const draft = { visibility, owner_user_id: ctx.userId }
  if (!canWritePost(draft, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่มีสิทธิ์สร้างโพสต์' }, { status: 403 })
  }

  try {
    const post = await postDB.createPost({
      orgId: ctx.orgId,
      ownerUserId: ctx.userId,
      visibility,
      category: body.category || null,
      title: body.title || null,
      body: body.body || null,
      format: body.format || null,
      sourceIdea: body.sourceIdea || null,
      createdVia: 'manual',
    })
    return Response.json({ success: true, data: post }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/posts]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
