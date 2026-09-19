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
 * ⚠️ ชื่อกฎเคยเป็นตัวอักษรเดี่ยว (A/B/C/D/E/N/P/Q/T/F/K/G/H) — เปลี่ยนเป็นคำอังกฤษคำเดียว 2026-09-19
 *    เพราะ user ต้องเปิดคู่มือทุกครั้งเพื่อแปลว่า "N คืออะไร" · ตารางแปลงอยู่ใน md/PENDING.md
 *
 * ตรวจ 7 อาการ (เทียบกับ target ทั้งหมด):
 *   overflow   หน้ากว้างเกินจอ         documentElement.scrollWidth > target
 *   zoomed     จอถูกถ่างจนต้องย่อหน้า   innerWidth > target  ← อาการที่ user เห็นว่า "แหกเกินหน้าจอ"
 *   offscreen  element ล้นขอบจอ        getBoundingClientRect().right > target (เอาเฉพาะตัวนอกสุด = ตัวการจริง)
 *   clipped    ของโดนตัดหายเงียบๆ      scrollWidth > clientWidth ขณะ overflow-x เป็น hidden/clip
 *      (ข้าม input/textarea/select — ช่องกรอกเลื่อนเนื้อหาในตัวเองเป็นเรื่องปกติ ไม่ใช่บั๊ก)
 *   slack      ช่องกรอกไม่เต็มความกว้าง  แถวที่มี select/input/textarea แล้วเหลือที่ว่างท้ายแถว > 32px
 *      (user สั่งให้ตรวจด้วย 2026-09-01: "ทำให้ equal fluid 100% in mobile view")
 *      **ไม่นับเป็นข้อผิดพลาด (ไม่ทำให้ exit 1)** — เป็นคำแนะนำ บางแถวตั้งใจไม่เต็มก็มี ใช้ตาตัดสิน
 *
 * ── รอบ 2 (2026-09-19) — user ทัก: "บางครั้งไม่ใช่แค่ล้นหน้าจอ แต่แบบวางเรียงกันจนเบียดข้อความกัน
 *    เหมือนตาราง บน mobile" + "ไหนจะเรื่องปุ่มไม่ fluid อีก" ─ อาการพวกนี้ **ไม่ล้นขอบจอ** กฎชุดแรก
 *    จึงมองไม่เห็นเลย (และ truncate ถูกยกเว้นทั้งดุ้นมาตั้งแต่ต้น) ────────────────────────────────
 *   unreadable  ข้อความโดนตัดจนอ่านไม่รู้เรื่อง  truncate ที่โชว์ < 55% ของเนื้อหา (หรือช่องแคบ < 120px
 *      และโชว์ < 65%) — **นับเป็นข้อผิดพลาด** ต่างจากคำแนะนำอื่น เพราะถ้าไม่ error ก็จะถูกกลืนไปกับ
 *      คำแนะนำอีกหลายบรรทัดแล้วไม่มีใครแก้ · ปิดเสียงรายจุดด้วย data-audit-ok="unreadable"
 *   squeezed  คอลัมน์ข้อความถูกบีบ    แถว flex ที่มีของ ≥3 ชิ้น แล้วคอลัมน์ที่ประกาศ flex-grow ได้
 *      ที่ไปน้อยกว่า "ส่วนแบ่งที่ควรได้" (45% หารจำนวนตัวที่ grow) · คำแนะนำ
 *   ragged    แถวปุ่มแหว่ง/ไม่ fluid   แถวที่ลูกทุกตัวเป็นปุ่ม (2-5 ตัว) แล้วบรรทัดใดกิน < 75% ของแถว
 *      หรือปุ่มคอลัมน์เดียวกันกว้างต่างกัน > 8px · คำแนะนำ
 *
 *   ⭐ ทุกกฎพิมพ์ **ตัวเลขจริง** เสมอ ("โชว์ 98px จากเนื้อหา 412px (24%)") ไม่ใช่แค่ชื่อกฎ —
 *      คนอ่านต้องตัดสินได้ทันทีว่าเคสนี้ยอมรับได้ไหม โดยไม่ต้องเปิดเบราว์เซอร์เอง
 *   ⭐ `--selftest` ยิงกฎ unreadable/squeezed/ragged ใส่ scripts/dev/mobileAudit.fixture.html ที่รู้คำตอบอยู่แล้ว
 *      (ทั้งเคสที่ต้องยิงและเคสที่ต้องเงียบ) — รันก่อนแก้เกณฑ์ทุกครั้ง
 *
 * โหมด tidy (`--mode tidy` หรือ `both` · user สั่ง 2026-09-06 "ให้มัน fluid เป็นระเบียบ ไม่มี tool รกรุงรัง")
 * ทั้งชุด **เป็นคำแนะนำล้วน ไม่ทำให้ exit 1** — ความเป็นระเบียบตัดสินด้วยตาคน เครื่องแค่ชี้จุด:
 *   tiny     ปุ่ม/ลิงก์เล็กกว่านิ้ว     เล็กกว่า 44px **ทั้งสองด้าน** (ไม่ใช่ด้านเดียวตามมาตรฐาน — สเกลปุ่ม
 *      ของโปรเจกต์นี้สูง 32px ทั้งเว็บโดยตั้งใจ ใช้กฎเต็มจะยิงทุกปุ่มจนอ่านไม่ออกว่าอันไหนพังจริง)
 *   loose    แถวปุ่ม/ลิงก์ไม่เต็มความกว้าง  slack ฉบับขยาย (ข้ามแถว justify-between ที่ตั้งใจดันหัว-ท้าย)
 *            ⚠️ ซ้อนกับ ragged เกือบหมด ต่างกันแค่ loose อยู่โหมด tidy — ยังไม่ได้ยุบรวม (user ยังไม่เคาะ)
 *   crowded  รกในแถวเดียว             ลูกตั้งแต่ 6 ชิ้น และมีปุ่ม/ตัวควบคุมอย่างน้อย 3 → ควรยุบเข้าเมนู
 *   uneven   ขอบ/ช่องไฟไม่เท่ากัน      ขอบซ้าย/ขวาต่างกันเกิน 8px · ช่องไฟในแถวเดียวต่างกันเกิน 6px
 *      (ข้ามกล่องที่มี text node ปนกับ element — ระยะที่คร่อมตัวหนังสือไม่ใช่ช่องไฟ)
 *   wrapped  ข้อความแน่นจนตัดบรรทัด    แถว flex แนวนอน items-center ที่มีตัวหนังสือลอยปนกับ element
 *      (ไอคอน+ข้อความ+badge ในแถวเดียว) ≥2 ชิ้น แล้วตัดขึ้นบรรทัดใหม่ — อาการ "เขียนซ้อนกันจนหนังสือตก"
 *      (2026-09-08: banner เซ็นเอกสารเคยเป็นแบบนี้ ตรวจ overflow ไม่เจอเพราะไม่ได้ล้นขอบจอ แค่ตัดบรรทัดรก)
 *      จำกัดเฉพาะ items-center เพื่อเลี่ยงย่อหน้าข้อความปกติที่ตั้งใจตัดบรรทัดอยู่แล้ว (ไม่ใช่ badge/label)
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
  const a = { base: 'http://localhost:3000', width: 375, height: 812, shot: false, routes: null, all: false, debug: false, mode: 'overflow', selftest: false }
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === '--all') a.all = true
    else if (v === '--selftest') a.selftest = true
    else if (v === '--mode') {
      a.mode = argv[++i]
      if (!['overflow', 'tidy', 'both'].includes(a.mode)) { console.error(`--mode ต้องเป็น overflow | tidy | both`); process.exit(2) }
    }
    else if (v === '--shot') a.shot = true
    else if (v === '--debug') a.debug = true
    else if (v === '--routes') a.routes = argv[++i].split(',').map((s) => s.trim()).filter(Boolean)
    else if (v === '--width') a.width = Number(argv[++i])
    else if (v === '--height') a.height = Number(argv[++i])
    else if (v === '--base') a.base = argv[++i].replace(/\/$/, '')
    else if (v === '--help' || v === '-h') { console.log(HELP); process.exit(0) }
    else { console.error(`ไม่รู้จัก option: ${v}`); process.exit(2) }
  }
  if (!a.all && !a.routes && !a.selftest) { console.error('ต้องระบุ --routes /path[,/path] หรือ --all\n'); console.log(HELP); process.exit(2) }
  return a
}
const HELP = `mobileAudit — ตรวจ layout จอมือถือ
  --routes /a,/b   ตรวจเฉพาะเส้นทางนี้ (ถ้ามีใน routes config จะได้ steps ติดมาด้วย)
  --selftest       ตรวจว่า "กฎยังจับได้จริง" ด้วย scripts/dev/mobileAudit.fixture.html
                   (ไม่ต้องมี dev server / ไม่แตะฐานข้อมูล · exit 1 เมื่อกฎเงียบหรือยิงเกิน)
  --all            กวาดทุกเส้นทางใน scripts/dev/mobileAudit.routes.mjs
  --width 375      ความกว้างจอ (ค่าเริ่มต้น 375 ตาม .wolf/config.json · ลองที่ 320 ดูขอบล่างสุดได้)
  --height 812     ความสูงจอ
  --base URL       ค่าเริ่มต้น http://localhost:3000 (dev server ของ user)
  --mode MODE      overflow (ค่าเริ่มต้น) | tidy | both
                   overflow = overflow · zoomed · offscreen · clipped · slack · unreadable ·
                   squeezed · ragged   ·   tidy = tiny · loose · crowded · uneven · wrapped
                   tidy = "ฟลูอิดและเป็นระเบียบ" — ปุ่มเล็กเกินนิ้ว · แถวไม่เต็มความกว้าง ·
                   ของรกในแถวเดียว · ขอบ/ช่องไฟไม่เท่ากัน · ข้อความแน่นจนตัดบรรทัด ·
                   **เป็นคำแนะนำล้วน ไม่ทำให้ exit 1**
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
const PROBE = (target, mode = 'overflow') => `(() => {
  const W = ${target}                       // ⭐ ความกว้างจอที่สั่ง ไม่ใช่ innerWidth (ดูหัวไฟล์)
  const OVERFLOW = ${mode !== 'tidy'}
  const TIDY = ${mode !== 'overflow'}
  const TAP_MIN = 44                        // มาตรฐาน tap target ของ iOS/Android
  const CROWD = 6                           // ของกี่ชิ้นในแถวเดียวถึงเรียกว่ารก
  const N_RATIO = 0.55                      // truncate ที่โชว์น้อยกว่านี้ = อ่านไม่รู้เรื่อง (กฎ unreadable)
  const N_MIN_PX = 120                      // ช่องที่แคบกว่านี้ อ่อนไหวกว่าปกติ…
  const N_NARROW_RATIO = 0.65               // …แต่ต้องโดนตัดเกิน 1/3 ด้วย ถึงจะนับ
  // ⚠️ โจทย์เดิมเขียนว่า "clientWidth < 120px" เฉยๆ เป็นเงื่อนไข **หรือ** — ลองจริงแล้วพัง:
  //    "อาสาประชาชน · 6,617 คน" ในกล่อง 119px โชว์ตั้ง 70% ก็กลายเป็น error ทั้ง / และ /dashboard
  //    เพราะพลาดเส้น 120px ไป 1px · หน้าที่คนเปิดบ่อยที่สุดสองหน้า exit 1 ทุกครั้ง = คนปิดสคริปต์ทิ้ง
  //    ➜ "แคบ" อย่างเดียวไม่ใช่ความผิด ต้อง "แคบ + ตัดหนัก" ถึงจะเรียกว่าอ่านไม่รู้เรื่อง
  const P_SHARE = 0.45                      // คอลัมน์ข้อความควรได้อย่างน้อยเท่านี้ของแถว (กฎ squeezed)
  // 0.75 ไม่ใช่ 0.85 ตามโจทย์ — วัดทั้งเว็บแล้วช่วง 75-85% มีอยู่เคสเดียวคือแถบแท็บ 2 อันที่ /calling
  // (กิน 81%) ซึ่งไม่มีอะไรต้องแก้ · ของที่พังจริงกินกัน 38-58% ทั้งนั้น เลยไม่เสียความไวอะไร
  const Q_FILL = 0.75                       // แถวปุ่มควรกินความกว้างอย่างน้อยเท่านี้ต่อบรรทัด (กฎ ragged)
  const Q_DIFF = 8                          // ปุ่มคอลัมน์เดียวกันกว้างต่างกันเกินนี้ = แหว่ง
  const ISEL = 'button, a[href], [role="button"], input[type="button"], input[type="submit"], summary'
  const seen = []
  const tidy = []
  // ทางยกเว้นรายจุด — ข้อความบางอันยาวเกินจะพอดีจริงๆ ถ้าไม่มีทางปิดเสียง คนจะปิดสคริปต์ทิ้งทั้งตัว
  //   data-audit-ok="unreadable"    ยกเว้นกฎ unreadable ของกล่องนี้และลูกหลาน
  //   data-audit-ok="squeezed,ragged"  ยกเว้น squeezed และ ragged · "all" หรือค่าว่าง = ยกเว้นทุกกฎ
  const ALIAS = { truncate: 'unreadable', squeeze: 'squeezed', buttons: 'ragged' }
  // ⚠️ ห้ามใช้ closest('[data-audit-ok]') — มันคืนบรรพบุรุษที่ **ใกล้ที่สุด** ตัวเดียว ถ้าตัวนั้นยกเว้นคนละกฎ
  //    การยกเว้นของบรรพบุรุษที่ไกลกว่าจะถูกมองข้ามเงียบๆ ต้องไล่ขึ้นเองทุกชั้น
  const exempt = (el, rule) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const v = n.getAttribute ? n.getAttribute('data-audit-ok') : null
      if (v === null || v === undefined) continue
      // ⚠️ ต้องเป็น \\s ไม่ใช่ \s — โค้ดก้อนนี้อยู่ใน template literal ของ Node ถ้าเขียน \s ตัวเดียว
      //    มันหายไปตั้งแต่ตอนประกอบ string กลายเป็น /[s,]+/ = แยกคำด้วยตัวอักษร s
      //    ("buttons" → ["button"] → หา ALIAS ไม่เจอ → ยกเว้นไม่ทำงาน เงียบๆ ไม่มี error)
      const list = v.split(/[\\s,]+/).filter(Boolean)
      if (!list.length) return true
      if (list.some((k) => k === 'all' || k === rule || ALIAS[k] === rule)) return true
    }
    return false
  }
  const describe = (el) => ({
    tag: el.tagName.toLowerCase(),
    box: (() => { const r = el.getBoundingClientRect(); return \`\${Math.round(r.left)}→\${Math.round(r.right)} (w\${Math.round(r.width)})\` })(),
    cls: (el.getAttribute('class') || '').replace(/\\s+/g, ' ').trim().slice(0, 180),
    txt: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 48),
    caseId: el.closest('[data-case]') ? el.closest('[data-case]').getAttribute('data-case') : null,
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

  // offscreen — ล้นขอบจอ (เอาเฉพาะตัวนอกสุด ไม่งั้นได้ลูกหลานเป็นร้อย)
  if (OVERFLOW) {
    const over = new Set()
    for (const el of all) {
      const m = meta.get(el)
      if (!m.vis) continue
      // ของข้างใน <svg> ถูก viewBox ครอบไว้อยู่แล้ว (overflow:hidden โดยปริยาย) — โหนดที่พิกัดอยู่นอกจอ
      // ไม่ได้ "ล้น" ให้ใครเห็น · /team มีโหนดผังเป็นร้อย เคยรายงานล้น 3,800px ทุกครั้งจนกลบของจริง
      // ตัว <svg> เองยังตรวจตามปกติ ถ้ากรอบมันล้นจอจริงก็ยังจับได้
      if (el.ownerSVGElement) continue
      if (m.r.right > W + 1 || m.r.left < -1) over.add(el)
    }
    for (const el of over) {
      if (el.parentElement && over.has(el.parentElement)) continue
      const m = meta.get(el)
      seen.push({ type: 'offscreen', px: Math.round(Math.max(m.r.right - W, -m.r.left)), ...describe(el) })
    }
  }

  // clipped — โดน overflow-x ตัดหายเงียบๆ  ·  unreadable — truncate ที่ตัดจนอ่านไม่รู้เรื่อง
  //
  // ⛔ ของเดิมข้าม \`textOverflow === 'ellipsis'\` ทั้งหมดด้วยเหตุผลว่า "ตั้งใจตัด มี … ให้เห็น" —
  //    ข้อสมมติผิดตรงที่ **"ตั้งใจตัด" ≠ "ตัดเท่าไหร่ก็ได้"** ชื่อรอบที่เหลือ 98px จากเนื้อหา 412px
  //    ก็ผ่านฉลุย ทั้งที่คนอ่านไม่ออกว่าเป็นรอบไหน = อาการ "เบียดกันเหมือนตาราง" ที่ user ทัก (2026-09-19)
  //    ➜ ยังยกเว้น "ตัดนิดหน่อย" เหมือนเดิม แต่ตัดหนักเมื่อไหร่กลายเป็น N ซึ่งเป็น **ข้อผิดพลาด**
  const nCut = []
  const nearMiss = []
  for (const el of OVERFLOW ? all : []) {
    const m = meta.get(el)
    if (!m.vis) continue
    if (el.scrollWidth <= el.clientWidth + 1) continue
    const ox = m.cs.overflowX
    if (ox !== 'hidden' && ox !== 'clip') continue
    if (['input', 'textarea', 'select'].includes(el.tagName.toLowerCase())) continue  // ช่องกรอกเลื่อนเองได้ ปกติ
    if (el.isContentEditable) continue
    if (el.clientWidth === 0) continue                       // ของที่ยังไม่ layout
    if (m.cs.textOverflow === 'ellipsis') {
      const shownPx = el.clientWidth, fullPx = el.scrollWidth
      const ratio = shownPx / fullPx
      const bad = ratio < N_RATIO || (shownPx < N_MIN_PX && ratio < N_NARROW_RATIO)
      if (!bad) {
        // เก็บ "เฉียดเกณฑ์ unreadable" ไว้ให้ --debug ดู — ไม่งั้นเวลาสงสัยว่าเกณฑ์แน่น/หลวมไป ต้องไปเดาเอง
        if (ratio < 0.9) nearMiss.push({ px: fullPx - shownPx, note: \`โชว์ \${Math.round(shownPx)}px จาก \${Math.round(fullPx)}px (\${Math.round(ratio * 100)}%)\`, ...describe(el) })
        continue
      }
      if ((el.innerText || '').trim().length < 2) continue    // ไม่มีตัวหนังสือให้อ่าน ไม่ใช่เรื่องอ่านไม่รู้เรื่อง
      if (exempt(el, 'unreadable')) continue
      nCut.push({ el, shownPx, fullPx, ratio })
      continue
    }
    seen.push({ type: 'clipped', px: el.scrollWidth - el.clientWidth, ...describe(el) })
  }
  // truncate ซ้อน truncate = ตัวนอกเป็นคนตัดจริง เอาตัวนอกสุดพอ (ท่าเดียวกับกฎ offscreen)
  const nSet = new Set(nCut.map((c) => c.el))
  for (const c of nCut) {
    let nested = false
    for (let n = c.el.parentElement; n && n !== document.body; n = n.parentElement) if (nSet.has(n)) { nested = true; break }
    if (nested) continue
    seen.push({
      type: 'unreadable', px: c.fullPx - c.shownPx,
      note: \`โชว์ \${Math.round(c.shownPx)}px จากเนื้อหา \${Math.round(c.fullPx)}px (\${Math.round(c.ratio * 100)}%)\`,
      ...describe(c.el),
    })
  }

  // slack — ตัวควบคุมบนมือถือที่ไม่ยืดเต็มความกว้าง (เฉพาะจอ <= 640 = ต่ำกว่า breakpoint sm)
  //
  // ⛔ รอบแรกวัดผิดระดับ: ไปวัด "กล่องที่ครอบ control" ซึ่งเป็น shrink-to-fit อยู่แล้ว → gap = 0 เสมอ
  //    ตรวจ 16 โซนแล้วไม่ยิงสักจุด ทั้งที่หน้าจริงมีที่ว่างโล่ง · ต้องวัด **ทีละบรรทัดของพ่อ** ว่า
  //    บรรทัดนั้นกินความกว้างที่พ่อมีให้หมดไหม (นับที่ว่างทั้งหัวบรรทัดและท้ายบรรทัด เพราะ ml-auto
  //    ทำให้ของไปกองขวาแล้วเหลือช่องโหว่ซ้าย ซึ่งก็คือ "ไม่เต็มความกว้าง" เหมือนกัน)
  const checked = new Set()      // กล่องที่สแกนไปแล้ว — ใช้ร่วมกับกฎ loose ของโหมด tidy ไม่ให้รายงานซ้ำกล่องเดียวกัน
  const scanRows = (controls, type, out) => {
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
        if (type === 'loose' && /space-(between|around|evenly)/.test(bcs.justifyContent)) continue
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
          if (slack > 32) { out.push({ type, px: slack, ...describe(box) }); break }
        }
      }
    }
  }
  if (OVERFLOW && W <= 640) {
    scanRows([...document.querySelectorAll('select, textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden])')], 'slack', seen)
  }

  // ── จัดลูกของกล่องเป็น "บรรทัด" ด้วยการซ้อนทับแนวตั้ง (ใช้ร่วมกฎ ragged) ──
  // ห้ามจัดกลุ่มด้วยค่า top ตรงๆ — ปุ่มสูงไม่เท่ากันใน items-center มี top คนละค่าแต่อยู่บรรทัดเดียวกัน
  const rowsOf = (kidsM) => {
    const lines = []
    for (const m of [...kidsM].sort((a, b) => a.r.top - b.r.top)) {
      const cur = lines[lines.length - 1]
      if (cur && m.r.top < cur.bottom - 1) {
        cur.l = Math.min(cur.l, m.r.left); cur.r = Math.max(cur.r, m.r.right)
        cur.bottom = Math.max(cur.bottom, m.r.bottom); cur.items.push(m)
      } else lines.push({ l: m.r.left, r: m.r.right, bottom: m.r.bottom, items: [m] })
    }
    return lines
  }

  // squeezed — คอลัมน์ข้อความถูกบีบจนแคบในแถวที่มีของหลายชิ้น (อาการ "เรียงกันเหมือนตาราง")
  //
  // "ถูกบีบ" ต้องดูที่ตัวที่ **ควรได้ที่ว่างที่เหลือ** ไม่ใช่ลูกตัวไหนก็ได้ที่แคบ:
  //   · flex-grow > 0 = ประกาศตัวว่าจะกินที่ว่างที่เหลือ แต่กลับได้นิดเดียว → โดนบีบ
  //   · หรือหดได้ (flex-shrink) แล้วข้างในมีของโดนตัดจริง → โดนบีบเหมือนกัน
  // ⛔ ห้ามใช้ \`minWidth === '0px'\` เป็นสัญญาณเดี่ยว — Chrome คืน 0px ให้ element ทั่วไปเพียบ
  //    (ไม่ใช่แค่ min-w-0 ของ Tailwind) จะกลายเป็น "ลูกทุกตัวเข้าข่าย" แล้วยิงมั่วทั้งหน้า
  // ⚠️ คำแนะนำ ไม่นับเป็นข้อผิดพลาด — บางแถวคอลัมน์ข้อความแคบโดยตั้งใจ (ป้ายสั้นๆ) ต้องใช้ตาตัดสิน
  if (OVERFLOW && W <= 640) {
    for (const el of all) {
      const m = meta.get(el)
      if (!m.vis) continue
      const cs = m.cs
      if (!/flex/.test(cs.display) || cs.flexDirection.startsWith('column')) continue
      const rowW = m.r.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
      if (rowW < 200) continue                       // แถวแคบเกินกว่าจะพูดเรื่องสัดส่วน
      const kids = [...el.children].filter((ch) => meta.get(ch)?.vis)
      if (kids.length < 3) continue                  // 2 ชิ้นไม่เรียกว่า "เบียดกันเหมือนตาราง"
      // ลูกที่ประกาศ flex-grow มีกี่ตัว = แถวนี้ตั้งใจให้ใครแบ่งที่ว่างกันบ้าง
      // ⛔ ถ้าไม่หารด้วยจำนวนนี้ ชุดปุ่มตัวเลือก (30/60/90/180/365 ที่ /team ใช้ flex-1 ทุกตัว)
      //    จะถูกอ่านว่า "ทุกตัวโดนบีบเหลือ 15%" แล้วยิงรัวทั้งแถว ทั้งที่แบ่งเท่ากันตามตั้งใจ
      //    (รอบแรกยิงไป 11 จุดที่ /team จุดเดียว = 61% ของ P ทั้งเว็บ)
      const growers = Math.max(1, kids.filter((ch) => parseFloat(meta.get(ch).cs.flexGrow) > 0).length)
      const fairShare = P_SHARE / growers
      for (const ch of kids) {
        const mc = meta.get(ch)
        if (!(ch.innerText || '').trim()) continue    // ไม่มีตัวหนังสือ = ไม่ใช่คอลัมน์ข้อความ
        const grows = parseFloat(mc.cs.flexGrow) > 0
        const squeezed = parseFloat(mc.cs.flexShrink) > 0 &&
          [ch, ...ch.querySelectorAll('*')].some((d) => d.scrollWidth > d.clientWidth + 1 && meta.get(d)?.cs.overflowX !== 'visible')
        if (!grows && !squeezed) continue
        const share = mc.r.width / rowW
        if (share >= fairShare) continue
        if (exempt(ch, 'squeezed')) continue
        seen.push({
          type: 'squeezed', px: Math.round(rowW * fairShare - mc.r.width),
          note: \`คอลัมน์ข้อความกว้าง \${Math.round(mc.r.width)}px จากแถว \${Math.round(rowW)}px (\${Math.round(share * 100)}%) · แถวนี้มีของ \${kids.length} ชิ้น\`,
          ...describe(ch),
        })
      }
    }
  }

  // ragged — แถวปุ่มแหว่ง/ไม่ fluid บนมือถือ
  //
  // ต่างจากกฎ loose ตรงที่ loose วัด "ที่ว่างท้ายแถว" ของกล่องไหนก็ได้ที่มีปุ่มอยู่ข้างใน และข้ามแถว
  // justify-between ทิ้ง · ragged วัดเฉพาะ **แถวที่ลูกทุกตัวเป็นปุ่ม** = แถบปุ่มจริงๆ แล้ววัด "ต่อบรรทัด"
  // ซึ่งเป็นจุดที่ flex-wrap พัง: บรรทัดสุดท้ายเหลือปุ่มเดียวค้างอยู่ครึ่งแถว
  // (justify-between ไม่ต้องข้าม เพราะมันดันของชนหัว-ท้าย = ครอบเต็มความกว้างอยู่แล้ว ไม่เข้าเงื่อนไข)
  if (OVERFLOW && W <= 640) {
    for (const el of all) {
      const m = meta.get(el)
      if (!m.vis) continue
      const cs = m.cs
      if (!/flex|grid/.test(cs.display) || cs.flexDirection.startsWith('column')) continue
      if (el.closest('nav, [role="tablist"], [role="menu"]')) continue   // แถบเมนู/แท็บ ไม่ใช่แถวปุ่มสั่งงาน
      const kids = [...el.children].filter((ch) => meta.get(ch)?.vis)
      // ⛔ เพดานบน 5 ปุ่ม: กองชิปตัวกรอง (เช่น 77 จังหวัดที่ /docs) ยังไงบรรทัดสุดท้ายก็ต้องแหว่ง
      //    การยืดชิปให้เต็มแถวไม่ใช่สิ่งที่ใครอยากได้ · "ปุ่มไม่ fluid" ที่ user บ่นคือแถบปุ่มสั่งงาน
      //    ท้ายฟอร์ม 2-4 ปุ่ม ไม่ใช่กองชิป (รอบแรก /docs ยิงเพราะบรรทัดที่ 15 จาก 15 กิน 29%)
      if (kids.length < 2 || kids.length > 5) continue
      const isBtn = (ch) => ch.matches(ISEL) || (ch.children.length === 1 && ch.firstElementChild.matches(ISEL))
      if (!kids.every(isBtn)) continue                // มีของอื่นปน = ไม่ใช่แถวปุ่ม ปล่อยให้กฎอื่นว่า
      // ⛔ แถวที่เป็นปุ่มไอคอนล้วน (จัตุรัส h-9 w-9) **ห้ามยืดเต็มแถว** — md/rules/DESIGN.md §8 เขียนไว้ชัด
      //    ว่ามันเป็นสี่เหลี่ยมจัตุรัสโดยตั้งใจ ยืดแล้วเพี้ยน · กฎ ragged เคยยิงแถวแบบนี้ที่ /styleguide
      //    ซึ่งขัดกับกฎที่เขียนไว้เอง (เจอตอนเอากฎมาตรวจหน้าตัวเอง 2026-09-19)
      if (kids.every((ch) => { const mk = meta.get(ch); return Math.abs(mk.r.width - mk.r.height) <= 4 })) continue
      const left = m.r.left + (parseFloat(cs.paddingLeft) || 0)
      const right = m.r.right - (parseFloat(cs.paddingRight) || 0)
      const contentW = right - left
      if (contentW < 200) continue
      if (exempt(el, 'ragged')) continue
      const lines = rowsOf(kids.map((ch) => meta.get(ch)))

      // (1) บรรทัดไหนกินไม่ถึง 85% = แหว่ง
      let worst = null
      lines.forEach((ln, i) => {
        const fill = (ln.r - ln.l) / contentW
        if (fill < Q_FILL && (!worst || fill < worst.fill)) worst = { fill, i, ln }
      })
      if (worst) {
        seen.push({
          type: 'ragged', px: Math.round(contentW - (worst.ln.r - worst.ln.l)),
          note: \`บรรทัดที่ \${worst.i + 1} จาก \${lines.length} กิน \${Math.round(worst.ln.r - worst.ln.l)}px จาก \${Math.round(contentW)}px (\${Math.round(worst.fill * 100)}%) · ปุ่ม \${kids.length} ตัว\`,
          ...describe(el),
        })
        continue                                       // รายงานอาการเดียวต่อแถวพอ
      }

      // (2) ปุ่มที่อยู่คอลัมน์เดียวกัน (ขอบซ้ายตรงกัน) แต่กว้างไม่เท่ากัน = ขอบขวาไม่ตรง
      if (lines.length < 2) continue
      const cols = new Map()
      for (const ln of lines) for (const it of ln.items) {
        const key = Math.round(it.r.left / Q_DIFF)
        cols.set(key, [...(cols.get(key) || []), it])
      }
      for (const [, group] of cols) {
        if (group.length < 2) continue
        const ws = group.map((g) => g.r.width)
        const diff = Math.max(...ws) - Math.min(...ws)
        if (diff <= Q_DIFF) continue
        seen.push({
          type: 'ragged', px: Math.round(diff),
          note: \`ปุ่มคอลัมน์เดียวกันกว้างไม่เท่ากัน \${ws.map((w) => Math.round(w)).join('/')}px (ต่าง \${Math.round(diff)}px) · ขอบขวาไม่ตรงกัน\`,
          ...describe(el),
        })
        break
      }
    }
  }

  // ── โหมด tidy — "ฟลูอิดและเป็นระเบียบ" ทั้งชุดเป็นคำแนะนำ ไม่ทำให้ exit 1 ──
  if (TIDY) {
    // tiny — ปุ่ม/ลิงก์เล็กกว่านิ้ว (44×44)
    for (const el of document.querySelectorAll(ISEL)) {
      const m = meta.get(el)
      if (!m || !m.vis) continue
      if (el.closest('svg')) continue                        // โหนดกราฟ วัดแบบปุ่มไม่ได้
      if (el.parentElement && el.parentElement.closest(ISEL)) continue   // ปุ่มซ้อนปุ่ม เอาตัวนอกพอ
      if (m.cs.display === 'inline') continue                // ลิงก์ในย่อหน้า สูงตามบรรทัด = ปกติ
      // ⚠️ ต้อง **เล็กทั้งสองด้าน** ถึงจะนับ — มาตรฐานจริงคือ 44 ด้านใดด้านหนึ่งก็ผิดแล้ว แต่สเกลปุ่ม
      //    ของโปรเจกต์นี้สูง 32px ทั้งเว็บโดยตั้งใจ (md/rules/DESIGN.md §Type scale) ถ้าใช้กฎเต็มจะยิงทุกปุ่ม
      //    = เสียงรบกวนล้วน · ที่กดพลาดจริงคือไอคอนจิ๋ว 13×13 ซึ่งเล็กทั้งกว้างและสูง
      const min = Math.min(m.r.width, m.r.height)
      const max = Math.max(m.r.width, m.r.height)
      if (min <= 0 || max >= TAP_MIN) continue
      tidy.push({ type: 'tiny', px: Math.round(TAP_MIN - min), note: \`\${Math.round(m.r.width)}×\${Math.round(m.r.height)}\`, ...describe(el) })
    }

    // loose — แถวที่มีปุ่ม/ลิงก์ (ไม่ใช่ช่องกรอก) แล้วไม่ยืดเต็มความกว้าง — กฎ slack ฉบับขยาย
    if (W <= 640) scanRows([...document.querySelectorAll(ISEL)], 'loose', tidy)

    for (const el of all) {
      const m = meta.get(el)
      if (!m.vis) continue
      const cs = m.cs
      const isRow = /flex|grid/.test(cs.display) && !cs.flexDirection.startsWith('column')
      if (!isRow) continue
      const kidsM = [...el.children].map((ch) => meta.get(ch)).filter((x) => x && x.vis)

      // crowded — ของเยอะเกินในแถวเดียว (ต้องมีปุ่ม/ตัวควบคุมอย่างน้อย 3 ถึงเรียกว่า "แถบเครื่องมือ")
      if (kidsM.length >= CROWD) {
        const kids = [...el.children].filter((ch) => meta.get(ch)?.vis)
        const inter = kids.filter((ch) => ch.matches(ISEL) || ch.querySelector(ISEL)).length
        // ชุดปุ่มตัวเลือกเดียวกันทั้งแถว (segmented control เช่น 30/60/90/180/365) ไม่ใช่ของรก
        // — เป็นตัวเลือกชุดเดียวที่ผู้ใช้อ่านรวดเดียว ต่างจากแถบที่เอาของคนละชนิดมากอง
        const uniform = kids.every((ch) => ch.matches(ISEL)) && new Set(kids.map((ch) => ch.tagName)).size === 1
        if (inter >= 3 && !uniform) tidy.push({ type: 'crowded', px: kidsM.length, note: \`\${kidsM.length} ชิ้นในแถวเดียว\`, ...describe(el) })
      }

      // uneven (ช่องไฟ) — ระยะระหว่างของในแถวไม่สม่ำเสมอ (ข้ามแถวที่ตั้งใจดันหัว-ท้าย)
      // ⚠️ ต้องข้ามกล่องที่มีตัวหนังสือลอยๆ ปนกับ element (text node ไม่ใช่ลูกที่วัด rect ได้)
      //    ไม่งั้นระยะที่ "ข้ามตัวหนังสือ" จะถูกอ่านเป็นช่องไฟ 83px ทั้งที่เป็นคำอ่านปกติ (ชิปกลุ่มใน /team)
      const mixedText = [...el.childNodes].some((nd) => nd.nodeType === 3 && nd.textContent.trim())

      // wrapped — ไอคอน/ข้อความ/badge ปนกันในแถว items-center แล้วแน่นจนตัดขึ้นบรรทัดใหม่
      //    (จำกัด items-center เพื่อเลี่ยงย่อหน้าข้อความปกติที่ตั้งใจตัดบรรทัด — นั่นไม่ใช่ badge/label row)
      // ⚠️ ห้ามเทียบ top/bottom ของลูกแต่ละตัวตรงๆ — ตัว badge เองก็ตัดบรรทัดได้ ทำให้กรอบมันคาบเกี่ยว
      //    กับกรอบไอคอนอยู่ดี (ไม่ nonoverlap) ทั้งที่หน้าจริงเห็นเป็น 2 บรรทัดชัดๆ ต้องวัดที่ "ความสูงรวม
      //    ของแถว" เทียบ line-height บรรทัดเดียวแทน — สูงเกิน 1.6 เท่า = ตัดบรรทัดแน่นอน
      if (mixedText && kidsM.length >= 2 && cs.alignItems === 'center') {
        const fontPx = parseFloat(cs.fontSize) || 16
        const lineHeightPx = cs.lineHeight === 'normal' ? fontPx * 1.2 : parseFloat(cs.lineHeight)
        if (m.r.height > lineHeightPx * 1.6) {
          tidy.push({ type: 'wrapped', px: kidsM.length, note: \`\${kidsM.length} ชิ้นในแถวตัดขึ้นบรรทัดใหม่ (สูง \${Math.round(m.r.height)}px)\`, ...describe(el) })
        }
      }
      if (!mixedText && kidsM.length >= 3 && !/space-(between|around|evenly)/.test(cs.justifyContent)) {
        const row = [...kidsM].sort((a, b) => a.r.left - b.r.left)
        const wrapped = row.some((k) => k.r.top > row[0].r.bottom - 1)
        const pushed = [...el.children].some((ch) => getComputedStyle(ch).marginLeft === 'auto')
        if (!wrapped && !pushed) {
          const gaps = []
          for (let i = 1; i < row.length; i++) gaps.push(Math.round(row[i].r.left - row[i - 1].r.right))
          const mx = Math.max(...gaps), mn = Math.min(...gaps)
          if (mx - mn > 6) tidy.push({ type: 'uneven', px: mx - mn, note: \`ช่องไฟ \${mn}–\${mx}px\`, ...describe(el) })
        }
      }
    }

    // uneven (ขอบ) — ขอบซ้าย/ขวาของกล่องเนื้อหาไม่เท่ากัน (เอาเฉพาะตัวนอกสุด)
    const asym = new Set()
    for (const el of all) {
      const m = meta.get(el)
      if (!m.vis || m.r.width < W * 0.6) continue
      if (/^(input|textarea|select|button|a|img|svg|table)$/.test(el.tagName.toLowerCase())) continue
      const l = Math.round(m.r.left), rg = Math.round(W - m.r.right)
      if (l < 0 || rg < 0 || Math.abs(l - rg) <= 8) continue
      asym.add(el)
    }
    for (const el of asym) {
      if (el.parentElement && asym.has(el.parentElement)) continue
      const m = meta.get(el)
      const l = Math.round(m.r.left), rg = Math.round(W - m.r.right)
      tidy.push({ type: 'uneven', px: Math.abs(l - rg), note: \`ขอบซ้าย \${l}px / ขวา \${rg}px\`, ...describe(el) })
    }
  }

  // แยกโควตาต่อชนิด — px ของแต่ละกฎคนละหน่วย (px กับ "จำนวนชิ้น") เรียงรวมแล้วกฎที่ตัวเลขเล็กจะถูกเบียดหายทั้งกฎ
  const capped = []
  for (const type of ['tiny', 'loose', 'crowded', 'uneven', 'wrapped']) {
    capped.push(...tidy.filter((f) => f.type === type).sort((a, b) => b.px - a.px).slice(0, 6))
  }

  return {
    tidy: capped,
    nearMiss: nearMiss.sort((a, b) => b.px - a.px).slice(0, 8),
    path: location.pathname + location.search,
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    target: W,
    elements: all.length,
    // แยกโควตา unreadable/squeezed/ragged ออกจาก offscreen/clipped/slack ด้วยเหตุผลเดียวกับโหมด tidy — px คนละหน่วย (px ที่ล้น กับ px ที่ขาด)
    // เรียงรวมแล้ว slice ทีเดียว กฎที่ตัวเลขเล็กจะถูกเบียดหายไปทั้งกฎ · unreadable ขึ้นก่อนเพราะเป็นข้อผิดพลาด
    findings: [
      ...seen.filter((f) => f.type === 'unreadable').sort((a, b) => b.px - a.px).slice(0, 6),
      ...seen.filter((f) => !['unreadable', 'squeezed', 'ragged'].includes(f.type)).sort((a, b) => b.px - a.px).slice(0, 25),
      ...seen.filter((f) => f.type === 'squeezed').sort((a, b) => b.px - a.px).slice(0, 6),
      ...seen.filter((f) => f.type === 'ragged').sort((a, b) => b.px - a.px).slice(0, 6),
    ],
  }
})()`

// ───────────────────────────── run ─────────────────────────────
function keyOf(f) { return `${f.type}|${f.tag}|${f.cls}` }

// กฎที่ **ไม่** ทำให้ exit 1 — เครื่องชี้จุดให้ แต่คนตัดสินว่ายอมรับได้ไหม
// (unreadable ไม่อยู่ในนี้โดยตั้งใจ: ถ้าเป็นแค่คำแนะนำ มันจะถูกกลืนไปกับอีก 6 บรรทัดแล้วไม่มีใครแก้)
const ADVISORY = new Set(['slack', 'squeezed', 'ragged'])

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

  // ⛔ step `{ wait: n }` ที่อยู่หัวแถวต้องรอ **ก่อน** probe แรก — ลูปเดินสเต็ปข้างล่างมันแค่ sleep
  //    แล้ว `continue` ไม่ได้วัดซ้ำ ⇒ route ที่ fetch หลัง mount ถูกวัดตอนยัง "กำลังโหลด…" แล้วรายงาน
  //    "ผ่าน" ทั้งที่ไม่เคยเห็นการ์ดสักใบ (/finance/payouts วัดได้ 79 element ทั้งที่หน้าจริงมี 300+)
  //
  // ⚠️ `wait` เป็นเวลาตายตัว = แข่งกับเวลา compile ของ dev server (รอบแรกของ route ช้ากว่าปกติมาก)
  //    /calling/assignments/70 รอบหนึ่งโหลดทัน รายงาน N 6 จุด อีกรอบไม่ทัน รายงาน "กำลังโหลด…"
  //    กฎที่ให้ผลไม่เหมือนกันสองรอบติด แย่กว่าไม่มีกฎ ➜ ใช้ `waitFor: '<selector>'` แทนเมื่อรู้ว่า
  //    ต้องรออะไร — รอจนของโผล่จริง (เพดาน 15 วิ) ไม่ใช่รอครบเวลาแล้วหวังว่าจะทัน
  const steps = [...(route.steps || [])]
  while (steps.length && (steps[0].wait || steps[0].waitFor)) {
    const step = steps.shift()
    if (step.wait) { await sleep(step.wait); await settleDom(cdp, 200); continue }
    let found = false
    for (let i = 0; i < 75; i++) {
      found = await cdp.eval(`!!document.querySelector(${JSON.stringify(step.waitFor)})`)
      if (found) break
      await sleep(200)
    }
    if (!found) console.log(`  ⚠️  รอ ${step.waitFor} ไม่โผล่ใน 15 วิ — ผลตรวจข้างล่างวัดจากหน้าที่ยังโหลดไม่เสร็จ`)
    await settleDom(cdp, 200)
  }

  const states = []
  const first = await cdp.eval(PROBE(args.width, args.mode))
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
    for (const step of steps) {
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
      states.push({ state: step.label, ...(await cdp.eval(PROBE(args.width, args.mode))) })
    }
  }

  return { route, redirected, states }
}

/**
 * --selftest — ยิงกฎใส่หน้าที่ "รู้คำตอบอยู่แล้ว" (scripts/dev/mobileAudit.fixture.html)
 *
 * ⭐ มีไว้เพราะเคสทดสอบที่อ้างอิงหน้าจริงเน่าเร็วมาก: พอ UI ถูกแก้ อาการก็หาย แล้วไม่มีใครรู้ว่า
 *    "ไม่เจอปัญหา" แปลว่าหน้าดีขึ้น หรือกฎตายไปแล้ว · fixture ตอบคำถามนั้นได้ใน 5 วินาที
 */
async function selftest(args) {
  const port = 9222 + Math.floor(Math.random() * 500)
  const profileDir = mkdtempSync(join(tmpdir(), 'mobile-audit-'))
  let chrome = null, cdp = null, failed = 0
  try {
    const launched = await launchChrome(port, profileDir)
    chrome = launched.child
    cdp = await Cdp.connect(launched.wsUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: args.width, height: args.height, deviceScaleFactor: 2, mobile: true })
    await cdp.send('Page.navigate', { url: `file://${join(process.cwd(), 'scripts/dev/mobileAudit.fixture.html')}` })
    await cdp.once('Page.loadEventFired')
    await settleDom(cdp, 300)

    const expect = await cdp.eval(`JSON.parse(document.getElementById('expect').textContent)`)
    const res = await cdp.eval(PROBE(args.width, 'overflow'))
    const got = new Map()
    for (const f of res.findings) {
      if (!f.caseId) { console.log(`  ⚠️  finding นอกเคส: ${f.type} <${f.tag}> ${f.cls}`); continue }
      got.set(f.caseId, [...new Set([...(got.get(f.caseId) || []), f.type])].sort())
    }
    console.log(`self-test · จอ ${args.width}px · ${Object.keys(expect).length} เคส\n`)
    for (const [name, want] of Object.entries(expect)) {
      const have = got.get(name) || []
      const ok = JSON.stringify(have) === JSON.stringify([...want].sort())
      if (!ok) failed++
      const detail = res.findings.filter((f) => f.caseId === name).map((f) => `${f.type}: ${f.note || f.px + 'px'}`)
      console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(11)} คาด [${want.join(',') || '—'}] ได้ [${have.join(',') || '—'}]`)
      for (const d of detail) console.log(`        ${d}`)
    }
    console.log(failed ? `\nกฎเพี้ยน ${failed} เคส` : '\nกฎทำงานครบทุกเคส')
  } finally {
    cdp?.close(); chrome?.kill(); await sleep(300)
    try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}
  }
  process.exit(failed ? 1 : 0)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.selftest) return selftest(args)
  const wanted = args.all
    ? ROUTES
    : args.routes.map((p) => ROUTES.find((r) => r.path === p) || { path: p })

  const port = 9222 + Math.floor(Math.random() * 500)
  const profileDir = mkdtempSync(join(tmpdir(), 'mobile-audit-'))
  let chrome = null
  let cdp = null
  let bad = 0
  let advisory = 0
  let sawLayout = false                                // เจอ N/P/Q ที่ไหนสักแห่ง → ควรดูภาพประกอบด้วย

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
          // ตัวที่ "เฉียดเกณฑ์ unreadable" — ไว้ตัดสินว่าเกณฑ์แน่นไปหรือหลวมไป โดยไม่ต้องเดา
          for (const f of s.nearMiss || []) console.log(`      ~unreadable ${f.note} · <${f.tag}> "${f.txt}" · ${f.cls.slice(0, 60)}`)
        }
      }
      const shown = new Set()
      const lines = []
      let hardHit = false
      for (const s of res.states) {
        if (s.missing) { lines.push(`  ⚠️  ${s.state}`); continue }
        const tooWide = s.scrollWidth > s.target + 1
        const expanded = s.innerWidth > s.target + 1
        // ⚠️ ต้องรวมของซ้ำ "ภายในสถานะเดียวกัน" ด้วย ไม่ใช่แค่ข้ามสถานะ — การ์ดในลิสต์มีคลาสเหมือนกัน
        //    ทุกใบ ถ้าไม่รวม รายการ 50 แถวจะได้บรรทัดเดิมซ้ำจนกฎอื่นถูกดันตกจอ (เจอที่ /calling/assignments)
        const collapse = (arr) => {
          const out = []
          for (const f of arr) {
            if (shown.has(keyOf(f))) continue
            const same = out.find((o) => keyOf(o) === keyOf(f))
            if (same) { same.more = (same.more || 0) + 1; continue }
            out.push(f)
          }
          out.forEach((f) => shown.add(keyOf(f)))
          return out
        }
        const fresh = collapse(s.findings)
        const tips = collapse(s.tidy || [])
        if (!tooWide && !expanded && !fresh.length && !tips.length) continue
        if (tooWide || expanded || fresh.some((f) => !ADVISORY.has(f.type))) hardHit = true
        advisory += fresh.filter((f) => ADVISORY.has(f.type)).length + tips.length
        if (fresh.some((f) => ['unreadable', 'squeezed', 'ragged'].includes(f.type))) sawLayout = true
        lines.push(`  [${s.state}]`)
        if (tooWide) lines.push(`    overflow · หน้ากว้าง ${s.scrollWidth}px เกินจอ ${s.target}px`)
        if (expanded) lines.push(`    zoomed · จอถูกถ่างเป็น ${s.innerWidth}px (Chrome ย่อหน้าลงให้พอดี = สิ่งที่คนเห็นว่า "แหก")`)
        for (const f of fresh) {
          const head = {
            slack:      `slack · เหลือที่ว่างท้ายแถว ${f.px}px — ช่องกรอกไม่เต็มความกว้าง (แนะนำ ไม่นับเป็นข้อผิดพลาด)`,
            unreadable: `unreadable · ข้อความโดนตัดจนอ่านไม่รู้เรื่อง — ${f.note} · <${f.tag}> ${f.box} "${f.txt}"`,
            squeezed:   `squeezed · คอลัมน์ข้อความถูกบีบ — ${f.note} · <${f.tag}> ${f.box} "${f.txt}" (แนะนำ)`,
            ragged:     `ragged · แถวปุ่มแหว่ง ไม่เต็มความกว้าง — ${f.note} · <${f.tag}> ${f.box} "${f.txt}" (แนะนำ)`,
          }[f.type] || `${f.type} · เกิน ${f.px}px · <${f.tag}> ${f.box} "${f.txt}"`
          lines.push(`    ${head}${f.more ? ` · +อีก ${f.more} จุดที่หน้าตาเหมือนกัน` : ''}`)
          lines.push(`        ${f.cls}`)
        }
        // โหมด tidy — คำแนะนำล้วน ไม่แตะ hardHit
        for (const f of tips) {
          const head = {
            tiny:    `tiny · ปุ่ม/ลิงก์เล็กกว่านิ้ว ${f.note} (ขั้นต่ำ 44×44)`,
            loose:   `loose · แถวปุ่มไม่เต็มความกว้าง เหลือที่ว่าง ${f.px}px`,
            crowded: `crowded · รกในแถวเดียว — ${f.note} พิจารณายุบเข้าเมนู/ซ่อนบางตัว`,
            uneven:  `uneven · ขอบ/ช่องไฟไม่เท่ากัน — ${f.note}`,
            wrapped: `wrapped · ข้อความแน่นจนตัดบรรทัด — ${f.note} พิจารณาตัดข้อความ/ย่อ/แยกบรรทัด`,
          }[f.type]
          lines.push(`    ${head} · <${f.tag}> ${f.box} "${f.txt}"${f.more ? ` · +อีก ${f.more} จุดที่หน้าตาเหมือนกัน` : ''}`)
          lines.push(`        ${f.cls}`)
        }
      }
      if (lines.length) { if (hardHit) bad++; console.log(`${route.path}\n${lines.join('\n')}\n`) }
      else console.log(`${route.path}\n  ✓ ไม่พบปัญหา\n`)
    }

    console.log(bad ? `เจอปัญหา ${bad} หน้า` : 'ผ่านทุกหน้า')
    if (advisory) console.log(`+ ข้อแนะนำอีก ${advisory} จุด (slack/squeezed/ragged/tiny/loose/crowded/uneven/wrapped — ไม่นับเป็นข้อผิดพลาด)`)
    // เครื่องตัดสินได้แค่ "ตัวเลขผิดปกติ" · "เรียงแล้วดูเป็นตารางอัดๆ" ต้องใช้ตาคน (หรือ Claude อ่านภาพ)
    if (sawLayout && !args.shot) console.log(`\nunreadable/squeezed/ragged เป็นอาการที่ต้องดูรูปประกอบ — รันซ้ำด้วย --shot แล้วเปิดภาพใน ${OUT_DIR}/ ก่อนตัดสินใจแก้ (ดู /designqc)`)
  } finally {
    cdp?.close()
    chrome?.kill()
    await sleep(300)                                   // รอ Chrome ปล่อยไฟล์ก่อนลบ ไม่งั้น ENOTEMPTY
    try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}
  }
  process.exit(bad ? 1 : 0)
}

main().catch((e) => { console.error(e.message); process.exit(2) })
