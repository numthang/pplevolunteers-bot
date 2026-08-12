// /api/social/groups — ค่าระดับ "กลุ่ม social" (dc_social_accounts.group_name)
//
// กลุ่มไม่มีตารางของตัวเอง (เป็นแค่ string ซ้ำอยู่บนแถวบัญชี) → ค่าระดับกลุ่มจึงเก็บซ้ำทุกแถว
// เหมือน guild_id/visibility ที่ทำอยู่แล้ว · PATCH นี้คือคนเดียวที่เขียนให้ครบทุกแถว (fan-out)
//
// ⚠️ ขอบเขตต้องมาจาก listPublishGroups เท่านั้น — **ห้าม UPDATE ... WHERE group_name = $1**
//    เพราะ group_name เป็น free text ไม่มี constraint: ชื่อกลุ่มซ้ำข้าม org หรือข้ามเจ้าของ private ได้
//    → เขียนข้าม tenant (ตระกูลเดียวกับบั๊ก "เช็คแค่ org_id" ที่ publishTargets เคยโดน)
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { canManageSocialGuild } from '@/lib/roles.js'
import { isMediaTeam } from '@/lib/postsAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { orgIdOfGuild } from '@/db/guilds.js'
import { listPublishGroups, attachNewsReady, attachNewsChannelName, publisherIdentity, NEWS_OFF }
  from '@/lib/publishTargets.js'
import { channelBelongsToGuild } from '@/lib/discordChannels.js'
import pool from '@/db/index.js'

/** GET — กลุ่มทั้งหมดที่คนนี้เห็น + ค่าที่ตั้งไว้ (ให้หน้า /org/settings/social วาดการ์ดรายกลุ่ม) */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const orgId = await getOrgId(session)
    const { userId, discordId } = await publisherIdentity(session)
    const groups = await listPublishGroups({ orgId, userId, discordId })
    await attachNewsChannelName(await attachNewsReady(groups))

    const { access } = await getEffectiveIdentity(session)
    return Response.json({
      canManage: canManageSocialGuild(access),
      canSetNews: canManageSocialGuild(access) || isMediaTeam(access),
      groups: groups.map(g => ({
        name: g.name,
        visibility: g.visibility,
        guildId: g.guildId,
        platforms: Object.keys(g.accounts),
        newsChannelId: g.newsChannelId,       // null = ยังไม่ตั้ง · 'off' = ปิด
        newsChannelName: g.newsChannelName,
        newsSource: g.newsSource,             // 'group' | 'guild' | null
        newsReady: g.newsReady,
        accountCount: g.rowIds.length,
        // แถวในกลุ่มอยู่คนละเซิร์ฟ = ตะกร้าดิสฯ จะเห็นกลุ่มนี้ไม่ครบทุกแพลตฟอร์ม → ต้องเตือนในหน้า
        mixedGuilds: g.mixedGuilds,
      })),
    })
  } catch (error) {
    console.error('[GET /api/social/groups]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * PATCH { group, guild_id?, news_channel_id? } → เขียนลงทุกแถวของกลุ่มนั้น
 *   guild_id        : เซิร์ฟที่กลุ่มสังกัด (ตะกร้าดิสฯ ใช้หาบัญชี) — ต้องเป็น guild ขององค์กรตัวเอง
 *   news_channel_id : channel id | 'off' (ไม่ส่ง) | null (ล้างค่า → public กลับไปใช้ห้องของ guild)
 */
export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const group = typeof body.group === 'string' ? body.group.trim() : ''
  if (!group) return Response.json({ error: 'ต้องระบุกลุ่ม' }, { status: 400 })

  const setGuild = body.guild_id !== undefined
  const setNews  = body.news_channel_id !== undefined
  if (!setGuild && !setNews) return Response.json({ error: 'nothing to update' }, { status: 400 })

  try {
    const orgId = await getOrgId(session)
    const { userId, discordId } = await publisherIdentity(session)
    const { access } = await getEffectiveIdentity(session)

    // ขอบเขตสิทธิ์: กลุ่มที่คนนี้ "ใช้ได้" เท่านั้น (public = ของ org · private = ของตัวเอง)
    const groups = await listPublishGroups({ orgId, userId, discordId })
    const found = groups.find(g => g.name === group)
    if (!found) return Response.json({ error: `ไม่พบกลุ่ม "${group}"` }, { status: 404 })

    // ผูกเซิร์ฟ = งานผู้ดูแลโซเชียล (กระทบว่าตะกร้าดิสฯ เห็นบัญชีไหม)
    if (setGuild && !canManageSocialGuild(access)) {
      return Response.json({ error: 'ไม่มีสิทธิ์ผูกเซิร์ฟเวอร์ให้กลุ่มนี้' }, { status: 403 })
    }
    // ตั้งห้องข่าวสาร = ทีมสื่อหรือผู้ดูแลโซเชียล · **เจ้าของกลุ่มส่วนตัวตั้งเองไม่ได้**
    // นี่คือด่านเดียวที่คุม "กลุ่มส่วนตัวยิงเข้าห้องข่าวขององค์กร" — กลุ่ม private ไม่มี fallback
    // ไปห้องของ guild (ดู attachNewsReady) จึงส่งได้เฉพาะเมื่อทีมสื่อตั้งห้องให้เท่านั้น
    if (setNews && !canManageSocialGuild(access) && !isMediaTeam(access)) {
      return Response.json({ error: 'ไม่มีสิทธิ์ตั้งห้องข่าวสารให้กลุ่มนี้' }, { status: 403 })
    }

    const fields = []
    const values = []

    let guildId = found.guildId
    if (setGuild) {
      const gid = body.guild_id ? String(body.guild_id).trim() : null
      if (gid && (await orgIdOfGuild(gid)) !== orgId) {
        return Response.json({ error: 'เซิร์ฟเวอร์นี้ไม่ใช่ของหน่วยงานคุณ' }, { status: 400 })
      }
      guildId = gid
      values.push(gid); fields.push(`guild_id = $${values.length}`)
    }

    if (setNews) {
      const raw = body.news_channel_id
      let channel = raw === null || raw === '' ? null : String(raw).trim()
      if (channel && channel !== NEWS_OFF) {
        if (!/^\d{17,20}$/.test(channel)) {
          return Response.json({ error: 'channel id ต้องเป็นตัวเลข 17-20 หลัก' }, { status: 400 })
        }
        if (!guildId) {
          return Response.json({ error: 'ต้องผูกเซิร์ฟเวอร์ให้กลุ่มนี้ก่อนจึงจะตั้งห้องข่าวสารได้' }, { status: 400 })
        }
        // ห้องต้องอยู่ในเซิร์ฟของกลุ่ม ไม่งั้นบอท fetch guild แล้วหาห้องไม่เจอ = job ล้มเปล่าๆ
        if (!(await channelBelongsToGuild(guildId, channel))) {
          return Response.json({ error: 'ห้องนี้ไม่ได้อยู่ในเซิร์ฟเวอร์ของกลุ่ม' }, { status: 400 })
        }
      }
      values.push(channel); fields.push(`news_channel_id = $${values.length}`)
    }

    values.push(found.rowIds)
    await pool.query(
      `UPDATE dc_social_accounts SET ${fields.join(', ')} WHERE id = ANY($${values.length})`,
      values
    )

    return Response.json({ ok: true, updated: found.rowIds.length })
  } catch (error) {
    console.error('[PATCH /api/social/groups]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
