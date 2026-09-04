/**
 * Thumbnail แบบ lazy + cache ลงดิสก์ สำหรับรูปในโมดูล posts
 *
 * หน้า /posts/[id] มีรูปได้ 30-50 รูป — โหลด original เต็มไฟล์มาย่อด้วย CSS หน่วงมาก
 * โมดูลนี้สร้าง thumbnail (webp กว้าง THUMB_WIDTH) ครั้งแรกที่มีคนขอ แล้ว cache ไว้ที่ดิสก์
 * แยกโฟลเดอร์จาก storage/posts เด็ดขาด — thumbs เป็นแค่ cache ลบทิ้งสร้างใหม่ได้เสมอ
 * (gc-media.js เก็บกวาดกำพร้าให้ ไม่ผูกกับขาลบไฟล์ต้นฉบับ ดู scripts/posts/gc-media.js)
 */

import { writeFile, readFile, mkdir, rename, unlink } from 'fs/promises'
import { resolve, sep, basename, extname } from 'path'
import { randomUUID } from 'crypto'
import { REPO_ROOT, absPath, mimeOfPath } from './postsStorage.js'

export const THUMBS_DIR = 'storage/posts-thumbs'
export const THUMB_WIDTH = 480   // tile กริดกว้าง ~200-300 CSS px, เผื่อจอ retina 2x

/** absolute path จาก path relative ของ thumb — กัน path traversal แบบเดียวกับ absPath() ใน postsStorage.js */
export function absThumbPath(relThumbPath) {
  const abs = resolve(REPO_ROOT, relThumbPath)
  const base = resolve(REPO_ROOT, THUMBS_DIR)
  if (abs !== base && !abs.startsWith(base + sep)) {
    throw new Error('postsThumbs: path อยู่นอก storage/posts-thumbs')
  }
  return abs
}

/** path ต้นฉบับ (relative จาก repo root) → path thumb ที่จะเก็บ — basename เป็น uuid อยู่แล้ว ไม่มีทางชนกัน */
export function thumbRelPath(origRelPath) {
  const base = basename(origRelPath, extname(origRelPath))
  return `${THUMBS_DIR}/${base}.webp`
}

// dedupe งานที่กำลัง resize อยู่ — กันสอง request มาพร้อมกันแล้ว path เดียวกันโดน resize ซ้ำ
const inFlight = new Map()

// จำกัด sharp พร้อมกันไม่เกิน 4 งาน — เปิดหน้าที่มี 50 รูปครั้งแรกไม่ให้ยิง resize 50 ตัวรวด
// (CPU prod ตึงอยู่แล้ว เคยมีเคส CPU spike มาก่อน — คิว promise ธรรมดาพอ ไม่ต้องลงไลบรารี)
const MAX_CONCURRENT = 4
let running = 0
const queue = []

function acquireSlot() {
  if (running < MAX_CONCURRENT) {
    running++
    return Promise.resolve()
  }
  return new Promise(resolveSlot => queue.push(resolveSlot))
}

function releaseSlot() {
  const next = queue.shift()
  if (next) next()
  else running--
}

/**
 * คืน thumbnail เป็น Buffer — สร้างใหม่ถ้ายังไม่มี, ไม่มีวันโยน error (พังคืน null ให้ caller fallback ไปเสิร์ฟ original)
 * @param {string} origRelPath  path ต้นฉบับ (relative จาก repo root) ตามที่เก็บใน DB
 * @returns {Promise<Buffer|null>}
 */
export async function getOrCreateThumb(origRelPath) {
  if (mimeOfPath(origRelPath).startsWith('video/')) return null   // ไม่ทำ thumbnail ให้วิดีโอในงานก้อนนี้

  const relThumb = thumbRelPath(origRelPath)
  const absThumb = absThumbPath(relThumb)

  try {
    return await readFile(absThumb)
  } catch {
    // ยังไม่มี thumb — ไปสร้างต่อด้านล่าง
  }

  if (inFlight.has(origRelPath)) return inFlight.get(origRelPath)

  const task = (async () => {
    await acquireSlot()
    try {
      const { default: sharp } = await import('sharp')   // native module — dynamic import กัน bundler ลากเข้า client
      // absPath() ของ postsStorage — ต้องผ่านด่านกัน path traversal เหมือนขาเสิร์ฟไฟล์ปกติ
      // (resolve() เปล่าๆ ไม่กันอะไรเลย · path มาจาก DB ก็จริงแต่ห้ามมีเส้นทางไหนแตะดิสก์โดยไม่ผ่านด่าน)
      const buffer = await sharp(absPath(origRelPath))
        .rotate()   // เคารพ EXIF orientation — ไม่งั้นรูปจากมือถือตะแคง
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 72 })
        .toBuffer()

      await mkdir(resolve(REPO_ROOT, THUMBS_DIR), { recursive: true })
      // เขียนแบบ atomic — เคยมีบั๊กจริงตอนอัปหลายรูปพร้อมกันแล้วสองโปรเซสแย่งเขียน tmp ชื่อเดียวกัน
      const tmpAbs = `${absThumb}.tmp-${randomUUID()}`
      try {
        await writeFile(tmpAbs, buffer)
        await rename(tmpAbs, absThumb)
      } catch (err) {
        await unlink(tmpAbs).catch(() => {})   // ไฟล์ครึ่งๆ ห้ามค้างรอ gc มาเก็บทีหลัง
        throw err
      }

      return buffer
    } catch (err) {
      console.error('[getOrCreateThumb]', err.message)
      return null
    } finally {
      releaseSlot()
    }
  })()

  inFlight.set(origRelPath, task)
  try {
    return await task
  } finally {
    inFlight.delete(origRelPath)
  }
}
