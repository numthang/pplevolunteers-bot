// AI bulk-parse: "น้ำตาล, ถั้วแดง, ถั้วดำ" → แก้คำผิดไทย + แยกเป็นรายการ + จัดหมวด (ยังไม่ save)
// ลอก pattern raw fetch จาก app/api/cooking/import/route.js (ไม่ใช้ SDK) · model = Haiku (ถูก)
// ผู้ใช้รีวิว/แก้ใน CookingClient ก่อนกดเพิ่มทั้งหมดเอง (ยิงเข้า POST /api/cooking/ingredients ทีละอัน)

const GROUPS = ['protein', 'veg', 'starch', 'dairy', 'seasoning']

const SYSTEM = `คุณช่วยแยกรายการวัตถุดิบที่ผู้ใช้พิมพ์มาเป็นก้อนเดียว (คั่นด้วยจุลภาค) ให้เป็นรายการแยก
พร้อมแก้คำผิดภาษาไทย (วรรณยุกต์ผิด/ตัวสะกดตก) และจัดหมวดแต่ละคำ

ตอบเป็น JSON array เท่านั้น ห้ามมีข้อความอื่นนอก JSON ห้ามใส่ \`\`\`
รูปแบบ: [{ "label": "ชื่อที่แก้คำผิดแล้ว", "grp": "protein" }, ...]

กติกา:
- label = ชื่อไทยที่สะกดถูกต้อง (แก้วรรณยุกต์/ตัวสะกดผิดให้ แต่ห้ามเปลี่ยนความหมายของคำ)
- grp ต้องเป็นหนึ่งใน 5 หมวดนี้เท่านั้น:
  - protein = เนื้อสัตว์/อาหารทะเล/ไข่/เต้าหู้/ถั่วเมล็ดแห้งที่กินเป็นโปรตีน (เช่น ถั่วดำ ถั่วแดง ถั่วลิสง ถั่วชิกพี)
  - veg = ผักสด/ผลไม้/เห็ด
  - starch = แป้ง/ธัญพืช/เส้นทุกชนิด/ข้าว/ขนมปัง
  - dairy = ผลิตภัณฑ์นม/ไขมันจากสัตว์ (นม ชีส เนย ครีม โยเกิร์ต) — ไม่รวมน้ำมันพืช
  - seasoning = เครื่องปรุงรส/ซอส/เครื่องเทศ/สมุนไพรแห้ง/ผักสวนครัวที่ใช้เป็นเครื่องปรุง (หอม กระเทียม พริก) และของหมักดอง
- คงจำนวนและลำดับรายการตามที่ผู้ใช้พิมพ์มา ห้ามรวมหรือแยกคำเพิ่ม`

export async function POST(req) {
  const { text } = await req.json().catch(() => ({}))
  const items = (text || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!items.length) return Response.json({ error: 'ไม่มีรายการ' }, { status: 400 })

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: items.join(', ') }],
    }),
  })

  if (!aiRes.ok) {
    const errText = await aiRes.text()
    console.error('[cooking/ingredients/bulk] AI error:', aiRes.status, errText)
    return Response.json({ error: 'แยกรายการไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 })
  }

  const aiJson = await aiRes.json()
  const raw = aiJson.content?.[0]?.text || ''

  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) {
    console.error('[cooking/ingredients/bulk] no JSON in reply:', raw.slice(0, 300))
    return Response.json({ error: 'แยกรายการไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 })
  }

  let parsed
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return Response.json({ error: 'แยกรายการไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 })
  }

  const out = (Array.isArray(parsed) ? parsed : [])
    .filter(i => i && typeof i.label === 'string' && i.label.trim() && GROUPS.includes(i.grp))
    .map(i => ({ token: i.label.trim(), label: i.label.trim(), grp: i.grp }))

  if (!out.length) return Response.json({ error: 'แยกรายการไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 502 })

  return Response.json({ items: out })
}
