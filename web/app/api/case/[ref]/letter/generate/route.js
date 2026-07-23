import { gateCase } from '@/lib/caseGate.js'
import { getLetterConfig } from '@/db/caseLetterConfig.js'
import { generateComplaintLetterPdf } from '@/lib/generateComplaintLetter.js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'

const execFileAsync = promisify(execFile)

/** POST /api/case/[ref]/letter/generate — รับ letter fields จาก modal, ดึง config จาก DB, คืน preview + PDF */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { orgId, caseRow } = gate

  const letterFields = await req.json().catch(() => ({}))
  const required = ['subject', 'recipient_name', 'body']
  for (const f of required) {
    if (!letterFields[f]?.trim()) return Response.json({ error: `กรุณาใส่ ${f}` }, { status: 400 })
  }

  const config = await getLetterConfig(orgId, caseRow.province)
  if (!config) return Response.json({ error: `ยังไม่มี config หนังสือสำหรับจังหวัด ${caseRow.province}` }, { status: 400 })

  const fields = {
    org_name:          config.org_name,
    address:           config.address,
    signer_name:       config.signer_name,
    signer_position:   config.signer_position,
    coordinator_name:  config.coordinator_name,
    coordinator_phone: config.coordinator_phone,
    ...letterFields,
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cletter-'))
  const tmpPdf = path.join(tmpDir, 'letter.pdf')

  try {
    const pdfBuf = generateComplaintLetterPdf(fields)
    fs.writeFileSync(tmpPdf, pdfBuf)

    await execFileAsync('pdftoppm', ['-jpeg', '-r', '120', tmpPdf, path.join(tmpDir, 'pg')])

    const pages = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('pg') && f.endsWith('.jpg'))
      .sort()
      .map(f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(tmpDir, f)).toString('base64'))

    const pdfBase64 = pdfBuf.toString('base64')

    return Response.json({ pages, pdfBase64 }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[letter/generate]', err)
    return Response.json({ error: err.message || 'สร้างเอกสารไม่สำเร็จ' }, { status: 500 })
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}
