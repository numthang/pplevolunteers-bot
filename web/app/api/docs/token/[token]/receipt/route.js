import { getProjectByToken } from '@/db/docs/projects.js'
import { getEntriesByProject, getEntryById, getSignatureByEntryId } from '@/db/docs/entries.js'
import { getAttachmentsByProject } from '@/db/docs/attachments.js'
import { generateEntryPdfs } from '@/lib/generatePdf.js'
import { buildFooterImage } from '@/lib/idCard.js'
import { readFile, getUploadPath } from '@/lib/cropDocument.js'
import { PDFDocument } from 'pdf-lib'
import path from 'path'

/** GET /api/docs/token/[token]/export — public export download (no login required) */
export async function GET(req, { params }) {
  const { token } = await params
  if (!token || token.length !== 8) return new Response('Invalid token', { status: 400 })

  const project = await getProjectByToken(token)
  if (!project) return new Response('ลิงก์หมดอายุหรือไม่ถูกต้อง', { status: 410 })

  // ค่าเริ่มต้น: แสดงทุกรายการแม้ยังไม่เซ็น (user เคาะ 2026-08-24) — ใส่ ?status=signed ถ้าจะกรองเฉพาะที่เซ็นแล้ว
  const onlySigned = new URL(req.url).searchParams.get('status') === 'signed'

  try {
    const entries  = await getEntriesByProject(project.id)
    const filtered = onlySigned ? entries.filter(e => e.status === 'signed') : entries
    // "มีผู้รับหรือยัง" ต้องดูคอลัมน์ผู้รับจริง ไม่ใช่ discord_id (สำเนาเดียวกับใน projects/[id]/export)
    // discord_id เป็น display-only — สมาชิกที่ล็อกอินด้วยอีเมลเป็น NULL และคนนอกไม่มี Discord เลย
    const targets  = filtered.filter(e => e.member_user_id != null || e.external_payee_id != null)
    if (!targets.length) {
      return new Response(onlySigned ? 'ไม่มีรายการที่เซ็นแล้ว' : 'ไม่มีรายการที่พร้อม export', { status: 422 })
    }

    const merged     = await PDFDocument.create()
    const headerText = project.event_name ?? project.project_name ?? ''
    let footerImg = null
    if (headerText) {
      const footerPng = await buildFooterImage(headerText)
      footerImg = await merged.embedPng(footerPng)
    }

    // ดึงข้อมูลให้ครบทุกใบก่อน แล้วค่อย render ทีเดียว — LibreOffice จะได้สตาร์ทรอบเดียวต่อ request
    const items = []
    for (const row of targets) {
      try {
        const entry  = await getEntryById(row.id)
        const recSig = await getSignatureByEntryId(row.id, 'recipient')
        const paySig = await getSignatureByEntryId(row.id, 'payer')
        items.push({
          entry,
          signatureBase64:      recSig?.signature_base64 ?? null,
          payerSignatureBase64: paySig?.signature_base64 ?? null,
          payerDisplayName:     entry.payer_display_name ?? null,
          payerPosition:        entry.payer_position     ?? null,
        })
      } catch (err) {
        console.error(`[token/export] entry ${row.id}:`, err.message)
      }
    }

    for (const res of await generateEntryPdfs(items)) {
      if (!res.pdf) {
        console.error(`[token/export] entry ${res.entry.id}:`, res.error)
        continue
      }
      try {
        const src   = await PDFDocument.load(res.pdf)
        const pages = await merged.copyPages(src, src.getPageIndices())
        for (const p of pages) {
          merged.addPage(p)
          if (footerImg) {
            const { width } = p.getSize()
            p.drawImage(footerImg, { x: 0, y: 0, width, height: 14 })
          }
        }
      } catch (err) {
        console.error(`[token/export] entry ${res.entry.id}:`, err.message)
      }
    }

    const A4_W = 595.28, A4_H = 841.89
    const attachments = await getAttachmentsByProject(project.id)
    for (const att of attachments) {
      try {
        const buf  = await readFile(path.join(getUploadPath(), att.file_path))
        const img  = await merged.embedJpg(buf)
        const page = merged.addPage([A4_W, A4_H])
        page.drawImage(img, { x: 0, y: 0, width: A4_W, height: A4_H })
      } catch {}
    }

    merged.setTitle(`ใบสำคัญรับเงินโครงการ${project.event_name ? ` ${project.event_name}` : ''}`)
    const bytes   = await merged.save()
    const buf     = Buffer.from(bytes)
    const utf8Name = encodeURIComponent(`ใบสำคัญรับเงินโครงการ${project.event_name ? ` ${project.event_name}` : ''}.pdf`)

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="export.pdf"; filename*=UTF-8''${utf8Name}`,
        'Content-Length':      String(buf.length),
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (err) {
    console.error('[token/export]', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
