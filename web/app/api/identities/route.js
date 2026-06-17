import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getUserIdentities } from '@/db/userIdentities.js'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await getUserIdentities(session.user.discordId)
  // ไม่ส่ง credential (passkey public key) ออกมา
  return Response.json(rows.map(r => ({
    provider:    r.provider,
    provider_id: r.provider_id,
    created_at:  r.created_at,
    ...(r.provider === 'passkey' && {
      device_name: r.credential?.deviceName ?? null,
      transports:  r.credential?.transports ?? [],
      device_type: r.credential?.deviceType ?? null,
    }),
  })))
}
