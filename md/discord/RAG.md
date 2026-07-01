# RAG AI — Bot Mention Reply

Bot ตอบเมื่อถูก mention ในทุกห้อง โดยใช้ข้อมูลจาก forum Discord เป็น context เสริม

---

## Flow (v1 — Simple)

```
User พิมพ์ @bot <คำถาม>
  → messageCreate event
  → เช็ค rate limit (1 นาที/user + 100 queries/guild/day — in-memory)
  → เช็ค feature toggle ai_mention (dc_guild_config)
  → นำคำถามทั้งประโยคไปค้น Meilisearch ตรงๆ (keyword match)
  → ได้ top 3 forum posts ที่ match (ไม่ filter วันที่)
  → ตัด content แต่ละ post ที่ 800 chars
  → ดึง 10 messages ก่อนหน้าใน channel เป็น conversation context
  → callAI(systemPrompt, forum context + conversation + คำถาม) → Claude API
  → message.reply(answer)
```

### จุดที่ retrieval ไม่ intelligent

- Meilisearch ทำ **keyword matching (BM25)** — หาคำที่ตรงกันตัวต่อตัว
- ถามว่า "งานเดือนหน้า" → search keyword "งาน เดือนหน้า" → อาจไม่เจอ post ที่พูดถึง "กิจกรรมเดือนกรกฎา"
- ถามแบบ paraphrase หรือใช้คำต่างกัน → miss ได้
- **Claude (generation) intelligent แต่ retrieval ไม่ใช่** — ถ้าดึงมาผิดตั้งแต่แรก Claude ก็ตอบผิด

---

## Roadmap ปรับปรุง Retrieval

### Level 2 — Query Rewriting
ก่อนค้น Meilisearch ให้ Claude สรุป keyword จากคำถามก่อน:
```
คำถาม: "งานเดือนหน้ามีอะไรบ้าง ผมอยากไปช่วย"
Claude สกัด keywords: "กิจกรรม กรกฎาคม อาสา"
ค้น Meilisearch ด้วย keywords ที่ได้
```
ข้อเสีย: เพิ่ม 1 API call ต่อ query = แพงขึ้น + ช้าขึ้น

### Level 3 — Semantic Search (pgvector)
แปลงคำถามเป็น vector → หา forum posts ที่ใกล้เคียงเชิงความหมาย
ไม่สนคำ ดูความหมาย → "วิทยากร" match "ผู้บรรยาย" ได้
ต้องการ: embedding model + pgvector extension + backfill ทุก doc

### Level 4 — Hybrid
keyword + semantic ควบคู่ → merge ผล → ดีสุด ซับซ้อนสุด

---

## บุคลิก Bot

- เหมือนทีมงานคนนึงที่กำลังคุยอยู่ในกระทู้
- ภาษา casual ไม่ formal
- ตอบสั้นตรงประเด็น
- ถ้าไม่มีข้อมูลใน forum ก็ตอบจาก general knowledge ได้เลย

System prompt:
```
คุณคือบอทช่วยงานของทีมอาสาประชาชน คุยเป็นกันเองเหมือนเพื่อนร่วมทีม
ภาษา casual ได้เลย ไม่ต้องเป็นทางการ ตอบสั้นตรงประเด็น
ถ้ามีข้อมูลจากกระทู้ Discord ให้อ้างอิงได้ ถ้าไม่มีก็ตอบจากความรู้ทั่วไปได้เลย
```

---

## Feature Toggle

- key: `ai_mention`
- เก็บใน `dc_guild_config` → `enabled_features` (json array เหมือน calling/contacts)
- เปิด/ปิดที่ `/bot/features` — ระบบเดิม ไม่ต้องสร้างใหม่
- default: off

---

## ไฟล์ที่ต้องแก้/สร้าง

### 1. `services/meilisearch.js` — เพิ่ม `searchPostsWithContent`

เหมือน `searchPosts` แต่คืน content เต็ม ไม่ crop:

