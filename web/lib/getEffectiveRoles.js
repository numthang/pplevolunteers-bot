import { cookies } from 'next/headers'
import { isAdmin } from './roles.js'
import { DEBUG_COMBOS } from './debugCombos.js'
import pool from '@/db/index.js'

const DEBUG_LABELS = DEBUG_COMBOS.map(c => c.label)

export async function getEffectiveRoles(session) {
  const { roles } = await getEffectiveIdentity(session)
  return roles
}

export async function getEffectiveIdentity(session) {
  const realDiscordId = session?.user?.discordId || null

  // Always read fresh roles from DB (bypass JWT cache)
  let realRoles = session?.user?.roles || []
  if (realDiscordId) {
    try {
      const [rows] = await pool.query(
        'SELECT roles FROM dc_members WHERE guild_id = ? AND discord_id = ?',
        [process.env.GUILD_ID, realDiscordId]
      )
      if (rows[0]?.roles) {
        realRoles = rows[0].roles.split(',').map(r => r.trim()).filter(Boolean)
      }
    } catch {}
  }

  if (!isAdmin(realRoles)) return { roles: realRoles, discordId: realDiscordId }

  const cookieStore = await cookies()

  // Mode 1: impersonate specific member — ใช้ roles จริงจาก DB
  const debugDiscordId = cookieStore.get('debug_discord_id')?.value
  if (debugDiscordId) {
    try {
      const [rows] = await pool.query(
        'SELECT roles FROM dc_members WHERE guild_id = ? AND discord_id = ?',
        [process.env.GUILD_ID, debugDiscordId]
      )
      const roles = rows[0]?.roles ? rows[0].roles.split(',').map(r => r.trim()).filter(Boolean) : []
      return { roles, discordId: null }
    } catch {
      return { roles: realRoles, discordId: realDiscordId }
    }
  }

  // Mode 2: predefined combo
  const debugLabel = cookieStore.get('debug_role')?.value
  if (!debugLabel || !DEBUG_LABELS.includes(debugLabel)) return { roles: realRoles, discordId: realDiscordId }

  const combo = DEBUG_COMBOS.find(c => c.label === debugLabel)
  if (!combo) return { roles: realRoles, discordId: realDiscordId }

  return { roles: combo.roles, discordId: null }
}
