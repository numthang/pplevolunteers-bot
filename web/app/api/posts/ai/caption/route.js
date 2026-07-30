// POST /api/posts/ai/caption — แคปชันสั้น + ไอเดียภาพประกอบ (ก้อน 5)
//
// รูปแบบที่ user เขียนไว้ในไฟล์ซีรีส์จริงคือ 📸 ภาพประกอบ + ✏️ แคปชันสั้น ต่อ 1 ตอน
// → คืนทั้ง 2 อย่างในครั้งเดียว (นับโควตาครั้งเดียว) และ **ไม่เขียนลง DB**
//   ผู้ใช้เลือกคัดลอกไปใช้เองในกล่องโน้ต/ตอนทำภาพ
import { postContext, editorName } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { saveSuggestion } from '@/db/posts/aiSuggestions.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAiJson, AiError } from '@/lib/ai.js'

const SYSTEM_PROMPT = `คุณเป็นครีเอทีฟงานสื่อของพรรคการเมืองไทย
จากเนื้อหาโพสต์ที่ให้มา ให้เสนอ:
1. แคปชันสั้น 3 แบบ — ยาวไม่เกิน 1 บรรทัด ใช้เป็นข้อความเปิด/ข้อความบนภาพได้ ห้ามใช้ hashtag เกิน 1 อัน
2. ไอเดียภาพประกอบ 3 แบบ — บอกว่าจะถ่าย/ทำกราฟิกอะไร ทำได้จริงด้วยงบน้อย (ห้ามเสนอภาพที่ต้องจ้างโปรดักชัน)
กติกา:
- อ้างได้เฉพาะสิ่งที่มีในเนื้อหา ห้ามแต่งข้อมูล/ตัวเลข/คำพูดของใครขึ้นมาใหม่
- ห้ามเสนอภาพที่มีหน้าคนจริงที่ระบุตัวได้ ถ้าเนื้อหาไม่ได้พูดถึงคนนั้น
- ภาษาไทย กระชับ
รูปแบบ JSON: {"captions":["...","...","..."],"imageIdeas":["...","...","..."]}`

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const ctx = await postContext(body.postId)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้โพสต์นี้' }, { status: 403 })
  }
  const source = (body.body ?? ctx.post.body ?? '').trim()
  if (!source) {
    return Response.json({ error: 'ยังไม่มีเนื้อหา — เขียนเนื้อหาก่อนแล้วค่อยขอแคปชัน' }, { status: 400 })
  }

  const quota = await consumeAiQuota(ctx.userId)
  if (!quota.ok) {
    return Response.json({ error: `ใช้ AI ครบโควตาวันนี้แล้ว (${quota.limit} ครั้ง/วัน)` }, { status: 429 })
  }

  try {
    const out = await askAiJson(SYSTEM_PROMPT, [
      `ชื่อโพสต์: ${ctx.post.title || '(ยังไม่ตั้งชื่อ)'}`,
      `หมวด: ${ctx.post.category || '(ไม่มี)'}`,
      '',
      'เนื้อหา:',
      source,
    ].join('\n'))

    // AI อาจคืนคีย์ไม่ตรง/ไม่ใช่ array — ตัดให้เหลือรูปร่างที่ UI ใช้ได้เท่านั้น
    const clean = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).slice(0, 5) : [])
    const captions = clean(out.captions)
    const imageIdeas = clean(out.imageIdeas)
    if (!captions.length && !imageIdeas.length) throw new AiError('AI ตอบกลับมาไม่ครบ ลองอีกครั้ง')

    // เก็บไว้ให้เปิดมาอ่านซ้ำได้ (ตาราง post_ai_suggestions — ไม่แตะ post_episodes ไม่งั้น lockToken หมดอายุ)
    // insert ล้ม **ห้าม** ทำให้ request พัง ไม่งั้นเสียโควตา AI ฟรีทั้งที่ผลลัพธ์มาแล้ว
    let saved = null
    try {
      saved = await saveSuggestion({
        episodeId: ctx.post.id,
        kind: 'caption',
        payload: { captions, imageIdeas },
        userId: ctx.userId,
        userName: editorName(ctx.session),
      })
    } catch (e) {
      console.error('[caption saveSuggestion]', e.message)
    }

    return Response.json({ success: true, data: { captions, imageIdeas, saved } })
  } catch (error) {
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: 502 })
    console.error('[POST /api/posts/ai/caption]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
