import { BRAND_DOMAIN } from './brand.js'

// URL ของเว็บ — source of truth คือ .env (NEXTAUTH_URL) · fallback ตาม BRAND_DOMAIN
// ใช้กับ OAuth redirect_uri ทุกเจ้า (Meta, X, LINE, Google) → เปลี่ยน domain แก้ .env ที่เดียว
export const BASE_URL = process.env.NEXTAUTH_URL || `https://${BRAND_DOMAIN}`
