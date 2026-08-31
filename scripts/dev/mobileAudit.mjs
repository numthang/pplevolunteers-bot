#!/usr/bin/env node
/**
 * mobileAudit — ตรวจ layout จอมือถือเองได้ ไม่ต้องรอ user ไปเจอเอง
 * ─────────────────────────────────────────────────────────────────────────────
 * เกิดขึ้นเพราะ user บ่น (2026-08-31): "layout พังๆ เวลาดูบนมือถือที่มันแหกจากเกินหน้าจอ
 * ผมต้องมาเจอเองแล้วต้องบอกให้คุณไล่แก้หมดเลย เหนื่อยอ่ะ" → งานหา "จุดไหนล้น" ต้องเป็นของเครื่อง
 *
 * ⚙️  ไม่มี dependency เพิ่มเลย — ขับ Chrome ผ่าน CDP ด้วย WebSocket ที่ Node 24 มีในตัว
 *    (ห้ามเปลี่ยนไปใช้ `ws`: หายไปจาก web/node_modules แล้ว · ห้ามลง playwright: ไม่จำเป็น)
 *
 * ⛔ **กับดักที่ทำให้ตรวจไม่เจอ (เจอเอง 2026-08-31 รอบแรกรายงาน "ผ่าน" ทั้งที่หน้าแหกจริง):**
 *    Chrome โหมดมือถือ **ขยาย layout viewport เองเมื่อเนื้อหาล้น** (สั่ง 375 แต่ innerWidth ออกมา 409)
 *    แล้วย่อทั้งหน้าลงให้พอดีแทนที่จะตัด → พอวัดเทียบ `innerWidth` ทุกอย่างเลย "ไม่ล้น" หมด
 *    ➜ ต้องเทียบกับ **ความกว้างจอที่สั่ง (target)** เสมอ ห้ามเทียบ innerWidth
 *
 * ตรวจ 4 อาการ (เทียบกับ target ทั้งหมด):
 *   A  หน้ากว้างเกินจอ            documentElement.scrollWidth > target
 *   D  จอถูกถ่างจนต้องย่อหน้า      innerWidth > target  ← อาการที่ user เห็นว่า "แหกเกินหน้าจอ"
 *   B  element ล้นขอบจอ           getBoundingClientRect().right > target  (เอาเฉพาะตัวนอกสุด = ตัวการจริง)
 *   C  ของโดนตัดหายเงียบๆ         scrollWidth > clientWidth ขณะ overflow-x เป็น hidden/clip
 *      (ข้าม input/textarea/select — ช่องกรอกเลื่อนเนื้อหาในตัวเองเป็นเรื่องปกติ ไม่ใช่บั๊ก)
 *   E  ตัวควบคุมไม่เต็มความกว้าง     แถวที่มี select/input/textarea แล้วเหลือที่ว่างท้ายแถว > 32px
 *      (user สั่งให้ตรวจด้วย 2026-09-01: "ทำให้ equal fluid 100% in mobile view")
 *      **ไม่นับเป็นข้อผิดพลาด (ไม่ทำให้ exit 1)** — เป็นคำแนะนำ บางแถวตั้งใจไม่เต็มก็มี ใช้ตาตัดสิน
 *
 * ⚠️ ข้อจำกัด: เห็นเฉพาะสิ่งที่ render อยู่จริงในสถานะที่สคริปต์พาไปถึง (ดู steps ใน
 *    mobileAudit.routes.mjs) — **ยังไม่แทนการกดจริงในเบราว์เซอร์** แค่ตัดงานค้นหาจุดล้นออกจาก user
 *
 * วิธีใช้
 *   node scripts/dev/mobileAudit.mjs --routes /kanban
 *   node scripts/dev/mobileAudit.mjs --all
 *   node scripts/dev/mobileAudit.mjs --routes /kanban --width 320 --shot
 *   node scripts/dev/mobileAudit.mjs --routes /kanban --base http://localhost:3100
 *
 * exit code 1 เมื่อเจอปัญหา (เอาไปแขวน CI ได้ทีหลัง)
 */
import 'dotenv/config'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROUTES } from './mobileAudit.routes.mjs'

const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'
const OUT_DIR = '.wolf/mobile-audit'

