import { readFile } from 'fs/promises'
import { join } from 'path'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { canViewAccount } from '@/lib/financeAccess.js'
import { getTransactionByEvidenceUrl } from '@/db/finance/transactions.js'
import { getAccountById } from '@/db/finance/accounts.js'
import { getFinanceUploadDir, financeEvidenceUrl } from '@/lib/financeUploads.js'

/**
 * เสิร์ฟสลิป/หลักฐานการเงิน — **ต้องผ่านสิทธิ์เสมอ**
 *
 * เดิมไฟล์อยู่ `web/public/uploads/evidence/` ซึ่ง Next เสิร์ฟเป็น static ให้เองก่อนถึง route นี้
 * = ใครมี URL ก็เปิดดูสลิปได้โดยไม่ต้องล็อกอิน (middleware ก็กันไม่ได้ เพราะ matcher ยกเว้น
 * ทุก path ที่ลงท้ายด้วยนามสกุลไฟล์) ตอนนี้ไฟล์ย้ายออกนอก public/ แล้ว ทุก request จึงมาถึงที่นี่
 *
 * สิทธิ์ = สิทธิ์ของ "บัญชี" ที่ธุรกรรมใบนั้นสังกัด — ชุดเดียวกับที่ /api/finance/transactions ใช้
 * (บัญชี private เห็นได้เฉพาะเจ้าของ แม้เป็น admin)
 */
export async function GET(req, { params }) {
  const { filename } = await params
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return new Response('Not Found', { status: 404 })
  }

  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const orgId = await getOrgId(session)
  if (!orgId) return new Response('Forbidden', { status: 403 })

  // ผูกไฟล์กับธุรกรรมก่อน — ไฟล์ที่ไม่มีธุรกรรมไหนอ้างถึงคือไฟล์กำพร้า ไม่ต้องเสิร์ฟ
  const txn = await getTransactionByEvidenceUrl(orgId, financeEvidenceUrl(filename))
  if (!txn) return new Response('Not Found', { status: 404 })

  const { userId: effectiveUserId, access } = await getEffectiveOrgIdentity(session)
  const account = await getAccountById(orgId, txn.account_id)
  if (!account || !canViewAccount(account, effectiveUserId, access)) {
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const buf = await readFile(join(getFinanceUploadDir(), filename))
    const ext = filename.split('.').pop().toLowerCase()
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return new Response(buf, {
      headers: {
        'Content-Type': contentType,
        // private — ห้ามให้ proxy/CDN แคชสลิปไว้แจกต่อ (เดิมเป็น public, immutable)
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new Response('Not Found', { status: 404 })
  }
}
