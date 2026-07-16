import { getEntryByToken } from '@/db/docs/entries.js'

/**
 * GET /api/docs/sign/verify?token=
 * Load entry info for the signing page (no ownership check — just checks expiry)
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) {
    return Response.json({ error: 'token required' }, { status: 400 })
  }

  try {
    const entry = await getEntryByToken(token)

    if (!entry) {
      return Response.json({ error: 'ลิงก์ไม่ถูกต้อง' }, { status: 404 })
    }

    if (entry.signer_token_expires_at && new Date(entry.signer_token_expires_at) < new Date()) {
      return Response.json({ error: 'ลิงก์หมดอายุแล้ว' }, { status: 410 })
    }

    const role = entry.signer_role  // 'recipient' | 'payer'

    return Response.json({
      success: true,
      data: {
        id:               entry.id,
        status:           entry.status,
        item_type:        entry.item_type,
        description:      entry.description,
        amount:           entry.amount,
        event_name:       entry.event_name,
        event_date:       entry.event_date,
        event_end_date:   entry.event_end_date,
        display_name:     entry.display_name,
        ngs_first_name:   entry.ngs_first_name ?? null,
        ngs_last_name:    entry.ngs_last_name ?? null,
        member_discord_id: entry.member_discord_id,
        token_expires_at: entry.signer_token_expires_at,
        signer_role:      role,
        // recipient-only fields
        has_ngs_link:     role === 'recipient' ? !!entry.member_id : null,
        // self-fill ครบ (ชื่อใน users + เลขบัตรใน override_data) = ยืนยันตัวตนแบบกรอกเองแล้ว
        has_self_info:    role === 'recipient' ? !!(entry.firstname && entry.lastname && entry.override_data?.id_number) : null,
        has_id_card:      role === 'recipient' ? !!entry.has_id_card : null,
        // payer status
        payer_signed_at:  entry.payer_signed_at ?? null,
      },
    })
  } catch (err) {
    console.error('[GET /api/docs/sign/verify]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
