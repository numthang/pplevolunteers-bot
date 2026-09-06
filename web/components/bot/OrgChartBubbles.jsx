'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { forceSimulation, forceX, forceY, forceCollide } from 'd3-force'
import { el, avatarMarkup, fmtInt, fmtVoice } from './orgchartSvg.js'

// กระดานอันดับแบบฟอง (view ที่ 3 ของ /team) — ทุกคนทั้งเซิร์ฟเวอร์ 100 อันดับแรก
// ฐานคะแนนคนละชุดกับผัง/ตาราง โดยตั้งใจ (ดู getMemberRanking ใน web/db/orgchart.js) — ป้ายบนหน้าบอกไว้
//
// วาดผ่าน DOM API ไม่ผ่าน React state ต่อฟอง — 100 โหนด × 60fps ผ่าน setState คือคอขวด
// d3-force ใช้แค่ 3 แรง: ดูดเข้ากลาง (x/y) + กันชนกัน (collide) · ไม่ใส่ charge เพราะ collide พอแล้ว

// จอแคบ 100 ฟองจะโดนบีบจนชนพื้นขนาดต่ำสุดเท่ากันหมด = อ่านอันดับจากขนาดไม่ได้เลย
const LIMIT_DESKTOP = 100
const LIMIT_MOBILE = 40
const FILL_AREA = 0.5          // สัดส่วนพื้นที่กรอบที่ฟองทุกใบรวมกันกินได้ — เกินนี้จะอัดกันจนไม่เหลือช่องว่าง
const R_MIN = 15
const R_MAX = 92
const IDLE_ALPHA = 0.015       // ลอยเอื่อยๆ ตลอด — 100 โหนดคิดไม่ถึง 1ms/tick แต่ต้องหยุดตอนแท็บไม่ได้ดู
const DRAG_ALPHA = 0.18
// ฟองต้องล่องลอยไปมาตลอด ไม่ใช่นิ่งเป็นภาพนิ่ง — ลองมาแล้ว 2 ท่าที่ไม่ผ่าน:
//   1. alphaTarget อย่างเดียว → พอแรงเข้าสมดุลก็นิ่งค้าง (วัดได้ 0.5px ต่อ 3 วินาที)
//   2. แรงสุ่มรายเฟรม → ทิศสุ่มหักล้างกันเอง + โดน velocityDecay กิน
//   3. คลื่นไซน์ประจำตัว → ขยับจริง แต่ครบคาบก็วนกลับที่เดิม = "หายใจอยู่กับที่" ไม่ใช่ลอยไปไหน
// ที่ใช้จริง: ทิศทางประจำตัวที่ค่อยๆ หมุนทีละนิด (correlated random walk) — ไม่วนกลับที่เดิม
// จึงล่องลอยไปเรื่อยๆ ตราบที่แท็บยังเปิดอยู่ · ขอบกรอบกับ collide เป็นตัวกันไม่ให้หลุดหรือทับกัน
const WANDER = 0.16            // แรงดันไปตามทิศประจำตัว (px/tick²) — เบามาก เอาแค่ให้ไหลไม่หยุด
const TURN = 0.06              // ทิศหมุนได้มากสุดกี่เรเดียนต่อเฟรม — ยิ่งน้อยยิ่งลอยเป็นเส้นยาว
const VELOCITY_DECAY = 0.45    // หน่วงมากกว่าค่าปกติ = ทุกอย่างเคลื่อนช้าๆ ทั้งตอนจัดเรียงและตอนลอย
const HALO = 1.18              // รัศมีวงเรืองแสงรอบนอก เทียบกับตัวฟอง

