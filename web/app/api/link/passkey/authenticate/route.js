import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { getPasskeyCredential, updatePasskeyCounter } from '@/db/userIdentities.js'
import pool from '@/db/index.js'
import crypto from 'crypto'

const RP_ID = process.env.PASSKEY_RP_ID || new URL(process.env.NEXTAUTH_URL).hostname

// GET — สร้าง challenge สำหรับ login (ไม่ต้อง session)
export async function GET() {
  const options = await generateAuthenticationOptions({
    rpID:             RP_ID,
    userVerification: 'preferred',
  })

  // เก็บ challenge ลง DB ด้วย random key (ไม่มี discordId ตอนนี้)
  const challengeKey = crypto.randomUUID()
  await pool.query(
    `INSERT INTO dc_user_config (discord_id, "key", value)
     VALUES ('__passkey__', $1, $2)`,
    [`challenge:${challengeKey}`, JSON.stringify(options.challenge)]
  )

  return Response.json({ ...options, challengeKey })
}

// POST — verify แล้วออก nonce สำหรับ signIn('credentials')
export async function POST(req) {
  const body = await req.json()
  const { challengeKey, ...authResponse } = body

  if (!challengeKey) return Response.json({ error: 'missing challengeKey' }, { status: 400 })

  // ดึงและลบ challenge
  const { rows } = await pool.query(
    `DELETE FROM dc_user_config
     WHERE discord_id = '__passkey__' AND "key" = $1 AND updated_at > NOW() - INTERVAL '2 minutes'
     RETURNING value`,
    [`challenge:${challengeKey}`]
  )
  if (!rows[0]) return Response.json({ error: 'challenge expired' }, { status: 400 })
  const expectedChallenge = rows[0].value

  // ดึง credential จาก DB
  const credentialId = authResponse.id
  const stored = await getPasskeyCredential(credentialId)
  if (!stored) return Response.json({ error: 'credential not found' }, { status: 400 })

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

  // อัปเดต counter
  await updatePasskeyCounter(credentialId, verification.authenticationInfo.newCounter)

  // ออก nonce ให้ client ใช้กับ signIn('credentials', { nonce })
  const nonce = crypto.randomUUID()
  await pool.query(
    `INSERT INTO dc_user_config (discord_id, "key", value)
     VALUES ($1, 'passkey_nonce', $2)
     ON CONFLICT (discord_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [stored.discordId, JSON.stringify(nonce)]
  )

  return Response.json({ nonce })
}
