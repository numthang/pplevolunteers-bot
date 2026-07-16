import DiscordProvider from 'next-auth/providers/discord'
import LineProvider from 'next-auth/providers/line'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import pool from '@/db/index.js'
import { isSuperAdmin } from '@/lib/roles.js'
import { findUserIdByProvider, resolveUserByDiscord } from '@/db/userIdentities.js'
import { resolveOrgUser } from '@/db/orgMembers.js'

const OAUTH_PROVIDERS = ['line', 'google']

// Passkey / Phone OTP — verify endpoint ออก nonce ลง dc_user_config แล้ว client แลก session ผ่าน credentials
const nonceAuthorize = (nonceKey) => async (credentials) => {
  if (!credentials?.nonce) return null
  const { rows } = await pool.query(
    `DELETE FROM dc_user_config WHERE "key" = $1 AND value::text = to_json($2::text)::text
     AND updated_at > NOW() - INTERVAL '2 minutes'
     RETURNING discord_id`,
    [nonceKey, credentials.nonce]
  )
  if (!rows[0]) return null
  return { id: rows[0].discord_id, discordId: rows[0].discord_id }
}

// อ่าน roles/profile จาก org_members (แกน membership) by user_id + guild · ชื่อจาก users
async function loadMemberData(token) {
  try {
    const { rows } = await pool.query(
      `SELECT om.nickname, u.username, om.roles, om.primary_province, om.avatar
         FROM org_members om
         JOIN users u ON u.id = om.user_id
        WHERE om.user_id = $1 AND om.guild_id = $2`,
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
      authorize: nonceAuthorize('passkey_nonce'),
    }),
    // Phone OTP login — nonce ออกจาก /api/auth/phone/verify (เบอร์ verified ผ่าน Discord เท่านั้น)
    CredentialsProvider({
      id: 'phone',
      name: 'Phone OTP',
      credentials: { nonce: { type: 'text' } },
      authorize: nonceAuthorize('phone_nonce'),
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
      // LINE / Google: ต้องผูกกับ user ก่อน ถ้าไม่มี identity → block (กันบัญชีเปล่า)
      if (OAUTH_PROVIDERS.includes(account.provider)) {
        const userId = await findUserIdByProvider(account.provider, profile.sub).catch(() => null)
        if (!userId) return '/login?error=NotLinked'
      }
      return true
    },
    async jwt({ token, account, profile, user, trigger }) {
      if (account) {
        if (account.provider === 'discord') {
          // Discord = provider row · create-on-login ถ้ายังไม่มี users
          token.discordId = profile.id
          token.userId    = await resolveUserByDiscord(profile.id, profile.username).catch(() => null)
          const avatarUrl = profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.webp`
            : null
          if (avatarUrl && token.userId) {
            pool.query(
              'UPDATE org_members SET avatar = $1 WHERE user_id = $2 AND guild_id = $3',
              [avatarUrl, token.userId, process.env.GUILD_ID]
            ).catch(() => {})
          }
        } else if (OAUTH_PROVIDERS.includes(account.provider)) {
          // line/google: resolve users.id (signIn block ถ้าไม่มี identity)
          token.userId = await findUserIdByProvider(account.provider, profile.sub).catch(() => null)
        } else if (account.provider === 'passkey' || account.provider === 'phone') {
          // credentials authorize คืน discordId มาแล้ว → resolve users.id
          token.discordId = user?.discordId || user?.id
          token.userId    = await resolveUserByDiscord(token.discordId).catch(() => null)
        } else if (account.provider === 'magic') {
          // email door — authorize คืน userId มาแล้ว (ไม่มี discord)
          token.userId = user?.userId || Number(user?.id) || null
          token.email  = user?.email || null
          token.name   = user?.name || null
        }
      }
      if ((account || trigger === 'update') && token.userId) {
        token = await loadMemberData(token)
      }
      return token
    },
    async session({ session, token }) {
      session.user.userId           = token.userId || null
      session.user.discordId        = token.discordId || null
      session.user.roles            = token.roles || []
      session.user.nickname         = token.nickname || session.user.name
      session.user.primary_province = token.primary_province || null
      session.user.isSuperAdmin     = isSuperAdmin(token.discordId)
      session.user.image            = token.avatar || token.picture || session.user.image || null
      return session
    },
  },
  pages: { signIn: '/' },  // login รวมอยู่หน้าแรก (LoginPanel) · /login เหลือแค่ redirect
  secret: process.env.NEXTAUTH_SECRET,
}
