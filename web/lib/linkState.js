import crypto from 'crypto'

const SECRET = process.env.NEXTAUTH_SECRET

export function signLinkState(discordId) {
  const payload = Buffer.from(JSON.stringify({ discordId, ts: Date.now() })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyLinkState(state) {
  const dot = state.lastIndexOf('.')
  if (dot < 0) throw new Error('invalid state')
  const payload = state.slice(0, dot)
  const sig = state.slice(dot + 1)
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  if (sig !== expected) throw new Error('invalid state signature')
  const { discordId, ts } = JSON.parse(Buffer.from(payload, 'base64url').toString())
  if (Date.now() - ts > 10 * 60 * 1000) throw new Error('state expired')
  return discordId
}
