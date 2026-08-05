/**
 * /api/posts/assets — คลังภาพ (post_assets)
 *
 * คลัง = **วัตถุดิบที่ตั้งใจเก็บ ไม่มี retention** ต่างจากสื่อแนบโพสต์ที่โดนลบไฟล์ทีหลัง
 * สิทธิ์ไม่ผูกกับ `posts_policy` — กองกลางทุกคนใน org เห็น · กองส่วนตัวเจ้าของคนเดียว
 */
import { postsContext } from '@/lib/postsGuard.js'
import { isAdmin, canPublishAsset } from '@/lib/postsAccess.js'
import { savePostFile, isAllowedMime, sha256Hex, probeImage, MAX_FILE_SIZE } from '@/lib/postsStorage.js'
import { listAssets, listAssetTags, createAsset, findAssetByHash, normalizeTags } from '@/db/posts/assets.js'

/**
 * GET /api/posts/assets?pile=all|personal|org&view=recent|unused&q=&tag=
 * คืน { data: [...], tags: [{tag,n}] } — tags ใช้ทำแถบชิปกรอง
 */
export async function GET(req) {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error

  const sp = new URL(req.url).searchParams
  const pile = ['all', 'personal', 'org'].includes(sp.get('pile')) ? sp.get('pile') : 'all'
  const view = ['recent', 'unused'].includes(sp.get('view')) ? sp.get('view') : 'recent'

  try {
    const admin = isAdmin(ctx.access)
    const [data, tags] = await Promise.all([
      listAssets({
        orgId: ctx.orgId, userId: ctx.userId, pile, view,
        q: sp.get('q') || null, tag: sp.get('tag') || null, isAdmin: admin,
      }),
      listAssetTags({ orgId: ctx.orgId, userId: ctx.userId, isAdmin: admin }),
    ])
    return Response.json({ success: true, data, tags, canPublish: canPublishAsset(ctx.access) })
  } catch (error) {
    console.error('[GET /api/posts/assets]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/posts/assets — อัปโหลดเข้าคลัง (multipart, field `files` หลายไฟล์ได้)
 * field เสริม: title · tags (คั่นด้วย ,) · consentNote · usableUntil (YYYY-MM-DD) · visibility
 *
 * เข้ากอง `personal` เสมอ เว้นแต่ทีมสื่อสั่ง `visibility=org` มาตั้งแต่แรก
 * ไฟล์ซ้ำ (sha256 ตรง **ในกองของคนนี้เอง**) → คืนใบเดิม ไม่เขียนไฟล์ใหม่
 */
export async function POST(req) {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error
  // debug mode ("View as role") ส่ง userId เป็น null → ไม่มีเจ้าของกองให้ผูก
  if (!ctx.userId) return Response.json({ error: 'อัปโหลดในโหมดดูแทนไม่ได้' }, { status: 403 })

  let form
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'อัปโหลดไม่สำเร็จ' }, { status: 400 })
  }

  const files = form.getAll('files').filter(f => typeof f === 'object' && f.size > 0)
  if (!files.length) return Response.json({ error: 'ไม่พบไฟล์ที่จะอัปโหลด' }, { status: 400 })

  for (const f of files) {
    if (!isAllowedMime(f.type)) return Response.json({ error: `ชนิดไฟล์ไม่รองรับ: ${f.type}` }, { status: 400 })
    if (f.size > MAX_FILE_SIZE) return Response.json({ error: 'ไฟล์ใหญ่เกินไป (จำกัด 12MB ต่อไฟล์)' }, { status: 400 })
  }

  const str = k => (typeof form.get(k) === 'string' && form.get(k).trim()) || null
  let visibility = 'personal'
  if (str('visibility') === 'org') {
    // เลื่อนขึ้นกองกลาง = ทีมสื่อเท่านั้น (admin + secretary_general + editor)
    if (!canPublishAsset(ctx.access)) {
      return Response.json({ error: 'อัปเข้ากองกลางได้เฉพาะทีมสื่อ' }, { status: 403 })
    }
    visibility = 'org'
  }
  const usableUntil = str('usableUntil')
  if (usableUntil && !/^\d{4}-\d{2}-\d{2}$/.test(usableUntil)) {
    return Response.json({ error: 'วันหมดอายุการใช้ภาพไม่ถูกต้อง' }, { status: 400 })
  }

  try {
    const meta = {
      title: str('title'),
      tags: normalizeTags(str('tags')),
      consentNote: str('consentNote'),
      usableUntil,
    }

    const created = []
    for (const f of files) {
      const buffer = Buffer.from(await f.arrayBuffer())
      const sha256 = sha256Hex(buffer)

      const dup = await findAssetByHash(ctx.orgId, ctx.userId, sha256)
      if (dup) { created.push({ ...dup, duplicate: true }); continue }

      const { width, height } = await probeImage(buffer)
      const path = await savePostFile(buffer, f.type)
      created.push(await createAsset({
        orgId: ctx.orgId, ownerUserId: ctx.userId, visibility,
        path, mime: f.type, width, height, bytes: buffer.length, sha256,
        ...meta,
      }))
    }

    return Response.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/posts/assets]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
