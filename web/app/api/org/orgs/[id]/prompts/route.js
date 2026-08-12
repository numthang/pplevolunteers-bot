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

// PUT { value, head } — แก้ทับ **เฉพาะ head** ของช่องนี้
//
// ⛔ ไม่รับ `format` จาก client ไม่ว่าจะส่งมาหรือไม่ — บล็อกประกาศรูปแบบ JSON มาจาก
//    config/aiPrompts.js เสมอ นี่คือด่านที่ทำให้ผู้ใช้ทำ prompt พังไม่ได้ตั้งแต่ต้นทาง
//    (ไม่ใช่ validate ทีหลัง — ค่าที่ส่งมาถูกโยนทิ้งเฉยๆ ถ้าไม่ใช่ head)
export async function PUT(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const body = await req.json().catch(() => ({}))
  const value = String(body.value || '').trim()
  const head = String(body.head || '').trim()
  if (!value) return Response.json({ error: 'ไม่ได้ระบุว่าจะแก้ช่องไหน' }, { status: 400 })
  if (!head) return Response.json({ error: 'คำสั่งว่าง — ถ้าอยากกลับไปใช้ค่าตั้งต้น กด "คืนค่าเดิม"' }, { status: 400 })

  const res = await setPrompt(g.orgId, value, head, g.userId)
  if (res.unknown) return Response.json({ error: 'ไม่รู้จักช่องนี้' }, { status: 404 })
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
