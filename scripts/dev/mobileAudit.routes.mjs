/**
 * รายชื่อหน้าที่ `mobileAudit.mjs` เดินตรวจ + ท่ากดเปิดของที่ซ่อนอยู่
 *
 * ⭐ ทำไมต้องมี `steps`: probe เห็นเฉพาะสิ่งที่ render อยู่จริงตอนนั้น — dropdown/modal ไม่ได้เปิดตอนโหลด
 *    ถ้าไม่มีขั้นนี้ panel `w-64/w-72` ที่ลอยออกนอกจอจะไม่ถูกตรวจเลย
 *
 * รูปแบบ step:
 *   { click: '<css selector>', label: 'อธิบายสั้นๆ' }   กด แล้ว probe ซ้ำ
 *   { esc: true }                                       กด Escape ปิดของที่เปิดค้าง
 *   { wait: 600 }                                       รอเพิ่ม (ms)
 *
 * ⚠️ selector ที่ผูกกับ `aria-label` ภาษาไทย = ผูกกับ `web/locales/th.json`
 *    แก้คำแปลเมื่อไหร่ต้องมาแก้ที่นี่ด้วย (สคริปต์จะเตือนว่า "หา selector ไม่เจอ" ไม่ใช่เงียบ)
 */

export const ROUTES = [
  {
    path: '/kanban',
    steps: [
      { click: 'button[aria-label="ตัวกรอง"]', label: 'เปิดกรวยกรอง' },
      { click: 'button[aria-label="เรียงลำดับ"]', label: 'เปิดเมนูเรียงลำดับ' },
      { esc: true },
      { click: 'div[role="button"][tabindex="0"]', label: 'เปิดการ์ดใบแรก' },
    ],
  },
  { path: '/' },
  { path: '/dashboard' },
  { path: '/case' },
  { path: '/calling' },
  { path: '/finance' },
  { path: '/posts' },
  { path: '/docs' },
  { path: '/team' },
  { path: '/org' },
  { path: '/bot' },
  { path: '/complaint' },
  { path: '/cooking' },
  { path: '/profile' },
  { path: '/admin' },
  { path: '/integrations' },
]

export default ROUTES
