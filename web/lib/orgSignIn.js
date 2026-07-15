// web/lib/orgSignIn.js — client helper: trigger NextAuth (org instance) แบบ manual
// ไม่ใช้ next-auth/react เพราะ __NEXTAUTH เป็น global เดียว จะชนกับ PPLE SessionProvider
// replicate flow ของ signIn(): fetch csrf → POST signin/callback พร้อม X-Auth-Return-Redirect
const BASE = '/api/org/auth'
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }

async function csrf() {
  const r = await fetch(`${BASE}/csrf`, { credentials: 'same-origin' })
  return (await r.json()).csrfToken
}

// provider 'google' = OAuth (signin) · 'magic'/credentials = callback · options = credential fields
export async function orgSignIn(provider, { callbackUrl = '/org', ...options } = {}) {
  const csrfToken = await csrf()
  const isCredentials = provider === 'magic'
  const path = isCredentials ? `callback/${provider}` : `signin/${provider}`
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: FORM,
    credentials: 'same-origin',
    body: new URLSearchParams({ ...options, csrfToken, callbackUrl, json: 'true' }),
  })
  const data = await res.json().catch(() => ({}))
  window.location.href = data.url || callbackUrl
}

export async function orgSignOut(callbackUrl = '/org/login') {
  const csrfToken = await csrf()
  await fetch(`${BASE}/signout`, {
    method: 'POST',
    headers: FORM,
    credentials: 'same-origin',
    body: new URLSearchParams({ csrfToken, callbackUrl, json: 'true' }),
  })
  window.location.href = callbackUrl
}
