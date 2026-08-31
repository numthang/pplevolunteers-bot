import { gateCase } from '@/lib/caseGate.js'
import { updateCaseFields, EDITABLE_CASE_FIELDS, archiveCase, deleteCase } from '@/db/cases.js'
import { deleteCaseFiles } from '@/lib/caseUploads.js'
import { isAdmin } from '@/lib/caseAccess.js'
import { postToThread } from '@/lib/caseDiscord.js'
import { CASE_CATEGORIES } from '@/lib/caseOptions.js'
import { sendSms, normalizePhone, smsConfigured } from '@/lib/sendSms.js'
import { logAction } from '@/db/auditLog.js'

function baseUrl(req) {
  return process.env.NEXTAUTH_URL || new URL(req.url).origin
}

/**
 * PATCH /api/case/[ref] — แก้ข้อมูลเคส
 * body: { title?, detail?, category?, complainant_name?, complainant_phone?, complainant_line_id?, resend_sms? }
 *
 * gate เดียวกับเปลี่ยนสถานะ (manageCases + province scope) ไม่ต้องรับเคสก่อน —
 * คนที่ผ่าน gate เห็น PII เต็มๆ บนหน้า manage อยู่แล้ว การห้ามแก้จึงกันความลับไม่ได้
 * กันได้แค่ integrity ซึ่ง audit log ทำหน้าที่นั้นแทน (เคาะ 2026-07-28)
 */
export async function PATCH(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, orgId, caseRow } = gate

  const body = await req.json().catch(() => ({}))

  // ── เอาออกจากกรุ ──
  // แยก branch ชัดเจน ไม่ปนกับการแก้ field (archived_at ไม่อยู่ใน EDITABLE_CASE_FIELDS โดยตั้งใจ)
  if (body.restore === true) {
    if (!caseRow.archived_at) return Response.json({ error: 'เคสนี้ไม่ได้อยู่ในกรุ' }, { status: 400 })
    await archiveCase(orgId, caseRow.id, false)
    logAction({ orgId, app: 'cases', action: 'case.restored', actorId: session.user.userId, targetId: caseRow.ref })
    return Response.json({ ok: true, restored: true })
  }

  // ย้ายจังหวัดต้องเป็น action แยก — ตอบให้ชัดดีกว่าเงียบๆ ไม่ทำตาม (ดู EDITABLE_CASE_FIELDS)
  if (body.province !== undefined && body.province !== caseRow.province) {
    return Response.json({ error: 'ย้ายจังหวัดของเคสไม่ได้ (รหัสจังหวัดฝังอยู่ในเลขอ้างอิงที่แจ้งผู้ร้องเรียนไปแล้ว)' }, { status: 400 })
  }

  const next = {}
  for (const k of EDITABLE_CASE_FIELDS) {
    if (body[k] === undefined) continue
    next[k] = typeof body[k] === 'string' ? body[k].trim() : body[k]
  }

  // validation — ช่องบังคับต้องไม่ถูกล้างเป็นค่าว่าง
  if ('title' in next && !next.title) return Response.json({ error: 'กรุณาใส่หัวข้อเรื่อง' }, { status: 400 })
  if ('detail' in next && !next.detail) return Response.json({ error: 'กรุณาใส่รายละเอียด' }, { status: 400 })
  if ('complainant_name' in next && !next.complainant_name) return Response.json({ error: 'กรุณาใส่ชื่อผู้ร้องเรียน' }, { status: 400 })

  if ('category' in next && next.category && !CASE_CATEGORIES.includes(next.category)) {
    return Response.json({ error: 'หมวดหมู่ไม่ถูกต้อง' }, { status: 400 })
  }
  if ('category' in next && !next.category) next.category = null
  if ('complainant_line_id' in next && !next.complainant_line_id) next.complainant_line_id = null

  if ('complainant_phone' in next) {
    const phone = normalizePhone(next.complainant_phone)
    if (!phone || phone.length < 9) return Response.json({ error: 'เบอร์โทรไม่ถูกต้อง' }, { status: 400 })
    next.complainant_phone = phone
  }

  // เก็บเฉพาะ field ที่เปลี่ยนจริง — กัน audit log บวมด้วย no-op edit
  const changed = Object.keys(next).filter(k => (next[k] ?? null) !== (caseRow[k] ?? null))

  /**
   * ส่ง SMS ลิงก์ติดตามซ้ำ **แบบคำสั่งเดี่ยว** (ปุ่มในการ์ดผู้ร้องเรียน)
   * ⚠️ ต้องมี branch นี้เพราะหน้าเคสเป็น autosave แล้ว: เบอร์ใหม่ลง DB ไปตั้งแต่ตอนพิมพ์เสร็จ
   *    พอถึงจังหวะที่คนกดส่ง SMS จึงไม่มี `complainant_phone` ใน changed ให้ผูกด้วยอีกแล้ว
   *    (ของเดิมเป็น checkbox ที่ส่งมาพร้อมเบอร์ในคำขอเดียว — ทำแบบนั้นกับ autosave ไม่ได้)
   */
  if (body.resend_sms === true && !changed.length) {
    if (!smsConfigured()) return Response.json({ error: 'ยังไม่ได้ตั้งค่าระบบ SMS' }, { status: 400 })
    try {
      await sendSms({
        msisdn: caseRow.complainant_phone,
        message: `รับเรื่องร้องเรียนของคุณแล้ว รหัส ${caseRow.ref}\nติดตามสถานะ: ${baseUrl(req)}/case/${caseRow.ref}`,
      })
    } catch (e) {
      console.error('[PATCH /api/case] sms resend', e.message)
      return Response.json({ error: 'ส่ง SMS ไม่สำเร็จ' }, { status: 502 })
    }
    logAction({ orgId, app: 'cases', action: 'case.sms_resent', actorId: session.user.userId, targetId: caseRow.ref })
    return Response.json({ ok: true, changed: [], smsSent: true })
  }

  if (!changed.length) return Response.json({ ok: true, changed: [], fields: {} })

  const updated = await updateCaseFields(orgId, caseRow.id, Object.fromEntries(changed.map(k => [k, next[k]])))
  if (!updated) return Response.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 })

  // ⚠️ audit เก็บ **ชื่อ field เท่านั้น ห้ามเก็บค่า** — audit_logs ไม่มี province gate
  //    เก็บเบอร์/ชื่อลงไป = PII รั่วอ้อมกำแพง getCaseByRefPublic/Full ที่ตั้งใจแยกไว้
  logAction({
    orgId, app: 'cases', action: 'case.edited',
    actorId: session.user.userId, targetId: caseRow.ref,
    meta: { fields: changed },
  })

  // หัวข้อเปลี่ยน → ชื่อ thread ใน Discord จะค้างของเก่า อย่างน้อยต้องแจ้งในเธรด
  if (caseRow.discord_thread_id && changed.includes('title')) {
    await postToThread(caseRow.discord_thread_id, `✏️ แก้หัวข้อเคส **${caseRow.ref}** → **${updated.title}**`)
      .catch(e => console.error('[PATCH /api/case] postToThread', e.message))
  }

  // เบอร์เปลี่ยน = คนที่ถูกต้องยังไม่เคยได้ลิงก์ติดตาม (SMS เดิมไปเบอร์เก่า) → ส่งซ้ำถ้าสั่ง
  let smsSent = false
  if (body.resend_sms && changed.includes('complainant_phone') && smsConfigured()) {
    try {
      await sendSms({
        msisdn: updated.complainant_phone,
        message: `รับเรื่องร้องเรียนของคุณแล้ว รหัส ${updated.ref}\nติดตามสถานะ: ${baseUrl(req)}/case/${updated.ref}`,
      })
      smsSent = true
    } catch (e) {
      console.error('[PATCH /api/case] sms', e.message)
    }
  }

  // คืนค่าหลังบันทึกของ field ที่เปลี่ยน — ฝั่งหน้าเคสเป็น autosave ต้องเอาไป sync กลับเข้ากล่อง
  // (เบอร์โทรผ่าน normalizePhone แล้ว ค่าที่คนพิมพ์กับค่าที่อยู่ใน DB ไม่เหมือนกัน)
  // ⚠️ เฉพาะ field ที่เพิ่งส่งมาเท่านั้น ห้ามคืนทั้งแถว — กัน PII ที่ผู้เรียกไม่ได้ขอไหลออกเพิ่ม
  const fields = Object.fromEntries(changed.map(k => [k, updated[k]]))

  return Response.json({ ok: true, changed, fields, smsSent })
}


