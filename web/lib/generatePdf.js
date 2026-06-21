import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import ImageModule from 'docxtemplater-image-module-free'
import { PDFDocument } from 'pdf-lib'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { buildWatermarkedIdCard, buildCertifyBlock, normalizeSignature } from './idCard.js'

const __dirname   = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES   = path.join(__dirname, '../templates')
const LIBREOFFICE = '/usr/bin/libreoffice'

const TEMPLATE_1 = path.join(TEMPLATES, 'receipts', 'template-1.docx')
const BODY_1_DIR  = path.join(TEMPLATES, 'receipts', 'body-1')

const HEADER_MAP = {
  break:     'ค่าอาหาร',
  lunch:     'ค่าอาหาร',
  dinner:    'ค่าอาหาร',
  food:      'ค่าอาหาร',
  speaker:   'ค่าวิทยากร',
  transport: 'ค่าเดินทาง',
  travel:    'ค่าเดินทาง',
  venue:     'ค่าสถานที่',
  equipment: 'ค่าเช่าอุปกรณ์',
  sound:     'ค่าเช่าเครื่องเสียง',
  supplies:  'ค่าวัสดุอุปกรณ์',
  accommodation: 'ค่าที่พัก',
  photo:     'ค่าถ่ายภาพ',
}

// type ที่มี body template เฉพาะ (มีโครงสร้าง) — นอกนั้นใช้ generic plaintext (เติม description)
const SPECIAL_BODIES = new Set(['venue', 'equipment', 'sound', 'speaker', 'supplies'])

// generic body — plaintext เอา description มาเติมตรงๆ (food/break/lunch/dinner/transport/accommodation/photo)
const GENERIC_BODY_XML =
  '<w:p><w:pPr><w:pStyle w:val="Normal"/><w:widowControl w:val="false"/><w:spacing w:lineRule="auto" w:line="240" w:before="0" w:after="160"/><w:contextualSpacing/><w:jc w:val="left"/><w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New"/><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="32"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New"/><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">{{items_desc}}</w:t></w:r></w:p>'

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                     'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const ONES  = ['','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า']
const UNITS = ['','สิบ','ร้อย','พัน','หมื่น','แสน','ล้าน']

function thaiNum(n) {
  if (n === 0) return 'ศูนย์'
  const s   = String(Math.abs(Math.floor(n)))
  const len = s.length
  let t = ''
  for (let i = 0; i < len; i++) {
    const d   = Number(s[i])
    const pos = len - i - 1
    if (d === 0) continue
    if (pos % 6 === 1) {
      // tens place
      t += d === 1 ? 'สิบ' : d === 2 ? 'ยี่สิบ' : ONES[d] + 'สิบ'
    } else if (pos % 6 === 0 && d === 1 && i > 0 && Number(s[i - 1]) > 0) {
      // ones place with non-zero tens before it → เอ็ด
      t += pos > 0 ? 'เอ็ดล้าน' : 'เอ็ด'
    } else {
      t += ONES[d] + (pos % 6 === 0 && pos > 0 ? 'ล้าน' : UNITS[pos % 6] ?? '')
    }
  }
  return t
}

export function bahtText(amount) {
  const [baht, satangStr] = String(Math.abs(amount)).split('.')
  const satang = satangStr ? Number(satangStr.slice(0, 2).padEnd(2, '0')) : 0
  const b = Number(baht)
  if (b === 0 && satang === 0) return 'ศูนย์บาทถ้วน'
  let t = b > 0 ? thaiNum(b) + 'บาท' : ''
  t += satang > 0 ? thaiNum(satang) + 'สตางค์' : 'ถ้วน'
  return t
}

function parseThaiDate(dateStr) {
  if (!dateStr) return { day: '', month: '', year: '' }
  const [datePart] = dateStr.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  return {
    day:        String(d),
    month:      THAI_MONTHS[m - 1] ?? '',
    year:       String(y + 543),
    event_date: `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`,
  }
}

function calcDuration(startStr, endStr) {
  if (!startStr) return '1 วัน'
  const [sd] = startStr.split('T')
  if (!endStr) return '1 วัน'
  const [ed] = endStr.split('T')
  if (sd === ed) return '1 วัน'
  const days = Math.round((new Date(ed) - new Date(sd)) / 86_400_000) + 1
  return `${days} วัน`
}

