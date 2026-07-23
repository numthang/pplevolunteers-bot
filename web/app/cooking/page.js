import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import CookingClient from './CookingClient.jsx'

export const metadata = { title: 'วันนี้ทำอะไรกินดี?' }

// เข้าใช้ได้เลยไม่ต้อง login — owner ผูกกับ cookie (anon) จนกว่าจะ login แล้วค่อย merge
export default async function CookingPage() {
  const session = await getServerSession(authOptions)
  const displayName = session?.user?.nickname || session?.user?.name || session?.user?.email || null
  return <CookingClient displayName={displayName} />
}
