/**
 * publishTargets — "โพสต์ในนามใคร" ของกล่องเผยแพร่ (posts)
 *
 * หน่วยที่คนเลือกคือ **กลุ่ม (`dc_social_accounts.group_name`)** ไม่ใช่บัญชีรายตัว —
 * 1 แถว = 1 แพลตฟอร์ม แต่ 1 ครั้งที่กดโพสต์ยิงหลายแพลตฟอร์มพร้อมกัน
 * (ตะกร้าดิสฯ ก็เลือกด้วยกลุ่มมาตั้งแต่ต้น — `basket_group` ใน handlers/basketHandler.js)
 *
 * ⚠️ ขอบเขตที่เห็น (ต้องตรงกับ getConfig ฝั่งบอท — services/metaApi.js):
 *   public  → บัญชีขององค์กรนี้ (org เดียวมีได้หลาย guild)
 *   private → **บัญชีของตัวเองเท่านั้น** ห้ามใช้แค่ org_id ตัดสิน ไม่งั้นคนใน org เดียวกัน
 *             โพสต์ในนามเฟซบุ๊กส่วนตัวของคนอื่นได้
 */
import pool from '@/db/index.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { listGuildChannels } from '@/lib/discordChannels.js'

const SELECT_VISIBLE = `
  SELECT id, platform, group_name, guild_id, name, visibility, news_channel_id
    FROM dc_social_accounts
   WHERE group_name IS NOT NULL AND group_name <> ''
     AND ( (visibility = 'public'  AND org_id = $1)
        OR (visibility = 'private' AND (owner_user_id = $2
             OR ($3::varchar IS NOT NULL AND user_discord_id = $3))) )
   ORDER BY group_name, platform, id`

/** ค่าพิเศษของ news_channel_id = "กลุ่มนี้ไม่ส่งเข้าห้องข่าวสาร" (ต่างจาก NULL ที่ยัง fallback ไปห้องของ guild) */
export const NEWS_OFF = 'off'

/** ตัวตนที่ใช้ตัดสินสิทธิ์บัญชี — debug mode คืน discordId = null (บัญชีส่วนตัวจึงหายไปเอง) */
export async function publisherIdentity(session) {
  const { discordId } = await getEffectiveIdentity(session)
  return { userId: session?.user?.userId || null, discordId: discordId || null }
}

/**
 * กลุ่มทั้งหมดที่คนนี้โพสต์ได้ในองค์กรนี้
 * @returns {Promise<Array<{name, guildId, visibility, accounts: Record<string, {id, name}>}>>}
 */
export async function listPublishGroups({ orgId, userId, discordId }) {
  const { rows } = await pool.query(SELECT_VISIBLE, [orgId || null, userId || null, discordId])

  const byName = new Map()
  for (const r of rows) {
    if (!byName.has(r.group_name)) {
      byName.set(r.group_name, {
        name: r.group_name, guildId: r.guild_id, visibility: r.visibility,
        newsChannelId: r.news_channel_id || null,
        accounts: {}, rowIds: [], guildIds: new Set(),
      })
    }
    const g = byName.get(r.group_name)
    // 1 กลุ่มควรมี 1 บัญชีต่อแพลตฟอร์ม — ถ้าซ้ำ (ไม่มี constraint กันใน DB) ยึดตัว id น้อยสุดตาม ORDER BY
    if (!g.accounts[r.platform]) g.accounts[r.platform] = { id: r.id, name: r.name }
    g.rowIds.push(r.id)              // ทุกแถวของกลุ่ม — ใช้เป็นขอบเขตตอน fan-out ตั้งค่ารายกลุ่ม
    if (r.guild_id) g.guildIds.add(r.guild_id)
    // ค่าระดับกลุ่มซ้ำทุกแถวอยู่แล้ว → ยึด non-null ตัวแรก (แถวที่เพิ่มเข้ากลุ่มทีหลังอาจยังว่าง)
    if (!g.guildId) g.guildId = r.guild_id
    if (!g.newsChannelId) g.newsChannelId = r.news_channel_id || null
  }
  const list = [...byName.values()]
  // กลุ่มที่บัญชีกระจายอยู่หลายเซิร์ฟ = ตะกร้าดิสฯ (หาด้วย guild_id) จะเห็นกลุ่มนี้ไม่ครบทุกแพลตฟอร์ม
  for (const g of list) g.mixedGuilds = g.guildIds.size > 1
  return list
}

/**
 * เติม `newsReady` ให้ทุกกลุ่ม — "กลุ่มนี้ติ๊กห้องข่าวสารได้ไหม"
 *
 * ลำดับตัดสิน (ต้องตรงกับ getNewsChannelId ฝั่งบอท — services/newsShare.js):
 *   'off'      → ไม่ส่ง
 *   มี channel → ส่งเข้าห้องนั้น
 *   ว่าง       → public: fallback ห้องของ guild (ของเดิมก่อนมีคอลัมน์นี้ ต้องไม่พังตอน deploy)
 *                private: **ไม่ fallback** — กลุ่มส่วนตัวยิงเข้าห้องข่าวขององค์กรได้เฉพาะเมื่อ
 *                ทีมสื่อตั้งห้องให้เท่านั้น (ด่านอยู่ที่ endpoint ตั้งค่า ไม่ต้องเช็คยศตอนกดโพสต์)
 */
