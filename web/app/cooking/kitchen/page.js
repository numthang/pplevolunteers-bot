import KitchenClient from './KitchenClient.jsx'

export const metadata = { title: 'จัดการครัว' }

// เข้าใช้ได้เลยไม่ต้อง login เหมือน /cooking — ตัวตนผูกกับ cookie (anon) จนกว่าจะ login
export default function KitchenPage() {
  return <KitchenClient />
}
