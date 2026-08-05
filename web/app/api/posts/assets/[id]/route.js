/**
 * /api/posts/assets/[id] — แก้ข้อมูล / ลบรูปในคลัง · [id] = id ของรูปในคลัง
 */
import { assetContext } from '@/lib/postsGuard.js'
import { canEditAsset, canDeleteAsset, canPublishAsset } from '@/lib/postsAccess.js'
import { deletePostFile } from '@/lib/postsStorage.js'
import { updateAsset, deleteAsset, listAssetUsage, normalizeTags } from '@/db/posts/assets.js'

/** GET — รายละเอียด + "ถูกใช้ที่ไหนบ้าง" (จาก source_asset_id ไม่ใช่จาก path) */
export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await assetContext(id)
  if (ctx.error) return ctx.error

  try {
    const usage = await listAssetUsage(ctx.asset.id)
    return Response.json({ success: true, data: ctx.asset, usage })
  } catch (error) {
    console.error('[GET /api/posts/assets/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * PATCH — { title?, tags?, consentNote?, usableUntil?, visibility? }
 * `visibility` = เลื่อนขึ้น/ลงกองกลาง → ทีมสื่อเท่านั้น (ไม่แยกเป็น route promote ต่างหาก)
 */
export async function PATCH(req, { params }) {
  const { id } = await params
  const ctx = await assetContext(id)
  if (ctx.error) return ctx.error

  if (!canEditAsset(ctx.asset, ctx.access, ctx.userId)) {
    return Response.json({ error: 'แก้รูปนี้ไม่ได้' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const patch = {}

  if (body.title !== undefined) patch.title = String(body.title || '').trim().slice(0, 200) || null
  if (body.tags !== undefined) patch.tags = normalizeTags(body.tags)
  if (body.consentNote !== undefined) patch.consentNote = String(body.consentNote || '').trim() || null
  if (body.usableUntil !== undefined) {
    const v = String(body.usableUntil || '').trim()
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return Response.json({ error: 'วันหมดอายุการใช้ภาพไม่ถูกต้อง' }, { status: 400 })
    }
    patch.usableUntil = v || null
  }
  if (body.visibility !== undefined) {
    if (!['personal', 'org'].includes(body.visibility)) {
      return Response.json({ error: 'กองที่ระบุไม่ถูกต้อง' }, { status: 400 })
    }
    if (!canPublishAsset(ctx.access)) {
      return Response.json({ error: 'ย้ายกองกลางได้เฉพาะทีมสื่อ' }, { status: 403 })
    }
    patch.visibility = body.visibility
  }

  if (!Object.keys(patch).length) return Response.json({ error: 'ไม่มีอะไรให้แก้' }, { status: 400 })

  try {
    const asset = await updateAsset(ctx.asset.id, patch)
    return Response.json({ success: true, data: asset })
  } catch (error) {
    console.error('[PATCH /api/posts/assets/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * DELETE — ลบรูปออกจากคลัง (ลบไฟล์ด้วย)
 * ปลอดภัยกับโพสต์ที่เคยหยิบไปใช้: โพสต์ถือ**สำเนาไฟล์ของตัวเอง** (copyPostFile)
 * `post_episode_media.source_asset_id` เป็น ON DELETE SET NULL — เสียแค่สายสัมพันธ์
 */
export async function DELETE(req, { params }) {
  const { id } = await params
  const ctx = await assetContext(id)
  if (ctx.error) return ctx.error

  if (!canDeleteAsset(ctx.asset, ctx.access, ctx.userId)) {
    return Response.json({ error: 'ลบรูปนี้ไม่ได้' }, { status: 403 })
  }

  try {
    const removed = await deleteAsset(ctx.asset.id)
    if (removed?.path) {
      await deletePostFile(removed.path).catch(e => console.error('[DELETE asset file]', e.message))
    }
    return Response.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/posts/assets/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
