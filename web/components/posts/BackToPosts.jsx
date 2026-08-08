'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// กลับไปหน้ารายการโดยเก็บ query string เดิมไว้ (filter/สถานะ/เรียงที่เลือกไว้ก่อนเข้ามา)
// ใช้ history.back() แทน <Link href="/posts"> เพราะ Link เป็น URL ตายตัวไม่มี query
// → ตัวกรองที่ /posts เก็บไว้ใน query string (ดู PostsHome.jsx) จะรีเซ็ตทุกครั้งที่กลับมาถ้าใช้ Link ตรงๆ
// เข้ามาตรงๆ ไม่มีประวัติในแท็บ (เช่น เปิดลิงก์ใหม่/แชร์มา) → กลับไม่ได้ ใช้ fallback ไป /posts เฉยๆ
export default function BackToPosts({ children = '← กลับไปหน้ารายการ' }) {
  const router = useRouter()
  const [canGoBack, setCanGoBack] = useState(false)
  useEffect(() => { setCanGoBack(window.history.length > 1) }, [])

  return (
    <button
      type="button"
      onClick={() => (canGoBack ? router.back() : router.push('/posts'))}
      className="inline-block text-base text-teal hover:underline mb-4"
    >
      {children}
    </button>
  )
}
