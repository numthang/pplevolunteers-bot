/**
 * รูปพื้นหลังของการ์ดคำคม — รับมาจาก 3 ทาง แล้วคืน { buffer, bgPath } เสมอ
 *
 * ทำไมต้องมีไฟล์นี้: การ์ด 1 ใบผู้ใช้กดสลับสไตล์/สีหลายรอบกว่าจะพอใจ ถ้าให้อัปรูปใหม่ทุกรอบ
 * = อัปไฟล์เดิมซ้ำ 10 ครั้ง → รอบแรกเซฟลงดิสก์แล้วคืน `bgPath` กลับไป รอบต่อไปส่งแค่ path
 *
 * ⚠️ ไฟล์พื้นหลัง **ไม่สร้างแถวใน `post_episode_media`** — มันเป็นวัตถุดิบ ไม่ใช่ของที่จะโพสต์
 * ถ้าสร้างแถว รูปพื้นหลังจะโผล่ในกล่องสื่อของโพสต์ด้วย (ไม่ใช่สิ่งที่ผู้ใช้ต้องการ)
 * และขัดกฎ CLAUDE.md ที่ห้ามสร้างแถวใน DB ก่อนกด "บันทึก"
 * → ไฟล์กำพร้าตอนผู้ใช้กดยกเลิก เป็นหน้าที่ของ gc เก็บทีหลัง (grill ข้อ 6)
 */
import { readFile } from 'fs/promises'
import { HEX_RE } from './quoteStyles.js'
import { absPath, savePostFile, isAllowedMime, MAX_FILE_SIZE } from './postsStorage.js'
import { listMedia, findMediaByPath } from '@/db/posts/media.js'
import { findAssetByPath } from '@/db/posts/assets.js'

export class QuoteBgError extends Error {}

const BG_PATH_RE = /^storage\/posts\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/i

/**
 * @param {{bgFile?:File|null, bgPath?:string|null, bgMediaId?:number|string|null}} input
 * @param {number} episodeId  โพสต์ที่กำลังทำการ์ดอยู่ — ใช้จำกัดขอบเขต bgMediaId/bgPath
 * @returns {Promise<{buffer:Buffer, bgPath:string}>}
 */
export async function resolveBackground({ bgFile, bgPath, bgMediaId }, episodeId) {
  // 1) อัปโหลดใหม่ — เซฟลงดิสก์ทันทีเพื่อให้รอบถัดไปส่งแค่ path มาได้
  if (bgFile && typeof bgFile === 'object' && bgFile.size > 0) {
    if (!isAllowedMime(bgFile.type)) throw new QuoteBgError(`ชนิดไฟล์ไม่รองรับ: ${bgFile.type}`)
    if (bgFile.size > MAX_FILE_SIZE) throw new QuoteBgError('ไฟล์ใหญ่เกินไป (จำกัด 12MB)')
    const buffer = Buffer.from(await bgFile.arrayBuffer())
    const saved = await savePostFile(buffer, bgFile.type)
    return { buffer, bgPath: saved }
  }

  // 2) เลือกจากสื่อที่อยู่ในโพสต์นี้อยู่แล้ว — ยืนยันว่าเป็นของโพสต์นี้จริงก่อน
  if (bgMediaId !== null && bgMediaId !== undefined && bgMediaId !== '') {
    const id = Number(bgMediaId)
    if (!Number.isInteger(id)) throw new QuoteBgError('bgMediaId ไม่ถูกต้อง')
    const media = await listMedia(episodeId)
    // ⚠️ `post_episode_media.id` เป็น BIGSERIAL → node-postgres คืนมาเป็น **string** ไม่ใช่ number
    // เทียบ `m.id === id` ตรงๆ จะไม่มีวันเจอ (เคยพลาดมาแล้วตอนเทส)
    const hit = media.find(m => Number(m.id) === id)
    if (!hit) throw new QuoteBgError('ไม่พบสื่อชิ้นนี้ในโพสต์')
    if (!hit.path) throw new QuoteBgError('สื่อชิ้นนี้ยังไม่มีไฟล์บนดิสก์')
    if (hit.kind === 'video') throw new QuoteBgError('ใช้วิดีโอเป็นพื้นหลังไม่ได้')
    return { buffer: await readFile(absPath(hit.path)), bgPath: hit.path }
  }

  // 3) path ที่เคยคืนไปรอบก่อน — รูปแบบต้องตรงเป๊ะ + absPath กัน traversal อีกชั้น
  if (bgPath) {
    const p = String(bgPath)
    if (!BG_PATH_RE.test(p)) throw new QuoteBgError('bgPath ไม่ถูกต้อง')
    // ถ้า path นี้เป็นสื่อของโพสต์อื่น = ไม่ให้ใช้ (ไฟล์กำพร้าที่เพิ่งอัปจะไม่มีแถว = ผ่าน)
    const owners = await findMediaByPath(p)
    if (owners.length && !owners.some(o => Number(o.episode_id) === Number(episodeId))) {
      throw new QuoteBgError('รูปนี้เป็นของโพสต์อื่น')
    }
    // ⛔ path ของ **คลังภาพ** ห้ามผ่านทางนี้ (เคาะ 2026-08-04 หลัง /scrutinize) 2 เหตุผล:
    //   1. `bg_path` โดน deletePostFile ตอนลบการ์ดคำคม → จะลากไฟล์ในคลังหายไปด้วย
    //   2. findMediaByPath คืน [] ให้ asset เสมอ (ไม่มีแถวใน post_episode_media) ด่านบนจึงไม่กัน
    //      → คนที่รู้ path ของรูป personal คนอื่นเอามาใช้ได้
    // เลือกรูปจากคลังในกล่องนี้ ครอปฝั่ง client แล้วอัปเป็นไฟล์ใหม่เสมอ (กิ่ง 1 = สำเนาคนละใบ)
    // path ของ asset จึงไม่มีทางมาถึงตรงนี้โดยชอบธรรม
    if (await findAssetByPath(p)) throw new QuoteBgError('รูปในคลังต้องเลือกผ่านกล่องคลังภาพ')
    try {
      return { buffer: await readFile(absPath(p)), bgPath: p }
    } catch {
      throw new QuoteBgError('ไม่พบไฟล์พื้นหลัง — อัปโหลดใหม่อีกครั้ง')
    }
  }

  throw new QuoteBgError('ยังไม่ได้เลือกรูปพื้นหลัง')
}