/**
 * DELETE /api/case/[ref]           → เก็บเข้ากรุ (ย้อนได้ด้วย PATCH { restore: true })
 * DELETE /api/case/[ref]?purge=1   → **ลบถาวร** — แอดมินเท่านั้น · ย้อนไม่ได้
 *
 * ⚠️ ค่าตั้งต้นคือ "เก็บเข้ากรุ" เสมอ ห้ามสลับ (บทเรียนจาก kanban commit 37dd5e6:
 *    ปุ่มเขียนว่าเก็บเข้ากรุ แต่ทำงานเป็นลบถาวร = โกหกผู้ใช้)
 *
 * ⭐ ลบถาวรแล้ว **ไม่แตะเธรด Discord** (user เคาะ 2026-08-31) — แค่โพสต์บอกในเธรดว่าปิดได้แล้ว
 *    บอทไม่ต้องมีสิทธิ์ Manage Threads · แต่แปลว่าข้อความในเธรดยังอยู่ = ลบไม่สะอาด 100%
 */
export async function DELETE(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, access, orgId, caseRow } = gate

  const purge = new URL(req.url).searchParams.get('purge') === '1'

  if (!purge) {
    if (caseRow.archived_at) return Response.json({ error: 'เคสนี้อยู่ในกรุอยู่แล้ว' }, { status: 400 })
    await archiveCase(orgId, caseRow.id, true)
    logAction({ orgId, app: 'cases', action: 'case.archived', actorId: session.user.userId, targetId: caseRow.ref })
    return Response.json({ ok: true, archived: true })
  }

  if (!isAdmin(access)) return Response.json({ error: 'ลบถาวรได้เฉพาะแอดมิน' }, { status: 403 })

  // audit **ก่อน**ลบ — ลบแล้วไม่เหลือข้อมูลให้บันทึกว่าลบอะไรไป
  logAction({
    orgId, app: 'cases', action: 'case.purged', actorId: session.user.userId, targetId: caseRow.ref,
    meta: { province: caseRow.province, status: caseRow.status, title: caseRow.title },
  })

  const { ok, files } = await deleteCase(orgId, caseRow.id)
  if (!ok) return Response.json({ error: 'ไม่พบเคสนี้' }, { status: 404 })
  await deleteCaseFiles(files)

  if (caseRow.discord_thread_id) {
    await postToThread(
      caseRow.discord_thread_id,
      `🗑️ เคส **${caseRow.ref}** ถูกลบออกจากระบบแล้ว — ปิดเธรดนี้ได้เลย`,
    ).catch(() => {})
  }

  return Response.json({ ok: true, purged: true, filesDeleted: files.length })
}
