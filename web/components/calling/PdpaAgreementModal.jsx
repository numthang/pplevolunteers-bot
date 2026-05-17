'use client'

import { useState, useEffect } from 'react'

export default function PdpaAgreementModal({ storageKey, onAccept }) {
  const [accepted, setAccepted] = useState(true)

  useEffect(() => {
    try { if (!localStorage.getItem(storageKey)) setAccepted(false) } catch {}
  }, [storageKey])

  if (accepted) return null

  function handleAccept() {
    try { localStorage.setItem(storageKey, '1') } catch {}
    setAccepted(true)
    onAccept?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[85svh]">

        <div className="p-5 overflow-y-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
              🔒
            </div>
            <div>
              <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">ข้อตกลง PDPA</h2>
              <p className="text-sm text-warm-500 dark:text-disc-muted">กรุณาอ่านและยอมรับก่อนเข้าใช้งาน</p>
            </div>
          </div>

          <div className="bg-warm-50 dark:bg-disc-hover border border-warm-200 dark:border-disc-border rounded-xl p-4 space-y-2 text-sm text-warm-700 dark:text-disc-text leading-relaxed">
            <p className="font-medium text-warm-900 dark:text-disc-text">ข้อมูลในระบบนี้ได้รับความคุ้มครองตาม PDPA คุณตกลงที่จะ:</p>
            <ul className="space-y-1.5 pl-1">
              {[
                'ใช้ข้อมูลเพื่อกิจกรรมนี้เท่านั้น',
                'ไม่เผยแพร่หรือส่งต่อข้อมูลให้บุคคลภายนอก',
                'รักษาความลับของข้อมูล',
                'ไม่นำข้อมูลไปใช้ประโยชน์ส่วนตัวหรือเชิงพาณิชย์',
              ].map(text => (
                <li key={text} className="flex gap-2">
                  <span className="text-teal flex-shrink-0">✓</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <p className="text-warm-500 dark:text-disc-muted text-xs border-t border-warm-200 dark:border-disc-border pt-2">
              📋 ระบบบันทึก Log การเข้าถึงข้อมูลของผู้ใช้ทุกท่าน
            </p>
          </div>
        </div>

        <div className="p-4 pt-0">
          <button
            onClick={handleAccept}
            className="w-full py-3 bg-teal hover:opacity-90 text-white font-semibold rounded-xl transition text-base"
          >
            ยอมรับและเข้าใช้งาน
          </button>
        </div>
      </div>
    </div>
  )
}
