import { randomUUID } from 'crypto'
import { getAllMenus, createMenu } from '@/db/cooking/menus.js'
import { resolveOwner } from '@/lib/cookingOwner.js'
import { normalizeMenuInput } from '@/lib/cookingMenu.js'

// เมนูทั้งหมด (public wiki เดียว) — client โหลดเข้า memory แล้ว match เอง (deterministic, ฟรี)
// ไม่ส่ง owner id ดิบออกไป (กัน PII) — ไม่มี mine/by แล้ว เพราะทุกคนแก้ได้เท่ากันหมด
export async function GET() {
  const menus = await getAllMenus()
  const out = menus.map(({ owner: _o, ...m }) => m)
  return Response.json({ menus: out })
}

// เพิ่มเมนูใหม่ (public ทันที) · id gen ฝั่ง server · owner เก็บไว้เป็น "ใครเพิ่ม" เฉยๆ
// ⚠️ ต้อง login (Discord) ถึงจะเขียนได้ — ดูได้ทุกคนไม่ต้อง login แต่แก้ต้อง login กันคนแปลกหน้าป่วน wiki
export async function POST(req) {
  const { owner, isAnon } = await resolveOwner()
  if (isAnon) return Response.json({ error: 'ต้อง login ก่อนถึงจะเพิ่มเมนูได้' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { menu, error } = normalizeMenuInput(body)
  if (error) return Response.json({ error }, { status: 400 })

  menu.id = 'u-' + randomUUID().slice(0, 12)
  const { owner: _o, ...saved } = await createMenu(owner, menu)
  return Response.json({ menu: saved }, { status: 201 })
}
