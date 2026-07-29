# Posts — เครื่องมืองานสื่อ (เขียนคอนเทนต์ → เผยแพร่)

โมดูลช่วย **เขียน/ร่างคอนเทนต์ยาว ซอยเป็นตอน** แล้วส่งต่อเข้าท่อเผยแพร่เดิม (ตะกร้าสื่อ → FB/IG/Threads/X/Discord)
เป็น org-native feature ตัวที่ 5 ต่อจาก finance / calling / docs / cases

> สถานะ: **ยังไม่ implement** — เอกสารนี้คือ spec ที่คุยเคาะไว้ (2026-07-28) ยังไม่ผ่าน `/scrutinize`

---

## 🎯 ที่มา

เดิมเขียนคอนเทนต์เป็นไฟล์ plain text ใน `posts/` แล้ว copy ไปวาง Facebook เอง — ปัญหา:
- ผูกกับเครื่องเดียว เขียนนอกบ้านไม่ได้
- ไม่ต่อกับระบบเผยแพร่ที่มีอยู่แล้วในโปรเจกต์
- เป็นเครื่องมือของคนคนเดียว ไม่ใช่ของทีมสื่อ

**ครึ่งเผยแพร่สร้างไว้แล้วเกือบครบ** (ดู "ของเดิมที่ต่อได้เลย") — ที่ขาดคือครึ่ง authoring

---

## 🔑 แนวคิดหลัก

- **Core term:** `post` · โครงข้อมูล **series → episode** (1 series มีหลายตอน เรียงลำดับ)
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

### 🏷️ ชื่อตาราง — **ไม่เปลี่ยน** (เคาะ 2026-07-28)

**อย่าเปลี่ยนเป็น `post_social_accounts`** — ตารางนี้ไม่ใช่ของ posts แต่เป็นโครงสร้างพื้นฐานที่ใช้ร่วมกัน:
ตะกร้าสื่อใน Discord (มาก่อน posts) · guild-watermarks · Meta/X OAuth callback · แล้วค่อยมี posts

ตั้ง prefix `post_` = อ้างสิทธิ์ของกลางให้โมดูลเดียว → วันหน้ามีคนคิดว่า "เลิกใช้ posts ก็ drop ได้" แล้วตะกร้าสื่อพัง

convention ที่ใช้จริง: **prefix = โมดูลเจ้าของ** (`dc_` 18 · `org_` 8 · `finance_` 7 · `cooking_` 6 · `docs_`/`calling_`/`case_` 5)

**เปลี่ยน `dc_` → `social_` ดีไหม?** ตรงกว่าเมื่อเป็น org-native แล้ว แต่ **ยังไม่ทำ** — โดน 34+ จุดทั่ว repo · ตอน migrate calling เคยเจอ bulk-rename ทำ `orgId` ไหลเข้า `guild_id` มาแล้ว · ไม่ปลดล็อกอะไร · เอามารวมกับ migration จริง = เสี่ยงฟรี
→ ถ้าจะทำ ทำเป็นรอบแยกตอนไม่มีอะไรค้าง

**ตารางใหม่ของ posts ใช้ `post_` ได้เต็มที่:** `post_series`, `post_episodes`, `post_publish_jobs`

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

**เสนอ: ตารางคิวงาน `post_publish_jobs`** — เว็บเขียนแถว → บอทวนหยิบไปเรียก `metaApi` แบบเดิมเป๊ะ

| ทำไมเลือกอันนี้ | |
|---|---|
| ไม่ต้องสร้าง HTTP API + auth ระหว่างเว็บกับบอทใหม่ | |
| งานไม่หายถ้าบอทรีสตาร์ต + retry ได้เอง | |
| **X/IG ต้องเขียน custom scheduler อยู่แล้ว** → ตารางนี้คือ scheduler ตัวนั้นพอดี ได้ 2 อย่างจากกลไกเดียว | |
| ไม่ต้องแก้ `metaApi.js` สักบรรทัด | |

ข้อแลกเปลี่ยน: บอทต้องรันอยู่เว็บถึงจะโพสต์ออก (วันนี้ก็เป็นแบบนั้นอยู่แล้ว)
**สถานะ: เสนอไว้ ยังไม่เคาะ**

---

## 🖥️ หน้าจอ — เอา `/bot/media/basket` เป็นแม่แบบ (เคาะ 2026-07-28)

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
| กด "สร้างโพสต์" ใน Discord | ปุ่มโพสต์บนเว็บ → เขียนลง `post_publish_jobs` |

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

## ⏭️ ขั้นถัดไป

0. ~~**Phase 0** — migrate `dc_social_accounts` → org-native~~ ✅ เสร็จ 2026-07-29 (ยังไม่ deploy prod)
1. **เคาะ 2 ข้อที่ค้าง** — (ก) วิธีเชื่อมเว็บ→บอท (เสนอ `post_publish_jobs`) · (ข) ดึง "อนุมัติผ่านลิงก์" เข้า MVP ไหม
2. เคาะ data model + หน้าจอ
3. เขียน plan → **รัน `/scrutinize`** (บังคับตาม CLAUDE.md ก่อน implement)
4. implement
5. migrate เนื้อหาจาก `posts/` เข้า DB แล้วค่อยเลิกใช้โฟลเดอร์นั้น

---

## 📦 เนื้อหาที่รอ migrate

โฟลเดอร์ `posts/` ที่ repo root — 5 series (A–E, 22 ตอน) เขียน draft แรกไว้แล้ว
ดู `posts/INDEX.md` · **ยังห้ามลบจนกว่า module จะใช้งานได้จริง**

⚠️ series D (พรรคมวลชน) และ E (ค่าตอบแทน/ส.ส.) เป็นเนื้อหาจุดยืนการเมือง — ตอน migrate ต้องเข้าโหมด `personal` ไม่ใช่ `org`
