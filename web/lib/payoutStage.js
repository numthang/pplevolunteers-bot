/**
 * ขั้นของรอบจ่าย — ป้ายที่โชว์บนการ์ด (pure ทั้งไฟล์)
 *
 * ⚠️ **ไม่มีคอลัมน์ "ขั้น" ใน DB** — `finance_payout_rounds.status` ยังมีแค่ draft/exported/paid ตามเดิม
 *    ขั้นที่ละเอียดกว่านั้นคำนวณจากตัวเลขจริงของรายการในรอบ (user เคาะ 2026-09-19)
 *    เหตุผลที่ไม่เพิ่ม status ที่ 4: "แจ้งโอนแล้ว" เป็นผลรวมของการกดรายคน n ครั้ง กดซ้ำได้
 *    และบางคนแจ้งไม่ได้ถาวร → เก็บเป็นค่าเดี่ยวใน DB เมื่อไหร่ก็เพี้ยนจากความจริงเมื่อนั้น
 *
 * ⛔ รอบที่ไม่มีใครแจ้งได้เลย (คนนอกล้วน) ห้ามขึ้น "แจ้งโอนแล้ว" — notified >= notifiable
 *    เป็นจริงแบบว่างเปล่าตั้งแต่ 0 >= 0 ทั้งที่ไม่เคยส่ง DM สักฉบับ ดู stage 'paidAll'
 */

/**
 * @param {object} r  แถวจาก listRounds + notified_count/notifiable_count (ดู api/finance/payouts/route.js)
 * @returns {{key: string, tone: 'idle'|'wait'|'done', paid?: number, count?: number, cantNotify: number}}
 *   key       — ต่อเป็น locale key `payouts.stage.<key>`
 *   tone      — สีป้าย (idle เทา · wait เหลือง · done teal)
 *   cantNotify— จำนวนคนในรอบที่ DM ไม่ถึงเลย (คนนอก/ไม่ผูก Discord/ไม่มีเลขบัญชี)
 */
export function roundStage(r) {
  const count = Number(r?.item_count || 0)
  const paid = Number(r?.paid_count || 0)
  const notifiable = Number(r?.notifiable_count || 0)
  const notified = Number(r?.notified_count || 0)
  const cantNotify = Math.max(count - notifiable, 0)

  // ปิดรอบแล้ว = จบ ไม่ต้องรายงานความคืบหน้าอะไรอีก
  if (r?.status === 'paid') return { key: 'closed', tone: 'done', cantNotify }
  if (r?.status !== 'exported') return { key: 'draft', tone: 'idle', cantNotify }

  // exported แล้วแต่ไม่มีรายชื่อ — export ไฟล์เปล่าผ่านได้ (ไม่มีแถวให้ validate ตก) แล้วปิดรอบก็ไม่ได้
  if (!count) return { key: 'empty', tone: 'idle', cantNotify }

  if (paid === 0) return { key: 'ready', tone: 'wait', cantNotify }
  if (paid < count) return { key: 'paying', tone: 'wait', paid, count, cantNotify }

  // ติ๊กจ่ายครบทุกคนแล้ว — เหลือแค่เรื่องแจ้ง
  if (notifiable === 0) return { key: 'paidAll', tone: 'done', cantNotify }
  if (notified >= notifiable) return { key: 'notified', tone: 'done', cantNotify }
  return { key: 'waitNotify', tone: 'wait', cantNotify }
}
