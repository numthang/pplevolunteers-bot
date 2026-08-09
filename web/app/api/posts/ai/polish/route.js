// POST /api/posts/ai/polish — เกลาสำนวนเนื้อหาที่เขียนไว้แล้ว (ก้อน 5)
//
// ต่างจาก /ai/draft ที่ "เขียนให้" — อันนี้ **ห้ามเพิ่มประเด็นใหม่** แตะแค่ภาษา
// (ไม่เขียนลง DB เหมือนกัน — คืนข้อความให้ editor ใส่ในกล่องแล้วให้ autosave เซฟเอง
//  ผู้ใช้จึงเห็นก่อนว่าจะได้อะไร และมีประวัติการแก้รองรับถ้าไม่ชอบ)
import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAi, AiError } from '@/lib/ai.js'

const TONES = {
  polish: 'เกลาให้อ่านลื่น ตัดคำฟุ่มเฟือย แก้คำผิด/วรรคตอน — โทนเดิม ความยาวใกล้เดิม',
  shorter: 'ย่อให้สั้นลงประมาณครึ่งหนึ่ง เก็บใจความสำคัญไว้ทั้งหมด',
  friendly: 'ปรับให้เป็นกันเองขึ้น อ่านง่ายเหมือนเล่าให้เพื่อนฟัง แต่ไม่กวนและไม่ทางการจนแข็ง',
}

const SYSTEM_PROMPT = `คุณเป็นบรรณาธิการภาษาไทยของทีมสื่อพรรคการเมือง
งานของคุณคือปรับ "ภาษา" ของโพสต์ที่เขียนมาแล้ว
กติกาเหล็ก:
- **ห้ามเพิ่มประเด็น ข้อมูล ตัวเลข หรือข้ออ้างใหม่ที่ไม่มีในต้นฉบับ**
- ห้ามลบประเด็นที่ต้นฉบับตั้งใจพูด (เว้นแต่ผู้ใช้สั่งให้ย่อ)
- ช่วงที่เป็น [ใส่ตรงนี้ — …] คือที่เว้นให้เจ้าของโพสต์เขียนเอง **ต้องคงไว้ทั้งบล็อกแบบเดิมเป๊ะ**
- คงอิโมจิ/ขึ้นบรรทัดใหม่ที่ตั้งใจไว้
- ตอบเป็นเนื้อหาโพสต์ล้วนๆ ห้ามมีคำอธิบาย/หัวข้อ/markdown ครอบ`

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const ctx = await postContext(body.postId)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้โพสต์นี้' }, { status: 403 })
  }
  const source = (body.body ?? ctx.post.body ?? '').trim()   // ส่งของที่กำลังพิมพ์อยู่มาได้ (ยังไม่ autosave)
  if (!source) {
    return Response.json({ error: 'ยังไม่มีเนื้อหาให้เกลา — เขียนก่อนหรือใช้ "ร่างด้วย AI"' }, { status: 400 })
  }

  const tone = TONES[body.tone] ? body.tone : 'polish'

  const quota = await consumeAiQuota(ctx.userId)
  if (!quota.ok) {
    return Response.json({ error: `ใช้ AI ครบโควตาวันนี้แล้ว (${quota.limit} ครั้ง/วัน)` }, { status: 429 })
  }

  try {
    const polished = await askAi(SYSTEM_PROMPT, [
      `สิ่งที่ต้องทำ: ${TONES[tone]}`,
      `ชื่อโพสต์: ${ctx.post.title || '(ยังไม่ตั้งชื่อ)'}`,
      '',
      'ต้นฉบับ:',
      source,
    ].join('\n'), { orgId: ctx.orgId })
    return Response.json({ success: true, data: { body: polished, tone } })
  } catch (error) {
    // โควตายืม key กลางหมด = 429 (ผู้ใช้แก้เองได้ด้วยการใส่ key องค์กร) · AI ล่มจริง = 502
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.code === 'quota' ? 429 : 502 })
    console.error('[POST /api/posts/ai/polish]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
