// web/lib/org-auth-options.js — org login (email-native, แยกจาก PPLE Discord auth)
// ⚠️ instance ที่ 2 ของ NextAuth · cookie namespace 'org-auth.*' แยกจาก PPLE 'next-auth.*'
//    (ห้ามใช้ชื่อ cookie ซ้ำ ไม่งั้น session สอง instance ทับกัน)
// identity = dc_members.id (ผ่าน email) · ไม่มี NotLinked block · session ถือ userId + email
// import GoogleProvider from 'next-auth/providers/google'  // ⛔ เลื่อน (ดูหมายเหตุใน providers)
import CredentialsProvider from 'next-auth/providers/credentials'
import pool from '@/db/index.js'
import { resolveOrgUser } from '@/db/orgMembers.js'

const prod = process.env.NODE_ENV === 'production'
// prefix cookie แยก + secure เฉพาะ prod (dev = http localhost ส่ง secure cookie ไม่ได้)
const cookie = (name, opts = {}) => ({
  name: `org-auth.${name}`,
  options: { httpOnly: true, sameSite: 'lax', path: '/', secure: prod, ...opts },
})

export const orgAuthOptions = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  cookies: {
    sessionToken:     cookie('session-token'),
    callbackUrl:      cookie('callback-url', { httpOnly: false }),
    csrfToken:        cookie('csrf-token'),
    pkceCodeVerifier: cookie('pkce.code_verifier', { maxAge: 900 }),
    state:            cookie('state', { maxAge: 900 }),
    nonce:            cookie('nonce'),
  },
  providers: [
    // ⛔ Google เลื่อนไว้ (2026-07-15): next-auth v4 ล็อก basePath ทั้ง process จาก NEXTAUTH_URL
    //   → instance แยก subpath ส่ง redirect_uri=/api/auth/callback/google (path PPLE) → OAuth พัง
    //   จะ re-enable ตอน unify auth เป็น instance เดียว (ดู md/civicflow/CIVICFLOW.md + .wolf/buglog bug-org-oauth-basepath)
    //   magic-link (credentials, ไม่มี external redirect) ไม่โดนบั๊กนี้ = login หลักของ Phase 1
    // GoogleProvider({
    //   clientId:     process.env.GOOGLE_CLIENT_ID     || '',
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    //   authorization: { params: { scope: 'openid email profile' } },
    // }),
    // magic-link — token ออกจาก /api/org/auth/magic แล้ว client แลก session ผ่าน credentials
    CredentialsProvider({
      id: 'magic',
      name: 'Magic Link',
      credentials: { token: { type: 'text' } },
      async authorize(credentials) {
        const token = String(credentials?.token || '')
        if (!token) return null
        const { rows } = await pool.query(
          `DELETE FROM org_login_tokens
             WHERE token = $1 AND created_at > NOW() - INTERVAL '15 minutes'
           RETURNING email`,
          [token]
        )
        if (!rows[0]) return null
        const user = await resolveOrgUser(rows[0].email)
        return { id: String(user.id), email: user.email, name: user.display_name || null }
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // google ต้องมี email · magic ผ่าน authorize มาแล้ว (ไม่มี NotLinked block)
      if (account?.provider === 'google' && !profile?.email) return false
      return true
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === 'google') {
        const u = await resolveOrgUser(profile.email, profile.name)
        token.userId = u.id
        token.email  = u.email
        token.name   = u.display_name || profile.name || null
      } else if (user?.id) {
        // credentials (magic) — authorize คืน user มาแล้ว
        token.userId = Number(user.id)
        token.email  = user.email
        token.name   = user.name || null
      }
      return token
    },
    async session({ session, token }) {
      session.user = { userId: token.userId || null, email: token.email || null, name: token.name || null }
      return session
    },
  },
  pages: { signIn: '/org/login' },
  secret: process.env.NEXTAUTH_SECRET,
}
