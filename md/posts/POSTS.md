# Posts — เครื่องมืองานสื่อ (เขียนคอนเทนต์ → เผยแพร่)

โมดูลช่วย **เขียน/ร่างคอนเทนต์ยาว ซอยเป็นตอน** แล้วส่งต่อเข้าท่อเผยแพร่เดิม (ตะกร้าสื่อ → FB/IG/Threads/X/Discord)
เป็น org-native feature ตัวที่ 5 ต่อจาก finance / calling / docs / cases

> **สถานะ 2026-07-29 เย็น (local · ยังไม่ commit · ยังไม่ deploy prod):**
> `/scrutinize` 2 รอบ + `/grill` 16 กิ่ง ผ่าน · **ก้อน 1 รื้อใหม่แล้ว** (ทิ้ง `post_series` → 6 ตาราง ดู §Data model)
> **ก้อน 2a เสร็จ** — lib (`postsAccess` 66 tests · `postsGuard` · `postsAiQuota` · `postsStorage` · `ai`) · db (`web/db/posts/`) · API 13 ไฟล์ · UI `/posts` + `/posts/[id]` · Nav + feature gate
> verify: 272 tests · `next build` · smoke DB จริง 15 เคส (lock 409 · revision attribution · rename หมวด · promote audit)
> **เทสในเบราว์เซอร์จริงผ่านแล้ว** (autosave · reload · อัปรูป · gate ไฟล์ 401 · กล่อง 409 สองแท็บ) · ⬜ ยังไม่เทสปุ่ม AI/ลากเรียง/paste
> **ก้อน 4 เสร็จ 2026-07-30** — `services/publishPipeline.js` (ท่อร่วมกับตะกร้าดิสฯ) · `publishWorker` (คิว+retry+stale+backlink กลับห้อง) · ประวัติรวมที่ `post_social_history` (drop `dc_media_history`) · API `/publish` `/jobs` + UI กล่องเผยแพร่ · e2e ผ่าน
> **ก้อน 2b (Video/Quote Generator Modal) — ดีไซน์เคาะแล้ว 2026-07-31 ยังไม่เขียนโค้ด** (ดู §🎬 Media Section — Video/Quote Generator Modal) · ⚠️ ยังไม่รัน `/scrutinize` ตามกฎ CLAUDE.md — **ต้องรันก่อน implement รอบหน้า**
> ⬜ ต่อไป: **ก้อน 4c ยุบตะกร้าดิสฯ เข้า post_episodes** (ดู `md/posts/PLAN-4.md`) · ก้อน 3 (อนุมัติ/review link) · ก้อน 2b (implement ตามดีไซน์ด้านล่าง)

---

## 🎯 ที่มา

เดิมเขียนคอนเทนต์เป็นไฟล์ plain text ใน `posts/` แล้ว copy ไปวาง Facebook เอง — ปัญหา:
- ผูกกับเครื่องเดียว เขียนนอกบ้านไม่ได้
- ไม่ต่อกับระบบเผยแพร่ที่มีอยู่แล้วในโปรเจกต์
- เป็นเครื่องมือของคนคนเดียว ไม่ใช่ของทีมสื่อ

**ครึ่งเผยแพร่สร้างไว้แล้วเกือบครบ** (ดู "ของเดิมที่ต่อได้เลย") — ที่ขาดคือครึ่ง authoring

---

## 🔑 แนวคิดหลัก

- **Core term:** `post` · **1 โพสต์ = 1 แถวใน `post_episodes`** ยืนเดี่ยว ไม่มีชุด/ลำดับตอน
  จัดกลุ่มด้วยคอลัมน์ `category` (1 โพสต์ 1 หมวด) — ⛔ แนวคิด series ถูกทิ้งแล้ว 2026-07-29 เย็น ดู §Data model
- **2 โหมดความเป็นเจ้าของ** — ต้องออกแบบตั้งแต่แรก ห้ามไปเติมทีหลัง:
  - `personal` — ร่างส่วนตัว เจ้าของเห็นคนเดียว (เช่น จุดยืนการเมือง/ค่าตอบแทน ที่ยังไม่พร้อมให้ทีมเห็น)
  - `org` — ร่างขององค์กร ทีมสื่อเห็นร่วมกัน
- **AI ช่วยร่างในตัว** — ซอยตอน / เกลาสำนวน / คิดแคปชัน+ภาพประกอบ (แบบที่ทำผ่าน Claude Code อยู่ตอนนี้)
- **ไม่แตะ publish** — จบที่ "ส่งเข้าตะกร้าสื่อ" แล้วปล่อยให้ท่อเดิมทำงาน

---

## ✅ ที่เคาะแล้ว (2026-07-28)

| ประเด็น | เคาะว่า |
|---|---|
| AI ช่วยเขียนในตัว | **มี** — ไม่ใช่แค่ที่เก็บ draft |
| ร่างส่วนตัว vs องค์กร | **มีทั้ง 2 โหมด** ตั้งแต่ MVP |
| ขอบเขต MVP | **เขียน + เก็บ + อนุมัติ + ส่งเข้าตะกร้าสื่อ** — ยังไม่ทำปฏิทินคอนเทนต์ |
| **การอนุมัติ** | **ต้องมีตั้งแต่ MVP** — งานจริงต้องผ่านบรรณาธิการ |
| สิทธิ์บรรณาธิการ | **แก้ข้อความในบทความได้เลย** + คอมเมนต์ (ไม่ใช่ comment-only) → ต้องมีประวัติการแก้ |
| โพสต์ส่วนตัวออกบัญชีไหน | **บัญชีส่วนตัวของคนเขียน** — ใช้กลไกที่มีอยู่แล้ว ไม่สร้างใหม่ |

---

## 🧩 บัญชีโซเชียลส่วนตัว — มีอยู่แล้ว ไม่ต้องสร้าง

ตาราง `dc_social_accounts` รองรับอยู่แล้ว:
- `visibility` = `public` (ทั้ง guild ใช้) | `private` (เจ้าของคนเดียว)
- `user_discord_id` = เจ้าของบัญชี private
- `group_name` = จัดกลุ่มบัญชี

`getConfig(guildId, platform, userId, groupName)` ใน `services/metaApi.js` **เลือกบัญชีของ user คนนั้นก่อนเสมอ** (`ORDER BY CASE WHEN user_discord_id = $x THEN 0 ELSE 1`) → โพสต์ส่วนตัวออกบัญชีตัวเองได้ทันที ไม่หลุดไปเพจพรรค

---

## ✅ Phase 0 — `dc_social_accounts` → org-native (เสร็จ 2026-07-29)

**เคาะแล้ว 2026-07-28: ต้องทำงานบนเว็บได้แม้ไม่มี Discord** → ตารางนี้ต้องผ่าน org migration ก่อน posts เริ่ม

### ✅ ทำเสร็จ 2026-07-29 — schema + สิทธิ์

**SQL:** `scripts/migration/migration.sql` (บล็อกท้ายไฟล์ ลงวันที่ 2026-07-29) — rebuild ตาราง 10 แถวเพื่อวางคอลัมน์ in-place

```
id · org_id · owner_user_id · guild_id · user_discord_id · name · group_name · platform · social_id · ...
```
- `org_id` = scope หลัก · `owner_user_id` = เจ้าของบัญชี **private เท่านั้น** (public เป็นของ org → owner NULL)
  ⚠️ ถ้าเซ็ต owner บนแถว public ด้วย คีย์จะไม่ตรงกับที่ upsert เขียนเข้ามา → reconnect ทีเดียวได้แถวซ้ำ
- `guild_id` / `user_discord_id` เหลือไว้เป็น **Discord artifact** — บอทยังค้นด้วยตัวนี้เหมือนเดิม
- ทิ้ง `user_key` · PG14 ไม่มี `NULLS NOT DISTINCT` → unique เป็น expression index
  `(COALESCE(org_id,0), COALESCE(owner_user_id,0), COALESCE(guild_id,''), platform, social_id)`
  → `ON CONFLICT` ทั้ง 3 จุดต้องเขียน expression ให้ตรงตัวอักษร
- sequence: `DROP TABLE` ลาก sequence ไปด้วย → ต้อง `OWNED BY NONE` ก่อน แล้วผูกคืน (อยู่ในสคริปต์แล้ว)

**โค้ดที่แก้ (เว็บล้วน):**

