# SPEC — AI Thread Summarizer

## Objective

Context menu บน Discord thread — ให้ AI สรุปหรือเขียนโพสต์จากการสนทนาทั้งเธรด แล้วส่งเป็น caption เข้าตะกร้าสื่อเพื่อโพสต์ต่อ

Target user: admin/editor ที่ต้องการสรุปหรือเขียนโพสต์จากการสนทนาใน Discord

---

## User Flow

```
1. right-click ข้อความในเธรด → "🤖 AI สรุป"
2. modal เปิด → เลือก mode (📋 สรุปประเด็น / 📣 โพสต์ Social)
3. bot fetch ทั้งเธรด → ส่งให้ AI
4. ephemeral reply แสดง AI output
5. กด [➕ เพิ่มเป็น caption] → setCaption() → ตะกร้าสื่อ
6. ไป edit caption ต่อใน basket view แล้วโพสต์
```

---

## config/aiModes.js — Mode Registry (extensible)

```js
module.exports = [
  {
    value: 'summary',
    label: '📋 สรุปประเด็น',
    prompt: 'สรุปเป็นภาษาไทย กระชับ ชัดเจน ใช้ bullet points',
  },
  {
    value: 'social_post',
    label: '📣 โพสต์ Social',
    prompt: 'เขียนโพสต์ลงโซเชียลมีเดียจากเนื้อหานี้ ให้ 2 เวอร์ชัน: (1) Social (Facebook/IG) — สั้น กระชับ มี emoji (2) Discord — ยาวกว่าได้ มี markdown',
  },
  // เพิ่ม mode ใหม่ที่นี่ที่เดียว → redeploy commands
];
```

---

## Architecture — No Duplication

```
commands/ai-thread-context-menu.js   ← context menu command (ใหม่)
handlers/aiThreadHandler.js          ← modal + button interactions (ใหม่)
         ↓
services/fetchMessages.js   ← extract จาก commands/message.js
services/aiSummarize.js     ← มีอยู่แล้ว (แก้ให้รับ mode)
config/aiModes.js           ← mode definitions (ใหม่)
db/mediaBasket.js           ← setCaption() ใช้ของเดิม ไม่แตะ
```

---

## Files

| File | Action |
|---|---|
| `config/aiModes.js` | สร้างใหม่ |
| `services/fetchMessages.js` | สร้างใหม่ — extract fetchAllMessages, serializeMessage จาก message.js |
| `services/aiSummarize.js` | แก้ — รับ mode parameter |
| `commands/ai-thread-context-menu.js` | สร้างใหม่ |
| `handlers/aiThreadHandler.js` | สร้างใหม่ — select mode + button add caption |
| `commands/message.js` | แก้ — import service + เพิ่ม option `ai` (raw file ยังได้เหมือนเดิม) |
| `index.js` | แก้ — route select `ai_thread_mode` + button `ai_thread_caption:` |
| `db/mediaBasket.js` | ไม่แตะ |

---

## Constraints

- fetch สูงสุด 500 ข้อความล่าสุด (token guard)
- model: `claude-haiku-4-5-20251001`, max_tokens: 1024
- AI output ≤ 1800 chars ใน reply (Discord limit)
- caption ต้องอยู่ใน channel เดียวกับตะกร้าสื่อ

---

## Two entry points (ใช้ services ร่วมกัน)

| | `/message fetch ai:<mode>` | context menu "🤖 AI สรุปเธรด" |
|---|---|---|
| target | channel (ระบุ id ได้) | เธรดที่ right-click |
| output | AI text + **raw file** | AI text + ปุ่ม **➕ caption** |

## Out of Scope

- Feature บรรณาธิการ (editorial) — ยัง design ไม่นิ่ง คุยต่อ session หน้า
- บันทึก AI output ลง DB
