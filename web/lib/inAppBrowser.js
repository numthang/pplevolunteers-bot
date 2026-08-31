/**
 * ตรวจว่าหน้านี้ถูกเปิดอยู่ใน "มินิเบราว์เซอร์" ของแอปแชต (Discord/LINE/FB/IG) หรือเปล่า
 *
 * ทำไมต้องรู้: มินิเบราว์เซอร์เก็บ cookie แยกจากเบราว์เซอร์จริงและมักลบทิ้งเมื่อปิด
 * → ล็อกอินแล้วก็ต้องล็อกอินใหม่ทุกครั้ง · แถม OAuth ยังพังซ้ำอีกชั้น:
 *   - Google บล็อก embedded webview ตรงๆ (disallowed_useragent) กดไม่ได้เลย
 *   - Discord OAuth ในมินิเบราว์เซอร์ของ Discord เอง มักโดนแอปดักลิงก์ discord.com
 *     ไปเปิดแอปตัวเอง แล้ว callback กลับมาไม่ถึงหน้าเดิม
 *
 * LINE แก้ที่ต้นทางได้ด้วย `?openExternalBrowser=1` (ดู lib/shareLink.js)
 * Discord/FB/IG ไม่มีท่าแบบนั้น — ต้องให้หน้าเว็บพาออกไปเอง
 *
 * ⚠️ ตรวจ 100% ไม่ได้ และไม่ควรพยายาม: false positive (หลอกว่าเป็นมินิเบราว์เซอร์
 * ทั้งที่อยู่ Chrome อยู่แล้ว) น่ารำคาญกว่าปัญหาที่แก้ → ตรวจเฉพาะร่องรอยที่ชัดเจนเท่านั้น
 * เคสที่ตรวจไม่เจอมีทางออกสำรองอยู่แล้ว = ลิงก์ "เปิดในเบราว์เซอร์อื่น" ที่โชว์ตลอดเวลา
 */

// Android WebView ฝัง token `; wv)` เสมอ — ครอบแอปแชตทุกตัวที่ใช้ WebView จริงบน Android
// (แอปที่ใช้ Chrome Custom Tabs จะรายงานตัวเป็น Chrome ปกติและ **ใช้ cookie ร่วมกับ Chrome อยู่แล้ว**
//  = ไม่มีปัญหาตั้งแต่แรก จึงไม่ต้องตรวจเจอ)
const ANDROID_WEBVIEW = /;\s*wv\)/

// ร่องรอยเฉพาะแอป — ตัวที่ประกาศชื่อตัวเองใน UA
const APP_MARKERS = [
  { re: /\bLine\//i,            app: 'LINE' },
  { re: /FBAN|FBAV|FB_IAB/i,    app: 'Facebook' },
  { re: /\bInstagram\b/i,       app: 'Instagram' },
  { re: /\bDiscord\b/i,         app: 'Discord' },
]

/**
 * @returns {{ inApp: boolean, app: string|null, android: boolean }}
 *   inApp   — มั่นใจว่าอยู่ในมินิเบราว์เซอร์
 *   app     — ชื่อแอปถ้าเดาได้ (เอาไว้เขียนคำแนะนำให้ตรงกับที่ผู้ใช้เห็นจริง)
 *   android — Android หรือเปล่า (ตัวเดียวที่บังคับเปิดเบราว์เซอร์ให้ได้)
 */
export function detectInAppBrowser(ua) {
  if (!ua) return { inApp: false, app: null, android: false }
  const android = /Android/i.test(ua)
  const marker  = APP_MARKERS.find(m => m.re.test(ua))
  const inApp   = !!marker || (android && ANDROID_WEBVIEW.test(ua))
  return { inApp, app: marker?.app || null, android }
}

/**
 * URL แบบ `intent://` ที่สั่ง Android ให้เปิดลิงก์ด้วยเบราว์เซอร์ ไม่ใช่ WebView ของแอปที่ถืออยู่
 *
 * ไม่ระบุ `package=` เจาะจง Chrome — เครื่องที่ไม่มี Chrome (หรือใช้ตัวอื่นเป็นค่าเริ่มต้น)
 * จะเปิดไม่ขึ้นเลย · ปล่อยว่างไว้ = Android เลือกเบราว์เซอร์เริ่มต้นของเครื่องให้เอง
 * `S.browser_fallback_url` กันกรณีไม่มีแอปไหนรับ intent เลย → กลับไปโหลด URL เดิมแทนหน้าเออเรอร์
 */
export function androidIntentUrl(url) {
  const u = new URL(url)
  const rest = `${u.host}${u.pathname}${u.search}`
  return `intent://${rest}#Intent;scheme=${u.protocol.replace(':', '')};` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end`
}
