import { getServerSession } from 'next-auth'
import { authOptions } from './auth-options.js'
import { redirect } from 'next/navigation'

export async function getSession() {
  return getServerSession(authOptions)
}

// Use in server components — redirects to / if not authenticated
export async function requireAuth() {
  const session = await getSession()
  if (!session) redirect('/')
  return session
}
