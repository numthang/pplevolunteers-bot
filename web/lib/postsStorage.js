/**
 * ที่เก็บไฟล์สื่อของ posts — **นอก `public/`** (grill ข้อ 5)
 *
 * ต่างจาก finance/cooking ที่เขียนลง `web/public/uploads/` แล้วเสิร์ฟเป็น static:
 * ร่าง `personal` เป็นเนื้อหาจุดยืนการเมืองที่ยังไม่พร้อมเผยแพร่ → ไฟล์ต้องผ่าน gate เสมอ
 * เสิร์ฟผ่าน `/api/posts/media/[id]` ที่เช็ค postsAccess ก่อน stream
 *
 * path ที่เก็บใน DB = relative จาก **repo root** (เช่น `storage/posts/ab12….jpg`)
 * เพราะ worker ฝั่งบอทเป็นคนละโปรเซส คนละ cwd แต่อ่านดิสก์ก้อนเดียวกัน
 */

import { writeFile, mkdir, unlink, readFile } from 'fs/promises'
import { createWriteStream } from 'fs'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { join, resolve, sep } from 'path'
import { randomUUID, createHash } from 'crypto'

// web/ อยู่ใต้ repo root → ../ คือรากที่บอทใช้เป็น cwd
export const REPO_ROOT = resolve(process.cwd(), '..')
export const POSTS_DIR = join('storage', 'posts')

export const MAX_FILE_SIZE = 12 * 1024 * 1024   // 12 MB — รูปจากมือถือสมัยนี้ 8–10 MB ได้
export const MAX_MEDIA_PER_EPISODE = 20

// 200 MB ≈ คลิปมือถือดิบ 1080p ยาว ~90 วิ (เพดานความยาวของ Reels)
// เพดานนี้ปลอดภัยได้เพราะขาอัปโหลดวิดีโอ **สตรีมลงดิสก์** (savePostFileFromStream)
// ⛔ ห้ามเปลี่ยนขาวิดีโอกลับไปใช้ `req.formData()` — ตัวนั้นอมทั้งไฟล์ใน RAM แล้ว
//    `Buffer.from(arrayBuffer)` อีกชุด = 400 MB ต่อ request บนเครื่องที่ RAM/CPU ตึงอยู่แล้ว
export const MAX_VIDEO_SIZE = 200 * 1024 * 1024
export const MAX_VIDEO_PER_EPISODE = 1   // publishPipeline เก็บ videoUrl ได้ตัวเดียว (ตัวหลังทับตัวหน้า)

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// ⛔ แยกจาก EXT_BY_MIME **โดยตั้งใจ** — `isAllowedMime()` ถูกใช้โดยคลังภาพ (`/api/posts/assets`)
//    และปุ่มแก้รูป (`PUT /api/posts/media/[id]`) ด้วย · ถ้าเอาวิดีโอยัดรวมในนั้น
//    mp4 จะไหลเข้าคลังภาพได้ (probeImage/sharp คืนค่าว่าง → ธัมบ์เนลแตก)
//    และ PUT ทับแถวรูปด้วย mp4 ได้โดย kind ยังเป็น 'upload' → pipeline ส่งคลิปเข้าช่องรูป
const VIDEO_EXT_BY_MIME = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

/** รูปเท่านั้น — ทางเข้าที่รับวิดีโอด้วยต้องเรียก `isAllowedVideoMime()` เพิ่มเอง */
export function isAllowedMime(mime) {
  return Object.hasOwn(EXT_BY_MIME, mime)
}

export function isAllowedVideoMime(mime) {
  return Object.hasOwn(VIDEO_EXT_BY_MIME, mime)
}

/** mime → `kind` ที่เก็บใน `post_episode_media` (retention กับ UI แยกกันด้วยคอลัมน์นี้) */
export function kindOfMime(mime) {
  return isAllowedVideoMime(mime) ? 'video' : 'upload'
}

/** ขนาดสูงสุดของไฟล์ชนิดนี้ (ไบต์) — ข้อความ error ต้องดึงตัวเลขจากตรงนี้ ห้าม hardcode */
export function maxSizeOfMime(mime) {
  return isAllowedVideoMime(mime) ? MAX_VIDEO_SIZE : MAX_FILE_SIZE
}

export function mimeOfPath(path) {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  // วิดีโอจากตะกร้าดิสฯ เสิร์ฟผ่าน route เดียวกับรูปแล้ว — ไม่มี 3 บรรทัดนี้ .mp4 จะตกเข้า default
  // image/jpeg แล้วเบราว์เซอร์เล่นไม่ได้ (route เก่า /api/bot/basket/media/[id] เคย hardcode ไว้)
  if (ext === 'mp4')  return 'video/mp4'
  if (ext === 'mov')  return 'video/quicktime'
  if (ext === 'webm') return 'video/webm'
  return 'image/jpeg'
}

