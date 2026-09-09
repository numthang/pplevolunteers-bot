// scripts/dev/recorderRepro.mjs — ชุดทดลอง "เครื่องอัดคลิปในเบราว์เซอร์" แบบกดซ้ำได้
//
// ทำไมต้องมี: อาการของโหมดอัด (บทหาย / คลิปตัดจบเอง) ดูจากโค้ดเฉยๆ ไม่พอ ต้องกดจริง
// แต่ทดสอบบนมือถือทุกรอบช้าเกินไป · localhost นับเป็น secure context เหมือน https
// → Chrome headless + กล้อง/ไมค์ปลอมจึงเปิด getUserMedia ได้จริง (ใช้จับ bug-491 มาแล้ว)
//
// ⛔ มันจะ **เขียนทับบทพูด** ของโพสต์ที่ระบุ (ผ่าน PATCH /api/posts/<id> ตามปกติของแอป)
//    ใช้กับโพสต์ทดสอบเท่านั้น · โพสต์ต้องเป็น draft ไม่งั้นแก้ไม่ได้ = ไม่มีปุ่มอัดให้กด
//
// ต้องมี dev server รันอยู่ก่อน:  cd web && NEXT_DIST_DIR=.next-audit PORT=3100 npx next dev -p 3100
// วิธีใช้:  node -r dotenv/config scripts/dev/recorderRepro.mjs
//   POST=793     โพสต์ที่ใช้ทดสอบ (ต้อง draft + user id 1 แก้ได้)
//   LINES=2      ความยาวบทที่จะยัดลงไป (บรรทัด)
//   WATCH=60     เฝ้าดูกี่วินาทีหลังกดอัด
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'

const CHROME = '/usr/bin/google-chrome'
const BASE = process.env.BASE || 'http://localhost:3100'
const POST = process.env.POST || '793'   // ต้องเป็นโพสต์ที่ยัง draft ไม่งั้นแก้ไม่ได้ = ไม่มีปุ่มอัด
const sleep = ms => new Promise(r => setTimeout(r, ms))

class Cdp {
  constructor(ws) {
    this.ws = ws; this.nextId = 1; this.pending = new Map(); this.listeners = new Map()
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id)
        m.error ? reject(new Error(m.error.message)) : resolve(m.result)
      } else if (m.method) for (const fn of this.listeners.get(m.method) || []) fn(m.params)
    })
  }
  static connect(url) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url)
      ws.addEventListener('open', () => res(new Cdp(ws)), { once: true })
      ws.addEventListener('error', () => rej(new Error('ต่อ CDP ไม่ได้')), { once: true })
    })
  }
  send(method, params = {}) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej })
      setTimeout(() => { if (this.pending.delete(id)) rej(new Error('CDP timeout ' + method)) }, 30000)
    })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error('JS พัง: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    return r.result.value
  }
}

async function mintToken() {
  const pool = new pg.Pool({ host: process.env.DB_HOST, port: 5432, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME })
  const { rows } = await pool.query('SELECT email FROM users WHERE id = 1 AND email IS NOT NULL')
  const token = randomUUID()
  await pool.query('INSERT INTO org_login_tokens (token, email) VALUES ($1, $2)', [token, rows[0].email])
  await pool.end()
  return token
}

const port = 9333

// ⛔ ถ้ามี chrome ค้างจาก session ก่อนจองพอร์ตนี้อยู่ ตัวใหม่จะ bind ไม่ได้แล้วเงียบๆ
//    สคริปต์จะไปต่อกับ "ตัวเก่า" ที่ไม่มีกล้องปลอม → กล้องเปิดไม่ได้ (NotReadableError)
//    แล้วหน้าจอโชว์ว่า "ต้องอนุญาตให้ใช้กล้อง" ทำให้หลงคิดว่าแอปพัง (เสียเวลาไปแล้ว 2026-09-09)
if (await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true).catch(() => false)) {
  console.error(`มี chrome ค้างอยู่ที่พอร์ต ${port} — สั่ง  pkill -f "remote-debugging-port=${port}"  ก่อนแล้วรันใหม่`)
  process.exit(2)
}

const child = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'repro-'))}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--window-size=375,812',
  'about:blank',
], { stdio: 'ignore' })

