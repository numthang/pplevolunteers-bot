import DiscordProvider from 'next-auth/providers/discord'
import LineProvider from 'next-auth/providers/line'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import pool from '@/db/index.js'
import { isSuperAdmin } from '@/lib/roles.js'
import { findDiscordIdByProvider } from '@/db/userIdentities.js'

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

async function loadMemberData(token) {
  try {
    const { rows } = await pool.query(
      'SELECT nickname, username, roles, primary_province, avatar FROM dc_members WHERE guild_id = $1 AND discord_id = $2',
      [process.env.GUILD_ID, token.discordId]
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
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (!account) return false
      // LINE / Google: ต้องผูกกับ discord ก่อน ถ้าไม่มี mapping → block
      if (OAUTH_PROVIDERS.includes(account.provider)) {
        const discordId = await findDiscordIdByProvider(account.provider, profile.sub).catch(() => null)
        if (!discordId) return '/login?error=NotLinked'
      }
      return true
    },
    async jwt({ token, account, profile, user, trigger }) {
      if (account) {
        if (account.provider === 'discord') {
          token.discordId = profile.id
          const avatarUrl = profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.webp`
            : null
          if (avatarUrl) {
            pool.query(
              'UPDATE dc_members SET avatar = $1 WHERE guild_id = $2 AND discord_id = $3',
              [avatarUrl, process.env.GUILD_ID, profile.id]
            ).catch(() => {})
          }
        } else if (OAUTH_PROVIDERS.includes(account.provider)) {
          // lookup discordId จาก dc_user_identities
          token.discordId = await findDiscordIdByProvider(account.provider, profile.sub).catch(() => null)
        } else if (account.provider === 'passkey' || account.provider === 'phone') {
          // credentials authorize คืน user.discordId มาแล้ว
          token.discordId = user?.discordId || user?.id
        }
      }
      if ((account || trigger === 'update') && token.discordId) {
        token = await loadMemberData(token)
      }
      return token
    },
    async session({ session, token }) {
      session.user.discordId        = token.discordId
      session.user.roles            = token.roles || []
      session.user.nickname         = token.nickname || session.user.name
      session.user.primary_province = token.primary_province || null
      session.user.isSuperAdmin     = isSuperAdmin(token.discordId)
      session.user.image            = token.avatar || token.picture || session.user.image || null
      return session
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
}
