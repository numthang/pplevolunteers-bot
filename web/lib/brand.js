// สะพานไป config/brand.js ที่ root (ไฟล์เดียวที่ข้ามขอบ web/ → repo root)
// ฝั่ง web import จากที่นี่เสมอ: import { BRAND_NAME } from '@/lib/brand.js'
import brand from '../../config/brand.js'

export const BRAND_NAME = brand.BRAND_NAME
export const BRAND_DOMAIN = brand.BRAND_DOMAIN
