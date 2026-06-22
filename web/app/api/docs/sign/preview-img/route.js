import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken, getEntryById, getSignatureByEntryId } from '@/db/docs/entries.js'
import { generateEntryPdf } from '@/lib/generatePdf.js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'

const execFileAsync = promisify(execFile)

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return Response.json({ error: 'token required' }, { status: 400 })

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-prev-'))
  const tmpPdf = path.join(tmpDir, 'p.pdf')

  try {
    const entry = await getEntryByToken(token)
    if (!entry) return Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 })
    if (entry.token_expires_at && new Date(entry.token_expires_at) < new Date()) {
      return Response.json({ error: 'ลิงก์หมดอายุแล้ว' }, { status: 410 })
    }

    const full   = await getEntryById(entry.id)
    const recSig = await getSignatureByEntryId(entry.id, 'recipient')
    const paySig = await getSignatureByEntryId(entry.id, 'payer')
    const pdf    = await generateEntryPdf(full, {
      signatureBase64:      recSig?.signature_base64 ?? null,
      payerSignatureBase64: paySig?.signature_base64 ?? null,
      payerDisplayName:     full.payer_display_name ?? null,
      payerPosition:        full.payer_position     ?? null,
    })

    fs.writeFileSync(tmpPdf, pdf)
    await execFileAsync('pdftoppm', ['-jpeg', '-r', '120', tmpPdf, path.join(tmpDir, 'pg')])

    const pages = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('pg') && f.endsWith('.jpg'))
      .sort()
      .map(f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(tmpDir, f)).toString('base64'))

    return Response.json({ pages }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[preview-img]', err)
    return Response.json({ error: err.message || 'สร้างรูปไม่สำเร็จ' }, { status: 500 })
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}
