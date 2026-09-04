import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEntryByToken, signEntry } from '@/db/docs/entries.js'
import { getDocsSignPolicy } from '@/db/orgConfig.js'

/**
 * POST /api/docs/sign
 * Submit e-signature for an entry (recipient or payer)
 * Body: { token, signatureBase64 }
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.userId ?? null

  try {
    const body = await req.json()
    const { token, signatureBase64 } = body

    if (!token || !signatureBase64) {
      return Response.json({ error: 'token and signatureBase64 required' }, { status: 400 })
    }

    const entry = await getEntryByToken(token)
    if (!entry) {
      return Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 })
    }

    const policy = await getDocsSignPolicy(entry.org_id)
    const role   = entry.signer_role  // 'recipient' | 'payer'
    // โหมด open = ถือลิงก์ก็เซ็นได้ ไม่ต้องล็อกอิน (ตั้งใจทิ้ง audit trail — ดู orgConfig.js)
    // ⚠️ ตรวจ policy จาก org ของ **ใบ** เท่านั้น ห้ามเชื่อค่าที่ client ส่งมา
    //
    // ⛔ open ใช้กับลิงก์ **ผู้รับ** เท่านั้น — ลิงก์ผู้จ่ายยังบังคับล็อกอินทุกโหมด (เคาะ 2026-09-04):
    //    ลายเซ็นผู้จ่าย = การอนุมัติจ่ายเงินขององค์กร ไม่ใช่การรับเงินของบุคคล และผู้จ่ายเป็นคนในทีม
    //    ที่ล็อกอินอยู่แล้วเป็นปกติ (ยังมีลายเซ็นถาวรใน docs_payers ให้ใช้อีกทาง) — เหตุผลที่ยอมทิ้ง
    //    audit ฝั่งผู้รับ (คนนอกไม่ได้ใช้เว็บนี้เป็นประจำ) ใช้กับฝั่งผู้จ่ายไม่ได้
    const viaLink = !userId
    if (viaLink && !(policy === 'open' && role === 'recipient')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ตรวจว่าเป็นเจ้าของลิงก์ถูกต้อง
    // onBehalf = "คนเซ็น ≠ ชื่อบนใบ" — กฎเดียวครอบทั้งคนนอก (ไม่มีบัญชีให้เป็นเจ้าของ)
    // และสมาชิกที่ให้คนอื่นเซ็นแทนในโหมด flexible · ทุกโหมดบันทึกเสมอ ไม่ขึ้นบนเอกสาร
    // ⚠️ onBehalf ต้องคำนวณได้เฉพาะตอนรู้ว่าคนเซ็นเป็นใคร — โหมด open ไม่รู้ จึงเป็น false เสมอ
    // (ถ้าปล่อยให้สูตรเดิมทำงานกับ session = null ทุกใบจะถูกบันทึกว่า "คนอื่นเซ็นแทน" ทั้งที่
    //  เจ้าตัวเซ็นเอง = คอลัมน์ที่ไว้งัดมาดูตอนมีเรื่องใช้ไม่ได้เลย · ความหมาย "ไม่รู้ว่าใคร"
    //  ไปอยู่ที่ signed_via = 'link' แทน)
    let onBehalf = false
    if (viaLink) {
      // ใบที่ยังไม่ระบุผู้รับ = เซ็นไม่ได้ทุกโหมด (กฎเดียวกับข้างล่าง) — ใบไม่มีชื่อพิมพ์ออกมาก็เบิกไม่ได้
      if (!entry.member_user_id && !entry.external_payee_id) {
        return Response.json({ error: 'ใบนี้ยังไม่ได้ระบุผู้รับเงิน' }, { status: 409 })
      }
    } else if (role === 'recipient') {
      // ยังไม่ระบุผู้รับ = ไม่มีใครเซ็นได้ ไม่ว่าโหมดไหน (โหมด flexible ไม่ควรกลายเป็น
      // "ใครก็เซ็นใบเปล่าได้" — ใบที่ไม่มีชื่อผู้รับพิมพ์ออกมาก็ใช้ไม่ได้อยู่แล้ว)
      if (!entry.member_user_id && !entry.external_payee_id) {
        return Response.json({ error: 'ใบนี้ยังไม่ได้ระบุผู้รับเงิน' }, { status: 409 })
      }
      onBehalf = entry.member_user_id !== userId
      if (onBehalf && !entry.external_payee_id) {
        // ผู้รับเป็นสมาชิก แต่คนเซ็นไม่ใช่เจ้าตัว → ผ่านได้เฉพาะ org ที่เปิดโหมดยืดหยุ่นไว้
        // (คนนอกไม่ต้องถาม policy — ไม่มีบัญชีให้เทียบตั้งแต่แรก จะ strict แค่ไหนก็เทียบไม่ได้)
        // open หลวมกว่า flexible อยู่แล้ว (คนไม่ล็อกอินยังเซ็นได้) → ต้องผ่านด้วย ไม่งั้นคนที่
        // บังเอิญล็อกอินค้างอยู่จะเซ็นไม่ได้ ทั้งที่ล็อกเอาต์แล้วเซ็นได้ = ตรรกะกลับหัว
        if (policy !== 'flexible' && policy !== 'open') {
          return Response.json({ error: 'ลิงก์นี้ไม่ใช่ของคุณ' }, { status: 403 })
        }
      }
    } else {
      if (entry.payer_user_id !== userId) {
        return Response.json({ error: 'ลิงก์นี้ไม่ใช่ของคุณ' }, { status: 403 })
      }
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown'

    await signEntry({
      token,
      signatureBase64,
      userId,
      ip,
      role,
      onBehalf,
      via: viaLink ? 'link' : 'login',
    })

    return Response.json({ success: true })
  } catch (err) {
    if (err.message === 'token invalid') {
      return Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 })
    }
    // เซ็นแล้วล็อก (signEntry) — ใบที่เซ็นผ่านลิงก์แล้ว ต้องให้ผู้ดูแลปลดก่อนถึงเซ็นใหม่ได้
    if (err.message === 'signature locked') {
      return Response.json({ error: 'ใบนี้เซ็นไปแล้ว หากต้องการเซ็นใหม่ กรุณาแจ้งผู้ดูแลให้ปลดล็อกก่อน' }, { status: 409 })
    }
    console.error('[POST /api/docs/sign]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
