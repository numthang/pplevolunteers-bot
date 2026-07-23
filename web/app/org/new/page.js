import { requireOrgUser } from '@/lib/orgAuth.js'
import NewOrgForm from '@/components/org/NewOrgForm.jsx'

export const metadata = { title: 'สร้างองค์กร' }

export default async function NewOrgPage() {
  await requireOrgUser()
  return <NewOrgForm />
}
