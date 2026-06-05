// web/lib/quoteStyles.js — quote style metadata (ESM, สำหรับ web layer)
// ⚠️ ต้อง sync กับ utils/quoteStyleKeys.js (bot, CJS) — แก้ที่นึงต้องแก้อีกที่
// แยกไฟล์เพราะ bot ใช้ require() (CJS) ส่วน Next.js ใช้ import (ESM) และ utils/ อยู่นอก web root

export const QUOTE_AI_KEY = 'quote-1-ember-ai'

export const QUOTE_STYLE_OPTIONS = [
  { value: 'quote-1-ember-bottom-left',  label: 'ember ล่างซ้าย', description: 'gradient ล่าง · ซ้าย' },
  { value: 'quote-1-ember-bottom-right', label: 'ember ล่างขวา',  description: 'gradient ล่าง · ขวา' },
  { value: 'quote-1-ember-top-left',     label: 'ember บนซ้าย',   description: 'gradient บน · ซ้าย' },
  { value: 'quote-1-ember-top-right',    label: 'ember บนขวา',    description: 'gradient บน · ขวา' },
  { value: 'quote-1-pillar-left',        label: 'pillar-left',    description: 'frame decoration · ซ้าย' },
  { value: 'quote-1-frame-right',        label: 'frame-right',    description: 'กรอบส้ม · ขวา' },
  { value: 'quote-2-center',             label: 'center',         description: 'กลางภาพ · ดำคลุม' },
]

// ตัวเลือก default template (มี AI เป็นตัวแรก) + ตัวเลือก "ใช้ค่าระดับล่าง" = ลบค่า (null)
export const QUOTE_TEMPLATE_CHOICES = [
  { value: QUOTE_AI_KEY, label: '✨ AI จัดให้', description: 'ember-ai เลือกตำแหน่ง+สีเอง' },
  ...QUOTE_STYLE_OPTIONS,
]

export const QUOTE_STYLE_KEYS = [QUOTE_AI_KEY, ...QUOTE_STYLE_OPTIONS.map(o => o.value)]