// ───────────────────────────── args ─────────────────────────────
function parseArgs(argv) {
  const a = { base: 'http://localhost:3000', width: 375, height: 812, shot: false, routes: null, all: false, debug: false }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--all') a.all = true
    else if (v === '--shot') a.shot = true
    else if (v === '--debug') a.debug = true
    else if (v === '--routes') a.routes = argv[++i].split(',').map((s) => s.trim()).filter(Boolean)
    else if (v === '--width') a.width = Number(argv[++i])
    else if (v === '--height') a.height = Number(argv[++i])
    else if (v === '--base') a.base = argv[++i].replace(/\/$/, '')
    else if (v === '--help' || v === '-h') { console.log(HELP); process.exit(0) }
    else { console.error(`ไม่รู้จัก option: ${v}`); process.exit(2) }
  }
  if (!a.all && !a.routes) { console.error('ต้องระบุ --routes /path[,/path] หรือ --all\n'); console.log(HELP); process.exit(2) }
  return a
}
const HELP = `mobileAudit — ตรวจ layout จอมือถือ
  --routes /a,/b   ตรวจเฉพาะเส้นทางนี้ (ถ้ามีใน routes config จะได้ steps ติดมาด้วย)
  --all            กวาดทุกเส้นทางใน scripts/dev/mobileAudit.routes.mjs
  --width 375      ความกว้างจอ (ค่าเริ่มต้น 375 ตาม .wolf/config.json · ลองที่ 320 ดูขอบล่างสุดได้)
  --height 812     ความสูงจอ
  --base URL       ค่าเริ่มต้น http://localhost:3000 (dev server ของ user)
  --debug          พิมพ์ค่าที่วัดได้ดิบๆ ทุก state (ไว้ไล่ดูตอนสงสัยว่า probe ไม่จับ)
  --shot           เก็บภาพลง ${OUT_DIR}/ ด้วย (ไม่ใช่ค่าเริ่มต้น — รูปกิน token เยอะ)`

