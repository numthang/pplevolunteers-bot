/**
 * แปลง docx ต้นฉบับ → template พร้อม {{placeholder}} สำหรับ docxtemplater
 * Usage: cd web && node --input-type=module < ../scripts/docs/make-doc-templates.js
 */
import PizZip from 'pizzip'
import fs from 'fs'

const DIR = '/home/tee/VSites/node/pple-volunteers/web/templates'

// ── helpers ──────────────────────────────────────────────────────
function isDots(t) {
  const s = t.trim()
  return s.length >= 4 && /^[.……\s]+$/.test(s)
}
function ph(name) { return `{{${name}}}` }

// ── context rules ที่ใช้ร่วมกันทุกฟอร์ม ──────────────────────────
const COMMON_CONTEXT = [
  ['เลขที่',                                      ph('receipt_no')],
  ['ปี ที่ใช้',                                   ph('event_date')],
  ['วัน/เดือน/ปี',                                ph('event_date')],
  ['ที่ดำเนินการ',                                ph('duration')],       // วิทยากร
  ['ที่ใช้สถานที่',                               ph('duration')],
  ['ที่เช่าอุปกรณ์',                              ph('duration')],
  ['ที่เช่าเครื่องเสียง',                         ph('duration')],
  ['3 **',                                        ph('participant_count')],
  ['แบบแนบท้าย',                                  ph('participant_count')],
  ['ชื่อโครงการย่อย',                             ph('sub_project_name')],
  ['สถานที่ ณ',                                   ph('venue')],
  ['สถานที่จัด',                                  ph('venue')],
  ['หัวข้อเรื่อง',                                ph('topic')],
  ['หมู่ที่',                                     ph('moo')],
  ['นางสาว',                                      ph('full_name')],
  ['นาย',                                         ph('full_name')],
  ['นามสกุ',                                      ph('last_name')],
  ['วันที่',                                      ph('day')],
  ['เดือน',                                       ph('month_name')],
  ['ศ.',                                          ph('year')],
  ['ลำดับที่',                                    ph('branch_no')],
  ['ประจำจังหวัด',                                ph('branch_province')],
  ['รวมเป็นเงิน',                                 ph('total_amount')],
  ['ชั่วโมง ละ',                                  ph('unit_price')],
  ['ชั่วโมง ละ ',                                 ph('unit_price')],
  ['โครงการย่อย',                                 ph('sub_project_name')],
  ['โครงการ',                                     ph('project_name')],
]

// ── per-file extra context (ใส่ก่อน COMMON) ─────────────────────
const EXTRA_CONTEXT = {
  '1.2': [
    ['ลักษณะอุปกรณ์ที่เช่า',  ph('equipment_desc')],
    ['ราคาค่าเช่า',             ph('unit_price')],
    ['เช่าจำนวนรวม',            ph('quantity')],
  ],
  '1.3': [
    ['ราคาค่าเช่าเครื่องเสียง', ph('unit_price')],
  ],
  '1.4': [
    ['ราคาต่อหน่วย',           ph('items_desc')],
    ['ลักษณะอุปกรณ์ที่ซื้อ',   ph('items_desc')],
  ],
  '1.5': [
    ['จำนวนชั่วโมง',            ph('duration')],
  ],
  '2': [
    ['จำนวนวัน',                ph('days')],
    ['เป็นเงินคนละ',            ph('daily_rate')],
    ['รวม',                     ph('total_amount')],
  ],
}

