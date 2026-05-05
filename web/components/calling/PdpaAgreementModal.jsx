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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-5">

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0 text-xl">
            🔒
          </div>
          <div>
            <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">ข้อตกลงการคุ้มครองข้อมูลส่วนบุคคล</h2>
            <p className="text-base text-warm-500 dark:text-disc-muted">PDPA — กรุณาอ่านและยอมรับก่อนเข้าใช้งาน</p>
          </div>
        </div>

        <div className="bg-warm-50 dark:bg-disc-hover border border-warm-200 dark:border-disc-border rounded-xl p-4 space-y-3 text-base text-warm-700 dark:text-disc-text leading-relaxed">
          <p>
            ข้อมูลในระบบนี้เป็น{' '}
            <strong className="text-warm-900 dark:text-disc-text">ข้อมูลส่วนบุคคล</strong>
            {' '}ของสมาชิกและผู้ติดต่อ ซึ่งได้รับความคุ้มครองตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
          </p>

          <p className="font-medium text-warm-900 dark:text-disc-text">ในการเข้าร่วมกิจกรรมโทรครั้งนี้ คุณตกลงที่จะ:</p>

          <ul className="space-y-2 pl-1">
            {[
              'ใช้ข้อมูลเพื่อการติดต่อในกิจกรรมนี้เท่านั้น',
              'ไม่เผยแพร่ คัดลอก หรือส่งต่อข้อมูลให้บุคคลภายนอก',
              'รักษาความลับของข้อมูลอย่างเคร่งครัด',
              'ไม่นำข้อมูลไปใช้เพื่อประโยชน์ส่วนตัวหรือเชิงพาณิชย์',
            ].map(text => (
              <li key={text} className="flex gap-2">
                <span className="text-teal flex-shrink-0 mt-0.5">✓</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <div className="flex gap-2 border-t border-warm-200 dark:border-disc-border pt-3 text-warm-500 dark:text-disc-muted">
            <span className="flex-shrink-0">📋</span>
            <span>ระบบมีการบันทึก Log การเข้าถึงข้อมูล รวมถึงการนำเข้าและส่งออกข้อมูลของผู้ใช้งานทุกท่าน</span>
          </div>
        </div>

        <button
          onClick={handleAccept}
          className="w-full py-3 bg-teal hover:opacity-90 text-white font-semibold rounded-xl transition text-base"
        >
          ยอมรับข้อตกลงและเข้าใช้งาน
        </button>
      </div>
    </div>
  )
}
