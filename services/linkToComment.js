// services/linkToComment.js — ดึงลิงก์ออกจาก caption ไปเป็นคอมเมนต์แรก (Facebook เท่านั้น)
//
// ทำไม: FB กด reach ของโพสต์ที่พาคนออกนอกแพลตฟอร์ม · วิธีมาตรฐานคือโพสต์เนื้อหาเปล่า
// แล้วหย่อนลิงก์ไว้คอมเมนต์แรก แทนที่จะฝังไว้ในเนื้อโพสต์
//
// ⚠️ pure ล้วน ไม่ยิงเน็ต ไม่แตะ DB — ตัวเรียกคือ postToFacebook() ใน services/metaApi.js
//    และ **ห้ามแก้ caption ที่เก็บใน post_social_history** เพราะ caption ก้อนเดียวกันถูกใช้ยิง IG ด้วย
//    (IG ไม่มีคอมเมนต์ลิงก์ให้ ถ้าไปแก้ที่ต้นทาง IG จะได้ข้อความ "ใต้โพสต์" ที่ชี้ไปที่ว่าง)
const { LINK_LABELS, DEFAULT_LABEL } = require('../config/linkLabels');

// ภาษาไทยไม่เว้นวรรค — `\S+` จะกลืนคำไทยที่พิมพ์ติดท้าย URL (`https://forms.gle/abcแล้วรอ`)
// จึงตัดที่บล็อกอักษรไทย U+0E00–U+0E7F ด้วย · วงเล็บถูกตัดออกเพราะ placeholder เราใช้วงเล็บ
const URL_RE = /https?:\/\/[^\s฀-๿<>"'`|\\^{}[\]()]+/g;

// เครื่องหมายวรรคตอนท้ายประโยคที่ติดมากับ URL — "ลงทะเบียนที่ https://forms.gle/abc."
const TRAILING_PUNCT = /[.,;:!?"'…]+$/;

function metaOf(url) {
  const hit = LINK_LABELS.find(l => l.match.test(url)) || DEFAULT_LABEL;
  return {
    url,
    emoji: hit.emoji,
    baseLabel: hit.label,
    baseNoun: hit.noun || hit.label,
    label: hit.label,              // ใช้ในคอมเมนต์
    noun: hit.noun || hit.label,   // ใช้แทนที่ในเนื้อโพสต์
  };
}

/**
 * แยกลิงก์ออกจาก caption
 *
 * @param {string} caption
 * @returns {{caption:string, links:Array<{url,label,emoji}>, comment:string, changed:boolean}}
 *   caption  — เนื้อโพสต์ที่แทน URL ด้วย "(แผนที่ใต้โพสต์)" แล้ว
 *   comment  — ข้อความคอมเมนต์ที่จะยิงตาม ('' ถ้าไม่มีลิงก์)
 *   changed  — false = ไม่มีอะไรต้องทำ ให้ใช้ caption เดิม
 */
function splitLinks(caption) {
  const text = caption || '';
  const none = { caption: text, links: [], comment: '', changed: false };

  const found = text.match(URL_RE) || [];
  if (!found.length) return none;

  // caption ที่มีแต่ลิงก์ล้วน — ย้ายออกแล้วเหลือ "(ลิงก์ใต้โพสต์)" โดดๆ ซึ่งไม่มีความหมาย
  if (!text.replace(URL_RE, '').trim()) return none;

  // ตัดวรรคตอนท้าย + ตัดซ้ำ (คงลำดับที่เจอครั้งแรก · URL เดียวกันพิมพ์ 2 ที่ = ลิงก์เดียว)
  const urls = [];
  for (const raw of found) {
    const url = raw.replace(TRAILING_PUNCT, '');
    if (url && !urls.includes(url)) urls.push(url);
  }
  if (!urls.length) return none;

  const links = urls.map(metaOf);

  // ป้ายซ้ำกันถึงเติมเลข — ป้ายต่างกันอ่านออกอยู่แล้วว่าอันไหนคืออันไหน
  const total = {};
  for (const l of links) total[l.baseLabel] = (total[l.baseLabel] || 0) + 1;
  const seen = {};
  for (const l of links) {
    if (total[l.baseLabel] < 2) continue;
    const n = (seen[l.baseLabel] = (seen[l.baseLabel] || 0) + 1);
    l.label = `${l.baseLabel} ${n}`;
    l.noun = `${l.baseNoun} ${n}`;
    l.numbered = true;
  }

  const byUrl = new Map(links.map(l => [l.url, l]));
  const newCaption = text.replace(URL_RE, raw => {
    const url = raw.replace(TRAILING_PUNCT, '');
    const l = byUrl.get(url);
    if (!l) return raw;
    // มีเลขกำกับต้องเว้นวรรคก่อน "ใต้โพสต์" — "ลิงก์ลงทะเบียน 1ใต้โพสต์" อ่านสะดุด
    const placeholder = l.numbered ? `(${l.noun} ใต้โพสต์)` : `(${l.noun}ใต้โพสต์)`;
    return `${placeholder}${raw.slice(url.length)}`;   // คืนวรรคตอนท้ายไว้ที่เดิม
  });

  return {
    caption: newCaption,
    links: links.map(({ url, label, emoji }) => ({ url, label, emoji })),
    comment: links.map(l => `${l.emoji} ${l.label}: ${l.url}`).join('\n'),
    changed: true,
  };
}

module.exports = { splitLinks };
