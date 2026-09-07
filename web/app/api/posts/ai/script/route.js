// POST /api/posts/ai/script — แปลงโพสต์ที่เขียนไว้แล้วให้เป็น "บทพูด" สำหรับอ่านหน้ากล้อง (2026-09-08)
//
// ที่มา: user ต้องทำคลิปเพราะคนเสพวิดีโอมากกว่าอ่าน แต่ตัดต่อไม่เป็นและไม่ชอบทำคลิป
// ทางออกที่ถูกที่สุดคือ **ไม่ต้องตัดต่อเลย** — มีบทให้อ่านจากจอแล้วอัดจบในเทคเดียว
// หน้าอ่าน (teleprompter) อยู่ที่ /posts/[id]/script
//
// เส้นแบ่งกับพี่น้องมัน:
//   /ai/polish  — แตะแค่ภาษาของ "บทเขียน" ยังเป็นโพสต์อยู่
//   /ai/guided  — วินิจฉัยจุดอ่อนแล้วรื้อแก้ ยังเป็นโพสต์อยู่
//   ที่นี่       — เปลี่ยน **สื่อ** จากอ่านเป็นพูด · ห้ามแตะ body เดิม เก็บลง bodies.script แทน
//
// ⛔ ไม่เขียนลง DB เหมือนทุกตัวในโฟลเดอร์นี้ — ทุก PATCH bump updated_at ทำให้ lockToken ของ
//    editor หมดอายุ แล้ว autosave เด้ง 409 ทันที (bug-071) · คืนข้อความให้ editor เซฟเองด้วย token ของมัน
import { postContext } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAiJson, AiError } from '@/lib/ai.js'
import { getPrompt } from '@/db/orgAiPrompts.js'

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const ctx = await postContext(body.postId)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้โพสต์นี้' }, { status: 403 })
  }
  const source = (body.body ?? ctx.post.body ?? '').trim()   // ส่งของที่กำลังพิมพ์อยู่มาได้ (ยังไม่ autosave)
  if (!source) {
    return Response.json({ error: 'ยังไม่มีเนื้อหาให้แปลงเป็นบทพูด — เขียนโพสต์ก่อน' }, { status: 400 })
  }

  const quota = await consumeAiQuota(ctx.userId)
  if (!quota.ok) {
    return Response.json({ error: `ใช้ AI ครบโควตาวันนี้แล้ว (${quota.limit} ครั้ง/วัน)` }, { status: 429 })
  }

  try {
    const out = await askAiJson(await getPrompt('posts.script', ctx.orgId), [
      `ชื่อโพสต์: ${ctx.post.title || '(ยังไม่ตั้งชื่อ)'}`,
      `หมวด: ${ctx.post.category || '(ไม่มี)'}`,
      '',
      'ต้นฉบับ:',
      source,
    ].join('\n'), { orgId: ctx.orgId })

    const script = typeof out.script === 'string' ? out.script.trim() : ''
    if (!script) throw new AiError('AI ตอบกลับมาไม่ครบ ลองอีกครั้ง')

    return Response.json({ success: true, data: { script } })
  } catch (error) {
    // โควตายืม key กลางหมด = 429 (ผู้ใช้แก้เองได้ด้วยการใส่ key องค์กร) · AI ล่มจริง = 502
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.code === 'quota' ? 429 : 502 })
    console.error('[POST /api/posts/ai/script]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
