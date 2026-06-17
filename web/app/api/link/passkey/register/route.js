import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server'
import { findAuthenticatorById } from 'passkey-authenticator-aaguids'
import { linkIdentity, getUserIdentities } from '@/db/userIdentities.js'
import pool from '@/db/index.js'

const RP_NAME = 'PPLE Volunteers'
const RP_ID   = process.env.PASSKEY_RP_ID || new URL(process.env.NEXTAUTH_URL).hostname

// GET — สร้าง challenge
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const discordId = session.user.discordId
  const existing  = await getUserIdentities(discordId)
  const existingPasskeys = existing.filter(i => i.provider === 'passkey')

  const options = await generateRegistrationOptions({
    rpName:               RP_NAME,
    rpID:                 RP_ID,
    userID:               new TextEncoder().encode(discordId),
    userName:             session.user.nickname || session.user.name || discordId,
    excludeCredentials:   existingPasskeys.map(p => ({
      id:         p.provider_id,
      type:       'public-key',
      transports: p.credential?.transports || [],
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  })

  // บันทึก challenge ชั่วคราว
  await pool.query(
    `INSERT INTO dc_user_config (discord_id, "key", value)
     VALUES ($1, 'passkey_reg_challenge', $2)
     ON CONFLICT (discord_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [discordId, JSON.stringify(options.challenge)]
  )

  return Response.json(options)
}

// POST — verify + บันทึก credential
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const discordId = session.user.discordId
  const body = await req.json()

  // ดึง challenge
  const { rows } = await pool.query(
    `DELETE FROM dc_user_config
     WHERE discord_id = $1 AND "key" = 'passkey_reg_challenge' AND updated_at > NOW() - INTERVAL '2 minutes'
     RETURNING value`,
    [discordId]
  )
  if (!rows[0]) return Response.json({ error: 'challenge expired' }, { status: 400 })
  const expectedChallenge = rows[0].value

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response:           body,
      expectedChallenge,
      expectedOrigin:     process.env.NEXTAUTH_URL,
      expectedRPID:       RP_ID,
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 })
  }

  if (!verification.verified) return Response.json({ error: 'verification failed' }, { status: 400 })

  const { credential, aaguid, credentialDeviceType } = verification.registrationInfo
  const deviceName = findAuthenticatorById({ authenticatorId: aaguid })?.name ?? null
  await linkIdentity(discordId, 'passkey', credential.id, {
    publicKey:  Buffer.from(credential.publicKey).toString('base64url'),
    counter:    credential.counter,
    deviceType: credentialDeviceType,
    deviceName,
    transports: body.response?.transports || [],
  })

  return Response.json({ ok: true })
}
