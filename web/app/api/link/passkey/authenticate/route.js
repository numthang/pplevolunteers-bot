import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { getPasskeyCredential, updatePasskeyCounter } from '@/db/userIdentities.js'
import { putNonce, takeNonce } from '@/db/authNonces.js'
import crypto from 'crypto'

const RP_ID = process.env.PASSKEY_RP_ID || new URL(process.env.NEXTAUTH_URL).hostname

// GET — สร้าง challenge สำหรับ login (ยังไม่รู้ว่าใคร → user_id null)
export async function GET() {
  const options = await generateAuthenticationOptions({
    rpID:             RP_ID,
    userVerification: 'preferred',
  })

  const challengeKey = crypto.randomUUID()
  await putNonce(challengeKey, { purpose: 'passkey_auth_challenge', payload: options.challenge })

  return Response.json({ ...options, challengeKey })
}

// POST — verify แล้วออก login nonce (keyed by user_id) สำหรับ signIn('passkey')
export async function POST(req) {
  const body = await req.json()
  const { challengeKey, ...authResponse } = body

  if (!challengeKey) return Response.json({ error: 'missing challengeKey' }, { status: 400 })

  const row = await takeNonce(challengeKey, 'passkey_auth_challenge')
  if (!row) return Response.json({ error: 'challenge expired' }, { status: 400 })
  const expectedChallenge = row.payload

  const credentialId = authResponse.id
  const stored = await getPasskeyCredential(credentialId)
  if (!stored) return Response.json({ error: 'credential not found' }, { status: 400 })
  if (!stored.userId) return Response.json({ error: 'credential has no user' }, { status: 400 })

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response:             authResponse,
      expectedChallenge,
      expectedOrigin:       process.env.NEXTAUTH_URL,
      expectedRPID:         RP_ID,
      credential: {
        id:         credentialId,
        publicKey:  Buffer.from(stored.credential.publicKey, 'base64url'),
        counter:    stored.credential.counter,
        transports: stored.credential.transports || [],
      },
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 })
  }

  if (!verification.verified) return Response.json({ error: 'verification failed' }, { status: 400 })

  await updatePasskeyCounter(credentialId, verification.authenticationInfo.newCounter)

  // ออก login nonce ให้ client ใช้กับ signIn('passkey', { nonce })
  const nonce = crypto.randomUUID()
  await putNonce(nonce, { userId: stored.userId, purpose: 'passkey' })

  return Response.json({ nonce })
}
