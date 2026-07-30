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
- **ตารางชี้ตะกร้าที่เปิดอยู่ของห้อง** — คุยจบ 2026-07-30 (แก้จากแผนเดิม 2 จุด):
  ```sql
  CREATE TABLE dc_basket_slots (          -- ⚠️ ชื่อเดิมในแผนคือ post_basket_slots
    channel_id  varchar(20) PRIMARY KEY,  -- channel id ของ Discord unique ทั้งโลกอยู่แล้ว
    guild_id    varchar(20) NOT NULL,
    episode_id  bigint NOT NULL REFERENCES post_episodes(id) ON DELETE CASCADE,
    opened_by   varchar(20),
    opened_at   timestamptz NOT NULL DEFAULT now()
  );
  ```
  - **ทำไมต้องมี:** ยุบตะกร้าเข้า `post_episodes` แล้วโพสต์เป็นของ *องค์กร* ไม่ผูกห้อง
    บอทจึงไม่รู้ว่า "ห้องนี้กำลังทำโพสต์ตัวไหน" — ต้องมีตัวชี้ · ล้างตะกร้า = archive โพสต์ + **ลบแถว slot**
  - **ทำไมไม่ยัด `channel_id` ลง `post_episodes`** (ทำได้ด้วย partial unique index `WHERE archived_at IS NULL`):
    `channel_id` เป็น Discord artifact ล้วน ขัดเป้าหมาย "ไม่มี Discord ก็ใช้ได้" · และ state ราย *ห้อง*
    ยังมีอย่างอื่นตามมา (ล็อกห้อง, sticky message id) ซึ่งไม่ใช่คุณสมบัติของ "โพสต์"
  - **ชื่อ `dc_` ไม่ใช่ `post_`** — ตามกฎที่เคาะ 2026-07-29: prefix ต้องมีโมดูลจริงรองรับ และของที่เป็น
    Discord แท้ๆ คง `dc_` ไว้ (เหตุผลเดียวกับที่ `dc_media_baskets` ไม่เปลี่ยนชื่อ)
  - **ยังไม่ย้ายตอนนี้:** `basket_state_<channelId>` (แพลตฟอร์ม/ลายน้ำ/กลุ่มที่เลือกไว้) ที่อยู่ใน
    `dc_guild_config` แบบ JSON — ที่ถูกคือย้ายมาตารางนี้ แต่ทำพร้อม 4c จะบวมเกิน → รอบหน้า
- **`category` ตั้งอัตโนมัติ = ชื่อห้องต้นทาง** กันฟีดองค์กรรก (ใช้กลไกหมวดที่มีอยู่ ไม่เพิ่ม flag)
- **รูปโหลดลงดิสก์ตอนหย่อน** = ปิดบั๊กรูปหาย 24 ชม. · โหลด background หลัง ack (ห้ามให้ interaction รอไฟล์)
- **วิดีโอเก็บ `source_url` (URL ดิสฯ) ไม่โหลดลงดิสก์** → เพิ่ม `kind='video'` ใน `post_episode_media`
- **บอทห้าม query สื่อ/โพสต์เอง** — ต้องเรียกโมดูลเดียวกับเว็บผ่าน wrapper (บอท CJS / เว็บ ESM) ไม่งั้นรวมตารางแล้วยังมี 2 ทางเขียน

## ที่ยังค้าง (ทำในก้อน 4)
- **คลิปใหญ่จากเว็บ** (user อยากได้ — ดิสฯ อัปคลิปใหญ่ไม่ได้): X/FB อัปเป็น bytes ได้ · **IG/Threads บังคับดึงจาก URL สาธารณะ** → ต้องมี **signed URL หมดอายุสั้น** อีก 1 route (ไฟล์ posts อยู่นอก `public/` โดยตั้งใจ)
- **ลายน้ำของ org ที่ไม่มี guild** — `resolveWatermarkPath` ยังผูก guild (ค้างที่ PENDING)
- **quiet hours ของ `news`** — เว็บสั่งโพสต์เข้าห้องข่าว ควรเข้าคิว 21:00–09:00 เดิมไหม (ยังไม่เคาะ)
