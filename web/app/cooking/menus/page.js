import MenusClient from './MenusClient.jsx'

export const metadata = { title: 'คลังเมนู' }

// เข้าใช้ได้เลยไม่ต้อง login เหมือน /cooking — เมนูทั้งหมด public, owner ผูกกับ cookie (anon)
export default function MenusPage() {
  return <MenusClient />
}
