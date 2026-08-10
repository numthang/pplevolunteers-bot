import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import { setOrgConfig, deleteOrgConfig } from '@/db/orgConfig.js'
import { getAiStatus } from '@/lib/aiCreds.js'
import aiCrypto from '@/../utils/aiCrypto.js'
import aiConstants from '@/../config/aiConstants.js'

const { encryptSecret, hasMasterKey } = aiCrypto
const { ORG_AI_KEY, PROVIDERS, DEFAULT_MODEL } = aiConstants

// GET/PUT /api/org/orgs/[id]/ai — API key + โมเดลของ org (owner only)
//
// ⛔ `ai_shared_quota_daily` **แก้ทางนี้ไม่ได้โดยตั้งใจ** — เป็นเพดานที่เจ้าของระบบตั้งให้
//    ถ้าเปิดให้ org แก้เอง ก็เท่ากับไม่มีโควตา (ตั้ง 999999 เองได้) · แก้ที่ org_config ตรงๆ เท่านั้น
async function ownerGate(params) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return { error: 'unauthorized', status: 401 }
  const orgId = Number((await params).id)
  const m = await getOrgMembership(orgId, userId)
  if (!m || m.status !== 'active' || m.role !== 'owner') return { error: 'forbidden', status: 403 }
  return { orgId }
}

export async function GET(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  // ไม่คืนตัว key ไม่ว่ากรณีใด — คืนแค่ "ตั้งไว้แล้วหรือยัง"
  return Response.json({
    ...await getAiStatus(g.orgId),
    providers: PROVIDERS,
    defaultModel: DEFAULT_MODEL,
    ready: hasMasterKey(),   // false = เซิร์ฟเวอร์ยังไม่ตั้ง AI_KEY_SECRET → เก็บ key ไม่ได้
  })
}

export async function PUT(req, { params }) {
  const g = await ownerGate(params)
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const body = await req.json().catch(() => ({}))

  if (body.provider !== undefined) {
    if (!PROVIDERS.includes(body.provider)) return Response.json({ error: 'ค่ายที่เลือกไม่รองรับ' }, { status: 400 })
    await setOrgConfig(g.orgId, ORG_AI_KEY.provider, body.provider)
  }

  // โมเดล: ว่าง = กลับไปใช้ค่าตั้งต้นของระบบ
  for (const [field, key] of [['modelLight', ORG_AI_KEY.modelLight], ['modelWriting', ORG_AI_KEY.modelWriting]]) {
    if (body[field] === undefined) continue
    const v = String(body[field] || '').trim()
    if (v) await setOrgConfig(g.orgId, key, v)
    else await deleteOrgConfig(g.orgId, key)
  }

  // key: ส่ง string = ตั้งใหม่ · ส่ง null = ลบทิ้ง (กลับไปยืม key กลาง) · ไม่ส่ง = ไม่แตะ
  for (const provider of PROVIDERS) {
    const field = `apiKey_${provider}`
    if (body[field] === undefined) continue

    if (body[field] === null) { await deleteOrgConfig(g.orgId, ORG_AI_KEY.apiKey[provider]); continue }

    const raw = String(body[field]).trim()
    if (!raw) continue
    if (!hasMasterKey()) {
      return Response.json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้ง AI_KEY_SECRET — เก็บ API key ไม่ได้' }, { status: 503 })
    }
    await setOrgConfig(g.orgId, ORG_AI_KEY.apiKey[provider], encryptSecret(raw))
  }

  return Response.json(await getAiStatus(g.orgId))
}
