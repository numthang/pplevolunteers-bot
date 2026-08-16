'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Search, RotateCcw, ChevronLeft, Loader2 } from 'lucide-react'

// ผังทีมแบบเครือข่ายวงกลม — เวอร์ชันเว็บของ /orgchart (ดิสคอร์ด)
//
// ทำไมเป็น drill-down 2 ชั้น ไม่ใช่กางทุก role ทีเดียว: guild จริงมี 138 role
// (81 role อยู่ในทีมจังหวัดกลุ่มเดียว) — กางหมดพร้อมกันอ่านไม่ออก
// หน้าแรก = hub + กลุ่ม, คลิกกลุ่ม → เห็นเฉพาะ role ในกลุ่มนั้น
//
// layout ใช้ physics relaxation เล็กๆ เขียนเอง (repulsion + spring + วงแหวนรอบ hub)
// ไม่ใช้ lib: recharts ที่โปรเจกต์มีอยู่ไม่มี graph/force layout ให้ใช้
// วาด SVG ด้วยมือผ่าน ref แทน React state ต่อโหนด — ตอนลากต้องขยับ 60fps
// ถ้า re-render ทั้ง tree ทุก pointermove จะกระตุก

const GROUP_ORDER = ['main', 'skill', 'region', 'province', 'district', 'other']
const GROUP_EMOJI = { main: '🌟', skill: '🛠️', region: '🗺️', province: '📍', district: '🏘️', other: '🗂️' }
// สีตามกลุ่ม — ผ่าน validator ของ dataviz (CVD + contrast) ทั้ง light/dark
const GROUP_COLOR = {
  main:     { light: '#ff6a13', dark: '#e6620f' },
  skill:    { light: '#189f74', dark: '#199e70' },
  region:   { light: '#2a78d6', dark: '#3987e5' },
  province: { light: '#e0699a', dark: '#d55181' },
  district: { light: '#d99400', dark: '#c98500' },
  other:    { light: '#a9a69c', dark: '#7f7d78' },
}
const DAYS_OPTIONS = [30, 60, 90, 180, 365]
const AVATAR_BG = ['#5865F2', '#57A55A', '#EAA83A', '#D8548A', '#DA4B48', '#7C6FE0', '#1F9AA0', '#E8804A']

const HUB_R = 38
const NODE_R = [16, 34]
const NS = 'http://www.w3.org/2000/svg'

function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h }
function el(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e }
function fmtInt(n) { return Number(n || 0).toLocaleString('th-TH') }
function fmtVoice(sec) {
  if (!sec) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}
function scaleR(v, all) {
  const nums = all.length ? all : [0]
  const min = Math.min(...nums), max = Math.max(...nums)
  const t = max > min ? (v - min) / (max - min) : 0.5
  return NODE_R[0] + (NODE_R[1] - NODE_R[0]) * Math.sqrt(t)
}

// avatar ของ Discord ถูกบล็อกด้วย CSP ของ next/image ไม่ได้ตั้ง remotePatterns ไว้
// → วาดวงกลมสีจากชื่อ (deterministic) แทน ให้ยังแยกคนออกจากกันได้ด้วยสี+ตัวอักษร
function avatarMarkup(name, r) {
  const seed = hash(name || '?')
  const bg = AVATAR_BG[seed % AVATAR_BG.length]
  const clipId = `oc-clip-${seed}-${Math.round(r * 10)}`
  return `
    <clipPath id="${clipId}"><circle r="${r}"/></clipPath>
    <g clip-path="url(#${clipId})">
      <circle r="${r}" fill="${bg}"/>
      <circle cy="${-r * 0.14}" r="${r * 0.33}" fill="#fff" opacity="0.94"/>
      <ellipse cy="${r * 0.68}" rx="${r * 0.56}" ry="${r * 0.5}" fill="#fff" opacity="0.94"/>
    </g>
    <circle class="oc-avatar-border" r="${r}"/>`
}

