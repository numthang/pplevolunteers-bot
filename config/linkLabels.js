// config/linkLabels.js — ป้ายกำกับลิงก์ที่ถูกย้ายไปคอมเมนต์แรกของโพสต์ Facebook
//
// ทำไมต้องย้าย: FB กด reach ของโพสต์ที่พาคนออกนอกแพลตฟอร์ม — วิธีมาตรฐานคือโพสต์เนื้อหาเปล่า
// แล้วหย่อนลิงก์ไว้คอมเมนต์แรก · ตัวแปลงอยู่ที่ services/linkToComment.js
//
// เติม entry ได้เรื่อยๆ — **ตัวบนชนะ** (เจอตัวแรกที่ match แล้วหยุด) เอาตัวเจาะจงไว้บนตัวกว้าง
//   match — RegExp เทียบกับ URL เต็ม
//   label — ใช้ในคอมเมนต์ ("📍 แผนที่: https://…")
//   noun  — ใช้แทนที่ในเนื้อโพสต์ ("(แผนที่ใต้โพสต์)") · ไม่ใส่ = ใช้ label
//           มีไว้เพราะบางคำอ่านไม่ลื่นเวลาอยู่กลางประโยค — "ลงทะเบียนที่ (ลงทะเบียนใต้โพสต์)"
//           เลยให้ noun เป็น "ลิงก์ลงทะเบียน" แทน
const LINK_LABELS = [
  { match: /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps/i, label: 'แผนที่',    emoji: '📍' },
  { match: /act\.(peoplesparty\.or\.th|pplethai\.org)/i,              label: 'ลงทะเบียน', emoji: '📝', noun: 'ลิงก์ลงทะเบียน' },
  { match: /forms\.gle|docs\.google\.com\/forms/i,                    label: 'ลงทะเบียน', emoji: '📝', noun: 'ลิงก์ลงทะเบียน' },
  { match: /youtu\.be|youtube\.com|fb\.watch/i,                       label: 'คลิป',      emoji: '🎬' },
  { match: /drive\.google\.com|docs\.google\.com/i,                   label: 'ไฟล์',      emoji: '📎' },
];

// ไม่แมตช์อะไรเลย
const DEFAULT_LABEL = { label: 'ลิงก์', emoji: '🔗' };

module.exports = { LINK_LABELS, DEFAULT_LABEL };
