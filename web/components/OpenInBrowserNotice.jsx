'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ExternalLink, Copy, Check } from 'lucide-react'
import { detectInAppBrowser, androidIntentUrl } from '@/lib/inAppBrowser.js'

/**
 * ทางออกจากมินิเบราว์เซอร์ของแอปแชต — ใช้กับหน้าที่ "คนนอกกดลิงก์เข้ามา" แล้วต้องล็อกอิน
 *
 * โชว์ 2 ระดับตามความมั่นใจของการตรวจ (ดูเหตุผลที่ lib/inAppBrowser.js) — ตัดสินเองจาก UA
 * ไม่มี prop ให้สั่ง เพราะผู้เรียกไม่มีทางรู้ดีกว่า:
 *   - ตรวจเจอว่าอยู่ในมินิเบราว์เซอร์ → การ์ดเต็มพร้อมปุ่มพาออก
 *   - ตรวจไม่เจอ → ลิงก์เล็กๆ เงียบๆ ไว้ให้คนที่ตันหาเจอเอง
 *     **ต้องมีเสมอ** เพราะ UA sniffing พลาดได้ ห้ามให้ทางออกขึ้นกับการตรวจเจออย่างเดียว
 *
 * Android บังคับเปิดเบราว์เซอร์ให้ได้จริงผ่าน intent:// — iOS ทำไม่ได้ (ข้อจำกัดของ OS)
 * ได้แค่คัดลอกลิงก์ให้แล้วบอกวิธี ฉะนั้นข้อความ 2 ฝั่งต้องคนละแบบ ห้ามเขียนรวม
 */
export default function OpenInBrowserNotice({ className = '' }) {
  const t = useTranslations('common.openInBrowser')
  // ต้องรอ mount — UA กับ location ไม่มีตอน SSR (และ prerender ไว้ก็ผิดอยู่ดี)
  const [env, setEnv]       = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setEnv({ ...detectInAppBrowser(navigator.userAgent), url: window.location.href })
  }, [])

  if (!env) return null

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(env.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // มินิเบราว์เซอร์บางตัวไม่ให้สิทธิ์ clipboard — ให้ผู้ใช้ลากเลือก URL เอาเองแทน
      setCopied(false)
      window.prompt(t('copyFallback'), env.url)
    }
  }

  // ── ตรวจไม่เจอ: ลิงก์เงียบๆ พอ ไม่ต้องมารบกวนคนที่ใช้ Chrome อยู่แล้ว ──
  if (!env.inApp) {
    return (
      <button
        type="button"
        onClick={copyLink}
        className={`mx-auto flex items-center gap-1.5 text-sm text-warm-400 dark:text-disc-muted hover:text-orange transition ${className}`}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? t('copied') : t('quietLink')}
      </button>
    )
  }

  // เดาชื่อแอปไม่ได้ = มีข้อความของตัวเองต่างหาก ห้ามยัดคำกลางๆ ลงช่อง {app}
  // ("เปิดใน แอปแชต อยู่" อ่านแล้วสะดุด และฟังดูเหมือนระบบพัง มากกว่าเหมือนคำแนะนำ)
  const app = env.app

  return (
    <div className={`rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-4 ${className}`}>
      <p className="text-base font-semibold text-amber-900 dark:text-amber-200">
        {app ? t('title', { app }) : t('titleUnknown')}
      </p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
        {env.android ? t('bodyAndroid') : app ? t('bodyIos', { app }) : t('bodyIosUnknown')}
      </p>

      {env.android ? (
        <a
          href={androidIntentUrl(env.url)}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-orange text-white py-2.5 rounded-lg text-base font-semibold hover:bg-orange-light transition"
        >
          <ExternalLink size={17} /> {t('openButton')}
        </a>
      ) : (
        <button
          type="button"
          onClick={copyLink}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-orange text-white py-2.5 rounded-lg text-base font-semibold hover:bg-orange-light transition"
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}
          {copied ? t('copiedButton') : t('copyButton')}
        </button>
      )}
    </div>
  )
}