let wsUrl
for (let i = 0; i < 100; i++) {
  await sleep(100)
  try {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())
    const p = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
    if (p) { wsUrl = p.webSocketDebuggerUrl; break }
  } catch {}
}
const cdp = await Cdp.connect(wsUrl)
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Browser.grantPermissions', { origin: BASE, permissions: ['audioCapture', 'videoCapture'] })
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })

const token = await mintToken()
await cdp.send('Page.navigate', { url: `${BASE}/org/verify?token=${token}` })
for (let i = 0; i < 40; i++) {
  await sleep(250)
  const uid = await cdp.eval(`fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user?.userId??null).catch(()=>null)`)
  if (uid) { console.log('ล็อกอินเป็น users.id=' + uid); break }
}

await cdp.send('Page.navigate', { url: `${BASE}/posts/${POST}/script` })
await sleep(6000)

const state = () => cdp.eval(`(() => {
  const btns = [...document.querySelectorAll('button')].map(b => b.textContent.trim())
  const box = document.querySelector('.overflow-y-auto')
  return {
    ปุ่ม: btns,
    กล่องบท: box ? { สูงที่เห็น: box.clientHeight, สูงเนื้อหา: box.scrollHeight, เลื่อนอยู่ที่: box.scrollTop, ตัวอักษรกี่ตัว: box.innerText.length, ตัวอย่าง: box.innerText.slice(0,40), ท้ายจอ: box.innerText.trim().slice(-45) } : null,
    // ระยะจาก "ขอบบนจอ" (= ตำแหน่งเลนส์กล้องหน้า) ลงมาถึงบรรทัดที่กำลังอ่าน — ตัวเลขที่ตัดสินว่า
    // คนดูจับได้ไหมว่าเรากำลังอ่านบท · เกิน ~2° ของสายตา (ที่ระยะ 50 ซม. ≈ 1.7 ซม. ≈ 60px) = เห็นตาเหลือบ
    ตำแหน่งแถบบท: box ? (r => ({ ห่างขอบบน: Math.round(r.top), สูง: Math.round(r.height), ก้นแถบ: Math.round(r.bottom), จอสูง: window.innerHeight }))(box.getBoundingClientRect()) : null,
    มีวิดีโอตัวอย่าง: !!document.querySelector('video[controls]'),
    ข้อความบนจอ: document.body.innerText.replace(/\\s+/g,' ').slice(0, 200),
    รองรับกล้อง: !!navigator.mediaDevices?.getUserMedia,
    กล้องพังเพราะ: window.__gumErr || null,
    มีMediaRecorder: typeof MediaRecorder !== 'undefined',
    ชนิดไฟล์ที่รองรับ: typeof MediaRecorder === 'undefined' ? [] : ['video/mp4;codecs=avc1,mp4a','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].filter(m => { try { return MediaRecorder.isTypeSupported(m) } catch { return false } }),
  }
})()`)

// ใส่บทผ่าน API ของตัวแอปเอง (PATCH /api/posts/<id> แบบเดียวกับที่ autosave ใช้)
const LINES = Number(process.env.LINES || 14)
const SPEED_UP = Number(process.env.SPEED_UP || 0)   // กดปุ่มเพิ่มความเร็วกี่ครั้งก่อนอัด
const SCRIPT = Array.from({ length: LINES }, (_, i) =>
  `บรรทัดที่ ${i + 1} วันนี้อยากชวนทุกคนไปฟังเรื่องราวการเดินป่าดูนกเงือกที่บางกะม่า อำเภอบ้านคา กันครับ ท่ามกลางป่าใหญ่ที่ยังสมบูรณ์`
).join('\n\n')

const seeded = await cdp.eval(`(async () => {
  const cur = await fetch('/api/posts/${POST}').then(r => r.json())
  const post = cur.data?.post || cur.data
  const res = await fetch('/api/posts/${POST}', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lockToken: post.lock_token, bodies: { ...(post.bodies || {}), script: ${JSON.stringify(SCRIPT)} } }),
  })
  return res.status + ' ' + (await res.text()).slice(0, 120)
})()`)
console.log('ใส่บทผ่าน API:', seeded)
await cdp.send('Page.navigate', { url: `${BASE}/posts/${POST}/script` })
await sleep(5000)

console.log('\n=== ก่อนกดอัด ===')
console.log(JSON.stringify(await state(), null, 1))

