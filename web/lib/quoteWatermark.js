/**
 * ลายน้ำที่การ์ดคำคม **แบบไม่มีรูป** เอาไปทำลายพื้น (สไตล์ `plain-logo`)
 *
 * ทำไมแยกไฟล์: route ทั้งคู่ (preview + บันทึกจริง) ต้องแปลง `wmType` จากฟอร์มเป็น path
 * เหมือนกันเป๊ะ · วางไว้ที่เดียวกันไม่ให้ 2 เส้นตรวจสิทธิ์คนละแบบ (เส้นหนึ่งหลวมกว่า = ช่องโหว่)
 *
 * ⚠️ ตรวจกับ whitelist เสมอ (`resolveAnyWatermarkPath`) — `wmType` มาจาก client
 *    ปล่อยผ่านคือเปิดให้อ่านไฟล์อะไรก็ได้บนเครื่องผ่าน path traversal
 */
import { publisherIdentity } from './publishTargets.js'
import { resolveAnyWatermarkPath } from './watermarks.js'
import { QuoteRenderError } from './quoteRender.js'

/**
 * @param {string|null} wmType  ค่า `path:<กลุ่ม>/<ไฟล์>` จากฟอร์ม
 * @param {{session:object, orgId:number}} ctx  context จาก postContext()
 * @returns {Promise<string|null>} path สัมบูรณ์ · null = ไม่ได้เลือกลายน้ำ (renderer ตกเป็นพื้นสีล้วน)
 */
export async function resolvePlainWatermark(wmType, ctx) {
  if (!wmType) return null
  const { userId, discordId } = await publisherIdentity(ctx.session)
  const path = await resolveAnyWatermarkPath(wmType, { orgId: ctx.orgId, userId, discordId })
  if (path === undefined) throw new QuoteRenderError('ลายน้ำที่เลือกใช้ไม่ได้')
  return path
}