// 3 สีขอบ — **ยังสุ่มอยู่ (ชั่วคราว)** เพราะยังไม่มีตัวเลข +/- ให้ใช้จริง
// พอมีตาราง snapshot คะแนนรายวันแล้ว ให้เปลี่ยน toneOf() มาอ่านผลต่างแทน: ขึ้น=up ลง=down เท่าเดิม=flat
const TONES = {
  up:   '#2fbf6b',             // เขียว — คะแนนขึ้น
  down: '#df492e',             // แดง (red-accent ของแบรนด์) — คะแนนลง
  flat: '#ff6a13',             // ส้มแบรนด์ — ทรงตัว
}
// สัดส่วนที่ user เคาะ 2026-09-06: เขียว 70% · แดง 10% · ส้ม 20%
// สุ่มจาก id ไม่ใช่ Math.random() — ต้องได้สีเดิมทุกครั้งที่จัดผังใหม่ (ย่อจอ/หมุนจอ) ไม่งั้นสีกะพริบทั้งกระดาน
function toneOf(id) {
  const s = String(id)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  const bucket = h % 100
  if (bucket < 70) return TONES.up
  if (bucket < 80) return TONES.down
  return TONES.flat
}

// ระยะห่างระหว่างฟอง — สุ่มต่อคนแต่มีเพดาน (5–14px) ให้ดูมีจังหวะแบบ cryptobubbles
// ไม่ใช่อัดชนกันหมดเหมือนลูกโป่งในถุง · สุ่มจาก id เหมือนสี จะได้ไม่ขยับใหม่ตอนย่อจอ
const PAD_MIN = 5
const PAD_SPREAD = 10
function padOf(id) {
  const s = String(id)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0
  return PAD_MIN + (h % PAD_SPREAD)
}

const gradId = id => `ocb-g${String(id).slice(-10)}`

