import { cookies } from 'next/headers'
import { isAdmin } from './roles.js'
import { DEBUG_COMBOS } from './debugCombos.js'

const DEBUG_LABELS = DEBUG_COMBOS.map(c => c.label)

/**
 * Returns effective roles for the current request.
 * If user is Admin and has debug_role cookie set → override with combo roles.
 */
export async function getEffectiveRoles(session) {
  const { roles } = await getEffectiveIdentity(session)
  return roles
}

/**
 * Returns { roles, discordId } adjusted for debug mode.
 * In debug mode, discordId is null so private-account ownership checks don't bypass role restrictions.
 */
export async function getEffectiveIdentity(session) {
  const realRoles = session?.user?.roles || []
  const realDiscordId = session?.user?.discordId || null

  if (!isAdmin(realRoles)) return { roles: realRoles, discordId: realDiscordId }

  const cookieStore = await cookies()
  const debugLabel = cookieStore.get('debug_role')?.value

  if (!debugLabel || !DEBUG_LABELS.includes(debugLabel)) return { roles: realRoles, discordId: realDiscordId }

  const combo = DEBUG_COMBOS.find(c => c.label === debugLabel)
  if (!combo) return { roles: realRoles, discordId: realDiscordId }

  return { roles: combo.roles, discordId: null }
}
