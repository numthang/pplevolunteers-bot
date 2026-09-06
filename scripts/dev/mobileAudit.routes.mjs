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
  { path: '/cases' },   // ⚠️ '/case' เป็น 404 — audit เดินผ่านหน้า 404 แล้วรายงาน "ผ่าน" (แก้ 2026-09-03)
  { path: '/calling' },
  { path: '/finance' },
  { path: '/posts' },
  {
    path: '/posts/42',
    steps: [
      { wait: 1200 },
      { click: 'img[alt^="สื่อ"]', label: 'เปิดกล่องแก้ไขรูป' },
    ],
  },
  { path: '/docs' },
  {
    path: '/team',
    // ⚠️ ปุ่มสลับมุมมองยังไม่ถูก render จนกว่า /api/bot/orgchart จะตอบ — settleDom นับ element นิ่ง
    //    แต่ fetch ตอบช้ากว่านั้น ถ้าไม่รอ 2 วิ จะได้ "หา selector ไม่เจอ" ทั้งชุด (เจอเอง 2026-09-06)
    steps: [
      { wait: 2000 },
      { click: 'button[data-view="chart"]', label: 'สลับไปผังเครือข่าย' },
      { click: 'button[data-view="table"]', label: 'สลับไปตาราง' },
      { click: 'button[data-view="bubble"]', label: 'กลับมากระดานฟองสบู่' },
      { wait: 1200 },
    ],
  },
  { path: '/org' },
  { path: '/bot' },
  { path: '/complaint' },
  { path: '/cooking' },
  { path: '/profile' },
  { path: '/admin' },
  { path: '/integrations' },
]

export default ROUTES
