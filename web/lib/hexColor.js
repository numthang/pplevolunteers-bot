// รับ hex code ที่พิมพ์/วางเอง — เติม # ให้ถ้าลืม, ขยายแบบย่อ 3 หลัก (#f80 → #ff8800)
// คืน '#rrggbb' ตัวพิมพ์เล็กถ้ารูปแบบถูกต้อง ไม่งั้นคืน null
export function normalizeHex(raw) {
  let s = (raw || '').trim()
  if (!s) return null
  if (s[0] !== '#') s = '#' + s
  if (/^#[0-9a-fA-F]{3}$/.test(s)) s = '#' + s.slice(1).split('').map(c => c + c).join('')
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null
}
