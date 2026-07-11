import IngredientsClient from './IngredientsClient.jsx'

export const metadata = { title: 'จัดการวัตถุดิบ' }

// เข้าใช้ได้เลยไม่ต้อง login เหมือน /cooking/menus — วัตถุดิบทั้งหมด public wiki, เขียนต้อง login (endpoint เช็คเอง)
export default function IngredientsPage() {
  return <IngredientsClient />
}
