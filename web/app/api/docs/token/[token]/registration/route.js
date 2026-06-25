import { getProjectByToken } from '@/db/docs/projects.js'
import { getRegPdfPath, getRegPdfFilename } from '@/lib/cropDocument.js'
import { readFile as fsReadFile } from 'fs/promises'

/** GET /api/docs/token/[token]/pdf — public PDF download (no login required) */
export async function GET(req, { params }) {
  const { token } = await params
  if (!token || token.length !== 8) return new Response('Invalid token', { status: 400 })

  const project = await getProjectByToken('pdf', token)
  if (!project) return new Response('ลิงก์หมดอายุหรือไม่ถูกต้อง', { status: 410 })

  const projectName = project.project_name || project.event_name || `project_${project.id}`
  const pdfPath = getRegPdfPath(project.id, projectName)

  try {
    const buf = await fsReadFile(pdfPath)
    const filename = getRegPdfFilename(projectName)
    return new Response(buf, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="reg.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length':      String(buf.length),
        'Cache-Control':       'private, no-store',
      },
    })
  } catch {
    return new Response('ยังไม่มีไฟล์ PDF', { status: 404 })
  }
}
