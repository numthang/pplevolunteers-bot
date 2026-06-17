import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { signLinkState } from '@/lib/linkState.js'

// GET /api/link/line — redirect to LINE OAuth (user must be logged in)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.redirect(new URL('/login', process.env.NEXTAUTH_URL))
  }

  const state = signLinkState(session.user.discordId)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINE_CLIENT_ID,
    redirect_uri:  `${process.env.NEXTAUTH_URL}/api/link/line/callback`,
    state,
    scope:         'openid profile',
  })
  return Response.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`)
}
