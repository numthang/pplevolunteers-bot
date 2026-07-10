import { randomUUID } from 'crypto'
import { getAllMenus, createMenu } from '@/db/cooking/menus.js'
import { resolveOwner } from '@/lib/cookingOwner.js'
import { normalizeMenuInput } from '@/lib/cookingMenu.js'

// เมนูทั้งหมด (public) — client โหลดเข้า memory แล้ว match เอง (deterministic, ฟรี)
// ไม่ส่ง owner id ดิบออกไป (กัน PII) — แนบแค่ mine (แก้ได้ไหม) + by (ป้ายเจ้าของ)
export async function GET() {
  const { owner } = await resolveOwner()
  const menus = await getAllMenus()
  const out = menus.map(({ owner: o, ...m }) => ({
    ...m,
    mine: o != null && o === owner,
    by: o == null ? 'ระบบ' : o === owner ? 'ฉัน' : 'สมาชิก',
  }))
  return Response.json({ menus: out })
}

// เพิ่มเมนูใหม่ของผู้ใช้ (owner = uid, source='U') · id gen ฝั่ง server
export async function POST(req) {
  const { owner } = await resolveOwner()
  const body = await req.json().catch(() => null)
  const { menu, error } = normalizeMenuInput(body)
  if (error) return Response.json({ error }, { status: 400 })

  menu.id = 'u-' + randomUUID().slice(0, 12)
  const { owner: _o, ...saved } = await createMenu(owner, menu)
  return Response.json({ menu: { ...saved, mine: true, by: 'ฉัน' } }, { status: 201 })
}
