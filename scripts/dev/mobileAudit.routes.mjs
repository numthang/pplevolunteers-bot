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
 *   { waitFor: '<css selector>' }                       รอจนของโผล่ (เพดาน 15 วิ)
 *
 * ⭐ step ที่อยู่ **หัวแถว** (wait/waitFor) ถูกใช้ก่อน probe แรก — หน้าที่ fetch หลัง mount ต้องมี
 *    ไม่งั้นวัดตอนยัง "กำลังโหลด…" แล้วรายงาน "ผ่าน" ทั้งที่ไม่เคยเห็นการ์ดสักใบ
 *    **ถ้ารู้ว่ารออะไรอยู่ ใช้ `waitFor` เสมอ** — `wait` เป็นเวลาตายตัว แข่งกับเวลา compile ของ
 *    dev server แล้วผลตรวจเปลี่ยนไปมาคนละรอบ (เจอเอง 2026-09-19 ที่ /calling/assignments/70)
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
  {
    // ⚠️ ต้องรอของโผล่ — `settleDom` นับ element นิ่ง แต่มันนิ่งอยู่ที่ "กำลังโหลด…" เลยเลิกรอตั้งแต่ ~1 วิ
    //    ⇒ probe เจอแค่หน้าโหลด + step กดจะได้ "หา selector ไม่เจอ" (เจอเอง 2026-09-10)
    //    เคยใช้ `wait: 4000` แล้วยังแพ้เวลา compile เป็นบางรอบ (2026-09-19) — waitFor ไม่แพ้
    path: '/calling/assignments/70',
    steps: [
      { waitFor: 'div.cursor-pointer.min-w-0' },
      { click: 'div.cursor-pointer.min-w-0', label: 'เปิด modal บันทึกการโทร' },
    ],
  },
  { path: '/finance' },
  // ⚠️ ทั้งสองหน้าดึงข้อมูลด้วย fetch หลัง mount — ไม่รอ = probe วัดตอน "ยังไม่มีรอบจ่าย"/"กำลังโหลด…"
  //    แล้วรายงาน "ผ่าน" ทั้งที่ไม่เคยเห็นการ์ดหรือรายการสักแถว (เจอเอง 2026-09-19 · 74 element เทียบกับ 167)
  { path: '/finance/payouts',   steps: [{ waitFor: 'a[href^="/finance/payouts/"]' }] },
  { path: '/finance/payouts/1', steps: [{ waitFor: 'input[type="checkbox"]' }] },
  { path: '/posts' },
  {
    path: '/posts/42',
    steps: [
      { wait: 1200 },
      { click: 'img[alt^="สื่อ"]', label: 'เปิดกล่องแก้ไขรูป' },
    ],
  },
  // หน้าอ่านบทพูด — แถบควบคุมมีปุ่ม/สเต็ปเปอร์หลายตัวในแถวเดียว จุดเสี่ยงล้นอยู่ตรงนั้น
  // ⚠️ ต้องชี้ไปโพสต์ที่ **มี `bodies.script` จริง** ไม่งั้นเจอแค่ empty state แล้วตรวจไม่ถึงแถบควบคุม
  //    (1047 = บทความนกเงือกบางกะม่า — เนื้อหายาวพอให้บทเลื่อนได้จริง)
  { path: '/posts/1047/script', steps: [{ wait: 1200 }] },
  { path: '/docs' },
  {
    path: '/team',
    // ⚠️ ปุ่มสลับมุมมองยังไม่ถูก render จนกว่า /api/bot/orgchart จะตอบ — settleDom นับ element นิ่ง
    //    แต่ fetch ตอบช้ากว่านั้น ถ้าไม่รอให้ปุ่มโผล่ จะได้ "หา selector ไม่เจอ" ทั้งชุด (เจอเอง 2026-09-06)
    steps: [
      { waitFor: 'button[data-view="chart"]' },
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
