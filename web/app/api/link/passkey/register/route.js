import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server'
import { findAuthenticatorById } from 'passkey-authenticator-aaguids'
import { linkIdentityByUser, getUserIdentitiesByUser } from '@/db/userIdentities.js'
import { putNonce, takeNonce } from '@/db/authNonces.js'
import { BRAND_NAME } from '@/lib/brand.js'
import { BASE_URL } from '@/lib/baseUrl.js'

const RP_NAME = BRAND_NAME
const RP_ID   = process.env.PASSKEY_RP_ID || new URL(BASE_URL).hostname

// GET — สร้าง challenge (keyed by user_id → email-only ก็ลงทะเบียนได้)
export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await getUserIdentitiesByUser(userId)
  const existingPasskeys = existing.filter(i => i.provider === 'passkey')

  const options = await generateRegistrationOptions({
    rpName:               RP_NAME,
    rpID:                 RP_ID,
    userID:               new TextEncoder().encode(String(userId)),
    userName:             session.user.nickname || session.user.name || session.user.email || String(userId),
    excludeCredentials:   existingPasskeys.map(p => ({
      id:         p.provider_id,
      type:       'public-key',
      transports: p.credential?.transports || [],
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  })

  await putNonce(`preg:${userId}`, { userId, purpose: 'passkey_reg_challenge', payload: options.challenge })

  return Response.json(options)
}

// POST — verify + บันทึก credential
export async function POST(req) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const row = await takeNonce(`preg:${userId}`, 'passkey_reg_challenge')
  if (!row) return Response.json({ error: 'challenge expired' }, { status: 400 })
  const expectedChallenge = row.payload

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
  await linkIdentityByUser(userId, 'passkey', credential.id, {
    publicKey:  Buffer.from(credential.publicKey).toString('base64url'),
    counter:    credential.counter,
    deviceType: credentialDeviceType,
    deviceName,
    transports: body.response?.transports || [],
  })

  return Response.json({ ok: true })
}
