import { getSession } from '@/lib/auth.js'
import { requireFeature } from '@/lib/featureGate.js'

export const metadata = { title: { template: '%s — Finance', default: 'Finance' } }

export default async function FinanceLayout({ children }) {
  const session = await getSession()
  await requireFeature(session, 'finance')
  return children
}
