// POST /api/posts/ai/review — AI บรรณาธิการตรวจเนื้อหาก่อนเผยแพร่
//
// ⛔ นี่คือ "ผู้ช่วยตรวจ" ไม่ใช่ "ผู้อนุมัติ" — ห้ามคืนคำตัดสินผ่าน/ไม่ผ่าน
//    เอาป้าย "ผ่านได้เลย" ไปแขวนข้างปุ่มอนุมัติ = AI อนุมัติแทนคนจริงๆ แค่ไม่ได้เขียนลง DB
//    (บรรณาธิการที่งานล้นจะกดตามป้าย) → คืนแค่ "นับจำนวนที่พบ" ที่ **เรานับเองจาก risks**
//    ไม่ใช่ให้ AI สรุปให้ · การตัดสินใจอนุมัติอยู่ที่ /api/posts/[id]/status เหมือนเดิม ไม่แตะ
//
// เก็บผลลง post_ai_suggestions kind='review' (ตารางเดียวกับ caption — `kind` เป็น VARCHAR
// ไม่มี CHECK อยู่แล้ว จึงไม่ต้อง migration) เหตุผลที่ไม่เก็บบน post_episodes: bug-071 (lockToken)
import { postContext, editorName } from '@/lib/postsGuard.js'
import { canEditPost } from '@/lib/postsAccess.js'
import { saveSuggestion } from '@/db/posts/aiSuggestions.js'
import { consumeAiQuota } from '@/lib/postsAiQuota.js'
import { askAiJson, AiError } from '@/lib/ai.js'

// 9 หมวดที่ตรวจ — ต้องตรงกับ RISK_LABEL ใน PostEditor.jsx (UI lookup label จาก category)
export const RISK_CATEGORIES = [
  'defamation',
  'factual_risk',
  'privacy',
  'attack_tone',
  'sexual_harassment',
  'victim_blaming',
  'vulnerable_group',
  'divisive',
  'party_tone',
]

const SEVERITIES = ['high', 'medium', 'low']

const SYSTEM_PROMPT = `คุณเป็นบรรณาธิการอาวุโสที่ตรวจเนื้อหาก่อนเผยแพร่ ให้เพจทางการของพรรคการเมืองไทย
หน้าที่คุณคือ**ชี้จุดเสี่ยง** ไม่ใช่ตรวจสำนวนหรือไวยากรณ์ และไม่ใช่ตัดสินว่าโพสต์นี้ผ่านหรือไม่ผ่าน

ตรวจตามหมวดนี้เท่านั้น (ใช้ค่า category ตามนี้เป๊ะๆ):
- defamation — พาดพิงบุคคล/องค์กรที่สามในทางเสียหาย โดยไม่มีหลักฐานรองรับในเนื้อหา เสี่ยงถูกฟ้องหมิ่นประมาท
- factual_risk — ตัวเลข เหตุการณ์ หรือคำพูดที่อ้างถึงแบบไม่มีที่มาชัดเจน เสี่ยงเป็นข้อมูลเท็จ (พ.ร.บ.คอมพิวเตอร์ ม.14)
- privacy — เปิดเผยข้อมูลส่วนบุคคล (ชื่อ-นามสกุลเต็มของผู้เสียหาย เลขบัตร เบอร์โทร ที่อยู่ ใบหน้าเด็ก) โดยไม่ระบุว่าได้รับความยินยอม
- attack_tone — โจมตีหรือดูถูกบุคคล/กลุ่มด้วยถ้อยคำ แทนที่จะวิจารณ์ด้วยข้อเท็จจริงหรือนโยบาย
- sexual_harassment — เนื้อหาเชิงเพศที่ไม่เหมาะสม หรือสื่อไปในทางคุกคามทางเพศ
- victim_blaming — กล่าวโทษหรือตั้งคำถามถึงความผิดของผู้เสียหาย แทนที่จะพุ่งไปที่ผู้กระทำ
- vulnerable_group — กระทบกลุ่มเปราะบาง (เด็ก ผู้เสียหายคดีอ่อนไหว ผู้พิการ ชาติพันธุ์ แรงงานข้ามชาติ) โดยไม่ระมัดระวังพอ
- divisive — ปลุกปั่นหรือสร้างความเกลียดชัง/แตกแยกเกินเหตุ (คนละเรื่องกับการวิจารณ์นโยบายตามปกติ ซึ่งเป็นเรื่องปกติของพรรคการเมือง)
- party_tone — ขัดกับภาพลักษณ์เพจทางการของพรรค เช่น ใช้อารมณ์นำข้อเท็จจริง พาดหัวเกินจริงแบบ clickbait ภาษาไม่เป็นทางการเกินไป

กติกาสำคัญ:
- **รายงานเฉพาะจุดที่บรรณาธิการตัวจริงจะหยุดแล้วทักจริงๆ** ถ้าจับผิดทุกอย่างจนล้น คนอ่านจะเลิกอ่านทั้งหมด
- ไม่พบความเสี่ยงเลย ให้คืน risks เป็น array ว่าง — ไม่ต้องหาเรื่องมาเติมให้ครบ
- ห้ามสมมติสถานการณ์หรือข้อมูลที่ไม่มีในเนื้อหา
- excerpt ต้อง**คัดลอกคำต่อคำจากเนื้อหาต้นฉบับ** ห้ามเรียบเรียงใหม่หรือแต่งขึ้นเอง ถ้าเป็นความเสี่ยงของภาพรวมทั้งโพสต์ที่ชี้ประโยคเดียวไม่ได้ ให้ใส่ excerpt เป็นสตริงว่าง
- severity: "high" = ควรแก้ก่อนเผยแพร่ · "medium" = ควรพิจารณา · "low" = สังเกตไว้
- reason และ suggestion เขียนสั้น ตรงประเด็น ภาษาไทย
- **ห้ามสรุปว่าโพสต์นี้ผ่านหรือไม่ผ่าน** คนตัดสินคือบรรณาธิการ ไม่ใช่คุณ

รูปแบบ JSON: {"risks":[{"category":"defamation","severity":"high","excerpt":"ข้อความที่คัดจากต้นฉบับ","reason":"...","suggestion":"..."}]}`

