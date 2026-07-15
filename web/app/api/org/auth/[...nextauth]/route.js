import NextAuth from 'next-auth'
import { orgAuthOptions } from '@/lib/org-auth-options.js'

const handler = NextAuth(orgAuthOptions)
export { handler as GET, handler as POST }
