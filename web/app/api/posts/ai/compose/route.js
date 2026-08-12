import { postsContext } from '@/lib/postsGuard.js'
import { canWritePost } from '@/lib/postsAccess.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAiJson, AiError } from '@/lib/ai.js'
import * as postDB from '@/db/posts/episodes.js'

// ผู้ช่วยบรรณาธิการงานสื่อการเมืองไทย — เรียบเรียงของดิบที่ user พิมพ์มาเป็นโพสต์
// (ของเดิม `ai/outline` ซอยบทความยาวออกเป็นชุดโพสต์แบบ AI ตัดสินใจเองว่าจะออกกี่ตอน — ถูกตัดทิ้ง 2026-08-09
//  เพราะ user ไม่ได้อยากให้ AI แบ่งเอง แต่ยังอยากได้ตัวเลือก series กลับมาถ้า *user เป็นคนระบุจำนวนตอนเอง* · เคาะ 2026-08-12
//  ต่างจาก outline เดิมตรงที่ series mode นี้ร่าง body เต็มทุกตอนทันที ไม่ใช่แค่ gist)
const FORMATS = ['text', 'image', 'quote']
const MIN_EPISODES = 2
const MAX_EPISODES = 12

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

// series mode: user ระบุจำนวนตอนเอง (ไม่ใช่ AI ตัดสินใจ) — ร่าง body เต็มทุกตอนทันที ไม่ใช่แค่โครง/gist
// title แต่ละตอน = "<ชื่อซีรีส์สั้นๆ> EP.xx: <ชื่อตอน>" — ต่อ EP.xx เองฝั่ง server กันเลขเพี้ยน ไม่พึ่ง AI นับ (เคาะ 2026-08-12)
const seriesSystemPrompt = (count) => `คุณเป็นผู้ช่วยบรรณาธิการงานสื่อของพรรคการเมืองไทย
ผู้ใช้จะโยน "ของดิบ" มาให้ — อาจเป็นไอเดียสั้นๆ หรือความคิด/บทความยาวที่พิมพ์รัวๆ ยังไม่เรียบเรียง
งานของคุณคือแบ่งเนื้อหาออกเป็น **ชุดโพสต์โซเชียลจำนวน ${count} ตอนพอดี** ที่ต่อกันเป็นซีรีย์ แต่ละตอนโพสต์ได้จริงทันที
กติกา:
- สร้างโพสต์ให้ครบ ${count} ตอนเป๊ะ ห้ามน้อยหรือมากกว่านี้
- แต่ละตอนมีเนื้อหาเต็ม (ไม่ใช่แค่หัวข้อหรือ gist) อ่านจบในตัวเองได้ แต่เรียงลำดับให้ต่อกันเป็นเรื่องเดียว
- แบ่งประเด็นตามเนื้อหาจริงในต้นฉบับ ห้ามยัดเนื้อหาซ้ำข้ามตอน
- **ห้ามเพิ่มข้อเท็จจริง ตัวเลข ชื่อคน หรือข้ออ้างที่ไม่มีในต้นฉบับ**
- รักษาน้ำเสียง/จุดยืนของผู้เขียนไว้ ไม่ต้องทำให้เป็นทางการกว่าเดิม
- แต่ละตอนความยาวปกติ 3-8 ย่อหน้าสั้น เขียนเป็นย่อหน้าปกติ ไม่ใส่ markdown ไม่ใส่หัวข้อกำกับ
- seriesName = ชื่อซีรีส์ **สั้นมาก** (2-4 คำ) ใช้ร่วมกันทั้ง ${count} ตอน
- title (ต่อตอน) = ชื่อตอนสั้นๆ เฉพาะของตอนนั้น **ห้ามใส่เลขตอนหรือชื่อซีรีส์ซ้ำ** (ระบบจะต่อ "ชื่อซีรีส์ EP.xx:" ให้เองด้านหน้า)
- category = ชื่อหมวดสั้นๆ 1 ชื่อ ใช้ร่วมกันทั้ง ${count} ตอน

ตอบเป็น JSON รูปแบบนี้เท่านั้น:
{"category": "ชื่อหมวด", "seriesName": "ชื่อซีรีส์สั้นๆ", "posts": [{"title": "ชื่อตอน", "body": "เนื้อหาเต็มของตอนนี้", "format": "text|image|quote"}]}`

/**
 * POST /api/posts/ai/compose — ประตูหลักเข้าโมดูล
 * body { idea, visibility='personal', category?, episodeCount? }
 * episodeCount ไม่ใส่/1 → เรียบเรียงเป็นโพสต์เดียว (post_episodes 1 แถว)
 * episodeCount 2-12 → series ที่ user ระบุจำนวนตอนเอง (post_episodes หลายแถว หมวดเดียวกัน)
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

  // series mode ต้อง user ระบุจำนวนตอนเอง ไม่ใช่ AI ตัดสินใจ — ค่านอกช่วง/ไม่ใช่ตัวเลข = ถือเป็นโหมดโพสต์เดียว
  const rawCount = Number(body.episodeCount)
  const episodeCount = Number.isInteger(rawCount) && rawCount >= MIN_EPISODES && rawCount <= MAX_EPISODES ? rawCount : null

  const quota = await consumeAiQuota(ctx.userId)
  if (!quota.ok) {
    return Response.json({ error: `ใช้ AI ครบโควตาวันนี้แล้ว (${quota.limit} ครั้ง/วัน)` }, { status: 429 })
  }

  let ai
  try {
    ai = await askAiJson(episodeCount ? seriesSystemPrompt(episodeCount) : SYSTEM_PROMPT, idea, { orgId: ctx.orgId })
  } catch (error) {
    // โควตายืม key กลางหมด = 429 (ผู้ใช้แก้เองได้ด้วยการใส่ key องค์กร) · AI ล่มจริง = 502
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.code === 'quota' ? 429 : 502 })
    console.error('[POST /api/posts/ai/compose]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  const category = body.category || (typeof ai?.category === 'string' ? ai.category.trim() : null) || null

  if (episodeCount) {
    const rawPosts = Array.isArray(ai?.posts) ? ai.posts : []
    const validPosts = rawPosts.filter(p => p && typeof p.title === 'string' && p.title.trim() && typeof p.body === 'string' && p.body.trim())
    if (validPosts.length < 1) return Response.json({ error: 'AI ตอบกลับมาไม่ตรงรูปแบบที่ต้องการ' }, { status: 502 })
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
