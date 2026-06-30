/**
 * แปลง 1.1-ใบสำคัญรับเงินค่าสถานที่.docx → template พร้อม {{placeholder}}
 * Usage: node scripts/docs/make-doc-template.js
 */
import PizZip from 'pizzip'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC  = path.join(__dirname, '../../md/docs/example/1.1-ใบสำคัญรับเงินค่าสถานที่.docx')
const DEST = path.join(__dirname, '../../web/templates/1.1-venue.docx')

const buf = fs.readFileSync(SRC)
const zip = new PizZip(buf)
let xml = zip.file('word/document.xml').asText()

// ─── normalize: runs ที่มีแต่ dots/ellipsis ให้เหลือ <w:t> เดียว ───
// (บางฟิลด์ถูก split เป็น 2 runs เช่น "……………" + "...")
// strategy: replace <w:t>DOTS</w:t></w:r><w:r...><w:t>MORE_DOTS</w:t>
// ง่ายกว่า: ทำ replace ตรง text ใน XML โดยหา pattern

const DOTS_RE = /([.……]{3,})/g

function escapeXml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// Map: text ที่ขึ้นต้น field → placeholder
// key = text ใน <w:t> ของ run ก่อนหน้า (หรือตัวเองถ้า mixed)
const FIELD_MAP = [
  // pattern ที่ match ใน <w:t>...</w:t> (dots-only run)
  // เรียงจาก specific → general
  { match: /^\.{5,}$|^[……]{5,}$|^\.[……]{4,}\.{0,4}$|^[……]{4,}\.{1,}$/,
    // ใช้ context (label ก่อนหน้า) ตัดสิน
    byContext: true },
]

// ─── Context-aware replacement ───
// parse paragraphs แล้วแทนตาม label ก่อน dots

function isDots(text) {
  return /^[.……\s]{3,}$/.test(text.trim()) && text.trim().length >= 3
}

// Map label → placeholder (ดูจาก text ก่อนหน้า dots run)
const LABEL_TO_PLACEHOLDER = {
  'เลขที่':                        '{{receipt_no}}',
  'วันที่':                         '{{day}}',
  'เดือน':                          '{{month}}',
  'พ.ศ.':                           '{{year}}',
  'ศ.':                             '{{year}}',
  // ชื่อ — run ก่อนคือ ") " หลังจาก นาย/นาง/นางสาว
  ') ………………………………………………': null,  // handle separately below
  'นามสกุ':                         null,  // handle in "นามสกุล" below
  'ล ……………………………………………………': null, // this IS the field for lastname
  'หมู่ที่ ………':                   '{{moo}}',
  'ซอย':                            '{{soi}}',
  'ถนน':                            '{{road}}',
  'ตำบล/แขวง':                      '{{subdistrict}}',
  'อำเภอ/เขต':                      '{{district}}',
  'จังหวัด':                        '{{province_addr}}',
  'หมายเลขโทรศัพท์':                '{{phone}}',
  'ลำดับที่':                        '{{branch_no}}',
  'ประจำจังหวัด':                    '{{branch_province}}',
  'ชื่อโครงการใหญ่':                 '{{project_name}}',
  'ชื่อโครงการย่อย':                 '{{sub_project_name}}',
  'สถานที่ ณ':                      '{{venue}}',
  'ปี ที่ใช้':                       '{{event_date}}',
  'ที่ใช้สถานที่':                   '{{duration}}',
  'แบบแนบท้าย 3 ** ': null, // handle separately
  'จำนวนผู้เข้าร่วมตามที่ลงชื่อในแบบแนบท้าย': '{{participant_count}}',
}

