'use client'

// ⚠️ หน้าทดสอบชั่วคราว — **ลบทิ้งเมื่อตัดสินใจเรื่องเครื่องอัดในเบราว์เซอร์เสร็จแล้ว**
//
// มีไว้ตอบคำถามเดียว (2026-09-08): มือถือของทีม (โดยเฉพาะไอโฟน) อัดวิดีโอในเบราว์เซอร์ได้จริงไหม
// และไฟล์ที่ได้เป็นชนิดที่ระบบเรารับได้หรือเปล่า — จำลองบนเครื่อง dev ไม่ได้ ต้องเปิดบนเครื่องจริง
//
// ⛔ getUserMedia ทำงานเฉพาะบน **https** (หรือ localhost) — เปิดผ่าน http://<ip>:3000 บนมือถือจะไม่ขึ้นกล้อง
//    ต้องทดสอบผ่านโดเมนจริง หรือ tunnel ที่เป็น https
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

const fmtBytes = n => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`)

export default function CamTestPage() {
  const [support, setSupport] = useState(null)
  const [status, setStatus] = useState('ยังไม่เริ่ม')
  const [error, setError] = useState('')
  const [trackInfo, setTrackInfo] = useState(null)
  const [result, setResult] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [recording, setRecording] = useState(false)

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

  const openCamera = useCallback(async () => {
    setError('')
    setResult(null)
    setStatus('กำลังขอสิทธิ์กล้อง/ไมค์…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      })
      streamRef.current = stream
      if (liveRef.current) liveRef.current.srcObject = stream
      const vt = stream.getVideoTracks()[0]
      const s = vt?.getSettings?.() || {}
      setTrackInfo({
        label: vt?.label || '-',
        size: s.width && s.height ? `${s.width}×${s.height}` : '-',
        fps: s.frameRate ? Math.round(s.frameRate) : '-',
        audio: stream.getAudioTracks().length,
      })
      setStatus('กล้องพร้อม — กดปุ่มแดงเพื่ออัด')
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
      setResult({ mime: blob.type, requested: mime, size: blob.size, url, duration: null })
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

  // ความยาวคลิปที่เบราว์เซอร์อ่านได้ — ถ้าออกมาเป็น Infinity/NaN แปลว่าไฟล์ไม่มีข้อมูลความยาวฝังมา
  // (เป็นปัญหาที่รู้กันของ MediaRecorder และเป็นความเสี่ยงตอนเอาไปโพสต์ขึ้นแพลตฟอร์มจริง)
  const onLoadedMeta = () => {
    const d = playbackRef.current?.duration
    setResult(r => (r ? { ...r, duration: Number.isFinite(d) ? `${d.toFixed(1)} วินาที` : `อ่านไม่ได้ (${String(d)})` } : r))
  }

  const row = 'flex justify-between gap-3 py-1 border-b border-white/10 text-sm'

  return (
    <div className="min-h-screen bg-[#0f1216] text-white p-4 flex flex-col gap-4">
      <h1 className="text-xl font-bold">ทดสอบอัดวิดีโอในเบราว์เซอร์</h1>
      <p className="text-sm text-white/60">
        หน้าทดสอบชั่วคราว ไม่ส่งอะไรขึ้นเซิร์ฟเวอร์ทั้งสิ้น — อัดแล้วเล่นดูในเครื่องอย่างเดียว
      </p>

      {support && (
        <div className="rounded-lg bg-black/40 p-3">
          <div className={row}><span>เชื่อมต่อแบบปลอดภัย (https)</span><b>{support.secure ? '✅' : '❌ ต้องเป็น https ไม่งั้นกล้องไม่ขึ้น'}</b></div>
          <div className={row}><span>เข้าถึงกล้องได้</span><b>{support.getUserMedia ? '✅' : '❌'}</b></div>
          <div className={row}><span>อัดวิดีโอได้</span><b>{support.mediaRecorder ? '✅' : '❌'}</b></div>
          {support.mimes.map(x => (
            <div key={x.m} className={row}><span className="break-all">{x.m}</span><b>{x.ok ? '✅' : '—'}</b></div>
          ))}
          <p className="pt-2 text-xs text-white/40 break-all">{support.ua}</p>
        </div>
      )}

      <p className="text-base">สถานะ: <b>{status}</b>{recording && ` (${elapsed}/${AUTO_STOP_SECONDS} วิ)`}</p>
      {error && <p className="rounded-lg bg-red-950/70 p-3 text-red-200 text-sm break-all">{error}</p>}

      <video ref={liveRef} autoPlay playsInline muted className="w-full rounded-lg bg-black aspect-[3/4] object-cover" style={{ transform: 'scaleX(-1)' }} />

      <div className="flex gap-2">
        <button onClick={openCamera} className="flex-1 py-3 rounded-lg bg-white/10 text-white font-medium">
          1. เปิดกล้อง
        </button>
        {!recording ? (
          <button onClick={startRecording} disabled={!trackInfo} className="flex-1 py-3 rounded-lg bg-red-600 font-medium disabled:opacity-30">
            2. เริ่มอัด ({AUTO_STOP_SECONDS} วิ)
          </button>
        ) : (
          <button onClick={stopRecording} className="flex-1 py-3 rounded-lg bg-white text-red-600 font-medium">
            หยุดอัด
          </button>
        )}
      </div>

      {trackInfo && (
        <div className="rounded-lg bg-black/40 p-3">
          <div className={row}><span>กล้องที่ได้</span><b className="text-right break-all">{trackInfo.label}</b></div>
          <div className={row}><span>ความละเอียด</span><b>{trackInfo.size}</b></div>
          <div className={row}><span>เฟรมต่อวินาที</span><b>{trackInfo.fps}</b></div>
          <div className={row}><span>ช่องเสียง</span><b>{trackInfo.audio ? '✅ มี' : '❌ ไม่มี'}</b></div>
        </div>
      )}

      {result && (
        <>
          <video ref={playbackRef} src={result.url} controls playsInline onLoadedMetadata={onLoadedMeta} className="w-full rounded-lg bg-black" />
          <div className="rounded-lg bg-black/40 p-3">
            <div className={row}><span>ชนิดไฟล์ที่ได้</span><b>{result.mime || '(ว่าง)'}</b></div>
            <div className={row}><span>ชนิดที่ขอไป</span><b className="break-all">{result.requested}</b></div>
            <div className={row}><span>ขนาดไฟล์</span><b>{fmtBytes(result.size)}</b></div>
            <div className={row}><span>ความยาวที่อ่านได้</span><b>{result.duration ?? 'กำลังอ่าน…'}</b></div>
          </div>
          <p className="text-sm text-white/60">
            ดูให้ครบ 3 อย่าง: ภาพชัดพอไหม · เสียงได้ยินชัดไหม · ความยาวอ่านได้เป็นตัวเลขไหม
          </p>
        </>
      )}
    </div>
  )
}
