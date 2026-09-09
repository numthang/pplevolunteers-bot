'use client'

// ⚠️ หน้าทดสอบชั่วคราว — **ลบทิ้งเมื่อตัดสินใจเรื่องเครื่องอัดในเบราว์เซอร์เสร็จแล้ว**
//
// รอบแรก (2026-09-08) ตอบคำถาม: มือถือทีมอัดวิดีโอในเบราว์เซอร์ได้จริงไหม ไฟล์ที่ได้ระบบรับได้ไหม
// รอบสอง (2026-09-09) ตอบคำถามใหม่: **ทำไมภาพซูมเข้าหน้ากว่ากล้อง selfie ปกติ**
//   → เดาไม่ได้ ต้องกดเทียบบนเครื่องจริง จึงทำเป็น "หน้าเทียบหลายแบบในหน้าเดียว"
//     (deploy รอบเดียวลองได้ครบ ไม่ต้อง deploy ทีละสมมติฐาน — รอบก่อนเสียเวลาไปกับตรงนี้)
//
// ⛔ getUserMedia ทำงานเฉพาะบน **https** (หรือ localhost) — เปิดผ่าน http://<ip>:3000 บนมือถือจะไม่ขึ้นกล้อง
//    ต้องทดสอบผ่านโดเมนจริง หรือ tunnel ที่เป็น https
//
// ℹ️ เจอจากการทดสอบจริง 2026-09-09: บนมือถือ **กดเปิดกล้องครั้งแรกได้ 1280×720 กดซ้ำได้ 720×1280**
//    เพราะของเดิมไม่ปิด track เก่าก่อนขอใหม่ กล้องเลยต่อรองสัดส่วนใหม่รอบสอง = ผลไม่คงที่
//    ที่นี่จึง stop track เก่าทุกครั้งก่อนขอใหม่ (ดู openCamera) ผลจะได้เทียบกันได้จริง
//
// ไม่แตะ DB ไม่ยิง API ไม่อัปโหลดอะไรทั้งนั้น — อัดแล้วเล่นย้อนดูในเครื่องอย่างเดียว
import { useCallback, useEffect, useRef, useState } from 'react'

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

const AUTO_STOP_SECONDS = 8

// แบบที่จะเอามาเทียบกัน — ทั้งหมดต่างกันแค่ constraint ที่ส่งให้ getUserMedia
const VARIANTS = [
  { key: 'p916', label: '9:16 แนวตั้ง', hint: 'ของเดิมที่ใช้อยู่จริง', video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } } },
  { key: 'p34', label: '3:4 แนวตั้ง', hint: 'สัดส่วนเซนเซอร์ native', video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } } },
  { key: 'l169', label: '16:9 แนวนอน', hint: 'แบบเว็บแคมมาตรฐาน', video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
  { key: 'free', label: 'ไม่ระบุขนาด', hint: 'ปล่อยกล้องเลือกเอง', video: { facingMode: 'user' } },
]

const FITS = [
  { key: 'contain', label: 'contain', hint: 'ไม่ครอปเลย เห็นภาพเต็มที่กล้องให้' },
  { key: 'cover', label: 'cover', hint: 'ครอปให้เต็มกรอบ (แบบที่ใช้อยู่จริง)' },
]

const BOXES = [
  { key: 'auto', label: 'ตามภาพจริง', hint: 'กรอบเท่าสัดส่วนที่กล้องให้' },
  { key: '9/16', label: '9:16', hint: 'กรอบแนวตั้งแบบ reels' },
  { key: '3/4', label: '3:4', hint: 'กรอบเดิมของหน้านี้' },
]

