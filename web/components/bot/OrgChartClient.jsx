'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Search, RotateCcw, Loader2, Maximize2 } from 'lucide-react'

// ผังทีมแบบเครือข่าย — เวอร์ชันเว็บของ /orgchart (ดิสคอร์ด)
//
// โครง: chart เดียวเห็นทุกชั้นพร้อมกัน (hub → กลุ่ม → บทบาท → รายคน)
// ไม่มี drill-down เปลี่ยนหน้า — ใช้ชิปกลุ่มเปิด/ปิด + คลิกบทบาทเพื่อแตกคนในที่เดิม
//
// ⚠️ สเกลจริง: guild อาสาฯ มี 138 บทบาท (ทีมจังหวัดกลุ่มเดียว 81) แต่มีความเคลื่อนไหวจริง ~49
//    → ซ่อนบทบาทที่ไม่มีใครแอคทีฟทิ้งเสมอ + default โชว์แค่ Top 5 ต่อกลุ่ม (เคาะกับ user 2026-08-17)
//    เหลือ ~30 โหนด อ่านออกในจอเดียว ส่วนที่เหลือกดดูได้จากตัวเลือก "ทั้งหมด"
//
// layout เขียนเอง: recharts ที่โปรเจกต์มีไม่มี graph/force layout
// วาด SVG ผ่าน ref ไม่ผ่าน React state ต่อโหนด — ตอนลาก/แพนต้องได้ 60fps

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
const LIMIT_OPTIONS = [5, 10, 0]        // 0 = ทั้งหมด
const AVATAR_BG = ['#5865F2', '#57A55A', '#EAA83A', '#D8548A', '#DA4B48', '#7C6FE0', '#1F9AA0', '#E8804A']

const HUB_R = 40
const ROLE_R = [14, 30]
const PERSON_R = [11, 22]
const GROUP_R = [26, 44]
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
function scaleR(v, all, range) {
  const nums = all.length ? all : [0]
  const min = Math.min(...nums), max = Math.max(...nums)
  const t = max > min ? (v - min) / (max - min) : 0.5
  return range[0] + (range[1] - range[0]) * Math.sqrt(t)
}
function pillWidth(title, sub) {
  return Math.max(46, Math.max((title || '').length * 7.1, sub ? sub.length * 5.9 : 0) + 22)
}

// avatar จริงของ Discord โหลดไม่ได้ (CSP / ไม่ได้ตั้ง remotePatterns ให้ next/image)
// → วาดวงกลมสีจากชื่อแบบ deterministic ให้ยังแยกคนออกจากกันด้วยสีได้
function avatarMarkup(name, r) {
  const seed = hash(name || '?')
  const bg = AVATAR_BG[seed % AVATAR_BG.length]
  const clipId = `oc-c${seed}-${Math.round(r * 10)}`
  return `
    <clipPath id="${clipId}"><circle r="${r}"/></clipPath>
    <g clip-path="url(#${clipId})">
      <circle r="${r}" fill="${bg}"/>
      <circle cy="${-r * 0.14}" r="${r * 0.33}" fill="#fff" opacity="0.94"/>
      <ellipse cy="${r * 0.68}" rx="${r * 0.56}" ry="${r * 0.5}" fill="#fff" opacity="0.94"/>
    </g>
    <circle class="oc-avatar-border" r="${r}"/>`
}

function pillNode(topY, { title, sub, bg, titleColor, subColor, fs = 10 }) {
  const w = pillWidth(title, sub)
  const h = sub ? 32 : 21
  const g = el('g', {})
  g.appendChild(el('rect', { class: 'oc-pill', x: -w / 2, y: topY, width: w, height: h, rx: sub ? 8 : h / 2, fill: bg }))
  if (sub) {
    const t1 = el('text', { y: topY + 13.5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700, fill: titleColor })
    t1.textContent = title; g.appendChild(t1)
    const t2 = el('text', { y: topY + 25, 'text-anchor': 'middle', 'font-size': fs - 2, 'font-weight': 600, fill: subColor })
    t2.textContent = sub; g.appendChild(t2)
  } else {
    const t = el('text', { y: topY + h / 2 + 3.6, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: titleColor })
    t.textContent = title; g.appendChild(t)
  }
  return g
}

