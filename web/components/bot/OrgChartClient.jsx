'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Search, RotateCcw, Loader2, Maximize2, Minimize2, PanelRightClose, PanelRightOpen,
  Star, Wrench, Map as MapIcon, MapPin, Building2, FolderOpen, Users, User, UsersRound, MessageSquare, Mic, AtSign, Flame,
} from 'lucide-react'

// ไอคอนเดียวกับที่วาดบนกราฟ แต่เป็น component สำหรับชิป/แผงขวา
const GROUP_LUCIDE = {
  main: Star, skill: Wrench, region: MapIcon, province: MapPin, district: Building2, other: FolderOpen,
}

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
// ไอคอนกลุ่ม — path จาก lucide-react (ชุดเดียวกับทั้งเว็บ เช่น /finance/categories)
// ต้องฝัง path เองเพราะกราฟวาด SVG ด้วย DOM API ไม่ได้ผ่าน React จึงใช้ component ตรงๆ ไม่ได้
const GROUP_ICON = {
  main: [['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }]],
  skill: [['path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z' }]],
  region: [['path', { d: 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z' }], ['path', { d: 'M15 5.764v15' }], ['path', { d: 'M9 3.236v15' }]],
  province: [['path', { d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0' }], ['circle', { cx: '12', cy: '10', r: '3' }]],
  district: [['path', { d: 'M10 12h4' }], ['path', { d: 'M10 8h4' }], ['path', { d: 'M14 21v-3a2 2 0 0 0-4 0v3' }], ['path', { d: 'M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2' }], ['path', { d: 'M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16' }]],
  other: [['path', { d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2' }]],
}
// สีตามกลุ่ม — ผ่าน validator ของ dataviz (CVD + contrast) ทั้ง light/dark
// พาสเทลจากคลังสีของ user (reference_pastel_palettes) — ไม่ได้คิดเฉดเอง
// เลือกชุดที่ผ่าน normal-vision floor ΔE 15.4 (ทุกคู่แยกออกด้วยตาปกติ)
// CVD อยู่ในช่วง warn 7.9 → ใช้ได้เพราะมี secondary encoding 3 ชั้น:
// ไอคอน lucide ต่างกันทุกกลุ่ม + ป้ายชื่อทุกโหนด + แต่ละกลุ่มอยู่คนละส่วนมุม
// พาสเทลจางเกินเกณฑ์ contrast บนพื้นสว่าง → relief = ป้ายชื่อที่มองเห็นเสมอ (มีอยู่แล้ว)
const GROUP_COLOR = {
  main:     '#ED9A73',   // ส้มพาสเทล — ชุด "น้ำตาลอ่อน"
  skill:    '#BBEAA6',   // เขียวอ่อน — ชุด "ชมพูอ่อน"
  region:   '#84A6D6',   // ฟ้า — ชุด "ม่วง"
  province: '#E688A1',   // ชมพู — ชุด "ชมพูอ่อน"
  district: '#FFC75F',   // เหลืองอำพัน — ชุด "น้ำเงินเข้ม"
  other:    '#CECBDA',   // เทาอมม่วง — ชุด "ชมพูแดง"
}
// หมึกบนพื้นพาสเทล — พาสเทลสว่าง ตัวอักษร/ไอคอนสีขาวจะจม ต้องใช้สีเข้ม
const ON_PASTEL = '#2b2924'
const DAYS_OPTIONS = [30, 60, 90, 180, 365]
// คนต่อบทบาท — ไม่มี "ทั้งหมด" เพราะบทบาทใหญ่สุดมี 54 คน กางแล้วเป็นแท่งยาวดันวงบานทั้งวง
// (วัด 2026-08-18: รวม ~271 คน เฉลี่ย 6.3/บทบาท แต่ตัวมากสุดพังผัง) · อยากดูครบใช้แผงขวา
const PEOPLE_OPTIONS = [5, 10]
const AVATAR_BG = ['#5865F2', '#57A55A', '#EAA83A', '#D8548A', '#DA4B48', '#7C6FE0', '#1F9AA0', '#E8804A']

const HUB_R = [52, 88]        // โหนดองค์กร — โตตามจำนวนโหนดลูก แต่ใหญ่กว่ากลุ่มเสมอ (GROUP_R สูงสุด 44)
const HUB_SCALE_AT = 120      // จำนวนลูกที่ถือว่าเต็มสเกล
const ROLE_R = [14, 30]
const PERSON_R = [11, 22]
const GROUP_R = [26, 44]
const TOOLBAR_H = 34           // ความสูงแถบเครื่องมือที่ลอยทับผังด้านล่าง
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
// วาดไอคอน lucide (viewBox 24x24, เส้น stroke) ให้พอดีวงกลมรัศมี r
function drawIcon(group, r, color) {
  const nodes = GROUP_ICON[group] || GROUP_ICON.other
  const scale = (r * 1.15) / 24
  const g = el('g', { transform: `translate(${-r * 0.575} ${-r * 0.575}) scale(${scale})` })
  g.setAttribute('fill', 'none')
  g.setAttribute('stroke', color)
  g.setAttribute('stroke-width', '2')
  g.setAttribute('stroke-linecap', 'round')
  g.setAttribute('stroke-linejoin', 'round')
  for (const [tag, attrs] of nodes) g.appendChild(el(tag, attrs))
  return g
}

// โหนดองค์กรโตตามจำนวนโหนดลูก — ใช้ sqrt เหมือนโหนดอื่น (พื้นที่วงกลมโตตามค่า ไม่ใช่รัศมี)
function hubRadius(childCount) {
  const t = Math.min(1, Math.sqrt(childCount) / Math.sqrt(HUB_SCALE_AT))
  return HUB_R[0] + (HUB_R[1] - HUB_R[0]) * t
}

function pillWidth(title, sub) {
  return Math.max(46, Math.max((title || '').length * 7.1, sub ? sub.length * 5.9 : 0) + 22)
}

// รูปโปรไฟล์: ใช้ avatar จริงจาก Discord ถ้ามี (cdn.discordapp.com อนุญาตแล้วใน next.config)
// แต่ org_members.avatar ยังว่างเกือบทั้งหมด (3/5550 ตอนเขียน — รอ backfillAvatars.js)
// → วาดวงกลมสีจากชื่อไว้ข้างใต้เสมอ เป็นทั้ง placeholder และ fallback ตอนรูปโหลดไม่ขึ้น
function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function avatarMarkup(name, r, url) {
  const seed = hash(name || '?')
  const bg = AVATAR_BG[seed % AVATAR_BG.length]
  const clipId = `oc-c${seed}-${Math.round(r * 10)}`
  const photo = url
    ? `<image href="${escAttr(url)}" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}"
             clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />`
    : ''
  return `
    <clipPath id="${clipId}"><circle r="${r}"/></clipPath>
    <g clip-path="url(#${clipId})">
      <circle r="${r}" fill="${bg}"/>
      <circle cy="${-r * 0.14}" r="${r * 0.33}" fill="#fff" opacity="0.94"/>
      <ellipse cy="${r * 0.68}" rx="${r * 0.56}" ry="${r * 0.5}" fill="#fff" opacity="0.94"/>
    </g>
    ${photo}
    <circle class="oc-avatar-border" r="${r}"/>`
}

function pillNode(topY, { title, sub, bg, titleColor, subColor, fs = 10, cls = '' }) {
  const w = pillWidth(title, sub)
  const h = sub ? 32 : 21
  const g = el('g', {})
  g.appendChild(el('rect', { class: `oc-pill ${cls}`.trim(), x: -w / 2, y: topY, width: w, height: h, rx: sub ? 8 : h / 2, fill: bg }))
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
function descendantsOf(node) {
  const out = []
  const stack = [...(node._kids || [])]
  while (stack.length) {
    const n = stack.pop()
    out.push(n)
    if (n._kids) stack.push(...n._kids)
  }
  return out
}

// คนของบทบาทเรียงเป็น "ตารางยื่นออกด้านนอกวง" (2 คอลัมน์) ไม่ใช่กางเป็นพัดกว้าง
// เพราะที่จองต้องคิดด้านข้าง: พัด 153° กินด้านข้าง ~500 หน่วย/บทบาท วงเลยบานจนกลางผังโล่ง
// ตาราง 2 คอลัมน์กินด้านข้างคงที่ ~2 ป้าย แล้วยาวออกด้านนอกซึ่งเป็นที่ว่างฟรี
function fanGeometry(roleR, people) {
  if (!people.length) return { cols: 0, cellW: 0, cellH: 0, r0: 0, chord: 0 }
  const maxPr = Math.max(...people.map(p => p.r))
  const maxPw = Math.max(...people.map(p => p.w))
  const cols = Math.min(2, people.length)
  const cellW = maxPw + 16
  const cellH = maxPr * 2 + 48
  return { cols, cellW, cellH, r0: roleR + maxPr + 44, chord: cols * cellW }
}

// เส้นรอบวงของวงรี (Ramanujan) หารด้วยรัศมีฐาน — วงกลม (kx=ky=1) ได้ 2π ตามเดิม
function ringPerimeter(kx, ky) {
  return Math.PI * (3 * (kx + ky) - Math.sqrt((3 * kx + ky) * (kx + 3 * ky)))
}

// aspect = กว้าง/สูงของกรอบวาดจริง — วางเป็นวงกลมในกรอบแบน 2.7:1 จะเหลือที่ว่างซ้ายขวาครึ่งจอ
// จึงยืดวงเป็นวงรีให้อัตราส่วนเท่ากรอบ (คงพื้นที่เดิม: kx*ky = 1) โหนดจึงโตขึ้นราว 1.5 เท่า
function buildLayout(visibleGroups, expandedRoles, collapsedGroups, t, aspect = 1) {
  const kx = Math.sqrt(Math.min(3, Math.max(1, aspect)))
  const ky = 1 / kx
  const perim = ringPerimeter(kx, ky)
  const nodes = []
  const edges = []
  const hub = { id: '__hub', kind: 'hub', x: 0, y: 0, r: HUB_R[0], halfW: HUB_R[0], halfH: HUB_R[0], fixed: true }
  nodes.push(hub)

  const allRoleScores = visibleGroups.flatMap(g => g.roles.map(r => r.totalScore))
  const groupScores = visibleGroups.map(g => g.roles.reduce((s, r) => s + r.totalScore, 0))

  // ⚠️ ความกว้างที่ใช้แบ่งส่วนมุม คิดจาก "ป้ายของบทบาทเอง" เท่านั้น
  // ห้ามเอาขนาดดอกคนมาบวก ไม่งั้นกางบทบาทเดียว = ตัวหารเปลี่ยน = ทุกกลุ่มขยับทั้งผัง (user: "กดทีเด้งที")
  // กลุ่มที่ยุบอยู่ก็ยังจองส่วนมุมเท่าเดิม แค่ไม่สร้างโหนดบทบาท — ยุบแล้วของที่เหลือต้องอยู่ที่เดิม
  const GAP = 26
  const groupPlans = visibleGroups.map((g, gi) => {
    const collapsed = collapsedGroups.has(g.groupName)
    const roles = g.roles.map(role => {
      const rad = scaleR(role.totalScore, allRoleScores, ROLE_R)
      const sub = role.top[0] ? `🔥 ${role.top[0].name}` : t('noActivity')
      // อันดับ 1 = รูปกลางของบทบาทเอง → แตกออกเฉพาะอันดับ 2 ลงไป (ไม่งั้นคนเดิมโผล่ 2 ที่)
      const rest = role.top.slice(1)
      const expanded = !collapsed && expandedRoles.has(role.roleId) && rest.length > 0
      // คิด "ดอกคน" ทุกบทบาทเสมอ ไม่ว่ากางอยู่หรือไม่ — จองที่ไว้ล่วงหน้า (user 2026-08-17)
      // กาง/ปิดทีหลังจึงไม่ต้องเบียดใคร เพราะที่ของมันถูกกันไว้ตั้งแต่แรกแล้ว
      const pScores = rest.map(m => m.score)
      const people = rest.map((m, i) => {
        const pr = scaleR(m.score, pScores, PERSON_R)
        const psub = t('scoreLabel', { score: fmtInt(m.score) })
        return { person: m, rank: i + 2, r: pr, sub: psub, w: Math.max(pr * 2, pillWidth(m.name, psub)) }
      })
      const fan = fanGeometry(rad, people)
      return { role, rad, sub, expanded, people, fan, hiddenCount: rest.length,
               width: Math.max(rad * 2, pillWidth(role.roleName, sub), fan.chord) + GAP }
    })
    return { group: g, gi, roles, collapsed, width: roles.reduce((s, r) => s + r.width, 0) }
  })

  const totalWidth = groupPlans.reduce((s, p) => s + p.width, 0) || 1
  // รัศมีวงบทบาท: เส้นรอบวงต้องยาวพอใส่ทุกอันโดยไม่เบียด
  const roleRing = Math.max(280, (totalWidth * 0.95) / perim)
  // เผื่อรัศมี hub ที่ใหญ่สุด + ครึ่งความสูงของโหนดกลุ่ม ไม่งั้นกลุ่มจะทับโหนดกลาง
  // (คิดจากแกนสั้นของวงรี = ky ไม่งั้นกลุ่มบน/ล่างจะเบียด hub)
  const groupRing = Math.max((HUB_R[1] + 78) / ky, roleRing * 0.42)

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
      x: Math.cos(mid) * groupRing * kx, y: Math.sin(mid) * groupRing * ky,
      r: gr, halfW: Math.max(gr, pillWidth(gLabel) / 2), halfH: (gr * 2 + 11 + 21) / 2,
      ringX: groupRing * kx, ringY: groupRing * ky,
      collapsed: !!plan.collapsed, roleCount: plan.group.roles.length,
    }
    nodes.push(gNode)
    edges.push({ a: hub, b: gNode })

    let rc = start
    for (const rp of plan.roles) {
      const rSpan = (rp.width / plan.width) * span
      const rMid = rc + rSpan / 2
      rc += rSpan
      const rNode = {
        // กลุ่มที่ยุบ: ยังสร้างโหนดไว้ให้ "ดันที่" ตอนคลายทับ แต่ไม่วาดและไม่มีเส้น
        // (ถ้าเอาออกจากการคำนวณเลย เพื่อนบ้านจะไม่ถูกดันเหมือนเดิม = ยุบทีขยับที)
        hidden: plan.collapsed,
        id: `r:${rp.role.roleId}`, kind: 'role', group: plan.group.groupName, role: rp.role,
        label: rp.role.roleName, sub: rp.sub, expanded: rp.expanded, hiddenCount: rp.hiddenCount,
        x: Math.cos(rMid) * roleRing * kx, y: Math.sin(rMid) * roleRing * ky,
        r: rp.rad, halfW: Math.max(rp.rad, pillWidth(rp.role.roleName, rp.sub) / 2),
        halfH: (rp.rad * 2 + 10 + 32) / 2,
        ringX: roleRing * kx, ringY: roleRing * ky,
      }
      nodes.push(rNode)
      if (!rNode.hidden) edges.push({ a: gNode, b: rNode })

      // คนของบทบาทที่แตกแล้ว — ตารางยื่นออก "ด้านนอก" วง (แกน u = ออกจากศูนย์กลาง, v = ด้านข้าง)
      if (rp.expanded) {
        const { cols, cellW, cellH, r0 } = rp.fan
        const a0 = Math.atan2(rNode.y, rNode.x)
        const ux = Math.cos(a0), uy = Math.sin(a0)
        rp.people.forEach((p, i) => {
          const row = Math.floor(i / cols), col = i % cols
          const rowN = Math.min(cols, rp.people.length - row * cols)   // แถวสุดท้ายไม่เต็มก็ให้อยู่กลาง
          const out = r0 + row * cellH
          const side = (col - (rowN - 1) / 2) * cellW
          nodes.push({
            id: `p:${rp.role.roleId}:${p.person.userId}`, kind: 'person', group: plan.group.groupName,
            person: p.person, rank: p.rank, role: rp.role, label: p.person.name, sub: p.sub,
            x: rNode.x + ux * out - uy * side, y: rNode.y + uy * out + ux * side,
            r: p.r, halfW: Math.max(p.r, pillWidth(p.person.name, p.sub) / 2), halfH: (p.r * 2 + 10 + 32) / 2,
          })
          // ยึดกับ "ช่องของตัวเอง" ไม่ใช่รัศมี — คลายทับแล้วต้องกลับเข้าตาราง ไม่ไหลไปรอบบทบาท
          const me = nodes[nodes.length - 1]
          me.homeX = me.x; me.homeY = me.y
          edges.push({ a: rNode, b: me })
        })
      }
    }
  }

  // ขนาดโหนดองค์กรนับจาก "ช่องที่จองไว้" ทั้งหมด ไม่ใช่โหนดที่วาดจริง
  // (นับโหนดจริงแล้ว hub จะหดตอนยุบกลุ่ม/กางคน → ขอบ hub ขยับ → เพื่อนบ้านถูกดันตาม = ผังไม่นิ่ง)
  const core = nodes.filter(n => n.kind !== 'person')
  hub.r = hubRadius(groupPlans.reduce((s, p) => s + p.roles.length, 0) + groupPlans.length)
  hub.halfW = hub.r; hub.halfH = hub.r

  // ดัชนีลูก — ลากพ่อแล้วต้องยกทั้งก้อนตามไป (กลุ่ม → บทบาท → คน)
  for (const e of edges) (e.a._kids ||= []).push(e.b)

  // คลายทับ 2 จังหวะ: กลุ่ม/บทบาทก่อน (ผลลัพธ์เท่าเดิมทุกครั้งเพราะ input ไม่ขึ้นกับการกาง)
  // แล้วตรึงไว้ ค่อยคลายเฉพาะ "คน" — คนจึงดันบทบาทไม่ได้ ผังหลักอยู่นิ่งตลอด
  relax(core)
  for (const n of core) n.fixed = true
  if (core.length < nodes.length) relax(nodes)
  for (const n of core) if (n.kind !== 'hub') n.fixed = false
  // โหนดที่จองที่ไว้เฉยๆ ไม่ต้องส่งออกไปวาด (และไม่ต้องนับในกรอบพอดีจอ)
  return { nodes: nodes.filter(n => !n.hidden), edges }
}

// คลายทับแบบ "กล่อง" — ป้ายชื่อไทยกว้างกว่าวงกลมมาก คิดแค่รัศมีป้ายจะทับกันเละ
// ใช้กริดหาเพื่อนบ้านแทน O(n²) เพราะโหนดแตะหลายร้อยได้ตอนแตกคนหลายบทบาท
function relax(nodes) {
  const movable = nodes.filter(n => !n.fixed)
  if (!movable.length) return
  const iterations = movable.length > 400 ? 70 : movable.length > 150 ? 120 : 200
  const cell = 150

  for (let it = 0; it < iterations; it++) {
    // กริดใส่ "ทุกโหนด" รวมตัวที่ตรึงไว้ด้วย — ตัวที่ขยับได้ต้องหลบตัวที่ตรึงเป็น
    const grid = new Map()
    for (const n of nodes) {
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
          // คู่ที่ขยับได้ทั้งคู่ คิดครั้งเดียว · ตัวที่ตรึงคิดได้เสมอ (มันไม่ขยับอยู่แล้ว)
          if (m === n || (!m.fixed && m.id <= n.id)) continue
          const ddx = m.x - n.x, ddy = m.y - n.y
          const ovX = (n.halfW + m.halfW + 12) - Math.abs(ddx)
          const ovY = (n.halfH + m.halfH + 8) - Math.abs(ddy)
          if (ovX > 0 && ovY > 0) {
            // ดันออกทางแกนที่ทับน้อยกว่า = ขยับสั้นสุดที่ทำให้หายทับ
            // ถ้าอีกฝั่งตรึงอยู่ ฝ่ายที่ขยับได้ต้องหลบเต็มระยะคนเดียว
            const share = m.fixed ? 1 : 0.5
            if (ovX < ovY) {
              const p = ovX * (ddx < 0 ? -1 : 1)
              n.x -= p * share; if (!m.fixed) m.x += p * share
            } else {
              const p = ovY * (ddy < 0 ? -1 : 1)
              n.y -= p * share; if (!m.fixed) m.y += p * share
            }
          }
        }
      }
    }
    for (const n of movable) {
      if (n.homeX !== undefined) {
        // คนดึงกลับเข้า "ช่องในตาราง" ของตัวเอง — โดนดันแล้วต้องคืนรูป ไม่ใช่ไหลไปเรื่อยๆ
        n.x += (n.homeX - n.x) * 0.2
        n.y += (n.homeY - n.y) * 0.2
      } else {
        // กลุ่ม/บทบาทยึดกับวงรีบ้านของตัวเอง — d=1 คืออยู่บนวงพอดี
        const d = Math.hypot(n.x / n.ringX, n.y / n.ringY) || 0.01
        const pull = (1 - 1 / d) * 0.08
        n.x -= n.x * pull; n.y -= n.y * pull
      }
    }
  }
}


// คืนตำแหน่งที่ผู้ใช้ลากไว้ลงบนผังที่เพิ่งคำนวณใหม่
// ⚠️ โหนดที่ "เพิ่งโผล่" (คนที่เพิ่งกาง / บทบาทในกลุ่มที่เพิ่งกางกลับ) จะไม่มีในของที่เก็บไว้
// ถ้าปล่อยไว้เฉยๆ มันจะไปนั่งตำแหน่งที่คำนวณจากพ่อ "ก่อนถูกลาก" = ลูกหลุดจากพ่อ เส้นลากข้ามจอ
// จึงต้องส่งต่อระยะที่พ่อถูกลาก (delta) ลงไปให้ลูกที่ยังไม่มีตำแหน่งของตัวเอง
function applySaved(nodes, edges, pos) {
  const delta = new Map()
  for (const n of nodes) {
    const p = pos[n.id]
    if (!p) continue
    delta.set(n, { dx: p.x - n.x, dy: p.y - n.y })
    n.x = p.x; n.y = p.y
  }
  // edges เรียงจากบนลงล่างอยู่แล้ว (hub → กลุ่ม → บทบาท → คน) วนรอบเดียวพอ
  for (const e of edges) {
    if (delta.has(e.b)) continue                 // ลูกมีตำแหน่งของตัวเองอยู่แล้ว
    const d = delta.get(e.a)
    if (!d) continue
    e.b.x += d.dx; e.b.y += d.dy
    if (e.b.homeX !== undefined) { e.b.homeX += d.dx; e.b.homeY += d.dy }
    delta.set(e.b, d)                            // ส่งต่อให้หลานด้วย
  }
}

export default function OrgChartClient() {
  const t = useTranslations('bot.orgchart')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(180)
  const [perRole, setPerRole] = useState(10)        // Top N คนต่อบทบาท (เท่า /panel orgchart)
  const [hiddenGroups, setHiddenGroups] = useState(() => new Set())
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())   // ยุบทั้งกลุ่ม (ต่างจากชิปที่ซ่อนหัวกลุ่มด้วย)
  const [expandedRoles, setExpandedRoles] = useState(() => new Set())
  // กางรายคนทุกบทบาทเป็นค่าเริ่มต้น — ที่ของทุกคนถูกจองไว้ในผังอยู่แล้ว
  // กาง/ปิดทีหลังจึงไม่มีอะไรขยับ (user 2026-08-17: "expand all ไปเลย จะได้จองที่ไว้เลย")
  const [autoExpand, setAutoExpand] = useState(true)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState('chart')
  const [isDark, setIsDark] = useState(false)
  const [isFull, setIsFull] = useState(false)
  const [railOpen, setRailOpen] = useState(true)    // เปิดไว้ตั้งแต่แรก — เป็นที่เดียวที่อ่านคะแนนรายคนได้ครบ

  const cardRef = useRef(null)
  const svgRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const dragRef = useRef(null)
  const tipRef = useRef(null)
  const viewRef = useRef(null)
  const panRef = useRef(null)
  const camKeyRef = useRef(null)        // กล้องตั้งต้นแล้วสำหรับชุดข้อมูลไหน (filterKey)
  const lastRectRef = useRef(null)      // ขนาดกรอบล่าสุด — ใช้คงระดับซูมตอนกรอบเปลี่ยน

  useEffect(() => {
    const read = () => setIsDark(document.documentElement.classList.contains('dark'))
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  const load = useCallback(() => {
    setLoading(true); setError(null)
    // API ส่งมา 10 คน/บทบาทเสมอ แล้วตัดเหลือ 5 ฝั่ง client — กดสลับไม่ต้องโหลดใหม่
    fetch(`/api/bot/orgchart?days=${days}`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        // ข้อมูลชุดใหม่ → สิ่งที่แตกไว้เป็น snapshot เก่าแล้ว ปิดลงให้หมด
        if (ok) { setData(d); setExpandedRoles(new Set()); setAutoExpand(true); setSelected(null) }
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

  const colorOf = useCallback(g => GROUP_COLOR[g] || GROUP_COLOR.other, [])
  const guildIcon = data?.guildIcon || null
  const guildName = data?.guildName || null

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
        // โชว์ทุกบทบาทที่มีความเคลื่อนไหว — จำกัดจำนวนไม่มีประโยชน์แล้วตั้งแต่ผังไม่ย่อให้พอดีจอ
        // (วัด 2026-08-18: 49 บทบาท 216 โหนด วาดใหม่ 293ms) · จะกรองให้น้อยลงใช้ชิปกลุ่ม/ค้นหา
        const roles = q ? g.roles.filter(r => r.roleName.toLowerCase().includes(q)) : g.roles
        // ตัดจำนวนคนฝั่ง client — API ส่งมา 10 คนเสมอ กดสลับ 5/10 จึงไม่ต้องโหลดใหม่
        return { ...g, roles: roles.map(r => (r.top.length > perRole ? { ...r, top: r.top.slice(0, perRole) } : r)) }
      })
      .filter(g => g.roles.length > 0)
  }, [activeGroups, hiddenGroups, query, perRole])

  const shownRoles = useMemo(() => visibleGroups.reduce((s, g) => s + g.roles.length, 0), [visibleGroups])

  const shownRoleIds = useMemo(() => visibleGroups.flatMap(g => g.roles.map(r => r.roleId)), [visibleGroups])
  // ชุดที่ "แตกอยู่จริง" — โหมด auto = ทุกบทบาทที่แสดงอยู่
  const effExpanded = useMemo(
    () => (autoExpand ? new Set(shownRoleIds) : expandedRoles),
    [autoExpand, shownRoleIds, expandedRoles]
  )

  const allExpanded = autoExpand || (shownRoleIds.length > 0 && shownRoleIds.every(id => effExpanded.has(id)))
  function toggleAllPeople() {
    if (allExpanded) { setAutoExpand(false); setExpandedRoles(new Set()) }
    else setAutoExpand(true)
  }

  // filterKey = "ชุดข้อมูลที่ดูอยู่" (guild/ช่วงวัน/Top N/คำค้น/ชิปกลุ่ม) — เปลี่ยนแล้วจัดกล้องใหม่ได้
  // layoutKey = filterKey + สิ่งที่กางอยู่ — ใช้แค่ตัดสินว่าต้องสร้างโหนดใหม่ ไม่แตะกล้อง
  const filterKey = useMemo(() => [
    data?.guildId || '', days, perRole, query.trim(),
    visibleGroups.map(g => `${g.groupName}:${g.roles.length}`).join('|'),
  ].join('#'), [data?.guildId, days, perRole, query, visibleGroups])

  const layoutKey = useMemo(
    () => [filterKey, [...effExpanded].sort().join(','), [...collapsedGroups].sort().join(',')].join('#'),
    [filterKey, effExpanded, collapsedGroups])

  const storageKey = data?.guildId ? `orgchart-pos:${data.guildId}` : null

  function canvasAspect() {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect?.width || !rect?.height) return 1
    return rect.width / Math.max(80, rect.height - TOOLBAR_H)
  }

  useEffect(() => {
    if (!visibleGroups.length) {
      // ปิดชิปหมดทุกกลุ่ม = ไม่มีอะไรให้แสดง — ต้องล้างภาพที่วาดไว้ด้วย
      // (เดิมล้างแต่ข้อมูล ผังเก่าเลยค้างบนจอทั้งที่ตัวนับบอกว่า 0 บทบาท)
      nodesRef.current = []; edgesRef.current = []
      if (svgRef.current) svgRef.current.innerHTML = ''
      return
    }
    const { nodes, edges } = buildLayout(visibleGroups, effExpanded, collapsedGroups, t, canvasAspect())
    if (storageKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
        // ผูกกับ filterKey ไม่ใช่ layoutKey — กาง/ยุบไม่ใช่ "ผังคนละอัน" อีกแล้ว
        // (ตำแหน่งกลุ่ม/บทบาทไม่ขึ้นกับสิ่งที่กางอยู่) ของที่ลากไว้จึงต้องอยู่ยงข้ามการกด
        // เปลี่ยนตัวกรอง (ช่วงวัน/คำค้น/ชิป) ยังทิ้งเหมือนเดิม เพราะชุดโหนดคนละชุดจริงๆ
        if (saved.key === filterKey && saved.pos) applySaved(nodes, edges, saved.pos)
      } catch { /* ค่าที่เก็บไว้เสีย → ใช้ผังที่คำนวณใหม่ */ }
    }
    nodesRef.current = nodes
    edgesRef.current = edges
    // จัดกล้องใหม่เฉพาะตอนเปลี่ยน "ชุดข้อมูลที่ดู" (guild/ช่วงวัน/Top N/คำค้น/ชิป)
    // กด กาง ยุบ ลาก = ภาพต้องนิ่งสนิท ไม่เลื่อนไม่ย่อเอง
    if (camKeyRef.current !== filterKey) { camKeyRef.current = filterKey; viewRef.current = null }
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, filterKey, storageKey, isDark, selected, guildIcon])

  // กรอบจากขอบจริงของผัง ไม่ใช่สมมาตรรอบ hub — โหนดหลุดไปมุมเดียวไม่ควรทำให้กรอบโต 2 เท่าทั้งวง
  function bounds() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of nodesRef.current) {
      minX = Math.min(minX, n.x - n.halfW); maxX = Math.max(maxX, n.x + n.halfW)
      minY = Math.min(minY, n.y - n.halfH); maxY = Math.max(maxY, n.y + n.halfH + 10)
    }
    const pad = 24
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad }
  }

  // ค่าเริ่มต้น = ซูม 100% (โหนดขนาดจริง) เล็งกลางผัง — user เคาะ 2026-08-17
  // แต่ห้ามเกินพอดีจอ: โหมด "ทั้งหมด" (49 บทบาท) ผังกว้าง 2 เท่าจอ ถ้าเริ่มที่ 100%
  // จะเห็นแค่ hub กับเส้นวิ่งออกนอกจอ = ดูเหมือนหน้าพัง จึงถอยมาพอดีจอเมื่อผังใหญ่เกิน
  function initialView() {
    const svg = svgRef.current
    if (!svg || !nodesRef.current.length) return
    const rect = svg.getBoundingClientRect()
    if (!rect.width) return
    fitView()
    const v = viewRef.current
    if (!v) return
    if (v.w <= rect.width) {
      // ผังเล็กกว่าจอ → หยุดที่ 100% ไม่ต้องซูมเข้าให้เกินขนาดจริง
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2
      viewRef.current = { x: cx - rect.width / 2, y: cy - rect.height / 2, w: rect.width, h: rect.height }
    } else {
      // ผังใหญ่กว่าจอ → เริ่มที่ 100% แต่ "เล็งชิดซ้าย" ไม่ใช่กลางผัง
      // กลางผังคือที่ว่างในวง เปิดมาจะเจอแต่ hub กับเส้น — ชิดซ้ายเจอโหนดเต็มจอตั้งแต่แรก
      const b = bounds()
      viewRef.current = {
        x: b.minX, y: (b.minY + b.maxY) / 2 - rect.height / 2,
        w: rect.width, h: rect.height,
      }
    }
    applyView()
  }

  // ขนาดกรอบเปลี่ยน (ย่อหน้าต่าง/เต็มจอ/พับแผงขวา) → คงระดับซูมกับจุดที่เล็งอยู่ ไม่กระตุกกลับ
  function reflowCamera() {
    const svg = svgRef.current, v = viewRef.current, last = lastRectRef.current
    if (!svg || !v || !last?.w) { initialView(); return }
    const rect = svg.getBoundingClientRect()
    if (!rect.width) return
    const unitsPerPx = v.w / last.w
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2
    const w = rect.width * unitsPerPx, h = rect.height * unitsPerPx
    viewRef.current = { x: cx - w / 2, y: cy - h / 2, w, h }
    applyView()
  }

  function fitView() {
    const nodes = nodesRef.current
    const svg = svgRef.current
    if (!nodes.length || !svg) return
    const b = bounds()
    const minX = b.minX, maxX = b.maxX, minY = b.minY, maxY = b.maxY
    const cw = Math.max(240, maxX - minX), ch = Math.max(240, maxY - minY)
    // viewBox ต้องอัตราส่วนเดียวกับกรอบจริง ไม่งั้น preserveAspectRatio จะ letterbox ทิ้งพื้นที่ครึ่งจอ
    // กันแถบล่างไว้ให้เครื่องมือที่ลอยทับผัง — ไม่งั้นโหนดล่างสุดโดนบัง
    const rect = svg.getBoundingClientRect()
    const usableH = Math.max(80, rect.height - TOOLBAR_H)
    const aspect = rect.width > 0 ? rect.width / usableH : cw / ch
    let w = cw, h = ch
    if (cw / ch < aspect) w = ch * aspect
    else h = cw / aspect
    const reserved = TOOLBAR_H * (h / usableH)
    viewRef.current = { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h: h + reserved }
    applyView()
  }
  function applyView() {
    const v = viewRef.current
    const svg = svgRef.current
    if (!v || !svg) return
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`)
    const rect = svg.getBoundingClientRect()
    if (rect.width) lastRectRef.current = { w: rect.width, h: rect.height }
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
        tabindex: '0',
        role: 'button', 'aria-label': n.label || 'hub',
      })
      const hit = (pillTop, pillH) => {
        const w = Math.max(n.r * 2, n.halfW * 2)
        wrap.appendChild(el('rect', { class: 'oc-hit', x: -w / 2, y: -n.r, width: w, height: n.r + pillTop + pillH }))
      }

      if (n.kind === 'hub') {
        // ไอคอน guild อย่างเดียว — ไม่ใส่ข้อความ ให้เป็นจุดยึดสายตาเฉยๆ
        const clip = `oc-hubclip`
        wrap.appendChild(el('clipPath', { id: clip })).appendChild(el('circle', { r: n.r }))
        wrap.appendChild(el('circle', { r: n.r, class: 'oc-hub' }))
        if (guildIcon) {
          wrap.appendChild(el('image', {
            href: guildIcon, x: -n.r, y: -n.r, width: n.r * 2, height: n.r * 2,
            'clip-path': `url(#${clip})`, preserveAspectRatio: 'xMidYMid slice',
          }))
        } else {
          const a = el('text', { y: 5, class: 'oc-hub-text', 'text-anchor': 'middle' })
          a.textContent = (guildName || t('orgHub')).slice(0, 8); wrap.appendChild(a)
        }
        wrap.appendChild(el('circle', { r: n.r, class: 'oc-hub-ring' }))
      } else if (n.kind === 'group') {
        hit(n.r + 11, 21)
        wrap.appendChild(el('circle', { r: n.r, fill: color, class: 'oc-fill' }))
        wrap.appendChild(drawIcon(n.group, n.r, ON_PASTEL))
        if (n.collapsed) {
          const more = el('g', { transform: `translate(${n.r * 0.72} ${n.r * 0.78})` })
          more.appendChild(el('circle', { r: 9, class: 'oc-more' }))
          const mt = el('text', { y: 3, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 800, class: 'oc-more-text' })
          mt.textContent = `+${n.roleCount}`; more.appendChild(mt)
          wrap.appendChild(more)
        }
        wrap.appendChild(pillNode(n.r + 11, { title: n.label, bg: color, titleColor: ON_PASTEL, fs: 11 }))
      } else if (n.kind === 'role') {
        wrap.innerHTML = avatarMarkup(n.role.top[0]?.name || n.label, n.r, n.role.top[0]?.avatar)
        hit(n.r + 10, 32)
        // วงแหวนสีกลุ่ม = เครื่องหมายว่านี่คือ "หัวบทบาท" (พ่อ) ไม่ใช่คนในบทบาท (ลูก)
        wrap.appendChild(el('circle', { r: n.r + 2, class: 'oc-parent-ring', stroke: color }))
        wrap.appendChild(el('circle', { r: n.r, class: 'oc-sel-ring' }))
        if (n.role.top.length) {
          // เลข 1 = รูปกลางนี้คืออันดับหนึ่งของบทบาท (ไม่มีโหนดลูกซ้ำอีก)
          const badge = el('g', { transform: `translate(${n.r * 0.72} ${-n.r * 0.72})` })
          badge.appendChild(el('circle', { r: 8, fill: color, class: 'oc-rank-dot' }))
          const bt = el('text', { y: 2.9, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: ON_PASTEL })
          bt.textContent = '1'; badge.appendChild(bt)
          wrap.appendChild(badge)
        }
        if (n.hiddenCount > 0 && !n.expanded) {
          // +N = ยังมีอีกกี่คนที่ซ่อนอยู่ กดแล้วกางออก
          const more = el('g', { transform: `translate(${n.r * 0.72} ${n.r * 0.78})` })
          more.appendChild(el('circle', { r: 8.5, class: 'oc-more' }))
          const mt = el('text', { y: 3, 'text-anchor': 'middle', 'font-size': 8.5, 'font-weight': 800, class: 'oc-more-text' })
          mt.textContent = `+${n.hiddenCount}`; more.appendChild(mt)
          wrap.appendChild(more)
        }
        // พ่อ = ป้ายสีกลุ่มเต็ม (ชุดเดียวกับหัวกลุ่ม) · ลูก = ป้ายพื้นเรียบ
        // เดิมลูกผสมสีเข้มกว่าพ่อ (22% vs 16%) เลยแยกไม่ออกว่าอันไหนพ่ออันไหนลูก
        wrap.appendChild(pillNode(n.r + 10, {
          title: n.label, sub: n.sub, bg: color,
          titleColor: ON_PASTEL, subColor: ON_PASTEL,
        }))
      } else {
        wrap.innerHTML = avatarMarkup(n.person.name, n.r, n.person.avatar)
        hit(n.r + 10, 32)
        // ลูก: ป้ายลำดับเป็นชิปกลางๆ ไม่ใช่สีกลุ่ม — สีกลุ่มสงวนไว้ให้ชั้นพ่อ
        const badge = el('g', { transform: `translate(${n.r * 0.72} ${-n.r * 0.72})` })
        badge.appendChild(el('circle', { r: 8, class: 'oc-more' }))
        const bt = el('text', { y: 2.9, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, class: 'oc-more-text' })
        bt.textContent = String(n.rank); badge.appendChild(bt)
        wrap.appendChild(badge)
        wrap.appendChild(pillNode(n.r + 10, {
          title: n.label, sub: n.sub, cls: 'oc-pill-child',
          bg: 'var(--card-bg)',
          titleColor: 'currentColor', subColor: 'currentColor', fs: 9.5,
        }))
      }

      // hub ลากได้เหมือนโหนดอื่น และลากแล้วผังตามไปทั้งยวง (user 2026-08-17)
      // เดิมส่ง moveKids=false ให้ hub → ลากหัวองค์กรแล้วมันหลุดออกจากผังตัวเอง
      attachDrag(wrap, n)
      svg.appendChild(wrap)
      n._g = wrap
    }

    if (!viewRef.current) initialView(); else applyView()
  }

  function tipHtml(n) {
    const esc = v => String(v).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const row = (label, val) => `<div class="oc-tip-row"><span>${label}</span><b>${val}</b></div>`
    if (n.kind === 'hub') {
      return `<div class="oc-tip-title">${esc(guildName || t('orgHub'))}</div>`
        + row(t('nodeCount', { count: '' }).trim(), fmtInt(nodesRef.current.length - 1))
        + `<div class="oc-tip-hint">${esc(t('tipClickCollapseAll'))}</div>`
    }
    if (n.kind === 'group') {
      const roles = n.groupData.roles
      const score = roles.reduce((a, r) => a + r.totalScore, 0)
      return `<div class="oc-tip-title">${esc(n.label)}</div>`
        + row(t('colRole'), fmtInt(roles.length))
        + row(t('colScore'), fmtInt(score))
        + `<div class="oc-tip-hint">${esc(n.collapsed ? t('tipClickExpandGroup') : t('tipClickCollapseGroup'))}</div>`
    }
    if (n.kind === 'role') {
      const top1 = n.role.top[0]
      return `<div class="oc-tip-title">${esc(n.role.roleName)}</div>`
        + row(t('colMembers'), fmtInt(n.role.memberCount))
        + row(t('colScore'), fmtInt(n.role.totalScore))
        + (top1 ? row(t('colTop'), esc(top1.name)) : '')
        // บทบาทที่มีคนแอคทีฟคนเดียว กดแล้วไม่มีอะไรกาง — อย่าไปชวนให้กด
        + (n.hiddenCount > 0
            ? `<div class="oc-tip-hint">${esc(n.expanded ? t('tipClickCollapseRole') : t('tipClickExpandRole'))}</div>`
            : '')
    }
    const m = n.person
    return `<div class="oc-tip-title">${esc(m.name)}</div>`
      + row(t('rankLabel', { rank: n.rank }), fmtInt(m.score))
      + row('💬', fmtInt(m.messages))
      + row('🔊', fmtVoice(m.voiceSeconds))
      + row('📣', fmtInt(m.mentions))
      + `<div class="oc-tip-hint">${esc(n.role.roleName)}</div>`
  }

  function showTip(n, e) {
    const tip = tipRef.current
    if (!tip) return
    tip.innerHTML = tipHtml(n)
    tip.classList.add('is-on')
    moveTip(e)
  }
  function moveTip(e) {
    const tip = tipRef.current
    if (!tip || !tip.classList.contains('is-on')) return
    const w = tip.offsetWidth, h = tip.offsetHeight
    // กันล้นขอบจอ — พลิกไปอีกด้านเมื่อชนขวา/บน
    const x = Math.min(e.clientX + 14, window.innerWidth - w - 8)
    const y = e.clientY - h - 14 < 8 ? e.clientY + 18 : e.clientY - h - 14
    tip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`
  }
  function hideTip() { tipRef.current?.classList.remove('is-on') }

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
      // ลูกทุกชั้นขยับตามเสมอ รวมถึงตอนลาก hub (= ยกผังทั้งอันไปวางที่ใหม่)
      const kids = descendantsOf(node).map(k => ({ k, x0: k.x, y0: k.y }))
      dragRef.current = { node, dx: node.x - pt.x, dy: node.y - pt.y, moved: 0,
                          ox: node.x, oy: node.y, kids }
      g.setPointerCapture(e.pointerId)
      hideTip()
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
      // ลูกทุกชั้นขยับด้วย delta เดียวกับพ่อ — รูปทรงของก้อนคงเดิม
      const ddx = nx - drag.ox, ddy = ny - drag.oy
      for (const { k, x0, y0 } of drag.kids) {
        k.x = x0 + ddx; k.y = y0 + ddy
        k._g?.setAttribute('transform', `translate(${k.x} ${k.y})`)
      }
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
    g.addEventListener('pointerenter', e => showTip(node, e))
    g.addEventListener('pointermove', e => { if (!dragRef.current) moveTip(e) })
    g.addEventListener('pointerleave', hideTip)
    g.addEventListener('focus', () => {
      const r = g.getBoundingClientRect()
      showTip(node, { clientX: r.left + r.width / 2, clientY: r.top })
    })
    g.addEventListener('blur', hideTip)
  }

  function savePositions() {
    if (!storageKey) return
    // เก็บคู่กับ filterKey · merge ของเดิมไว้ ไม่เขียนทับทั้งก้อน
    // (โหนดที่ยุบอยู่ตอนนี้ไม่มีใน nodesRef — ถ้าเขียนทับ ตำแหน่งที่เคยลากไว้จะหายตอนกางกลับ)
    let pos = {}
    try {
      const prev = JSON.parse(localStorage.getItem(storageKey) || '{}')
      if (prev.key === filterKey && prev.pos) pos = prev.pos
    } catch { /* ของเก่าเสีย → เริ่มใหม่ */ }
    for (const n of nodesRef.current) pos[n.id] = { x: Math.round(n.x), y: Math.round(n.y) }
    try { localStorage.setItem(storageKey, JSON.stringify({ key: filterKey, pos })) } catch { /* โควตาเต็ม — ไม่ critical */ }
  }

  function resetLayout() {
    if (storageKey) { try { localStorage.removeItem(storageKey) } catch { /* ไม่มีอะไรให้ลบ */ } }
    const { nodes, edges } = buildLayout(visibleGroups, effExpanded, collapsedGroups, t, canvasAspect())
    nodesRef.current = nodes; edgesRef.current = edges
    viewRef.current = null
    draw()
  }

  function onNodeClick(node) {
    if (node.kind === 'hub') {
      // ยุบทุกกลุ่มรวดเดียว (กดซ้ำ = กางกลับ)
      setCollapsedGroups(prev =>
        prev.size === visibleGroups.length ? new Set() : new Set(visibleGroups.map(g => g.groupName)))
      return
    }
    if (node.kind === 'group') {
      // คลิกหัวกลุ่ม = ยุบทั้งกลุ่ม (บทบาทกับคนหายหมด เหลือหัวกลุ่มไว้กดกลับ)
      setCollapsedGroups(prev => {
        const next = new Set(prev)
        next.has(node.group) ? next.delete(node.group) : next.add(node.group)
        return next
      })
      return
    }
    if (node.kind === 'role') {
      // กาง/ปิดเฉพาะอันที่กด — ที่ถูกจองไว้แล้ว กางหลายอันพร้อมกันก็ไม่เบียดใคร
      setSelected(node.role)
      const next = new Set(effExpanded)
      next.has(node.role.roleId) ? next.delete(node.role.roleId) : next.add(node.role.roleId)
      setAutoExpand(false); setExpandedRoles(next)
      return
    }
    if (node.kind === 'person') setSelected(node.role)
  }

  // ── เต็มจอ (Fullscreen API) — layout ของ /bot บีบไว้ที่ max-w-5xl จึงขยายในหน้าไม่ได้จริง
  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === cardRef.current
      setIsFull(on)
      // ขนาด svg เปลี่ยน → คงระดับซูมเดิมไว้ ไม่ดีดกลับไปพอดีจอเอง
      requestAnimationFrame(() => reflowCamera())
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await cardRef.current?.requestFullscreen()
    } catch { /* เบราว์เซอร์ไม่ให้ (iframe/permission) — ปล่อยผ่าน ไม่ต้องพัง */ }
  }

  // พับแผงขวา/สลับมุมมอง → กว้างของ svg เปลี่ยน แต่ระดับซูมต้องเท่าเดิม
  useEffect(() => { requestAnimationFrame(() => reflowCamera()) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railOpen, view])

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
    // นิ้วที่แตะอยู่บนพื้นหลัง — 2 นิ้ว = หนีบซูม (มือถือไม่มีสกรอลล์วีล)
    const pts = new Map()
    let pinch = null
    const onDown = e => {
      if (dragRef.current || !viewRef.current) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, v: { ...viewRef.current } }
        panRef.current = null                 // เปลี่ยนจากลากเป็นหนีบ อย่าแพนต่อ
        svg.classList.remove('is-panning')
        return
      }
      panRef.current = { cx: e.clientX, cy: e.clientY, v: { ...viewRef.current } }
      hideTip()
      svg.classList.add('is-panning')
      svg.setPointerCapture?.(e.pointerId)
    }
    const onMove = e => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const rect = svg.getBoundingClientRect()
        const v0 = pinch.v
        // ถ่างนิ้วออก (d โต) = viewBox เล็กลง = ซูมเข้า
        const w = Math.max(240, Math.min(24000, v0.w * (pinch.d / d)))
        const h = w * (v0.h / v0.w)
        // จุดใต้กึ่งกลางนิ้วต้องอยู่กับที่
        const fx = ((a.x + b.x) / 2 - rect.left) / rect.width
        const fy = ((a.y + b.y) / 2 - rect.top) / rect.height
        viewRef.current = { x: v0.x + fx * v0.w - fx * w, y: v0.y + fy * v0.h - fy * h, w, h }
        applyView()
        return
      }
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
      pts.delete(e.pointerId)
      if (pts.size < 2) pinch = null
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
    // svg ยัง mount ไม่เสร็จตอน loading — deps ว่างจะผูก listener ไม่ติดเลย (zoom/pan ตายเงียบ)
  }, [loading, error, view])

  // ย่อ/ขยายหน้าต่าง → อัตราส่วนกรอบเปลี่ยน ต้องปรับ viewBox ตามโดยคงระดับซูม
  useEffect(() => {
    const onResize = () => reflowCamera()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


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
    <div className="flex flex-col gap-3">
      <style jsx global>{`
        .oc-edge { stroke: #b9b3a5; stroke-width: 1.4; }
        .oc-edge-hub { stroke-width: 2; }
        .oc-edge-role { stroke-dasharray: 3 3; opacity: .7; }
        .dark .oc-edge { stroke: #5c5b56; }
        .oc-node { cursor: pointer; }
        .oc-hit { fill: transparent; }
        .oc-avatar-border { fill: none; stroke: var(--card-bg); stroke-width: 2.5; }
        .oc-sel-ring { fill: none; stroke: currentColor; stroke-width: 2.5; opacity: 0; }
        .oc-parent-ring { fill: none; stroke-width: 3; }
        .oc-pill-child { stroke: #ddd7c9; stroke-width: 1; }
        .dark .oc-pill-child { stroke: #4c4a45; }
        .oc-node.is-selected .oc-sel-ring { opacity: 1; }
        .oc-rank-dot { stroke: var(--card-bg); stroke-width: 2; }
        .oc-more { fill: #3f3d38; stroke: var(--card-bg); stroke-width: 2; }
        .dark .oc-more { fill: #6b6862; }
        .oc-more-text { fill: #fff; }
        .oc-fill, .oc-pill { transition: filter .12s ease; }
        .oc-node:hover .oc-fill, .oc-node:hover .oc-pill { filter: brightness(1.08); }
        .oc-hub { fill: var(--card-bg); }
        .oc-hub-ring { fill: none; stroke: #b9b3a5; stroke-width: 2.5; }
        .dark .oc-hub-ring { stroke: #5c5b56; }
        .oc-hub-text { fill: currentColor; font-size: 12px; font-weight: 800; }
        .oc-node:fullscreen, .oc-canvas:fullscreen { background: var(--card-bg); }
        :fullscreen { background: var(--card-bg); }
        .oc-tip {
          position: fixed; top: 0; left: 0; z-index: 60; pointer-events: none;
          opacity: 0; transition: opacity .1s ease; max-width: 250px;
          background: #1c1a16; color: #f5f3ef; border-radius: 10px; padding: 9px 11px;
          font-size: 12px; line-height: 1.45; box-shadow: 0 12px 28px -12px rgba(0,0,0,.55);
        }
        .dark .oc-tip { background: #34322d; }
        .oc-tip.is-on { opacity: 1; }
        .oc-tip-title { font-weight: 800; margin-bottom: 3px; }
        .oc-tip-row { display: flex; justify-content: space-between; gap: 14px; font-variant-numeric: tabular-nums; }
        .oc-tip-row span { opacity: .65; }
        .oc-tip-hint { margin-top: 5px; padding-top: 5px; border-top: 1px solid rgba(255,255,255,.15); opacity: .6; font-size: 10.5px; }
        .oc-canvas { touch-action: none; cursor: grab; }
        .oc-canvas.is-panning { cursor: grabbing; }
        .oc-node:focus-visible { outline: 2px solid var(--brand-orange); outline-offset: 2px; }
      `}</style>

      {/* หัวเรื่อง + สลับมุมมองอยู่แถวเดียวกัน — ทุก 50px ที่ประหยัดได้คือผังที่ใหญ่ขึ้น */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-xl font-bold text-warm-900 dark:text-disc-text">{t('title')}</h1>
          <p className="text-sm text-warm-500 dark:text-disc-muted">{t('subtitle')}</p>
        </div>
        <div className={`${CARD} flex gap-0.5 p-1`}>
          {['chart', 'table'].map(v => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                v === view ? 'bg-warm-900 dark:bg-disc-text text-white dark:text-disc-bg2' : 'text-warm-500 dark:text-disc-muted'}`}>
              {v === 'chart' ? t('viewNetwork') : t('viewTable')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className={`${CARD} flex items-center gap-2 px-3 py-2 w-[9.5rem] sm:w-[11rem] shrink-0`}>
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
          {PEOPLE_OPTIONS.map(n => (
            <button key={n} type="button" onClick={() => setPerRole(n)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg ${
                n === perRole ? 'bg-orange text-white' : 'text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'}`}>
              {t('peoplePerRole', { n })}
            </button>
          ))}
        </div>
        {/* ชิปกรองกลุ่ม — กดเปิด/ปิดกลุ่มบนกราฟ · อยู่แถวเดียวกับตัวกรองเพื่อไม่กินความสูงของผัง */}
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
              {(() => { const I = GROUP_LUCIDE[g.groupName] || FolderOpen; return <I size={13} /> })()}
              {t(`groups.${g.groupName}`)}
              <span className="tabular-nums opacity-60">{g.roles.length}</span>
            </button>
          )
        })}
      </div>

      <div ref={tipRef} className="oc-tip" role="tooltip" aria-hidden="true" />

      <div className={`grid gap-4 items-start ${
        railOpen && !isFull ? 'lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,340px)]' : 'grid-cols-1'}`}>
        {view === 'chart' ? (
          <div ref={cardRef} className={`${CARD} relative p-2 ${isFull ? 'rounded-none border-0' : ''}`}>
            {!visibleGroups.length && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
                <p className="text-sm text-warm-500 dark:text-disc-muted text-center max-w-[32ch]">
                  {query.trim() ? t('noRoleMatch') : t('noGroupSelected')}
                </p>
              </div>
            )}
            <svg ref={svgRef}
              className={`oc-canvas w-full text-warm-900 dark:text-disc-text ${
                isFull ? 'h-[calc(100vh-16px)]' : 'h-[calc(100vh-285px)] min-h-[440px]'}`}
              role="img" aria-label={t('title')} />
            {/* เครื่องมือลอยทับผัง ไม่กินความสูง — แถบใต้ผังเดิมกินไป ~66px ทุกจอ */}
            <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <p className="hidden md:block text-xs text-warm-500 dark:text-disc-muted">{t('hint')}</p>
              <div className="pointer-events-auto ml-auto flex max-w-full items-center gap-2.5 sm:gap-2 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg/85 backdrop-blur-sm px-2 py-1.5">
                <span className="hidden sm:inline text-xs text-warm-400 dark:text-disc-muted tabular-nums">
                  {t('rolesShown', { shown: shownRoles, total: totalActiveRoles })}
                </span>
                <button type="button" onClick={toggleAllPeople} aria-pressed={allExpanded}
                  title={allExpanded ? t('collapseAllPeople') : t('expandAllPeople')}
                  className={`flex items-center gap-1 text-xs font-semibold ${
                    allExpanded ? 'text-orange' : 'text-warm-500 dark:text-disc-muted hover:text-orange'}`}>
                  {allExpanded ? <UsersRound size={13} /> : <User size={13} />}
                  <span className="hidden sm:inline">{allExpanded ? t('collapseAllPeople') : t('expandAllPeople')}</span>
                </button>
                <button type="button" onClick={fitView} title={t('fitView')}
                  className="flex items-center gap-1 text-xs font-medium text-warm-500 dark:text-disc-muted hover:text-orange">
                  <Maximize2 size={13} /> <span className="hidden sm:inline">{t('fitView')}</span>
                </button>
                {!isFull && (
                  <button type="button" onClick={() => setRailOpen(o => !o)}
                    className="hidden lg:flex items-center gap-1 text-xs font-medium text-warm-500 dark:text-disc-muted hover:text-orange">
                    {railOpen ? <PanelRightClose size={12} /> : <PanelRightOpen size={12} />}
                    {railOpen ? t('hideRail') : t('showRail')}
                  </button>
                )}
                <button type="button" onClick={toggleFullscreen} title={isFull ? t('exitFullscreen') : t('fullscreen')}
                  className="flex items-center gap-1 text-xs font-semibold text-orange hover:opacity-80">
                  {isFull ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  <span className="hidden sm:inline">{isFull ? t('exitFullscreen') : t('fullscreen')}</span>
                </button>
                <button type="button" onClick={resetLayout} title={t('resetLayout')}
                  className="flex items-center gap-1 text-xs font-medium text-warm-500 dark:text-disc-muted hover:text-orange">
                  <RotateCcw size={13} /> <span className="hidden sm:inline">{t('resetLayout')}</span>
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

        {railOpen && !isFull && (
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
                      <svg viewBox="-18 -18 36 36" className="w-[30px] h-[30px]" dangerouslySetInnerHTML={{ __html: avatarMarkup(m.name, 18, m.avatar) }} />
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
        )}
      </div>
    </div>
  )
}