// ── mixed-run regex (label+dots ใน run เดียวกัน) ────────────────
const MIXED_FIXES = [
  [/(<w:t[^>]*>\)\s*)[…….]{5,}(<\/w:t>)/g,               `$1${ph('full_name')}$2`],
  [/(<w:t[^>]*>ล\s*)[…….]{5,}(<\/w:t>)/g,                `$1${ph('last_name')}$2`],
  [/(<w:t[^>]*>หมู่ที่\s*)[…….]{2,}(<\/w:t>)/g,          `$1${ph('moo')}$2`],
  [/(<w:t[^>]*>3\s*\*\*\s*)[…….]{5,}(<\/w:t>)/g,         `$1${ph('participant_count')}$2`],
  [/(<w:t[^>]*>วันที่\s*)[…….]{2,}(<\/w:t>)/g,           `$1${ph('day')}$2`],
  [/(<w:t[^>]*>ชื่อโครงการใหญ่\s*)[…….]{4,}(<\/w:t>)/g,  `$1${ph('project_name')}$2`],
  [/(<w:t[^>]*>เลขที่\s*)[…….]{4,}(<\/w:t>)/g,           `$1${ph('receipt_no')}$2`],
  [/(<w:t[^>]*>ชื่อโครงการย่อย\s*)[…….]{4,}(<\/w:t>)/g,  `$1${ph('sub_project_name')}$2`],
  [/(<w:t[^>]*>สถานที่จัด\s*)[…….]{4,}(<\/w:t>)/g,       `$1${ph('venue')}$2`],
  // ร ........ (split โครงกา + ร .....) → ร {{project_name}}
  [/(<w:t[^>]*>ร\s*)[…….]{4,}(<\/w:t>)/g,                `$1${ph('project_name')}$2`],

  // ── File 1.2: dots เป็น field ใน run ที่มีคำอื่นด้วย ─────────
  // "ชั่วโมง ละ ..... บาท" → unit_price
  [/(<w:t[^>]*>(?:ชั่วโมง|วัน)\s*ละ\s*)[…….]{4,}/g,     `$1${ph('unit_price')}`],
  // "รวมเป็นเงิน ..... บาท"
  [/(<w:t[^>]*> ?รวมเป็นเงิน\s*)[…….]{4,}/g,            `$1${ph('total_amount')}`],

  // ── File 1.4: วัน/เดือน/ปี (ต่างจาก วันที่) ─────────────────
  [/(<w:t[^>]*>วัน\/เดือน\/ปี[^…<.]*)[…….]{4,}/g,       `$1${ph('event_date')}`],

  // ── File 2: multiple fields ใน run เดียว ─────────────────────
  // "จำนวนวัน ..... วัน เป็นเงินคนละ ..... บาท/วัน " — allow trailing text before </w:t>
  [/(<w:t[^>]*>จำนวนวัน\s*)[…….]{3,}(\s*วัน\s*เป็นเงินคนละ\s*)[…….]{3,}([^<]*<\/w:t>)/g,
   `$1${ph('days')}$2${ph('daily_rate')}$3`],
  // "รวม ..... บาท"
  [/(<w:t[^>]*>รวม\s*)[…….]{3,}(\s*บาท)/g,              `$1${ph('total_amount')}$2`],

  // ── File 3: วันที่/เดือน/พ.ศ. ใน run เดียว ─────────────────
  [/(<w:t[^>]*>วันที่\s*)[…….]{3,}(\s*เดือน\s*)[…….]{3,}(\s*พ\.ศ\.\s*)[…….]{3,}([^<]*<\/w:t>)/g,
   `$1${ph('day')}$2${ph('month_name')}$3${ph('year')}$4`],
  // File 3: "โครงการย่อย" อยู่คนละ para/cell กับ dots (ห่าง ~974 chars)
  [/(<w:t[^>]*>โครงการย่อย<\/w:t>[\s\S]{1,1200}?<w:t[^>]*>)[…….]{8,}(<\/w:t>)/,
   `$1${ph('sub_project_name')}$2`],

  // project_name mixed ellipsis ".……………...."
  [/(<w:t[^>]*>)[.…]{0,2}[…]{6,}[….]{0,4}(<\/w:t>)/g,   `$1${ph('project_name')}$2`],
  // cleanup orphaned short dots
  [/(<w:t[^>]*>)[.]{1,5}(<\/w:t>)/g,                     '$1$2'],
  // dedup
  [/(\{\{[a-z_]+\}\})\1/g,                               '$1'],
]

function processFile(srcPath, key) {
  const zip = new PizZip(fs.readFileSync(srcPath))
  let xml = zip.file('word/document.xml').asText()

  const extraCtx = EXTRA_CONTEXT[key] || []
  const allCtx   = [...extraCtx, ...COMMON_CONTEXT]

  // Pass 1: paragraph-level, context-aware dots-only run replacement
  xml = xml.replace(/(<w:p[ >][\s\S]*?<\/w:p>)/g, (para) => {
    const runRe = /(<w:r[ >][\s\S]*?<\/w:r>)/g
    const runs = []; let m
    while ((m = runRe.exec(para)) !== null) {
      const t = m[1].match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/)
      runs.push({ raw: m[1], text: t ? t[1] : '' })
    }
    let out = para
    for (let i = 0; i < runs.length; i++) {
      if (!isDots(runs[i].text)) continue

      // collect up to 3 nearest non-dots runs (skip dots runs that are already fields)
      const nonDots = []
      for (let j = i - 1; j >= 0 && nonDots.length < 3; j--) {
        if (!isDots(runs[j].text)) nonDots.push(runs[j].text)
      }

      let p = null
      // try closest match first, then wider context
      for (const ctx of [nonDots[0] ?? '', nonDots.join(' ')]) {
        for (const [label, placeholder] of allCtx) {
          if (ctx.includes(label)) { p = placeholder; break }
        }
        if (p) break
      }

      if (p) {
        out = out.replace(
          runs[i].raw,
          runs[i].raw.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/, `<w:t>${p}</w:t>`)
        )
      }
    }
    return out
  })

  // Pass 2: mixed-run regex fixes
  for (const [re, rep] of MIXED_FIXES) xml = xml.replace(re, rep)

  // Pass 3: file-specific post-processing
  if (key === '1.4') {
    // item table rows — replace any remaining standalone long dots with item_row_N
    let n = 2
    xml = xml.replace(/(<w:t[^>]*>)[…….]{10,}(<\/w:t>)/g,
      (_m, open, close) => `${open}${ph('item_' + n++)}${close}`)
  }

  return xml
}

// ── run all files ────────────────────────────────────────────────
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.docx')).sort()
const results = []

for (const file of files) {
  const key = file.replace(/^(\d+(?:\.\d+)?).*/, '$1')
  const srcPath = `${DIR}/${file}`

  let xml
  try {
    xml = processFile(srcPath, key)
  } catch (e) {
    console.error(`✗ ${file}: ${e.message}`)
    continue
  }

  const zip = new PizZip(fs.readFileSync(srcPath))
  zip.file('word/document.xml', xml)

  // overwrite in-place (template IS the file)
  fs.writeFileSync(srcPath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))

  const check = xml.replace(/<[^>]+>/g,'').replace(/\s+/g,' ')
  const phs   = [...new Set([...check.matchAll(/\{\{[^}]+\}\}/g)].map(m=>m[0]))]
  const rem   = [...check.matchAll(/[…….]{4,}/g)].map(m=>m[0].slice(0,15))

  results.push({ file, phs, rem })
  console.log(`${rem.length ? '⚠' : '✓'} ${file}`)
  console.log(`  placeholders: ${phs.join(' ')}`)
  if (rem.length) console.log(`  dots left: ${rem.join(', ')}`)
}
