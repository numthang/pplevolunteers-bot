'use client'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-card-bg rounded-xl shadow p-8 text-center w-80">
        <h1 className="text-xl font-bold mb-2 text-gray-900 dark:text-disc-text">เข้าสู่ระบบ</h1>
        <p className="text-gray-500 dark:text-disc-muted text-sm mb-6">ใช้บัญชี Discord ของคุณ</p>
        <button
          onClick={() => signIn('discord', { callbackUrl })}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          เข้าสู่ระบบด้วย Discord
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
