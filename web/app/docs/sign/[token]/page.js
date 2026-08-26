'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CheckCircle, AlertTriangle, Pen, UserCheck, IdCard, FileText, RefreshCw, CreditCard } from 'lucide-react'
import IdCardCropper from '@/components/docs/IdCardCropper'
import RecipientInfoModal from '@/components/docs/RecipientInfoModal'

const ITEM_LABEL_KEYS = ['food', 'speaker', 'travel', 'venue', 'accommodation', 'supplies', 'equipment', 'photo']

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
function formatDate(dateStr) {
  if (!dateStr) return ''
  const [datePart, timePart] = dateStr.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  let r = `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`
  if (timePart && timePart !== '00:00') r += ` ${timePart} น.`
  return r
}

export default function SignPage({ params }) {
  const t = useTranslations('docs')
  const { token } = use(params)
  const { data: session, status } = useSession()

  const [entry, setEntry]         = useState(null)
  const [signerRole, setSignerRole] = useState('recipient')  // 'recipient' | 'payer'
  const [loadErr, setLoadErr]     = useState('')
  const [loading, setLoading]     = useState(true)

  // ผู้รับผูกทะเบียนสมาชิกไว้แล้วไหม — ถ้าผูก ข้อมูลบนใบมาจาก roster ไม่ต้องกรอกอะไรเลย
  // (จอ "ค้นหาชื่อในทะเบียน" ถูกถอดออก 2026-08-26 — ถ่ายบัตรให้ AI อ่านแทนการค้น+พิมพ์)
  const [ngsLinked, setNgsLinked]     = useState(false)

  // self-fill state — ผู้รับที่ไม่มีใน roster กรอกข้อมูลเอง (recipient only)
  const [selfMode, setSelfMode]         = useState(false)
  const [selfInfoDone, setSelfInfoDone] = useState(false)
  const [signPolicy, setSignPolicy]     = useState('strict')
  const [canManage, setCanManage]       = useState(false)
  const [recipientComplete, setRecipientComplete] = useState(true)
  const [infoModal, setInfoModal]       = useState(false)
  const [selfSaving, setSelfSaving]     = useState(false)
  const [selfErr, setSelfErr]           = useState('')
  const [selfForm, setSelfForm]         = useState({
    firstName: '', lastName: '', idNumber: '', phone: '',
    houseNo: '', moo: '', road: '', subdistrict: '', district: '', provinceAddr: '',
  })
  // ถ่ายบัตรครั้งเดียวได้ 2 อย่าง: AI อ่านเติมฟอร์ม + เก็บ blob ไว้แนบเป็นสำเนาบัตรตอนกดบันทึก
  const [ocrBusy, setOcrBusy]   = useState(false)
  const [ocrErr, setOcrErr]     = useState('')
  const [ocrDone, setOcrDone]   = useState(false)
  const [idWarn, setIdWarn]     = useState(false)   // อ่านเลขบัตรได้แต่ checksum ไม่ผ่าน
  const [formCardBlob, setFormCardBlob] = useState(null)
  const [cropTarget, setCropTarget]     = useState('card')  // 'card' = อัปอย่างเดียว | 'form' = อ่านเข้าฟอร์มด้วย

  // id-card upload state (recipient only)
  const [hasIdCard, setHasIdCard]               = useState(false)
  const [idCardPreviewUrl, setIdCardPreviewUrl] = useState(null)
  const [uploading, setUploading]               = useState(false)
  const [idCardErr, setIdCardErr]               = useState('')
  const [cropSrc, setCropSrc]                   = useState(null)  // dataURL ที่กำลังครอบ
  const fileRef = useRef(null)

  // document preview
  const [previewVer, setPreviewVer]         = useState(0)
  const [previewPages, setPreviewPages]     = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewErr, setPreviewErr]         = useState('')

  const canvasRef = useRef(null)
  const drawing   = useRef(false)
  const lastPos   = useRef(null)
  const [hasDrawn, setHasDrawn]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    // cache: 'no-store' — เบราว์เซอร์ที่เคยโดน 410 ตอนลิงก์ยังมีวันหมดอายุ จะกินของเก่าจากแคช
    // ต่อให้ server แก้แล้ว (เจอจริง 2026-08-26) · header ฝั่ง server กันของใหม่ อันนี้กันของเก่าที่ค้างอยู่
    fetch(`/api/docs/sign/verify?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d.success) setLoadErr(d.error || t('sign.invalidLink'))
        else {
          setEntry(d.data)
          const role = d.data.signer_role || 'recipient'
          setSignerRole(role)
          setSignPolicy(d.data.sign_policy || 'strict')
          setCanManage(!!d.data.can_manage)
          setRecipientComplete(d.data.recipient_complete !== false)

          if (role === 'recipient') {
            setNgsLinked(!!d.data.has_ngs_link)
            setSelfInfoDone(!!d.data.has_self_info)
            setHasIdCard(!!d.data.has_id_card)
            if (d.data.has_id_card && d.data.external_payee_id) {
              setIdCardPreviewUrl(`/api/docs/external-payees/${d.data.external_payee_id}/id-card?token=${encodeURIComponent(token)}`)
            } else if (d.data.has_id_card && d.data.member_user_id) {
              setIdCardPreviewUrl(`/api/docs/id-card/${d.data.member_user_id}?token=${encodeURIComponent(token)}`)
            }
          }
        }
      })
      .catch(() => setLoadErr(t('projectView.clearAll.genericError')))
      .finally(() => setLoading(false))
  }, [token, status])

  // ชื่อบนใบ (ผู้รับเงิน) — ใช้ทั้งป้ายเตือนและข้อความยืนยัน
  const recipientName = [entry?.title, entry?.ngs_first_name ?? entry?.firstname, entry?.ngs_last_name ?? entry?.lastname]
    .filter(Boolean).join(' ').trim() || entry?.display_name || ''
  // คนนอกไม่มีบัญชี → เซ็นแทนเสมอ · สมาชิกจะเข้าเงื่อนไขนี้ได้เฉพาะตอน org เปิดโหมดยืดหยุ่น
  const isSigningForSomeoneElse = !!entry && (
    entry.external_payee_id ? true : (!!session?.user?.userId && session.user.userId !== entry.member_user_id)
  )
  // เซ็นแทนได้จริงไหม — ต้องตรงกับกฎฝั่ง API ไม่งั้นหน้าโชว์ช่องวาดแล้วไปโดน 403 ตอนกดส่ง
  const canSignOnBehalf = isSigningForSomeoneElse &&
    (!!entry?.external_payee_id || signPolicy === 'flexible')
  // ขั้นยืนยันตัวตน (ผูกทะเบียนสมาชิก / กรอกเอง) เป็นเรื่องของ "เจ้าของใบ" เท่านั้น
  // คนเซ็นแทนกรอกให้ไม่ได้ — link-ngs/self-info เขียนลงบัญชีของคนที่ล็อกอิน ไม่ใช่ของผู้รับ
  // → ข้ามไปช่องวาดเลย ข้อมูลบนใบมาจากที่แอดมินกรอกไว้ใน entry อยู่แล้ว
  const skipIdentitySteps = canSignOnBehalf
  // ผู้ดูแลเซ็นแทนสมาชิกที่ยังไม่มีข้อมูลบนใบ → ต้องกรอกให้ครบก่อน
  // (ใบที่เซ็นแล้วแต่ไม่มีชื่อ/ที่อยู่/เลขบัตร แย่กว่าใบที่ยังไม่เซ็น — เบิกไม่ผ่านเหมือนกัน
  //  แต่มีลายเซ็นคนจริงติดอยู่แล้ว)
  const needsRecipientInfo = canSignOnBehalf && !entry?.external_payee_id && !recipientComplete
  // เจ้าของใบเปิดเอง (สมาชิก) — บัตรลงบัญชีตัวเองผ่าน /api/docs/id-card ตามเดิม
  const isRecipientSelf = !!entry && !entry.external_payee_id &&
    !!session?.user?.userId && session.user.userId === entry.member_user_id
  // ผู้ดูแลจัดการสำเนาบัตรแทนสมาชิกได้ — กฎเดียวกับ gate() ของ POST /api/docs/entries/:id/id-card
  // (canManageDocs + อยู่ในเขตของงาน + org โหมดยืดหยุ่น) · **ห้ามผูกกับ canSignOnBehalf เฉยๆ**
  // เพราะโหมดยืดหยุ่นสมาชิกคนไหนเปิดลิงก์ก็เซ็นแทนได้ แต่ห้ามเห็นบัตร ปชช. คนอื่น (PDPA)
  const canManageIdCard = !!entry && !entry.external_payee_id && !isRecipientSelf &&
    canManage && signPolicy === 'flexible'
  // ⭐ สวิตช์เดียวที่ตัดสินว่าหน้านี้ "ทำอะไรได้ไหม" — หน้าเดียว การ์ดชุดเดียวทั้ง strict/flexible
  // ต่างกันแค่ตัวนี้ (เคาะ 2026-08-26): strict + ไม่ใช่เจ้าตัว = ซ่อนทุกการ์ดที่ลงมือได้
  // เหลือแค่รายละเอียดใบ + ป้ายบอกว่าใบนี้ออกให้ใคร
  // เดิมซ่อนแค่บางอัน ช่องวาดลายเซ็นยังโผล่ให้วาดจนเสร็จแล้วค่อยเด้ง 403 ตอนกดส่ง
  const canInteract = signerRole !== 'recipient' || isRecipientSelf || canSignOnBehalf

  useEffect(() => {
    if (entry?.event_name) document.title = `${entry.event_name} — Docs`
  }, [entry])

  useEffect(() => {
    const ready = signerRole === 'payer' || canSignOnBehalf || ngsLinked || selfInfoDone
    if (!ready || !entry) return
    setPreviewLoading(true)
    setPreviewErr('')
    fetch(`/api/docs/sign/preview-img?token=${encodeURIComponent(token)}&v=${previewVer}`)
      .then(r => r.json())
      .then(d => { if (d.pages) setPreviewPages(d.pages); else setPreviewErr(d.error || t('settings.loadFailed')) })
      .catch(() => setPreviewErr(t('settings.loadFailed')))
      .finally(() => setPreviewLoading(false))
  }, [signerRole, canSignOnBehalf, ngsLinked, selfInfoDone, entry, token, previewVer])

  useEffect(() => {
    if (!entry || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#1a3a8f'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [entry, ngsLinked, selfInfoDone, signerRole])

  // Auto-apply: คนที่เคย self-fill ครบแล้ว (ชื่อ+เลขบัตร+ที่อยู่) เปิดบิลใหม่ → เติมให้เองข้ามฟอร์ม
  // การตรวจจริงอยู่ที่ preview ก่อนเซ็น + มีปุ่ม "แก้ไขข้อมูล" ถ้าข้อมูลเปลี่ยน
  useEffect(() => {
    if (!entry || signerRole !== 'recipient' || ngsLinked || selfInfoDone) return
    if (entry.external_payee_id) return   // คนนอก: ข้อมูลครบในแถวของเขาแล้ว ไม่มีบัญชีให้ self-fill
    if (status !== 'authenticated' || session?.user?.userId !== entry.member_user_id) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/docs/sign/self-info?token=${encodeURIComponent(token)}`)
        const d = await res.json()
        const p = d?.data
        if (!res.ok || !p) return
        const idDigits = String(p.idNumber || '').replace(/\D/g, '')
        if (!p.firstName?.trim() || !p.lastName?.trim() || idDigits.length !== 13) return
        const save = await fetch('/api/docs/sign/self-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ...p, idNumber: idDigits }),
        })
        if (save.ok && !cancelled) {
          setSelfForm(p)
          setSelfInfoDone(true)
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [entry, signerRole, ngsLinked, selfInfoDone, status, session, token])

  // เปิดโหมดกรอกเอง + โหลด prefill (เคยกรอกครั้งก่อน/ค่าที่มีอยู่)
  async function openSelfMode() {
    setSelfMode(true)
    setSelfErr('')
    try {
      const res = await fetch(`/api/docs/sign/self-info?token=${encodeURIComponent(token)}`)
      const d = await res.json()
      if (res.ok && d.data) setSelfForm(d.data)
    } catch {}
  }

  async function saveSelfInfo() {
    const idDigits = selfForm.idNumber.replace(/\D/g, '')
    if (!selfForm.firstName.trim() || !selfForm.lastName.trim()) { setSelfErr(t('sign.nameRequired')); return }
    if (idDigits.length !== 13) { setSelfErr(t('sign.idNumberRequired')); return }
    setSelfErr('')
    setSelfSaving(true)
    try {
      const res = await fetch('/api/docs/sign/self-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...selfForm, idNumber: idDigits }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      // ถ่ายบัตรมาแล้วก็แนบให้เลยในจังหวะเดียว — ผู้ใช้ถ่ายรูปเดียวได้ทั้งกรอกฟอร์มและสำเนาบัตร
      // (ล้มก็ไม่ rollback ข้อมูล — ข้อมูลบนใบสำคัญกว่า และยังแนบใหม่ได้จากการ์ดสำเนาบัตร)
      if (formCardBlob) {
        try { await uploadIdCard(formCardBlob) } catch {}
        setFormCardBlob(null)
      }
      setSelfInfoDone(true)
      setSelfMode(false)
      setPreviewVer(v => v + 1) // ข้อมูลบนเอกสารเปลี่ยน → gen preview ใหม่
    } catch (err) {
      setSelfErr(err.message)
    } finally {
      setSelfSaving(false)
    }
  }

  // เลือกไฟล์ → เปิด cropper (ยังไม่อัปโหลด) · cropTarget บอกว่าครอบเสร็จแล้วจะเอาไปทำอะไร
  function onIdCardFile(file) {
    if (!file) return
    setIdCardErr('')
    setOcrErr('')
    if (file.size > 8 * 1024 * 1024) { setIdCardErr(t('sign.fileTooLarge')); return }
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result)
    reader.readAsDataURL(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ครอบเสร็จ → แยกทางตามที่กดมา: จากฟอร์ม = ให้ AI อ่าน · จากการ์ดสำเนาบัตร = อัปเลย
  function onCropped(blob) {
    setCropSrc(null)
    if (cropTarget === 'form') readIdCard(blob)
    else uploadIdCard(blob)
  }

  // ให้ AI อ่านบัตร → เติมฟอร์มให้ครบ (ผู้ใช้ไม่ต้องพิมพ์อะไรเลย แค่ตรวจ)
  // เก็บ blob ไว้ก่อน ยังไม่อัป — กฎ Create ของโปรเจกต์: เขียนตอนกด "บันทึก" เท่านั้น
  async function readIdCard(blob) {
    setOcrBusy(true)
    setOcrErr('')
    setIdWarn(false)
    try {
      const fd = new FormData()
      fd.append('file', blob, 'idcard.jpg')
      fd.append('token', token)
      const res = await fetch('/api/docs/id-card/ocr', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('externalPayee.readFailed'))
      const c = d.data || {}
      setSelfForm(f => ({
        ...f,
        firstName:    c.first_name  || f.firstName,
        lastName:     c.last_name   || f.lastName,
        idNumber:     c.id_number   || f.idNumber,
        houseNo:      c.house_no    || f.houseNo,
        moo:          c.moo         || f.moo,
        road:         c.road        || f.road,
        subdistrict:  c.subdistrict || f.subdistrict,
        district:     c.district    || f.district,
        provinceAddr: c.province    || f.provinceAddr,
      }))
      setIdWarn(!!c.id_number && !d.idValid)
      setFormCardBlob(blob)
      setOcrDone(true)
    } catch (err) {
      setOcrErr(err.message)
    } finally {
      setOcrBusy(false)
    }
  }

  // ได้ภาพที่ครอบแล้ว (สัดส่วนบัตรจริง) → อัปโหลด
  async function uploadIdCard(blob) {
    setCropSrc(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', blob, 'idcard.jpg')
      fd.append('token', token)
      // คนนอกไม่มี users row — บัตรเก็บในแถวของเขาเอง (ยิงเข้า /api/docs/id-card จะไปทับบัตร
      // ของ "คนที่ล็อกอินอยู่" คือแอดมินที่ถือเครื่อง ไม่ใช่ของผู้รับเงิน)
      // ผู้ดูแลแนบแทนสมาชิก → ต้องยิงเส้น entries/:id/id-card ที่เขียนลงบัญชี "ผู้รับ"
      // (/api/docs/id-card เขียนลงบัญชีคนที่ล็อกอินเสมอ = ทับบัตรแอดมินเอง)
      const url = entry?.external_payee_id
        ? `/api/docs/external-payees/${entry.external_payee_id}/id-card?token=${encodeURIComponent(token)}`
        : canManageIdCard
          ? `/api/docs/entries/${entry.id}/id-card`
          : '/api/docs/id-card'
      let res = await fetch(url, { method: 'POST', body: fd })
      let data = await res.json()
      // บัตรใช้ร่วมทุกใบของคนนั้น — มีอยู่แล้วต้องยืนยันก่อนทับ ไม่ทับเงียบๆ
      if (res.status === 409 && data.code === 'exists') {
        if (!confirm(t('recipientInfo.confirmOverwriteCard'))) return
        const fd2 = new FormData()
        fd2.append('file', blob, 'idcard.jpg')
        fd2.append('token', token)
        res  = await fetch(`${url}?overwrite=1`, { method: 'POST', body: fd2 })
        data = await res.json()
      }
      if (!res.ok) throw new Error(data.error || t('sign.idCardUploadFailed'))
      setHasIdCard(true)
      setIdCardPreviewUrl(URL.createObjectURL(blob))
    } catch (err) {
      setIdCardErr(err.message)
    } finally {
      setUploading(false)
    }
  }

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function onStart(e) { e.preventDefault(); drawing.current = true; lastPos.current = getPos(e, canvasRef.current); setHasDrawn(true) }
  function onMove(e) {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke()
    lastPos.current = pos
  }
  function onEnd(e) { e.preventDefault(); drawing.current = false }

  function clearCanvas() {
    canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setHasDrawn(false)
  }

  async function handleSubmit() {
    if (!hasDrawn) return
    const signatureBase64 = canvasRef.current.toDataURL('image/png')
    setSubmitting(true)
    try {
      const res = await fetch('/api/docs/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signatureBase64 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setDone(true)
      clearCanvas()
      setPreviewVer(v => v + 1)   // โหลด preview ใหม่ (เผื่อ render มีลายเซ็น)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      alert(t('entryList.errorPrefix', { message: err.message }))
    } finally {
      setSubmitting(false)
    }
  }

  // ── States ────────────────────────────────────────────────────────────

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-disc-bg2">
        <p className="text-warm-500 dark:text-disc-muted">{t('pending.loading')}</p>
      </div>
    )
  }

  if (loadErr) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-disc-bg2 p-4">
        <div className="max-w-sm w-full bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl p-8 text-center">
          <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
          <h1 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-2">{t('sign.invalidLink')}</h1>
          <p className="text-warm-500 dark:text-disc-muted text-base">{loadErr}</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-disc-bg2 p-4">
        <div className="max-w-sm w-full bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl p-8 text-center">
          <Pen size={48} className="mx-auto text-orange mb-4" />
          <h1 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-3">
            {signerRole === 'payer' ? t('sign.signPayerTitle') : t('sign.signReceiptTitle')}
          </h1>
          <p className="text-warm-500 dark:text-disc-muted text-base mb-6">
            {t('sign.loginPrompt')}
          </p>
          <button
            onClick={() => signIn('discord', { callbackUrl: `/docs/sign/${token}` })}
            className="w-full bg-[#5865F2] text-white py-3 rounded-lg text-base font-semibold hover:bg-[#4752C4] transition"
          >
            {t('sign.loginButton')}
          </button>
        </div>
      </div>
    )
  }

  // เซ็นไปแล้วหรือยัง (แยกตาม role) — ไม่ dead-end แล้ว แค่โชว์ banner + เซ็นใหม่ทับได้เสมอ
  const isSigned = done || (entry && (
    signerRole === 'payer' ? !!entry.payer_signed_at : entry.status !== 'pending'
  ))

  // Payer มีสิทธิ์เซ็นได้ทันที (ไม่ต้องผ่าน NGS/บัตร)
  // canInteract นำหน้าทุกอย่าง — strict + ไม่ใช่เจ้าตัว ห้ามมีแม้แต่ช่องให้วาด
  const canSign = canInteract &&
    (signerRole === 'payer' || canSignOnBehalf || ngsLinked || selfInfoDone) && !needsRecipientInfo

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-disc-bg2 py-4 sm:px-4">
      {cropSrc && (
        <IdCardCropper src={cropSrc} onCancel={() => setCropSrc(null)} onCropped={onCropped} />
      )}
      {infoModal && entry && (
        <RecipientInfoModal
          entryId={entry.id}
          token={token}
          hasIdCard={hasIdCard}
          initial={{
            title:      entry.title || '',
            first_name: entry.ngs_first_name ?? entry.firstname ?? '',
            last_name:  entry.ngs_last_name  ?? entry.lastname  ?? '',
          }}
          onClose={() => setInfoModal(false)}
          onSaved={() => {
            setInfoModal(false)
            setPreviewVer(v => v + 1)   // ข้อมูลบนใบเปลี่ยน → gen preview ใหม่
            // ดึง entry ใหม่แทนที่จะเดาสถานะเอง — recipient_complete คำนวณฝั่ง server
            fetch(`/api/docs/sign/verify?token=${encodeURIComponent(token)}`)
              .then(r => r.json())
              .then(d => {
                if (!d.success) return
                setEntry(d.data)
                setRecipientComplete(d.data.recipient_complete !== false)
                setHasIdCard(!!d.data.has_id_card)
                if (d.data.has_id_card && d.data.member_user_id) {
                  setIdCardPreviewUrl(`/api/docs/id-card/${d.data.member_user_id}?token=${encodeURIComponent(token)}`)
                }
              })
              .catch(() => {})
          }}
        />
      )}
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Banner: เซ็นแล้ว (ยังเซ็นใหม่ทับได้) */}
        {isSigned && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/40 rounded-xl p-4 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold">
              <CheckCircle size={18} className="shrink-0" /> {t('sign.signedBanner')}
              <span className="font-normal text-sm text-green-600/80 dark:text-green-400/70">{t('sign.signedBannerNote')}</span>
            </span>
            <a
              href={`/api/docs/sign/pdf?token=${encodeURIComponent(token)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-orange hover:underline shrink-0"
            >
              {t('sign.downloadPdf')}
            </a>
          </div>
        )}

        {/* Entry details */}
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
          {signerRole === 'payer' && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/40">
              <CreditCard size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">{t('sign.signingAsPayer')}</span>
            </div>
          )}
          <h1 className="text-lg font-bold text-warm-900 dark:text-disc-text mb-1">{t('projectView.header.receiptButton')}</h1>
          {entry && (
            <>
              <p className="text-base font-medium text-warm-900 dark:text-disc-text">{entry.event_name}</p>
              <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">
                {formatDate(entry.event_date)}
                {entry.event_end_date ? ` – ${formatDate(entry.event_end_date)}` : ''}
              </p>
              <div className="border-t border-warm-100 dark:border-disc-border pt-3 space-y-1.5">
                <div className="flex justify-between text-base">
                  <span className="text-warm-600 dark:text-disc-muted">
                    {ITEM_LABEL_KEYS.includes(entry.item_type) ? t(`entryList.itemLabels.${entry.item_type}`) : entry.item_type}
                  </span>
                  <span className="font-semibold text-warm-900 dark:text-disc-text">{Number(entry.amount).toLocaleString()} {t('autoCalc.currencyUnit')}</span>
                </div>
                {entry.description && (
                  <p className="text-sm text-warm-500 dark:text-disc-muted">{entry.description}</p>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-warm-100 dark:border-disc-border text-sm text-warm-500 dark:text-disc-muted">
                {t('sign.recipientLabel')} <span className="font-medium text-warm-900 dark:text-disc-text">
                  {entry.ngs_first_name && entry.ngs_last_name
                    ? `${entry.ngs_first_name} ${entry.ngs_last_name} (@${entry.display_name})`
                    : entry.display_name}
                </span>
              </div>
            </>
          )}
        </div>

        {needsRecipientInfo && canInteract && (
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={18} className="text-amber-500 shrink-0" />
              <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('recipientInfo.missingTitle')}</h2>
            </div>
            <p className="text-sm text-warm-500 dark:text-disc-muted">{t('recipientInfo.missingHint')}</p>
            <button type="button" onClick={() => setInfoModal(true)}
              className="mt-3 px-4 py-2 text-base rounded-lg bg-orange text-white hover:bg-orange-light transition">
              {t('recipientInfo.fillButton')}
            </button>
          </div>
        )}

        {signerRole === 'recipient' && isSigningForSomeoneElse && !canSignOnBehalf && (
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6 text-center">
            <AlertTriangle size={32} className="mx-auto text-amber-500 mb-3" />
            <p className="text-base text-warm-900 dark:text-disc-text">{t('sign.notYourLink.title')}</p>
            {recipientName && (
              <p className="mt-1 text-base font-semibold text-warm-900 dark:text-disc-text">
                {t('sign.notYourLink.issuedTo', { name: recipientName })}
              </p>
            )}
            {/* บอกชื่อบนใบเสมอ — คนที่มี 2 บัญชี (Discord/อีเมล) แล้วล็อกอินผิดร่างจะเจอจอนี้
                ทั้งที่ใบเป็นของเขาจริง ถ้าไม่บอกชื่อเขาจะไม่มีทางรู้ว่าต้องสลับบัญชี */}
            <p className="mt-2 text-sm text-warm-500 dark:text-disc-muted">{t('sign.notYourLink.hint')}</p>
          </div>
        )}

        {/* Step: ข้อมูลผู้รับเงิน (recipient เท่านั้น ถ้ายังไม่ผูกทะเบียน/ยังไม่เคยกรอก)
            ถ่ายบัตรครั้งเดียว → AI อ่านเติมช่องให้ทั้งหมด → ตรวจแล้วกดบันทึก
            (เดิมต้องค้นชื่อในทะเบียนหรือพิมพ์เลขบัตร 13 หลักเอง — ถอดออก 2026-08-26) */}
        {signerRole === 'recipient' && canInteract && !skipIdentitySteps && !ngsLinked && (!selfInfoDone || selfMode) && (
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck size={18} className="text-orange shrink-0" />
              <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('sign.confirmIdentityTitle')}</h2>
            </div>
            <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">
              {t('sign.selfFillIntro')}
            </p>

            <button
              type="button"
              onClick={() => { setCropTarget('form'); setOcrErr(''); fileRef.current?.click() }}
              disabled={ocrBusy || selfSaving}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-warm-300 dark:border-disc-border rounded-lg py-3 text-base text-warm-600 dark:text-disc-muted hover:border-orange hover:text-orange disabled:opacity-50 transition"
            >
              <CreditCard size={18} />
              {ocrBusy ? t('sign.ocr.reading') : ocrDone ? t('sign.ocr.retake') : t('sign.ocr.button')}
            </button>
            <p className="text-sm text-warm-400 dark:text-disc-muted mt-2">{t('sign.ocr.hint')}</p>
            {ocrErr  && <p className="text-sm text-red-500 dark:text-red-400 mt-2">{ocrErr}</p>}
            {idWarn  && <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">{t('sign.ocr.idWarn')}</p>}

            <div className="grid grid-cols-2 gap-2 mt-4">
              {['firstName', 'lastName'].map(key => (
                <div key={key}>
                  <label className="block text-sm text-warm-700 dark:text-disc-text mb-1">{t(`sign.selfForm.fields.${key}`)}</label>
                  <input
                    type="text"
                    value={selfForm[key]}
                    onChange={e => setSelfForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text px-3 py-2.5 text-base rounded-lg focus:outline-none focus:ring-2 focus:ring-orange"
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-sm text-warm-700 dark:text-disc-text mb-1">{t('sign.selfForm.fields.idNumber')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={17}
                  value={selfForm.idNumber}
                  onChange={e => setSelfForm(f => ({ ...f, idNumber: e.target.value }))}
                  className="w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text px-3 py-2.5 text-base rounded-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-orange"
                />
              </div>
              {['houseNo', 'moo', 'road', 'subdistrict', 'district', 'provinceAddr'].map(key => (
                <div key={key}>
                  <label className="block text-sm text-warm-700 dark:text-disc-text mb-1">{t(`sign.selfForm.fields.${key}`)}</label>
                  <input
                    type="text"
                    value={selfForm[key]}
                    onChange={e => setSelfForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text px-3 py-2.5 text-base rounded-lg focus:outline-none focus:ring-2 focus:ring-orange"
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-sm text-warm-700 dark:text-disc-text mb-1">{t('sign.selfForm.fields.phone')}</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={15}
                  value={selfForm.phone}
                  onChange={e => setSelfForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text px-3 py-2.5 text-base rounded-lg focus:outline-none focus:ring-2 focus:ring-orange"
                />
              </div>
            </div>
            {selfErr && <p className="text-sm text-red-500 dark:text-red-400 mt-2">{selfErr}</p>}
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={saveSelfInfo}
                disabled={selfSaving || ocrBusy}
                className="flex-1 bg-orange text-white py-2.5 rounded-lg text-base font-semibold hover:bg-orange-light disabled:opacity-50 transition"
              >
                {selfSaving ? t('sign.selfForm.saving') : t('sign.selfForm.saveButton')}
              </button>
              {selfInfoDone && (
                <button
                  type="button"
                  onClick={() => { setSelfMode(false); setSelfErr('') }}
                  disabled={selfSaving}
                  className="px-4 py-2.5 text-base text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text transition"
                >
                  {t('sign.selfForm.cancel')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Self-fill สำเร็จ (auto หรือกรอกเอง) — แสดงสถานะ + ปุ่มแก้ไข */}
        {signerRole === 'recipient' && canInteract && !skipIdentitySteps && !ngsLinked && selfInfoDone && !selfMode && (
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <UserCheck size={18} className="text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-sm text-warm-700 dark:text-disc-text truncate">
                {t('sign.selfInfoSaved')}
              </p>
            </div>
            <button
              type="button"
              onClick={openSelfMode}
              className="shrink-0 text-sm text-warm-500 dark:text-disc-muted hover:text-orange underline underline-offset-2 transition"
            >
              {t('sign.editInfo')}
            </button>
          </div>
        )}

        {/* Step: ID-card upload — เจ้าของเอกสาร, ใบคนนอก, หรือผู้ดูแลในโหมดยืดหยุ่น
            (ผู้ดูแลไม่ต้องผ่านขั้นผูกทะเบียน/กรอกเอง — เขากรอกให้ในใบอยู่แล้ว) */}
        {signerRole === 'recipient' && canInteract &&
          (canManageIdCard || ((ngsLinked || selfInfoDone) &&
            (entry?.external_payee_id ? true : isRecipientSelf))) && (
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <IdCard size={18} className="text-orange shrink-0" />
              <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('sign.idCard.title')} <span className="text-sm font-normal text-warm-400 dark:text-disc-muted">{t('sign.idCard.hint')}</span></h2>
            </div>
            {hasIdCard ? (
              <div className="mt-2">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="flex items-center gap-1.5 text-base text-green-600 dark:text-green-400">
                    <CheckCircle size={16} /> {t('sign.idCard.attached')}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setCropTarget('card'); fileRef.current?.click() }}
                    disabled={uploading}
                    className="text-sm text-warm-400 dark:text-disc-muted hover:text-orange transition"
                  >
                    {t('sign.idCard.changeImage')}
                  </button>
                </div>
                {idCardPreviewUrl && (
                  <img
                    src={idCardPreviewUrl}
                    alt={t('sign.idCard.alt')}
                    className="w-full max-h-52 object-contain rounded-lg border border-warm-200 dark:border-disc-border bg-warm-50 dark:bg-disc-hover"
                  />
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">
                  {t('sign.idCard.uploadIntro')}
                </p>
                <button
                  type="button"
                  onClick={() => { setCropTarget('card'); fileRef.current?.click() }}
                  disabled={uploading}
                  className="w-full border-2 border-dashed border-warm-300 dark:border-disc-border rounded-lg py-3 text-base text-warm-600 dark:text-disc-muted hover:border-orange hover:text-orange disabled:opacity-50 transition"
                >
                  {uploading ? t('sign.idCard.uploading') : t('sign.idCard.selectButton')}
                </button>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => onIdCardFile(e.target.files?.[0])}
            />
            {idCardErr && <p className="text-sm text-red-500 dark:text-red-400 mt-2">{idCardErr}</p>}
          </div>
        )}

        {/* Document preview (after can sign) */}
        {canSign && (
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-orange shrink-0" />
                <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('sign.preview.title')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVer(v => v + 1)}
                className="flex items-center gap-1.5 text-sm text-warm-400 dark:text-disc-muted hover:text-orange transition"
              >
                <RefreshCw size={14} /> {t('sign.preview.reload')}
              </button>
            </div>
            <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">
              {t('sign.preview.intro')}
            </p>
            {previewLoading && (
              <div className="flex items-center justify-center py-12 text-warm-400 dark:text-disc-muted text-sm">
                {t('sign.preview.loading')}
              </div>
            )}
            {previewErr && (
              <div className="py-4 text-center text-sm text-red-500">{previewErr}</div>
            )}
            {!previewLoading && previewPages.length > 0 && (
              <div className="space-y-2">
                {previewPages.map((src, i) => (
                  <img key={i} src={src} alt={t('sign.preview.pageAlt', { n: i + 1 })} className="w-full rounded-lg border border-warm-200 dark:border-disc-border" />
                ))}
              </div>
            )}
            <a
              href={`/api/docs/sign/preview?token=${encodeURIComponent(token)}&v=${previewVer}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-warm-200 dark:border-disc-border text-sm text-warm-500 dark:text-disc-muted hover:text-orange hover:border-orange transition"
            >
              <FileText size={14} /> {t('sign.preview.openInNewTab')}
            </a>
          </div>
        )}

        {/* เตือนก่อนเซ็น เมื่อคนที่ล็อกอินไม่ใช่เจ้าของชื่อบนใบ
            ความเสี่ยงจริงไม่ใช่คนตั้งใจโกง แต่คือหน้างานวุ่นๆ เปิดลิงก์ค้างผิดใบแล้วยื่นให้เซ็น
            — ป้ายนี้จับได้ก่อนเซ็น ส่วน signed_on_behalf จับได้ตอนสายไปแล้ว */}
        {canSign && signerRole === 'recipient' && isSigningForSomeoneElse && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={17} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {t('sign.onBehalfWarning', { name: recipientName })}
            </p>
          </div>
        )}

        {/* Signature canvas */}
        {canSign && (
          <>
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">
                  {signerRole === 'payer' ? t('sign.signature.titlePayer') : t('sign.signature.title')}
                </h2>
                {hasDrawn && (
                  <button type="button" onClick={clearCanvas} className="text-sm text-warm-400 dark:text-disc-muted hover:text-red-500 transition">
                    {t('sign.signature.clear')}
                  </button>
                )}
              </div>
              <div className="relative border-2 border-dashed border-warm-300 dark:border-disc-border rounded-lg overflow-hidden bg-white">
                {!hasDrawn && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-warm-300 dark:text-disc-muted text-sm select-none">{t('sign.signature.placeholder')}</p>
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={180}
                  className="w-full touch-none"
                  onMouseDown={onStart}
                  onMouseMove={onMove}
                  onMouseUp={onEnd}
                  onMouseLeave={onEnd}
                  onTouchStart={onStart}
                  onTouchMove={onMove}
                  onTouchEnd={onEnd}
                />
              </div>
              <p className="text-xs text-warm-400 dark:text-disc-muted mt-2">
                {t('sign.signature.note')}
              </p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!hasDrawn || submitting}
              className="w-full bg-orange text-white py-3.5 rounded-xl text-base font-semibold hover:bg-orange-light disabled:opacity-50 transition"
            >
              {submitting ? t('sign.submit.saving') : isSigned ? t('sign.submit.resign') : signerRole === 'payer' ? t('sign.submit.confirmPayment') : t('sign.submit.confirmSignature')}
            </button>
          </>
        )}

      </div>
    </div>
  )
}
