import { postContext } from '@/lib/postsGuard.js'
import { canPublishPost, canWritePost } from '@/lib/postsAccess.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getOrgConfig } from '@/db/orgConfig.js'
import { listMedia } from '@/db/posts/media.js'
import { createJobs, activePlatforms } from '@/db/posts/jobs.js'
import { resolveGroupAccounts, hasNewsChannel, publisherIdentity } from '@/lib/publishTargets.js'
import { resolveWatermarkRef } from '@/lib/watermarks.js'

const VALID_PLATFORMS = ['fb', 'ig', 'threads', 'x', 'news']
// IG/Threads โพสต์ข้อความล้วนไม่ได้ (ข้อจำกัดของ Graph API เอง) — ตัดตั้งแต่ต้นทาง ไม่ปล่อยให้ worker ล้ม
const NEEDS_MEDIA = ['ig', 'threads']

/**
 * เวลาที่ผู้ใช้กรอกมาเป็นเวลาไทย (`"2026-07-30T21:00"` จาก input datetime-local ไม่มี timezone)
 * → เติม +07:00 ให้ชัดเจน แล้วส่งสตริงนั้นให้ pg แปลงเอง (กันบั๊ก +7 ชม. แบบ txn_at ของ finance)
 */
function toTimestamptz(input) {
  const s = String(input).trim()
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(s)
  const normalized = hasZone ? s : `${s}+07:00`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return null
  return { value: normalized, ms: d.getTime() }
}

/**
 * POST /api/posts/[id]/publish — สั่งโพสต์ (เว็บเขียนคิว บอทเป็นคนยิง)
 * body { platforms:string[], group:string, scheduledAt?:string|null, channelId?:string|null, wmType?:string }
 *   group = `dc_social_accounts.group_name` — ตัวตนที่พาดข้ามแพลตฟอร์ม (เหมือนตะกร้าดิสฯ)
 *   server แปลงเป็นบัญชีรายแพลตฟอร์มเอง ไม่รับ account id จาก client
 */