// ดักเหตุผลจริงที่กล้องเปิดไม่ได้ — ตัวแอปจับ error แล้วโชว์ข้อความเดียวเสมอ ("ต้องอนุญาต…")
// ซึ่งซ่อนสาเหตุจริง (NotReadableError/OverconstrainedError/…) ทำให้ debug จากหน้าจอไม่ได้เลย
await cdp.eval(`(() => {
  const md = navigator.mediaDevices
  const orig = md.getUserMedia.bind(md)
  md.getUserMedia = c => orig(c).catch(e => { window.__gumErr = e.name + ': ' + e.message; throw e })
  return true
})()`)

const clicked = await cdp.eval(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('อัดคลิปพร้อมบท'))
  if (!b) return false
  b.click(); return true
})()`)
console.log('\nกดปุ่มอัดคลิปพร้อมบท:', clicked)
await sleep(3000)
console.log('\n=== เปิดกล้องแล้ว (ยังไม่กดปุ่มแดง) ===')
console.log(JSON.stringify(await state(), null, 1))

if (SPEED_UP) {
  await cdp.eval(`(() => {
    const ups = [...document.querySelectorAll('button')].filter(b => b.getAttribute('aria-label')?.includes('เพิ่ม') || b.querySelector('.lucide-plus'))
    for (let i = 0; i < ${'${SPEED_UP}'}; i++) ups[0]?.click()
  })()`)
  await sleep(300)
}
await cdp.eval(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label')?.includes('เริ่มอัด'))
  if (b) b.click()
})()`)
console.log('\nกดปุ่มแดงเริ่มอัดแล้ว — เฝ้าดูทุก 1 วิ')
for (let i = 1; i <= Number(process.env.WATCH || 12); i++) {
  await sleep(1000)
  const s = await state()
  if (i % 5 === 0 || s.มีวิดีโอตัวอย่าง || !s.กล่องบท) console.log(`t=${i}s · กล่องบท=${s.กล่องบท ? `เลื่อน ${s.กล่องบท.เลื่อนอยู่ที่}/${s.กล่องบท.สูงเนื้อหา - s.กล่องบท.สูงที่เห็น} · ท้ายจอยังมีข้อความ: "${s.กล่องบท.ท้ายจอ}"` : 'หายไปแล้ว'} · มีตัวอย่างคลิป=${s.มีวิดีโอตัวอย่าง}`)
  if (s.มีวิดีโอตัวอย่าง) { console.log('→ เด้งเข้าหน้าดูตัวอย่าง (จบเทค) ที่ t=' + i + 's'); break }
}
// ระหว่างอัด: ปุ่มเร่ง/ชะลอต้องกดได้จริงโดยไม่หลุดเทค
const speedBefore = await cdp.eval(`(() => document.body.innerText.match(/ความเร็ว\\s*(\\d+)/)?.[1] || 'ไม่เจอป้ายความเร็ว')()`)
const bumped = await cdp.eval(`(() => {
  const up = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'ความเร็ว +')
  if (!up) return 'ไม่มีปุ่มเร่งระหว่างอัด'
  up.click(); up.click(); return 'กดเร่ง 2 ครั้ง'
})()`)
await sleep(600)
const speedAfter = await cdp.eval(`(() => document.body.innerText.match(/ความเร็ว\\s*(\\d+)/)?.[1] || 'ไม่เจอป้ายความเร็ว')()`)
const stillRec = await state()
console.log(`\nปรับความเร็วระหว่างอัด: ${bumped} · ${speedBefore} → ${speedAfter} · ยังอัดอยู่ (ยังไม่เด้งดูตัวอย่าง)=${!stillRec.มีวิดีโอตัวอย่าง}`)

// กดปุ่มหยุดเอง — ต้องเป็นทางเดียวที่จบเทค
const stopped = await cdp.eval(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label')?.includes('จบเทค'))
  if (!b) return 'ไม่เจอปุ่มหยุด'
  b.click(); return 'กดปุ่มหยุดแล้ว'
})()`)
console.log('\n' + stopped)
await sleep(2500)
const afterStop = await state()
console.log('หลังกดหยุด: มีวิดีโอตัวอย่าง =', afterStop.มีวิดีโอตัวอย่าง, '· ปุ่มที่เห็น =', afterStop.ปุ่ม.filter(Boolean).join(' / '))

console.log('\n=== จอสุดท้าย ===')
console.log(JSON.stringify(await state(), null, 1))
child.kill()
process.exit(0)
