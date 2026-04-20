'use client'
import { useState, useEffect } from 'react'
import { DEBUG_COMBOS } from './debugCombos.js'

/**
 * Returns { roles, discordId } adjusted for debug mode.
 * In debug mode, discordId is nulled out so ownership checks don't bypass role restrictions.
 */
export function useEffectiveRoles(session) {
  const realRoles = session?.user?.roles || []
  const realDiscordId = session?.user?.discordId || null
  const [state, setState] = useState({ roles: realRoles, discordId: realDiscordId })

  useEffect(() => {
    if (!realRoles.includes('Admin')) {
      setState({ roles: realRoles, discordId: realDiscordId })
      return
    }
    const val = document.cookie.split('; ').find(r => r.startsWith('debug_role='))?.split('=')[1]
    const debugLabel = val ? decodeURIComponent(val) : null
    const combo = debugLabel ? DEBUG_COMBOS.find(c => c.label === debugLabel) : null
    if (combo) {
      setState({ roles: combo.roles, discordId: null })
    } else {
      setState({ roles: realRoles, discordId: realDiscordId })
    }
  }, [session])

  return state
}
