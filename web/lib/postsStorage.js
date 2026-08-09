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
import { join, resolve, sep } from 'path'
import { randomUUID, createHash } from 'crypto'

// web/ อยู่ใต้ repo root → ../ คือรากที่บอทใช้เป็น cwd
export const REPO_ROOT = resolve(process.cwd(), '..')
export const POSTS_DIR = join('storage', 'posts')

export const MAX_FILE_SIZE = 12 * 1024 * 1024   // 12 MB — รูปจากมือถือสมัยนี้ 8–10 MB ได้
export const MAX_MEDIA_PER_EPISODE = 20

// คลิปใหญ่กว่ารูปมาก แต่ห้ามใหญ่เกินไป: `req.formData()` อมทั้งไฟล์ไว้ใน RAM แล้ว
// `Buffer.from(arrayBuffer)` ก็อีกชุด → 64 MB = ~128 MB ต่อ request บนเครื่องที่ CPU/RAM ตึงอยู่แล้ว
export const MAX_VIDEO_SIZE = 64 * 1024 * 1024
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
 * เขียนไฟล์ลงดิสก์ คืน path ที่จะเก็บใน DB
 * @param {Buffer} buffer
 * @param {string} mime
 */
export async function savePostFile(buffer, mime) {
  const ext = EXT_BY_MIME[mime] || VIDEO_EXT_BY_MIME[mime]
  if (!ext) throw new Error('postsStorage: ชนิดไฟล์ไม่รองรับ')
  const relPath = join(POSTS_DIR, `${randomUUID()}.${ext}`)
  const abs = absPath(relPath)
  await mkdir(resolve(REPO_ROOT, POSTS_DIR), { recursive: true })
  await writeFile(abs, buffer)
  return relPath
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
