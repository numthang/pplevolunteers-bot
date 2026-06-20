import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import ImageModule from 'docxtemplater-image-module-free'
import { PDFDocument } from 'pdf-lib'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { buildWatermarkedIdCard } from './idCard.js'

const __dirname   = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES   = path.join(__dirname, '../templates')
const LIBREOFFICE = '/usr/bin/libreoffice'

const TEMPLATE_GENERIC = '1-ใบสำคัญรับเงิน.docx'

const TEMPLATE_MAP = {
  food:         TEMPLATE_GENERIC,
  accommodation: TEMPLATE_GENERIC,
  photo:        TEMPLATE_GENERIC,
  venue:        '1.1-ใบสำคัญรับเงินค่าสถานที่.docx',
  equipment:    '1.2-ใบสำคัญรับเงินค่าเช่าอุปกรณ์.docx',
  sound:        '1.3-ใบสำคัญรับเงินค่าเช่าเครื่องเสียง.docx',
  supplies:     '1.4-ใบสำคัญรับเงินค่าซื้อวัสดุอุปกรณ์.docx',
  speaker:      '1.5-ใบสำคัญรับเงินค่าวิทยากร.docx',
  travel:       '2-ใบสำคัญรับเงินค่าเบี้ยเลี้ยงเจ้าหน้าที่.docx',
  attendance:   '3-แบบรายชื่อผู้เข้าร่วมประชุม อบรม สัมนา และเบิกค่าพาหนะเดินทาง.docx',
}

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

function buildData(entry, { payerDisplayName = null } = {}) {
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
    receipt_no:        String(entry.id).padStart(4, '0'),
    project_name:      entry.project_name ?? '',
    sub_project_name:  entry.event_name ?? '',
    total_amount:      amtFmt,
    amount_text:       bahtText(amt),
    participant_count: String(entry.participant_count ?? ''),
    ...dateInfo,

    // personal info
    full_name:     override.full_name     ?? ngs.full_name,
    last_name:     override.last_name     ?? ngs.last_name,
    payee_name:    [override.full_name ?? ngs.full_name, override.last_name ?? ngs.last_name].filter(Boolean).join(' '),
    payer_name:    payerDisplayName ?? '',
    id_number:     override.id_number     ?? ngs.id_number,
    house_no:      override.house_no      ?? ngs.house_no,
    moo:           override.moo           ?? ngs.moo,
    road:          override.road          ?? ngs.road,
    subdistrict:   override.subdistrict   ?? ngs.subdistrict,
    district:      override.district      ?? ngs.district,
    province_addr: override.province_addr ?? ngs.province_addr,
    phone:         override.phone         ?? '',
    branch_no:     override.branch_no     ?? '',
    branch_province: override.branch_province ?? '',

    // type-specific (override_data takes precedence, then event cache, then description)
    venue:            override.venue          ?? eventVenue,
    duration:         override.duration       ?? eventDuration,
    equipment_desc:   override.equipment_desc ?? entry.description ?? '',
    unit_price:       override.unit_price     ?? '',
    quantity:         override.quantity       ?? '',
    items_desc:       override.items_desc     ?? entry.description ?? '',
    item_2:           override.item_2         ?? '',
    item_3:           override.item_3         ?? '',
    item_4:           override.item_4         ?? '',
    item_5:           override.item_5         ?? '',
    topic:            override.topic          ?? eventTopic,
    days:             override.days           ?? '',
    daily_rate:       override.daily_rate     ?? '',
  }
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

export async function generateEntryPdf(entry, { signatureBase64 = null, payerSignatureBase64 = null, payerDisplayName = null } = {}) {
  const templateFile = TEMPLATE_MAP[entry.item_type]
  if (!templateFile) throw new Error(`no template for item_type: ${entry.item_type}`)

  const templatePath = path.join(TEMPLATES, templateFile)
  if (!fs.existsSync(templatePath)) throw new Error(`template not found: ${templateFile}`)

  const buf  = fs.readFileSync(templatePath)
  const zip  = new PizZip(buf)
  colorVariableRuns(zip)

  const sigBuf    = signatureBase64      ? Buffer.from(signatureBase64.replace(/^data:image\/\w+;base64,/, ''),      'base64') : null
  const payerBuf  = payerSignatureBase64 ? Buffer.from(payerSignatureBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64') : null

  const modules = []
  if (sigBuf || payerBuf) {
    modules.push(new ImageModule({
      centered: false,
      getImage: (_val, tagName) => {
        if (tagName === 'paysig') return payerBuf ?? sigBuf
        return sigBuf ?? payerBuf
      },
      getSize: () => [120, 40],
    }))
  }

  const doc = new Docxtemplater(zip, {
    modules,
    delimiters:    { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks:    true,
    nullGetter:    () => '',
  })

  doc.render(buildData(entry, { payerDisplayName }))

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
      return await appendIdCardPage(pdfBuf, entry.id_card_image, signatureBase64)
    } catch (err) {
      console.error(`[generateEntryPdf] id-card append failed for entry ${entry.id}:`, err.message)
      // ล้มเหลวตรงนี้ไม่ควรทำให้ทั้งใบพัง — คืนใบเสร็จเปล่าๆ ไป
    }
  }

  return pdfBuf
}

const A4 = { w: 595.28, h: 841.89 }  // pt (portrait)

/** append หน้า A4 ที่มีสำเนาบัตร watermark แล้ว ต่อท้าย PDF ใบเสร็จ */
async function appendIdCardPage(pdfBuf, idCardBuffer, signatureBase64 = null) {
  const wmJpeg = await buildWatermarkedIdCard(idCardBuffer, signatureBase64)

  const pdf = await PDFDocument.load(pdfBuf)
  const img = await pdf.embedJpg(wmJpeg)
  const page = pdf.addPage([A4.w, A4.h])

  const margin = 48
  const maxW = A4.w - margin * 2
  const maxH = A4.h - margin * 2
  const scale = Math.min(maxW / img.width, maxH / img.height)
  const w = img.width * scale
  const h = img.height * scale

  page.drawImage(img, {
    x: (A4.w - w) / 2,
    y: (A4.h - h) / 2,
    width:  w,
    height: h,
  })

  const out = await pdf.save()
  return Buffer.from(out)
}
