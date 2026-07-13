// Constant กลางของโมดูล cooking — ใช้ร่วมกันระหว่าง MenuForm (client) + AI gates prompt (server: gates-suggest, import)
// food_groups ผูกกับ logic matcher ตรงๆ ไม่ได้ทำ user-extensible เหมือน ingredients wiki — เก็บ static ไว้ที่นี่ที่เดียวพอ
// ⚠️ ไฟล์นี้ต้อง import ได้ทั้งฝั่ง client และ server (pure JS, ห้ามใส่ pool/DB import ที่นี่)

export const FOOD_GROUPS = [
  { token: 'protein', label: 'โปรตีน' },
  { token: 'veg', label: 'ผัก' },
  { token: 'carb', label: 'คาร์บ' },
  { token: 'dessert', label: 'ของหวาน' },
  { token: 'drink', label: 'เครื่องดื่ม' },
]

export const FOOD_GROUP_ENUM = FOOD_GROUPS.map((g) => g.token)

// gates.protein enum "ปกติ" มาจาก wiki (cooking_ingredients grp='protein') สดทุก request
// list นี้ใช้เป็น fallback เท่านั้น กันพังตอน query ว่าง/error — ดู getProteinEnum() ใน gates-suggest, import route
export const PROTEIN_ENUM_FALLBACK = ['pork', 'chicken', 'beef', 'shrimp', 'squid', 'fish', 'tofu']
