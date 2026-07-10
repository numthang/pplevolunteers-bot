import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import CookingClient from './CookingClient.jsx'

export const metadata = { title: 'วันนี้กินอะไรดี?' }

export default async function CookingPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-warm-500 dark:text-disc-muted mb-4">
          เข้าสู่ระบบด้วย Discord เพื่อใช้ครัว
        </p>
        <a
          href="/login"
          className="inline-block bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2 transition"
        >
          เข้าสู่ระบบ
        </a>
      </div>
    )
  }

  return <CookingClient />
}