| ไฟล์ | แก้อะไร |
|---|---|
| `api/social/accounts/route.js` | GET: public scope `guild_id` → `org_id` (เห็นบัญชีทุก guild ในองค์กร) · private ยึด `owner_user_id` · POST: org มาจาก session เสมอ + เช็ค guild ∈ org + ทิ้ง `getSocialManagerGuildIds` |
| `api/social/accounts/[id]/route.js` | ownership → `owner_user_id` (user อีเมลก็เป็นเจ้าของได้) |
| `api/meta/oauth/callback` · `api/x/oauth/callback` | เขียน `org_id`/`owner_user_id` + ON CONFLICT คีย์ใหม่ |
| `app/bot/platforms/page.js` | หัวข้อ "บัญชีขององค์กร" (public เป็น org-wide แล้ว) · App Credentials ยังเป็นรายเซิร์ฟเวอร์ · filter บัญชีตัวเองใช้ `owner_user_id` |

**ตั้งใจไม่แตะ:** `services/metaApi.js` · `services/xApi.js` · `handlers/basketHandler.js` · `api/bot/guild-watermarks`
→ ตะกร้าสื่อ/ลายน้ำเป็น guild-based โดยธรรมชาติ · ถ้าเปลี่ยนเป็น org scope ทันที basket ราชบุรีจะเห็นบัญชีอาสาฯ แล้ว `LIMIT 1` อาจหยิบผิดแบรนด์

**verify แล้ว:** dry-run (BEGIN/ROLLBACK) → upsert เดิมเข้า DO UPDATE จริง · guildless insert 2 ครั้งได้แถวเดียว · sequence รอด
· `npm run build` ผ่าน · smoke ฝั่งบอท 3 query ผ่าน (ยัง scope ราชบุรี ไม่รั่วข้าม guild)
· ยิง API จริงด้วย session: GET คืน 10 แถวรวมทุก guild · POST guild ขององค์กรอื่น → 403 · **สร้างบัญชีใน org ที่ไม่มี guild ได้แล้ว**

### ⚠️ ยังเหลือ: เชื่อมบัญชี "ใหม่" ยังต้องมี guild

`getGuildMetaApp()` / `getGuildXApp()` อ่าน app_id/secret จาก `dc_guild_config` → OAuth ทั้งเส้นยังเป็น guild-scope
org ที่ไม่มี guild จึง **ถือครอง/เลือกบัญชีได้ แต่กด Connect ใหม่ไม่ได้** (และหน้า `/bot/*` ก็ยังบล็อก org ไร้ guild อยู่)
เคาะ 2026-07-29: **ยังไม่ย้าย creds ขึ้น org ในรอบนี้** — จดไว้ที่ PENDING

### 📌 รอบก่อนหน้า (2026-07-29 เช้า) — แก้บั๊ก query/UX

แก้บั๊กที่เกิดจริงไปแล้ว 3 ตัว (bug-063/064/065 ใน `.wolf/buglog.json`) — **ไม่ใช่ Phase 0 ทั้งก้อน แต่ปลดล็อกให้ทำงานต่อได้**

| ทำแล้ว | ไฟล์ |
|---|---|
| บัญชี **private** เลิก scope ด้วย guild → ติดตามตัว user ทุกที่ | `api/social/accounts/route.js` · `services/metaApi.js` · `services/xApi.js` |
| กันโพสต์องค์กรหลุดลงบัญชีส่วนตัว (`ORDER BY public ก่อน`) | `services/metaApi.js` · `services/xApi.js` |
| org switcher ไม่เขียนทับ `selected_guild` ถ้า guild เดิมยังอยู่ใน org | `api/org/orgs/switch/route.js` |
| `getGuildId()` ยึด active org (org ไม่มี guild → `null`) | `lib/guildContext.js` |
| `/bot/*` org ไม่มี guild → ขึ้น "ยังไม่ได้เชื่อม Discord" | `app/bot/layout.js` |
| guild switcher ย้ายจาก hamburger → แถบบนสุดของ `/bot/*` | `components/GuildSwitcherBar.jsx` (ใหม่) · `Nav.jsx` |
| สลับ org/guild ใช้ `window.location.reload()` แทน `router.refresh()` | `OrgSwitcherMenu.jsx` · `Nav.jsx` · `GuildSwitcherBar.jsx` |

**ที่มา (bug-063, 2026-07-28):** บัญชีส่วนตัวหายจาก `/bot/platforms` เพราะ org 1 มี 3 guild แต่ตารางยัง scope ด้วย `guild_id`
และ org switcher ปัก `selected_guild` ไว้ที่อาสาประชาชนเสมอ → บัญชีที่อยู่ใต้ราชบุรีหายหมด · guild switcher ก็เพิ่งถูกถอดตอนรวมเป็น org-first
รอบเช้าแก้อาการ (query/UX) · รอบบ่ายแก้ราก (schema + สิทธิ์)

### 🎨 ทางที่เลือก — org มีหลาย guild

| ทางเลือก | ผล |
|---|---|
| A. เปลี่ยน scope เป็น `org_id` ล้วน | เห็นทุกบัญชีของ org — แต่ตะกร้าสื่อ Discord ที่เป็น guild-based โดยธรรมชาติจะไม่รู้ว่าบัญชีไหนของ guild ไหน |
| B. คง guild scope + เอา guild switcher กลับมา | สวนทางกับทิศทาง org-first ที่เพิ่งรวมไป |
| **C. `org_id` เป็น scope หลัก + `guild_id` เป็น optional metadata** ✅ ทำแล้ว | posts เลือกบัญชีไหนก็ได้ในระดับ org · ตะกร้าสื่อ Discord ยังรู้ว่า guild นี้ใช้บัญชีชุดไหนเป็น default · **`group_name` ที่มีอยู่แล้วทำหน้าที่จัดกลุ่มให้คนอ่าน** (ราชบุรี / อาสาฯ) |

### 🏷️ ชื่อตาราง — ⚠️ **กลับคำแล้ว 2026-07-29: เปลี่ยนเป็น `post_social_accounts`**

> user สั่ง 2026-07-29 · หลักที่เคาะ: **prefix ต้องมีโมดูลจริงรองรับ** — `post_` ผ่านเพราะมี `web/db/posts/` + `orgFeatures` key `posts` (ต่างจาก `media_` ที่ตกไปเพราะไม่มีโฟลเดอร์รองรับ)
> **ทำหลังก้อน 4** · เงื่อนไขบังคับ: ใส่คอมเมนต์หัวตารางว่า **ตะกร้าสื่อ/ลายน้ำ/Meta-X OAuth ใช้ร่วม → ห้าม drop ตามโมดูล posts** · rename แล้วต้องสร้าง **view ชื่อเดิมคร่อมไว้** (บอท/เว็บ deploy ไม่พร้อมกัน) แล้วค่อย drop view · ทำทีละตารางทีละ commit **ห้าม sed รวด**
> รายละเอียด + ตารางอื่นที่ถอด `dc_` พร้อมกันอยู่ `md/PENDING.md` §POSTS

**ย่อหน้าข้างล่างนี้คือเหตุผลเดิมของวันที่ 28 ที่ถูกกลับคำ — เก็บไว้ดูที่มา ไม่ใช่คำสั่งปัจจุบัน:**

~~อย่าเปลี่ยนเป็น `post_social_accounts`~~ — ตารางนี้ไม่ใช่ของ posts แต่เป็นโครงสร้างพื้นฐานที่ใช้ร่วมกัน:
ตะกร้าสื่อใน Discord (มาก่อน posts) · guild-watermarks · Meta/X OAuth callback · แล้วค่อยมี posts

ตั้ง prefix `post_` = อ้างสิทธิ์ของกลางให้โมดูลเดียว → วันหน้ามีคนคิดว่า "เลิกใช้ posts ก็ drop ได้" แล้วตะกร้าสื่อพัง

convention ที่ใช้จริง: **prefix = โมดูลเจ้าของ** (`dc_` 18 · `org_` 8 · `finance_` 7 · `cooking_` 6 · `docs_`/`calling_`/`case_` 5)

**เปลี่ยน `dc_` → `social_` ดีไหม?** ตรงกว่าเมื่อเป็น org-native แล้ว แต่ **ยังไม่ทำ** — โดน 34+ จุดทั่ว repo · ตอน migrate calling เคยเจอ bulk-rename ทำ `orgId` ไหลเข้า `guild_id` มาแล้ว · ไม่ปลดล็อกอะไร · เอามารวมกับ migration จริง = เสี่ยงฟรี
→ ถ้าจะทำ ทำเป็นรอบแยกตอนไม่มีอะไรค้าง

