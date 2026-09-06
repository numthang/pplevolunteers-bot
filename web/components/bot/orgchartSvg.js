// เครื่องมือวาด SVG ที่ใช้ร่วมกันระหว่างผังทีม (OrgChartClient) กับกระดานอันดับ (OrgChartBubbles)
// ทั้งสองหน้าวาดผ่าน DOM API ไม่ผ่าน React state ต่อโหนด — ตอนลาก/แพนต้องได้ 60fps

export const NS = 'http://www.w3.org/2000/svg'
export const AVATAR_BG = ['#5865F2', '#57A55A', '#EAA83A', '#D8548A', '#DA4B48', '#7C6FE0', '#1F9AA0', '#E8804A']

export function el(tag, attrs) {
  const e = document.createElementNS(NS, tag)
  for (const k in attrs) e.setAttribute(k, attrs[k])
  return e
}

export function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

export function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function fmtInt(n) { return Number(n || 0).toLocaleString('th-TH') }

export function fmtVoice(sec) {
  if (!sec) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

// รูปโปรไฟล์: ใช้ avatar จริงจาก Discord ถ้ามี (cdn.discordapp.com อนุญาตแล้วใน next.config)
// คนที่ไม่มีรูปยังมีจริง → วาดวงกลมสีจากชื่อไว้ข้างใต้เสมอ เป็นทั้ง placeholder และ fallback ตอนรูปโหลดไม่ขึ้น
// (วัด 2026-09-06: 93 ใน 100 คนที่คะแนนสูงสุดมีรูปแล้ว — คอมเมนต์เก่าที่ว่า 3/5550 ล้าสมัยไปแล้ว)
// uid = ตัวกันชน id ซ้ำเวลามีหลายวงบนจอเดียวกัน (ชื่อ+รัศมีเท่ากันได้)
export function avatarMarkup(name, r, url, uid = '') {
  const seed = hash(name || '?')
  const bg = AVATAR_BG[seed % AVATAR_BG.length]
  const clipId = `oc-c${seed}-${Math.round(r * 10)}${uid ? `-${uid}` : ''}`
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
