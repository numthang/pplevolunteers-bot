import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import ImageModule from 'docxtemplater-image-module-free'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { LOGO_BOX_W_EMU, LOGO_BOX_H_EMU } from './letterLogo.js'

const __dirname   = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE     = path.join(__dirname, '../templates/complaint/template.docx')
const DEFAULT_LOGO = path.join(__dirname, '../public/letterhead-default.png')
const LIBREOFFICE  = '/usr/bin/libreoffice'
const EMU_PER_PX    = 9525

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                     'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const THAI_DIGITS = ['๐','๑','๒','๓','๔','๕','๖','๗','๘','๙']

function toThaiNumerals(str) {
  return String(str).replace(/[0-9]/g, d => THAI_DIGITS[d])
}

function thaiDate(d = new Date()) {
  return `${toThaiNumerals(d.getDate())} ${THAI_MONTHS[d.getMonth()]} ${toThaiNumerals(d.getFullYear() + 543)}`
}

// เทมเพลตฝัง 2 tab ไว้หน้า {body} ให้ย่อหน้าแรกเท่านั้น (linebreaks:true ทำ \n เป็นแค่ตัดบรรทัดในย่อหน้าเดียวกัน
// ไม่ใช่ย่อหน้าใหม่ — ย่อหน้าถัดไปเลยไม่ได้ indent ตามไปด้วย) ย่อหน้าที่ 2 เป็นต้นไปจึงต้องเติม tab เองที่นี่
function indentParagraphs(text) {
  const paras = String(text || '').split(/\n\s*\n/)
  return paras.map((p, i) => (i === 0 ? p : `\t\t${p}`)).join('\n\n')
}

export function generateComplaintLetterPdf({ org_name, address, subject, recipient_title, recipient_name, reference, attachments, body, signer_name, signer_position, signer_phone, coordinator_name, coordinator_phone, logo_path }) {
  const template = fs.readFileSync(TEMPLATE, 'binary')
  const zip = new PizZip(template)

  /**
   * โลโก้ที่ org อัปโหลดเอง (/org/settings/letter) — แทรกเข้าไปตอน render ผ่าน image module
   * (เทมเพลตไม่มีรูปฝังอยู่ก่อน — {%LOGO} เป็นแค่ tag ว่างๆ ให้โมดูลแทรกรูปทับ)
   * ไฟล์ถูกย่อลงกรอบมาตรฐานตั้งแต่ตอนอัปโหลดแล้ว (web/lib/letterLogo.js)
   * อ่านไฟล์ไม่ได้ (ถูกลบทิ้ง/ย้ายเครื่อง) = ใช้โลโก้ค่าเริ่มต้นต่อ ไม่ใช่พังทั้งใบ
   */
  let logoBuffer = fs.readFileSync(DEFAULT_LOGO)
  if (logo_path) {
    // ⛔ กันอ่านไฟล์นอกโฟลเดอร์: เทียบ path ที่ resolve แล้วจริงๆ ไม่ใช่เชื่อ prefix ของ string
    //    ('/uploads/../../.env' ผ่าน startsWith('/uploads/') ได้สบาย)
    const dir = path.join(__dirname, '../public/uploads/org-letterhead')
    const abs = path.resolve(__dirname, '../public', logo_path.replace(/^\//, ''))
    if (abs.startsWith(dir + path.sep)) {
      try {
        logoBuffer = fs.readFileSync(abs)
      } catch (e) {
        console.error('[generateComplaintLetter] โลโก้ที่ตั้งไว้อ่านไม่ได้ ใช้ค่าเริ่มต้นแทน:', e.message)
      }
    } else {
      console.error('[generateComplaintLetter] logo_path นอกโฟลเดอร์ที่อนุญาต ข้าม:', logo_path)
    }
  }

  const modules = [new ImageModule({
    centered: false,
    getImage: () => logoBuffer,
    getSize:  () => [Math.round(LOGO_BOX_W_EMU / EMU_PER_PX), Math.round(LOGO_BOX_H_EMU / EMU_PER_PX)],
  })]

  // nullGetter ป้องกัน tag ที่ไม่มีค่าใน data ขึ้นเป็นคำว่า "undefined" จริงๆ ในเอกสาร (default ของ docxtemplater)
  const doc = new Docxtemplater(zip, { modules, paragraphLoop: true, linebreaks: true, nullGetter: () => '' })

  const t = (v) => toThaiNumerals(v || '')

  doc.render({
    org_name:          t(org_name),
    address:           t(address),
    date:              thaiDate(),
    subject:           t(subject),
    recipient_title:   t(recipient_title),
    recipient_name:    t(recipient_name),
    // ทั้งบรรทัดประกอบที่นี่ ไม่ใช่ในเทมเพลต — ว่างต้องไม่เหลือคำว่า "อ้างถึง" ลอยอยู่
    reference_line:    reference?.trim() ? t(`อ้างถึง ${reference.trim()}`) : '',
    attachments:       t(attachments || '-'),
    body:              t(indentParagraphs(body)),
    signer_name:       t(signer_name),
    signer_position:   t(signer_position),
    // ทั้งบรรทัดประกอบที่นี่ ไม่ใช่ในเทมเพลต — เบอร์ว่างต้องไม่เหลือคำว่า "โทร" ลอยอยู่
    signer_phone_line: signer_phone?.trim() ? t(`โทร ${signer_phone.trim()}`) : '',
    coordinator_name:  t(coordinator_name || '-'),
    coordinator_phone: t(coordinator_phone || '-'),
    LOGO:              'logo',
  })

  const filled  = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'complaint-'))
  const tmpDocx = path.join(tmpDir, 'letter.docx')

  fs.writeFileSync(tmpDocx, filled)

  const result = spawnSync(LIBREOFFICE, [
    '--headless', '--convert-to', 'pdf', '--outdir', tmpDir, tmpDocx,
  ], { timeout: 30_000 })

  fs.unlinkSync(tmpDocx)

  if (result.status !== 0 || result.error) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    throw new Error(`LibreOffice failed: ${result.error?.message || result.stderr?.toString()?.trim() || `status=${result.status}`}`)
  }

  const pdfPath = path.join(tmpDir, 'letter.pdf')
  const pdfBuf  = fs.readFileSync(pdfPath)
  fs.rmSync(tmpDir, { recursive: true, force: true })

  return pdfBuf
}
