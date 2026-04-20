import { cookies } from 'next/headers'
import { isAdmin } from './roles.js'
import { DEBUG_COMBOS } from './debugCombos.js'

const DEBUG_LABELS = DEBUG_COMBOS.map(c => c.label)

/**
 * Returns effective roles for the current request.
 * If user is Admin and has debug_role cookie set → override with combo roles.
 */
export async function getEffectiveRoles(session) {
  const realRoles = session?.user?.roles || []

  if (!isAdmin(realRoles)) return realRoles

  const cookieStore = await cookies()
  const debugLabel = cookieStore.get('debug_role')?.value

  if (!debugLabel || !DEBUG_LABELS.includes(debugLabel)) return realRoles

  return DEBUG_COMBOS.find(c => c.label === debugLabel)?.roles ?? realRoles
}
