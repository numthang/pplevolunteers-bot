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

import { writeFile, mkdir, unlink } from 'fs/promises'
import { join, resolve, sep } from 'path'
import { randomUUID } from 'crypto'

// web/ อยู่ใต้ repo root → ../ คือรากที่บอทใช้เป็น cwd
export const REPO_ROOT = resolve(process.cwd(), '..')
export const POSTS_DIR = join('storage', 'posts')

export const MAX_FILE_SIZE = 12 * 1024 * 1024   // 12 MB — รูปจากมือถือสมัยนี้ 8–10 MB ได้
export const MAX_MEDIA_PER_EPISODE = 20

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function isAllowedMime(mime) {
  return Object.hasOwn(EXT_BY_MIME, mime)
}

export function mimeOfPath(path) {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
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
  const ext = EXT_BY_MIME[mime]
  if (!ext) throw new Error('postsStorage: ชนิดไฟล์ไม่รองรับ')
  const relPath = join(POSTS_DIR, `${randomUUID()}.${ext}`)
  const abs = absPath(relPath)
  await mkdir(resolve(REPO_ROOT, POSTS_DIR), { recursive: true })
  await writeFile(abs, buffer)
  return relPath
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
