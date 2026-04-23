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
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.discordId = profile.id
        try {
          const [rows] = await pool.query(
            'SELECT nickname, roles FROM dc_members WHERE guild_id = ? AND discord_id = ?',
            [process.env.GUILD_ID, profile.id]
          )
          if (rows[0]) {
            token.roles    = rows[0].roles ? rows[0].roles.split(',') : []
            token.nickname = rows[0].nickname || profile.username
          }
        } catch {}
      }
      return token
    },
    async session({ session, token }) {
      session.user.discordId = token.discordId
      session.user.roles     = token.roles || []
      session.user.nickname  = token.nickname || session.user.name
      return session
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
}
