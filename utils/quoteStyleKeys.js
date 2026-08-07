// utils/quoteStyleKeys.js — รายชื่อ quote styles (zero-dep)
// แยกออกจาก quoteStyles.js เพราะไฟล์นั้น require sharp/@napi-rs/canvas (native addon)
// ที่ web layer (Next.js) import ไม่ได้ — ไฟล์นี้เป็น plain data ใช้ร่วมกันทั้ง bot + web
//
// ⚠️ ต้อง sync กับ 2 ที่: `STYLES` ใน utils/quoteStyles.js (bot) และ web/lib/quoteStyles.js (ESM)
//
// คำเรียก (เคาะ 2026-08-07):
//   style  = คีย์รวมที่เก็บใน DB และที่ผู้ใช้ได้ผลลัพธ์  เช่น 'solid-bottom-left'
//   layout = การวาง   bottom-left | bottom-right | top-left | top-right | center | pillar | frame | matte
//   finish = การลงสี  shade (เงาสีแบรนด์) | solid (แถบทึบ) | duo (ดูโอโทน)
//   style  = finish + '-' + layout

const QUOTE_AI_KEY = 'ai';

const FINISHES = [
  { value: 'shade', label: 'เงา',     description: 'เงาสีแบรนด์ทับบนรูป — รูปยังเห็นสีจริง' },
  { value: 'solid', label: 'ทึบ',     description: 'แถบสีแบรนด์ วางคำคมในแถบ' },
  { value: 'duo',   label: 'ดูโอโทน', description: 'ย้อมรูปทั้งใบเป็นสีแบรนด์ — ปุ่มสีภาพไม่มีผล' },
];

const LAYOUTS = [
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
];

// คู่ที่มีจริง — คู่ที่ไม่อยู่ในนี้ ปุ่มต้องจางกดไม่ได้ ไม่ใช่หายไป (ผู้ใช้จะได้รู้ว่ามีอยู่แต่คู่นี้ไม่ได้)
// ⛔ เคยมี 'ข้างซ้าย/ข้างขวา' (แถบสีแนวตั้ง) — ตัดทิ้ง 2026-08-07 คอลัมน์แคบทำให้ตัวหนังสือ
//    เล็กกว่าใบอื่นชัดเจน · อย่าใส่กลับโดยไม่ถามก่อน
const COMBOS = {
  shade: ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'pillar', 'frame', 'center', 'side-left', 'side-right'],
  solid: ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'matte'],
  duo:   ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'pillar', 'frame', 'center', 'side-left', 'side-right'],
};

const styleKey = (finish, layout) => `${finish}-${layout}`;

function splitStyle(key) {
  const i = (key || '').indexOf('-');
  if (i < 0) return { finish: null, layout: null };
  return { finish: key.slice(0, i), layout: key.slice(i + 1) };
}

const labelOf = (list, v) => (list.find(x => x.value === v) || {}).label || v;

// ทุกคู่ที่ใช้ได้ แผ่เป็นรายการเดียว — ใช้ validate และเป็น pool ของ 'สุ่ม'
const QUOTE_STYLE_OPTIONS = Object.entries(COMBOS).flatMap(([finish, layouts]) =>
  layouts.map(layout => ({
    value: styleKey(finish, layout),
    label: `${labelOf(FINISHES, finish)} · ${labelOf(LAYOUTS, layout)}`,
    finish,
    layout,
  }))
);

// option สำหรับ default template (มี AI เป็นตัวเลือกแรก = ค่า default ของระบบ)
const QUOTE_TEMPLATE_CHOICES = [
  { value: QUOTE_AI_KEY, label: '✨ AI จัดให้', description: 'AI เลือกตำแหน่ง+สีเอง (ยิง API)' },
  { value: 'random',     label: '🎲 สุ่ม',      description: 'สุ่มสไตล์จากทั้งหมด' },
  ...QUOTE_STYLE_OPTIONS,
];

// set ของ key ที่ valid (รวม AI + สุ่ม) — ใช้ validate ค่าที่รับจาก web
const QUOTE_STYLE_KEYS = [QUOTE_AI_KEY, 'random', ...QUOTE_STYLE_OPTIONS.map(o => o.value)];

// คีย์เก่าก่อนเปลี่ยนชื่อ 2026-08-07 — **ห้ามลบ** การ์ดที่ทำไปแล้วเก็บคีย์พวกนี้ไว้ใน
// post_episode_media.quote_style และ config quote_default_template ก็อาจยังเป็นค่าเก่า
const LEGACY_STYLE_ALIAS = {
  'quote-1-ember-bottom-left':  'shade-bottom-left',
  'quote-1-ember-bottom-right': 'shade-bottom-right',
  'quote-1-ember-top-left':     'shade-top-left',
  'quote-1-ember-top-right':    'shade-top-right',
  'quote-1-pillar-left':        'shade-pillar',
  'quote-1-frame-right':        'shade-frame',
  'quote-2-center':             'shade-center',
  'quote-1-ember-ai':           'ai',
  'shade-side':                'shade-side-right',
  'duo-side':                  'duo-side-right',
};

/** คีย์ที่อ่านจาก DB/config อาจเป็นของเก่า — ผ่านตัวนี้ก่อนเทียบกับ QUOTE_STYLE_KEYS เสมอ */
const normalizeStyle = key => LEGACY_STYLE_ALIAS[key] || key;

module.exports = {
  QUOTE_AI_KEY,
  normalizeStyle,
  FINISHES,
  LAYOUTS,
  COMBOS,
  styleKey,
  splitStyle,
  QUOTE_STYLE_OPTIONS,
  QUOTE_TEMPLATE_CHOICES,
  QUOTE_STYLE_KEYS,
  LEGACY_STYLE_ALIAS,
};
