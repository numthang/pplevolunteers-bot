/**
 * Web → Discord REST (Bot token) — สร้าง forum thread + โพสต์ noti ในเธรดของเคส
 * pattern เดียวกับ web/app/api/profile/route.js (Authorization: Bot ...)
 *
 * ทุกฟังก์ชัน best-effort: error → log + คืน null (อย่าให้ล้มจนเคสสร้างไม่ได้)
 */

const API = 'https://discord.com/api/v10'
const TOKEN = process.env.DISCORD_BOT_TOKEN

function headers() {
  return { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' }
}

/**
 * สร้าง forum post (thread) ในห้อง forum → คืน thread id หรือ null
 * @param {string} forumChannelId
 * @param {{name:string, content:string}} p
 */
export async function createForumThread(forumChannelId, { name, content }) {
  if (!TOKEN || !forumChannelId) return null
  try {
    const res = await fetch(`${API}/channels/${forumChannelId}/threads`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        name: name.slice(0, 100),
        message: { content: content.slice(0, 2000) },
      }),
    })
    if (!res.ok) {
      console.error('[caseDiscord.createForumThread]', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    return data.id || null
  } catch (e) {
    console.error('[caseDiscord.createForumThread]', e.message)
    return null
  }
}

/** โพสต์ข้อความในเธรด (noti) → คืน true/false */
export async function postToThread(threadId, content) {
  if (!TOKEN || !threadId) return false
  try {
    const res = await fetch(`${API}/channels/${threadId}/messages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ content: content.slice(0, 2000) }),
    })
    if (!res.ok) {
      console.error('[caseDiscord.postToThread]', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e) {
    console.error('[caseDiscord.postToThread]', e.message)
    return false
  }
}

/** ดึงชื่อเธรด (best-effort, สำหรับ back link) → คืนชื่อ หรือ null */
export async function getThreadName(threadId) {
  if (!TOKEN || !threadId) return null
  try {
    const res = await fetch(`${API}/channels/${threadId}`, { headers: headers() })
    if (!res.ok) return null
    const data = await res.json()
    return data.name || null
  } catch (e) {
    console.error('[caseDiscord.getThreadName]', e.message)
    return null
  }
}

/**
 * ดึงข้อความใหม่ในเธรดหลัง messageId (incremental AI refresh) → คืน array หรือ []
 * @param {string} threadId
 * @param {string|null} afterId
 */
export async function fetchThreadMessages(threadId, afterId = null) {
  if (!TOKEN || !threadId) return []
  try {
    const q = new URLSearchParams({ limit: '100' })
    if (afterId) q.set('after', afterId)
    const res = await fetch(`${API}/channels/${threadId}/messages?${q}`, { headers: headers() })
    if (!res.ok) {
      console.error('[caseDiscord.fetchThreadMessages]', res.status)
      return []
    }
    return await res.json()
  } catch (e) {
    console.error('[caseDiscord.fetchThreadMessages]', e.message)
    return []
  }
}
