'use client'
import { useState, useEffect } from 'react'
import { DEBUG_COMBOS } from './debugCombos.js'

/**
 * Returns { roles, discordId, userId, access } adjusted for debug mode.
 * - roles/discordId: sync (session + debug cookie) — debug mode nulls discordId กัน ownership bypass
 * - access: { permissions, scopeGrants } จาก DB ผ่าน /api/me/access (debug-aware ฝั่ง server)
 *   เริ่มเป็น null → access fn เห็น permissions ว่าง (fail-closed) จน fetch เสร็จ
 */
export function useEffectiveRoles(session) {
  const realRoles = session?.user?.roles || []
  const realDiscordId = session?.user?.discordId || null
  const realUserId = session?.user?.userId || null
  const [state, setState] = useState({ roles: realRoles, discordId: realDiscordId, userId: realUserId, access: null, realAdmin: false, superAdmin: false })

  useEffect(() => {
    // roles/discordId/userId — sync, debug-aware (debug mode nulls discordId+userId กัน ownership bypass)
    let roles = realRoles, discordId = realDiscordId, userId = realUserId
    if (realRoles.includes('Admin')) {
      const val = document.cookie.split('; ').find(r => r.startsWith('debug_role='))?.split('=')[1]
      const debugLabel = val ? decodeURIComponent(val) : null
      const combo = debugLabel ? DEBUG_COMBOS.find(c => c.label === debugLabel) : null
      if (combo) { roles = combo.roles; discordId = null; userId = null }
    }
    setState(s => ({ ...s, roles, discordId, userId }))

    // access — จาก DB (debug cookie ถูกอ่านฝั่ง server, ส่งไปกับ fetch อัตโนมัติ)
    let cancelled = false
    fetch('/api/me/access')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data) setState(s => ({ ...s, access: data.access, realAdmin: !!data.realAdmin, superAdmin: !!data.superAdmin })) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [session])

  return state
}