export async function attachNewsReady(groups) {
  const needFallback = groups.filter(g => !g.newsChannelId && g.visibility === 'public')
  const guildNews = await guildNewsChannels(needFallback.map(g => g.guildId))
  for (const g of groups) {
    const fallback = g.visibility === 'public' ? guildNews.get(g.guildId) || null : null
    // ปลายทางจริง — ใช้ทั้งตัดสิน newsReady และหาชื่อห้องมาโชว์ในกล่องเผยแพร่
    g.newsTargetId = g.newsChannelId === NEWS_OFF ? null : (g.newsChannelId || fallback)
    g.newsSource = g.newsChannelId && g.newsChannelId !== NEWS_OFF ? 'group' : g.newsTargetId ? 'guild' : null
    g.newsReady = !!g.newsTargetId
  }
  return groups
}

/**
 * เติมชื่อห้องให้กลุ่มที่พร้อมส่ง — ดึงจาก Discord ตาม channel id (ไม่เก็บชื่อลง DB)
 * ห้องเปลี่ยนชื่อในดิสคอร์ดแล้วชื่อที่โชว์เปลี่ยนตามเอง · ดึงไม่ได้ = ปล่อยชื่อเป็น null (UI โชว์ป้ายเปล่า)
 */
export async function attachNewsChannelName(groups) {
  const byGuild = new Map()
  for (const g of groups) {
    if (g.newsTargetId && g.guildId) byGuild.set(g.guildId, null)
  }
  await Promise.all([...byGuild.keys()].map(async gid => {
    byGuild.set(gid, await listGuildChannels(gid))
  }))
  for (const g of groups) {
    const list = g.newsTargetId && g.guildId ? byGuild.get(g.guildId) : null
    g.newsChannelName = list?.find(c => c.id === g.newsTargetId)?.name || null
  }
  return groups
}

/**
 * แปลงชื่อกลุ่ม → บัญชีรายแพลตฟอร์ม (ตรวจสิทธิ์แล้ว) สำหรับเขียนลงแถวงาน
 * @returns {Promise<{ok:true, group, guildId, visibility, accountIds:Record<string,number>} | {ok:false, error:string}>}
 */
export async function resolveGroupAccounts({ orgId, userId, discordId, group, platforms }) {
  const groups = await listPublishGroups({ orgId, userId, discordId })
  const found = groups.find(g => g.name === group)
  if (!found) return { ok: false, error: `ไม่พบกลุ่ม "${group}" หรือไม่มีสิทธิ์ใช้กลุ่มนี้` }

  // 'news' ไม่ใช่บัญชีโซเชียล (เป็นห้องใน Discord) → ไม่ต้องมีในกลุ่ม
  const needAccount = platforms.filter(p => p !== 'news')
  const missing = needAccount.filter(p => !found.accounts[p])
  if (missing.length) {
    return { ok: false, error: `กลุ่ม "${group}" ไม่มีบัญชี ${missing.join('/')} — เอาแพลตฟอร์มนั้นออกก่อน` }
  }

  const accountIds = {}
  for (const p of needAccount) accountIds[p] = found.accounts[p].id

  // ห้องข่าวสาร: ตัดสินด้วยกฎชุดเดียวกับที่กล่องเผยแพร่ใช้โชว์ป้าย (ไม่งั้น UI เทา/ไม่เทา ไม่ตรงกับ API)
  if (platforms.includes('news')) await attachNewsReady([found])

  return {
    ok: true, group: found.name, guildId: found.guildId, visibility: found.visibility,
    accountIds, newsChannelId: found.newsChannelId || null, newsReady: !!found.newsReady,
  }
}

/** guild นี้ตั้งห้องข่าวสารไว้หรือยัง — ไม่ได้ตั้ง = ติ๊ก 'ห้องข่าวสาร' ไปก็ล้มที่ worker เปล่าๆ */
export async function hasNewsChannel(guildId) {
  if (!guildId) return false
  const { rows } = await pool.query(
    `SELECT value FROM dc_guild_config WHERE guild_id = $1 AND "key" = 'news_channel_id'`,
    [guildId]
  )
  return !!rows[0]?.value
}

/**
 * ห้องข่าวสารราย guild (ค่าเดิมก่อนมีคอลัมน์รายกลุ่ม) — คืน Map guild_id → channel_id
 * ใช้ตอบทุกกลุ่มในนัดเดียว (1 query ไม่ใช่ N) และใช้หาชื่อห้องต่อ
 */
export async function guildNewsChannels(guildIds) {
  const ids = [...new Set((guildIds || []).filter(Boolean))]
  if (!ids.length) return new Map()
  const { rows } = await pool.query(
    `SELECT guild_id, value FROM dc_guild_config
      WHERE guild_id = ANY($1) AND "key" = 'news_channel_id'`,
    [ids]
  )
  return new Map(rows.filter(r => r.value).map(r => [r.guild_id, String(r.value)]))
}
