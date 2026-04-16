import { cookies } from 'next/headers'
import { isAdmin } from './roles.js'

const DEBUG_ROLES = [
  'เหรัญญิก',
  'กรรมการจังหวัด',
  'ผู้ประสานงานจังหวัด',
  'ผู้ประสานงานภาค',
  'รองเลขาภาค',
  'เลขาธิการ',
]

export { DEBUG_ROLES }

/**
 * Returns effective roles for the current request.
 * If user is Admin and has debug_role cookie set → override with that role.
 */
export async function getEffectiveRoles(session) {
  const realRoles = session?.user?.roles || []

  if (!isAdmin(realRoles)) return realRoles

  const cookieStore = await cookies()
  const debugRole = cookieStore.get('debug_role')?.value

  if (!debugRole || !DEBUG_ROLES.includes(debugRole)) return realRoles

  return [debugRole]
}