function buildData(entry, { payerDisplayName = null, payerPosition = null } = {}) {
  const override = entry.override_data ?? {}
  const ngs = {
    full_name:      [(entry.title ?? ''), (entry.ngs_first_name ?? entry.firstname ?? '')].filter(Boolean).join('') || entry.display_name || '',
    last_name:      entry.ngs_last_name ?? entry.lastname ?? '',
    id_number:      entry.identification_number ?? '',
    house_no:       entry.home_house_number ?? '',
    moo:            entry.home_alley ?? '',
    road:           entry.home_road ?? '',
    district:       entry.home_amphure ?? '',
    subdistrict:    entry.home_district ?? '',
    province_addr:  entry.home_province ?? '',
  }

  const dateInfo  = parseThaiDate(entry.event_date)
  const amt       = Number(entry.amount ?? 0)
  const amtFmt    = amt.toLocaleString('th-TH', { minimumFractionDigits: 2 })

  // derive from act_event_cache; override_data takes precedence
  const eventVenue    = entry.location || entry.province || ''
  const eventDuration = calcDuration(entry.event_date, entry.event_end_date)
  const eventTopic    = entry.event_name ?? ''

  return {
    // common
    header:            HEADER_MAP[entry.item_type] ?? '',
    receipt_no:        String(entry.id).padStart(4, '0'),
    project_name:      entry.project_name ?? '',
    sub_project_name:  entry.event_name ?? '',
    amount:            amtFmt,
    total:             amtFmt,
    amount_text:       bahtText(amt),
    participant_count: String(entry.participant_count ?? ''),
    ...dateInfo,

    // personal info
    full_name:       override.full_name     ?? ngs.full_name,
    last_name:       override.last_name     ?? ngs.last_name,
    payee_name:      [override.full_name ?? ngs.full_name, override.last_name ?? ngs.last_name].filter(Boolean).join(' '),
    payer_name:      payerDisplayName ?? '',
    payer_position:  payerPosition ?? '',
    id_number:       override.id_number     ?? ngs.id_number,
    house_no:        override.house_no      ?? ngs.house_no,
    moo:             override.moo           ?? ngs.moo,
    road:            override.road          ?? ngs.road,
    subdistrict:     override.subdistrict   ?? ngs.subdistrict,
    district:        override.district      ?? ngs.district,
    province_addr:   override.province_addr ?? ngs.province_addr,
    phone:           override.phone         ?? '',
    branch_no:       override.branch_no     ?? '',
    branch_province: override.branch_province ?? '',

    // body-specific (override_data takes precedence, then event cache)
    venue:            override.venue          ?? eventVenue,
    duration:         override.duration       ?? eventDuration,
    topic:            override.topic          ?? eventTopic,
    meal_count:       override.meal_count     ?? '',
    unit_price:       override.unit_price     ?? '',
    quantity:         override.quantity       ?? '',
    equipment_desc:   override.equipment_desc ?? entry.description ?? '',
    items_desc:       override.items_desc     ?? entry.description ?? '',
    daily_rate:       override.daily_rate     ?? '',
    days:             override.days           ?? '',
  }
}

/** ดึง body content (XML ระหว่าง <w:body>…<w:sectPr) จากไฟล์ .docx */
function bodyContentFromFile(bodyPath) {
  const bodyZip = new PizZip(fs.readFileSync(bodyPath))
  const bodyXml = bodyZip.files['word/document.xml'].asText()
  const m = bodyXml.match(/<w:body>([\s\S]*?)<w:sectPr/)
  return m ? m[1].trim() : ''
}

/** แทน paragraph {{payment_details}} ใน template ด้วย body content (รับ XML ตรงๆ) */
function injectBodyIntoTemplate(templateZip, bodyContent) {
  const xml = templateZip.files['word/document.xml'].asText()
  const merged = xml.replace(
    /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*\{\{payment_details\}\}(?:(?!<\/w:p>)[\s\S])*<\/w:p>/,
    () => bodyContent   // function replacer — กัน $ ใน description ถูกตีความเป็น backreference
  )
  templateZip.file('word/document.xml', merged)
}

function colorVariableRuns(zip) {
  const xml = zip.files['word/document.xml'].asText()
  const out = xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, run => {
    if (!run.includes('{{') && !run.includes('{%')) return run
    const colored = '<w:color w:val="1A47CC"/>'
    if (run.includes('w:color'))
      return run.replace(/<w:color[^/]*\/>/, colored)
    return run.includes('<w:rPr>')
      ? run.replace('<w:rPr>', `<w:rPr>${colored}`)
      : run.replace(/(<w:r\b[^>]*>)/, `$1<w:rPr>${colored}</w:rPr>`)
  })
  zip.file('word/document.xml', out)
}

