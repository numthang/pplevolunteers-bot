import pool from '@/db/index.js'
import { headers } from 'next/headers'

/**
 * logLogin({ provider, outcome, userId?, identity?, meta?, req? })
 *
 * บันทึกทุกความพยายาม login ลง auth_login_events — **ทั้งที่สำเร็จและไม่สำเร็จ**
 * เหตุที่ต้องจดฝั่งไม่สำเร็จด้วย: ประตู login หลายทางถูกออกแบบให้ "เงียบ" เพื่อกัน enumeration
 * (เบอร์ไม่มีเจ้าของ → genericOk() · magic token หมดอายุ → คืน null) → user บอกว่าเข้าไม่ได้
 * แต่ไล่ย้อนไม่ได้เลยสักทาง นี่คือตาที่หายไป
 *
 * ⚠️ fire-and-forget — INSERT ไม่ await และไม่ throw (log ล้มต้องไม่ทำให้ login ล่ม)
 *    แต่ไม่กลืนเงียบ: error โผล่ใน console เสมอ (บทเรียนจาก auditLog.js)
 *
 * `await` ที่ caller ใส่ครอบแค่การอ่าน header เท่านั้น ไม่ได้รอ DB
 */

const OUTCOME_MAX = 30

export async function logLogin({ provider, outcome, userId = null, identity = null, meta = null, req = null }) {
  const { ip, ua } = await reqMeta(req)
  pool.query(
    `INSERT INTO auth_login_events (provider, outcome, user_id, identity, ip, user_agent, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      String(provider || 'unknown').slice(0, 20),
      String(outcome || 'unknown').slice(0, OUTCOME_MAX),
      userId || null,
      identity ? String(identity).slice(0, 255) : null,
      ip,
      ua,
      meta ? JSON.stringify(meta) : null,
    ]
  ).catch(err => console.error('[auth-log] เขียนไม่สำเร็จ', { provider, outcome }, err.message))

  // retention 90 วัน — สุ่มลบแทนการตั้ง cron (โอกาส 1%: ปริมาณ login ต่อวันน้อย ไม่ต้องรีบ)
  if (Math.random() < 0.01) {
    pool.query(`DELETE FROM auth_login_events WHERE at < NOW() - INTERVAL '90 days'`).catch(() => {})
  }
}

/**
 * ดึง ip/user-agent — รับได้ทั้งจาก Request ที่ route ถืออยู่ และจาก headers() ของ Next
 * (NextAuth callback ไม่มี req ให้ → ต้องพึ่ง headers() ซึ่งอ่านได้เพราะยังอยู่ใน request scope เดียวกัน)
 *
 * ip ต้องอ่านจาก x-forwarded-for เท่านั้น — prod อยู่หลัง reverse proxy
 * ถ้าอ่านไม่ได้ก็ปล่อย null ไป ห้ามให้ throw ขึ้นไปทำ login พัง
 */
export async function reqMeta(req = null) {
  try {
    const h = req?.headers ?? (await headers())
    const fwd = (h.get('x-forwarded-for') || '').split(',')[0].trim()
    return {
      ip: (fwd || h.get('x-real-ip') || '').trim().slice(0, 64) || null,
      ua: (h.get('user-agent') || '').slice(0, 500) || null,
    }
  } catch {
    return { ip: null, ua: null }
  }
}
