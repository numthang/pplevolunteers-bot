import DiscordProvider from 'next-auth/providers/discord'
import LineProvider from 'next-auth/providers/line'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import pool from '@/db/index.js'
import { isSuperAdmin } from '@/lib/roles.js'
import { findUserIdByProvider, resolveUserByDiscord, discordIdByUserId, linkIdentityByUser } from '@/db/userIdentities.js'
import { resolveOrgUser } from '@/db/orgMembers.js'
import { takeNonce } from '@/db/authNonces.js'

// Passkey + Phone — nonce keyed by user_id ใน auth_nonces (email-only ก็ login ได้)
const userNonceAuthorize = (purpose) => async (credentials) => {
  if (!credentials?.nonce) return null
  const row = await takeNonce(credentials.nonce, purpose)
  if (!row?.user_id) return null
  return { id: String(row.user_id), userId: row.user_id }
}

// อ่าน roles/profile จาก org_members (แกน membership) by user_id + guild · ชื่อจาก users
async function loadMemberData(token) {
  try {
    // LEFT JOIN จาก users → email-only ที่ไม่มี org_members ใน guild นี้ ยังได้ username/avatar (session ไม่ว่าง)
    const { rows } = await pool.query(
      `SELECT om.nickname, u.username, om.roles, om.primary_province, om.avatar
         FROM users u
         LEFT JOIN org_members om ON om.user_id = u.id AND om.guild_id = $2
        WHERE u.id = $1`,
      [token.userId, process.env.GUILD_ID]
    )
    if (rows[0]) {
      token.roles            = rows[0].roles ? rows[0].roles.split(',') : []
      token.nickname         = rows[0].nickname || token.nickname
      token.primary_province = rows[0].primary_province || null
      token.avatar           = rows[0].avatar || token.picture || null
      token.name             = rows[0].username || token.name || null
    }
  } catch {}
  return token
}

export const authOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 90 * 24 * 60 * 60, // 90 days
  },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_OAUTH_CLIENT_ID,
      clientSecret: process.env.DISCORD_OAUTH_CLIENT_SECRET,
      authorization: { params: { scope: 'identify email' } },
    }),
    LineProvider({
      clientId:     process.env.LINE_CLIENT_ID     || '',
      clientSecret: process.env.LINE_CLIENT_SECRET || '',
    }),
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID     || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      id: 'passkey',
      name: 'Passkey',
      credentials: { nonce: { type: 'text' } },
      authorize: userNonceAuthorize('passkey'),
    }),
    // Phone OTP login — nonce (keyed user_id) ออกจาก /api/auth/phone/verify · ไม่ผูก Discord แล้ว
    CredentialsProvider({
      id: 'phone',
      name: 'Phone OTP',
      credentials: { nonce: { type: 'text' } },
      authorize: userNonceAuthorize('phone'),
    }),
    // magic-link (email) — token ออกจาก /api/org/auth/magic แล้ว client แลก session ผ่าน credentials
    // ย้ายเข้า auth หลัก (unify) แทน NextAuth instance ที่ 2 เดิม
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
        return { id: String(user.id), userId: user.id, email: user.email, name: user.display_name || null }
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (!account) return false
      // LINE: ไม่การันตี email = เป็นตัวตนเองไม่ได้ → ต้องผูก user ก่อน (block ถ้าไม่มี link)
      if (account.provider === 'line') {
        const userId = await findUserIdByProvider('line', profile.sub).catch(() => null)
        if (!userId) return '/login?error=NotLinked'
      }
      // Google: ประตูสมัคร (email verified = ตัวตน) → ผ่านได้ · แต่ต้องมี email
      if (account.provider === 'google' && !profile?.email) return false
      return true
    },
    async jwt({ token, account, profile, user, trigger }) {
      if (account) {
        if (account.provider === 'discord') {
          // Discord = provider row · create-on-login/รวมบัญชี email verified ถ้ายังไม่มี users
          token.discordId = profile.id
          token.email     = profile.email || token.email || null
          token.userId    = await resolveUserByDiscord(profile.id, profile.username, profile.email, !!profile.verified).catch(() => null)
          const avatarUrl = profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.webp`
            : null
          if (avatarUrl && token.userId) {
            pool.query(
              'UPDATE org_members SET avatar = $1 WHERE user_id = $2 AND guild_id = $3',
              [avatarUrl, token.userId, process.env.GUILD_ID]
            ).catch(() => {})
          }
        } else if (account.provider === 'google') {
          // google = ประตูสมัคร: เจอ link → ใช้ · ไม่เจอ → สร้าง/หา users จาก email + auto-link
          let uid = await findUserIdByProvider('google', profile.sub).catch(() => null)
          if (!uid && profile?.email) {
            const u = await resolveOrgUser(profile.email, profile.name).catch(() => null)
            if (u) {
              uid = u.id
              await linkIdentityByUser(u.id, 'google', profile.sub).catch(() => {})
            }
          }
          token.userId = uid
        } else if (account.provider === 'line') {
          // line: resolve users.id (signIn block แล้วถ้าไม่มี link)
          token.userId = await findUserIdByProvider('line', profile.sub).catch(() => null)
        } else if (account.provider === 'passkey') {
          // passkey authorize คืน userId มาแล้ว (auth_nonces) — discordId เติมทีหลังถ้ามี
          token.userId = user?.userId ?? (user?.id ? Number(user.id) : null)
        } else if (account.provider === 'phone') {
          // phone → authorize คืน userId (auth_nonces) · discordId เติมทีหลังถ้ามี (block ล่าง)
          token.userId = user?.userId ?? (user?.id ? Number(user.id) : null)
        } else if (account.provider === 'magic') {
          // email door — authorize คืน userId มาแล้ว (ไม่มี discord)
          token.userId = user?.userId || Number(user?.id) || null
          token.email  = user?.email || null
          token.name   = user?.name || null
        }
      }
      // ประตู google/line/magic resolve เป็น userId แต่ยังไม่มี discordId → เติมจาก users
      // (feature code เช่น getUserGuilds ยัง key ด้วย discordId) · trigger update = หลังผูก Discord กลางคัน
      if ((account || trigger === 'update') && token.userId && !token.discordId) {
        token.discordId = await discordIdByUserId(token.userId).catch(() => null)
      }
      if ((account || trigger === 'update') && token.userId) {
        token = await loadMemberData(token)
      }
      return token
    },
    async session({ session, token }) {
      session.user.userId           = token.userId || null
      session.user.discordId        = token.discordId || null
      session.user.email            = token.email || session.user.email || null
      session.user.roles            = token.roles || []
      session.user.nickname         = token.nickname || session.user.name
      session.user.primary_province = token.primary_province || null
      session.user.isSuperAdmin     = isSuperAdmin(token.discordId, token.userId)
      session.user.image            = token.avatar || token.picture || session.user.image || null
      return session
    },
  },
  pages: { signIn: '/' },  // login รวมอยู่หน้าแรก (LoginPanel) · /login เหลือแค่ redirect
  secret: process.env.NEXTAUTH_SECRET,
}