// ── layout ────────────────────────────────────────────────────────────────────
// วางแบบ "แบ่งส่วนมุม": แต่ละกลุ่มได้อาณาเขตเชิงมุมตามความกว้างรวมของลูกตัวเอง
// วางไม่ให้ทับตั้งแต่แรกด้วยเรขาคณิต แล้วค่อยคลายที่เหลือด้วย relaxation สั้นๆ
// (ปล่อยให้ physics จัดล้วนๆ จะช้าและผลลัพธ์ไม่นิ่งเมื่อโหนดเยอะ)
function buildLayout(visibleGroups, expandedRoles, t) {
  const nodes = []
  const edges = []
  const hub = { id: '__hub', kind: 'hub', x: 0, y: 0, r: HUB_R, halfW: HUB_R, halfH: HUB_R, fixed: true }
  nodes.push(hub)

  const allRoleScores = visibleGroups.flatMap(g => g.roles.map(r => r.totalScore))
  const groupScores = visibleGroups.map(g => g.roles.reduce((s, r) => s + r.totalScore, 0))

  const GAP = 26
  const groupPlans = visibleGroups.map((g, gi) => {
    const roles = g.roles.map(role => {
      const rad = scaleR(role.totalScore, allRoleScores, ROLE_R)
      const sub = role.top[0] ? `🔥 ${role.top[0].name}` : t('noActivity')
      const own = Math.max(rad * 2, pillWidth(role.roleName, sub))
      const expanded = expandedRoles.has(role.roleId) && role.top.length > 0
      let people = []
      if (expanded) {
        const pScores = role.top.map(m => m.score)
        people = role.top.map((m, i) => {
          const pr = scaleR(m.score, pScores, PERSON_R)
          const psub = t('scoreLabel', { score: fmtInt(m.score) })
          return { person: m, rank: i + 1, r: pr, sub: psub, w: Math.max(pr * 2, pillWidth(m.name, psub)) }
        })
      }
      // คนของบทบาทวางเป็น "ดอกไม้" รอบบทบาทตัวเอง ไม่ใช่กางออกบนวงใหญ่
      // (ถ้าเอาความกว้างคนไปบวกในส่วนมุม วงจะพองจนบทบาทกับคนอยู่รัศมีเดียวกัน = อ่านไม่ออก)
      const clusterR = people.length
        ? Math.max(rad + Math.max(...people.map(p => p.r)) + 46, people.reduce((s, p) => s + p.w, 0) / (Math.PI * 2))
        : 0
      const clusterW = people.length ? (clusterR + Math.max(...people.map(p => p.w)) / 2) * 2 : 0
      return { role, rad, sub, expanded, people, clusterR, width: Math.max(own, clusterW) + GAP }
    })
    return { group: g, gi, roles, width: roles.reduce((s, r) => s + r.width, 0) }
  })

  const totalWidth = groupPlans.reduce((s, p) => s + p.width, 0) || 1
  // รัศมีวงบทบาท: เส้นรอบวงต้องยาวพอใส่ทุกอันโดยไม่เบียด
  const roleRing = Math.max(280, (totalWidth * 1.22) / (Math.PI * 2))
  const groupRing = Math.max(140, roleRing * 0.42)

  let cursor = -Math.PI / 2
  for (const plan of groupPlans) {
    const span = (plan.width / totalWidth) * Math.PI * 2
    const start = cursor
    const mid = start + span / 2
    cursor += span

    const gr = scaleR(groupScores[plan.gi], groupScores, GROUP_R)
    const gLabel = t(`groups.${plan.group.groupName}`)
    const gNode = {
      id: `g:${plan.group.groupName}`, kind: 'group', group: plan.group.groupName, groupData: plan.group,
      label: gLabel,
      x: Math.cos(mid) * groupRing, y: Math.sin(mid) * groupRing,
      r: gr, halfW: Math.max(gr, pillWidth(gLabel) / 2), halfH: (gr * 2 + 11 + 21) / 2,
      homeR: groupRing,
    }
    nodes.push(gNode)
    edges.push({ a: hub, b: gNode })

    let rc = start
    for (const rp of plan.roles) {
      const rSpan = (rp.width / plan.width) * span
      const rMid = rc + rSpan / 2
      rc += rSpan
      const rNode = {
        id: `r:${rp.role.roleId}`, kind: 'role', group: plan.group.groupName, role: rp.role,
        label: rp.role.roleName, sub: rp.sub, expanded: rp.expanded,
        x: Math.cos(rMid) * roleRing, y: Math.sin(rMid) * roleRing,
        r: rp.rad, halfW: Math.max(rp.rad, pillWidth(rp.role.roleName, rp.sub) / 2),
        halfH: (rp.rad * 2 + 10 + 32) / 2,
        homeR: roleRing,
      }
      nodes.push(rNode)
      edges.push({ a: gNode, b: rNode })

      // คนของบทบาทที่แตกแล้ว — วงกลมเล็กๆ รอบบทบาทตัวเอง (อันดับ 1 อยู่ด้านนอกสุด)
      if (rp.expanded) {
        const n = rp.people.length
        rp.people.forEach((p, i) => {
          const a = rMid + (i / n) * Math.PI * 2
          const px = rNode.x + Math.cos(a) * rp.clusterR
          const py = rNode.y + Math.sin(a) * rp.clusterR
          nodes.push({
            id: `p:${rp.role.roleId}:${p.person.userId}`, kind: 'person', group: plan.group.groupName,
            person: p.person, rank: p.rank, role: rp.role, label: p.person.name, sub: p.sub,
            x: px, y: py,
            r: p.r, halfW: Math.max(p.r, pillWidth(p.person.name, p.sub) / 2), halfH: (p.r * 2 + 10 + 32) / 2,
            // ยึดกับบทบาทแม่ ไม่ใช่ hub — คลายทับแล้วต้องไม่หลุดออกจากดอกของตัวเอง
            anchor: rNode, anchorR: rp.clusterR,
          })
          edges.push({ a: rNode, b: nodes[nodes.length - 1] })
        })
      }
    }
  }

  relax(nodes)
  return { nodes, edges }
}

