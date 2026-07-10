import { normalizeMenuInput } from '@/lib/cookingMenu.js'

// AI import: ใส่ชื่ออาหาร → Haiku ร่างสูตร simple + gates ครบ → คืน menu (ยังไม่ save)
// ผู้ใช้รีวิว/แก้ใน MenuForm ก่อนกดบันทึกเอง (form เป็น safety net ของ gates)
// ⚠️ gates คือหัวใจ matcher — prompt บังคับให้ Haiku คืน gates.protein (enum) + gates.key เสมอ
// ลอก pattern raw fetch จาก app/api/cooking/chat/route.js (ไม่ใช้ SDK) · model = Haiku (ถูก)

const PROTEIN_ENUM = ['pork', 'chicken', 'beef', 'shrimp', 'squid', 'fish', 'tofu']

const SYSTEM = `คุณเป็นผู้ช่วยสร้างข้อมูลเมนูอาหารไทย/ทั่วไปแบบ simple จากชื่อเมนูที่ผู้ใช้ให้มา
ตอบกลับเป็น JSON ออบเจ็กต์เดียวเท่านั้น ห้ามมีข้อความอื่นนอก JSON ห้ามใส่ \`\`\`

รูปแบบ JSON (ทุก field ต้องมี):
{
  "name": "ชื่อเมนู (ภาษาไทย)",
  "food_groups": ["protein","veg"],        // เลือกจาก: protein, veg, carb, dessert, drink
  "protein": ["chicken"],                    // โปรตีนที่ใช้ เลือกจาก enum ด้านล่าง (ว่างได้ถ้าเป็นมังสวิรัติ)
  "method": "ผัด",                            // วิธีทำสั้นๆ เช่น ผัด/ต้ม/ทอด/แกง/ย่าง
  "cuisine": "ไทย",
  "flavor": ["เผ็ด"],                          // รสชาติเด่น
  "carb_in_dish": false,                      // true ถ้าเป็นจานเดียวมีข้าว/เส้นในตัว (ข้าวผัด/ผัดไทย)
  "ingredients": { "core": ["..."], "optional": ["..."] },  // วัตถุดิบหลัก/เสริม ภาษาไทย
  "steps": ["ขั้นตอน 1","ขั้นตอน 2"],          // 2-5 ขั้นตอนสั้นๆ
  "gates": {
    "protein": ["chicken"],                   // ⚠️สำคัญ: โปรตีนที่เป็นตัวตัดสินว่าทำได้ไหม — enum: ${PROTEIN_ENUM.join(', ')}
    "key": ["ใบกะเพรา"]                        // ⚠️สำคัญ: ของเฉพาะที่ขาดไม่ได้ 0-3 อย่าง (ชื่อไทย เช่น ใบกะเพรา, กะทิ, ผงกะหรี่). ไม่มีก็ []
  },
  "image": { "emoji": "🍲", "url": null }      // emoji ที่สื่อถึงเมนู
}

กติกา gates (ห้ามพลาด):
- gates.protein ต้องเป็น subset ของ enum เท่านั้น: ${PROTEIN_ENUM.join(', ')} — ถ้าเมนูใช้หมูสับให้ใส่ "pork" ไม่ใช่ "หมู"
- ใส่ gates.protein อย่างน้อย 1 ตัวเสมอ ถ้าเมนูมีเนื้อสัตว์ — เว้นแต่มังสวิรัติจริงๆ (ใช้ tofu ถ้ามีเต้าหู้)
- gates.key = เฉพาะวัตถุดิบที่ "ขาดแล้วทำเมนูนี้ไม่ได้" เท่านั้น (0-3 อย่าง) ไม่ใช่วัตถุดิบทั่วไป`

export async function POST(req) {
  const { name } = await req.json().catch(() => ({}))
  const dish = (name || '').trim()
  if (!dish) return Response.json({ error: 'ต้องมีชื่อเมนู' }, { status: 400 })

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: `สร้างข้อมูลเมนู: ${dish}` }],
    }),
  })

  if (!aiRes.ok) {
    const errText = await aiRes.text()
    console.error('[cooking/import] AI error:', aiRes.status, errText)
    return Response.json({ error: 'สร้างเมนูไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 })
  }

  const aiJson = await aiRes.json()
  const text = aiJson.content?.[0]?.text || ''

  // เผื่อ Haiku ใส่ ```json ครอบมา — ดึงเฉพาะก้อน JSON แรก
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    console.error('[cooking/import] no JSON in reply:', text.slice(0, 300))
    return Response.json({ error: 'สร้างเมนูไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 })
  }

  let parsed
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return Response.json({ error: 'สร้างเมนูไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 })
  }

  // sanitize ผ่าน normalizer เดียวกับ CRUD + กรอง gates.protein ให้อยู่ใน enum
  const { menu, error } = normalizeMenuInput(parsed)
  if (error) return Response.json({ error }, { status: 502 })
  menu.gates.protein = menu.gates.protein.filter((p) => PROTEIN_ENUM.includes(p))

  return Response.json({ menu })
}
