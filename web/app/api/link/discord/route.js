import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { signLinkState } from '@/lib/linkState.js'

// GET /api/link/discord — redirect ไป Discord OAuth (link mode, ต้อง login อยู่)
// ใช้ custom OAuth ไม่ใช่ DiscordProvider ของ NextAuth → ไม่ create-on-login row ใหม่
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return Response.redirect(new URL('/login', process.env.NEXTAUTH_URL))
  }

  const state = signLinkState(session.user.userId)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.DISCORD_OAUTH_CLIENT_ID,
    redirect_uri:  `${process.env.NEXTAUTH_URL}/api/link/discord/callback`,
    state,
    scope:         'identify',
  })
  return Response.redirect(`https://discord.com/api/oauth2/authorize?${params}`)
}
