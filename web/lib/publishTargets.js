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

const SELECT_VISIBLE = `
  SELECT id, platform, group_name, guild_id, name, visibility
    FROM dc_social_accounts
   WHERE group_name IS NOT NULL AND group_name <> ''
     AND ( (visibility = 'public'  AND org_id = $1)
        OR (visibility = 'private' AND (owner_user_id = $2
             OR ($3::varchar IS NOT NULL AND user_discord_id = $3))) )
   ORDER BY group_name, platform, id`

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
      byName.set(r.group_name, { name: r.group_name, guildId: r.guild_id, visibility: r.visibility, accounts: {} })
    }
    const g = byName.get(r.group_name)
    // 1 กลุ่มควรมี 1 บัญชีต่อแพลตฟอร์ม — ถ้าซ้ำ (ไม่มี constraint กันใน DB) ยึดตัว id น้อยสุดตาม ORDER BY
    if (!g.accounts[r.platform]) g.accounts[r.platform] = { id: r.id, name: r.name }
    if (!g.guildId) g.guildId = r.guild_id
  }
  return [...byName.values()]
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
  return { ok: true, group: found.name, guildId: found.guildId, visibility: found.visibility, accountIds }
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
