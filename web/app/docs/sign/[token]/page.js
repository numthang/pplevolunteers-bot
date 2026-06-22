'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { CheckCircle, AlertTriangle, Pen, Search, UserCheck, IdCard, FileText, RefreshCw, CreditCard } from 'lucide-react'
import IdCardCropper from '@/components/docs/IdCardCropper'

const ITEM_LABELS = {
  food: 'ค่าอาหาร', speaker: 'ค่าวิทยากร', travel: 'ค่าเดินทาง',
  venue: 'ค่าสถานที่', accommodation: 'ค่าที่พัก', supplies: 'ค่าวัสดุสิ้นเปลือง',
  equipment: 'ค่าอุปกรณ์', photo: 'ค่าถ่ายภาพ',
}

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
  const { token } = use(params)
  const { data: session, status } = useSession()

  const [entry, setEntry]         = useState(null)
  const [signerRole, setSignerRole] = useState('recipient')  // 'recipient' | 'payer'
  const [loadErr, setLoadErr]     = useState('')
  const [loading, setLoading]     = useState(true)

  // ngs self-link state (recipient only)
  const [ngsLinked, setNgsLinked]     = useState(false)
  const [ngsQuery, setNgsQuery]       = useState('')
  const [ngsResults, setNgsResults]   = useState([])
  const [ngsLinking, setNgsLinking]   = useState(false)
  const [selectedNgs, setSelectedNgs] = useState(null)
  const [idInput, setIdInput]         = useState('')
  const [ngsErr, setNgsErr]           = useState('')
  const ngsDebounce = useRef(null)
  const ngsDropRef  = useRef(null)

  // id-card upload state (recipient only)
  const [hasIdCard, setHasIdCard]               = useState(false)
  const [idCardPreviewUrl, setIdCardPreviewUrl] = useState(null)
  const [uploading, setUploading]               = useState(false)
  const [idCardErr, setIdCardErr]               = useState('')
  const [cropSrc, setCropSrc]                   = useState(null)  // dataURL ที่กำลังครอบ
  const fileRef = useRef(null)

  // document preview
  const [previewVer, setPreviewVer] = useState(0)

  const canvasRef = useRef(null)
  const drawing   = useRef(false)
  const lastPos   = useRef(null)
  const [hasDrawn, setHasDrawn]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    fetch(`/api/docs/sign/verify?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) setLoadErr(d.error || 'ลิงก์ไม่ถูกต้อง')
        else {
          setEntry(d.data)
          const role = d.data.signer_role || 'recipient'
          setSignerRole(role)

          if (role === 'recipient') {
            setNgsLinked(!!d.data.has_ngs_link)
            setHasIdCard(!!d.data.has_id_card)
            if (d.data.has_id_card && d.data.member_discord_id) {
              setIdCardPreviewUrl(`/api/docs/id-card/${d.data.member_discord_id}?token=${encodeURIComponent(token)}`)
            }
          }
        }
      })
      .catch(() => setLoadErr('เกิดข้อผิดพลาด'))
      .finally(() => setLoading(false))
  }, [token, status])

  // Canvas setup
  useEffect(() => {
    if (entry?.event_name) document.title = `${entry.event_name} — Docs`
  }, [entry])

  useEffect(() => {
    if (!entry || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#1a3a8f'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [entry, ngsLinked, signerRole])

  // Close ngs dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (ngsDropRef.current && !ngsDropRef.current.contains(e.target)) setNgsResults([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Ngs search debounce (recipient only)
  useEffect(() => {
    if (signerRole !== 'recipient') return
    clearTimeout(ngsDebounce.current)
    if (ngsQuery.trim().length < 2) { setNgsResults([]); return }
    ngsDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/docs/ngs-search?token=${encodeURIComponent(token)}&q=${encodeURIComponent(ngsQuery)}`)
      const data = await res.json()
      setNgsResults(data.data || [])
    }, 300)
  }, [ngsQuery, token, signerRole])

  function selectNgs(person) {
    setSelectedNgs(person)
    setNgsResults([])
    setNgsQuery('')
    setIdInput('')
    setNgsErr('')
  }

  async function confirmNgsLink() {
    if (!selectedNgs) return
    const idDigits = idInput.replace(/\D/g, '')
    if (idDigits.length !== 13) { setNgsErr('กรุณากรอกเลขบัตรประชาชน 13 หลัก'); return }
    setNgsErr('')
    setNgsLinking(true)
    try {
      const res = await fetch('/api/docs/sign/link-ngs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ngsSourceId: selectedNgs.source_id, idNumber: idDigits }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setNgsLinked(true)
      setSelectedNgs(null)
    } catch (err) {
      setNgsErr(err.message)
    } finally {
      setNgsLinking(false)
    }
  }

  // เลือกไฟล์ → เปิด cropper (ยังไม่อัปโหลด)
  function onIdCardFile(file) {
    if (!file) return
    setIdCardErr('')
    if (file.size > 8 * 1024 * 1024) { setIdCardErr('ไฟล์ใหญ่เกิน 8 MB'); return }
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result)
    reader.readAsDataURL(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ได้ภาพที่ครอบแล้ว (สัดส่วนบัตรจริง) → อัปโหลด
  async function uploadIdCard(blob) {
    setCropSrc(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', blob, 'idcard.jpg')
      fd.append('token', token)
      const res = await fetch('/api/docs/id-card', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'อัปโหลดไม่สำเร็จ')
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
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── States ────────────────────────────────────────────────────────────

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-disc-bg2">
        <p className="text-warm-500 dark:text-disc-muted">กำลังโหลด...</p>
      </div>
    )
  }

  if (loadErr) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-disc-bg2 p-4">
        <div className="max-w-sm w-full bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl p-8 text-center">
          <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
          <h1 className="text-xl font-bold text-warm-900 dark:text-disc-text mb-2">ลิงก์ไม่ถูกต้อง</h1>
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
            {signerRole === 'payer' ? 'ลงนามผู้จ่ายเงิน' : 'เซ็นใบสำคัญรับเงิน'}
          </h1>
          <p className="text-warm-500 dark:text-disc-muted text-base mb-6">
            กรุณาเข้าสู่ระบบด้วย Discord เพื่อยืนยันตัวตนก่อนเซ็น
          </p>
          <button
            onClick={() => signIn('discord', { callbackUrl: `/docs/sign/${token}` })}
            className="w-full bg-[#5865F2] text-white py-3 rounded-lg text-base font-semibold hover:bg-[#4752C4] transition"
          >
            เข้าสู่ระบบด้วย Discord
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
  const canSign = signerRole === 'payer' || ngsLinked

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-disc-bg2 p-4">
      {cropSrc && (
        <IdCardCropper src={cropSrc} onCancel={() => setCropSrc(null)} onCropped={uploadIdCard} />
      )}
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Banner: เซ็นแล้ว (ยังเซ็นใหม่ทับได้) */}
        {isSigned && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/40 rounded-xl p-4 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold">
              <CheckCircle size={18} className="shrink-0" /> เซ็นแล้ว
              <span className="font-normal text-sm text-green-600/80 dark:text-green-400/70">· เซ็นใหม่ทับได้</span>
            </span>
            <a
              href={`/api/docs/sign/pdf?token=${encodeURIComponent(token)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-orange hover:underline shrink-0"
            >
              ดาวน์โหลด PDF
            </a>
          </div>
        )}

        {/* Entry details */}
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
          {signerRole === 'payer' && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/40">
              <CreditCard size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">ลงนามในฐานะผู้จ่ายเงิน</span>
            </div>
          )}
          <h1 className="text-lg font-bold text-warm-900 dark:text-disc-text mb-1">ใบสำคัญรับเงิน</h1>
          {entry && (
            <>
              <p className="text-base font-medium text-warm-900 dark:text-disc-text">{entry.event_name}</p>
              <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">
                {formatDate(entry.event_date)}
                {entry.event_end_date ? ` – ${formatDate(entry.event_end_date)}` : ''}
              </p>
              <div className="border-t border-warm-100 dark:border-disc-border pt-3 space-y-1.5">
                <div className="flex justify-between text-base">
                  <span className="text-warm-600 dark:text-disc-muted">{ITEM_LABELS[entry.item_type] || entry.item_type}</span>
                  <span className="font-semibold text-warm-900 dark:text-disc-text">{Number(entry.amount).toLocaleString()} บ.</span>
                </div>
                {entry.description && (
                  <p className="text-sm text-warm-500 dark:text-disc-muted">{entry.description}</p>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-warm-100 dark:border-disc-border text-sm text-warm-500 dark:text-disc-muted">
                ผู้รับเงิน: <span className="font-medium text-warm-900 dark:text-disc-text">
                  {entry.ngs_first_name && entry.ngs_last_name
                    ? `${entry.ngs_first_name} ${entry.ngs_last_name} (@${entry.display_name})`
                    : entry.display_name}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Step: NGS self-link (recipient only, if not yet linked) */}
        {signerRole === 'recipient' && !ngsLinked && (
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck size={18} className="text-orange shrink-0" />
              <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">ยืนยันตัวตน</h2>
            </div>
            {!selectedNgs ? (
              <>
                <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">
                  ค้นหาชื่อ-นามสกุลของคุณในระบบสมาชิก เพื่อให้ข้อมูลในเอกสารถูกต้อง
                </p>
                <div className="relative" ref={ngsDropRef}>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 dark:text-disc-muted pointer-events-none" />
                    <input
                      type="text"
                      value={ngsQuery}
                      onChange={e => setNgsQuery(e.target.value)}
                      placeholder="พิมพ์ชื่อหรือนามสกุล..."
                      className="w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text pl-9 pr-3 py-2.5 text-base rounded-lg placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange"
                    />
                  </div>
                  {ngsResults.length > 0 && (
                    <ul className="absolute z-10 w-full mt-1 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {ngsResults.map(n => (
                        <li key={n.source_id}>
                          <button
                            type="button"
                            onClick={() => selectNgs(n)}
                            className="w-full text-left px-4 py-2.5 hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                          >
                            <span className="text-base font-medium text-warm-900 dark:text-disc-text">
                              {n.first_name} {n.last_name}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-warm-500 dark:text-disc-muted mb-1">
                  ยืนยันว่าเป็น <span className="font-medium text-warm-900 dark:text-disc-text">{selectedNgs.first_name} {selectedNgs.last_name}</span> โดยกรอกเลขบัตรประชาชน
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={idInput}
                  onChange={e => setIdInput(e.target.value)}
                  placeholder="เลขบัตรประชาชน 13 หลัก"
                  maxLength={17}
                  className="w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text px-3 py-2.5 text-base rounded-lg tracking-widest placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange mt-2"
                />
                {ngsErr && <p className="text-sm text-red-500 dark:text-red-400 mt-2">{ngsErr}</p>}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={confirmNgsLink}
                    disabled={ngsLinking}
                    className="flex-1 bg-orange text-white py-2.5 rounded-lg text-base font-semibold hover:bg-orange-light disabled:opacity-50 transition"
                  >
                    {ngsLinking ? 'กำลังยืนยัน...' : 'ยืนยันตัวตน'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectedNgs(null); setNgsErr('') }}
                    disabled={ngsLinking}
                    className="px-4 py-2.5 text-base text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text transition"
                  >
                    เลือกใหม่
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step: ID-card upload (recipient only, after ngs linked, เฉพาะเจ้าของเอกสาร) */}
        {signerRole === 'recipient' && ngsLinked && session?.user?.discordId === entry?.member_discord_id && (
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <IdCard size={18} className="text-orange shrink-0" />
              <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">สำเนาบัตรประชาชน <span className="text-sm font-normal text-warm-400 dark:text-disc-muted">(ทำครั้งเดียว)</span></h2>
            </div>
            {hasIdCard ? (
              <div className="mt-2">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="flex items-center gap-1.5 text-base text-green-600 dark:text-green-400">
                    <CheckCircle size={16} /> แนบสำเนาบัตรแล้ว
                  </p>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="text-sm text-warm-400 dark:text-disc-muted hover:text-orange transition"
                  >
                    เปลี่ยนรูป
                  </button>
                </div>
                {idCardPreviewUrl && (
                  <img
                    src={idCardPreviewUrl}
                    alt="สำเนาบัตรประชาชน"
                    className="w-full max-h-52 object-contain rounded-lg border border-warm-200 dark:border-disc-border bg-warm-50 dark:bg-disc-hover"
                  />
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">
                  อัปโหลดครั้งเดียว ใช้แนบทุกใบสำคัญรับเงิน — ระบบจะใส่ลายน้ำ "ใช้สำหรับพรรคประชาชนเท่านั้น" ให้อัตโนมัติ
                </p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full border-2 border-dashed border-warm-300 dark:border-disc-border rounded-lg py-3 text-base text-warm-600 dark:text-disc-muted hover:border-orange hover:text-orange disabled:opacity-50 transition"
                >
                  {uploading ? 'กำลังอัปโหลด...' : '+ เลือกรูปสำเนาบัตร'}
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
                <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">ตัวอย่างเอกสาร</h2>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVer(v => v + 1)}
                className="flex items-center gap-1.5 text-sm text-warm-400 dark:text-disc-muted hover:text-orange transition"
              >
                <RefreshCw size={14} /> โหลดใหม่
              </button>
            </div>
            <p className="text-sm text-warm-500 dark:text-disc-muted mb-3">
              ตรวจสอบความถูกต้องของใบสำคัญรับเงินก่อนเซ็น
            </p>
            <object
              key={previewVer}
              data={`/api/docs/sign/preview?token=${encodeURIComponent(token)}&v=${previewVer}#toolbar=1&navpanes=0&view=FitH`}
              type="application/pdf"
              className="w-full h-[85vh] rounded-lg border border-warm-200 dark:border-disc-border bg-white"
            >
              <a
                href={`/api/docs/sign/preview?token=${encodeURIComponent(token)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-base text-teal hover:underline py-4"
              >
                เปิดดูตัวอย่างเอกสาร (PDF)
              </a>
            </object>
          </div>
        )}

        {/* Signature canvas */}
        {canSign && (
          <>
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">
                  {signerRole === 'payer' ? 'ลายเซ็นผู้จ่ายเงิน' : 'ลายเซ็น'}
                </h2>
                {hasDrawn && (
                  <button type="button" onClick={clearCanvas} className="text-sm text-warm-400 dark:text-disc-muted hover:text-red-500 transition">
                    ล้าง
                  </button>
                )}
              </div>
              <div className="relative border-2 border-dashed border-warm-300 dark:border-disc-border rounded-lg overflow-hidden bg-white">
                {!hasDrawn && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-warm-300 dark:text-disc-muted text-sm select-none">เซ็นชื่อที่นี่</p>
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
                ลายเซ็นนี้จะถูกบันทึกพร้อมชื่อ Discord และเวลาประทับ
              </p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!hasDrawn || submitting}
              className="w-full bg-orange text-white py-3.5 rounded-xl text-base font-semibold hover:bg-orange-light disabled:opacity-50 transition"
            >
              {submitting ? 'กำลังบันทึก...' : isSigned ? 'เซ็นใหม่' : signerRole === 'payer' ? 'ยืนยันการจ่ายเงิน' : 'ยืนยันลายเซ็น'}
            </button>
          </>
        )}

      </div>
    </div>
  )
}
