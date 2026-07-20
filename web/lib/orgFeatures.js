// org-native features — feature ที่ scope ด้วย org_id (ใช้ได้แม้ org ไม่มี guild)
// เพิ่ม feature org-native ตัวใหม่ = เพิ่มใน ORG_FEATURES แล้วมันโผล่ในหน้า "ฟีเจอร์" + Nav เอง
// ⚠️ guild-based features (calling/docs/cases/media) เปิดปิดที่ /bot/features per-guild ไม่อยู่ที่นี่
import { getOrgConfig } from '@/db/orgConfig.js'

export const ORG_FEATURES = [
  { key: 'finance', label: 'การเงิน', desc: 'บัญชี รายรับ-รายจ่าย รายงาน' },
  { key: 'calling', label: 'โทรอาสา', desc: 'แคมเปญโทร ผู้ติดต่อ (CRM) สถิติการโทร' },
]

export const ORG_FEATURE_KEYS = ORG_FEATURES.map(f => f.key)

// feature org-native ที่เปิดอยู่ของ org · default = เปิดทุกตัว · [] = ปิดหมด (ตั้งใจได้)
export async function getOrgEnabledFeatures(orgId) {
  const raw = await getOrgConfig(orgId, 'enabled_features')
  if (raw === null) return [...ORG_FEATURE_KEYS]
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return [...ORG_FEATURE_KEYS]
    return arr.filter(k => ORG_FEATURE_KEYS.includes(k))
  } catch {
    return [...ORG_FEATURE_KEYS]
  }
}