/** อ่านค่าจาก FormData ให้เป็นรูปที่ resolveBackground/normalizeQuoteParams กินได้ */
export function readQuoteForm(form) {
  const str = k => {
    const v = form.get(k)
    return typeof v === 'string' ? v : null
  }
  return {
    bgFile: form.get('bg'),
    bgPath: str('bgPath'),
    bgMediaId: str('bgMediaId'),
    quoteText: str('quoteText'),
    authorName: str('authorName'),
    style: str('style'),
    saturation: str('saturation'),
    // ลายน้ำของการ์ดแบบไม่มีรูป (`plain-logo`) — ไม่เกี่ยวกับ 3 ทางข้างบน
    // ต้องผ่าน resolvePlainWatermark() ก่อนเสมอ ห้ามเอาค่านี้ไปต่อ path ตรงๆ
    wmType: str('wmType'),
    // ฟอนต์/ขนาดตัวอักษร — ใช้ได้ทั้งการ์ดมีรูปและไม่มีรูป (2026-08-11) ค่าที่ไม่รู้จักตกเป็น default ที่ normalizeQuoteParams
    font: str('font'),
    textSize: str('textSize'),
    // สีที่ผู้ใช้เลือกเองจาก color picker — ไม่ส่งมา = ใช้สี CI ขององค์กร (ดู resolveQuoteAccent)
    accent: str('accent'),
    // สีตัวอักษรคำคม (headline เท่านั้น ไม่ใช่ชื่อผู้พูด) ที่ผู้ใช้เลือกเอง — ไม่ส่งมา = auto
    // ของแต่ละสไตล์ (ดู utils/quoteStyles.js) · validate ด้วย pickedAccent() ตัวเดียวกัน
    // เพราะเป็น hex parser เดียวกันเป๊ะ ไม่ต้องมีฟังก์ชันซ้ำ
    textColor: str('textColor'),
    // สัดส่วนการ์ดแบบไม่มีรูป ('1:1'/'4:5'/'16:9') — การ์ดที่มีรูปเอาสัดส่วนจากไฟล์ที่ครอปมาแล้ว
    aspect: str('aspect'),
  }
}

/** สีจาก color picker → '#rrggbb' หรือ null (ไม่ได้เลือก/รูปแบบผิด = ตกไปใช้สี CI) */
export function pickedAccent(value) {
  const s = String(value ?? '').trim()
  return HEX_RE.test(s) ? s.toLowerCase() : null
}
