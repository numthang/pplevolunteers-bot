import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { signLinkState } from '@/lib/linkState.js'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.redirect(new URL('/login', process.env.NEXTAUTH_URL))
  }

  const state = signLinkState(session.user.discordId)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${process.env.NEXTAUTH_URL}/api/link/google/callback`,
    state,
    scope:         'openid profile email',
    access_type:   'online',
  })
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
