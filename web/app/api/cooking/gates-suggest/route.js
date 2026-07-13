import pool from '@/db/index.js'
import { resolveOwner } from '@/lib/cookingOwner.js'
import { FOOD_GROUP_ENUM, PROTEIN_ENUM_FALLBACK } from '@/lib/cookingConstants.js'

// เดา gates (เงื่อนไขวัตถุดิบ) ให้เมนู จากชื่อ + วัตถุดิบหลัก — ใช้ในฟอร์มแก้เมนู (ปุ่ม "ให้ AI เติม")
// ลอก pattern raw fetch Haiku จาก app/api/cooking/import/route.js · ต้อง login (เป็นส่วนของ flow แก้เมนู)

// PROTEIN_ENUM ดึงจาก wiki (cooking_ingredients grp='protein') สดทุก request
// เพิ่มโปรตีนใหม่ในหน้า /cooking/ingredients แล้ว AI เห็น enum ใหม่ทันที ไม่ต้อง redeploy
// fallback เป็น list เดิม 7 ตัวถ้า query ว่าง/error (กันพัง)
async function getProteinEnum() {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT token FROM cooking_ingredients WHERE grp = 'protein' ORDER BY token`
    )
    const tokens = rows.map((r) => r.token)
    return tokens.length ? tokens : PROTEIN_ENUM_FALLBACK
  } catch (err) {
    console.error('[cooking/gates-suggest] protein enum query failed:', err)
    return PROTEIN_ENUM_FALLBACK
  }
}

function buildSystem(proteinEnum) {
  return `คุณเป็นผู้ช่วยกำหนด "หมู่อาหาร + เงื่อนไขวัตถุดิบ (gates)" ของเมนูอาหาร จากชื่อเมนู + วัตถุดิบที่ให้มา
ตอบกลับเป็น JSON ออบเจ็กต์เดียวเท่านั้น ห้ามมีข้อความอื่นนอก JSON ห้ามใส่ \`\`\`

รูปแบบ:
{
  "food_groups": ["protein","veg"],  // หมู่อาหาร enum: ${FOOD_GROUP_ENUM.join(', ')}
  "flavor": ["เผ็ด"],                  // รสชาติเด่น ภาษาไทย 1-3 คำ เช่น เผ็ด, เค็ม, หวาน, เปรี้ยว, มัน, จืด
  "protein": ["chicken"],            // โปรตีนที่เป็นตัวตัดสินว่าทำเมนูนี้ได้ไหม — enum เท่านั้น: ${proteinEnum.join(', ')}
  "key": ["ใบกะเพรา"]                 // ของเฉพาะที่ขาดไม่ได้ 0-3 อย่าง (ชื่อไทย) ไม่มีก็ []
}

กติกา:
- food_groups: จานคาวมีเนื้อ→ใส่ "protein" (มีผักด้วยก็ ["protein","veg"]) · ของหวาน→["dessert"] · เครื่องดื่ม→["drink"] · จานผักล้วน/แป้งล้วน→ใส่ veg/carb ตามจริง
- flavor: รสเด่นของจาน 1-3 คำ (ไทย) เช่น เผ็ด/เค็ม/หวาน/เปรี้ยว/มัน/จืด
- protein ต้องเป็น subset ของ enum เท่านั้น (หมูสับ→"pork" ไม่ใช่ "หมู") · มีเนื้อสัตว์ให้ใส่อย่างน้อย 1 · มังสวิรัติที่มีเต้าหู้ใช้ "tofu" · ไม่มีโปรตีนเลยก็ []
- key = เฉพาะวัตถุดิบที่ "ขาดแล้วทำเมนูนี้ไม่ได้" (0-3 อย่าง) ไม่ใช่ของทั่วไปอย่างน้ำมัน/กระเทียม/เกลือ/น้ำตาล`
}

export async function POST(req) {
  const { isAnon } = await resolveOwner()
  if (isAnon) return Response.json({ error: 'ต้อง login ก่อน' }, { status: 401 })

  const { name, ingredients } = await req.json().catch(() => ({}))
  const dish = (name || '').trim()
  if (!dish) return Response.json({ error: 'ใส่ชื่อเมนูก่อน' }, { status: 400 })
  const ingText = Array.isArray(ingredients) ? ingredients.join(', ') : ''

  const proteinEnum = await getProteinEnum()

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: buildSystem(proteinEnum),
      messages: [{ role: 'user', content: `เมนู: ${dish}\nวัตถุดิบ: ${ingText || '(ไม่ระบุ)'}` }],
    }),
  })

  if (!aiRes.ok) {
    const errText = await aiRes.text()
    console.error('[cooking/gates-suggest] AI error:', aiRes.status, errText)
    return Response.json({ error: 'เดา gates ไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 })
  }

  const aiJson = await aiRes.json()
  const text = aiJson.content?.[0]?.text || ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return Response.json({ error: 'เดา gates ไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 })

  let parsed
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return Response.json({ error: 'เดา gates ไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 })
  }

  const food_groups = Array.isArray(parsed.food_groups)
    ? parsed.food_groups.filter((g) => FOOD_GROUP_ENUM.includes(g))
    : []
  const flavor = Array.isArray(parsed.flavor)
    ? parsed.flavor.map((f) => String(f).trim()).filter(Boolean).slice(0, 3)
    : []
  const protein = Array.isArray(parsed.protein)
    ? parsed.protein.filter((p) => proteinEnum.includes(p))
    : []
  const key = Array.isArray(parsed.key)
    ? parsed.key.map((k) => String(k).trim()).filter(Boolean).slice(0, 3)
    : []

  return Response.json({ food_groups, flavor, protein, key })
}
