import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import ImageModule from 'docxtemplater-image-module-free'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE   = path.join(__dirname, 'templates/receipts/template-1.docx')
const BODY_BREAK   = path.join(__dirname, 'templates/receipts/body-1/break.docx')
const BODY_SPEAKER = path.join(__dirname, 'templates/receipts/body-1/speaker.docx')
const OUT_DIR    = path.join(__dirname, 'templates/receipts')

const { createCanvas } = await import('@napi-rs/canvas')
function makeSigPng(seed) {
  const c = createCanvas(240, 80)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 240, 80)
  ctx.strokeStyle = '#1a1a8c'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(10, 50)
  ctx.bezierCurveTo(40, 10 + seed, 80, 70 - seed, 120, 40)
  ctx.bezierCurveTo(150, 20 + seed, 190, 60, 230, 35)
  ctx.stroke()
  return c.toBuffer('image/png')
}
const SIG_PNG    = makeSigPng(5)
const PAYSIG_PNG = makeSigPng(15)

const data = {
  header:          'ค่าอาหาร',
  receipt_no:      '0001',
  day:             '20',
  month:           'มิถุนายน',
  year:            '2568',
  full_name:       'นายสมชาย',
  last_name:       'ใจดี',
  id_number:       '1 2345 67890 12 3',
  house_no:        '123/45',
  moo:             '6',
  road:            'ซอยรามคำแหง 42',
  street:          'ถนนรามคำแหง',
  subdistrict:     'หัวหมาก',
  district:        'บางกะปิ',
  province_addr:   'กรุงเทพมหานคร',
  phone:           '081-234-5678',
  branch_province: 'ราชบุรี',
  branch_no:       '001',
  project_name:      'โครงการทดสอบ',
  sub_project_name:  'กิจกรรมย่อย 1',
  topic:             'การพัฒนาศักยภาพอาสาสมัคร',
  duration:          '3',
  amount:          '1,500.00',
  total:           '1,500.00',
  amount_text:     'หนึ่งพันห้าร้อยบาทถ้วน',
  payee_name:      'นายสมชาย ใจดี',
  payer_name:      'นายธีระพนธ์ เทศเกิด',
  payer_position:  'เหรัญญิก',
  sig:             'sig',
  paysig:          'paysig',
}

function injectBodyIntoTemplate(templateZip, bodyPath) {
  const bodyZip = new PizZip(fs.readFileSync(bodyPath))
  const bodyXml = bodyZip.files['word/document.xml'].asText()
  const bodyMatch = bodyXml.match(/<w:body>([\s\S]*?)<w:sectPr/)
  const bodyContent = bodyMatch ? bodyMatch[1].trim() : ''

  const xml = templateZip.files['word/document.xml'].asText()
  const merged = xml.replace(
    /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*\{\{payment_details\}\}(?:(?!<\/w:p>)[\s\S])*<\/w:p>/,
    bodyContent
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

const buf = fs.readFileSync(TEMPLATE)
const zip = new PizZip(buf)
injectBodyIntoTemplate(zip, BODY_SPEAKER)
colorVariableRuns(zip)

const imageModule = new ImageModule({
  centered: false,
  getImage: (_val, tagName) => tagName === 'paysig' ? PAYSIG_PNG : SIG_PNG,
  getSize:  () => [120, 40],
})

const doc = new Docxtemplater(zip, {
  modules:       [imageModule],
  delimiters:    { start: '{{', end: '}}' },
  paragraphLoop: true,
  linebreaks:    true,
  nullGetter:    () => '',
})

doc.render(data)

const filled  = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
const outDocx = path.join(OUT_DIR, '_test-generic.docx')
fs.writeFileSync(outDocx, filled)
console.log('wrote:', outDocx)

const result = spawnSync('/usr/bin/libreoffice', [
  '--headless', '--convert-to', 'pdf', '--outdir', OUT_DIR, outDocx,
], { timeout: 30_000 })

if (result.status !== 0) {
  console.error('LibreOffice error:', result.stderr?.toString())
  process.exit(1)
}

console.log('PDF:', outDocx.replace('.docx', '.pdf'))
