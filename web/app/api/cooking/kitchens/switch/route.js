import { cookies } from 'next/headers'
import { resolveOwner } from '@/lib/cookingOwner.js'
import { isMember } from '@/db/cooking/kitchens.js'
import { KITCHEN_COOKIE } from '@/lib/cookingKitchen.js'

const COOKIE_OPTS = { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 }

// สลับครัวปัจจุบัน — ลอก pattern web/app/api/guild/switch/route.js (cookie + validate membership เสมอ)
export async function POST(req) {
  const { owner } = await resolveOwner()
  const { kitchenId } = await req.json().catch(() => ({}))
  if (!kitchenId) return Response.json({ error: 'kitchenId is required' }, { status: 400 })

  const ok = await isMember(Number(kitchenId), owner)
  if (!ok) return Response.json({ error: 'Forbidden: not a member of this kitchen' }, { status: 403 })

  const store = await cookies()
  store.set(KITCHEN_COOKIE, String(kitchenId), COOKIE_OPTS)
  return Response.json({ ok: true })
}