export async function generateEntryPdf(entry, { signatureBase64 = null, payerSignatureBase64 = null, payerDisplayName = null, payerPosition = null } = {}) {
  // type ที่มีโครงสร้างเฉพาะ → ใช้ .docx, นอกนั้น → generic plaintext (เติม description)
  let bodyContent
  if (SPECIAL_BODIES.has(entry.item_type)) {
    const bodyPath = path.join(BODY_1_DIR, `${entry.item_type}.docx`)
    if (!fs.existsSync(bodyPath)) throw new Error(`no body template for item_type: ${entry.item_type}`)
    bodyContent = bodyContentFromFile(bodyPath)
  } else {
    bodyContent = GENERIC_BODY_XML
  }

  const buf  = fs.readFileSync(TEMPLATE_1)
  const zip  = new PizZip(buf)
  injectBodyIntoTemplate(zip, bodyContent)
  colorVariableRuns(zip)

  // normalize ลายเซ็น → trim หมึก + fit กล่องมาตรฐาน (ขนาดเท่ากันทุกใบ ไม่บีบเพี้ยน)
  const sigBuf    = signatureBase64      ? await normalizeSignature(signatureBase64)      : null
  const payerBuf  = payerSignatureBase64 ? await normalizeSignature(payerSignatureBase64) : null

  const modules = []
  if (sigBuf || payerBuf) {
    modules.push(new ImageModule({
      centered: false,
      getImage: (_val, tagName) => {
        if (tagName === 'paysig') return payerBuf ?? sigBuf
        return sigBuf ?? payerBuf
      },
      getSize: () => [96, 32],
    }))
  }

  const doc = new Docxtemplater(zip, {
    modules,
    delimiters:    { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks:    true,
    nullGetter:    () => '',
  })

  // image module จะ render รูปก็ต่อเมื่อ key {{%sig}}/{{%paysig}} มีค่า truthy ใน data
  // (ถ้าไม่มี → module short-circuit คืนว่าง ไม่เรียก getImage) → set flag ตามว่ามี buffer ไหน
  doc.render({
    ...buildData(entry, { payerDisplayName, payerPosition }),
    sig:    sigBuf   ? 'sig'    : '',
    paysig: payerBuf ? 'paysig' : '',
  })

  const filled  = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  const tmpDir  = os.tmpdir()
  const tmpDocx = path.join(tmpDir, `pple-doc-${entry.id}-${Date.now()}.docx`)

  fs.writeFileSync(tmpDocx, filled)

  const result = spawnSync(LIBREOFFICE, [
    '--headless', '--convert-to', 'pdf', '--outdir', tmpDir, tmpDocx,
  ], { timeout: 30_000 })

  fs.unlinkSync(tmpDocx)

  if (result.status !== 0) {
    const errMsg = result.stderr?.toString() || result.stdout?.toString() || 'unknown'
    throw new Error(`LibreOffice failed: ${errMsg}`)
  }

  const pdfPath = tmpDocx.replace('.docx', '.pdf')
  const pdfBuf  = fs.readFileSync(pdfPath)
  fs.unlinkSync(pdfPath)

  // แนบสำเนาบัตรประชาชน (ถ้ามี) ต่อท้ายเป็นหน้า A4 — ลายน้ำแล้ว
  if (entry.id_card_image) {
    try {
      return await appendIdCardPage(pdfBuf, entry.id_card_image, sigBuf)
    } catch (err) {
      console.error(`[generateEntryPdf] id-card append failed for entry ${entry.id}:`, err.message)
      // ล้มเหลวตรงนี้ไม่ควรทำให้ทั้งใบพัง — คืนใบเสร็จเปล่าๆ ไป
    }
  }

  return pdfBuf
}

const A4 = { w: 595.28, h: 841.89 }  // pt (portrait)

/** append หน้า A4 ที่มีสำเนาบัตร watermark แล้ว ต่อท้าย PDF ใบเสร็จ */
async function appendIdCardPage(pdfBuf, idCardBuffer, sigBuffer = null) {
  const cardJpeg = await buildWatermarkedIdCard(idCardBuffer)   // ลายน้ำอย่างเดียว
  const certify  = await buildCertifyBlock(sigBuffer)            // ลายเซ็น (normalize แล้ว) + สำเนาถูกต้อง

  const pdf = await PDFDocument.load(pdfBuf)
  const cardImg = await pdf.embedJpg(cardJpeg)
  const certImg = await pdf.embedPng(certify.png)
  const page = pdf.addPage([A4.w, A4.h])

  const margin = 48

  // ── บัตร: ขนาดบัตรจริง ISO ID-1 (85.6×54mm) วางครึ่งบน รักษาสัดส่วนภาพ (ไม่ยืด) ──
  const MM = 2.83465                               // mm → pt
  const CARD_W = 85.6 * MM                          // ≈ 242.6pt
  const CARD_H = 54   * MM                          // ≈ 153.1pt
  const cScale = Math.min(CARD_W / cardImg.width, CARD_H / cardImg.height)
  const cW = cardImg.width * cScale
  const cH = cardImg.height * cScale
  const cX = (A4.w - cW) / 2
  const cY = A4.h - margin - cH                    // ชิดบน
  page.drawImage(cardImg, { x: cX, y: cY, width: cW, height: cH })

  // ── ลายเซ็น + สำเนาถูกต้อง: ใต้ภาพบัตร ──
  const certW = 240
  const certH = certW * (certify.height / certify.width)
  page.drawImage(certImg, {
    x: (A4.w - certW) / 2,
    y: cY - 28 - certH,
    width:  certW,
    height: certH,
  })

  const out = await pdf.save()
  return Buffer.from(out)
}
