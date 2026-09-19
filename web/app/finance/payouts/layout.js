import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { can } from '@/lib/permissions.js'

export async function generateMetadata() {
  const t = await getTranslations('finance')
  return { title: t('payouts.title') }
}

// gate ด่านเดียวของทั้งโซน (ครอบ /finance/payouts และ /finance/payouts/[id])
// — หน้าเป็น client component ทั้งคู่ กันที่นี่ที่เดียวคนพิมพ์ URL ตรงก็ไม่เข้า
// ⛔ redirect ไป /finance ไม่ใช่ notFound(): คนที่โดนกันคือสมาชิกจริงของโมดูลการเงิน
//    (login + feature finance ผ่านมาแล้วจาก app/finance/layout.js) โยน 404 ใส่ไม่ช่วยอะไร
// ⚠️ ต้องใช้ getEffectiveOrgIdentity ให้ตรงกับ API guard — getEffectiveIdentity (guild-based)
//    ไม่เติม admin ให้ owner ของ org → เจ้าของ org จะโดนเด้งทั้งที่ API ให้เข้า
export default async function PayoutsLayout({ children }) {
  const session = await getSession()
  const { access } = await getEffectiveOrgIdentity(session)
  if (!can('viewPayouts', access?.permissions || [])) redirect('/finance')
  return children
}