// ─── Process paragraph by paragraph ───
let result = xml.replace(/(<w:p[ >][\s\S]*?<\/w:p>)/g, (para) => {
  // collect runs in order
  const runs = []
  let rMatch
  const runRe = /(<w:r[ >][\s\S]*?<\/w:r>)/g
  while ((rMatch = runRe.exec(para)) !== null) {
    const r = rMatch[1]
    const tMatch = r.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/)
    runs.push({ raw: r, text: tMatch ? tMatch[1] : '', idx: rMatch.index })
  }

  // Replace dots-only runs with placeholders using prev-run context
  let modified = para
  for (let i = 0; i < runs.length; i++) {
    const t = runs[i].text
    if (!isDots(t)) continue

    const prev  = runs[i - 1]?.text?.trim() ?? ''
    const prev2 = runs[i - 2]?.text?.trim() ?? ''

    let placeholder = null

    // Context matching
    if (prev.endsWith('ปี ที่ใช้') || prev === 'ปี ที่ใช้') placeholder = '{{event_date}}'
    else if (prev.includes('ที่ใช้สถานที่')) placeholder = '{{duration}}'
    else if (prev.includes('3 **') || prev.includes('แบบแนบท้าย')) placeholder = '{{participant_count}}'
    else if (prev === 'เลขที่') placeholder = '{{receipt_no}}'
    else if (prev === 'วันที่' || prev2 === 'วันที่') placeholder = '{{day}}'
    else if (prev.includes('ชื่อโครงการใหญ่') || t.startsWith('.…')) placeholder = '{{project_name}}'
    else if (prev.includes('ชื่อโครงการย่อย')) placeholder = '{{sub_project_name}}'
    else if (prev.includes('สถานที่ ณ')) placeholder = '{{venue}}'
    else if (prev.includes('หมู่ที่')) placeholder = '{{moo}}'
    else if (prev.includes('นางสาว') || (prev.endsWith(')') && runs[i-2]?.text?.includes('นาย'))) placeholder = '{{full_name}}'
    else if (prev.includes('นามสกุ')) placeholder = '{{last_name}}'
    // ล้าง dots หางสั้น "..." ที่ตามหลัง mixed run (จัดการโดย specific regex ด้านล่าง)
    else if (prev.startsWith('ล ') && /[…….]/.test(prev)) placeholder = null // will be deleted
    else if (prev.includes('ลำดับที่') || prev.includes('สาขาพรรค')) placeholder = '{{branch_no}}'
    else {
      // fallback: ดู label ใน LABEL_TO_PLACEHOLDER
      for (const [label, ph] of Object.entries(LABEL_TO_PLACEHOLDER)) {
        if (ph && prev.includes(label)) { placeholder = ph; break }
      }
    }

    if (placeholder) {
      // Replace the <w:t> content in this run
      modified = modified.replace(
        runs[i].raw,
        runs[i].raw.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/, `<w:t>${escapeXml(placeholder)}</w:t>`)
      )
    }
  }

  return modified
})

// ─── Handle special mixed runs ───
// "ล ……………………………………………………" → "ล {{last_name}}"  (consumes following "..." run too)
result = result.replace(
  /(<w:t[^>]*>)(ล\s*)[…….]{5,}(<\/w:t><\/w:r>(?:[\s\S]*?<w:r[ >][\s\S]*?<w:t[^>]*>)[.]{1,5}<\/w:t>)/g,
  '$1$2{{last_name}}</w:t></w:r>'
)
// fallback if above didn't match (no trailing "..." run)
result = result.replace(
  /(<w:t[^>]*>)(ล\s*)[…….]{5,}(<\/w:t>)/g,
  '$1$2{{last_name}}$3'
)
// "หมู่ที่ ………" + ".." runs (split dots)
result = result.replace(
  /(<w:t[^>]*>)(หมู่ที่\s*)[…….]{2,}(<\/w:t>)/g,
  '$1$2{{moo}}$3'
)
// ") ……………" run for first name — note space before ellipsis
result = result.replace(
  /(<w:t[^>]*>\)\s*)[…….]{5,}(<\/w:t>)/g,
  '$1{{full_name}}$2'
)
// "3 ** ......." for participant_count
result = result.replace(
  /(<w:t[^>]*>)(3\s*\*\*\s*)[…….]{5,}(<\/w:t>)/g,
  '$1$2{{participant_count}}$3'
)
// ".………………………………………………...." project_name mixed
result = result.replace(
  /(<w:t[^>]*>)[.……]{1}[…….]{8,}[.……]{1,}(<\/w:t>)/g,
  '$1{{project_name}}$2'
)
// ลบ orphaned short dot runs "..." ที่เหลือหลัง mixed run ถูก replace แล้ว
result = result.replace(
  /(<w:t[^>]*>)[.]{1,5}(<\/w:t>)/g,
  (match, open, close) => {
    // only remove if it's ONLY dots (1-5), not real content
    return `${open}${close}`
  }
)

zip.file('word/document.xml', result)
fs.writeFileSync(DEST, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(`✓ Saved to ${DEST}`)

// ─── Verify: show remaining dots ───
const check = result.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
const remaining = [...check.matchAll(/[…….]{4,}/g)].map(m => m[0].slice(0,20))
if (remaining.length) {
  console.log('\nDots still remaining (ต้องแก้เพิ่ม):')
  remaining.forEach(d => console.log(' ', JSON.stringify(d)))
} else {
  console.log('✓ No dots remaining')
}
