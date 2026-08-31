#!/usr/bin/env node
/**
 * สร้าง web/templates/complaint/template.docx จาก template.base.docx
 *
 * ทำไมต้องมีสคริปต์: .docx เป็นไฟล์ไบนารีที่ diff ไม่ได้ ถ้าแก้ด้วยมือใน Word/LibreOffice
 * รอบหน้าจะไม่มีใครรู้ว่าอะไรเปลี่ยนไปบ้าง · ที่นี่เขียนเป็นโค้ดไว้ = อ่าน git diff รู้เรื่อง แล้วรันซ้ำได้
 *
 * ⚠️ 2 ไฟล์ อย่าสลับกัน:
 *   template.base.docx  ต้นฉบับดิบ — หัวจดหมาย 3 ย่อหน้า ไม่มีโลโก้ ไม่มี footer · **ห้ามแก้**
 *   template.docx       ผลลัพธ์ที่สคริปต์นี้สร้าง · **ตัวที่โค้ดใช้จริง** · ห้ามแก้ด้วยมือ แก้สคริปต์แล้วรันใหม่
 *
 * เดิมสคริปต์อ่าน template.docx แล้วเขียนทับตัวเอง → รันรอบ 2 พัง (หาย่อหน้าผู้ประสานงานไม่เจอ
 * เพราะรอบแรกย้ายไป footer แล้ว) ทำให้ "เปลี่ยนโลโก้แล้วรันใหม่" ทำไม่ได้ถ้าไม่ git checkout ก่อน
 *
 * แก้อะไรจาก base:
 *   1. หัวจดหมาย = ตาราง 2 ช่องไม่มีเส้น · ซ้าย = โลโก้ (web/public/logo.png) ขวา = ชื่อ/ที่อยู่/วันที่
 *   2. บล็อกผู้ลงนาม = ครอบวงเล็บ ({signer_name}) + เพิ่มบรรทัด "โทร {signer_phone}"
 *   3. บรรทัดผู้ประสานงาน ย้ายจาก body ไปเป็น footer จริงของหน้า (word/footer1.xml) 3 บรรทัดชิดซ้าย
 *
 * รัน: node scripts/buildComplaintLetterTemplate.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import PizZip from '../web/node_modules/pizzip/js/index.js'
import sharp from '../web/node_modules/sharp/lib/index.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = path.join(ROOT, 'web/templates/complaint/template.base.docx')
const OUT = path.join(ROOT, 'web/templates/complaint/template.docx')
const LOGO_SRC = path.join(ROOT, 'web/public/logo.png')

const FONT = '<w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:eastAsia="TH Sarabun New" w:cs="TH Sarabun New"/>'
const SZ = '<w:sz w:val="32"/><w:szCs w:val="32"/>'

/** ย่อหน้าหนึ่งบรรทัด — align/ระยะห่างท้ายย่อหน้า (twips) กำหนดได้ */
function para(text, { jc = 'left', after = 0, bold = false } = {}) {
  return `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:before="0" w:after="${after}"/><w:jc w:val="${jc}"/></w:pPr>`
    + `<w:r><w:rPr>${FONT}${bold ? '<w:b/><w:bCs/>' : '<w:b w:val="false"/>'}${SZ}</w:rPr>`
    + `<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

// 800100 EMU ≈ 2.22 ซม. — ใหญ่พอให้เห็นตราองค์กร แต่ไม่เบียดบล็อกชื่อ/ที่อยู่ฝั่งขวา
const LOGO_EMU = 800100
const logoParagraph = `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:before="0" w:after="0"/><w:jc w:val="left"/></w:pPr>`
  + `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">`
  + `<wp:extent cx="${LOGO_EMU}" cy="${LOGO_EMU}"/><wp:docPr id="1" name="logo"/>`
  + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`
  + `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
  + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
  + `<pic:nvPicPr><pic:cNvPr id="1" name="logo"/><pic:cNvPicPr/></pic:nvPicPr>`
  + `<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
  + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${LOGO_EMU}" cy="${LOGO_EMU}"/></a:xfrm>`
  + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
  + `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`

// พื้นที่พิมพ์ = 12240 - (1134 × 2) = 9972 twips · ช่องโลโก้ 1560 ที่เหลือเป็นบล็อกชื่อ/ที่อยู่
const CELL_LOGO = 1560
const CELL_TEXT = 9972 - CELL_LOGO
const noBorders = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map(s => `<w:${s} w:val="none" w:sz="0" w:space="0"/>`).join('') + '</w:tblBorders>'

const letterhead = `<w:tbl><w:tblPr><w:tblW w:w="9972" w:type="dxa"/><w:tblLayout w:type="fixed"/>${noBorders}`
  + `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>`
  + `</w:tblPr><w:tblGrid><w:gridCol w:w="${CELL_LOGO}"/><w:gridCol w:w="${CELL_TEXT}"/></w:tblGrid>`
  + `<w:tr><w:tc><w:tcPr><w:tcW w:w="${CELL_LOGO}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${logoParagraph}</w:tc>`
  + `<w:tc><w:tcPr><w:tcW w:w="${CELL_TEXT}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>`
  + para('{org_name}', { jc: 'right', bold: true })
  + para('{address}', { jc: 'right' })
  + para('{date}', { jc: 'right' })
  + `</w:tc></w:tr></w:tbl>`
  // ย่อหน้าว่างคั่นหัวจดหมายกับ "เรื่อง" — ตารางชนย่อหน้าถัดไปตรงๆ จะดูอัดกัน
  + `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:before="0" w:after="120"/></w:pPr></w:p>`

// footer ชิดซ้าย 3 บรรทัด ตามหนังสือจริงที่องค์กรใช้:
//   สาขา… / ผู้ประสานงาน <ชื่อ> / โทร <เบอร์>
const FOOTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
  + para('{org_name}', { jc: 'left' })
  + para('ผู้ประสานงาน {coordinator_name}', { jc: 'left' })
  + para('โทร {coordinator_phone}', { jc: 'left' })
  + `</w:ftr>`

const zip = new PizZip(fs.readFileSync(BASE, 'binary'))
const read = (f) => zip.file(f).asText()

// ── 1. โลโก้ ──────────────────────────────────────────────────────────────────
// ย่อเหลือ 320px ก่อนฝัง — ต้นฉบับ 1301×1301 (130KB) ใหญ่เกินจำเป็นสำหรับภาพ 2.2 ซม.
const logoPng = await sharp(LOGO_SRC).resize(320, 320, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer()
zip.file('word/media/logo.png', logoPng)

// ── 2. rels: โลโก้ + footer ───────────────────────────────────────────────────
let rels = read('word/_rels/document.xml.rels')
const logoId = 'rId' + (Math.max(...[...rels.matchAll(/Id="rId(\d+)"/g)].map(m => +m[1])) + 1)
const footerId = 'rId' + (+logoId.slice(3) + 1)
rels = rels.replace('</Relationships>',
  `<Relationship Id="${logoId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>`
  + `<Relationship Id="${footerId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`
  + '</Relationships>')
zip.file('word/_rels/document.xml.rels', rels)
zip.file('word/footer1.xml', FOOTER_XML)

// ── 3. content types: .png + footer part ─────────────────────────────────────
let ct = read('[Content_Types].xml')
if (!ct.includes('Extension="png"')) {
  ct = ct.replace('<Default Extension="xml"', '<Default Extension="png" ContentType="image/png"/><Default Extension="xml"')
}
if (!ct.includes('footer1.xml')) {
  ct = ct.replace('</Types>', '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')
}
zip.file('[Content_Types].xml', ct)

// ── 4. document.xml ──────────────────────────────────────────────────────────
let doc = read('word/document.xml')

/** ขอบเขตของย่อหน้าที่มีข้อความ needle — คืน [start, end) ของ <w:p>…</w:p> */
function paraRange(xml, needle) {
  const at = xml.indexOf(needle)
  if (at < 0) throw new Error(`หา "${needle}" ใน document.xml ไม่เจอ — base เปลี่ยนโครงไปแล้ว`)
  const start = xml.lastIndexOf('<w:p>', at)
  return [start, xml.indexOf('</w:p>', at) + '</w:p>'.length]
}

// 4.1 หัวจดหมาย — แทน 3 ย่อหน้าแรก (ชื่อ/ที่อยู่/วันที่) ด้วยตารางโลโก้+บล็อกขวา
const headStart = doc.indexOf('<w:body>') + '<w:body>'.length
const headEnd = paraRange(doc, '{date}')[1]
doc = doc.slice(0, headStart) + letterhead.replace('rIdLogo', logoId) + doc.slice(headEnd)

// 4.2 ผู้ลงนาม — ครอบวงเล็บชื่อ + เพิ่มบรรทัดเบอร์ต่อท้ายตำแหน่ง
//     ระยะห่างท้ายย่อหน้าย้ายจาก {signer_position} ไปไว้ที่บรรทัดเบอร์แทน ไม่งั้นเบอร์จะหล่นห่างจากตำแหน่ง
doc = doc.replace('<w:t>{signer_name}</w:t>', '<w:t>({signer_name})</w:t>')
const [posStart, posEnd] = paraRange(doc, '{signer_position}')
const posPara = doc.slice(posStart, posEnd).replace('w:after="240"', 'w:after="0"')
// ประกอบทั้งบรรทัด ("โทร 065-…") ในฝั่ง JS ไม่ใช่ที่นี่ — คนส่วนใหญ่ไม่มีเบอร์ในโปรไฟล์
// (วัดแล้ว users.phone มี 5/6751) ถ้าวาง "โทร {signer_phone}" ไว้ในเทมเพลต จะได้คำว่า "โทร" ลอยเปล่าๆ
doc = doc.slice(0, posStart) + posPara + para('{signer_phone_line}', { jc: 'right', after: 240 }) + doc.slice(posEnd)

// 4.3 บรรทัดผู้ประสานงาน — ย้ายออกจาก body ไปเป็น footer จริง
const [coordStart, coordEnd] = paraRange(doc, 'ผู้ประสานงาน')
doc = doc.slice(0, coordStart) + doc.slice(coordEnd)

// 4.4 sectPr — ผูก footer + เว้นระยะขอบล่างให้ footer มีที่ยืน (base เป็น footer="0")
doc = doc.replace('<w:sectPr>', `<w:sectPr><w:footerReference w:type="default" r:id="${footerId}"/>`)
doc = doc.replace('w:header="0" w:top="1417" w:footer="0" w:bottom="1417"', 'w:header="720" w:top="1417" w:footer="567" w:bottom="1417"')

zip.file('word/document.xml', doc)

fs.writeFileSync(OUT, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(`✓ เขียน ${path.relative(ROOT, OUT)} จาก ${path.basename(BASE)} (logo ${logoPng.length} bytes, footer=${footerId})`)