**ตารางใหม่ของ posts ใช้ `post_` ได้เต็มที่:** `post_series`, `post_episodes`, `post_social_history` (คิว+ประวัติ)
→ `post_social_history` ใช้ prefix `post_` ได้ทั้งที่ตะกร้าดิสฯ ใช้ร่วม **เพราะก้อน 4 ยุบตะกร้าเป็น episode ของ posts แล้ว** — ไม่ใช่ของนอกโมดูลอีกต่อไป (ต่างจาก `dc_social_accounts` ที่ยัง shared จริง)

### ⏭️ ตอน deploy prod ต้องรู้
- `migration.sql` บล็อกนี้ idempotent (เช็ค `org_id` มีแล้ว → ข้าม) แต่ **rebuild ตาราง** — ทำตอนบอทไม่ได้เขียน
- ⚠️ **build เว็บผ่าน ≠ บอทไม่พัง** — บอทอ่าน `guild_id`/`user_discord_id` ที่ยังอยู่ครบ จึงไม่ต้องแก้ แต่ต้อง smoke จริงหลัง migrate

### 🧹 เจอระหว่างทาง (นอกสโคป ไม่ต้องแก้ตอนนี้)
`scripts/social/meta-setup.js`, `compareMetaTokens.js`, `testMetaToken.js`, `test-ig-schedule.js` อ้างคอลัมน์ที่ถูก drop ไปแล้ว (`owner_type`, `owner_id`, `page_id`, `ig_id`) และบางตัวยังเป็น MySQL syntax (`pool.execute` + `?`) — **พังอยู่แล้วก่อนงานนี้**

---

## 🧱 โครงโมดูล (ตาม pattern calling/cases)

| ที่ | ไฟล์/โฟลเดอร์ |
|---|---|
| DB functions | `web/db/posts/` |
| หน้าเว็บ | `web/app/posts/` |
| API | `web/app/api/posts/` |
| สิทธิ์ | `web/lib/postsAccess.js` + test ใน `web/lib/__tests__/` |
| เปิด/ปิดรายองค์กร | เพิ่ม 1 บรรทัดใน `web/lib/orgFeatures.js` → โผล่ใน Nav + หน้าฟีเจอร์เอง |
| AI | `web/lib/ai.js` (wrapper บางๆ · model `claude-sonnet-5` เป็น constant ที่เดียว) |

---

## 🗂️ Data model (ผ่าน `/scrutinize` แล้ว 2026-07-29)

### ⛔ 2026-07-29 (เย็น) — **ทิ้ง `post_series` แล้ว** หน่วยงานหลักคือ "ตอน" (episode) เดี่ยวๆ

> user: *"ผมทำงานเป็น episode แล้วแยกด้วย category เอา · post_series มีไว้ทำไม จะแยกกลุ่มก็ใช้ category ใน column ก็ได้"*

ของเดิม (series → episode) **ตายแล้ว อย่าเอากลับมา** · ที่เปลี่ยน:

| เดิม | ใหม่ |
|---|---|
| `post_series` (ตาราง) | **ไม่มี** — จัดกลุ่มด้วยคอลัมน์ `post_episodes.category varchar(60)` (ไม่มีตาราง lookup) |
| `series_id` · `seq` (unique ต่อ series) | **ทิ้งทั้งคู่** — ตอนไม่มีลำดับ เรียงตามเวลาที่แก้ล่าสุด |
| `visibility`/`owner_user_id`/`org_id` อยู่บน series | **ย้ายลงมาที่ตอน** — แต่ละตอนตั้งเองว่าส่วนตัวหรือขององค์กร |
| `source_idea`/`created_via` อยู่บน series | ย้ายลงมาที่ตอน |

เคาะพร้อมกัน (3 ข้อ): **visibility อยู่ที่ตัวโพสต์** · **1 โพสต์ = 1 หมวด** (ไม่ใช่ tag หลายอัน) · **ไม่มีเลขลำดับตอน** เรียงตามเวลา
ที่แลกไป: เปลี่ยนชื่อหมวด = `UPDATE` ทุกแถวของหมวดนั้น (ยอมรับได้ที่สเกลนี้ · ถ้าวันหน้าต้องมี setting ต่อหมวดค่อยยกเป็นตาราง)
ไม่กระทบ: `post_episode_media` · `post_revisions` · `post_review_links` · `post_comments` · `post_social_history` — ทั้งหมดผูก `episode_id` อยู่แล้ว

| ตาราง | คอลัมน์หลัก |
|---|---|
| `post_episodes` | `org_id` · `owner_user_id` · `visibility` (`personal`/`org`) · **`category`** (varchar ว่างได้ = ยังไม่จัดหมวด) · title · `body` · `bodies jsonb` (override รายแพลตฟอร์ม) · **`format`** (hint `text`/`image`/`quote`) · **`source_idea`** (ไอเดียดิบที่โยนเข้ามา — กด "ร่างใหม่" ได้ไม่ต้องพิมพ์ซ้ำ) · `created_via` (`ai`/`manual`) · `status` (**draft/review/approved เท่านั้น** — เผยแพร่เป็น derived จาก jobs ดู §grill ข้อ 10) · approved_by · approved_at · `last_edited_by` · `updated_at` (ใช้ทำ optimistic lock) · archived_at |
| `post_episode_media` | `episode_id` · `kind` (`upload`/`quote`) · `path` · `sort_order` · **`quote_text` · `quote_style` · `bg_path`** (เก็บ params ไม่ใช่แค่ PNG → แก้ข้อความแล้ว render ใหม่ได้) · added_by |
| `post_revisions` | `episode_id` · title · body · `edited_by_user_id` (NULL = คนที่เข้ามาทางลิงก์) · `edited_by_name` |
| `post_review_links` | `token` (≥32 bytes) · **`episode_id`** (1 ลิงก์ = 1 ตอน — แก้จาก series_id 2026-07-29) · created_by · `can_edit` · expires_at · revoked_at · uses |
| `post_comments` | `episode_id` · `anchor` (ย่อหน้า, NULL = ทั้งตอน) · body · author_user_id/author_name · resolved_at |
| **`post_social_history`** (เดิมชื่อ `post_publish_jobs` → `social_posts` → ชื่อนี้) | **คิว + ประวัติ ตารางเดียวกัน** (เคาะ 2026-07-29) — ⚠️ ชื่อ `history` แต่เก็บงานที่ยังไม่เกิดด้วย (`pending` = ตั้งเวลาไว้) — แถว `pending`/`running` = คิว · `done`/`failed` = ประวัติ · ตะกร้าดิสฯ เขียนแถว `done` หลังยิงเสร็จ → **ก้อน 4 ย้าย 10 แถวจาก `dc_media_history` เข้ามาแล้ว drop ทิ้ง** · คอลัมน์: org_id (NULL ได้) · episode_id (**NULL = มาจากตะกร้า ไม่ใช่ posts**) · `batch_id` · **`platform` เอกพจน์** · social_account_id · guild_id/channel_id (Discord artifact) · wm_type · caption + media snapshot · scheduled_at · status (`pending`/`running`/`done`/`failed`/`stale`/`canceled`) · attempts · last_error · result jsonb (แทน fb_url/ig_url เดิม) · created_by + created_by_discord_id · posted_at |

**⛔ 2026-07-30 — `dc_media_baskets` ตายแล้ว (ก้อน 4c)** ย่อหน้าข้างล่างนี้เก็บไว้เป็นบันทึกว่าเคยคิดยังไง **อย่าเอามาใช้ตัดสินใจต่อ**

<details><summary>เหตุผลเดิมที่เคยแยกตาราง (ตกไปแล้ว)</summary>

**ทำไมสื่อไม่ใช้ `dc_media_baskets` ร่วม** (ถามตรงๆ 2026-07-29): key เป็น `(guild_id, channel_id)` · `image_url` เป็น **Discord signed URL หมดอายุ ~24 ชม.** (แถวจริงมี `?ex=&is=&hm=`) · เป็นถาดชั่วคราวที่ `clearBasket()` ล้างหลังโพสต์ · caption เป็น "แถวชนิดหนึ่ง"
→ ร่างที่ค้างเป็นสัปดาห์รูปจะตาย · **ที่ใช้ร่วมจริงคือท่อโพสต์ ไม่ใช่ที่เก็บ**

