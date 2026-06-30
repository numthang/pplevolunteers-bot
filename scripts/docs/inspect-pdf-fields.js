/**
 * Inspect PDF templates — แสดง page size + form fields (ถ้ามี)
 * Usage: node scripts/docs/inspect-pdf-fields.js
 */
import { PDFDocument } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = path.join(__dirname, '../../web/templates')

const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.pdf')).sort()

for (const file of files) {
  const buf = fs.readFileSync(path.join(TEMPLATES_DIR, file))
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
  const pages = doc.getPages()
  const page = pages[0]
  const { width, height } = page.getSize()

  console.log(`\n─── ${file} ───`)
  console.log(`  Pages: ${pages.length}  Size: ${width.toFixed(1)} x ${height.toFixed(1)} pt (${(width/72*2.54).toFixed(1)} x ${(height/72*2.54).toFixed(1)} cm)`)

  // AcroForm fields
  try {
    const form = doc.getForm()
    const fields = form.getFields()
    if (fields.length === 0) {
      console.log('  Fields: (none — ต้องวัด XY coordinates เอง)')
    } else {
      console.log(`  Fields (${fields.length}):`)
      for (const f of fields) {
        const name = f.getName()
        const widgets = f.acroField.getWidgets()
        for (const w of widgets) {
          const rect = w.getRectangle()
          console.log(`    ${name.padEnd(40)} x=${rect.x.toFixed(1)} y=${rect.y.toFixed(1)} w=${rect.width.toFixed(1)} h=${rect.height.toFixed(1)}`)
        }
      }
    }
  } catch {
    console.log('  Fields: (could not parse form)')
  }
}
