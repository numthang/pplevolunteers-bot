// POST /api/posts/ai/guided — AI หาจุดที่ควรแก้ที่สุด แล้วแก้ให้ในรอบเดียว (2026-09-05)
//
// ที่มา: โหมด "ให้คำแนะนำ" (/ai/caption ข้อ articleTips) วิจารณ์ว่าจุดไหนควรแก้ + ยกตัวอย่างวิธีแก้
// แต่ prompt สั่งห้ามเขียนทับจริง → คนต้องไปแก้เอง · อันนี้คือ "แล้วแก้ให้เลย" ในคลิกเดียว
//
// เส้นแบ่งกับพี่น้องมัน:
//   /ai/draft   — เกลาให้สมบูรณ์แบบทั่วๆ ไป (หรือเขียนจากศูนย์ถ้ายังไม่มีเนื้อหา)
//   /ai/polish  — แตะแค่ภาษา ห้ามขยับโครง
//   ที่นี่       — วินิจฉัยจุดอ่อนก่อน แล้วรื้อแก้ตรงจุดนั้น + คืน advice บอกว่าแก้อะไร
//
// ไม่เขียนลง DB เหมือนทุกตัวในโฟลเดอร์นี้ — คืนข้อความให้ editor ใส่กล่องแล้วให้ autosave เซฟเอง
// (ผู้ใช้เห็นก่อนว่าได้อะไร + ฉบับเดิมถูกเก็บลงประวัติฝั่ง client ก่อนทับเสมอ)
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
    return Response.json({ error: 'ยังไม่มีเนื้อหาให้แก้ — เขียนก่อนหรือใช้ "ร่างใหม่ทั้งหมด"' }, { status: 400 })
  }

  const quota = await consumeAiQuota(ctx.userId)
  if (!quota.ok) {
    return Response.json({ error: `ใช้ AI ครบโควตาวันนี้แล้ว (${quota.limit} ครั้ง/วัน)` }, { status: 429 })
  }

  try {
    const out = await askAiJson(await getPrompt('posts.guided', ctx.orgId), [
      `ชื่อโพสต์: ${ctx.post.title || '(ยังไม่ตั้งชื่อ)'}`,
      `หมวด: ${ctx.post.category || '(ไม่มี)'}`,
      '',
      'ต้นฉบับ:',
      source,
    ].join('\n'), { orgId: ctx.orgId })

    // ได้ advice มาแต่ body หาย = ใช้ไม่ได้เลย (ทั้งหน้าที่ของโหมดนี้คือแก้ให้) — ให้กดใหม่ดีกว่าเขียนทับด้วยของว่าง
    const drafted = typeof out.body === 'string' ? out.body.trim() : ''
    if (!drafted) throw new AiError('AI ตอบกลับมาไม่ครบ ลองอีกครั้ง')
    const advice = typeof out.advice === 'string' ? out.advice.trim() : ''

    return Response.json({ success: true, data: { body: drafted, advice } })
  } catch (error) {
    // โควตายืม key กลางหมด = 429 (ผู้ใช้แก้เองได้ด้วยการใส่ key องค์กร) · AI ล่มจริง = 502
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.code === 'quota' ? 429 : 502 })
    console.error('[POST /api/posts/ai/guided]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
