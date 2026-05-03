import DiscordProvider from 'next-auth/providers/discord'
import pool from '@/db/index.js'

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
  ],
  callbacks: {
    async jwt({ token, account, profile, trigger }) {
      if (account && profile) {
        token.discordId = profile.id
      }
      if (account && profile || trigger === 'update') {
        const id = token.discordId
        try {
          const [rows] = await pool.query(
            'SELECT nickname, roles, primary_province FROM dc_members WHERE guild_id = ? AND discord_id = ?',
            [process.env.GUILD_ID, id]
          )
          if (rows[0]) {
            token.roles            = rows[0].roles ? rows[0].roles.split(',') : []
            token.nickname         = rows[0].nickname || token.nickname
            token.primary_province = rows[0].primary_province || null
          }
        } catch {}
      }
      return token
    },
    async session({ session, token }) {
      session.user.discordId        = token.discordId
      session.user.roles            = token.roles || []
      session.user.nickname         = token.nickname || session.user.name
      session.user.primary_province = token.primary_province || null
      return session
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
}
