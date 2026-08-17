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

// option สำหรับ default template
const QUOTE_TEMPLATE_CHOICES = [
  { value: 'random', label: '🎲 สุ่ม', description: 'สุ่มสไตล์จากทั้งหมด' },
  ...QUOTE_STYLE_OPTIONS,
];

// set ของ key ที่ valid (รวมสุ่ม) — ใช้ validate ค่าที่รับจาก web
const QUOTE_STYLE_KEYS = ['random', ...QUOTE_STYLE_OPTIONS.map(o => o.value)];

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
  // สไตล์ AI ถอดออก 2026-08-10 (AI เลือกแค่ตำแหน่ง+สี ซึ่งคนเลือกเองอยู่แล้ว)
  // การ์ด/config ที่เก็บคีย์ 'ai' ไว้ยัง render ได้ แต่ตกลงมาเป็นสไตล์คงที่ ไม่สุ่ม (กด render ซ้ำต้องได้ผลเดิม)
  'quote-1-ember-ai':           'shade-bottom-left',
  'ai':                         'shade-bottom-left',
  'shade-side':                'shade-side-right',
  'duo-side':                  'duo-side-right',
};

/** คีย์ที่อ่านจาก DB/config อาจเป็นของเก่า — ผ่านตัวนี้ก่อนเทียบกับ QUOTE_STYLE_KEYS เสมอ */
const normalizeStyle = key => LEGACY_STYLE_ALIAS[key] || key;

// ── ตำแหน่งลายน้ำ (2026-08-10) ───────────────────────────────────────────────
// 6 จุดที่ utils/watermarkImage.js calcPos() วางลายน้ำได้ · เรียงเป็นตาราง 2 แถว × 3 คอลัมน์
const WM_SPOTS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];

/**
 * ช่องที่ลายน้ำลงได้โดย**ไม่ทับตัวหนังสือ**ของการ์ดคำคม
 *
 * @param {string|null} quoteStyle คีย์สไตล์จาก post_episode_media.quote_style · null = ไม่ใช่การ์ดคำคม
 * @returns {string[]} ช่องที่ว่าง — **ต้องไม่คืน [] เด็ดขาด** (ดูกฎข้างล่าง)
 *
 * ⛔ **ห้ามเพิ่มเงื่อนไข "รูปแบบนี้ไม่ต้องแปะลายน้ำ" ที่นี่** (user เคาะ 2026-08-17)
 *    ที่นี่ตอบได้แค่ "ลงมุมไหนแล้วไม่ทับตัวหนังสือ" ไม่ใช่ที่ตัดสินว่า *ควร* แปะไหม — คนเลือกเอง
 *    เคสจริง: เคยตัด `plain-*` ทิ้งทั้งกลุ่มเพราะการ์ด `plain-logo` เอาลายน้ำไปทำลายพื้นอยู่แล้ว
 *    ผลคือ `plain-flat/fade/mark` ที่ไม่มีโลโก้เลยก็โดนด้วย → เลือกลายน้ำแล้วไม่มีอะไรขึ้น
 *    ไม่มี error ไม่มี log (bug-416) · อยากเตือนเรื่องโลโก้ซ้ำ = ไปเตือนใน UI ตอนเลือก
 *
 * ตำแหน่งข้อความยืนยันกับ renderer จริงใน utils/quoteStyles.js แล้วทุกแถว — อย่าเดาจากชื่อ layout:
 *   pillar/frame ชื่อบอกว่าเสาซ้าย/กรอบขวา แต่ **ข้อความอยู่ล่างทั้งคู่** (renderBorder/renderBorder2
 *   วางที่ `H - pad - textH`) ส่วนเสา/กรอบเป็นแค่ภาพประกอบเหนือข้อความ
 *   matte: รูปกินบน 52% กล่องข้อความอยู่ใต้รูป (renderMatte)
 */
function watermarkSpotsFor(quoteStyle) {
  if (!quoteStyle) return WM_SPOTS;                    // รูปธรรมดา ไม่ใช่การ์ด → ลงได้ทุกช่อง
  const key = normalizeStyle(String(quoteStyle));

  const { layout } = splitStyle(key);
  if (!layout) return WM_SPOTS;

  if (layout === 'center') return WM_SPOTS;            // ข้อความอยู่กลางภาพ ไม่ชนขอบ
  if (layout === 'side-left')  return WM_SPOTS.filter(s => !s.endsWith('-left'));
  if (layout === 'side-right') return WM_SPOTS.filter(s => !s.endsWith('-right'));
  if (layout.startsWith('top')) return WM_SPOTS.filter(s => !s.startsWith('top-'));
  if (layout.startsWith('bottom') || ['pillar', 'frame', 'matte'].includes(layout)) {
    return WM_SPOTS.filter(s => !s.startsWith('bottom-'));
  }
  return WM_SPOTS;                                     // layout ที่ยังไม่รู้จัก = ไม่ตัดอะไร
}

/**
 * ตำแหน่งจริงที่จะใช้กับรูปหนึ่งใบ
 * @param {string|null} wmPos ค่าที่ผู้ใช้เลือก · 'random'/ว่าง = สุ่ม (ค่าเริ่มต้นของระบบ)
 * @returns {string|null} null = ไม่ต้องแปะลายน้ำรูปนี้
 */
function pickWatermarkPos(wmPos, quoteStyle) {
  const allowed = watermarkSpotsFor(quoteStyle);
  if (!allowed.length) return null;                    // กันพลาดเฉยๆ — watermarkSpotsFor ห้ามคืน []
  if (wmPos && wmPos !== 'random') return wmPos;       // เลือกเอง = เคารพเสมอ แม้จะทับข้อความ
  return allowed[Math.floor(Math.random() * allowed.length)];
}

module.exports = {
  normalizeStyle,
  WM_SPOTS,
  watermarkSpotsFor,
  pickWatermarkPos,
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
