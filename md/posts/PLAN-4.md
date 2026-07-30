# ก้อน 4 — ท่อโพสต์ร่วม (publishPipeline) + คิว/worker + รวมประวัติ

> แผนก่อนลงมือ · กติกาแม่บทอยู่ `md/posts/POSTS.md` §กติกาข้อ 16 ("posts ห้ามมี logic การโพสต์เป็นของตัวเอง")
> **ของจริงที่เสี่ยงที่สุดในโมดูลนี้** — แตะ `handlers/basketHandler.js` ที่ทีมสื่อใช้ทุกวัน

## เป้าหมาย (4 ข้อ ต้องจบพร้อมกัน ไม่งั้นได้ 2 ท่อที่ค่อยๆ เพี้ยน)

1. ยก logic การโพสต์ออกจาก `basketHandler` → `services/publishPipeline.js`
2. **ตะกร้าดิสฯ เปลี่ยนมาเรียกท่อใหม่ในรอบเดียวกัน** (ห้ามก๊อปแล้วปล่อยของเดิมไว้)
3. คิว + worker: เว็บเขียนแถว `post_social_history` → บอทวนหยิบไปยิง
4. รวมประวัติ: ย้าย `dc_media_history` → `post_social_history` แล้ว drop ตารางเก่า

## สภาพของเดิม (อ่านโค้ดจริงแล้ว 2026-07-29)

