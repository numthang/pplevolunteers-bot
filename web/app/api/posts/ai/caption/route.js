// POST /api/posts/ai/caption — โควต + หัวข้อ + ไอเดียภาพประกอบ (ก้อน 5, ปรับ 2026-08-01)
//
// เดิมคืนแคปชัน (ประโยคที่ AI แต่งใหม่) — เปลี่ยนเป็นโควตที่ดึงจากเนื้อหาจริงแทน
// เพื่อกันการ "แต่งคำพูด" ที่ผู้เขียนไม่ได้พูด → คืน 3 อย่างในครั้งเดียว (นับโควตาครั้งเดียว)
// และ **ไม่เขียนทับเนื้อหาโพสต์** ผู้ใช้เลือกคัดลอกไปใช้เองในกล่องโน้ต/ตอนทำภาพ
import { postContext, editorName } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { saveSuggestion } from '@/db/posts/aiSuggestions.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAiJson, AiError } from '@/lib/ai.js'

const SYSTEM_PROMPT = `คุณเป็นครีเอทีฟงานสื่อของพรรคการเมืองไทย
จากเนื้อหาโพสต์ที่ให้มา ให้เสนอ:
1. โควต 3 แบบ — ต้องดึงมาจากเนื้อหาที่ให้มาเท่านั้น (ประโยค/คำพูดที่มีอยู่แล้วในเนื้อหา) ปรับถ้อยคำได้เล็กน้อยเพื่อให้สั้น/หวือหวา/น่าสนใจขึ้น แต่ห้ามเปลี่ยนความหมายหรือเติมข้อมูลที่ไม่มีในต้นฉบับ ยาวไม่เกิน 1-2 บรรทัด ใช้แปะบนภาพได้
2. หัวข้อ 3 แบบ — ใช้หลักการพาดหัวให้น่าติดตาม (ตั้งคำถาม/ใช้ตัวเลข/ชี้ความขัดแย้ง/สร้างความอยากรู้) สั้น กระชับ
3. ไอเดียภาพประกอบ 3 แบบ — ใช้หลักการเดียวกับหัวข้อ (ดึงดูดสายตา น่าติดตาม) บอกว่าจะถ่าย/ทำกราฟิกอะไร ทำได้จริงด้วยงบน้อย (ห้ามเสนอภาพที่ต้องจ้างโปรดักชัน) ควรโยงกับโควตหรือหัวข้อข้อใดข้อหนึ่งที่เสนอไป
4. Hashtag แนะนำ 1 ชุด (2-3 คำในชุดเดียว) — เกาะกระแส/ประเด็นในเนื้อหา ไม่ใช้คำกว้างเกินไปจนไม่มีความหมาย
5. ประโยคชวนแชร์/CTA 1 แบบ — ปิดท้ายให้คนแชร์/คอมเมนต์/ติดตามต่อ สั้น เป็นธรรมชาติ ไม่ยัดเยียด
6. คำแนะนำสำหรับบทความ 1 ข้อ — เลือกจุดที่ควรแก้ที่สุดจุดเดียว (เช่น hook เปิดเรื่องอ่อน/ย่อหน้ายาวไป/ประเด็นไม่ชัด) อธิบายสั้นๆ ว่าทำไม แล้ว**ยกตัวอย่างประกอบ**ให้เห็นภาพว่าแก้แบบไหน (ตัวอย่างมีไว้ประกอบคำแนะนำเท่านั้น ไม่ใช่การเขียนทับบทความจริง)
กติกา:
- โควตต้องมีที่มาในเนื้อหาจริงเสมอ ห้ามแต่งคำพูด/ตัวเลข/ชื่อที่ไม่มีในต้นฉบับ
- หัวข้อ/ไอเดียภาพ/hashtag/CTA อ้างได้เฉพาะสิ่งที่มีในเนื้อหา ห้ามแต่งข้อมูลใหม่
- ห้ามเสนอภาพที่มีหน้าคนจริงที่ระบุตัวได้ ถ้าเนื้อหาไม่ได้พูดถึงคนนั้น
- ภาษาไทย กระชับ
รูปแบบ JSON: {"quotes":["...","...","..."],"headlines":["...","...","..."],"imageIdeas":["...","...","..."],"hashtags":["...","..."],"cta":["..."],"articleTips":["..."]}`

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const ctx = await postContext(body.postId)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้โพสต์นี้' }, { status: 403 })
  }
  const source = (body.body ?? ctx.post.body ?? '').trim()
  if (!source) {
    return Response.json({ error: 'ยังไม่มีเนื้อหา — เขียนเนื้อหาก่อนแล้วค่อยขอโควต/หัวข้อ' }, { status: 400 })
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
    ].join('\n'), { orgId: ctx.orgId })

    // AI อาจคืนคีย์ไม่ตรง/ไม่ใช่ array — ตัดให้เหลือรูปร่างที่ UI ใช้ได้เท่านั้น
    const clean = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).slice(0, 5) : [])
    const quotes = clean(out.quotes)
    const headlines = clean(out.headlines)
    const imageIdeas = clean(out.imageIdeas)
    const hashtags = clean(out.hashtags)
    const cta = clean(out.cta).slice(0, 1)          // เหลือแค่ 1 แบบ — เยอะแล้วอ่านไม่ไหว เหมือน articleTips
    const articleTips = clean(out.articleTips).slice(0, 1) // ขอแค่ 1 ข้อ แต่ต้องมีตัวอย่างประกอบ — เยอะแล้วอ่านไม่ไหว
    if (!quotes.length && !headlines.length && !imageIdeas.length && !hashtags.length && !cta.length && !articleTips.length) {
      throw new AiError('AI ตอบกลับมาไม่ครบ ลองอีกครั้ง')
    }

    // เก็บไว้ให้เปิดมาอ่านซ้ำได้ (ตาราง post_ai_suggestions — ไม่แตะ post_episodes ไม่งั้น lockToken หมดอายุ)
    // insert ล้ม **ห้าม** ทำให้ request พัง ไม่งั้นเสียโควตา AI ฟรีทั้งที่ผลลัพธ์มาแล้ว
    let saved = null
    try {
      saved = await saveSuggestion({
        episodeId: ctx.post.id,
        kind: 'caption',
        payload: { quotes, headlines, imageIdeas, hashtags, cta, articleTips },
        userId: ctx.userId,
        userName: editorName(ctx.session),
      })
    } catch (e) {
      console.error('[caption saveSuggestion]', e.message)
    }

    return Response.json({ success: true, data: { quotes, headlines, imageIdeas, hashtags, cta, articleTips, saved } })
  } catch (error) {
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: 502 })
    console.error('[POST /api/posts/ai/caption]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