// ───────────────────────────── CDP ─────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`)) : resolve(msg.result)
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params)
      }
    })
  }
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.addEventListener('open', () => resolve(new Cdp(ws)), { once: true })
      ws.addEventListener('error', () => reject(new Error(`ต่อ CDP ไม่ได้: ${url}`)), { once: true })
    })
  }
  send(method, params = {}) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`))
      }, 30_000)
    })
  }
  once(event) {
    return new Promise((resolve) => {
      const arr = this.listeners.get(event) || []
      const fn = (p) => { this.listeners.set(event, (this.listeners.get(event) || []).filter((f) => f !== fn)); resolve(p) }
      this.listeners.set(event, [...arr, fn])
    })
  }
  /** รัน JS ในหน้าเว็บแล้วคืนค่าจริง (ไม่ใช่ RemoteObject) */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(`JS ในหน้าเว็บพัง: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`)
    return r.result.value
  }
  close() { try { this.ws.close() } catch {} }
}

async function launchChrome(port, profileDir) {
  const child = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--disable-background-networking', '--disable-extensions',
    'about:blank',
  ], { stdio: 'ignore' })

  // รอ endpoint โผล่ — Chrome ใช้เวลาไม่แน่นอน
  for (let i = 0; i < 100; i++) {
    await sleep(100)
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return { child, wsUrl: page.webSocketDebuggerUrl }
    } catch {}
  }
  throw new Error('Chrome ไม่ยอมเปิด debugging port ภายใน 10 วิ')
}

// ───────────────────────────── login ─────────────────────────────
/**
 * ⛔ ห้ามยิง POST /api/org/auth/magic — SMTP ต่อของจริง = สแปมเมลเข้ากล่อง user (bug-033)
 *    ทางที่ใช้คือ insert token ลง org_login_tokens ตรงๆ แล้วให้เบราว์เซอร์เดิน /org/verify เอง
 */
async function mintLoginToken() {
  const pool = new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  })
  try {
    const { rows } = await pool.query('SELECT email FROM users WHERE id = 1 AND email IS NOT NULL')
    if (!rows.length) throw new Error('users.id=1 ไม่มี email — ล็อกอินทดสอบไม่ได้ (ดู memory: reference_local_browser_test_login)')
    const token = randomUUID()
    await pool.query('INSERT INTO org_login_tokens (token, email) VALUES ($1, $2)', [token, rows[0].email])
    return token
  } finally {
    await pool.end()
  }
}

async function login(cdp, base, token) {
  await cdp.send('Page.navigate', { url: `${base}/org/verify?token=${token}` })
  await cdp.once('Page.loadEventFired')
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    const userId = await cdp.eval(`fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user?.userId ?? null).catch(()=>null)`)
    if (userId) return userId
  }
  throw new Error('ล็อกอินไม่ติด — /api/auth/session ไม่คืน userId ภายใน 10 วิ')
}

// ───────────────────────── probe (รันในหน้าเว็บ) ─────────────────────────
const PROBE = (target) => `(() => {
  const W = ${target}                       // ⭐ ความกว้างจอที่สั่ง ไม่ใช่ innerWidth (ดูหัวไฟล์)
  const seen = []
  const describe = (el) => ({
    tag: el.tagName.toLowerCase(),
    box: (() => { const r = el.getBoundingClientRect(); return \`\${Math.round(r.left)}→\${Math.round(r.right)} (w\${Math.round(r.width)})\` })(),
    cls: (el.getAttribute('class') || '').replace(/\\s+/g, ' ').trim().slice(0, 180),
    txt: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 48),
  })
  const isVisible = (el, cs, r) => {
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false
    return r.width > 0 || r.height > 0
  }
  const all = [...document.querySelectorAll('body *')]
  const meta = new Map()
  for (const el of all) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    meta.set(el, { cs, r, vis: isVisible(el, cs, r) })
  }

  // B — ล้นขอบจอ (เอาเฉพาะตัวนอกสุด ไม่งั้นได้ลูกหลานเป็นร้อย)
  const over = new Set()
  for (const el of all) {
    const m = meta.get(el)
    if (!m.vis) continue
    if (m.r.right > W + 1 || m.r.left < -1) over.add(el)
  }
  for (const el of over) {
    if (el.parentElement && over.has(el.parentElement)) continue
    const m = meta.get(el)
    seen.push({ type: 'B', px: Math.round(Math.max(m.r.right - W, -m.r.left)), ...describe(el) })
  }

  // C — โดน overflow-x ตัดหายเงียบๆ (ยกเว้น truncate ที่ตั้งใจตัดและมี … ให้เห็น)
  for (const el of all) {
    const m = meta.get(el)
    if (!m.vis) continue
    if (el.scrollWidth <= el.clientWidth + 1) continue
    const ox = m.cs.overflowX
    if (ox !== 'hidden' && ox !== 'clip') continue
    if (m.cs.textOverflow === 'ellipsis') continue           // truncate = ตั้งใจตัด มี … ให้เห็นอยู่แล้ว
    if (['input', 'textarea', 'select'].includes(el.tagName.toLowerCase())) continue  // ช่องกรอกเลื่อนเองได้ ปกติ
    if (el.isContentEditable) continue
    if (el.clientWidth === 0) continue                       // ของที่ยังไม่ layout
    seen.push({ type: 'C', px: el.scrollWidth - el.clientWidth, ...describe(el) })
  }

  // E — ตัวควบคุมบนมือถือที่ไม่ยืดเต็มความกว้าง (เฉพาะจอ <= 640 = ต่ำกว่า breakpoint sm)
  //
  // ⛔ รอบแรกวัดผิดระดับ: ไปวัด "กล่องที่ครอบ control" ซึ่งเป็น shrink-to-fit อยู่แล้ว → gap = 0 เสมอ
  //    ตรวจ 16 โซนแล้วไม่ยิงสักจุด ทั้งที่หน้าจริงมีที่ว่างโล่ง · ต้องวัด **ทีละบรรทัดของพ่อ** ว่า
  //    บรรทัดนั้นกินความกว้างที่พ่อมีให้หมดไหม (นับที่ว่างทั้งหัวบรรทัดและท้ายบรรทัด เพราะ ml-auto
  //    ทำให้ของไปกองขวาแล้วเหลือช่องโหว่ซ้าย ซึ่งก็คือ "ไม่เต็มความกว้าง" เหมือนกัน)
  if (W <= 640) {
    const controls = [...document.querySelectorAll('select, textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden])')]
    const checked = new Set()
    for (const c of controls) {
      const mc = meta.get(c)
      if (!mc || !mc.vis) continue
      let el = c
      for (let up = 0; up < 5 && el.parentElement && el.parentElement !== document.body; up++) {
        const box = el.parentElement
        el = box
        if (checked.has(box)) continue
        checked.add(box)
        const bcs = getComputedStyle(box)
        if (!/flex|grid|block/.test(bcs.display)) continue
        const br = box.getBoundingClientRect()
        const left = br.left + (parseFloat(bcs.paddingLeft) || 0)
        const right = br.right - (parseFloat(bcs.paddingRight) || 0)
        if (right - left < 120) continue                      // กล่องแคบเกินกว่าจะพูดเรื่อง "เต็มความกว้าง"

        // จับลูกเป็นบรรทัดๆ — **ต้องใช้การซ้อนทับแนวตั้ง ห้ามใช้ค่า top ตรงๆ**
        // (ไอคอน 14px กับ input 36px ใน flex items-center มี top ไม่เท่ากัน → ถ้า group ด้วย top
        //  ไอคอนจะกลายเป็น "บรรทัด" ของตัวเองที่กว้าง 14px แล้วรายงานว่าเหลือที่ว่าง 174px = ผิด)
        const kids = [...box.children].map((ch) => meta.get(ch)).filter((m) => m && m.vis)
        kids.sort((a, b) => a.r.top - b.r.top)
        const lines = []
        for (const m of kids) {
          const cur = lines[lines.length - 1]
          if (cur && m.r.top < cur.bottom - 1) {            // ซ้อนทับแนวตั้ง = บรรทัดเดียวกัน
            cur.l = Math.min(cur.l, m.r.left)
            cur.r = Math.max(cur.r, m.r.right)
            cur.bottom = Math.max(cur.bottom, m.r.bottom)
          } else {
            lines.push({ l: m.r.left, r: m.r.right, bottom: m.r.bottom })
          }
        }
        for (const ln of lines) {
          const slack = Math.round((ln.l - left) + (right - ln.r))
          if (slack > 32) { seen.push({ type: 'E', px: slack, ...describe(box) }); break }
        }
      }
    }
  }

  return {
    path: location.pathname + location.search,
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    target: W,
    elements: all.length,
    findings: seen.sort((a, b) => b.px - a.px).slice(0, 25),
  }
})()`

// ───────────────────────────── run ─────────────────────────────
function keyOf(f) { return `${f.type}|${f.tag}|${f.cls}` }

/**
 * รอจน DOM นิ่ง — หน้าพวกนี้ยิง fetch แล้วค่อย render การ์ด/ตาราง ถ้าใช้ sleep ตายตัว
 * ผลตรวจจะขึ้นกับจังหวะเครื่อง (รอบแรกเคยวัดตอนมี element แค่ 89 ตัว = ยังโหลดไม่เสร็จ)
 */
async function settleDom(cdp, minMs = 600) {
  await sleep(minMs)
  let last = -1
  for (let i = 0; i < 20; i++) {                       // เพดาน ~8 วิ
    const n = await cdp.eval(`document.querySelectorAll('body *').length`)
    if (n === last) return
    last = n
    await sleep(400)
  }
}

async function auditRoute(cdp, args, route) {
  const url = `${args.base}${route.path}`
  await cdp.send('Page.navigate', { url })
  await cdp.once('Page.loadEventFired')
  await settleDom(cdp, route.settle)

  const states = []
  const first = await cdp.eval(PROBE(args.width))
  states.push({ state: 'โหลดหน้า', ...first })

  // ⚠️ ถ่ายรูป **ตรงนี้** ไม่ใช่ท้ายฟังก์ชัน — ถ่ายท้ายจะได้สภาพหลังเดิน steps ครบ
  //    (เคยได้รูปหน้าจอที่โมดัลการ์ดเปิดค้างอยู่ แทนที่จะเป็นหน้าตอนโหลด)
  if (args.shot) {
    mkdirSync(OUT_DIR, { recursive: true })
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const name = `${route.path.replace(/\//g, '_') || '_root'}__${args.width}.png`
    writeFileSync(join(OUT_DIR, name), Buffer.from(shot.data, 'base64'))
  }

  const redirected = /\/(login|org\/login)$/.test(first.path)
  if (!redirected) {
    for (const step of route.steps || []) {
      if (step.wait) { await sleep(step.wait); continue }
      if (step.esc) {
        await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`)
        await sleep(300)
        continue
      }
      const hit = await cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(step.click)}); if (!el) return false; el.click(); return true })()`)
      if (!hit) { states.push({ state: `${step.label} — ⚠️ หา selector ไม่เจอ (${step.click})`, findings: [], missing: true }); continue }
      await sleep(step.settle ?? 400)
      await settleDom(cdp, 200)
      states.push({ state: step.label, ...(await cdp.eval(PROBE(args.width))) })
    }
  }

  return { route, redirected, states }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const wanted = args.all
    ? ROUTES
    : args.routes.map((p) => ROUTES.find((r) => r.path === p) || { path: p })

  const port = 9222 + Math.floor(Math.random() * 500)
  const profileDir = mkdtempSync(join(tmpdir(), 'mobile-audit-'))
  let chrome = null
  let cdp = null
  let bad = 0
  let advisory = 0

  try {
    const token = await mintLoginToken()
    const launched = await launchChrome(port, profileDir)
    chrome = launched.child
    cdp = await Cdp.connect(launched.wsUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: args.width, height: args.height, deviceScaleFactor: 2, mobile: true,
    })
    const userId = await login(cdp, args.base, token)
    console.log(`ล็อกอินเป็น users.id=${userId} · จอ ${args.width}×${args.height} · ${args.base}\n`)

    for (const route of wanted) {
      const res = await auditRoute(cdp, args, route)
      if (res.redirected) { console.log(`${route.path}\n  – เด้งไปหน้า login (ไม่มีสิทธิ์/ฟีเจอร์ปิด) ข้าม\n`); continue }

      if (args.debug) {
        for (const s of res.states) {
          console.log(`  · ${s.state} — path=${s.path} elements=${s.elements} scrollWidth=${s.scrollWidth} innerWidth=${s.innerWidth} target=${s.target} findings=${s.findings?.length ?? 0}`)
        }
      }
      const shown = new Set()
      const lines = []
      let hardHit = false
      for (const s of res.states) {
        if (s.missing) { lines.push(`  ⚠️  ${s.state}`); continue }
        const tooWide = s.scrollWidth > s.target + 1
        const expanded = s.innerWidth > s.target + 1
        const fresh = s.findings.filter((f) => !shown.has(keyOf(f)))
        fresh.forEach((f) => shown.add(keyOf(f)))
        if (!tooWide && !expanded && !fresh.length) continue
        if (tooWide || expanded || fresh.some((f) => f.type !== 'E')) hardHit = true
        advisory += fresh.filter((f) => f.type === 'E').length
        lines.push(`  [${s.state}]`)
        if (tooWide) lines.push(`    A · หน้ากว้าง ${s.scrollWidth}px เกินจอ ${s.target}px`)
        if (expanded) lines.push(`    D · จอถูกถ่างเป็น ${s.innerWidth}px (Chrome ย่อหน้าลงให้พอดี = สิ่งที่คนเห็นว่า "แหก")`)
        for (const f of fresh) {
          lines.push(f.type === 'E'
            ? `    E · เหลือที่ว่างท้ายแถว ${f.px}px — ตัวควบคุมไม่เต็มความกว้าง (แนะนำ ไม่นับเป็นข้อผิดพลาด)`
            : `    ${f.type} · เกิน ${f.px}px · <${f.tag}> ${f.box} "${f.txt}"`)
          lines.push(`        ${f.cls}`)
        }
      }
      if (lines.length) { if (hardHit) bad++; console.log(`${route.path}\n${lines.join('\n')}\n`) }
      else console.log(`${route.path}\n  ✓ ไม่พบปัญหา\n`)
    }

    console.log(bad ? `เจอปัญหา ${bad} หน้า` : 'ผ่านทุกหน้า')
    if (advisory) console.log(`+ ข้อแนะนำอีก ${advisory} จุด (E · ไม่เต็มความกว้าง — ไม่นับเป็นข้อผิดพลาด)`)
  } finally {
    cdp?.close()
    chrome?.kill()
    await sleep(300)                                   // รอ Chrome ปล่อยไฟล์ก่อนลบ ไม่งั้น ENOTEMPTY
    try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}
  }
  process.exit(bad ? 1 : 0)
}

main().catch((e) => { console.error(e.message); process.exit(2) })