```js
async function searchPostsWithContent(keyword, { guildId, channelId, limit = 5 } = {}) {
  // attributesToRetrieve: ['id', 'post_name', 'post_url', 'content']
  // ไม่มี attributesToCrop / cropLength
}
```

### 2. `services/ragSearch.js` — ใหม่

```js
const { searchPostsWithContent } = require('./meilisearch');

const MAX_CONTENT_PER_POST = 600; // chars
const MAX_POSTS = 5;

async function buildRagContext(question, guildId) {
  const results = await searchPostsWithContent(question, { guildId, limit: MAX_POSTS });
  if (!results.length) return null;
  return results
    .filter(r => r.content?.trim())
    .map(r => `กระทู้: ${r.post_name}\n${r.content.slice(0, MAX_CONTENT_PER_POST)}`)
    .join('\n\n---\n\n');
}

module.exports = { buildRagContext };
```

### 3. `services/aiSummarize.js` — export `callAI`

```js
// เพิ่ม callAI เข้า module.exports
module.exports = { processMessages, processText, callAI, MAX_MESSAGES };
```

### 4. `index.js` — mention handler ใน messageCreate

```js
// เพิ่ม import บนสุด
const { buildRagContext } = require('./services/ragSearch');
const { callAI } = require('./services/aiSummarize');
const { getEnabledFeatures } = require('./web/lib/...'); // หรือ query dc_guild_config ตรง

// ใน messageCreate — วางก่อน guild check
if (!message.author.bot && message.guild && message.mentions.has(client.user)) {
  const features = await getEnabledFeatures(message.guildId);
  if (!features.includes('ai_mention')) return;

  const question = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!question) { await message.reply('ถามมาได้เลยครับ 😊'); return; }

  await message.channel.sendTyping().catch(() => {});
  try {
    const context = await buildRagContext(question, message.guildId);
    const system = `คุณคือบอทช่วยงานของทีมอาสาประชาชน คุยเป็นกันเองเหมือนเพื่อนร่วมทีม ภาษา casual ได้เลย ตอบสั้นตรงประเด็น${context ? '\n\nมีข้อมูลจากกระทู้ Discord ที่เกี่ยวข้อง ใช้อ้างอิงได้ถ้าตรงกับคำถาม' : ''}`;
    const userContent = context
      ? `ข้อมูลจากกระทู้:\n${context}\n\nคำถาม: ${question}`
      : question;
    const answer = await callAI(system, userContent);
    await message.reply(answer);
  } catch (err) {
    console.error('[mentionAI]', err);
    await message.reply('ขอโทษครับ ตอบตอนนี้ไม่ได้ ลองใหม่อีกทีนะครับ 🙏');
  }
  return;
}
```

### 5. `/bot/features` page — global toggle

เพิ่ม `ai_mention` เข้า `TOGGLEABLE` + `FEATURE_META` (super admin only ตาม access ที่แก้แล้ว)

### 6. `/bot/forum` — NEW settings page (forum system settings)

หน้า settings ของ forum system โดยเฉพาะ — แยกออกจาก `/bot/features` ตาม pattern ที่แต่ละระบบมี settings ของตัวเอง

**config ที่อยู่ในนี้:**
- per-channel RAG toggle — channel ไหน include/exclude จาก RAG search
- เก็บใน `dc_guild_config` key `rag_excluded_channels` (JSON array of channel IDs)
- แสดง list forum channels ที่ index อยู่ + toggle เปิด/ปิด RAG ต่อ channel

**access:** guild admin (ไม่ใช่ super admin only — เพราะเป็น per-guild content config)

---

## ข้อสังเกต

- `getEnabledFeatures` อยู่ใน `web/lib/` — bot ไม่ได้ import จาก web โดยตรง ต้อง query `dc_guild_config` ตรงจาก bot หรือ extract fn ออกมา shared
- `callAI` ใช้ `getAgentConfig()` จาก DB — provider/model มาจาก backoffice AI config เหมือน feature อื่น ไม่ hardcode
- Discord message ที่มี mention หลายคน → `replace(/<@!?\d+>/g, '')` ล้างทุก mention ออกก่อนส่งเป็น question
