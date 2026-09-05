/**
 * รูปในกระทู้ดิสฯ — ไล่ทั้งเธรด ไม่ใช่แค่ข้อความเปิด
 *
 * ⚠️ เดิมดึงจากข้อความเปิดอย่างเดียว (user ทัก 2026-09-05: "รูปมาแค่จากหัวกระทู้ ไม่ถึง 4 รูป")
 *    งานจริงของทีมมักโพสต์ภาพหน้างาน/ภาพหลังจบงานเป็นคอมเมนต์ตามหลัง — รูปที่มีค่าที่สุดอยู่ตรงนั้น
 *
 * ⭐ เรียงตามเวลาจริง (เก่า→ใหม่) แล้วเอา N รูปแรก — ใช้ `after=<threadId>` ซึ่ง Discord คืนมาเรียง
 *    จากเก่าไปใหม่ให้เลย (ต่างจาก `?limit=100` เปล่าๆ ที่คืนใหม่→เก่า แล้วต้องกลับด้านเอง
 *    และได้ "100 ข้อความล่าสุด" ซึ่งเป็นคนละชุดกับ "100 ข้อความแรก" ในเธรดยาว)
 * ⛔ ห้ามเก็บ URL ที่ได้จากที่นี่ลงฐาน — CDN URL ของ Discord มี signature หมดอายุ 24 ชม.
 *    ใช้ทันที (โหลด bytes เก็บเอง) หรือเรียกใหม่ทุกครั้งที่จะแสดง
 */

const API = 'https://discord.com/api/v10'
const MAX_PAGES = 3          // 300 ข้อความแรกพอ — เธรดยาวกว่านั้นรูปแรกๆ อยู่ต้นเธรดอยู่แล้ว

const isImage = (a) => (a.content_type || '').startsWith('image/')

async function call(path) {
  const res = await fetch(API + path, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  }).catch(() => null)
  if (!res?.ok) return null
  return res.json().catch(() => null)
}

/**
 * @param {string} threadId
 * @param {number} limit จำนวนรูปสูงสุดที่ต้องการ
 * @returns {Promise<Array<{id, url, filename, content_type, size, message_id}>>} เรียงเก่า→ใหม่
 */
export async function fetchThreadImages(threadId, limit = 4) {
  const out = []
  const push = (msg) => {
    for (const a of msg.attachments || []) {
      if (!isImage(a)) continue
      out.push({ ...a, message_id: msg.id })
      if (out.length >= limit) return true
    }
    return false
  }

  // ข้อความเปิดกระทู้มี id เท่ากับ id ของกระทู้เอง
  const starter = await call(`/channels/${threadId}/messages/${threadId}`)
  if (starter && push(starter)) return out

  let after = threadId
  for (let page = 0; page < MAX_PAGES; page++) {
    const msgs = await call(`/channels/${threadId}/messages?limit=100&after=${after}`)
    if (!Array.isArray(msgs) || !msgs.length) break
    // `after` คืนมาเรียงเก่า→ใหม่อยู่แล้ว แต่บาง gateway สลับได้ — เรียงด้วย id ให้แน่ใจ (id เป็น snowflake)
    const sorted = [...msgs].sort((a, b) => (a.id < b.id ? -1 : 1))
    for (const m of sorted) if (push(m)) return out
    after = sorted[sorted.length - 1].id
    if (msgs.length < 100) break
  }
  return out
}
