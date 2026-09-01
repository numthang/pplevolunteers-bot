/**
 * โลโก้หัวจดหมายร้องเรียน — เรขาคณิตกลางที่ generateComplaintLetter.js ใช้เป็นขนาดแสดงผล
 *
 * ไม่ผูกกับ document.xml ของเทมเพลตอีกแล้ว (เดิมเคยฝังตายในตาราง ต้องให้ build script คุมขนาด)
 * ตอนนี้ {%LOGO} ในเทมเพลตเป็นแค่ tag เปล่า — docxtemplater-image-module-free แทรกรูปตอน render
 * และกำหนดขนาดแสดงผลจาก LOGO_BOX_*_EMU ตรงๆ ไม่ผ่านกรอบตารางใดๆ
 * → ค่านี้ยังทำหน้าที่เดิม (กรอบมาตรฐานที่ทุกโลโก้ต้องย่อลงก่อนแสดง) แค่ควบคุมตอน render แทนตอนฝัง
 *
 * วิธี normalize: fit:contain บนผืนโปร่งใสขนาดกรอบ → สัดส่วนจริงคงอยู่ ส่วนที่เหลือเป็นที่ว่าง
 * ค่ากรอบตั้งจากตราพรรค (3246×2812 ≈ 1.154) จึงพอดีไม่มีขอบว่างสำหรับค่าเริ่มต้น
 * (ค่าเดิมสืบมาจากกล่องตารางของเทมเพลตเก่า — ปรับ EMU ตรงนี้ได้ถ้าดูใหญ่/เล็กไปในเทมเพลตใหม่)
 */
import sharp from 'sharp'

/** EMU — หน่วยของ docx · 914400 EMU = 1 นิ้ว · สูง 800100 ≈ 2.22 ซม. */
export const LOGO_BOX_H_EMU = 800100
export const LOGO_BOX_W_EMU = 923570

/** พิกเซลที่ฝังจริง — สูง 320px พอสำหรับภาพ 2.2 ซม. บนกระดาษ ไม่ต้องใหญ่กว่านี้ */
export const LOGO_PX_H = 320
export const LOGO_PX_W = Math.round(LOGO_PX_H * (LOGO_BOX_W_EMU / LOGO_BOX_H_EMU))

/**
 * ย่อรูปใดๆ ให้ลงกรอบมาตรฐาน แล้วคืน PNG พร้อมฝังใน docx
 * (พื้นหลังโปร่งใส — โลโก้ที่ไม่ตรงสัดส่วนกรอบจะมีที่ว่าง ไม่ถูกยืด)
 */
export async function normalizeLetterLogo(input) {
  return sharp(input)
    .resize(LOGO_PX_W, LOGO_PX_H, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer()
}