export async function POST(req, { params }) {
  const { id } = await params
  const ctx = await postContext(id)
  if (ctx.error) return ctx.error

  if (!canPublishPost(ctx.post, ctx.access, ctx.userId, ctx.policy)) {
    // แยกเหตุผลให้ user รู้ว่าต้องทำอะไรต่อ — "ยังไม่อนุมัติ" แก้ได้เอง แต่ "ไม่มีสิทธิ์" แก้ไม่ได้
    const reason = canWritePost(ctx.post, ctx.access, ctx.userId, ctx.policy)
      ? 'โพสต์นี้ต้องได้รับอนุมัติก่อนจึงจะเผยแพร่ได้'
      : 'ไม่มีสิทธิ์สั่งเผยแพร่โพสต์นี้'
    return Response.json({ error: reason }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))

  const platforms = [...new Set(Array.isArray(body.platforms) ? body.platforms : [])]
  if (!platforms.length) return Response.json({ error: 'ต้องเลือกอย่างน้อย 1 แพลตฟอร์ม' }, { status: 400 })
  const unknown = platforms.filter(p => !VALID_PLATFORMS.includes(p))
  if (unknown.length) {
    return Response.json({ error: `ไม่รู้จักแพลตฟอร์ม: ${unknown.join(', ')}` }, { status: 400 })
  }

  let scheduledAt = null
  if (body.scheduledAt) {
    const parsed = toTimestamptz(body.scheduledAt)
    if (!parsed) return Response.json({ error: 'รูปแบบเวลาที่ตั้งไว้ไม่ถูกต้อง' }, { status: 400 })
    if (parsed.ms < Date.now()) return Response.json({ error: 'ตั้งเวลาย้อนหลังไม่ได้' }, { status: 400 })
    scheduledAt = parsed.value
  }

  try {
    // snapshot สื่อ ณ ตอนกดโพสต์ — แก้สื่อทีหลังไม่กระทบงานที่เข้าคิวไปแล้ว (worker อ่านไฟล์จาก path นี้)
    const media = (await listMedia(ctx.post.id)).map(m => ({ kind: m.kind, path: m.path }))
    if (!media.length) {
      const need = platforms.filter(p => NEEDS_MEDIA.includes(p))
      if (need.length) {
        return Response.json(
          { error: `${need.join('/')} ต้องมีรูปอย่างน้อย 1 ชิ้น — แนบสื่อก่อนแล้วค่อยกดเผยแพร่` },
          { status: 400 }
        )
      }
    }

    // ⚠️ ด่านความปลอดภัยเดียวของบัญชี — ฝั่งบอทเชื่อค่าในแถวงานเลย (ดูคอมเมนต์ใน services/metaApi.js)
    // เลือกเป็น "กลุ่ม" แล้ว server แปลงเป็นบัญชีรายแพลตฟอร์มเอง — ไม่รับ id จาก client
    // (รับ id ตรงๆ = คนใน org เดียวกันยิงในนามบัญชี private ของคนอื่นได้ เพราะ org_id ตรงกันหมด)
    const { userId: publisherUserId, discordId: publisherDiscordId } = await publisherIdentity(ctx.session)
    let accountIds = {}
    let groupName = null
    let wmType = null
    const socialPlatforms = platforms.filter(p => p !== 'news')
    if (typeof body.group === 'string' && body.group.trim()) {
      const resolved = await resolveGroupAccounts({
        orgId: ctx.orgId,
        userId: publisherUserId,
        discordId: publisherDiscordId,
        group: body.group.trim(),
        platforms,
      })
      if (!resolved.ok) return Response.json({ error: resolved.error }, { status: 403 })
      accountIds = resolved.accountIds
      groupName = resolved.group

      // ลายน้ำ: ค่าที่เก็บลงแถวงานต้องเป็นไฟล์จริงของกลุ่มนี้เท่านั้น (whitelist ตั้งแต่ขาเขียน)
      // — ไม่งั้นค่าจาก client จะกลายเป็น path บนเครื่องบอทตอน worker หยิบไปใช้
      wmType = await resolveWatermarkRef(body.wmType, {
        guildId: resolved.guildId, group: resolved.group,
        visibility: resolved.visibility, discordId: publisherDiscordId,
      })
      if (wmType === undefined) {
        return Response.json({ error: 'ลายน้ำที่เลือกไม่ใช่ของกลุ่มนี้' }, { status: 400 })
      }
    } else if (socialPlatforms.length) {
      // ไม่เลือกกลุ่ม = ปล่อยให้บอทเลือกบัญชีเอง ซึ่งอาจได้คนละตัวตนกันในแต่ละแพลตฟอร์ม → บังคับเลือก
      return Response.json({ error: 'ต้องเลือกกลุ่มที่จะโพสต์ในนามก่อน' }, { status: 400 })
    }

    // กันกดซ้ำ/ดับเบิลคลิก — งานที่ยังไม่ยิงของแพลตฟอร์มเดียวกันมีอยู่แล้ว = ไม่สร้างเพิ่ม
    // (ไม่งั้นโพสต์ออก 2 รอบ ซึ่งเรียกคืนไม่ได้)
    const busy = await activePlatforms(ctx.post.id, platforms)
    if (busy.length) {
      return Response.json(
        { error: `มีงานที่ยังไม่ได้ยิงค้างอยู่แล้ว (${busy.join(', ')}) — รอให้เสร็จหรือยกเลิกก่อน` },
        { status: 409 }
      )
    }

    const guildId = await getGuildId(ctx.session)
    // 'news' = ส่งเข้าห้องข่าวสารใน Discord → org ที่ยังไม่เชื่อม Discord ทำไม่ได้ (worker จะล้มเปล่าๆ)
    if (platforms.includes('news')) {
      if (!guildId) {
        return Response.json({ error: 'หน่วยงานนี้ยังไม่ได้เชื่อมกับ Discord จึงส่งเข้าห้องข่าวสารไม่ได้' }, { status: 400 })
      }
      // ไม่ได้ตั้ง news_channel_id ไว้ = job จะ retry 3 รอบแล้ว failed เปล่าๆ → ตัดตั้งแต่ต้นทาง
      if (!(await hasNewsChannel(guildId))) {
        return Response.json({ error: 'ยังไม่ได้ตั้งห้องข่าวสารของเซิร์ฟเวอร์นี้ (ตั้งที่ /bot/platforms)' }, { status: 400 })
      }
    }

    // ห้องที่จะแจ้งผลกลับ: เลือกตอนกด > เธรดต้นทาง (มาจากตะกร้าดิสฯ) > ค่า default ของ org > ไม่แจ้ง (org ไม่มี Discord = ข้ามเงียบ)
    // ก่อนแก้: โพสต์ที่มาจากตะกร้าดิสฯ ไม่เคยส่งลิงก์กลับเธรดเลยเมื่อกดเผยแพร่จากเว็บ เพราะ ctx.post.channel_id ไม่เคยถูกอ่าน
    const channelId = body.channelId || ctx.post.channel_id
      || (await getOrgConfig(ctx.orgId, 'posts_notify_channel')) || null

    const jobs = await createJobs({
      orgId: ctx.orgId,
      episodeId: ctx.post.id,
      platforms,
      accountIds,
      groupName,
      guildId,
      channelId,
      caption: ctx.post.body || '',
      media,
      scheduledAt,
      wmType,
      createdBy: ctx.userId,
      createdByDiscordId: ctx.session?.user?.discordId || null,
    })

    return Response.json({ success: true, data: { batchId: jobs[0]?.batch_id || null, jobs } }, { status: 202 })
  } catch (error) {
    console.error('[POST /api/posts/[id]/publish]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
