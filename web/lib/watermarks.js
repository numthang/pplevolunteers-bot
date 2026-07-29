/**
 * watermarks — ลายน้ำของกล่องเผยแพร่ (posts) · ใช้ไฟล์ชุดเดียวกับตะกร้าดิสฯ
 *
 * โครงโฟลเดอร์ (ตั้งที่หน้า /bot/media/settings — handlers/basketHandler.js อ่านที่เดียวกัน):
 *   assets/watermark/<guild_id>/<group_name>/*.png   ← กลุ่ม public
 *   assets/watermark/user_<discord_id>/*.png         ← กลุ่ม private (ลายน้ำส่วนตัว)
 *
 * ⚠️ ค่าที่เก็บลงแถวงานเป็น `path:<relative>` (resolve เสร็จแล้ว) ไม่ใช่ token `guild:`/`personal:`
 *    แบบตะกร้าดิสฯ เพราะเว็บเป็น org-scope: กลุ่มที่เลือกอาจอยู่คนละ guild กับ guild ที่ผู้ใช้อยู่
 *    → ให้ที่นี่เป็นคนตัดสิน guild/โฟลเดอร์ แล้ว worker แค่ต่อ path (+ เช็คว่าไม่หลุดออกนอกโฟลเดอร์)
 *    ผลพลอยได้: whitelist ตั้งแต่ตอนเขียน — client ส่ง `../../` มาก็ไม่ผ่าน
 */
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import pool from '@/db/index.js'

const ASSETS_DIR = join(process.cwd(), '..', 'assets', 'watermark')
const IMG_RE = /\.(png|jpe?g|webp)$/i

const label = f => f.replace(/\.[^.]+$/, '')

/** โฟลเดอร์ลายน้ำของกลุ่มนี้ (relative จาก ASSETS_DIR) — private ใช้โฟลเดอร์ส่วนตัวของเจ้าของ */
function groupDir({ guildId, group, visibility, discordId }) {
  if (visibility === 'private') return discordId ? `user_${discordId}` : null
  return guildId && group ? `${guildId}/${group}` : null
}

function listImgs(rel) {
  if (!rel) return []
  const dir = join(ASSETS_DIR, rel)
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir).filter(f => IMG_RE.test(f) && statSync(join(dir, f)).isFile()).sort()
  } catch { return [] }
}

/** ค่า default ที่ตะกร้าดิสฯ ใช้: ของกลุ่มก่อน แล้วค่อยของ guild (เก็บเป็น token `guild:<ไฟล์>`) */
async function defaultFile(guildId, group) {
  if (!guildId) return null
  const { rows } = await pool.query(
    `SELECT "key", value FROM dc_guild_config
      WHERE guild_id = $1 AND "key" IN ($2, 'default_watermark')`,
    [guildId, `default_watermark_group:${group}`]
  )
  const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]))
  const raw = byKey[`default_watermark_group:${group}`] || byKey.default_watermark || null
  if (typeof raw !== 'string' || !raw || raw === 'none') return null
  return raw.replace(/^(guild|personal):/, '')            // เก็บเป็น token ในตารางเดิม เอาแค่ชื่อไฟล์
}

/**
 * ตัวเลือกลายน้ำของกลุ่มหนึ่ง
 * @returns {Promise<{options: Array<{value:string,label:string}>, default: string|null}>}
 */
export async function listWatermarks({ guildId, group, visibility, discordId }) {
  const rel = groupDir({ guildId, group, visibility, discordId })
  const files = listImgs(rel)
  const options = files.map(f => ({ value: `path:${rel}/${f}`, label: label(f) }))

  const def = visibility === 'private' ? null : await defaultFile(guildId, group)
  const match = def && files.includes(def) ? `path:${rel}/${def}` : null
  return { options, default: match }
}

/**
 * ตรวจค่าที่ client ส่งมาว่าเป็นลายน้ำจริงของกลุ่มนี้ไหม (นี่คือ whitelist ตัวจริง)
 * @returns {Promise<string|null>} ค่า `path:…` ที่พร้อมเก็บลงแถวงาน · null = ไม่ติดลายน้ำ
 */
export async function resolveWatermarkRef(wmType, ctx) {
  if (!wmType || wmType === 'none') return null
  const { options } = await listWatermarks(ctx)
  return options.some(o => o.value === wmType) ? wmType : undefined   // undefined = ค่าไม่ถูกต้อง
}
