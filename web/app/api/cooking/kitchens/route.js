import { resolveKitchen } from '@/lib/cookingKitchen.js'
import { getMyKitchens } from '@/db/cooking/kitchens.js'

// รายชื่อครัวที่ตัวตนปัจจุบันเป็นสมาชิกอยู่ — ใช้เรนเดอร์ตัวสลับครัว
export async function GET() {
  const { kitchenId, owner } = await resolveKitchen()
  const kitchens = await getMyKitchens(owner)
  return Response.json({ kitchens, currentKitchenId: kitchenId })
}