/** absolute path จาก path ที่เก็บใน DB — กัน path traversal ก่อนแตะดิสก์เสมอ */
export function absPath(relPath) {
  const abs = resolve(REPO_ROOT, relPath)
  const base = resolve(REPO_ROOT, POSTS_DIR)
  if (abs !== base && !abs.startsWith(base + sep)) {
    throw new Error('postsStorage: path อยู่นอก storage/posts')
  }
  return abs
}

/**
 * require ของ **repo root** — ⛔ ห้ามเปลี่ยนเป็น `import` หรือ `await import()`
 *
 * `utils/imageDownscale.js` อยู่นอก `web/` → `serverExternalPackages: ['sharp']` ใน next.config.js
 * **ไม่มีผลกับมัน** · webpack เลยลาก `sharp/lib/*` เข้ามา bundle แล้วได้ warning ตอน build
 * ("Can't resolve '@img/sharp-libvips-dev/include'" — เจอบน prod 2026-09-05)
 * createRequire ทำให้ไฟล์นั้นถูกโหลดตอน runtime และ `require('sharp')` ข้างในวิ่งไปเจอของราก
 * (ท่าเดียวกับ `lib/quoteRender.js` — อ่านคอมเมนต์ยาวๆ ที่นั่นก่อนคิดจะแก้)
 */
function requireFromRoot(modPath) {
  const { createRequire } = process.getBuiltinModule('node:module')
  // `REPO_ROOT` คิดจาก cwd (`web/` → `../`) ซึ่งถูกเฉพาะตอนเว็บรัน — สคริปต์/เทสที่รันจาก
  // **รากโปรเจกต์** จะได้ path เลยรากขึ้นไป 1 ชั้นแล้ว MODULE_NOT_FOUND → ลองรากอีกตัวก่อนยอมแพ้
  for (const base of [REPO_ROOT, process.cwd()]) {
    try {
      return createRequire(resolve(base, 'package.json'))(modPath)
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') throw err
    }
  }
  throw new Error(`postsStorage: หา ${modPath} จาก repo root ไม่เจอ (cwd=${process.cwd()})`)
}

/**
 * ย่อรูปให้อยู่ในกรอบก่อนเก็บ (ด้านยาว ≤ 2048) — คืน `{ buffer, mime }` ชุดใหม่
 *
 * ทำไมต้อง export ออกมาให้เรียกเองได้ ทั้งที่ `savePostFile()` ย่อให้อยู่แล้ว:
 * ทางเข้า **คลังภาพ** คำนวณ sha256 + ขนาดภาพ + จำนวนไบต์ จาก buffer เองก่อนเรียก savePostFile
 * ถ้าไม่ย่อก่อน ค่าที่ลง DB จะเป็นของไฟล์ต้นฉบับ ไม่ตรงกับไฟล์ที่อยู่บนดิสก์จริง
 * (mime อาจเปลี่ยน png/webp → image/jpeg เมื่อรูปเกินกรอบ — ต้องใช้ค่าที่คืนมาเสมอ)
 *
 * ⛔ ห้ามเรียกกับวิดีโอ — คืนของเดิมเฉยๆ ไม่พัง แต่ก็ไม่มีประโยชน์
 */
export async function shrinkForStorage(buffer, mime) {
  const { shrinkImage } = requireFromRoot('./utils/imageDownscale.js')
  const fit = await shrinkImage(buffer, { mime })
  return fit.changed ? { buffer: fit.buffer, mime: fit.mime } : { buffer, mime }
}

/**
 * เขียนไฟล์ลงดิสก์ คืน path ที่จะเก็บใน DB
 *
 * **รูปถูกย่อก่อนเสมอ** (ด้านยาว ≤ 2048) — มือถือรุ่นใหม่ถ่ายใบละ 50-60 ล้านพิกเซล
 * เก็บดิบ = ดิสก์เต็ม + โพสต์ไม่ออก (โพสต์ 1051 ล้มทั้ง 5 แพลตฟอร์มเพราะการ์ด 35 MB ใบเดียว)
 * @param {Buffer} buffer
 * @param {string} mime
 */
