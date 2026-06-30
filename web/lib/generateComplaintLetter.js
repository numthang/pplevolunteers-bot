import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname   = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE    = path.join(__dirname, '../templates/complaint/template.docx')
const LIBREOFFICE = '/usr/bin/libreoffice'

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                     'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const THAI_DIGITS = ['๐','๑','๒','๓','๔','๕','๖','๗','๘','๙']

function toThaiNumerals(str) {
  return String(str).replace(/[0-9]/g, d => THAI_DIGITS[d])
}

function thaiDate(d = new Date()) {
  return `${toThaiNumerals(d.getDate())} ${THAI_MONTHS[d.getMonth()]} ${toThaiNumerals(d.getFullYear() + 543)}`
}

export function generateComplaintLetterPdf({ org_name, address, subject, recipient_title, recipient_name, attachments, body, signer_name, signer_position, coordinator_name, coordinator_phone }) {
  const template = fs.readFileSync(TEMPLATE, 'binary')
  const zip = new PizZip(template)
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })

  const t = (v) => toThaiNumerals(v || '')

  doc.render({
    org_name:          t(org_name),
    address:           t(address),
    date:              thaiDate(),
    subject:           t(subject),
    recipient_title:   t(recipient_title),
    recipient_name:    t(recipient_name),
    attachments:       t(attachments || '-'),
    body:              t(body),
    signer_name:       t(signer_name),
    signer_position:   t(signer_position),
    coordinator_name:  t(coordinator_name || '-'),
    coordinator_phone: t(coordinator_phone || '-'),
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
