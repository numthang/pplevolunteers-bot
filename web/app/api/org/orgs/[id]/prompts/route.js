import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import { listPrompts, setPrompt, resetPrompt } from '@/db/orgAiPrompts.js'

// GET/PUT/DELETE /api/org/orgs/[id]/prompts — prompt ของ AI ทุกช่องที่ผูกกับโค้ด (owner only)
//
// owner only ด้วยเหตุผลเดียวกับ /ai (API key): prompt คุมว่า AI พูดอะไรในนามองค์กร
// คนที่แก้ได้ = คนที่รับผิดชอบผลลัพธ์ ไม่ใช่ทุกคนที่อยู่ใน org
//
// ⚠️ "ชุดกลาง" (org_id IS NULL) แก้ทางนี้ไม่ได้ — เป็นค่าตั้งต้นของทั้งระบบ
//    org แก้ได้แค่ทับของตัวเอง · ชุดกลางแก้ที่ config/aiPrompts.js (โค้ด) หรือ /bot/global/ai (เฉพาะ mode)
async function ownerGate(params) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return { error: 'unauthorized', status: 401 }
  const orgId = Number((await params).id)
  const m = await getOrgMembership(orgId, userId)
  if (!m || m.status !== 'active' || m.role !== 'owner') return { error: 'forbidden', status: 403 }
  return { orgId, userId }
}

export async function GET(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })
  return Response.json({ prompts: await listPrompts(g.orgId) })
}

// PUT { value, prompt } — แก้ทับช่องนี้ของ org นี้
export async function PUT(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const body = await req.json().catch(() => ({}))
  const value = String(body.value || '').trim()
  const prompt = String(body.prompt || '').trim()
  if (!value) return Response.json({ error: 'ไม่ได้ระบุว่าจะแก้ช่องไหน' }, { status: 400 })
  if (!prompt) return Response.json({ error: 'prompt ว่าง — ถ้าอยากกลับไปใช้ค่าตั้งต้น กด "คืนค่าเดิม"' }, { status: 400 })

  const res = await setPrompt(g.orgId, value, prompt, g.userId)
  if (res.unknown) return Response.json({ error: 'ไม่รู้จักช่องนี้' }, { status: 404 })
  if (!res.ok) {
    // เช็คตั้งแต่ตอนเซฟ ไม่ปล่อยให้ไปพังตอนยิง AI (error ตรงนั้นเดาสาเหตุไม่ได้เลย)
    return Response.json({
      error: `prompt นี้ต้องพูดถึงคีย์เหล่านี้ให้ครบ ไม่งั้นระบบอ่านคำตอบของ AI ไม่ได้: ${res.missing.join(', ')}`,
      missing: res.missing,
    }, { status: 400 })
  }
  return Response.json({ prompts: await listPrompts(g.orgId) })
}

// DELETE ?value=... — คืนค่าตั้งต้น (ลบแถว override ทิ้ง)
export async function DELETE(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const value = new URL(req.url).searchParams.get('value')
  if (!value) return Response.json({ error: 'ไม่ได้ระบุว่าจะคืนช่องไหน' }, { status: 400 })
  await resetPrompt(g.orgId, value)
  return Response.json({ prompts: await listPrompts(g.orgId) })
}
