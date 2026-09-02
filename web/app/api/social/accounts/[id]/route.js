import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { canManageSocialGuild } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import pool from '@/db/index.js'

// เจ้าของบัญชี private = owner_user_id (user อีเมลก็เป็นเจ้าของได้)
// fallback user_discord_id เผื่อ session เก่าที่ยังไม่มี userId · debug mode discordId = null → คืน false เสมอ
async function isOwner(id, session) {
  const { rows } = await pool.query(
    `SELECT owner_user_id, user_discord_id FROM dc_social_accounts WHERE id = $1`, [id]
  )
  if (!rows.length) return false
  const { owner_user_id, user_discord_id } = rows[0]
  if (owner_user_id != null) return owner_user_id === session.user.userId
  return !!user_discord_id && user_discord_id === session.user.discordId
}

/**
 * ย้ายบัญชีเข้ากลุ่มแล้วรับ "ค่าระดับกลุ่ม" ที่ว่างอยู่ไปด้วย — เซิร์ฟเวอร์ + ห้องข่าวสาร
 *
 * ทำไมต้องมี: flow จริงคือต่อ OAuth ก่อน (ยังไม่มีกลุ่ม) แล้วค่อยตั้ง group_name ทีหลัง
 * แถวใหม่จึงไม่มี guild_id → ตะกร้าดิสฯ ที่หาด้วย `visibility='public' AND guild_id=$1`
 * (services/metaApi.js) จะเห็นกลุ่มนั้นไม่ครบทุกแพลตฟอร์ม = "กดแชร์แล้วหาไม่เจอ" ทีละแถว
 *
 * scope ด้วย org_id + owner_user_id เพราะ group_name เป็น free text ซ้ำข้าม tenant ได้
 */
async function inheritGroupFields(id, groupName) {
  if (!groupName) return
  await pool.query(
    `UPDATE dc_social_accounts a
        SET guild_id        = COALESCE(a.guild_id, s.guild_id),
            news_channel_id = COALESCE(a.news_channel_id, s.news_channel_id)
       FROM (
         SELECT b.guild_id, b.news_channel_id
           FROM dc_social_accounts b, dc_social_accounts me
          WHERE me.id = $1 AND b.id <> me.id
            AND b.group_name = $2
            AND COALESCE(b.org_id, 0)        = COALESCE(me.org_id, 0)
            AND COALESCE(b.owner_user_id, 0) = COALESCE(me.owner_user_id, 0)
            AND (b.guild_id IS NOT NULL OR b.news_channel_id IS NOT NULL)
          ORDER BY b.id
          LIMIT 1
       ) s
      WHERE a.id = $1`,
    [id, groupName]
  )
}

export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { access } = await getEffectiveIdentity(session)
  const canManage = canManageSocialGuild(access)

  const { id } = await params
  const body = await req.json()

  if (canManage) {
    // manager: แก้ได้ทุก field
    const { name, visibility, group_name } = body
    const fields = []
    const values = []
    if (name !== undefined)       { values.push(name);               fields.push(`name = $${values.length}`) }
    if (visibility !== undefined) { values.push(visibility);         fields.push(`visibility = $${values.length}`) }
    if (group_name !== undefined) { values.push(group_name || null); fields.push(`group_name = $${values.length}`) }
    if (!fields.length) return Response.json({ error: 'nothing to update' }, { status: 400 })

    values.push(id)
    await pool.query(`UPDATE dc_social_accounts SET ${fields.join(', ')} WHERE id = $${values.length}`, values)
    if (group_name) await inheritGroupFields(id, group_name)
  } else {
    // owner เท่านั้น — แก้ได้แค่ group_name
    if (!(await isOwner(id, session))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (body.group_name === undefined) return Response.json({ error: 'nothing to update' }, { status: 400 })
    await pool.query(
      `UPDATE dc_social_accounts SET group_name = $1 WHERE id = $2`,
      [body.group_name || null, id]
    )
    if (body.group_name) await inheritGroupFields(id, body.group_name)
  }

  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { access } = await getEffectiveIdentity(session)

  if (!canManageSocialGuild(access)) {
    if (!(await isOwner(id, session))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // ประวัติโพสต์อ้าง id นี้อยู่ (post_social_history_social_account_id_fkey) → DELETE ตรงๆ พัง 500
  // เคสจริง 2026-09-02: reconnect หลังเปลี่ยนรหัส FB ได้แถวซ้ำ แล้วกดถังขยะลบตัวเก่าไม่ออก
  //
  // มีแถวฝาแฝด (บัญชีเดียวกันจริง — social_id/platform/เจ้าของ ตรงกัน) → ย้ายประวัติไปผูกตัวนั้น
  // ไม่มีฝาแฝด → ปล่อย social_account_id เป็น NULL · ประวัติยังอยู่ครบ (platform/กลุ่ม/แคปชั่น/ผล)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: twin } = await client.query(
      `SELECT b.id
         FROM dc_social_accounts b, dc_social_accounts me
        WHERE me.id = $1 AND b.id <> me.id
          AND b.platform = me.platform AND b.social_id = me.social_id
          AND COALESCE(b.org_id, 0)        = COALESCE(me.org_id, 0)
          AND COALESCE(b.owner_user_id, 0) = COALESCE(me.owner_user_id, 0)
        ORDER BY b.id DESC
        LIMIT 1`,
      [id]
    )
    await client.query(
      `UPDATE post_social_history SET social_account_id = $2 WHERE social_account_id = $1`,
      [id, twin[0]?.id ?? null]
    )
    await client.query(`DELETE FROM dc_social_accounts WHERE id = $1`, [id])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    return Response.json({ error: `ลบไม่สำเร็จ: ${err.message}` }, { status: 500 })
  } finally {
    client.release()
  }
  return Response.json({ ok: true })
}