// คลายทับแบบ "กล่อง" — ป้ายชื่อไทยกว้างกว่าวงกลมมาก คิดแค่รัศมีป้ายจะทับกันเละ
// ใช้กริดหาเพื่อนบ้านแทน O(n²) เพราะโหนดแตะหลายร้อยได้ตอนแตกคนหลายบทบาท
function relax(nodes) {
  const movable = nodes.filter(n => !n.fixed)
  if (!movable.length) return
  const iterations = movable.length > 400 ? 70 : movable.length > 150 ? 120 : 200
  const cell = 150

  for (let it = 0; it < iterations; it++) {
    const grid = new Map()
    for (const n of movable) {
      const key = `${Math.round(n.x / cell)},${Math.round(n.y / cell)}`
      let bucket = grid.get(key)
      if (!bucket) { bucket = []; grid.set(key, bucket) }
      bucket.push(n)
    }
    for (const n of movable) {
      const gx = Math.round(n.x / cell), gy = Math.round(n.y / cell)
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${gx + dx},${gy + dy}`)
        if (!bucket) continue
        for (const m of bucket) {
          if (m === n || m.id <= n.id) continue
          const ddx = m.x - n.x, ddy = m.y - n.y
          const ovX = (n.halfW + m.halfW + 12) - Math.abs(ddx)
          const ovY = (n.halfH + m.halfH + 8) - Math.abs(ddy)
          if (ovX > 0 && ovY > 0) {
            // ดันออกทางแกนที่ทับน้อยกว่า = ขยับสั้นสุดที่ทำให้หายทับ
            if (ovX < ovY) { const p = (ovX / 2) * (ddx < 0 ? -1 : 1); n.x -= p; m.x += p }
            else { const p = (ovY / 2) * (ddy < 0 ? -1 : 1); n.y -= p; m.y += p }
          }
        }
      }
    }
    for (const n of movable) {
      // คนยึดกับบทบาทแม่ · ที่เหลือยึดรัศมีบ้านของตัวเองรอบ hub
      const ox = n.anchor ? n.anchor.x : 0
      const oy = n.anchor ? n.anchor.y : 0
      const want = n.anchor ? n.anchorR : n.homeR
      const dx = n.x - ox, dy = n.y - oy
      const d = Math.hypot(dx, dy) || 0.01
      const pull = (d - want) * (n.anchor ? 0.16 : 0.08)
      n.x -= (dx / d) * pull; n.y -= (dy / d) * pull
    }
  }
}

export default function OrgChartClient() {
  const t = useTranslations('bot.orgchart')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(180)
  const [perGroup, setPerGroup] = useState(5)       // Top N บทบาทต่อกลุ่ม (0 = ทั้งหมด)
  const [hiddenGroups, setHiddenGroups] = useState(() => new Set())
  const [expandedRoles, setExpandedRoles] = useState(() => new Set())
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState('chart')
  const [isDark, setIsDark] = useState(false)

  const svgRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const dragRef = useRef(null)
  const viewRef = useRef(null)
  const panRef = useRef(null)

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
      .then(({ ok, d }) => {
        // ข้อมูลชุดใหม่ → สิ่งที่แตกไว้เป็น snapshot เก่าแล้ว ปิดลงให้หมด
        if (ok) { setData(d); setExpandedRoles(new Set()); setSelected(null) }
        else setError(d.error || t('loadFailed'))
      })
      .catch(() => setError(t('loadFailed')))
      .finally(() => setLoading(false))
  }, [days, t])

  useEffect(() => {
    load()
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
  }, [load])

  const colorOf = useCallback(
    g => GROUP_COLOR[g]?.[isDark ? 'dark' : 'light'] || GROUP_COLOR.other[isDark ? 'dark' : 'light'],
    [isDark]
  )

  // บทบาทที่ "มีความเคลื่อนไหวจริง" เท่านั้น — ไม่มีใครแอคทีฟ = ไม่ต้องขึ้นกราฟเลย
  const activeGroups = useMemo(() => {
    const list = data?.groups || []
    return list
      .map(g => ({ ...g, roles: g.roles.filter(r => r.top.length > 0).sort((a, b) => b.totalScore - a.totalScore) }))
      .filter(g => g.roles.length > 0)
      .sort((a, b) => GROUP_ORDER.indexOf(a.groupName) - GROUP_ORDER.indexOf(b.groupName))
  }, [data])

  const totalActiveRoles = useMemo(() => activeGroups.reduce((s, g) => s + g.roles.length, 0), [activeGroups])

  // ที่จะวาดจริง: กรองกลุ่มที่ปิด + คำค้น + จำกัด Top N ต่อกลุ่ม
  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activeGroups
      .filter(g => !hiddenGroups.has(g.groupName))
      .map(g => {
        let roles = q ? g.roles.filter(r => r.roleName.toLowerCase().includes(q)) : g.roles
        if (perGroup > 0 && !q) roles = roles.slice(0, perGroup)   // ค้นหาอยู่ = ไม่ตัด ให้เจอของที่ค้น
        return { ...g, roles }
      })
      .filter(g => g.roles.length > 0)
  }, [activeGroups, hiddenGroups, query, perGroup])

  const shownRoles = useMemo(() => visibleGroups.reduce((s, g) => s + g.roles.length, 0), [visibleGroups])

  const layoutKey = useMemo(() => [
    data?.guildId || '', days, perGroup, query.trim(),
    visibleGroups.map(g => `${g.groupName}:${g.roles.length}`).join('|'),
    [...expandedRoles].sort().join(','),
  ].join('#'), [data?.guildId, days, perGroup, query, visibleGroups, expandedRoles])

  const storageKey = data?.guildId ? `orgchart-pos:${data.guildId}` : null

  useEffect(() => {
    if (!visibleGroups.length) { nodesRef.current = []; edgesRef.current = []; return }
    const { nodes, edges } = buildLayout(visibleGroups, expandedRoles, t)
    if (storageKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
        nodes.forEach(n => { if (saved[n.id]) { n.x = saved[n.id].x; n.y = saved[n.id].y } })
      } catch { /* ค่าที่เก็บไว้เสีย → ใช้ผังที่คำนวณใหม่ */ }
    }
    nodesRef.current = nodes
    edgesRef.current = edges
    viewRef.current = null
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, storageKey, isDark, selected])

  function fitView() {
    const nodes = nodesRef.current
    if (!nodes.length) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.halfW); maxX = Math.max(maxX, n.x + n.halfW)
      minY = Math.min(minY, n.y - n.r); maxY = Math.max(maxY, n.y + n.halfH + 20)
    }
    const pad = 46
    viewRef.current = { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 }
    applyView()
  }
  function applyView() {
    const v = viewRef.current
    if (v && svgRef.current) svgRef.current.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`)
  }

  function draw() {
    const svg = svgRef.current
    if (!svg) return
    svg.innerHTML = ''
    const nodes = nodesRef.current

    const edgeLayer = el('g', {})
    svg.appendChild(edgeLayer)
    for (const e of edgesRef.current) {
      const line = el('line', { class: `oc-edge oc-edge-${e.a.kind}` })
      edgeLayer.appendChild(line)
      e._line = line
    }
    positionEdges()

    for (const n of nodes) {
      const color = colorOf(n.group)
      const isSel = n.kind === 'role' && selected?.roleId === n.role.roleId
      const wrap = el('g', {
        class: `oc-node oc-${n.kind}-node${isSel ? ' is-selected' : ''}`,
        transform: `translate(${n.x} ${n.y})`,
        tabindex: n.kind === 'hub' ? '-1' : '0',
        role: 'button', 'aria-label': n.label || 'hub',
      })
      const hit = (pillTop, pillH) => {
        const w = Math.max(n.r * 2, n.halfW * 2)
        wrap.appendChild(el('rect', { class: 'oc-hit', x: -w / 2, y: -n.r, width: w, height: n.r + pillTop + pillH }))
      }

      if (n.kind === 'hub') {
        wrap.appendChild(el('circle', { r: HUB_R, class: 'oc-hub' }))
        const a = el('text', { y: 2, class: 'oc-hub-text', 'text-anchor': 'middle' })
        a.textContent = t('orgHub'); wrap.appendChild(a)
        const b = el('text', { y: 15, class: 'oc-hub-sub', 'text-anchor': 'middle' })
        b.textContent = t('nodeCount', { count: nodes.length - 1 }); wrap.appendChild(b)
      } else if (n.kind === 'group') {
        hit(n.r + 11, 21)
        wrap.appendChild(el('circle', { r: n.r, fill: color, class: 'oc-fill' }))
        const emo = el('text', { y: n.r * 0.15, 'text-anchor': 'middle', 'font-size': n.r * 0.85 })
        emo.textContent = GROUP_EMOJI[n.group] || '📋'; wrap.appendChild(emo)
        wrap.appendChild(pillNode(n.r + 11, { title: n.label, bg: color, titleColor: '#fff', fs: 11 }))
      } else if (n.kind === 'role') {
        wrap.innerHTML = avatarMarkup(n.role.top[0]?.name || n.label, n.r)
        hit(n.r + 10, 32)
        wrap.appendChild(el('circle', { r: n.r, class: 'oc-sel-ring' }))
        // จุดมุมบนขวา = คลิกแล้วแตกคนได้ / กำลังแตกอยู่
        const dot = el('circle', { r: 5.5, cx: n.r * 0.74, cy: -n.r * 0.74, class: n.expanded ? 'oc-exp on' : 'oc-exp' })
        dot.setAttribute('fill', color); wrap.appendChild(dot)
        wrap.appendChild(pillNode(n.r + 10, {
          title: n.label, sub: n.sub,
          bg: `color-mix(in srgb, ${color} 16%, var(--card-bg))`,
          titleColor: 'currentColor', subColor: 'currentColor',
        }))
      } else {
        wrap.innerHTML = avatarMarkup(n.person.name, n.r)
        hit(n.r + 10, 32)
        const badge = el('g', { transform: `translate(${n.r * 0.72} ${-n.r * 0.72})` })
        badge.appendChild(el('circle', { r: 8, fill: color, class: 'oc-rank-dot' }))
        const bt = el('text', { y: 2.9, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: '#fff' })
        bt.textContent = String(n.rank); badge.appendChild(bt)
        wrap.appendChild(badge)
        wrap.appendChild(pillNode(n.r + 10, {
          title: n.label, sub: n.sub,
          bg: `color-mix(in srgb, ${color} 22%, var(--card-bg))`,
          titleColor: 'currentColor', subColor: 'currentColor', fs: 9.5,
        }))
      }

      if (n.kind !== 'hub') attachDrag(wrap, n)
      svg.appendChild(wrap)
      n._g = wrap
    }

    if (!viewRef.current) fitView(); else applyView()
  }

  function positionEdges() {
    for (const e of edgesRef.current) {
      if (!e._line) continue
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y
      const d = Math.hypot(dx, dy) || 1
      const ux = dx / d, uy = dy / d
      e._line.setAttribute('x1', e.a.x + ux * (e.a.r + 2))
      e._line.setAttribute('y1', e.a.y + uy * (e.a.r + 2))
      e._line.setAttribute('x2', e.b.x - ux * (e.b.r + 2))
      e._line.setAttribute('y2', e.b.y - uy * (e.b.r + 2))
    }
  }

  function clientToSvg(cx, cy) {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = cx; pt.y = cy
    return pt.matrixTransform(svg.getScreenCTM().inverse())
  }

  // ลากโหนด: เขียน transform ลง DOM ตรงๆ ไม่ผ่าน state (ไม่งั้น re-render ทุกเฟรม)
  // แยกลากจากคลิกด้วยระยะสะสม < 4px = ถือว่าคลิก
  function attachDrag(g, node) {
    g.addEventListener('pointerdown', e => {
      if (e.button !== 0) return
      const pt = clientToSvg(e.clientX, e.clientY)
      dragRef.current = { node, dx: node.x - pt.x, dy: node.y - pt.y, moved: 0 }
      g.setPointerCapture(e.pointerId)
      e.stopPropagation()      // อย่าให้กลายเป็นแพนพื้นหลัง
      e.preventDefault()
    })
    g.addEventListener('pointermove', e => {
      const drag = dragRef.current
      if (!drag || drag.node !== node) return
      const pt = clientToSvg(e.clientX, e.clientY)
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

  function savePositions() {
    if (!storageKey) return
    let saved = {}
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') } catch { saved = {} }
    for (const n of nodesRef.current) saved[n.id] = { x: Math.round(n.x), y: Math.round(n.y) }
    try { localStorage.setItem(storageKey, JSON.stringify(saved)) } catch { /* โควตาเต็ม — ไม่ critical */ }
  }

  function resetLayout() {
    if (storageKey) { try { localStorage.removeItem(storageKey) } catch { /* ไม่มีอะไรให้ลบ */ } }
    const { nodes, edges } = buildLayout(visibleGroups, expandedRoles, t)
    nodesRef.current = nodes; edgesRef.current = edges
    viewRef.current = null
    draw()
  }

  function onNodeClick(node) {
    if (node.kind === 'group') {
      // คลิกกลุ่ม = แตก/ยุบทุกบทบาทที่แสดงอยู่ในกลุ่มนั้นรวดเดียว
      const ids = visibleGroups.find(g => g.groupName === node.group)?.roles.map(r => r.roleId) || []
      setExpandedRoles(prev => {
        const next = new Set(prev)
        const allOn = ids.length > 0 && ids.every(id => next.has(id))
        ids.forEach(id => allOn ? next.delete(id) : next.add(id))
        return next
      })
      return
    }
    if (node.kind === 'role') {
      setSelected(node.role)
      setExpandedRoles(prev => {
        const next = new Set(prev)
        next.has(node.role.roleId) ? next.delete(node.role.roleId) : next.add(node.role.roleId)
        return next
      })
      return
    }
    if (node.kind === 'person') setSelected(node.role)
  }

  // ── zoom / pan บนพื้นหลัง ───────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = e => {
      if (!viewRef.current) return
      e.preventDefault()
      const v = viewRef.current
      const p = clientToSvg(e.clientX, e.clientY)
      const k = e.deltaY > 0 ? 1.12 : 0.89
      const nw = Math.max(240, Math.min(24000, v.w * k))
      const nh = v.h * (nw / v.w)
      viewRef.current = { x: p.x - (p.x - v.x) * (nw / v.w), y: p.y - (p.y - v.y) * (nh / v.h), w: nw, h: nh }
      applyView()
    }
    const onDown = e => {
      if (dragRef.current || !viewRef.current) return
      panRef.current = { cx: e.clientX, cy: e.clientY, v: { ...viewRef.current } }
      svg.classList.add('is-panning')
      svg.setPointerCapture?.(e.pointerId)
    }
    const onMove = e => {
      const pan = panRef.current
      if (!pan) return
      const rect = svg.getBoundingClientRect()
      viewRef.current = {
        ...pan.v,
        x: pan.v.x - (e.clientX - pan.cx) * (pan.v.w / rect.width),
        y: pan.v.y - (e.clientY - pan.cy) * (pan.v.h / rect.height),
      }
      applyView()
    }
    const onUp = e => {
      if (!panRef.current) return
      panRef.current = null
      svg.classList.remove('is-panning')
      if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    svg.addEventListener('pointerdown', onDown)
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerup', onUp)
    svg.addEventListener('pointercancel', onUp)
    return () => {
      svg.removeEventListener('wheel', onWheel)
      svg.removeEventListener('pointerdown', onDown)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
      svg.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const shownRoleIds = useMemo(() => visibleGroups.flatMap(g => g.roles.map(r => r.roleId)), [visibleGroups])
  const allExpanded = shownRoleIds.length > 0 && shownRoleIds.every(id => expandedRoles.has(id))

  const tableRows = useMemo(() => {
    const rows = []
    for (const g of visibleGroups) for (const role of g.roles) rows.push({ group: g.groupName, role })
    return rows.sort((a, b) => b.role.totalScore - a.role.totalScore)
  }, [visibleGroups])

  const selectedGroup = useMemo(
    () => activeGroups.find(g => g.roles.some(r => r.roleId === selected?.roleId))?.groupName || 'other',
    [activeGroups, selected]
  )

  const CARD = 'rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg'

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-warm-500 dark:text-disc-muted text-sm`}>
        <Loader2 size={16} className="animate-spin" /> {t('loading')}
      </div>
    )
  }
  if (error) return <div className={`${CARD} p-8 text-center text-sm text-warm-500 dark:text-disc-muted`}>{error}</div>
  if (!activeGroups.length) {
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
        .oc-edge { stroke: #b9b3a5; stroke-width: 1.4; }
        .oc-edge-hub { stroke-width: 2; }
        .oc-edge-role { stroke-dasharray: 3 3; opacity: .7; }
        .dark .oc-edge { stroke: #5c5b56; }
        .oc-node { cursor: pointer; }
        .oc-hit { fill: transparent; }
        .oc-avatar-border { fill: none; stroke: var(--card-bg); stroke-width: 2.5; }
        .oc-sel-ring { fill: none; stroke: currentColor; stroke-width: 2.5; opacity: 0; }
        .oc-node.is-selected .oc-sel-ring { opacity: 1; }
        .oc-rank-dot { stroke: var(--card-bg); stroke-width: 2; }
        .oc-exp { stroke: var(--card-bg); stroke-width: 2; opacity: .4; }
        .oc-exp.on { opacity: 1; }
        .oc-fill, .oc-pill { transition: filter .12s ease; }
        .oc-node:hover .oc-fill, .oc-node:hover .oc-pill { filter: brightness(1.08); }
        .oc-hub { fill: #0b2b45; }
        .dark .oc-hub { fill: #14395a; }
        .oc-hub-text { fill: #fdf8f2; font-size: 12px; font-weight: 800; }
        .oc-hub-sub { fill: #fdf8f2; opacity: .7; font-size: 8px; font-weight: 700; }
        .oc-canvas { touch-action: none; cursor: grab; }
        .oc-canvas.is-panning { cursor: grabbing; }
        .oc-node:focus-visible { outline: 2px solid var(--brand-orange); outline-offset: 2px; }
      `}</style>

      <div>
        <h1 className="text-xl font-bold text-warm-900 dark:text-disc-text">{t('title')}</h1>
        <p className="mt-1 text-sm text-warm-500 dark:text-disc-muted">{t('subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className={`${CARD} flex items-center gap-2 px-3 py-2 flex-1 min-w-[190px] max-w-xs`}>
          <Search size={14} className="text-warm-400 dark:text-disc-muted shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('searchPlaceholder')}
            className="w-full bg-transparent text-sm text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none" />
        </div>
        <div className={`${CARD} flex gap-0.5 p-1`}>
          {DAYS_OPTIONS.map(d => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg tabular-nums ${
                d === days ? 'bg-orange text-white' : 'text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'}`}>
              {d}
            </button>
          ))}
        </div>
        <div className={`${CARD} flex gap-0.5 p-1`}>
          {LIMIT_OPTIONS.map(n => (
            <button key={n} type="button" onClick={() => setPerGroup(n)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg ${
                n === perGroup ? 'bg-orange text-white' : 'text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'}`}>
              {n === 0 ? t('allRoles') : t('topPerGroup', { n })}
            </button>
          ))}
        </div>
        <div className={`${CARD} flex gap-0.5 p-1 ml-auto`}>
          {['chart', 'table'].map(v => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                v === view ? 'bg-warm-900 dark:bg-disc-text text-white dark:text-disc-bg2' : 'text-warm-500 dark:text-disc-muted'}`}>
              {v === 'chart' ? t('viewNetwork') : t('viewTable')}
            </button>
          ))}
        </div>
      </div>

      {/* ชิปกรองกลุ่ม — กดเปิด/ปิดกลุ่มบนกราฟ */}
      <div className="flex flex-wrap items-center gap-1.5">
        {activeGroups.map(g => {
          const on = !hiddenGroups.has(g.groupName)
          const c = colorOf(g.groupName)
          return (
            <button key={g.groupName} type="button" aria-pressed={on}
              onClick={() => setHiddenGroups(prev => {
                const next = new Set(prev)
                next.has(g.groupName) ? next.delete(g.groupName) : next.add(g.groupName)
                return next
              })}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${
                on ? 'border-transparent text-warm-900 dark:text-disc-text'
                   : 'border-warm-200 dark:border-disc-border text-warm-400 dark:text-disc-muted opacity-60'}`}
              style={on ? { background: `color-mix(in srgb, ${c} 18%, var(--card-bg))` } : undefined}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: on ? c : 'currentColor' }} />
              {GROUP_EMOJI[g.groupName]} {t(`groups.${g.groupName}`)}
              <span className="tabular-nums opacity-60">{g.roles.length}</span>
            </button>
          )
        })}
        <span className="mx-1 h-4 w-px bg-warm-200 dark:bg-disc-border" />
        <button type="button"
          onClick={() => setHiddenGroups(hiddenGroups.size ? new Set() : new Set(activeGroups.map(g => g.groupName)))}
          className="rounded-full px-2.5 py-1.5 text-xs font-semibold text-warm-500 dark:text-disc-muted hover:text-orange">
          {hiddenGroups.size ? t('showAll') : t('hideAll')}
        </button>
        <button type="button"
          onClick={() => setExpandedRoles(allExpanded ? new Set() : new Set(shownRoleIds))}
          className="rounded-full px-2.5 py-1.5 text-xs font-semibold text-warm-500 dark:text-disc-muted hover:text-orange">
          {allExpanded ? t('collapseAll') : t('expandAll')}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,340px)] items-start">
        {view === 'chart' ? (
          <div className={`${CARD} relative p-2 flex flex-col`}>
            <svg ref={svgRef} className="oc-canvas w-full h-[620px] text-warm-900 dark:text-disc-text"
              role="img" aria-label={t('title')} />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 pt-1">
              <p className="text-xs text-warm-500 dark:text-disc-muted">{t('hint')}</p>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-warm-400 dark:text-disc-muted tabular-nums">
                  {t('rolesShown', { shown: shownRoles, total: totalActiveRoles })}
                </span>
                <button type="button" onClick={fitView}
                  className="flex items-center gap-1 text-xs font-medium text-warm-500 dark:text-disc-muted hover:text-orange">
                  <Maximize2 size={12} /> {t('fitView')}
                </button>
                <button type="button" onClick={resetLayout}
                  className="flex items-center gap-1 text-xs font-medium text-warm-500 dark:text-disc-muted hover:text-orange">
                  <RotateCcw size={12} /> {t('resetLayout')}
                </button>
              </div>
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
                      selected?.roleId === role.roleId ? 'bg-orange/10' : ''}`}>
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

        <div className={`${CARD} p-4 min-h-[400px] flex flex-col`}>
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
                      <svg viewBox="-18 -18 36 36" className="w-[30px] h-[30px]" dangerouslySetInnerHTML={{ __html: avatarMarkup(m.name, 18) }} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate text-warm-900 dark:text-disc-text">{m.name}</div>
                        <div className="h-1 rounded-full bg-warm-100 dark:bg-disc-border mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${Math.max(6, (m.score / (selected.top[0].score || 1)) * 100)}%`,
                            background: colorOf(selectedGroup),
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