export async function savePostFile(buffer, mime) {
  if (isAllowedMime(mime)) {
    const fit = await shrinkForStorage(buffer, mime)
    buffer = fit.buffer
    mime = fit.mime
  }
  const ext = EXT_BY_MIME[mime] || VIDEO_EXT_BY_MIME[mime]
  if (!ext) throw new Error('postsStorage: ชนิดไฟล์ไม่รองรับ')
  const relPath = join(POSTS_DIR, `${randomUUID()}.${ext}`)
  const abs = absPath(relPath)
  await mkdir(resolve(REPO_ROOT, POSTS_DIR), { recursive: true })
  await writeFile(abs, buffer)
  return relPath
}

/**
 * เขียนไฟล์จาก **สตรีม** ลงดิสก์ตรงๆ — ไม่มีจังหวะไหนที่ทั้งไฟล์อยู่ใน RAM
 *
 * ใช้กับวิดีโอ (200 MB) · รูปยังใช้ `savePostFile()` ต่อไปได้เพราะเล็กและมาเป็น multipart หลายไฟล์
 * ตัดขนาดระหว่างไหล ไม่รอ Content-Length เพราะ client ปลอมได้ · เกินเมื่อไหร่ลบไฟล์ทิ้งทันที
 *
 * @param {ReadableStream} webStream  `req.body` ของ route handler
 * @returns {Promise<{relPath:string, bytes:number}>}
 */
export async function savePostFileFromStream(webStream, mime, maxBytes) {
  const ext = EXT_BY_MIME[mime] || VIDEO_EXT_BY_MIME[mime]
  if (!ext) throw new Error('postsStorage: ชนิดไฟล์ไม่รองรับ')
  const relPath = join(POSTS_DIR, `${randomUUID()}.${ext}`)
  const abs = absPath(relPath)
  await mkdir(resolve(REPO_ROOT, POSTS_DIR), { recursive: true })

  let bytes = 0
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length
      if (bytes > maxBytes) return cb(Object.assign(new Error('ไฟล์ใหญ่เกินกำหนด'), { code: 'TOO_LARGE' }))
      cb(null, chunk)
    },
  })

  try {
    await pipeline(Readable.fromWeb(webStream), limiter, createWriteStream(abs))
  } catch (err) {
    await unlink(abs).catch(() => {})   // ไฟล์ครึ่งๆ ห้ามค้างไว้ให้ gc มาเดาทีหลัง
    throw err
  }
  if (!bytes) {
    await unlink(abs).catch(() => {})
    throw Object.assign(new Error('ไฟล์ว่าง'), { code: 'EMPTY' })
  }
  return { relPath, bytes }
}

/**
 * คัดลอกไฟล์เป็น uuid ใหม่ — ใช้ตอน**หยิบรูปจากคลังไปใช้ในโพสต์**
 *
 * ⛔ ทำไมต้องคัดลอก ไม่ใช้ path ร่วมกัน (เคาะ 2026-08-04 หลัง /scrutinize):
 *    `/api/posts/media/[id]` DELETE และ `services/postsRetention.js` ลบ**ไฟล์จริง**จาก path
 *    ของแถวโพสต์ → ถ้าแชร์ path กับ `post_assets` ไฟล์ในคลังจะหายจากดิสก์เงียบๆ
 *    (แถวคลังยังอยู่ ชี้ path ที่ไม่มีไฟล์ = ธัมบ์เนลแตกทีหลังโดยไม่มีใครรู้)
 *    สายสัมพันธ์เก็บที่ `post_episode_media.source_asset_id` แทน
 */
export async function copyPostFile(relPath) {
  const buffer = await readFile(absPath(relPath))
  return savePostFile(buffer, mimeOfPath(relPath))
}

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * ขนาดภาพ — มีไว้โชว์ในคลัง ไม่ใช่ของจำเป็น พังแล้วคืน {} ไม่ทำให้อัปโหลดล้ม
 * (sharp เป็น native module · import แบบ dynamic กัน bundler ลากเข้า client)
 */
export async function probeImage(buffer) {
  try {
    const { default: sharp } = await import('sharp')
    const { width, height } = await sharp(buffer).metadata()
    return { width: width ?? null, height: height ?? null }
  } catch (err) {
    console.error('[probeImage]', err.message)
    return { width: null, height: null }
  }
}

/**
 * ลบไฟล์ — ใช้เฉพาะตอนลบสื่อทีละชิ้นจากหน้าจอ
 * ลบซีรีส์/ตอน **ไม่เรียกตัวนี้** (grill ข้อ 6: แถวหายแต่ไฟล์ค้างไว้ให้ gc เก็บทีหลัง)
 */
export async function deletePostFile(relPath) {
  try {
    await unlink(absPath(relPath))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}
