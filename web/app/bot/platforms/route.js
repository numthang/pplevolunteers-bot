// /bot/platforms — ย้ายไป /org/settings/social แล้ว (2026-08-09)
//
// บัญชีโซเชียล + app creds เป็นของ org ไม่ใช่ของ Discord guild → ย้ายไปอยู่กับ settings ของ org
// URL เดิมยังมีคนบุ๊กมาร์ก + ข้อความ error/แจ้งเตือนของบอทเก่าชี้มาที่นี่ → คงไว้เป็นตัวส่งต่อ
// (เป็น Route Handler ไม่ใช่ page เพราะต้องพก query string เดิมไปด้วย — ปุ่ม OAuth callback
//  เด้งกลับมาพร้อม ?connected= / ?error= ซึ่งหน้าปลายทางใช้ขึ้น banner)
import { NextResponse } from 'next/server'
import { BASE_URL } from '@/lib/baseUrl.js'

export async function GET(req) {
  const { search } = new URL(req.url)
  // ⛔ ห้ามใช้ req.url เป็น base — หลัง reverse proxy จะได้ origin ภายในแล้วเด้งไป localhost
  return NextResponse.redirect(new URL(`/org/settings/social${search}`, BASE_URL))
}