function pillNode(topY, { title, sub, bg, titleColor, subColor }) {
  const w = Math.max(48, Math.max(title.length * 7.3, sub ? sub.length * 6.1 : 0) + 24)
  const h = sub ? 34 : 23
  const g = el('g', {})
  g.appendChild(el('rect', { class: 'oc-pill', x: -w / 2, y: topY, width: w, height: h, rx: sub ? 9 : h / 2, fill: bg }))
  if (sub) {
    const t1 = el('text', { y: topY + 14.5, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 700, fill: titleColor })
    t1.textContent = title; g.appendChild(t1)
    const t2 = el('text', { y: topY + 27, 'text-anchor': 'middle', 'font-size': 8.6, 'font-weight': 600, fill: subColor })
    t2.textContent = sub; g.appendChild(t2)
  } else {
    const t = el('text', { y: topY + h / 2 + 3.8, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 800, fill: titleColor })
    t.textContent = title; g.appendChild(t)
  }
  return g
}

// วาง node เป็นวงรอบ hub แล้วคลายด้วย physics — deterministic (ไม่มี Math.random)
// ผลลัพธ์จึงเหมือนเดิมทุกครั้งที่โหลด ผู้ใช้จำผังได้
function layoutNodes(items, seedKey) {
  const n = items.length
  const ringR = Math.max(150, 42 * Math.sqrt(n) + 90)
  const nodes = items.map((item, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2
    const jitter = ((hash(seedKey + item.id) % 100) / 100 - 0.5) * 46
    return { ...item, x: Math.cos(a) * (ringR + jitter), y: Math.sin(a) * (ringR + jitter) }
  })

  let step = 1
  for (let it = 0; it < 340; it++) {
    const disp = nodes.map(() => ({ x: 0, y: 0 }))
    for (let i = 0; i < nodes.length; i++) {
      // ผลักกันเองไม่ให้ทับ (รวมเผื่อที่ของป้ายใต้โหนด)
      for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i], B = nodes[j]
        const dx = A.x - B.x, dy = A.y - B.y
        const d = Math.hypot(dx, dy) || 0.01
        const minD = A.r + B.r + 52
        if (d < minD * 2.4) {
          const f = (2400 * (A.r + B.r)) / (d * d)
          disp[i].x += (dx / d) * f; disp[i].y += (dy / d) * f
          disp[j].x -= (dx / d) * f; disp[j].y -= (dy / d) * f
        }
      }
      // สปริงดึงกลับวงแหวนรอบ hub (แทนเส้นเชื่อม hub→node)
      const A = nodes[i]
      const d = Math.hypot(A.x, A.y) || 0.01
      const want = HUB_R + A.r + ringR * 0.42
      const pull = (d - want) * 0.05
      disp[i].x -= (A.x / d) * pull; disp[i].y -= (A.y / d) * pull
    }
    nodes.forEach((nd, i) => {
      nd.x += Math.max(-14, Math.min(14, disp[i].x)) * step
      nd.y += Math.max(-14, Math.min(14, disp[i].y)) * step
    })
    step *= 0.985
  }
  return nodes
}