`processAndPost()` [basketHandler.js:690-929](../../handlers/basketHandler.js#L690) ทำ 4 อย่างปนกัน:
- **เตรียมสื่อ** — `fetchBuffer(discord_url)` → ติดลายน้ำ (`applyWatermark`) → webp→jpg
- **ยิงทีละแพลตฟอร์ม** — fb/ig/threads/x/news × (รูป | วิดีโอ) = 10 สาขา แต่ละสาขา try/catch เอง
- **รายงานความคืบหน้า** — `interaction.editReply()` แทรกอยู่ทุกขั้น (ผูก Discord แน่น)
- **สรุป + เขียนประวัติ** — `overallStatus` + `addHistory(platform: 'fb,ig,x')`

จุดที่ต้องระวัง: **วิดีโอส่ง Discord CDN URL ตรงๆ ให้ Meta ดึงเอง** (`videoDiscordUrl`) → เว็บใช้ทางนี้ไม่ได้ ต้องมี public URL ของตัวเอง

## รูปร่างที่จะทำ

### `services/publishPipeline.js` (ใหม่ — ของกลางที่ทั้งบอทและ worker เรียก)

```js
prepareImages(sources, { wmType, guildId, group, userId, onProgress })
  // sources = [{ url }] (ดิสฯ) | [{ path }] (เว็บ, storage/posts) → [{ buffer, ext }] + errors[]
publishOne({ platform, guildId, userDiscordId, accountId, images, videoUrl,
             caption, scheduleTime, group, guild, onProgress })
  // → { ok, url, raw, error } · **ที่เดียวที่รู้ว่าแต่ละแพลตฟอร์มเรียกฟังก์ชันไหน**
publishBatch({ platforms, ...เหมือนบน, episodeId, orgId, batchId, createdBy… })
  // loop publishOne → เขียน/อัปเดตแถว post_social_history 1 แถว/แพลตฟอร์ม → results[]
```
- `onProgress(msg)` เป็น callback — ดิสฯ ส่ง `editReply`, worker ส่ง `noop` → **pipeline ไม่รู้จัก interaction**
- `basketHandler` เหลือแค่: อ่านตะกร้า → เรียก `prepareImages`/`publishBatch` → **format ข้อความ Discord จาก `results`**

### param `accountId` (แตะ metaApi/xApi ได้แค่เรื่องนี้)
`getConfig(guildId, platform, userId, groupName)` → เพิ่ม `accountId = null` ต่อท้าย · มี `accountId` = `WHERE id = $accountId` (ยังต้องเช็ค org/guild ให้ตรง) · ไม่มี = พฤติกรรมเดิมเป๊ะ
ตามด้วย `postToFacebook/Instagram/Threads/X` + `postReels*` รับ `accountId` ต่อท้าย แล้วส่งต่อ `getConfig`

### worker (`services/publishWorker.js` — start จาก `index.js` เหมือน `startAnnounceWorker`)
- ทุก 30 วิ: `SELECT … WHERE status='pending' AND (scheduled_at IS NULL OR scheduled_at <= now()) FOR UPDATE SKIP LOCKED LIMIT 5`
- เลย `scheduled_at` เกิน **2 ชม.** → `stale` ไม่ยิง (grill ข้อ 15) · ยิงแล้ว fail → `attempts+1`, retry ≤3 แล้ว `failed`
- สื่อของเว็บอ่านจากดิสก์ `storage/posts/` (path relative จาก repo root — บอท cwd = repo root)

### ประวัติ (ย้าย + drop)
- ย้าย 10 แถว `dc_media_history` → `post_social_history` **แตกตาม comma** (`'fb,ig,x'` → 3 แถว, `batch_id` เดียวกัน)
- แมป: `image_count`/`video_count` → `media jsonb` · `posted_by` → `created_by_discord_id` · `schedule_time`(bigint) → `scheduled_at`(timestamptz) · `fb_url`/`ig_url`/… → `result jsonb`
- `getHistory()` ฝั่งบอทอ่านตารางใหม่ + **`GROUP BY batch_id`** (UI sticky แสดง 1 บรรทัด/ครั้งที่โพสต์ เหมือนเดิม)
- `addHistory()` ตายไป — `publishBatch` เป็นคนเขียนแทน

### ฝั่งเว็บ (ปุ่มโพสต์จริง)
- `POST /api/posts/[id]/publish` body `{ platforms[], accountId, scheduledAt?, wmType? }` → ต้อง `canPublishPost` → เขียน N แถว `pending` (batch เดียว) → 202
- `GET /api/posts/[id]/jobs` → สถานะรายแพลตฟอร์ม + ปุ่มลองใหม่ (`POST …/jobs/[jobId]/retry`)
- UI: กล่อง "เผยแพร่" ในคอลัมน์ขวาของหน้าแก้โพสต์ (เลือกบัญชี/แพลตฟอร์ม/เวลา) + ป้ายสถานะ

## ลำดับลงมือ (commit ทีละขั้น ย้อนได้)

1. `accountId` param ใน metaApi/xApi (additive ล้วน ของเดิมไม่เปลี่ยนพฤติกรรม) → smoke ตะกร้าเดิม
2. `publishPipeline.js` + **สลับ basketHandler มาเรียก** → smoke โพสต์จริงจากดิสฯ 1 ครั้ง
3. ย้ายประวัติ + `getHistory` ใหม่ + drop `dc_media_history`
4. worker + API เว็บ + UI ปุ่มเผยแพร่

## เคาะแล้ว 2026-07-29 เย็น (user)

- **ยุบ `dc_media_baskets` เข้า `post_episodes` — เอา** (กลับคำจากเช้า · เหตุผลที่เคยค้านตายไปแล้ว: ไม่มี series/seq · ไม่มี polymorphic parent)
  เหตุผลของ user: **"ระบบเดียว จัดการง่าย โพสต์ทางเว็บก็ได้ ดิสฯ ก็ได้ debug ง่าย"** — ไม่ใช่เรื่องฟีเจอร์
  ทำเป็น **ก้อน 4b หลังก้อน 4 จบ** (ทั้งคู่แก้ `basketHandler` ยกท่อออกก่อนแล้วค่อยสลับที่เก็บ)
- **`post_episodes.org_id` ต้อง nullable** — guild ที่ยังไม่ผูก org (NamWa/พันธมิตรชานม) ยังใช้ตะกร้าได้
  NULL = **โผล่แค่ใน Discord ไม่เข้าฟีดองค์กร** (เว็บกรองด้วย org_id อยู่แล้ว) · ห้ามมี fallback เส้นที่ 2
- **อนุมัติบังคับเฉพาะทางเว็บ** — ตะกร้าดิสฯ ยิงได้ทันทีเหมือนเดิม (วันนี้ก็ไม่มีด่าน การรวมตารางไม่ใช่เหตุให้เพิ่มด่าน)
- **backlink กลับห้องต้นทาง (user สั่ง)** — worker ยิงเสร็จส่งข้อความพร้อมลิงก์กลับห้องที่สั่ง
  เว็บล้วน → เลือกห้องตอนกดโพสต์ หรือ default ราย org (`posts_notify_channel`) · org ไม่มี Discord = ข้ามเงียบ
- **ล้างตะกร้า = archive โพสต์ + ปลดล็อกห้อง** (ลบแถวไม่ได้แล้ว มันคือคอนเทนต์) · โพสต์เสร็จก็ปลดล็อกห้อง
- **ตะกร้าที่เปิดอยู่ของห้อง = คอลัมน์บน `post_episodes` ไม่ใช่ตารางใหม่** — เคาะ 2026-07-30
  (⛔ ยกเลิก `post_basket_slots` / `dc_basket_slots` ที่เคยเขียนไว้ในแผนนี้ **ห้ามเอากลับมา**)
  ```sql
  ALTER TABLE post_episodes ADD COLUMN channel_id varchar(20);   -- NULL = โพสต์ที่เกิดบนเว็บ
  -- invariant: 1 ห้อง เปิดตะกร้าได้ทีละใบ — บังคับที่ DB ไม่ใช่ที่โค้ด
  CREATE UNIQUE INDEX uq_open_basket_per_channel ON post_episodes (channel_id)
    WHERE channel_id IS NOT NULL AND archived_at IS NULL;
  ```
  - อ่านตะกร้าของห้อง = `WHERE channel_id = $1 AND archived_at IS NULL` — **query เดียว ไม่ต้อง join**
  - ล้างตะกร้า = `archived_at = now()` → หลุดจาก unique index เอง ห้องว่างพร้อมเปิดใบใหม่
    **และยังรู้ว่าโพสต์เก่ามาจากห้องไหน** (ตารางแยกจะทิ้ง provenance นี้ตอนลบแถว slot)
  - **เหตุผลที่ล้มข้อเสนอตารางแยก** (user ค้านถูก): เป้าหมายของก้อนนี้คือ *ยุบ* ตาราง — ยุบ
    `dc_media_baskets` ไป 1 แล้วเพิ่มกลับ 1 = สุทธิเท่าเดิม แถวต้อง join สองที่ทุกครั้งที่บอทอ่านตะกร้า
    ขัดเหตุผลที่สั่งทำ 4c ("ระบบเดียว debug ง่าย") · และข้ออ้าง "channel_id เป็น Discord artifact
    ห้ามอยู่ตารางหลัก" ก็พัง เพราะ **`post_social_history` มี `guild_id`/`channel_id` อยู่แล้ว**
  - **เคสเดียวที่ต้องเขียนโค้ดรองรับ:** กู้โพสต์เก่าคืนจากกรุ ทั้งที่ห้องนั้นมีตะกร้าใหม่เปิดอยู่
    → unique index บล็อก · **ทางที่เลือก: กู้คืนโดยล้าง `channel_id` ทิ้ง** (กลายเป็นโพสต์บนเว็บธรรมดา)
    เงียบกว่าและไม่บล็อกคนใช้ ดีกว่าตอบ error ว่า "ห้องนั้นมีตะกร้าเปิดอยู่"

- **`post_episode_media.source_message_id`** (nullable varchar 20) — เก็บ · เหตุผล **เดียว** คือลิงก์
  `[ดูรูปชุดที่ N]` / `[ดูวิดีโอต้นทาง]` ในการ์ดตะกร้าที่ทีมใช้อยู่ + เป็นทางกลับถ้าไฟล์บนดิสก์หาย
  - **ไม่ได้ใช้กันลิงก์หมดอายุอีกแล้ว** — ตัวรีเฟรช (`services/discordAttachments.js`, ทำ 2026-07-30)
    ทำงานจาก URL ตรงๆ ไม่ต้องรู้ message id · และพอโหลดไฟล์ลงดิสก์แล้วก็ไม่มีอะไรหมดอายุ

- **โหลด "วิดีโอ" ลงดิสก์ด้วย** — เคาะ 2026-07-30 (⛔ กลับคำจากบรรทัดเดิมที่เขียนว่า
  "วิดีโอเก็บ `source_url` ไม่โหลดลงดิสก์")
  - ทำได้แล้วเพราะท่อพร้อม: `metaApi.saveMediaToTemp()` + `/api/media-temp/` รองรับ mp4
    (worker วางไฟล์แล้วส่ง URL ให้ Meta ดึง — เทสผ่าน 2026-07-30)
  - ได้: ตะกร้าไม่พึ่ง Discord CDN เลยทั้งรูปและวิดีโอ → ข้อความต้นทางถูกลบก็ยังโพสต์ได้
    · โค้ดรีเฟรช URL ลบทิ้งได้ทั้งชุดหลัง 4c
  - จ่าย: พื้นที่ดิสก์ (คลิปทีมสื่อ 10-50MB/ชิ้น ~3GB/ปี) + เวลาดาวน์โหลดตอนหย่อน (ทำ background หลัง ack)

- **หลัง 4c ต้องลบโค้ดรีเฟรชของเก่า** ใน `web/app/api/bot/basket/route.js`
  (`fetchFreshUrls`/`isExpired`/`parseAttachmentId` — ดึงข้อความจาก Discord API มาเอา URL ใหม่)
  ซ้ำกับ `services/discordAttachments.js` แล้ว และไม่จำเป็นเมื่อไฟล์อยู่บนดิสก์

- **`category` ตั้งอัตโนมัติ = ชื่อห้องต้นทาง** กันฟีดองค์กรรก (ใช้กลไกหมวดที่มีอยู่ ไม่เพิ่ม flag)
- **รูปโหลดลงดิสก์ตอนหย่อน** = ปิดบั๊กรูปหาย 24 ชม. · โหลด background หลัง ack (ห้ามให้ interaction รอไฟล์)
- **วิดีโอเก็บ `source_url` (URL ดิสฯ) ไม่โหลดลงดิสก์** → เพิ่ม `kind='video'` ใน `post_episode_media`
- **บอทห้าม query สื่อ/โพสต์เอง** — ต้องเรียกโมดูลเดียวกับเว็บผ่าน wrapper (บอท CJS / เว็บ ESM) ไม่งั้นรวมตารางแล้วยังมี 2 ทางเขียน

## ที่ยังค้าง (ทำในก้อน 4)
- **คลิปใหญ่จากเว็บ** (user อยากได้ — ดิสฯ อัปคลิปใหญ่ไม่ได้): X/FB อัปเป็น bytes ได้ · **IG/Threads บังคับดึงจาก URL สาธารณะ** → ต้องมี **signed URL หมดอายุสั้น** อีก 1 route (ไฟล์ posts อยู่นอก `public/` โดยตั้งใจ)
- **ลายน้ำของ org ที่ไม่มี guild** — `resolveWatermarkPath` ยังผูก guild (ค้างที่ PENDING)
- **quiet hours ของ `news`** — เว็บสั่งโพสต์เข้าห้องข่าว ควรเข้าคิว 21:00–09:00 เดิมไหม (ยังไม่เคาะ)
