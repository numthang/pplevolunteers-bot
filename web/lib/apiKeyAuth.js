export function validateApiKey(req) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || token !== process.env.PPLEVOLUNTEERS_API_KEY) {
    return false
  }
  return true
}