/** ตัดช่องว่างซ้ำ/ขึ้นบรรทัดออก เพื่อเทียบว่า excerpt มาจากต้นฉบับจริงไหม (AI มักคัดมาแล้ววรรคเพี้ยน) */
const flat = s => s.replace(/\s+/g, ' ').trim()

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const ctx = await postContext(body.postId)
  if (ctx.error) return ctx.error

  if (!canEditPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้โพสต์นี้' }, { status: 403 })
  }

  const source = (body.body ?? ctx.post.body ?? '').trim()
  if (!source) {
    return Response.json({ error: 'ยังไม่มีเนื้อหา — เขียนเนื้อหาก่อนแล้วค่อยให้ AI ตรวจ' }, { status: 400 })
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

    const flatSource = flat(source)

    // AI คืนรูปร่างเพี้ยนได้เสมอ — กรองให้เหลือเฉพาะที่ UI ใช้ได้จริง
    // (ต่างจาก clean() ของ caption ที่กรอง string ล้วน — ที่นี่เป็น object ต้องเช็ครายฟิลด์)
    const risks = (Array.isArray(out.risks) ? out.risks : [])
      .filter(r => r && typeof r === 'object')
      .map(r => {
        const excerpt = typeof r.excerpt === 'string' ? r.excerpt.trim() : ''
        return {
          category: RISK_CATEGORIES.includes(r.category) ? r.category : 'party_tone',
          severity: SEVERITIES.includes(r.severity) ? r.severity : 'medium',
          // ⛔ excerpt ที่หาไม่เจอในต้นฉบับ = AI กุคำพูดขึ้นมา → ตัดทิ้ง แต่เก็บ finding ไว้
          //    เครื่องมือที่มีหน้าที่จับการกุข้อมูล ห้ามกุเสียเอง (บทเรียนเดียวกับ ai/caption)
          excerpt: excerpt && flatSource.includes(flat(excerpt)) ? excerpt : '',
          reason: typeof r.reason === 'string' ? r.reason.trim() : '',
          suggestion: typeof r.suggestion === 'string' ? r.suggestion.trim() : '',
        }
      })
      .filter(r => r.reason)          // ไม่มีเหตุผล = ไม่มีอะไรให้บรรณาธิการอ่าน ทิ้ง
      .slice(0, 12)

    // เรียงหนักขึ้นก่อน — บรรณาธิการอ่านจากบนลงล่าง ของสำคัญต้องไม่จมท้าย
    const order = { high: 0, medium: 1, low: 2 }
    risks.sort((a, b) => order[a.severity] - order[b.severity])

    // ⛔ นับเอง ไม่ให้ AI สรุป — ตัวเลขที่ AI นับเองเคยเพี้ยน และนี่ไม่ใช่คำตัดสินผ่าน/ไม่ผ่าน
    const counts = {
      high: risks.filter(r => r.severity === 'high').length,
      medium: risks.filter(r => r.severity === 'medium').length,
      low: risks.filter(r => r.severity === 'low').length,
    }

    // reviewedAt = ตรวจกับเนื้อหา ณ เวลานี้ · UI เทียบกับ post.updated_at เพื่อติดป้าย "ฉบับก่อนหน้า"
    // ไม่งั้นผลตรวจเก่าจะดูเหมือนยังใช้ได้ ทั้งที่ excerpt ชี้ข้อความที่ถูกแก้ไปแล้ว
    const payload = { risks, counts, reviewedAt: new Date().toISOString() }

    // insert ล้ม **ห้าม** ทำให้ request พัง ไม่งั้นเสียโควตาฟรีทั้งที่ผลมาแล้ว (เหมือน ai/caption)
    let saved = null
    try {
      saved = await saveSuggestion({
        episodeId: ctx.post.id,
        kind: 'review',
        payload,
        userId: ctx.userId,
        userName: editorName(ctx.session),
      })
    } catch (e) {
      console.error('[review saveSuggestion]', e.message)
    }

    return Response.json({ success: true, data: { ...payload, saved } })
  } catch (error) {
    // โควตายืม key กลางหมด = 429 (ผู้ใช้แก้เองได้ด้วยการใส่ key องค์กร) · AI ล่มจริง = 502
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.code === 'quota' ? 429 : 502 })
    console.error('[POST /api/posts/ai/review]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
