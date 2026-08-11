// web/lib/quoteStyles.js — quote style metadata (ESM, สำหรับ web layer)
// ⚠️ ต้อง sync กับ utils/quoteStyleKeys.js (bot, CJS) — แก้ที่นึงต้องแก้อีกที่
// แยกไฟล์เพราะ bot ใช้ require() (CJS) ส่วน Next.js ใช้ import (ESM) และ utils/ อยู่นอก web root
//
// คำเรียก (เคาะ 2026-08-07):
//   style = คีย์รวมที่เก็บใน DB · layout = การวาง · finish = การลงสี · style = finish + '-' + layout

export const FINISHES = [
  { value: 'shade', label: 'เงา',     description: 'เงาสีแบรนด์ทับบนรูป — รูปยังเห็นสีจริง' },
  { value: 'solid', label: 'ทึบ',     description: 'แถบสีแบรนด์ วางคำคมในแถบ' },
  { value: 'duo',   label: 'ดูโอโทน', description: 'ย้อมรูปทั้งใบเป็นสีแบรนด์ — ปุ่มสีภาพไม่มีผล' },
]

export const LAYOUTS = [
  { value: 'bottom-left',  label: 'ล่างซ้าย' },
  { value: 'bottom-right', label: 'ล่างขวา' },
  { value: 'top-left',     label: 'บนซ้าย' },
  { value: 'top-right',    label: 'บนขวา' },
  { value: 'center',       label: 'กลางภาพ' },
  { value: 'pillar',       label: 'เสาซ้าย' },
  { value: 'frame',        label: 'กรอบขวา' },
  { value: 'matte',        label: 'รูปลอย' },
  { value: 'side-left',    label: 'คอลัมน์ซ้าย' },
  { value: 'side-right',   label: 'คอลัมน์ขวา' },
]

// คู่ที่มีจริง — คู่ที่ไม่อยู่ในนี้ ปุ่มต้องจางกดไม่ได้ ไม่ใช่หายไป
export const COMBOS = {
  shade: ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'pillar', 'frame', 'center', 'side-left', 'side-right'],
  solid: ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'matte'],
  duo:   ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'pillar', 'frame', 'center', 'side-left', 'side-right'],
}

export const styleKey = (finish, layout) => `${finish}-${layout}`

export function splitStyle(key) {
  const i = (key || '').indexOf('-')
  if (i < 0) return { finish: null, layout: null }
  return { finish: key.slice(0, i), layout: key.slice(i + 1) }
}

/** คู่นี้เรนเดอร์ได้ไหม — ใช้ตัดสินว่าปุ่มควรจางหรือกดได้ */
export const comboExists = (finish, layout) => !!COMBOS[finish]?.includes(layout)

/** ถ้าคู่ปัจจุบันใช้ไม่ได้ ให้ย้ายไป layout แรกที่ finish นั้นรองรับ */
export const fallbackLayout = finish => COMBOS[finish]?.[0] || 'bottom-left'

const labelOf = (list, v) => list.find(x => x.value === v)?.label || v

export const QUOTE_STYLE_OPTIONS = Object.entries(COMBOS).flatMap(([finish, layouts]) =>
  layouts.map(layout => ({
    value: styleKey(finish, layout),
    label: `${labelOf(FINISHES, finish)} · ${labelOf(LAYOUTS, layout)}`,
    finish,
    layout,
  }))
)

export const QUOTE_TEMPLATE_CHOICES = [
  { value: 'random', label: '🎲 สุ่ม', description: 'สุ่มสไตล์จากทั้งหมด' },
  ...QUOTE_STYLE_OPTIONS,
]

export const QUOTE_STYLE_KEYS = ['random', ...QUOTE_STYLE_OPTIONS.map(o => o.value)]

// ── การ์ดแบบไม่มีรูป (2026-08-10) ─────────────────────────────────────────────
//
// ⛔ **ห้ามยัดเข้า COMBOS/QUOTE_STYLE_KEYS** แม้คีย์จะหน้าตาเหมือนกัน — 3 เหตุผล:
//   1. `renderQuoteStyle()` สุ่มจาก STYLES ทั้งกอง · plain หลุดเข้าไป = คนกดคำคมจากรูปในดิสฯ
//      แล้วสุ่มได้การ์ดพื้นสี รูปที่เลือกมาโดนทิ้งเงียบๆ
//   2. `/api/org/orgs/[id]/brand` validate `quote_default_template` ด้วย QUOTE_STYLE_KEYS —
//      ตั้ง plain เป็น default เมื่อไหร่ บอทเรนเดอร์ไม่ได้เลย (STYLES ไม่มีคีย์นี้)
//   3. signature คนละแบบ: STYLES เป็น (buf, opts) ส่วน renderPlain ไม่รับ buffer
export const PLAIN_BGS = [
  { value: 'flat', bg: 'solid',    label: 'สีทึบ',   description: 'พื้นสีแบรนด์ล้วน' },
  { value: 'fade', bg: 'gradient', label: 'ไล่เฉด',  description: 'พื้นสีแบรนด์ไล่เข้ม' },
  { value: 'mark', bg: 'mark',     label: 'ลายคำพูด', description: 'พื้นสีแบรนด์ + เครื่องหมายคำพูดจางเป็นลาย' },
  { value: 'logo', bg: 'logo',     label: 'ลายน้ำ',  description: 'พื้นสีแบรนด์ + ลายน้ำขององค์กรจางเป็นลาย' },
]

