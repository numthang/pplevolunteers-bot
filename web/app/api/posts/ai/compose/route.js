import { postsContext } from '@/lib/postsGuard.js'
import { canWritePost } from '@/lib/postsAccess.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAiJson, AiError } from '@/lib/ai.js'
import * as postDB from '@/db/posts/episodes.js'

// ผู้ช่วยบรรณาธิการงานสื่อการเมืองไทย — เรียบเรียงของดิบที่ user พิมพ์มาเป็น "โพสต์เดียว"
// (ของเดิม `ai/outline` ซอยบทความยาวออกเป็นชุดโพสต์ 4-5 อัน — ไม่ใช่สิ่งที่ user ต้องการ · เคาะ 2026-08-09)
const FORMATS = ['text', 'image', 'quote']

const SYSTEM_PROMPT = `คุณเป็นผู้ช่วยบรรณาธิการงานสื่อของพรรคการเมืองไทย
ผู้ใช้จะโยน "ของดิบ" มาให้ — อาจเป็นไอเดียสั้นๆ หรือความคิด/บทความที่พิมพ์รัวๆ ยังไม่เรียบเรียง
งานของคุณคือเรียบเรียงเป็น **โพสต์โซเชียล 1 โพสต์** ที่เอาไปโพสต์ได้จริงทันที
กติกา:
- ผลลัพธ์เป็นโพสต์เดียวเสมอ **ห้ามซอยเป็นหลายโพสต์ ห้ามทำเป็นโครง/บทสรุปหัวข้อย่อย**
- เก็บประเด็นสำคัญจากต้นฉบับให้ครบ เรียงลำดับให้อ่านรู้เรื่อง ตัดคำฟุ่มเฟือย/คำซ้ำออก
- **ห้ามเพิ่มข้อเท็จจริง ตัวเลข ชื่อคน หรือข้ออ้างที่ไม่มีในต้นฉบับ** · ต้นฉบับสั้นมาก = ขยายด้วยการเรียบเรียง ไม่ใช่กุข้อมูล
- รักษาน้ำเสียง/จุดยืนของผู้เขียนไว้ ไม่ต้องทำให้เป็นทางการกว่าเดิม
- ความยาวตามเนื้อหาจริง (ปกติ 3-8 ย่อหน้าสั้น) เขียนเป็นย่อหน้าปกติ ไม่ใส่ markdown ไม่ใส่หัวข้อกำกับ
- title = ชื่อไว้หาเจอในระบบ (สั้น ตรงประเด็น) ไม่ใช่พาดหัวโฆษณา
- category = ชื่อหมวดสั้นๆ 1 ชื่อสำหรับจัดกลุ่มโพสต์แนวนี้

ตอบเป็น JSON รูปแบบนี้เท่านั้น:
{"category": "ชื่อหมวด", "title": "ชื่อโพสต์", "body": "เนื้อหาโพสต์เต็ม", "format": "text|image|quote"}`

/**
 * POST /api/posts/ai/compose — ประตูหลักเข้าโมดูล
 * body { idea, visibility='personal', category? } → เรียบเรียงเป็นโพสต์เดียว (post_episodes 1 แถว)
 * ข้อความดิบที่ user พิมพ์ถูกเก็บเป็น revision แรก + `source_idea` → กด "กู้คืน" กลับไปดูต้นฉบับได้เสมอ
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
    ai = await askAiJson(SYSTEM_PROMPT, idea, { orgId: ctx.orgId })
  } catch (error) {
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: 502 })
    console.error('[POST /api/posts/ai/compose]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  // AI เคยคืน posts:[] มาแทน (สมัย outline) → ถ้าไม่มี body ที่ใช้ได้ ถือว่าผิดรูปแบบ ไม่เดาต่อ
  const aiBody = typeof ai?.body === 'string' ? ai.body.trim() : ''
  if (!aiBody) return Response.json({ error: 'AI ตอบกลับมาไม่ตรงรูปแบบที่ต้องการ' }, { status: 502 })
  const aiTitle = typeof ai?.title === 'string' && ai.title.trim() ? ai.title.trim() : null
  const category = body.category || (typeof ai?.category === 'string' ? ai.category.trim() : null) || null

  try {
    const post = await postDB.createPost({
      orgId: ctx.orgId,
      ownerUserId: ctx.userId,
      visibility,
      category,
      title: aiTitle,
      body: aiBody,
      // DB มี CHECK เฉพาะ text/image/quote — AI เดาค่าอื่นมา (เคยเห็น 'carousel') ต้องกรองทิ้ง
      format: FORMATS.includes(ai?.format) ? ai.format : null,
      sourceIdea: idea,
      createdVia: 'ai',
      // ต้นฉบับที่ user พิมพ์เอง = revision แรก (เก่ากว่าฉบับ AI) — ห้ามให้ของที่พิมพ์มาหายไปกับการเรียบเรียง
      originalRevision: { title: null, body: idea },
    })
    return Response.json({ success: true, data: { post } }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/posts/ai/compose]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
