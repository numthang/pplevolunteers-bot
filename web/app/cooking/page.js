import CookingClient from './CookingClient.jsx'

export const metadata = { title: 'วันนี้กินอะไรดี?' }

// เข้าใช้ได้เลยไม่ต้อง login — owner ผูกกับ cookie (anon) จนกว่าจะ login แล้วค่อย merge
export default function CookingPage() {
  return <CookingClient />
}