export default function OrgChartClient() {
  const t = useTranslations('bot.orgchart')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(180)
  const [openGroup, setOpenGroup] = useState(null)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState('chart')
  const [isDark, setIsDark] = useState(false)

  const svgRef = useRef(null)
  const nodesRef = useRef([])
  const dragRef = useRef(null)

  // อ่านโหมดสีจาก class บน <html> (darkMode: 'class' ใน tailwind.config.js)
  useEffect(() => {
    const read = () => setIsDark(document.documentElement.classList.contains('dark'))
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  const load = useCallback(() => {
    setLoading(true); setError(null)
    fetch(`/api/bot/orgchart?days=${days}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) setData(d); else setError(d.error || t('loadFailed')) })
      .catch(() => setError(t('loadFailed')))
      .finally(() => setLoading(false))
  }, [days, t])

  useEffect(() => {
    load()
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
  }, [load])

  const colorOf = useCallback(g => GROUP_COLOR[g]?.[isDark ? 'dark' : 'light'] || GROUP_COLOR.other[isDark ? 'dark' : 'light'], [isDark])

  const groups = useMemo(() => {
    const list = data?.groups || []
    return [...list].sort((a, b) => GROUP_ORDER.indexOf(a.groupName) - GROUP_ORDER.indexOf(b.groupName))
  }, [data])

  const activeGroup = useMemo(
    () => (openGroup ? groups.find(g => g.groupName === openGroup) : null),
    [groups, openGroup]
  )

  // items ที่จะวาดตอนนี้ — ชั้นกลุ่ม หรือชั้น role ในกลุ่มที่เปิดอยู่
  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (activeGroup) {
      const roles = activeGroup.roles.filter(r => !q || r.roleName.toLowerCase().includes(q))
      const scores = roles.map(r => r.totalScore)
      return roles.map(r => ({
        kind: 'role', id: r.roleId, label: r.roleName, group: activeGroup.groupName,
        r: scaleR(r.totalScore, scores), role: r,
      }))
    }
    const scores = groups.map(g => g.roles.reduce((s, r) => s + r.totalScore, 0))
    return groups
      .filter(g => !q || (t(`groups.${g.groupName}`) || g.groupName).toLowerCase().includes(q))
      .map((g, i) => ({
        kind: 'group', id: g.groupName, label: t(`groups.${g.groupName}`), group: g.groupName,
        r: scaleR(scores[i], scores), groupData: g,
      }))
  }, [activeGroup, groups, query, t])

  const layoutKey = `${data?.guildId || ''}:${openGroup || 'root'}:${items.length}`

  // ตำแหน่งที่ผู้ใช้ลากเอง — เก็บเฉพาะเบราว์เซอร์นี้ (ไม่ใช่ผังกลางขององค์กร)
  const storageKey = useMemo(
    () => (data?.guildId ? `orgchart-pos:${data.guildId}:${openGroup || 'root'}` : null),
    [data?.guildId, openGroup]
  )

  useEffect(() => {
    if (!items.length) { nodesRef.current = []; return }
    const nodes = layoutNodes(items, layoutKey)
    if (storageKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
        nodes.forEach(n => { if (saved[n.id]) { n.x = saved[n.id].x; n.y = saved[n.id].y } })
      } catch { /* ค่าที่เก็บไว้เสีย → ใช้ผังที่คำนวณใหม่ */ }
    }
    nodesRef.current = nodes
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, storageKey, isDark, selected, days])

  function savePositions() {
    if (!storageKey) return
    const out = {}
    nodesRef.current.forEach(n => { out[n.id] = { x: Math.round(n.x), y: Math.round(n.y) } })
    try { localStorage.setItem(storageKey, JSON.stringify(out)) } catch { /* โควตาเต็ม — ไม่ critical */ }
  }

  function resetLayout() {
    if (storageKey) { try { localStorage.removeItem(storageKey) } catch { /* ไม่มีอะไรให้ลบ */ } }
    nodesRef.current = layoutNodes(items, layoutKey)
    draw()
  }

  // ===== วาดทั้ง svg =====
  function draw() {
    const svg = svgRef.current
    if (!svg) return
    const nodes = nodesRef.current
    svg.innerHTML = ''

    let minX = -HUB_R, maxX = HUB_R, minY = -HUB_R, maxY = HUB_R
    nodes.forEach(n => {
      minX = Math.min(minX, n.x - n.r - 60); maxX = Math.max(maxX, n.x + n.r + 60)
      minY = Math.min(minY, n.y - n.r); maxY = Math.max(maxY, n.y + n.r + 50)
    })
    const pad = 40
    svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`)

    const edgeLayer = el('g', {})
    svg.appendChild(edgeLayer)

    nodes.forEach(n => {
      const line = el('line', { class: 'oc-edge' })
      edgeLayer.appendChild(line)
      n._line = line
    })
    positionEdges()

    // hub
    const hub = el('g', { class: 'oc-node', tabindex: '0', role: 'button' })
    hub.appendChild(el('circle', { r: HUB_R, class: 'oc-hub' }))
    const hubT = el('text', { y: activeGroup ? -2 : 4, class: 'oc-hub-text', 'text-anchor': 'middle' })
    hubT.textContent = activeGroup ? t(`groups.${activeGroup.groupName}`) : t('orgHub')
    hub.appendChild(hubT)
    if (activeGroup) {
      const hubS = el('text', { y: 12, class: 'oc-hub-sub', 'text-anchor': 'middle' })
      hubS.textContent = t('backToGroups')
      hub.appendChild(hubS)
      hub.addEventListener('click', () => { setOpenGroup(null); setSelected(null) })
    }
    svg.appendChild(hub)

    nodes.forEach(n => {
      const color = colorOf(n.group)
      const isSel = selected?.roleId === n.id
      const wrap = el('g', {
        class: `oc-node${isSel ? ' is-selected' : ''}`,
        transform: `translate(${n.x} ${n.y})`,
        tabindex: '0', role: 'button', 'aria-label': n.label,
      })

      if (n.kind === 'group') {
        wrap.appendChild(el('circle', { r: n.r, fill: color, class: 'oc-fill' }))
        const emo = el('text', { y: n.r * 0.14, 'text-anchor': 'middle', 'font-size': n.r * 0.85 })
        emo.textContent = GROUP_EMOJI[n.group] || '📋'
        wrap.appendChild(emo)
        wrap.appendChild(pillNode(n.r + 12, { title: n.label, bg: color, titleColor: '#fff' }))
      } else {
        const top1 = n.role.top[0]
        wrap.innerHTML = avatarMarkup(top1?.name || n.label, n.r)
        wrap.appendChild(el('circle', { r: n.r, class: 'oc-sel-ring' }))
        wrap.appendChild(pillNode(n.r + 10, {
          title: n.label,
          sub: top1 ? `🔥 ${top1.name}` : t('noActivity'),
          bg: `color-mix(in srgb, ${color} 16%, var(--card-bg))`,
          titleColor: 'currentColor', subColor: 'currentColor',
        }))
        wrap.classList.add('oc-role-node')
      }

      attachDrag(wrap, n)
      svg.appendChild(wrap)
      n._g = wrap
    })
  }

  function positionEdges() {
    nodesRef.current.forEach(n => {
      if (!n._line) return
      const d = Math.hypot(n.x, n.y) || 1
      const ux = n.x / d, uy = n.y / d
      n._line.setAttribute('x1', ux * (HUB_R + 2))
      n._line.setAttribute('y1', uy * (HUB_R + 2))
      n._line.setAttribute('x2', n.x - ux * (n.r + 2))
      n._line.setAttribute('y2', n.y - uy * (n.r + 2))
    })
  }

  // ลากโหนด — ขยับ DOM ตรงๆ ไม่ผ่าน React state (ต้องลื่นระดับ 60fps)
  // แยกลากออกจากคลิกด้วยระยะ 4px: ขยับน้อยกว่านั้นถือว่าเป็นคลิก
  function attachDrag(g, node) {
    g.addEventListener('pointerdown', e => {
      if (e.button !== 0) return
      const svg = svgRef.current
      const pt = clientToSvg(svg, e.clientX, e.clientY)
      dragRef.current = { node, dx: node.x - pt.x, dy: node.y - pt.y, moved: 0 }
      g.setPointerCapture(e.pointerId)
      g.classList.add('is-dragging')
      e.preventDefault()
    })
    g.addEventListener('pointermove', e => {
      const drag = dragRef.current
      if (!drag || drag.node !== node) return
      const pt = clientToSvg(svgRef.current, e.clientX, e.clientY)
      const nx = pt.x + drag.dx, ny = pt.y + drag.dy
      drag.moved += Math.hypot(nx - node.x, ny - node.y)
      node.x = nx; node.y = ny
      g.setAttribute('transform', `translate(${nx} ${ny})`)
      positionEdges()
    })
    const end = e => {
      const drag = dragRef.current
      if (!drag || drag.node !== node) return
      dragRef.current = null
      g.classList.remove('is-dragging')
      if (g.hasPointerCapture?.(e.pointerId)) g.releasePointerCapture(e.pointerId)
      if (drag.moved < 4) onNodeClick(node)
      else savePositions()
    }
    g.addEventListener('pointerup', end)
    g.addEventListener('pointercancel', end)
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNodeClick(node) }
    })
  }

  function clientToSvg(svg, cx, cy) {
    const pt = svg.createSVGPoint()
    pt.x = cx; pt.y = cy
    return pt.matrixTransform(svg.getScreenCTM().inverse())
  }

  function onNodeClick(node) {
    if (node.kind === 'group') { setOpenGroup(node.group); setSelected(null) }
    else setSelected(node.role)
  }

  const tableRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = []
    for (const g of groups) {
      for (const role of g.roles) {
        if (q && !role.roleName.toLowerCase().includes(q)) continue
        if (activeGroup && g.groupName !== activeGroup.groupName) continue
        rows.push({ group: g.groupName, role })
      }
    }
    return rows.sort((a, b) => b.role.totalScore - a.role.totalScore)
  }, [groups, query, activeGroup])

  const CARD = 'rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg'

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-warm-500 dark:text-disc-muted text-sm`}>
        <Loader2 size={16} className="animate-spin" /> {t('loading')}
      </div>
    )
  }
  if (error) return <div className={`${CARD} p-8 text-center text-sm text-warm-500 dark:text-disc-muted`}>{error}</div>
  if (!groups.length) {
    return (
      <div className={`${CARD} p-8 text-center`}>
        <p className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('empty')}</p>
        <p className="mt-2 text-sm text-warm-500 dark:text-disc-muted">{t('emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <style jsx global>{`
        .oc-edge { stroke: #b9b3a5; stroke-width: 1.5; }
        .dark .oc-edge { stroke: #5c5b56; }
        .oc-node { cursor: pointer; }
        .oc-node.is-dragging { cursor: grabbing; }
        .oc-avatar-border { fill: none; stroke: var(--card-bg); stroke-width: 2.5; }
        .oc-sel-ring { fill: none; stroke: currentColor; stroke-width: 2.5; opacity: 0; }
        .oc-node.is-selected .oc-sel-ring { opacity: 1; }
        .oc-fill, .oc-pill { transition: filter .12s ease; }
        .oc-node:hover .oc-fill, .oc-node:hover .oc-pill { filter: brightness(1.07); }
        .oc-hub { fill: #0b2b45; }
        .dark .oc-hub { fill: #14395a; }
        .oc-hub-text { fill: #fdf8f2; font-size: 12px; font-weight: 800; }
        .oc-hub-sub { fill: #fdf8f2; opacity: .7; font-size: 8px; font-weight: 700; }
        .oc-node:focus-visible { outline: 2px solid var(--brand-orange); outline-offset: 2px; }
      `}</style>

      <div>
        <h1 className="text-xl font-bold text-warm-900 dark:text-disc-text">{t('title')}</h1>
        <p className="mt-1 text-sm text-warm-500 dark:text-disc-muted">{t('subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className={`${CARD} flex items-center gap-2 px-3 py-2 flex-1 min-w-[200px] max-w-xs`}>
          <Search size={14} className="text-warm-400 dark:text-disc-muted shrink-0" />
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder={t('searchPlaceholder')}
            className="w-full bg-transparent text-sm text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none"
          />
        </div>

        <div className={`${CARD} flex gap-0.5 p-1`}>
          {DAYS_OPTIONS.map(d => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg tabular-nums ${
                d === days ? 'bg-orange text-white' : 'text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
              }`}>
              {d}
            </button>
          ))}
        </div>

        <div className={`${CARD} flex gap-0.5 p-1 ml-auto`}>
          {['chart', 'table'].map(v => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                v === view ? 'bg-warm-900 dark:bg-disc-text text-white dark:text-disc-bg2' : 'text-warm-500 dark:text-disc-muted'
              }`}>
              {v === 'chart' ? t('viewNetwork') : t('viewTable')}
            </button>
          ))}
        </div>
      </div>

      {activeGroup && (
        <div className="flex items-center gap-2 -mb-1">
          <button type="button" onClick={() => { setOpenGroup(null); setSelected(null) }}
            className="flex items-center gap-1 text-sm font-medium text-orange hover:opacity-80">
            <ChevronLeft size={15} /> {t('backToGroups')}
          </button>
          <span className="text-sm text-warm-500 dark:text-disc-muted">
            {GROUP_EMOJI[activeGroup.groupName]} {t(`groups.${activeGroup.groupName}`)} ·{' '}
            {t('roleCount', { count: activeGroup.roles.length })}
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,360px)] items-start">
        {view === 'chart' ? (
          <div className={`${CARD} relative p-2 min-h-[520px] flex flex-col`}>
            <svg ref={svgRef} className="w-full flex-1 max-h-[560px] text-warm-900 dark:text-disc-text" role="img" aria-label={t('title')} />
            <div className="flex items-center justify-between gap-2 px-2 pb-1">
              <p className="text-xs text-warm-500 dark:text-disc-muted">{t('hint')}</p>
              <button type="button" onClick={resetLayout}
                className="flex items-center gap-1 text-xs font-medium text-warm-500 dark:text-disc-muted hover:text-orange shrink-0">
                <RotateCcw size={12} /> {t('resetLayout')}
              </button>
            </div>
          </div>
        ) : (
          <div className={`${CARD} p-1 overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200 dark:border-disc-border">
                  {[t('colRole'), t('colMembers'), t('colScore'), t('colTop')].map((h, i) => (
                    <th key={h} className={`px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-warm-500 dark:text-disc-muted ${i === 0 || i === 3 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ group, role }) => (
                  <tr key={role.roleId} onClick={() => setSelected(role)}
                    className={`border-b border-warm-100 dark:border-disc-border/50 cursor-pointer hover:bg-warm-50 dark:hover:bg-disc-hover ${
                      selected?.roleId === role.roleId ? 'bg-orange/10' : ''
                    }`}>
                    <td className="px-3 py-2.5 text-warm-900 dark:text-disc-text">
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: colorOf(group) }} />
                      {role.roleName}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-warm-500 dark:text-disc-muted">{role.memberCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-warm-900 dark:text-disc-text">{fmtInt(role.totalScore)}</td>
                    <td className="px-3 py-2.5 text-warm-900 dark:text-disc-text">{role.top[0]?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={`${CARD} p-4 min-h-[520px] flex flex-col`}>
          {!selected ? (
            <div className="m-auto text-center px-4">
              <div className="text-3xl mb-2 opacity-70">🪐</div>
              <p className="text-sm text-warm-500 dark:text-disc-muted max-w-[26ch] mx-auto">{t('railEmpty')}</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-warm-900 dark:text-disc-text">{selected.roleName}</h2>
              <p className="mt-1 mb-4 text-xs text-warm-500 dark:text-disc-muted tabular-nums">
                {t('memberCount', { count: selected.memberCount })} · {t('daysLabel', { days })}
              </p>
              {!selected.top.length ? (
                <p className="text-sm text-warm-500 dark:text-disc-muted">{t('noActivity')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {selected.top.map((m, i) => (
                    <li key={m.userId} className="grid grid-cols-[20px_30px_1fr_auto] items-center gap-2 p-1.5 rounded-lg hover:bg-warm-50 dark:hover:bg-disc-hover">
                      <span className={`text-xs font-bold text-center tabular-nums ${i === 0 ? 'text-orange' : 'text-warm-400 dark:text-disc-muted'}`}>{i + 1}</span>
                      <svg viewBox="-18 -18 36 36" className="w-[30px] h-[30px]"
                        dangerouslySetInnerHTML={{ __html: avatarMarkup(m.name, 18) }} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate text-warm-900 dark:text-disc-text">{m.name}</div>
                        <div className="h-1 rounded-full bg-warm-100 dark:bg-disc-border mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${Math.max(6, (m.score / (selected.top[0].score || 1)) * 100)}%`,
                            background: colorOf(tableRows.find(r => r.role.roleId === selected.roleId)?.group || 'other'),
                          }} />
                        </div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="text-sm font-bold tabular-nums text-warm-900 dark:text-disc-text">{fmtInt(m.score)}</div>
                        <div className="text-[10px] font-medium text-warm-400 dark:text-disc-muted tabular-nums">
                          💬{fmtInt(m.messages)} · 🔊{fmtVoice(m.voiceSeconds)} · 📣{m.mentions}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-auto pt-3 border-t border-warm-100 dark:border-disc-border text-[11px] text-warm-400 dark:text-disc-muted">
                {t('formula')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
