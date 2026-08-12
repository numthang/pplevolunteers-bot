import { postsContext } from '@/lib/postsGuard.js'
import { canWritePost } from '@/lib/postsAccess.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAiJson, AiError } from '@/lib/ai.js'
import * as postDB from '@/db/posts/episodes.js'
import { getPrompt } from '@/db/orgAiPrompts.js'

// ผู้ช่วยบรรณาธิการงานสื่อการเมืองไทย — เรียบเรียงของดิบที่ user พิมพ์มาเป็นโพสต์
// (ของเดิม `ai/outline` ซอยบทความยาวออกเป็นชุดโพสต์แบบ AI ตัดสินใจเองว่าจะออกกี่ตอน — ถูกตัดทิ้ง 2026-08-09
//  เพราะตอนนั้น AI ตัดสินใจเองแบบไม่มีการกดเลือก · เคาะ 2026-08-12 เอา series กลับมาเป็นตัวเลือกที่ user กดเอง
//  (ครั้งแรกให้ user ระบุจำนวนตอนเอง แล้วเคาะใหม่รอบเดียวกัน — user มักระบุจำนวนไว้ในเนื้อหาที่พิมพ์อยู่แล้ว
//  จึงให้ AI อ่านจากเนื้อหาแทนที่จะมีช่องกรอกเลขซ้ำซ้อน) ต่างจาก outline เดิมตรงที่ series mode นี้ร่าง body เต็มทุกตอนทันที ไม่ใช่แค่ gist)
const FORMATS = ['text', 'image', 'quote']
const MIN_EPISODES = 1
const MAX_EPISODES = 12

// series mode: AI เป็นคนตัดสินใจจำนวนตอนเอง (1-12) จากเนื้อหาที่ได้รับ — ไม่มีช่องกรอกเลขในหน้าเว็บ
// user มักพิมพ์ระบุจำนวนตอนที่ต้องการไว้ในเนื้อหาเองอยู่แล้ว (เช่น "แบ่งเป็น 5 ตอน") ให้ AI อ่านจากตรงนั้น
// ไม่ระบุมา = แบ่งตามความเหมาะสมของเนื้อหา · ร่าง body เต็มทุกตอนทันที ไม่ใช่แค่โครง/gist แบบ outline เดิม
// title แต่ละตอน = "<ชื่อซีรีส์สั้นๆ> EP.xx: <ชื่อตอน>" — ต่อ EP.xx เองฝั่ง server กันเลขเพี้ยน ไม่พึ่ง AI นับ
/**
 * POST /api/posts/ai/compose — ประตูหลักเข้าโมดูล
 * body { idea, visibility='personal', category?, series? }
 * series ไม่ใส่/false → เรียบเรียงเป็นโพสต์เดียว (post_episodes 1 แถว)
 * series: true → AI ตัดสินใจจำนวนตอนเอง (1-12) จากเนื้อหา (post_episodes หลายแถว หมวดเดียวกัน)
 * ข้อความดิบที่ user พิมพ์ถูกเก็บเป็น revision แรก + `source_idea` ในทุกตอน → กด "กู้คืน" กลับไปดูต้นฉบับได้เสมอ
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

  const isSeries = body.series === true

  const quota = await consumeAiQuota(ctx.userId)
  if (!quota.ok) {
    return Response.json({ error: `ใช้ AI ครบโควตาวันนี้แล้ว (${quota.limit} ครั้ง/วัน)` }, { status: 429 })
  }

  let ai
  try {
    ai = await askAiJson(await getPrompt(isSeries ? 'posts.compose_series' : 'posts.compose', ctx.orgId), idea, { orgId: ctx.orgId })
  } catch (error) {
    // โควตายืม key กลางหมด = 429 (ผู้ใช้แก้เองได้ด้วยการใส่ key องค์กร) · AI ล่มจริง = 502
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.code === 'quota' ? 429 : 502 })
    console.error('[POST /api/posts/ai/compose]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  const category = body.category || (typeof ai?.category === 'string' ? ai.category.trim() : null) || null

  if (isSeries) {
    const rawPosts = Array.isArray(ai?.posts) ? ai.posts : []
    const validPosts = rawPosts.filter(p => p && typeof p.title === 'string' && p.title.trim() && typeof p.body === 'string' && p.body.trim())
    if (validPosts.length < MIN_EPISODES || validPosts.length > MAX_EPISODES) {
      return Response.json({ error: 'AI ตอบกลับมาไม่ตรงรูปแบบที่ต้องการ' }, { status: 502 })
    }
    const seriesName = typeof ai?.seriesName === 'string' && ai.seriesName.trim() ? ai.seriesName.trim() : (category || 'ซีรีส์')

    try {
      const created = []
      for (let i = 0; i < validPosts.length; i++) {
        const p = validPosts[i]
        const ep = String(i + 1).padStart(2, '0')
        const post = await postDB.createPost({
          orgId: ctx.orgId,
          ownerUserId: ctx.userId,
          visibility,
          category,
          title: `${seriesName} EP.${ep}: ${p.title.trim()}`,
          body: p.body.trim(),
          format: FORMATS.includes(p.format) ? p.format : null,
          sourceIdea: idea,
          createdVia: 'ai',
          // ต้นฉบับเดียวกันติดทุกตอน — user "กู้คืน" ต้นฉบับได้จากตอนไหนก็ได้ ไม่ต้องเปิดตอนแรกเท่านั้น
          originalRevision: { title: null, body: idea },
        })
        created.push(post)
      }
      return Response.json({ success: true, data: { category, seriesName, posts: created } }, { status: 201 })
    } catch (error) {
      console.error('[POST /api/posts/ai/compose] series', error)
      return Response.json({ error: 'Internal Server Error' }, { status: 500 })
    }
  }

  // AI เคยคืน posts:[] มาแทน (สมัย outline) → ถ้าไม่มี body ที่ใช้ได้ ถือว่าผิดรูปแบบ ไม่เดาต่อ
  const aiBody = typeof ai?.body === 'string' ? ai.body.trim() : ''
  if (!aiBody) return Response.json({ error: 'AI ตอบกลับมาไม่ตรงรูปแบบที่ต้องการ' }, { status: 502 })
  const aiTitle = typeof ai?.title === 'string' && ai.title.trim() ? ai.title.trim() : null

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
