import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, context } = await req.json()
  if (!Array.isArray(messages) || !messages.length) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  const available = (context?.available || []).join(', ') || 'ไม่มีข้อมูล'
  const menu = context?.menu || 'ยังไม่มีเมนูที่แนะนำ'

  const system = `คุณเป็นผู้ช่วยตัดสินใจว่าจะทำอะไรให้ลูกกิน โดยอิงจากคลังเมนูของ user
ตอบกระชับ เป็นภาษาไทย แนะนำหรือปรับเมนูจากของที่มีในครัวเท่านั้น ไม่ต้องทักทายยาว

ของที่มีในครัวตอนนี้: ${available}
เมนูที่ระบบแนะนำอยู่ตอนนี้: ${menu}`

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system,
      messages,
    }),
  })

  if (!aiRes.ok) {
    const errText = await aiRes.text()
    console.error('[cooking/chat] AI error:', aiRes.status, errText)
    return Response.json({ error: 'AI ไม่สำเร็จ' }, { status: 500 })
  }

  const aiJson = await aiRes.json()
  const reply = aiJson.content?.[0]?.text || ''

  return Response.json({ reply })
}
