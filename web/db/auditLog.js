import pool from '@/db/index.js'

/**
 * logAction({ guildId, app, action, actorId?, targetId?, meta? })
 * Fire-and-forget — never throws (audit failure must not break the main flow)
 */
export async function logAction({ guildId, app, action, actorId = null, targetId = null, meta = null }) {
  pool.query(
    `INSERT INTO audit_logs (guild_id, app, action, actor_id, target_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [guildId, app, action, actorId || null, targetId ? String(targetId) : null, meta ? JSON.stringify(meta) : null],
  ).catch(() => {})
}