const fmtBytes = n => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`)

// อ่านสัดส่วนเป็นภาษาคน — ตัวเลขดิบอย่างเดียวดูไม่ออกว่าโดนครอปไปเท่าไร
const describeRatio = (w, h) => {
  if (!w || !h) return '-'
  const r = w / h
  const near = (a, b) => Math.abs(a - b) < 0.02
  if (near(r, 16 / 9)) return '16:9 แนวนอน'
  if (near(r, 4 / 3)) return '4:3 แนวนอน'
  if (near(r, 3 / 4)) return '3:4 แนวตั้ง (เต็ม FOV เซนเซอร์)'
  if (near(r, 9 / 16)) return '9:16 แนวตั้ง (ครอบข้างทิ้ง ~25%)'
  return `${r.toFixed(3)} (ไม่ตรงแบบมาตรฐาน)`
}

export default function CamTestPage() {
  const [support, setSupport] = useState(null)
  const [status, setStatus] = useState('ยังไม่เริ่ม')
  const [error, setError] = useState('')
  const [trackInfo, setTrackInfo] = useState(null)
  const [result, setResult] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [recording, setRecording] = useState(false)

  const [variant, setVariant] = useState('p916')
  const [fit, setFit] = useState('contain')
  const [box, setBox] = useState('auto')

  const liveRef = useRef(null)
  const playbackRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  useEffect(() => {
    setSupport({
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '-',
      secure: typeof window !== 'undefined' ? window.isSecureContext : false,
      getUserMedia: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
      mediaRecorder: typeof window !== 'undefined' && !!window.MediaRecorder,
      mimes: MIME_CANDIDATES.map(m => ({
        m,
        ok: typeof window !== 'undefined' && !!window.MediaRecorder &&
          (() => { try { return MediaRecorder.isTypeSupported(m) } catch { return false } })(),
      })),
    })
  }, [])

  useEffect(() => () => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  const openCamera = useCallback(async key => {
    const v = VARIANTS.find(x => x.key === key) || VARIANTS[0]
    setVariant(key)
    setError('')
    setResult(null)
    setTrackInfo(null)
    setStatus(`กำลังขอกล้องแบบ "${v.label}"…`)

    // ⛔ ต้องปิดของเก่าก่อนเสมอ — ถ้ายังเปิดค้าง กล้องจะไม่เปลี่ยนสัดส่วนตาม constraint ใหม่
    //    (อาการที่เจอจริง: กดครั้งแรกได้ 1280×720 กดซ้ำได้ 720×1280 ทั้งที่ขอเหมือนเดิม)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (liveRef.current) liveRef.current.srcObject = null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: v.video, audio: true })
      streamRef.current = stream
      if (liveRef.current) liveRef.current.srcObject = stream
      const vt = stream.getVideoTracks()[0]
      const s = vt?.getSettings?.() || {}
      setTrackInfo({
        variant: v.label,
        label: vt?.label || '-',
        w: s.width || 0,
        h: s.height || 0,
        size: s.width && s.height ? `${s.width}×${s.height}` : '-',
        fps: s.frameRate ? Math.round(s.frameRate) : '-',
        audio: stream.getAudioTracks().length,
      })
      setStatus(`กล้องพร้อม (${v.label}) — กดปุ่มแดงเพื่ออัด`)
    } catch (err) {
      setError(`เปิดกล้องไม่สำเร็จ: ${err.name} — ${err.message}`)
      setStatus('ล้มเหลว')
    }
  }, [])

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current)
    if (recorderRef.current?.state && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
  }, [])

  const startRecording = useCallback(() => {
    setError('')
    setResult(null)
    const mime = MIME_CANDIDATES.find(m => {
      try { return MediaRecorder.isTypeSupported(m) } catch { return false }
    })
    if (!mime) { setError('เครื่องนี้ไม่รองรับรูปแบบไฟล์ที่เราลองทั้งหมด'); return }

    chunksRef.current = []
    let rec
    try {
      rec = new MediaRecorder(streamRef.current, {
        mimeType: mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000,
      })
    } catch (err) {
      setError(`สร้างตัวอัดไม่สำเร็จ: ${err.name} — ${err.message}`)
      return
    }

    rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
    rec.onerror = e => setError(`ตัวอัดพัง: ${e.error?.name || 'unknown'}`)
    rec.onstop = () => {
      setRecording(false)
      const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] })
      const url = URL.createObjectURL(blob)
      setResult({ mime: blob.type, requested: mime, size: blob.size, url, duration: null, dims: null })
      setStatus('อัดเสร็จ — กดเล่นดูข้างล่าง')
    }

    recorderRef.current = rec
    // ขอก้อนข้อมูลทุก 1 วิ — บาง Safari ไม่ยิง ondataavailable เลยถ้าไม่ส่ง timeslice
    rec.start(1000)
    setRecording(true)
    setElapsed(0)
    setStatus('กำลังอัด…')
    timerRef.current = setInterval(() => {
      setElapsed(e => {
        const next = e + 1
        if (next >= AUTO_STOP_SECONDS) stopRecording()
        return next
      })
    }, 1000)
  }, [stopRecording])

  // ความยาว + **ขนาดจริงของไฟล์ที่อัดได้** — อันหลังสำคัญกว่า เพราะบอกว่าไฟล์ที่จะเอาไปโพสต์
  // เป็นแนวตั้งจริงไหม (preview ที่จอครอปยังไงก็ไม่มีผลกับไฟล์ MediaRecorder อัดจาก stream ดิบ)
  const onLoadedMeta = () => {
    const el = playbackRef.current
    const d = el?.duration
    setResult(r => (r ? {
      ...r,
      duration: Number.isFinite(d) ? `${d.toFixed(1)} วินาที` : `อ่านไม่ได้ (${String(d)})`,
      dims: el?.videoWidth ? `${el.videoWidth}×${el.videoHeight}` : '-',
    } : r))
  }

  const row = 'flex justify-between gap-3 py-1 border-b border-white/10 text-sm'
  const chip = active =>
    `px-3 py-2 rounded-lg text-sm font-medium border ${active
      ? 'bg-white text-black border-white'
      : 'bg-white/5 text-white/80 border-white/15'}`

  const boxAspect = box === 'auto'
    ? (trackInfo?.w ? `${trackInfo.w} / ${trackInfo.h}` : '3 / 4')
    : box.replace('/', ' / ')

  return (
    <div className="min-h-screen bg-[#0f1216] text-white p-4 flex flex-col gap-4">
      <h1 className="text-xl font-bold">ทดสอบกล้อง/อัดวิดีโอในเบราว์เซอร์</h1>
      <p className="text-sm text-white/60">
        หน้าทดสอบชั่วคราว ไม่ส่งอะไรขึ้นเซิร์ฟเวอร์ — กดเทียบแต่ละแบบแล้วดูว่าภาพซูมต่างกันไหม
      </p>

      {/* ── 1. ขอกล้องแบบไหน ── */}
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium">1. ขอกล้องแบบไหน <span className="text-white/50 text-sm">(กดเพื่อเปิดกล้องใหม่)</span></p>
        <div className="grid grid-cols-2 gap-2">
          {VARIANTS.map(v => (
            <button key={v.key} onClick={() => openCamera(v.key)} className={chip(variant === v.key)}>
              {v.label}
              <span className="block text-xs font-normal opacity-60">{v.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-base">สถานะ: <b>{status}</b>{recording && ` (${elapsed}/${AUTO_STOP_SECONDS} วิ)`}</p>
      {error && <p className="rounded-lg bg-red-950/70 p-3 text-red-200 text-sm break-all">{error}</p>}

      <video
        ref={liveRef} autoPlay playsInline muted
        className="w-full rounded-lg bg-black"
        style={{ transform: 'scaleX(-1)', aspectRatio: boxAspect, objectFit: fit }}
      />

      {/* ── 2/3. การแสดงผล (ไม่กระทบไฟล์ที่อัด แค่เปลี่ยนภาพที่เห็นบนจอ) ── */}
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium">2. กรอบพรีวิว <span className="text-white/50 text-sm">(ไม่กระทบไฟล์ที่อัด)</span></p>
        <div className="flex gap-2">
          {BOXES.map(b => (
            <button key={b.key} onClick={() => setBox(b.key)} className={`${chip(box === b.key)} flex-1`}>{b.label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          {FITS.map(f => (
            <button key={f.key} onClick={() => setFit(f.key)} className={`${chip(fit === f.key)} flex-1`}>
              {f.label}
              <span className="block text-xs font-normal opacity-60">{f.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {trackInfo && (
        <div className="rounded-lg bg-black/40 p-3">
          <div className={row}><span>แบบที่ขอไป</span><b>{trackInfo.variant}</b></div>
          <div className={row}><span>ความละเอียดที่ได้จริง</span><b>{trackInfo.size}</b></div>
          <div className={row}><span>สัดส่วนที่ได้จริง</span><b className="text-right">{describeRatio(trackInfo.w, trackInfo.h)}</b></div>
          <div className={row}><span>เฟรมต่อวินาที</span><b>{trackInfo.fps}</b></div>
          <div className={row}><span>ช่องเสียง</span><b>{trackInfo.audio ? '✅ มี' : '❌ ไม่มี'}</b></div>
          <div className={row}><span>กล้องที่ได้</span><b className="text-right break-all">{trackInfo.label}</b></div>
        </div>
      )}

      <div className="flex gap-2">
        {!recording ? (
          <button onClick={startRecording} disabled={!trackInfo} className="flex-1 py-3 rounded-lg bg-red-600 font-medium disabled:opacity-30">
            อัดทดสอบ ({AUTO_STOP_SECONDS} วิ)
          </button>
        ) : (
          <button onClick={stopRecording} className="flex-1 py-3 rounded-lg bg-white text-red-600 font-medium">
            หยุดอัด
          </button>
        )}
      </div>

      {result && (
        <>
          <video ref={playbackRef} src={result.url} controls playsInline onLoadedMetadata={onLoadedMeta} className="w-full rounded-lg bg-black" />
          <div className="rounded-lg bg-black/40 p-3">
            <div className={row}><span><b>ขนาดไฟล์จริงที่อัดได้</b></span><b>{result.dims ?? 'กำลังอ่าน…'}</b></div>
            <div className={row}><span>ชนิดไฟล์ที่ได้</span><b>{result.mime || '(ว่าง)'}</b></div>
            <div className={row}><span>ขนาด</span><b>{fmtBytes(result.size)}</b></div>
            <div className={row}><span>ความยาวที่อ่านได้</span><b>{result.duration ?? 'กำลังอ่าน…'}</b></div>
          </div>
          <p className="text-sm text-white/60">
            ⚠️ &quot;ขนาดไฟล์จริงที่อัดได้&quot; คือตัวชี้ขาด — กรอบพรีวิวข้อ 2 ไม่มีผลกับไฟล์เลย
            เพราะตัวอัดดึงจากสตรีมกล้องตรงๆ
          </p>
        </>
      )}

      {support && (
        <details className="rounded-lg bg-black/40 p-3">
          <summary className="text-sm text-white/70 cursor-pointer">ข้อมูลเครื่อง / ชนิดไฟล์ที่รองรับ</summary>
          <div className="pt-2">
            <div className={row}><span>เชื่อมต่อแบบปลอดภัย (https)</span><b>{support.secure ? '✅' : '❌ ต้องเป็น https ไม่งั้นกล้องไม่ขึ้น'}</b></div>
            <div className={row}><span>เข้าถึงกล้องได้</span><b>{support.getUserMedia ? '✅' : '❌'}</b></div>
            <div className={row}><span>อัดวิดีโอได้</span><b>{support.mediaRecorder ? '✅' : '❌'}</b></div>
            {support.mimes.map(x => (
              <div key={x.m} className={row}><span className="break-all">{x.m}</span><b>{x.ok ? '✅' : '—'}</b></div>
            ))}
            <p className="pt-2 text-xs text-white/40 break-all">{support.ua}</p>
          </div>
        </details>
      )}
    </div>
  )
}
