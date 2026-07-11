import { cookies } from 'next/headers'
import { resolveOwner } from '@/lib/cookingOwner.js'
import { isMember, getMyKitchens, createKitchen } from '@/db/cooking/kitchens.js'

// รากฐาน multi-kitchen: pantry/history ผูกกับ "ครัว" (หลายคนช่วยกันจัดการครัวเดียวกันได้)
// ไม่ใช่ผูกกับตัวตนคนเดียวเหมือนเดิม — ลอก pattern lib/guildContext.js (cookie + validate membership ทุกครั้ง)
export const KITCHEN_COOKIE = 'cooking_kitchen_id'
const YEAR = 60 * 60 * 24 * 365

// คืนครัวที่ request นี้ทำงานอยู่ + owner identity (ยังต้องใช้ resolveOwner เพื่อรู้ตัวตนสำหรับเช็ค membership)
// auto สร้างครัวแรกให้ถ้ายังไม่เคยมีเลย (zero setup สำหรับ user ใหม่)
export async function resolveKitchen() {
  const { owner, isAnon } = await resolveOwner()
  const store = await cookies()
  const selected = store.get(KITCHEN_COOKIE)?.value ? Number(store.get(KITCHEN_COOKIE).value) : null

  if (selected) {
    const ok = await isMember(selected, owner)
    if (ok) return { kitchenId: selected, owner, isAnon }
  }

  // cookie ไม่มี/ไม่ valid (เช่น ถูกเตะออกจากครัวนั้นแล้ว) → กลับไปครัวแรกที่ยังเป็นสมาชิกอยู่ ถ้าไม่มีเลยสร้างใหม่
  const kitchens = await getMyKitchens(owner)
  const kitchenId = kitchens.length ? kitchens[0].id : (await createKitchen(owner, 'ครัวของฉัน')).id

  store.set(KITCHEN_COOKIE, String(kitchenId), {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: YEAR,
    path: '/',
  })
  return { kitchenId, owner, isAnon }
}
