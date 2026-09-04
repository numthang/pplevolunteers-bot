/**
 * Rebuild แนบท้าย 3 PDF ของโปรเจกต์ใหม่จากไฟล์แนบที่มีอยู่ — ใช้ตอน PDF เดิมพัง
 * (เช่นบั๊ก build_pdf.py แข่งกันเขียน tmp path เดียวกัน เจอ 2026-09-04, แก้แล้วใน build_pdf.py
 *  แต่ไฟล์ที่พังไปแล้วก่อนแก้ต้อง trigger rebuild เองรอบเดียว)
 *
 * รันจาก web/ (ให้ DOCS_UPLOAD_DIR fallback resolve ถูก):
 *   cd web && node --import ../scripts/smoke/_envload.mjs ../scripts/docs/rebuildRegistrationPdf.mjs <token>
 */
import { getProjectByToken } from '@/db/docs/projects.js'
import { getAttachmentsByProject } from '@/db/docs/attachments.js'
import { buildRegistrationPdf, getRegPdfPath } from '@/lib/cropDocument.js'

const token = process.argv[2]
if (!token) {
  console.error('Usage: node ... rebuildRegistrationPdf.mjs <token>')
  process.exit(1)
}

const project = await getProjectByToken(token)
if (!project) {
  console.error('ไม่พบโปรเจกต์ (token ผิดหรือหมดอายุ)')
  process.exit(1)
}

const attachments = await getAttachmentsByProject(project.id)
if (attachments.length === 0) {
  console.error(`โปรเจกต์ ${project.id} ไม่มีไฟล์แนบให้ประกอบ PDF`)
  process.exit(1)
}

const projectName = project.project_name || project.event_name || `project_${project.id}`
await buildRegistrationPdf(project.id, projectName, attachments.map(a => a.file_path))

console.log(`สร้าง PDF ใหม่แล้ว: project ${project.id} "${projectName}" (${attachments.length} ไฟล์)`)
console.log(`path: ${getRegPdfPath(project.id, projectName)}`)
process.exit(0)