export default function OrgChartBubbles({ cardClass = '', days = null, blurAvatars = false }) {
  const t = useTranslations('bot.orgchart')
  const [members, setMembers] = useState(null)
  const [error, setError] = useState(null)

  const boxRef = useRef(null)
  const svgRef = useRef(null)
  const tipRef = useRef(null)
  const simRef = useRef(null)
  const nodesRef = useRef([])
  const sizeRef = useRef({ w: 0, h: 0 })
  const dragRef = useRef(null)
  const startRef = useRef(Date.now())
  const calmRef = useRef(false)   // prefers-reduced-motion → นิ่งสนิทหลังจัดที่เสร็จ

  const load = useCallback(() => {
    setError(null); setMembers(null)
    const limit = window.innerWidth < 640 ? LIMIT_MOBILE : LIMIT_DESKTOP
    fetch(`/api/bot/orgchart/ranking?limit=${limit}${days ? `&days=${days}` : ''}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) setMembers(d.members || []); else setError(d.error || t('loadFailed')) })
      .catch(() => setError(t('loadFailed')))
  }, [t, days])

  useEffect(() => {
    load()
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
  }, [load])

  useEffect(() => {
    calmRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false
  }, [])

  // ── วาด + จัดแรง ────────────────────────────────────────────────────────────
  const build = useCallback(() => {
    const svg = svgRef.current, box = boxRef.current
    if (!svg || !box || !members?.length) return
    const rect = box.getBoundingClientRect()
    const w = Math.max(240, rect.width), h = Math.max(240, rect.height)
    sizeRef.current = { w, h }
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)

    // รัศมีจากรากที่สองของคะแนน (พื้นที่วงกลม ∝ คะแนน) แล้วสเกลให้ทุกใบรวมกันพอดีกรอบ
    const top = members[0]?.score || 1
    const roots = members.map(m => Math.sqrt(m.score / top))
    const sumSq = roots.reduce((a, v) => a + v * v, 0) || 1
    const k = Math.sqrt((FILL_AREA * w * h) / (Math.PI * sumSq))
    const radii = roots.map(v => Math.max(R_MIN, Math.min(R_MAX, v * k)))

    const prev = new Map(nodesRef.current.map(n => [n.discordId, n]))
    const nodes = members.map((m, i) => {
      const old = prev.get(m.discordId)
      return {
        ...m, r: radii[i], pad: padOf(m.discordId), name: m.name || t('unknownMember'),
        // ทิศล่องลอยประจำตัว — สุ่มตอนสร้าง แล้วค่อยๆ หมุนเองทุกเฟรม
        head: Math.random() * Math.PI * 2,
        // จัดที่ใหม่ = เริ่มจากตำแหน่งเดิมถ้าเคยมี ไม่งั้นกระจายเป็นวงจากกลาง (ใบใหญ่อยู่ใน)
        x: old?.x ?? w / 2 + Math.cos(i * 2.399) * (40 + i * 3),
        y: old?.y ?? h / 2 + Math.sin(i * 2.399) * (40 + i * 3),
      }
    })
    nodesRef.current = nodes

    // มิติของฟองมาจาก gradient ล้วน — ไม่ใช้ filter/drop-shadow เพราะ 100 ใบที่ขยับตลอดจะ repaint ทุกเฟรม
    // ไส้กลางโปร่ง (พื้นการ์ดทะลุขึ้นมา) → ขอบอิ่มสี + วงเรืองแสงรอบนอกที่จางหายไป
    svg.innerHTML = ''
    const defs = el('defs', {})
    for (const n of nodes) {
      const tier = Math.min(1, Math.sqrt(n.score / (nodes[0].score || n.score)))
      const c = toneOf(n.discordId)
      const body = el('radialGradient', { id: gradId(n.discordId), cx: '50%', cy: '50%', r: '50%' })
      // สีต้องกองอยู่ที่ขอบ ไส้กลางแทบใส — ไล่เนียนทั้งใบจะออกมาเป็นแผ่นกลมทึบ ไม่มีมิติ
      body.innerHTML =
        `<stop offset="0%" stop-color="${c}" stop-opacity="${(0.02 + 0.03 * tier).toFixed(3)}"/>`
        + `<stop offset="62%" stop-color="${c}" stop-opacity="${(0.04 + 0.06 * tier).toFixed(3)}"/>`
        + `<stop offset="86%" stop-color="${c}" stop-opacity="${(0.14 + 0.2 * tier).toFixed(3)}"/>`
        + `<stop offset="97%" stop-color="${c}" stop-opacity="${(0.5 + 0.35 * tier).toFixed(3)}"/>`
        + `<stop offset="100%" stop-color="${c}" stop-opacity="${(0.62 + 0.35 * tier).toFixed(3)}"/>`
      defs.appendChild(body)
      const halo = el('radialGradient', { id: `${gradId(n.discordId)}-h`, cx: '50%', cy: '50%', r: '50%' })
      halo.innerHTML =
        `<stop offset="0%" stop-color="${c}" stop-opacity="0"/>`
        + `<stop offset="${(100 / HALO).toFixed(1)}%" stop-color="${c}" stop-opacity="${(0.1 + 0.22 * tier).toFixed(3)}"/>`
        + `<stop offset="100%" stop-color="${c}" stop-opacity="0"/>`
      defs.appendChild(halo)
      n._tier = tier
      n._tone = c
    }
    svg.appendChild(defs)
    for (const n of nodes) drawBubble(svg, n)

    simRef.current?.stop()
    // ดูดแนวตั้งแรงกว่าแนวนอน — แรงเท่ากันจะได้กองกลมกลางจอ เหลือขอบซ้ายขวาว่างทั้งแถบ
    const sim = forceSimulation(nodes)
      .force('x', forceX(w / 2).strength(0.012))
      .force('y', forceY(h / 2).strength(0.045))
      .force('collide', forceCollide(d => d.r + d.pad).iterations(2))
      .alphaDecay(0.02)
      .velocityDecay(VELOCITY_DECAY)
      .on('tick', () => {
        const { w: bw, h: bh } = sizeRef.current
        // ⛔ ห้ามมีเงื่อนไขไหนทำให้ wander เป็น 0 หรือช้าลงอีก — เคยผูกไว้กับ prefers-reduced-motion
        //    แล้ว user เจอ "โหลดมาขยับสวย พอเข้าที่แล้วตายนิ่ง" ทั้งที่เครื่องผมวัดว่ายังขยับ (ทัก 3 รอบ)
        //    ความเร็วเท่ากันทุกเครื่อง · ถ้าจะให้หยุดได้ ต้องเป็นปุ่มในหน้าที่ user กดเอง ไม่ใช่เดาจากค่าระบบ
        const wander = WANDER
        for (const n of nodes) {
          if (wander && n.fx == null) {
            n.head += (Math.random() - 0.5) * TURN
            n.vx += Math.cos(n.head) * wander
            n.vy += Math.sin(n.head) * wander
          }
          // กันหลุดกรอบ — ไม่มี wall force ใน d3 ต้อง clamp เอง · เผื่อวงเรืองแสงด้วย ไม่งั้นแสงโดนขอบตัด
          const pad = n.r * HALO
          n.x = Math.max(pad, Math.min(bw - pad, n.x))
          n.y = Math.max(pad, Math.min(bh - pad, n.y))
          n._g?.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`)
        }
      })
    // alphaTarget > alphaMin = ตัวจับเวลาของ d3 ไม่มีวันหยุดเอง — ต้องตั้งเสมอ ไม่มีเงื่อนไข
    sim.alphaTarget(IDLE_ALPHA)
    // เริ่มที่พลังงานต่ำ — alpha 1 ทำให้ฟองพุ่งเข้าที่แบบสะบัด ดูรีบร้อน
    sim.alpha(0.45).restart()
    simRef.current = sim
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members])

  useEffect(() => {
    build()
    return () => { simRef.current?.stop(); simRef.current = null }
  }, [build])

  // กรอบเปลี่ยนขนาด (ย่อหน้าต่าง/หมุนจอ) → คำนวณรัศมีกับจุดศูนย์กลางใหม่
  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    let timer = null
    const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(build, 200) })
    ro.observe(box)
    return () => { clearTimeout(timer); ro.disconnect() }
  }, [build])

  // ยามเฝ้า — ไม่ว่าอะไรจะทำให้ simulation หยุด (เบราว์เซอร์หน่วง แท็บสลับ ค่าเพี้ยน) ปลุกกลับมาเสมอ
  // ราคาถูกมาก: เช็คตัวเลขตัวเดียวทุก 4 วินาที · หน้านี้ต้องลอยตลอดเวลาเป็นข้อกำหนดของ user
  useEffect(() => {
    const id = setInterval(() => {
      const sim = simRef.current
      if (!sim || document.hidden) return
      if (sim.alpha() < IDLE_ALPHA * 0.95) sim.alphaTarget(IDLE_ALPHA).restart()
    }, 4000)
    return () => clearInterval(id)
  }, [])

  // แท็บไม่ได้ดูอยู่ = หยุดคำนวณ ไม่กินแบตฟรี
  useEffect(() => {
    const onVis = () => {
      const sim = simRef.current
      if (!sim) return
      if (document.hidden) sim.stop()
      else sim.alphaTarget(IDLE_ALPHA).restart()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  function drawBubble(svg, n) {
    const t01 = n._tier ?? 0.5
    const g = el('g', {
      class: 'ocb-node', transform: `translate(${n.x} ${n.y})`,
      tabindex: '0', role: 'button',
      'aria-label': `${t('rankLabel', { rank: n.rank })} ${n.name} ${t('scoreLabel', { score: fmtInt(n.score) })}`,
    })
    // 3 ชั้น: วงเรืองแสงรอบนอก → ตัวฟอง (ไล่สีจากไส้โปร่งไปขอบอิ่ม) → ขอบคม
    g.appendChild(el('circle', { class: 'ocb-halo', r: n.r * HALO, fill: `url(#${gradId(n.discordId)}-h)` }))
    g.appendChild(el('circle', { class: 'ocb-fill', r: n.r, fill: `url(#${gradId(n.discordId)})` }))
    // ผ่าน custom property ไม่ใช่ stroke ตรงๆ — inline style ชนะ stylesheet เสมอ ใส่ตรงๆ แล้ว :hover จะตาย
    const tone = n._tone || TONES.flat
    g.appendChild(el('circle', {
      class: 'ocb-ring', r: n.r,
      style: `--ring: ${tone}; --ring-o: ${(0.5 + 0.45 * t01).toFixed(2)}; --rw: ${(1 + 1.6 * t01).toFixed(2)}px`,
    }))

    const big = n.r >= 34, mid = n.r >= 23
    const avaR = big ? n.r * 0.36 : mid ? n.r * 0.46 : n.r * 0.62
    const avaY = big ? -n.r * 0.34 : mid ? -n.r * 0.22 : 0
    const ava = el('g', { transform: `translate(0 ${avaY})` })
    ava.innerHTML = avatarMarkup(n.name, avaR, n.avatar, n.discordId)
    g.appendChild(ava)

    if (big) {
      const fs = Math.max(10, Math.min(19, n.r * 0.27))
      const max = Math.max(4, Math.floor((n.r * 1.7) / (fs * 0.56)))
      const name = n.name.length > max ? `${n.name.slice(0, max - 1)}…` : n.name
      const label = el('text', { class: 'ocb-name', y: n.r * 0.24, 'text-anchor': 'middle', 'font-size': fs })
      label.textContent = name
      g.appendChild(label)
    }
    if (mid) {
      const fs = big ? Math.max(9, Math.min(12, n.r * 0.2)) : Math.max(8.5, n.r * 0.3)
      const rank = el('text', {
        class: 'ocb-rank', y: big ? n.r * 0.24 + fs * 1.35 : n.r * 0.62,
        'text-anchor': 'middle', 'font-size': fs, fill: tone,
      })
      rank.textContent = `#${n.rank}`
      g.appendChild(rank)
    }

    g.addEventListener('pointerenter', e => showTip(n, e))
    g.addEventListener('pointermove', moveTip)
    g.addEventListener('pointerleave', hideTip)
    g.addEventListener('focus', () => showTipAt(n, g))
    g.addEventListener('blur', hideTip)
    g.addEventListener('pointerdown', e => startDrag(n, e))
    svg.appendChild(g)
    n._g = g
  }

  // ── ลากฟอง ─────────────────────────────────────────────────────────────────
  function toUnits(e) {
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const { w, h } = sizeRef.current
    return { x: (e.clientX - rect.left) * (w / rect.width), y: (e.clientY - rect.top) * (h / rect.height) }
  }

  function startDrag(n, e) {
    const svg = svgRef.current
    if (!svg) return
    e.preventDefault()
    const p = toUnits(e)
    dragRef.current = { n, dx: n.x - p.x, dy: n.y - p.y, id: e.pointerId }
    n.fx = n.x; n.fy = n.y
    n._g?.classList.add('is-dragging')
    svg.setPointerCapture?.(e.pointerId)
    simRef.current?.alphaTarget(DRAG_ALPHA).restart()
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onMove = e => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.id) return
      const p = toUnits(e)
      d.n.fx = p.x + d.dx; d.n.fy = p.y + d.dy
      moveTip(e)
    }
    const onUp = e => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.id) return
      d.n.fx = null; d.n.fy = null
      d.n._g?.classList.remove('is-dragging')
      dragRef.current = null
      svg.releasePointerCapture?.(e.pointerId)
      simRef.current?.alphaTarget(IDLE_ALPHA)   // ปล่อยฟองแล้วต้องลอยต่อเสมอ ไม่ตกลงเป็น 0
    }
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerup', onUp)
    svg.addEventListener('pointercancel', onUp)
    return () => {
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
      svg.removeEventListener('pointercancel', onUp)
    }
  }, [members])

  // ── ป้ายคะแนนตอนชี้ ────────────────────────────────────────────────────────
  function tipHtml(n) {
    const esc = v => String(v).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const row = (label, val) => `<div class="oc-tip-row"><span>${label}</span><b>${val}</b></div>`
    return `<div class="oc-tip-title">${esc(n.name)}</div>`
      + row(t('rankLabel', { rank: n.rank }), fmtInt(n.score))
      + row('💬', fmtInt(n.messages))
      + row('🔊', fmtVoice(n.voiceSeconds))
      + row('📣', fmtInt(n.mentions))
  }
  function placeTip(x, y) {
    const tip = tipRef.current
    if (!tip) return
    const r = tip.getBoundingClientRect()
    const left = Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8)
    const top = Math.min(Math.max(8, y + 14), window.innerHeight - r.height - 8)
    tip.style.transform = `translate(${left}px, ${top}px)`
  }
  function showTip(n, e) {
    const tip = tipRef.current
    if (!tip) return
    tip.innerHTML = tipHtml(n)
    tip.classList.add('is-on')
    placeTip(e.clientX, e.clientY)
  }
  function showTipAt(n, g) {
    const tip = tipRef.current
    if (!tip) return
    tip.innerHTML = tipHtml(n)
    tip.classList.add('is-on')
    const r = g.getBoundingClientRect()
    placeTip(r.left + r.width / 2, r.bottom)
  }
  function moveTip(e) { placeTip(e.clientX, e.clientY) }
  function hideTip() { tipRef.current?.classList.remove('is-on') }

  if (error) return <div className={`${cardClass} p-8 text-center text-sm text-warm-500 dark:text-disc-muted`}>{error}</div>
  if (!members) {
    return (
      <div className={`${cardClass} p-8 flex items-center justify-center gap-2 text-warm-500 dark:text-disc-muted text-sm`}>
        <Loader2 size={16} className="animate-spin" /> {t('loading')}
      </div>
    )
  }
  if (!members.length) {
    return <div className={`${cardClass} p-8 text-center text-sm text-warm-500 dark:text-disc-muted`}>{t('bubbleEmpty')}</div>
  }

  return (
    <div className={`${cardClass} relative p-2`}>
      <style jsx global>{`
        .ocb-canvas { touch-action: none; display: block; }
        /* เบลอเฉพาะรูปจริง — วงกลมสีที่เป็น placeholder ไม่มีอะไรให้ปิดบัง */
        .ocb-canvas.is-blur image { filter: blur(3.5px); }
        .ocb-node { cursor: grab; }
        .ocb-node.is-dragging { cursor: grabbing; }
        .ocb-halo { pointer-events: none; }
        .ocb-ring { fill: none; stroke: var(--ring, #ff6a13); stroke-opacity: var(--ring-o, .6); stroke-width: var(--rw, 1.5px); }
        .ocb-node:hover .ocb-ring { stroke-opacity: 1; stroke-width: 3px; }
        .ocb-name { fill: currentColor; font-weight: 800; }
        .ocb-rank { opacity: .9; font-weight: 700; font-variant-numeric: tabular-nums; }
        .ocb-node:focus-visible { outline: 2px solid var(--brand-orange, #ff6a13); outline-offset: 2px; }
      `}</style>
      <div ref={boxRef} className="w-full h-[calc(100vh-285px)] min-h-[440px]">
        <svg ref={svgRef} className={`ocb-canvas w-full h-full text-warm-900 dark:text-disc-text ${blurAvatars ? 'is-blur' : ''}`}
          role="img" aria-label={t('viewBubble')} />
      </div>
      <div ref={tipRef} className="oc-tip" role="tooltip" aria-hidden="true" />
      <p className="pointer-events-none absolute inset-x-3 bottom-3 hidden md:block text-xs text-warm-500 dark:text-disc-muted">
        {t('bubbleHint', { n: members.length })}
      </p>
    </div>
  )
}
