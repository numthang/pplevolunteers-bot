import { postsContext } from '@/lib/postsGuard.js'
import { canWritePost } from '@/lib/postsAccess.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAiJson, AiError } from '@/lib/ai.js'
import * as postDB from '@/db/posts/episodes.js'

// ผู้ช่วยบรรณาธิการงานสื่อการเมืองไทย — แตกไอเดียเดียวเป็นชุดโพสต์ที่ติดหมวดเดียวกัน
const FORMATS = ['text', 'image', 'quote']

const SYSTEM_PROMPT = `คุณเป็นผู้ช่วยบรรณาธิการงานสื่อของพรรคการเมืองไทย
รับไอเดียจากผู้ใช้ (อาจสั้นแค่ประโยคเดียว หรือยาวเป็นบทความ/สรุปที่มีอยู่แล้ว) แล้ววางแผนเป็น "ชุดโพสต์โซเชียล" หลายโพสต์
กติกา:
- input สั้น (แค่หัวข้อ/ไอเดียตั้งต้น) → ขยายเป็นชุดโพสต์ที่ปูเรื่องได้ครบ
- input ยาว (มีเนื้อหาอยู่แล้ว) → ซอยเนื้อหาที่มีอยู่ออกเป็นโพสต์ย่อย ห้ามแต่งเนื้อหาใหม่ที่ไม่มีในต้นฉบับ
- แต่ละโพสต์มีแค่ ~1 ประเด็นหลัก อ่านจบในตัวเอง โพสต์ลงโซเชียลได้จริง
- เสนอชื่อหมวด (category) สั้นๆ 1 ชื่อ ครอบคลุมชุดโพสต์นี้ทั้งหมด
- จำนวนโพสต์ 1-12 ตัวตามความเหมาะสมของเนื้อหา

ตอบเป็น JSON รูปแบบนี้เท่านั้น:
{"category": "ชื่อหมวด", "posts": [{"title": "ชื่อโพสต์", "gist": "ใจความของโพสต์นี้", "format": "text|image|quote"}]}`

/**
 * POST /api/posts/ai/outline — ประตูหลักเข้าโมดูล
 * body { idea, visibility='personal', category? } → สร้างชุดโพสต์ (post_episodes หลายแถว) ที่ติดหมวดเดียวกัน
 */
export async function POST(req) {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => ({}))
  const idea = typeof body.idea === 'string' ? body.idea.trim() : ''
  if (!idea) return Response.json({ error: 'กรุณาใส่ไอเดียก่อน' }, { status: 400 })

  const visibility = body.visibility === 'org' ? 'org' : 'personal'
  const draft = { visibility, owner_user_id: ctx.userId }
  if (!canWritePost(draft, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่มีสิทธิ์สร้างโพสต์' }, { status: 403 })
  }

  const quota = await consumeAiQuota(ctx.userId)
  if (!quota.ok) {
    return Response.json({ error: `ใช้ AI ครบโควตาวันนี้แล้ว (${quota.limit} ครั้ง/วัน)` }, { status: 429 })
  }

  let ai
  try {
    ai = await askAiJson(SYSTEM_PROMPT, idea)
  } catch (error) {
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: 502 })
    console.error('[POST /api/posts/ai/outline]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  // validate รูปร่างที่ AI คืนมา — posts ต้องเป็น array 1-12 ตัว จากนั้นทิ้งตัวที่ไม่มี title
  const rawPosts = Array.isArray(ai?.posts) ? ai.posts : []
  if (rawPosts.length < 1 || rawPosts.length > 12) {
    return Response.json({ error: 'AI ตอบกลับมาไม่ตรงรูปแบบที่ต้องการ' }, { status: 502 })
  }
  const validPosts = rawPosts.filter(p => p && typeof p.title === 'string' && p.title.trim())
  if (validPosts.length < 1) {
    return Response.json({ error: 'AI ตอบกลับมาไม่ตรงรูปแบบที่ต้องการ' }, { status: 502 })
  }

  // ทุกโพสต์ในรอบนี้ได้ category เดียวกัน = สิ่งที่มาแทน series
  const category = body.category || (typeof ai.category === 'string' ? ai.category.trim() : null) || null

  try {
    const created = []
    for (const p of validPosts) {
      const post = await postDB.createPost({
        orgId: ctx.orgId,
        ownerUserId: ctx.userId,
        visibility,
        category,
        title: p.title.trim(),
        body: typeof p.gist === 'string' ? p.gist : null,
        // DB มี CHECK เฉพาะ text/image/quote — AI เดาค่าอื่นมา (เคยเห็น 'carousel') ต้องกรองทิ้ง ไม่งั้น insert พังทั้งชุด
        format: FORMATS.includes(p.format) ? p.format : null,
        sourceIdea: idea,
        createdVia: 'ai',
      })
      created.push(post)
    }
    return Response.json({ success: true, data: { category, posts: created } }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/posts/ai/outline]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