export const PLAIN_PREFIX = 'plain-'
export const plainKey = v => `${PLAIN_PREFIX}${v}`
export const isPlainStyle = key => typeof key === 'string' && key.startsWith(PLAIN_PREFIX)
export const PLAIN_STYLE_KEYS = PLAIN_BGS.map(b => plainKey(b.value))

/** คีย์ `plain-<v>` → ค่า `bg` ที่ renderPlain กิน · null = ไม่ใช่คีย์ plain ที่รู้จัก */
export const plainBgOf = key =>
  PLAIN_BGS.find(b => plainKey(b.value) === key)?.bg || null

// ขนาดการ์ดไม่มีรูป — ไม่มีไฟล์ให้เอาสัดส่วนมา ผู้ใช้จึงเลือกเองเหมือนตอนครอปรูป (2026-08-11)
// คีย์ต้องตรงกับ `ASPECTS` ใน QuoteGeneratorModal.jsx
export const PLAIN_SIZES_BY_ASPECT = {
  '1:1':  { width: 1080, height: 1080 },
  '4:5':  { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
}
export const DEFAULT_ASPECT = '4:5'
export const plainSizeOf = key => PLAIN_SIZES_BY_ASPECT[key] || PLAIN_SIZES_BY_ASPECT[DEFAULT_ASPECT]

/** ส้ม CI ของ renderer — ต้องตรงกับ `ORANGE` ใน `utils/quoteStyles.js` (ใช้ตอนไม่มีใครตั้งสีไว้) */
export const DEFAULT_ACCENT = '#ff6a13'
export const HEX_RE = /^#[0-9a-fA-F]{6}$/

// ⚠️ คีย์ต้องตรงกับ PLAIN_FONTS ใน `utils/quoteStyles.js` (renderer ตัวจริง)
export const PLAIN_FONTS = [
  { value: 'anakotmai', label: 'อนาคตใหม่', description: 'ฟอนต์แบรนด์ — ไม่มีหัว' },
  { value: 'gsans',     label: 'Google Sans', description: 'มีหัว ทันสมัย' },
  { value: 'sarabun',   label: 'สารบรรณ',    description: 'มีหัว ทรงราชการ' },
]

// ขนาดฟอนต์ — slider % ต่อเนื่อง (เดิมเป็น 3 ปุ่ม s/m/l ตัดเป็น slider แล้ว 2026-08-11
// เพราะ preset แค่ 3 ระดับยังโดน fitFont หรี่ตัวเองกลับมาบรรจบกันได้สำหรับคำคมบางความยาว)
// ⚠️ ค่าต้องตรงกับ TEXT_SIZE_MIN/MAX/DEFAULT ใน `utils/quoteStyles.js`
export const TEXT_SIZE_MIN = 60
export const TEXT_SIZE_MAX = 140
export const TEXT_SIZE_DEFAULT = 100
export const TEXT_SIZE_STEP = 5

export const isPlainFont = v => PLAIN_FONTS.some(f => f.value === v)
export const isPlainTextSize = v => {
  const n = Number(v)
  return Number.isFinite(n) && n >= TEXT_SIZE_MIN && n <= TEXT_SIZE_MAX
}

// คีย์เก่าก่อนเปลี่ยนชื่อ 2026-08-07 — ห้ามลบ การ์ดที่ทำไปแล้วยังอ้างคีย์พวกนี้อยู่
export const LEGACY_STYLE_ALIAS = {
  'quote-1-ember-bottom-left':  'shade-bottom-left',
  'quote-1-ember-bottom-right': 'shade-bottom-right',
  'quote-1-ember-top-left':     'shade-top-left',
  'quote-1-ember-top-right':    'shade-top-right',
  'quote-1-pillar-left':        'shade-pillar',
  'quote-1-frame-right':        'shade-frame',
  'quote-2-center':             'shade-center',
  // สไตล์ AI ถอดออก 2026-08-10 (AI เลือกแค่ตำแหน่ง+สี ซึ่งคนเลือกเองอยู่แล้ว)
  // การ์ด/config ที่เก็บคีย์ 'ai' ไว้ยัง render ได้ แต่ตกเป็นสไตล์คงที่ ไม่สุ่ม (กด render ซ้ำต้องได้ผลเดิม)
  'quote-1-ember-ai':           'shade-bottom-left',
  'ai':                         'shade-bottom-left',
  'shade-side':                'shade-side-right',
  'duo-side':                  'duo-side-right',
}

// 6 จุดที่ลายน้ำลงได้ (คู่กับ WM_SPOTS ใน utils/quoteStyleKeys.js — แก้ต้องแก้คู่กัน)
// เว็บใช้แค่ validate ค่าจาก client + ทำ dropdown · ตรรกะเลี่ยงข้อความอยู่ฝั่งบอทที่แปะจริง
export const WM_SPOTS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']

/** คีย์ที่อ่านจาก DB/config อาจเป็นของเก่า — ผ่านตัวนี้ก่อนใช้เสมอ */
export const normalizeStyle = key => LEGACY_STYLE_ALIAS[key] || key
