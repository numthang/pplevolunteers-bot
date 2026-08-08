'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

// ปลายทางหลังยุบบัญชีที่แตกร่าง (link/discord/callback ส่งมาที่นี่)
//
// ตอนนี้ users.id ของเขาเปลี่ยนไปเป็นของบัญชีเก่าแล้ว แต่ JWT ในเบราว์เซอร์ยังถือ id เดิมที่ถูกลบทิ้ง
// ถ้าปล่อยเข้าเว็บทั้งอย่างนั้น ทุก query จะหา user ไม่เจอ = หน้าพังทั้งระบบ
// หน้านี้มีหน้าที่เดียว: สั่ง update() ให้ NextAuth วิ่ง jwt callback รอบใหม่ (trigger = 'update')
// ซึ่งจะไปตาม user_merges หา id ปลายทางให้ แล้วค่อยพาไปหน้าแรก
export default function MergedPage() {
  const { update } = useSession()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let done = false
    update()
      .then(() => { done = true; window.location.replace('/') })
      .catch(() => setFailed(true))
    // กันค้างหน้าขาว ถ้า update() ไม่ตอบกลับเลย
    const t = setTimeout(() => { if (!done) setFailed(true) }, 8000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-8">
        <div className="text-3xl">🎉</div>
        <h1 className="mt-3 text-lg font-semibold text-gray-900 dark:text-disc-text">
          รวมบัญชีเรียบร้อย
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-disc-muted">
          {failed
            ? 'รวมบัญชีสำเร็จแล้ว แต่รีเฟรชอัตโนมัติไม่ผ่าน — ออกจากระบบแล้วเข้าใหม่อีกครั้ง'
            : 'กำลังพากลับเข้าบัญชีเดิมของคุณ ยศและสิทธิ์ทั้งหมดอยู่ครบ…'}
        </p>
        {failed && (
          <a href="/api/auth/signout" className="mt-4 inline-block rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            ออกจากระบบ
          </a>
        )}
      </div>
    </div>
  )
}