ข้อค้านทั้งหมดนี้ตายเพราะ 4c แก้ที่ต้นเหตุ: โหลดไฟล์ลงดิสก์ตอนหย่อน (ไม่มีอะไรหมดอายุ) · ล้างตะกร้า = archive ไม่ใช่ลบ · caption = `body`
</details>

### 🧺 ตะกร้าสื่อ Discord = โพสต์ (ก้อน 4c · เสร็จ 2026-07-30)

- "ตะกร้าที่เปิดอยู่ของห้อง" = แถวใน `post_episodes` ที่ `channel_id = ห้องนั้น AND archived_at IS NULL`
  บังคับด้วย partial unique index `uq_open_basket_per_channel` — **ที่ DB ไม่ใช่ที่โค้ด** · ⛔ ห้ามเพิ่มตาราง slot
- `post_episodes` เพิ่ม `guild_id`/`channel_id` · `org_id`/`owner_user_id` **nullable** แล้ว
- `post_episode_media` เพิ่ม `source_url`/`source_message_id` · `path` nullable (NULL = ไฟล์ยังโหลดไม่เสร็จ) · `kind` += `video`
- **2 ตะเข็บที่ต้องแก้พร้อมกันเสมอ:** `db/mediaBasket.js` (บอท CJS) · `web/db/posts/basket.js` (เว็บ ESM)
- ⚠️ **อัปเดต 2026-07-30 (เย็น): หน้า `/bot/media/basket` ถูกยุบเข้า `/posts` + `/posts/[id]` แล้ว**
  ลิสต์ตะกร้า = แท็บ "จากดิสฯ" · แก้ตะกร้า = หน้าโพสต์ปกติ · path เดิมเหลือเป็น route handler ที่ redirect
  (ลิงก์ในข้อความ Discord เก่าแก้ย้อนหลังไม่ได้ · มันเซ็ต cookie `active_org` ให้ตรงโพสต์ก่อนเด้ง)
  → API `/api/bot/basket*` ทั้ง 3 ตัวลบทิ้ง · `web/db/posts/basket.js` เหลือแค่ `getOpenBasket()`

### 🤖 ข้อเสนอจาก AI เก็บถาวรแล้ว (2026-07-31)

- **แก้จากสเปกเดิมที่เขียนว่า "ไม่เขียนลง DB"** — แคปชัน/ไอเดียภาพหายทุกครั้งที่รีเฟรช แล้วกดใหม่ = **เสียโควตา AI รายวันฟรี**
- ตาราง `post_ai_suggestions` (`episode_id` · `kind` · `payload` jsonb · `created_by_user_id` · `created_at`)
  · API `GET/DELETE /api/posts/[id]/ai-suggestions` · เก็บหลายชุด ขอใหม่ = ต่อท้าย ลบได้ทีละชุด
- ⛔ **ห้ามย้ายไปเป็นคอลัมน์บน `post_episodes`** — ทุก UPDATE ที่นั่น bump `updated_at` = lockToken ของ
  PostEditor หมดอายุ → ขอแคปชันทีไร autosave เด้ง 409 (bug-071)
- **ไม่ปนกับ `post_revisions`** — ของพวกนี้ไม่เคยเข้าเนื้อหาโพสต์ และ revision มีปุ่ม "กู้คืนฉบับนี้"

### เกี่ยวเนื่อง: `dc_user_config` → `user_config` (เคาะ 2026-07-29)

ไม่สร้างตาราง prefs ใหม่ — **แปลงของเดิม in-place** (9 แถว 2 คน · 7 ไฟล์)
`discord_id` → `user_id` (int, FK users) + rename ตาราง (ไม่ใช่ของ Discord อีกแล้ว)
- **คีย์จริงมีตัวเดียว = `user_id`** · ห้ามให้เขียนได้ 2 คีย์ ไม่งั้นค่าจะแตกเป็น 2 ชุด (บอทเขียนใต้ discord · เว็บอ่านใต้ user) = ปัญหาเดิมที่ unify identity เพิ่งปิดไป
- caller ฝั่งบอทไม่ต้องแก้ — แก้แค่ `db/userConfig.js` ให้ resolve discord→users.id ข้างใน (บอทมี upsert users ที่ `db/org.js:44` อยู่แล้ว)
- **ย้ายออกจากตารางนี้:** `passkey_reg_challenge` (ตายแล้ว ย้ายไป `auth_nonces` ตั้งแต่ 2026-07-25) · `otp_quota` + verify session ของ `handlers/verifyHandler.js` (เป็น state ชั่วคราวมีวันหมดอายุ ควรอยู่ `auth_nonces`)
→ เหลือแต่ prefs ถาวรจริงๆ = ไม่มีเคส "บอทเขียน config ให้คนที่ยังไม่มี users row"

---

## 🔐 สิทธิ์ — ใช้ permission เดิม ไม่เพิ่มคำใหม่

ตรวจแล้ว `editor` (บรรณาธิการ/จัดการตะกร้าสื่อ) มีคนถือจริง — org 1 "ทีมบรรณาธิการ" 6 คน

