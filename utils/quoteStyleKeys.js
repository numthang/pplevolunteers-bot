// utils/quoteStyleKeys.js — รายชื่อ quote styles (zero-dep)
// แยกออกจาก quoteStyles.js เพราะไฟล์นั้น require sharp/@napi-rs/canvas (native addon)
// ที่ web layer (Next.js) import ไม่ได้ — ไฟล์นี้เป็น plain data ใช้ร่วมกันทั้ง bot + web

// AI = ไม่เลือกสไตล์ → ember-ai จัดตำแหน่ง/สีให้เอง (ยิง API)
const QUOTE_AI_KEY = 'quote-1-ember-ai';

// styles ที่เลือกได้เอง (ไม่รวม AI) — value ต้องตรงกับ key ใน STYLES map ของ quoteStyles.js
const QUOTE_STYLE_OPTIONS = [
  { value: 'quote-1-ember-bottom-left',  label: 'ember ล่างซ้าย', description: 'gradient ล่าง · ซ้าย' },
  { value: 'quote-1-ember-bottom-right', label: 'ember ล่างขวา',  description: 'gradient ล่าง · ขวา' },
  { value: 'quote-1-ember-top-left',     label: 'ember บนซ้าย',   description: 'gradient บน · ซ้าย' },
  { value: 'quote-1-ember-top-right',    label: 'ember บนขวา',    description: 'gradient บน · ขวา' },
  { value: 'quote-1-pillar-left',        label: 'pillar-left',    description: 'frame decoration · ซ้าย' },
  { value: 'quote-1-frame-right',        label: 'frame-right',    description: 'กรอบส้ม · ขวา' },
  { value: 'quote-2-center',             label: 'center',         description: 'กลางภาพ · ดำคลุม · Google Sans' },
];

// option สำหรับ default template (มี AI เป็นตัวเลือกแรก = ค่า default ของระบบ)
const QUOTE_TEMPLATE_CHOICES = [
  { value: QUOTE_AI_KEY, label: '✨ AI จัดให้', description: 'ember-ai เลือกตำแหน่ง+สีเอง (ยิง API)' },
  ...QUOTE_STYLE_OPTIONS,
];

// set ของ key ที่ valid (รวม AI) — ใช้ validate ค่าที่รับจาก web
const QUOTE_STYLE_KEYS = [QUOTE_AI_KEY, ...QUOTE_STYLE_OPTIONS.map(o => o.value)];

module.exports = {
  QUOTE_AI_KEY,
  QUOTE_STYLE_OPTIONS,
  QUOTE_TEMPLATE_CHOICES,
  QUOTE_STYLE_KEYS,
};
