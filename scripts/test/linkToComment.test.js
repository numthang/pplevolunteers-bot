// เทสตัวแยกลิงก์ออกจาก caption → คอมเมนต์แรก (pure ล้วน ไม่ยิงเน็ต ไม่แตะ DB)
// รัน: node scripts/test/linkToComment.test.js
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { splitLinks } = require(ROOT + '/services/linkToComment');

let failed = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) failed++;
  console.log(`${cond ? '✅' : '❌'} ${label}`, extra);
};

const MAP = 'https://maps.app.goo.gl/xY7';
const ACT = 'https://act.peoplesparty.or.th/event/161817/';
const FORM = 'https://forms.gle/abc123';

// 1) ไม่มีลิงก์ → ไม่แตะอะไรเลย
let r = splitLinks('งานเปิดตัวสาขา เสาร์นี้ 9 โมง');
ok('ไม่มีลิงก์ → changed=false', r.changed === false && r.caption === 'งานเปิดตัวสาขา เสาร์นี้ 9 โมง');

// 2) ลิงก์เดียว — แทนที่ด้วย noun + คอมเมนต์มีป้ายกำกับ
r = splitLinks(`ลงทะเบียนที่ ${ACT} ภายในศุกร์นี้`);
ok('ลิงก์เดียว: caption แทนที่แล้ว', r.caption === 'ลงทะเบียนที่ (ลิงก์ลงทะเบียนใต้โพสต์) ภายในศุกร์นี้', r.caption);
ok('ลิงก์เดียว: ไม่มีเลขกำกับ', r.comment === `📝 ลงทะเบียน: ${ACT}`, r.comment);

// 3) ⭐ URL ตามด้วยอักษรไทยทันที (ไทยไม่เว้นวรรค) — ห้ามกลืนคำไทย
r = splitLinks(`ดูที่ ${FORM}แล้วรีบสมัคร`);
ok('ไทยติดท้าย URL: ไม่กลืนคำไทย', r.caption === 'ดูที่ (ลิงก์ลงทะเบียนใต้โพสต์)แล้วรีบสมัคร', r.caption);
ok('ไทยติดท้าย URL: URL ถูกต้อง', r.links[0].url === FORM, r.links[0]?.url);

// 4) วรรคตอนท้ายประโยคต้องไม่ติดไปกับ URL และต้องอยู่ที่เดิม
r = splitLinks(`สมัครที่ ${FORM}.`);
ok('จุดท้ายประโยค: URL สะอาด', r.links[0].url === FORM, r.links[0]?.url);
ok('จุดท้ายประโยค: จุดยังอยู่ใน caption', r.caption === 'สมัครที่ (ลิงก์ลงทะเบียนใต้โพสต์).', r.caption);

// 5) สองลิงก์ ป้ายต่างกัน → ไม่ต้องมีเลข
r = splitLinks(`นัดเจอที่ ${MAP} เวลา 9 โมง\nลงทะเบียน ${ACT}`);
ok('ป้ายต่างกัน: ไม่มีเลข', r.caption === 'นัดเจอที่ (แผนที่ใต้โพสต์) เวลา 9 โมง\nลงทะเบียน (ลิงก์ลงทะเบียนใต้โพสต์)', r.caption);
ok('ป้ายต่างกัน: คอมเมนต์ 2 บรรทัด', r.comment === `📍 แผนที่: ${MAP}\n📝 ลงทะเบียน: ${ACT}`, JSON.stringify(r.comment));

// 6) สองลิงก์ ป้ายเดียวกัน → ต้องเติมเลข ไม่งั้นอ่านไม่ออกว่าอันไหนคืออันไหน
r = splitLinks(`รอบเช้า ${ACT} รอบบ่าย ${FORM}`);
ok('ป้ายซ้ำ: caption มีเลข + เว้นวรรคก่อน "ใต้โพสต์"', r.caption === 'รอบเช้า (ลิงก์ลงทะเบียน 1 ใต้โพสต์) รอบบ่าย (ลิงก์ลงทะเบียน 2 ใต้โพสต์)', r.caption);
ok('ป้ายซ้ำ: คอมเมนต์มีเลข', r.comment === `📝 ลงทะเบียน 1: ${ACT}\n📝 ลงทะเบียน 2: ${FORM}`, JSON.stringify(r.comment));

// 7) URL เดียวกันพิมพ์ 2 ที่ = ลิงก์เดียว ไม่ต้องเติมเลข
r = splitLinks(`ดูแผนที่ ${MAP} · ย้ำอีกที ${MAP}`);
ok('URL ซ้ำ: นับเป็นลิงก์เดียว', r.links.length === 1, `links=${r.links.length}`);
ok('URL ซ้ำ: ไม่มีเลข และแทนที่ทั้ง 2 จุด', r.caption === 'ดูแผนที่ (แผนที่ใต้โพสต์) · ย้ำอีกที (แผนที่ใต้โพสต์)', r.caption);

// 8) caption ที่มีแต่ลิงก์ล้วน — ย้ายออกแล้วเหลือแต่วงเล็บ ไม่มีความหมาย → ปล่อยไว้เดิม
r = splitLinks(`  ${ACT}  `);
ok('ลิงก์ล้วน → ไม่แตะ', r.changed === false && r.comment === '', r.caption);

// 9) โดเมนที่ไม่รู้จัก → fallback 🔗 ลิงก์
r = splitLinks('อ่านต่อ https://example.com/a/b ได้เลย');
ok('โดเมนไม่รู้จัก → fallback', r.caption === 'อ่านต่อ (ลิงก์ใต้โพสต์) ได้เลย' && r.comment === '🔗 ลิงก์: https://example.com/a/b', r.comment);

// 10) caption ว่าง / null — ห้ามพัง
ok('caption ว่าง', splitLinks('').changed === false);
ok('caption null', splitLinks(null).changed === false && splitLinks(null).caption === '');

// 11) เรียกซ้ำหลายรอบต้องได้ผลเท่าเดิม (กัน lastIndex ของ regex /g ค้าง)
const twice = splitLinks(`ลงทะเบียนที่ ${ACT} นะ`);
const again = splitLinks(`ลงทะเบียนที่ ${ACT} นะ`);
ok('เรียกซ้ำได้ผลเท่าเดิม (regex /g ไม่ค้าง state)', twice.caption === again.caption, again.caption);

console.log(failed ? `\n❌ ล้ม ${failed} เคส` : '\n✅ ผ่านทั้งหมด');
process.exit(failed ? 1 : 0);
