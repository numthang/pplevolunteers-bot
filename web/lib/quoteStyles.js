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

/** คีย์ที่อ่านจาก DB/config อาจเป็นของเก่า — ผ่านตัวนี้ก่อนใช้เสมอ */
export const normalizeStyle = key => LEGACY_STYLE_ALIAS[key] || key
