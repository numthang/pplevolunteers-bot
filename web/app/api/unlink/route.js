import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { unlinkIdentity, getUserIdentities } from '@/db/userIdentities.js'

const ALLOWED = ['line', 'google', 'passkey']

export async function DELETE(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { provider, provider_id } = await req.json()
  if (!ALLOWED.includes(provider)) return Response.json({ error: 'invalid provider' }, { status: 400 })

  // ป้องกันลบ passkey ตัวสุดท้ายถ้าไม่มี provider อื่น → จะ lock out ตัวเอง
  if (provider === 'passkey') {
    const identities = await getUserIdentities(session.user.discordId)
    const otherProviders = identities.filter(i => i.provider !== 'passkey')
    const passkeys = identities.filter(i => i.provider === 'passkey')
    if (otherProviders.length === 0 && passkeys.length <= 1) {
      return Response.json({ error: 'ไม่สามารถลบ passkey ตัวสุดท้ายได้ เพราะไม่มีวิธี login อื่น' }, { status: 400 })
    }
  }

  await unlinkIdentity(session.user.discordId, provider, provider_id || null)
  return Response.json({ ok: true })
}