| | personal series | org series |
|---|---|---|
| เจ้าของ | อ่าน/แก้/ลบ | อ่าน/แก้ |
| member ทั่วไป | ไม่เห็น | อ่าน |
| `editor` · `secretary_general` | ไม่เห็น | อ่าน/แก้/**อนุมัติ** |
| `admin` | เห็น (god-mode ตามนิยามใน `org_roles`) | ทุกอย่าง |
| ลิงก์รีวิว | — | อ่าน+คอมเมนต์+อนุมัติ · แก้ได้ถ้า `can_edit` |

- หลัง `approved` = ล็อก ต้องกด "ขอแก้" ถึงกลับเป็น `review`
- **เขียน revision ก่อนทับทุกครั้งที่คนแก้เปลี่ยนคน** + snapshot แรกตอนสร้างตอน (ไม่ใช่ throttle อย่างเดียว ไม่งั้นต้นฉบับหายตอนเจ้าของแก้ทับบรรณาธิการ)
- อนุมัติผ่านลิงก์ = **ความเห็นผู้ตรวจ ไม่ใช่ลายเซ็นผูกตัวตน** (ชื่อพิมพ์เอง) · หน้า `/review` ต้อง `noindex`

---

## 🔌 ของเดิมที่ต่อได้เลย (ไม่ต้องสร้างใหม่)

| ของเดิม | ใช้ทำอะไร |
|---|---|
| `services/metaApi.js` | โพสต์ FB/IG/Threads + ตั้งเวลา FB (`scheduled_publish_time`) |
| `services/xApi.js` | X พร้อม thread splitting + URL strip |
| `services/newsShare.js` | แชร์เข้าห้องข่าว Discord + คิว quiet hours (21:00–09:00) |
| `web/app/bot/media/` | ตะกร้าสื่อ, quote card, watermark |
| `/api/social/accounts`, `/api/meta/oauth/*` | ผูกบัญชีโซเชียลรายองค์กร |
| `services/aiSummarize.js`, `aiLayout.js` | AI infra ที่มีอยู่แล้ว |

**ข้อจำกัดตั้งเวลาที่รู้อยู่แล้ว** (จาก `md/discord/BOT.md`): FB ✅ · IG/Threads ❌ · X ❌ (ต้อง custom scheduler)

### 🌉 เว็บจะสั่งโพสต์ยังไง (ท่อไม่ผูกกับ Discord จริง)

ตรวจแล้ว: `postToFacebook(guildId, userId, images, caption, scheduleTime, groupName)` รับ **buffer + text ธรรมดา** — ไม่มีอะไรต้องมาจาก Discord
ที่ผูกกับ Discord จริงมีแค่ **ทาง Reels/วิดีโอ** ที่รับ Discord CDN URL ตรงๆ (`videoDiscordUrl`)

**กำแพงจริง:** `web/` ไม่เคย import `services/` เลยสักที่ (grep แล้ว 0) — บอทเป็นคนละโปรเซส คนละ package.json คนละ pool

**เสนอ: ตารางคิวงาน `post_social_history`** — เว็บเขียนแถว → บอทวนหยิบไปเรียก `metaApi` แบบเดิมเป๊ะ

| ทำไมเลือกอันนี้ | |
|---|---|
| ไม่ต้องสร้าง HTTP API + auth ระหว่างเว็บกับบอทใหม่ | |
| งานไม่หายถ้าบอทรีสตาร์ต + retry ได้เอง | |
| **X/IG ต้องเขียน custom scheduler อยู่แล้ว** → ตารางนี้คือ scheduler ตัวนั้นพอดี ได้ 2 อย่างจากกลไกเดียว | |
| ไม่ต้องแก้ `metaApi.js` สักบรรทัด | |

ข้อแลกเปลี่ยน: บอทต้องรันอยู่เว็บถึงจะโพสต์ออก (วันนี้ก็เป็นแบบนั้นอยู่แล้ว)
**สถานะ: เสนอไว้ ยังไม่เคาะ**

---

## 🖥️ หน้าจอ (ออกแบบใหม่ 2026-07-29 — **เลิกลอก flow ดิสฯ**)

> "ไม่ได้จะลอกแบบเดิมบน discord เพราะมันมีข้อจำกัด บนเว็บออกแบบ flow ใหม่ที่ดีและลื่นไหลได้เลย"

### `/posts` — หน้าแรกคือกล่องโยนไอเดีย ไม่ใช่ list

```
[ ส่วนตัว | องค์กร ]         ← จำค่าล่าสุด (user_config)
┌────────────────────────────────────────┐
│ โยนหัวข้อ/ไอเดีย หรือวางบทความยาวที่เขียนไว้ │
└────────────────────────────────────────┘
                        [ ให้ AI จัดโครง → ]
ซีรีส์ที่มีอยู่ (การ์ด + สถานะแต่ละตอน)
```
- input สั้น = ไอเดีย → AI ขยาย · input ยาว = บทความ → AI ซอยตอน (แยกด้วยความยาว ไม่ต้องมี 2 ปุ่ม)
- **AI คืนโครงก่อน (~5 วิ)** = ชื่อซีรีส์ + รายชื่อตอน + สาระต่อตอน → บันทึกเป็น draft ทันที → ค่อยกด "ร่างตอนนี้" ทีละตอน (ไม่ร่างเต็มรวดเดียว: ช้า + เสีย token ถ้าโครงผิด)
- AI ล้ม → ยังได้ซีรีส์ที่มี `source_idea` อยู่

### `/posts/[series]/[episode]` — จอเดียว 2 คอลัมน์ ไม่มีหน้าย่อย

```
┌─────────────────────────────┬──────────────────────────┐
│  เนื้อหาตอนที่ 3            │  ● ของที่จะออกจริง        │
│  พิมพ์ได้เลย autosave       │  [การ์ด][รูป][รูป] ลากเรียง│
│  ไฮไลต์ประโยค →            │  ─────────────────────    │
│  ┌──────────────────────┐   │  FB │ IG │ X │ Threads   │
│  │ ✦ ทำการ์ด 💬 คอมเมนต์ │   │  ข้อความของแพลตฟอร์มนี้   │
│  │ ✧ เกลาสำนวน          │   │  (ว่าง = ใช้เนื้อหาหลัก)   │
│  └──────────────────────┘   │  บัญชี · เวลา · [ขออนุมัติ]│
└─────────────────────────────┴──────────────────────────┘
```

**การ์ดคำคม = studio เปิดค้างข้างๆ ไม่ใช่ wizard 5 ชั้นแบบดิสฯ**
- ไฮไลต์ → "ทำการ์ด" → การ์ดโผล่ในแถบสื่อทันที (ใช้ค่าล่าสุด) **ไม่มีขั้นยืนยัน** ไม่ชอบก็ลบ
- คลิกการ์ด → panel: **ธัมบ์เนลสไตล์ของจริง 20 แบบ คลิกสลับเห็นผลทันที** · ลากรูปวางเป็นพื้นหลัง/หยิบรูปในตอน · slider ความอิ่มสี · ลายน้ำ · ปุ่ม "ย่อให้พอดี" = `shortenQuote()` เดิม
- แก้บทความทีหลัง → การ์ดขึ้นป้าย **"ต้นทางเปลี่ยนแล้ว — อัปเดต?"** (เก็บ params ไว้)
- ไม่มีรูปก็ทำการ์ดได้ (สไตล์พื้นสี) → โพสต์ข้อความล้วนลง IG ได้โดยไม่ต้องหารูป

**ที่เว็บทำได้แต่ดิสฯ ทำไม่ได้ — เอาเข้าไปเลย:** วางรูปจาก clipboard · ลากหลายไฟล์ · **ซอยตอนแบบเห็นเส้นแบ่ง ลากปรับได้ก่อนยืนยัน** · preview รายแพลตฟอร์มของจริง (X ตัดที่ 280 ตัวให้เห็น) · ย้อนเวอร์ชันจาก `post_revisions` · คีย์ลัด

**ข้อจำกัดจริงข้อเดียว:** การ์ด render ด้วย `@napi-rs/canvas` ฝั่ง server → เปลี่ยนสไตล์ = round-trip
→ แก้ด้วย ธัมบ์เนล 256px render ครั้งเดียวตอนเปิด panel (cache ด้วย hash รูป+ข้อความ) + debounce ~300ms ตอนพิมพ์
→ **ห้ามเขียน renderer ใหม่ให้รันในเบราว์เซอร์** จะได้การ์ด 2 หน้าตาที่ค่อยๆ เพี้ยนจากกัน

### ไม่แยกเป็น "ชนิดโพสต์"

โพสต์ข้อความ/ภาพ/โควต ต่างกันแค่ **สื่อ 0 ชิ้น / upload / quote** → 1 ตอน = ข้อความ + สื่อ 0..n ผสมกันได้
(โพสต์จริงมักผสม: การ์ด 1 ใบ + ภาพ 2 รูป · ถ้าล็อกเป็น type พอเปลี่ยนใจต้องสร้างตอนใหม่)
ตอนกดโพสต์ตรวจ: **IG/Threads ต้องมีสื่อ ≥1** → ไม่มีรูป ระบบเสนอ "สร้างการ์ดจากย่อหน้าแรก" (คือเหตุผลที่โพสต์โควตเกิดมาแต่แรก)

---

## 🎬 Media Section — Video/Quote Generator Modal (เคาะ 2026-07-31)

> ดีไซน์ผ่านการคุยรอบเดียว (ยังไม่ผ่าน `/scrutinize`) — เก็บไว้ทำต่อวันหลัง **ห้าม implement ก่อนรัน `/scrutinize`** ตามกฎ CLAUDE.md

### จุดเข้า — ปุ่มในโซนสื่อ ไม่ใช่ highlight ในบทความ

`PostMediaPanel.jsx` (โซนสื่อหลักของหน้าตอน — upload/drag&drop/paste ทำไว้ครบแล้ว) เพิ่มปุ่มเสริม 2 ปุ่มข้าง "เลือกไฟล์": **`[ Video ]`** `[ Quote ]` → เปิด Modal ตรง ไม่ใช่ inline panel

**หมายเหตุ:** §หน้าจอ ด้านบน (เคาะ 2026-07-29) เคยเขียนว่าการ์ดคำคมเป็น "studio เปิดค้างข้างๆ" ทริกเกอร์จากไฮไลต์ประโยคในบทความ — **ของเดิมยังไม่ได้ implement เลยสักบรรทัด** (เช็คแล้ว `PostEditor.jsx` มีแค่ AI text modes ไม่มี "ทำการ์ด") จึงไม่ใช่การรื้อของที่สร้างแล้ว สรุป:
- **Modal จากปุ่มในโซนสื่อ = ทางเข้าหลัก** (ตัดสินใจ 2026-07-31)
- ไฮไลต์ประโยค → ทำการ์ด (ของเดิม) = **shortcut เสริมทำทีหลังได้** พรีฟิลข้อความให้ Modal เดียวกัน ไม่ใช่ UI คนละชุด

### 2.1 Video Generator Modal (2 step) — เขียนใหม่ทั้งก้อน ไม่มีของเดิม

เช็คแล้ว `utils/videoUtils.js` มีแค่ `convertVideoIfNeeded` (mov→mp4) — **ไม่มี renderer overlay ข้อความบนวิดีโอเลย**

**เทคนิคที่เคาะ 2026-07-31:** Canvas → PNG overlay (โปร่งใส) → ffmpeg composite — **ไม่ใช้ ffmpeg `drawtext`** (drawtext รองรับฟอนต์ไทย/ตัดคำแย่ ไม่มี grapheme segmentation)
1. `ffprobe` หาขนาดเฟรมของคลิป
2. render ข้อความเป็น PNG โปร่งใสด้วย `@napi-rs/canvas` ที่ขนาดเดียวกับเฟรม — **reuse ฟังก์ชันจาก `utils/quoteStyles.js` ตรงๆ** (`fitFont` / `wrapText` / `lsDraw` / `graphemes` — ตัวตัดคำไทยแบบ grapheme-aware ที่ทำไว้แล้ว) ตามตำแหน่ง บน/กลาง/ล่าง
3. `ffmpeg -i clip -i overlay.png -filter_complex overlay -y out.mp4` — ข้อความนิ่งอยู่ตำแหน่งเดียวตลอดคลิป (ไม่ใช่ animated caption)

**ไฟล์ใหม่ที่ต้องสร้าง:** `utils/videoQuoteOverlay.js` (หรือขยาย `videoUtils.js`) — export ฟังก์ชันรับ `(videoBuffer, quoteText, position)` คืน video buffer ที่ burn ข้อความแล้ว
**API ใหม่:** `POST /api/posts/[id]/media/video-quote` — รับ clip (อัปโหลดใหม่/เลือกจากที่มีในสื่อ) + quote text (พิมพ์เอง/เลือกจาก `post_ai_suggestions`) + position → render → เซฟ `storage/posts/` → insert `post_episode_media` (`kind='video'`)

**UI:**
- Step 1 (ตั้งค่า): เลือกคลิป (อัปโหลด/เลือกจากที่มีในสื่อ) · ใส่ quote (พิมพ์เอง/เลือกจาก suggestions) · ตำแหน่ง `[บน][กลาง][ล่าง]` · ปุ่ม "ดูพรีวิว →"
- Step 2 (ตรวจสอบ): player เล่นคลิปจริง + overlay ตามตำแหน่งที่เลือก · ปรับสีฟอนต์/ความโปร่งแถบหลังข้อความแบบเร็ว · ปุ่ม "⚡ ยืนยันสร้างวิดีโอ" → render จริง → ปิด modal → media item ใหม่โผล่ใน drag&drop ทันที

**ยังไม่เคาะ (ทำต่อวันหลัง):** field เก็บ position/สไตล์ข้อความบน `post_episode_media` — จะ reuse คอลัมน์ `quote_text`/`quote_style`/`bg_path` เดิม (style เก็บเป็น position hint แทนชื่อสไตล์) หรือเพิ่มคอลัมน์ใหม่ ยังไม่ตัดสิน

### 2.2 Quote Generator Modal — reuse renderer เดิม 100%, **ตัด multi-style grid ออก** (revised 2026-07-31)

**เคาะรอบแรก (2026-07-31 เช้า):** เสนอ "Multi-Style Preview Grid" render 7 สไตล์พร้อมกันตอนเปิด step 2 (ไม่รวม `quote-1-ember-ai` ที่ยิง AI — กันไว้แบบเดียวกับ `RANDOM_KEYS` ใน `utils/quoteStyles.js:491-492`) แพงแค่ CPU ไม่ใช่ AI cost แต่...

**กลับคำ (2026-07-31 บ่าย):** user ใช้จริงแค่ 1-2 สไตล์โปรด — grid 7 แบบเกินจำเป็น **ตัดออก** ใช้ pattern เดียวกับ default template ของบอท (`quote_default_template` ใน `resolveConfig` — personal > guild > AI/random) แทน:

- **Step 1:** เลือก background (คลังสื่อ/อัปโหลดใหม่) + ใส่ quote text (พิมพ์เอง / เลือกจาก `post_ai_suggestions` / "✨ ให้ AI คิด Quote" → endpoint ใหม่คล้าย `/api/posts/ai/caption` เก็บผลลง `post_ai_suggestions`)
- **Step 2:** **Preview เดียว** — render ทันทีด้วยสไตล์ default ของ user (จำค่าล่าสุดผ่าน `user_config` เหมือนฝั่งบอท) **ไม่ auto-render หลายแบบ** · มีปุ่ม/dropdown เล็ก "ลองสไตล์อื่น" สลับทีละแบบ render ตอนกดจริงเท่านั้น (ไม่ batch) · ตัวเลือก "✨ AI จัดให้" แยกไว้ท้ายสุด กดถึงยิง AI ครั้งเดียว
- **Step 3:** fine-tune (ครอป 1:1/4:5/16:9 · สี saturation slider · ลายน้ำ) → **`[ Save & Add to Post ]`** → render จริง → เซฟ PNG ลง `storage/posts/` → insert `post_episode_media` (`kind='quote'`, `quote_text`/`quote_style`/`bg_path` ครบตามคอลัมน์ที่มีอยู่แล้ว) → ปิด modal → media item โผล่ใน drag&drop ทันที

**ไฟล์ใหม่ที่ต้องสร้าง:** แค่ UI (`QuoteGeneratorModal.jsx`) + API เดียว `POST /api/posts/[id]/media/quote` — **renderer ไม่ต้องเขียนใหม่เลย** เรียก `renderQuoteStyle()` จาก `utils/quoteStyles.js` ตรงๆ ตามกติกาข้อ 16 (§ผ่าน `/grill`) ที่ห้าม copy/เขียน renderer ใหม่ฝั่งเว็บ

---

## 🗄️ (อ้างอิงเดิม) basket เป็นแม่แบบยังไง — เคาะ 2026-07-28

> "ทำคล้ายๆ basket ใน media บนหน้าเว็บนั่นแหละ"

**ข้อสังเกตสำคัญ:** หน้าเว็บ basket ทุกวันนี้ **แก้ได้อย่างเดียว โพสต์ไม่ได้** — บนหน้าเขียนไว้เองว่า _"เรียงลำดับรูปและแก้ caption แล้วกลับไปกด **สร้างโพสต์** ใน Discord"_
ตัวเลือกตอนโพสต์อยู่ใน Discord หมด (`basket_group` / `basket_platform` / `basket_wm_type` / modal ตั้งเวลา)

→ **posts = basket ที่ยกชุดควบคุมการโพสต์ขึ้นมาไว้บนเว็บด้วย** เขียนจบ โพสต์จบ ในที่เดียว

### แม่แบบที่ลอกมาตรงๆ

| basket (ของเดิม) | posts (ของใหม่) |
|---|---|
| หน้า list ตะกร้า → หน้า detail | หน้า list series → หน้า detail ตอน |
| รูป: ลากเรียง / ◀▶ / ลบ | ภาพประกอบต่อตอน — กลไกเดียวกันเป๊ะ |
| caption (textarea + autosave) | เนื้อหาตอน (autosave เหมือนกัน) |
| ปุ่มล้างตะกร้า | ลบ/เก็บเข้ากรุตอน |
| `basket_group` เลือกกลุ่มบัญชี | dropdown เลือกกลุ่มบัญชี **(ย้ายขึ้นเว็บ)** |
| `basket_platform` เลือกหลาย platform | multi-select platform **(ย้ายขึ้นเว็บ)** |
| `basket_wm_type` ลายน้ำ | dropdown ลายน้ำ **(ย้ายขึ้นเว็บ)** |
| modal ตั้งเวลา (ไทย, ต้อง ≥20 นาที) | ช่องตั้งเวลา **(ย้ายขึ้นเว็บ)** — กติกา ≥20 นาที เอาตามเดิม |
| กด "สร้างโพสต์" ใน Discord | ปุ่มโพสต์บนเว็บ → เขียนลง `post_social_history` |

### ที่ posts มีเพิ่มจาก basket
- **series → ตอน** (basket เป็นก้อนเดียว ไม่มีลำดับตอน)
- **สถานะ + อนุมัติ** — ร่าง → รอบรรณาธิการ → อนุมัติ → ตั้งเวลา/โพสต์แล้ว
- **AI ช่วยร่าง** — ซอยตอน / เกลาสำนวน / คิดแคปชัน+ภาพประกอบ
- **โหมด personal / org**
- **ข้อความต่างกันรายแพลตฟอร์ม** (X สั้น FB ยาว)

---

## 🔍 ลอกจากท้องตลาด (สำรวจ 2026-07-28)

เจ้าที่ใกล้ที่สุด: **Planable** (collaboration-first), **Buffer** (เรียบง่าย), **Hootsuite** (enterprise), **Later** (visual-first)
ราคาตลาด: เดี่ยว/ทีมเล็ก $5–50/เดือน · enterprise $199–399/seat/เดือน

### ที่ควรลอก (เรียงตามคุ้มค่า)

| pattern | ใครทำ | ทำไมเหมาะกับเรา |
|---|---|---|
| **อนุมัติผ่านลิงก์ โดยไม่ต้องมีบัญชี** | Planable | ⭐ แก้ปัญหาที่เจอจริงทุกซีรีส์ — ทีมกฎหมาย/สื่อสารพรรคต้องตรวจก่อนโพสต์ แต่ไม่มีใครอยากสมัคร account ในระบบเรา ส่งลิงก์ให้กด "อนุมัติ/คอมเมนต์" ได้เลย |
| **preview ตามหน้าตาจริงของแต่ละแพลตฟอร์ม** | Planable, Later | เรายิง FB/IG/Threads/X ที่ข้อจำกัดต่างกันมาก (X ต้องซอย thread, IG ตั้งเวลาไม่ได้) เห็นก่อนโพสต์ = ลดพลาด |
| **ร่างเดียว แตกข้อความต่างกันรายแพลตฟอร์ม** | Planable, Buffer | ตอนนี้ทำมือ — X สั้น FB ยาว ควรเก็บเป็น variation ของตอนเดียวกัน ไม่ใช่ copy ไปแก้ |
| **คอมเมนต์ติดกับเนื้อหา** (ไม่ใช่แชทแยก) | Planable, Buffer | feedback อยู่ข้างย่อหน้าที่พูดถึง ไม่ต้องไล่หาว่าหมายถึงตรงไหน |
| **ล็อกโพสต์หลังอนุมัติ** | Planable | กันแก้หลังทีมกฎหมายเซ็นผ่านแล้ว |
| **ปฏิทิน drag-drop + ป้ายสี + filter ตามสถานะ/คนเขียน** | ทุกเจ้า | ของ Buffer filter ได้แค่ draft/scheduled/sent → ถือว่าอ่อน อย่าลอกแบบนั้น |
| **ระดับการอนุมัติปรับได้: ไม่มี / ไม่บังคับ / บังคับ / หลายชั้น** | Planable, Hootsuite (3 ชั้น) | ตรงกับ multi-tenant — แต่ละองค์กรตั้งเองว่าต้องผ่านกี่ด่าน |

### ที่ไม่ต้องลอก
- analytics/social inbox — คนละงาน ไม่ใช่ปัญหาที่เราจะแก้
- AI แบบ "gen โพสต์ให้ทั้งดุ้นจากคีย์เวิร์ด" — เราต้องการ AI ช่วย**เกลา/ซอยตอน**ของที่เขียนเอง ไม่ใช่ผลิตคอนเทนต์แทน

### 💡 ควรทบทวน MVP
ตอนแรกเคาะว่า MVP ไม่เอา approval workflow — แต่ **"อนุมัติผ่านลิงก์โดยไม่ต้องมีบัญชี"** แก้ปัญหาที่เจอจริงอยู่แล้วทุกซีรีส์
เสนอให้ดึงเข้า MVP แบบเรียบที่สุด (ลิงก์ + ปุ่มอนุมัติ + ช่องคอมเมนต์ ไม่ต้องมีหลายชั้น) — รอ requirement จาก user

---

## 🔥 ผ่าน `/grill` แล้ว 2026-07-29 — 15 กิ่งที่เคาะ

| # | กิ่ง | เคาะว่า |
|---|---|---|
| 1 | ย้าย `personal` → `org` | **ทางเดียว มีเงื่อนไข** — เจ้าของกด "เปิดให้ทีมเห็น" ได้เฉพาะตอนยังไม่มีคอมเมนต์/อนุมัติ/publish job · **ย้อนกลับไม่ได้** (คอมเมนต์+revision ของคนอื่นผูกอยู่แล้ว) · ทิศกลับใช้ "ก๊อปเป็นซีรีส์ใหม่" · เก็บ audit ใครเปิดเมื่อไหร่ |
| 2 | ใครอ่าน org series | **ทุกคนในองค์กร** (2,724 คนใน org 1) — ยอมรับว่าร่างที่ยังไม่ผ่านบรรณาธิการรั่วออกได้ |
| 3 | ใครแก้ org series | **เป็น policy ราย org ไม่ใช่กติกาตายตัว** |
| 4 | รูปร่าง policy | `org_config` key **`posts_policy`** = `{"read":"org","write":"org","approval":"required"}` · ค่า scope มี 2 ระดับ: `org` (ทุกสมาชิก) / `team` (เจ้าของ+`editor`+admin/SG) · **default = org/org/required** · หน้า `/org/settings` มี 3 dropdown · `personal` ไม่เกี่ยวกับ policy เจ้าของคนเดียวเสมอ |
| 5 | ไฟล์สื่ออยู่ไหน | **นอก `public/`** → `storage/posts/<uuid>` + เสิร์ฟผ่าน `/api/posts/media/[id]` ที่เช็ค `postsAccess` ก่อน stream (ไม่ลอก `public/uploads/` แบบ finance เพราะร่าง personal เป็นเนื้อหาการเมือง) · **worker ฝั่งบอทอ่านจากดิสก์เดียวกัน** (เก็บ path relative จาก repo root) |
| 6 | ลบตอน/ซีรีส์ | ปุ่มปกติ = **archive** (`archived_at`) · เจ้าของ/admin ลบถาวรได้ → ลบแถว cascade แต่ **ไม่ unlink ทันที** · `scripts/posts/gc-media.js` เก็บกวาดไฟล์กำพร้าอายุ >7 วัน · **ห้ามลบถาวรถ้ายังมี job `pending`/`scheduled`** |
| 7 | ยิง 3 แพลตฟอร์มล้ม 1 | **1 แถว job = 1 ตอน × 1 แพลตฟอร์ม** + `batch_id` มัดให้ UI แสดงเป็นก้อนเดียว → retry ต่อแพลตฟอร์ม ไม่มีทางโพสต์ซ้ำ · เลิกใช้คอลัมน์ `platforms` พหูพจน์ |
| 8 | job ล้มถาวร (retry ครบ 3) | **ป้ายในเว็บเป็นหลัก** (การ์ดซีรีส์ + ปุ่มลองใหม่) + **DM Discord หาคนสั่งโพสต์แบบ best-effort** ถ้าผูก discord ไว้ (org ไม่มี Discord ก็ยังใช้ได้) |
| 9 | แก้ตอนที่ published แล้ว | **แก้ได้ในระบบ ไม่ sync กลับแพลตฟอร์ม** — เขียน revision + ขึ้นป้าย "ต่างจากที่เผยแพร่แล้ว" (เทียบกับ snapshot ใน job) · อยากให้ออกจริง = กด "โพสต์อีกครั้ง" = job ใหม่ · เหตุผล: FB แก้ได้ แต่ IG/Threads/X แก้ไม่ได้ → ปุ่มเดียวจะมี 4 พฤติกรรม |
| 10 | `episode.status` เก็บอะไร | **สถานะงานเขียนเท่านั้น** = `draft`/`review`/`approved` · `scheduled`/`published`/`failed` เป็น **derived จาก `post_social_history`** (หน้า list join เพิ่ม 1 ชั้น) — ไม่มี state เพี้ยนตอนตอนหนึ่งขึ้น FB แล้วแต่ X ล้ม |
| 11 | อนุมัติเป็นประตูก่อนโพสต์ไหม | **บังคับสำหรับ org series** (ต้อง `approved` ถึงสร้าง job ได้) · **`personal` ข้ามเสมอ** — เจ้าของโพสต์ได้เลย · ปรับเป็น `optional` ได้รายองค์กรผ่าน `posts_policy.approval` |
| 12 | ลิงก์รีวิวอนุมัติได้แค่ไหน | **อนุมัติเต็มตัว เท่ากับ editor กด · รายตอน** — ⚠️ แก้ 2026-07-29: **token ผูก `episode_id` ตรงๆ** (เดิมผูก series แล้วกดทีละตอน — ซับซ้อนเกินเหตุในเมื่ออนุมัติรายตอนอยู่แล้ว + เพิกถอนรายตอนไม่ได้) · ส่งหลายลิงก์ถ้าอยากให้ตรวจหลายตอน · default **หมดอายุ 7 วัน** · revoke ได้ · ต้องกรอกชื่อ · บันทึก `uses` + IP · หน้า `/review` `noindex` · **ความเสียหายจำกัดเพราะปุ่มโพสต์ยังต้อง login เสมอ** |
| 13 | โควตา AI | **เพดานต่อคนต่อวัน** (เก็บใน `user_config` เช่น 30 ครั้ง/วัน) + **เรียกได้เฉพาะคนที่มีสิทธิ์เขียนตาม `posts_policy.write`** · เกินแล้วขึ้นข้อความตรงๆ · key เดียวของโปรเจกต์ (`ANTHROPIC_API_KEY` ผ่าน `getAgentConfig()`) จึงต้องกันบิลพุ่งจากสมาชิกหลักพัน |
| 14 | 2 คนแก้ตอนเดียวกัน | **optimistic lock** — autosave ส่ง `updated_at` ที่โหลดมาด้วย ไม่ตรง → **409 + บล็อกการเซฟ** แล้วถาม "คนอื่นแก้ไปแล้ว โหลดใหม่ / เก็บฉบับของฉันเป็น revision" · ไม่ใช่ last-write-wins |
| 15 | job เลยเวลาเพราะบอทดับ | **grace 2 ชม.** — เลยไม่เกิน 2 ชม. ยิงเลย · เกินกว่านั้น → `stale` + ป้ายในเว็บ + DM ถาม "โพสต์เลย / ตั้งเวลาใหม่" · กันโพสต์เช้าโผล่ตอน prime time ผิดช่วง |

### ♻️ กติกาข้อ 16 — ใช้โค้ดร่วมกับตะกร้าสื่อของบอทให้มากที่สุด (user สั่ง 2026-07-29)

> "ตอน publish หรืออื่นใด อยากให้ใช้ library เดียวกันกับ bot social share เวลาจะ bug จะได้แก้ที่เดียว"

**หลัก: posts ห้ามมี logic การโพสต์เป็นของตัวเอง** — เป็นแค่คนสั่งงานท่อเดิม

| ของกลาง | ใครใช้ | กติกา |
|---|---|---|
| `services/metaApi.js` · `services/xApi.js` | ตะกร้าดิสฯ + worker | **ห้ามแตะนอกจากเพิ่ม param `accountId`** · ห้ามเขียน HTTP call ไป Graph API ที่อื่นเด็ดขาด |
| **`services/publishPipeline.js`** (ยกออกจาก `basketHandler` ก้อน 4) | ตะกร้าดิสฯ + worker | ลำดับ ติดลายน้ำ → เลือกบัญชี → ยิงทีละแพลตฟอร์ม → เก็บผล อยู่ที่นี่ที่เดียว · `basketHandler` ต้องเหลือแค่โค้ด UI ของ Discord · **ตะกร้าต้องเปลี่ยนมาเรียกตัวนี้ในรอบเดียวกัน ไม่ใช่ปล่อยของเดิมไว้แล้วก๊อป** ไม่งั้นได้ 2 ท่อที่ค่อยๆ เพี้ยน |
| `utils/quoteStyles.js` · `utils/watermarkImage.js` · `shortenQuote()` | บอท + **เว็บ import ตรงจาก repo root** (`outputFileTracingRoot` ชี้รากแล้ว — [next.config.js:9](web/next.config.js#L9)) | **ห้าม copy/เขียน renderer ใหม่ฝั่งเว็บ** (ย้ำจาก §หน้าจอ) · spike ก้อน 2b เช็คแค่ว่า import ข้าม package ได้ไหม · ไม่ผ่าน → ให้บอท render ผ่านคิว ไม่ใช่เขียนใหม่ |
| `services/newsShare.js` | ทั้งคู่ | `news` เป็น "แพลตฟอร์ม" หนึ่งใน job ได้เลย (เฉพาะ org ที่มี guild) — ไม่ต้องเขียนทางส่งเข้า Discord ใหม่ |
| **ประวัติการโพสต์** | ทั้งคู่ | ⚠️ แก้ 2026-07-29: **ไม่ใช้ `dc_media_history` แล้ว** — คิวกับประวัติเป็นตารางเดียวกันคือ `post_social_history` (แถว done = ประวัติ) · ก้อน 4 ย้าย 10 แถวเข้ามาแล้ว drop ตารางเก่า + แก้ `getHistory()` ฝั่งบอทให้อ่านตารางใหม่ · **ห้ามเขียนประวัติ 2 ที่** |
| `getConfig()` เลือกบัญชี (`metaApi`/`xApi`) | ทั้งคู่ | posts ส่ง `social_account_id` เข้าไป — ไม่มี query หาบัญชีเองใน `web/db/posts/` |

**เส้นที่ยังต้องแยก:** เว็บไม่ import `services/` ที่แตะ discord.js/pool ของบอท (กำแพงเดิม grep แล้ว 0 จุด) → เว็บสั่งงานผ่านแถวใน `post_social_history` เท่านั้น · ของกลางที่เว็บ import ตรงได้ = **โมดูล pure ใน `utils/` เท่านั้น**

**สิ่งที่ตามมากับ schema:** `post_social_history` (คิว+ประวัติรวมกัน) `.platform` เอกพจน์ + `batch_id` + status `stale` · `post_episodes.status` เหลือ 3 ค่า + ใช้ `updated_at` เป็น lock · `post_series` เพิ่ม audit ตอนเปลี่ยน visibility · `post_episode_media.path` ชี้ `storage/posts/`

---

## ⏭️ ขั้นถัดไป

0. ~~**Phase 0** — `dc_social_accounts` → org-native~~ ✅ เสร็จ 2026-07-29 (ยังไม่ deploy prod)
1. ~~เคาะวิธีเชื่อมเว็บ→บอท · อนุมัติผ่านลิงก์ · data model · หน้าจอ~~ ✅ เคาะครบ 2026-07-29 (ดูข้างบน)
2. ~~`/scrutinize` แผน~~ ✅ รัน 2 รอบ (Phase 0 · แผน posts) — ของที่เจอแก้เข้าแผนแล้ว
3. ~~`/grill` ก่อน implement~~ ✅ รัน 2026-07-29 — 16 กิ่งเคาะครบ (ดู §ผ่าน `/grill` ข้างบน) · **⬅️ ต่อตรงนี้: เริ่มก้อน 1 ได้**
4. implement ตามก้อน 1-6 (ดู `md/PENDING.md` §POSTS)
5. migrate เนื้อหาจาก `posts/` เข้า DB แล้วค่อยเลิกใช้โฟลเดอร์นั้น (series D/E → `personal`)

### 🧾 สรุปสิ่งที่เคาะรอบ 2026-07-29

| ประเด็น | เคาะว่า |
|---|---|
| เว็บ→บอท | **ตารางคิว `post_social_history`** (ได้ custom scheduler ของ X/IG มาฟรี) · รวมประวัติไว้ในตารางเดียวกัน |
| อนุมัติ | **ลิงก์อนุมัติ ไม่ต้องมีบัญชี** เข้า MVP · ชั้นเดียว |
| ประตูหลักเข้าโมดูล | **โยนไอเดีย → AI จัดโครง** (AI ขยับจากก้อน 5 → ก้อน 2) |
| AI คืนอะไร | **โครงก่อน แล้วร่างทีละตอน** · model `claude-sonnet-5` |
| ชนิดโพสต์ | **ไม่แยก type** — ข้อความ + สื่อ 0..n (`upload`/`quote`) |
| สื่อ | ตาราง `post_episode_media` (ไม่ใช้ jsonb, ไม่ใช้ `dc_media_baskets` ร่วม) |
| ส่งเข้าตะกร้าดิสฯ | **ตัดออก** (2026-07-29) |
| prefs ผู้ใช้ | แปลง `dc_user_config` → `user_config` key ด้วย `user_id` (ไม่สร้างตารางใหม่) |
| บัญชีที่โพสต์ | job เก็บ `social_account_id` + เพิ่ม param `accountId` ให้ `getConfig`/`postTo*` |
| ตั้งเวลา | คิวเราถือเอง **ไม่ส่ง `scheduled_publish_time` ให้ FB** → กติกา ≥20 นาทีหายไป + ตั้งเวลา IG/X ได้ |
| ท่อโพสต์ | **แยก `services/publishPipeline.js`** ออกจาก `basketHandler` ให้ตะกร้ากับ worker ใช้ร่วม |

---

## 📦 เนื้อหาที่รอ migrate

โฟลเดอร์ `posts/` ที่ repo root — 5 series (A–E, 22 ตอน) เขียน draft แรกไว้แล้ว
ดู `posts/INDEX.md` · **ยังห้ามลบจนกว่า module จะใช้งานได้จริง**

⚠️ series D (พรรคมวลชน) และ E (ค่าตอบแทน/ส.ส.) เป็นเนื้อหาจุดยืนการเมือง — ตอน migrate ต้องเข้าโหมด `personal` ไม่ใช่ `org`
