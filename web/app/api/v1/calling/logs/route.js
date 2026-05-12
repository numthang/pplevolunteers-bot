import { validateApiKey } from '@/lib/apiKeyAuth.js'
import { getLogsByMember } from '@/db/calling/logs.js'

export async function GET(req) {
  if (!validateApiKey(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const memberId = parseInt(searchParams.get('member_id'))

  if (!memberId) {
    return Response.json({ error: 'member_id is required' }, { status: 400 })
  }

  try {
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const offset = parseInt(searchParams.get('offset') || '0')

    const logs = await getLogsByMember(memberId, { limit, offset })

    const data = logs.map(({ called_by, ...rest }) => rest)

    return Response.json({ data, meta: { member_id: memberId, count: data.length } })
  } catch (error) {
    console.error('[GET /api/v1/calling/logs]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
