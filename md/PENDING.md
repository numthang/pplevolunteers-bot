# PENDING.md — Backlog & Ideas

> เก็บเฉพาะงานค้าง + design ที่ยังไม่ทำ · ของที่ทำเสร็จ+deploy แล้วย้ายไปอยู่ในโค้ด/`md/*` ตามระบบ

## 🎉 CUTOVER org-core → master ขึ้น PROD สำเร็จ
> รายละเอียด/ประวัติย้ายไป `md/archive/CUTOVER.md` แล้ว — ที่เหลือคืองานค้าง
> ⬜ เหลือ smoke test หน้าจริงบน prod (finance/calling/docs/cases/roles/profile) + ดูบอทนิ่ง
> ⬜ หลังนิ่งแล้ว rename `01-identity-refactor.sql` → `.applied.sql` กันรันซ้ำ (DESTRUCTIVE)

## 🔑 Phase 4 identity — บัญชีเดียว หลายช่องทาง login
> รายละเอียด/ประวัติย้ายไป `md/org/AUTH.md` แล้ว — ที่เหลือคืองานค้าง
- [ ] **decouple ประตู login เบอร์ออกจาก Discord** — `findOwnerByVerifiedPhone` ยังมี `AND discord_id IS NOT NULL` → คนที่มีแต่เบอร์ยัง login ไม่ได้ (นี่คือตัวปิดจ๊อบ "เบอร์ยืนเดี่ยว")
- [ ] **เปิดสมัครด้วยเบอร์ (open signup)** — ⛔ ห้าม ship ก่อนมี **rate-limit ต่อเบอร์ + ต่อ IP**
- [ ] **ทิ้ง `dc_user_config` ให้หมด** (ทำพร้อม decouple เบอร์ข้างบน) — 2026-07-29 prefs ย้ายไป `user_config` แล้ว เหลือแค่ OTP state (`otp_quota`, `otp_verify_<guildId>`) ที่ `db/otpSession.js` ถือไว้ · ย้ายเข้า `auth_nonces` ได้จริง (`user_id` **nullable** — คนที่ยังไม่มี users row เก็บได้) แค่ต้องแต่งคีย์เอง `otp:<guildId>:<discordId>` + payload เก็บ session · ทำแล้ว DROP ตารางได้เลย (ตอนนี้เหลือ 1 แถวค้างจาก 8 ก.ค.)
- [ ] **Discord email bridge** — อ่าน `profile.email` เฉพาะ `verified===true` มา match บัญชีเดิม (payload มีค่ามาอยู่แล้ว แต่ jwt branch ทิ้ง)
- [ ] **UI ตอนชนกัน** ("เบอร์/อีเมลนี้มีเจ้าของแล้ว") — ตอนนี้ block เฉยๆ ยังไม่มีทางออกให้ user
- [ ] **ยังไม่มี login ด้วย email บนหน้า `/login`** (มีแต่ฝั่ง org) + ยังไม่ได้เคาะลำดับปุ่ม login (จด NOTE.md 2026-07-26)
- [ ] ⬜ **ยังไม่ได้กดเทสจริงในเบราว์เซอร์ + ยังไม่ได้รัน migration บน prod**

---

## ✅ ปลดล็อกแล้ว — ORG_ACCESS_REDESIGN ขั้น 5 เสร็จ
> รายละเอียด/ประวัติย้ายไป `md/org/ORG_ACCESS_REDESIGN.md` แล้ว — ที่เหลือคืองานค้าง
- [ ] ขั้น 6 — ลบ `web_roles` + `geography.js` (`roles` เก็บไว้เป็น log) · ทำหลังใช้จริงแล้วนิ่ง
- [ ] ⬜ **ขั้น 5 ยังไม่ได้เปิดดูจริงในเบราว์เซอร์** — verify ที่ผ่านคือ build + live 7/7 + unit 206/206 เท่านั้น
- [ ] **ให้พื้นที่ตอนแต่งตั้ง** — ตอนนี้ admin ให้ได้แต่ "ตำแหน่ง" · พื้นที่มาจากเจ้าตัวกรอกที่อยู่เอง (`setSelfDeclaredScope`) เท่านั้น → `/api/org/appoint` ต้องรับ `scopeNodeId` ด้วย
- [ ] **`org_role_defs.managed_by`** ก่อนจะเปิดให้ admin แก้ใบยศเอง — ตอนนี้ `syncRoleDefFromGuildRole` ทำ `ON CONFLICT (org_id,name) DO UPDATE SET permission, scope_node_id` → ถ้ามี writer ที่ 2 ชื่อชนเมื่อไหร่ Discord sync ทับทิ้งเงียบๆ
- [ ] `WANT_SQL` ใน `db/orgMemberRoles.js` ไม่ filter `d.is_active` → ใบยศที่ปิดแล้วยังสะสมแถวใน `org_member_roles` (ไม่อันตราย อ่านกรองอยู่แล้ว แต่รกและงงตอนดูหน้าสมาชิก)
- [ ] **อย่าเพิ่งลดบทบาท `/bot/roles` เหลือ dropdown** — `dc_guild_roles.scope_node` ยังถูกอ่านตรงๆ ที่ `db/members.js:58` + `scripts/calling/sync-discord-members.js:25` (บอท build ไม่จับ)

---

## 📍 อ่านตรงนี้ก่อน — สถานะ (อัปเดต 2026-07-29)

**org migration ปิดจบแล้วทั้งหมด** — identity split + org core + org-scope ครบทั้ง 4 ฟีเจอร์ (finance · calling · docs · cases) + audit_logs · **ไม่เหลือ tenant data ที่ยัง guild-based**

**✅ cutover ขึ้น prod สำเร็จแล้ว 2026-07-23** (ดูหัวข้อแรกสุดของไฟล์นี้ · runbook + ผลอยู่ `md/archive/CUTOVER.md`) — ข้างล่างนี้เป็นบันทึกการซ้อมก่อน cutover เก็บไว้เป็นหลักฐาน/อ้างอิง
- ✅ **ซ้อม migration กับ dump ของ prod — ผ่านแล้ว 2026-07-23** `./scripts/migration/org-scope/rehearse.sh backups/dump-pple_volunteers-202607230242.sql`
  ครบ 13 ขั้น **7–14 วินาที** (= downtime จริง) · users 6615 · org_members 7345 · org_member_roles 6505 · scope_nodes 97 (มีแม่ 90) · ตัวตรวจ 6 บรรทัดได้ 0 ครบ
  **เจอ 5 บั๊กที่ dev ไม่มีทางเจอ** (แก้+push แล้ว): `-1` หายจากคำสั่ง prod · `DEFAULT NULL::varchar` 4 คอลัมน์ใน calling · guild ที่ org_id NULL (NamWa/พันธมิตรชานม) · bash 3.2 บน macOS · dropdb ล้มแล้ววิ่งต่อ
- ✅ **data-layer หลัง migrate = สะอาด (ตรวจ SQL บน pple_rehearsal 2026-07-23):** person ref ทุกช่อง→users 0 หลุด · FK valid หมด · RBAC 6505 ยศ/2332 คน ไม่มีกำพร้า · guild นอกองค์กร (NamWa/พันธมิตรชานม) 0 รั่วเข้า RBAC · cases thread รู้ guild 0 หลุด · โปรไฟล์แยกตำแหน่ง/พื้นที่ได้ (มีคนถือ 94 พื้นที่จริง) · scope tree 90/97 มีพ่อ 0 พ่อลอย
- ⛔ **เหลือ UI smoke test เท่านั้น** (ต้องสายตาคน — query ผ่าน≠จอถูก): หน้าไม่ 500 · `/org/settings/roles` กดเพิ่ม/ลบ/ย้าย node · `/profile` 2 บรรทัด+ปุ่มกาง · finance/calling/docs/cases เปิดดูได้ · ชี้ `DB_NAME=pple_rehearsal`

**เอกสารกวาดตรง schema จริงแล้ว (2026-07-21)** — DATABASE.md regenerate จาก DB สด 58 ตาราง · CASE/DOCS/CALLING/CONTACT ตามมา · งานที่งอกจากรอบนี้อยู่หัวข้อ 🧹 ท้ายไฟล์

> ⚠️ หัวข้อข้างล่างเรียงตาม**ประวัติการทำงาน** ไม่ใช่ลำดับความสำคัญ · เช็ค `[x]/[ ]` ก่อนเชื่อว่ายังไม่ได้ทำ

---

## ✍️ POSTS — เครื่องมืองานสื่อ · ดีไซน์เคาะครบ 2026-07-29 ยังไม่เขียนโค้ดสักบรรทัด

spec + ดีไซน์ + ตารางทั้งหมดอยู่ `md/posts/POSTS.md` (อ่านก่อนเสมอ ห้าม re-derive) · `/scrutinize` ผ่าน 2 รอบแล้ว

> ⛔ **2026-07-29 เย็น — ทิ้ง `post_series` ทั้งตาราง** (user เคาะ) หน่วยหลัก = ตอนเดี่ยวๆ จัดกลุ่มด้วยคอลัมน์ `post_episodes.category` · visibility อยู่ที่ตัวโพสต์ · 1 โพสต์ 1 หมวด · ไม่มีเลขลำดับตอน
> → **ก้อน 1 ต้องรื้อก่อนทำ 2a ต่อ:** migration block ก้อน 1 · `postsAccess.js` + 62 tests · `web/db/posts/*` · `postsGuard.js` · `md/posts/API-2a.md` (ยังไม่ขึ้น prod → รื้อได้ฟรี) · รายละเอียดอยู่ `md/posts/POSTS.md` §Data model

**⬜ ทำตามลำดับ:**
- [x] **`/grill`** ✅ 2026-07-29 — 16 กิ่งเคาะครบ อยู่ `md/posts/POSTS.md` §ผ่าน `/grill` (policy ราย org · job 1 แถว/แพลตฟอร์ม · ไฟล์นอก `public/` · optimistic lock · grace 2 ชม. · **ใช้ท่อโพสต์ร่วมกับตะกร้าดิสฯ ห้ามเขียนใหม่**)
- [x] **ก้อน 1** ✅ 2026-07-29 (local — ยังไม่ deploy prod) — 7 ตาราง posts + `postsAccess.js` (62 tests ผ่าน) + `orgFeatures` key `posts`
  - `dc_user_config` → `user_config` (key = users.id) เสร็จด้วย: prefs 7 แถวย้ายแล้ว · **OTP state ยังอยู่ `dc_user_config`** แยกเป็น `db/otpSession.js` เพราะตอนยืนยันตัวตน users row อาจยังไม่เกิด
  - แก้ 3 route ที่ยิงตารางตรงๆ: `bot/quote-config` · `watermark/personal` · `docs/sign/self-info` (ใช้ `session.user.userId`)
  - verify: `npm test` 268 ผ่าน · `npm run build` ผ่าน · smoke บอท read/write/delete prefs + อ่าน otp_quota ผ่าน
  - ⏭️ prod: รัน 2 บล็อกท้าย `migration.sql` (additive ล้วน) แล้ว restart บอท+เว็บ
- [x] **ก้อน 2a** ✅ 2026-07-29 เย็น (local — ยังไม่ deploy prod · **เทสในเบราว์เซอร์จริงผ่านแล้ว**)
  - schema รื้อใหม่: 6 ตาราง ไม่มี `post_series` · `post_episodes` ถือ org/owner/visibility/category เอง
  - lib: `postsAccess.js` (post-centric, 66 tests) · `postsGuard.js` (`postsContext`/`postContext`) · `postsAiQuota.js` · `postsStorage.js` · `ai.js`
  - db: `web/db/posts/episodes.js` (autosave + optimistic lock + revision-เมื่อคนแก้เปลี่ยนคน + category/rename) · `media.js`
  - API 13 ไฟล์: `/api/posts` · `[id]` (GET/PATCH autosave/DELETE) · status · promote · revision(s) · categories · `[id]/media` · `media/[id]` (stream ผ่าน gate) · `ai/outline` · `ai/draft`
  - UI: `/posts` (แท็บส่วนตัว-องค์กร + กล่องไอเดีย + แถบหมวด + การ์ด) · `/posts/[id]` (2 คอลัมน์ autosave + สื่อ paste/ลากเรียง + กล่อง 409) · Nav แท็บ POSTS + `app/posts/layout.js` feature gate
  - verify: `npm test` 272 · `next build` · **smoke DB 15 เคส** (lock 409 ไม่ทับของเดิม · revision attribution ถูกคน · throttle · rename หมวด · promote audit · cascade)
  - **เทสเบราว์เซอร์จริง (Playwright + magic login users.id=1):** สร้างโพสต์ → พิมพ์ → autosave PATCH 200 → reload เนื้อหายังอยู่ · อัปรูปขึ้นแถบสื่อ + แสดงผลได้ · **ยิงไฟล์สื่อแบบไม่ล็อกอิน = 401** · 2 แท็บแก้พร้อมกัน → กล่อง 409 โผล่ + ปุ่ม "เก็บฉบับของฉัน" ทำงาน
  - ⚠️ เจอตอนเทส: **ต้องเปิด feature `posts` ที่ `/org/settings/features` ก่อน** ไม่งั้น `/posts` เด้ง 404 (เปิดให้ org 1 ใน DB local แล้ว) · bug ที่แก้: bug-066 (พรอมป์ AI ตอบ format `carousel` ชน CHECK)
  - ⬜ ยังไม่ได้เทสจริง: ปุ่ม AI (ไม่อยากเสียเงิน) · ลากเรียงสื่อ · วางรูปจาก clipboard
  - ⏭️ prod: รันบล็อก POSTS ใน `migration.sql` (additive) · `storage/posts/` สร้างเอง
- [ ] **ก้อน 2b** — quote studio (ธัมบ์เนล 20 สไตล์ · sync ต้นทาง · พื้นสี) + preview รายแพลตฟอร์ม + ซอยตอนแบบลากเส้น
  - ⚠️ spike ก่อน (~20 นาที): เว็บ import `utils/quoteStyles.js` ข้าม package ได้ไหม (`web/package.json` มี `@napi-rs/canvas` + `outputFileTracingRoot` ชี้รากแล้ว) · ไม่ผ่าน → fallback ให้บอท render ผ่านคิว · **ห้าม copy renderer ไปฝั่งเว็บ**
- [ ] **ก้อน 3** — อนุมัติ: สถานะ + revisions + review links (`noindex`, token ≥32 bytes) + comments + ล็อกหลังอนุมัติ
- [ ] **ก้อน 4** — แยก `services/publishPipeline.js` ออกจาก `basketHandler` + param `accountId` + `post_social_history` (คิว+ประวัติรวมกัน) + worker (`FOR UPDATE SKIP LOCKED`, retry 3)
  - ⚠️ **ตะกร้าดิสฯ ต้องเปลี่ยนมาเรียก pipeline ตัวใหม่ในรอบเดียวกัน** ห้ามก๊อปแล้วปล่อยของเดิม (กติกาข้อ 16)
  - ❌ **ไม่ยุบ `dc_media_baskets` เข้า posts** (เคาะแล้วกลับคำ 2026-07-29) — ตะกร้าเป็น scratch pad ของ Discord ไม่ใช่ "ร่างที่ต้องอนุมัติ"
    - จุดชนจริง: กติกาข้อ 11 บังคับ org series ต้อง `approved` ก่อนโพสต์ → ถ้าตะกร้าเป็น episode คนกดโพสต์ในดิสฯ จะโดนบล็อกรอบรรณาธิการ = พฤติกรรมที่ใช้ทุกวันเปลี่ยน · ทางเลี่ยงทั้ง 2 ทางไม่สวย (ยกเว้นตะกร้า = กลับไปมี 2 พันธุ์ในเชิงพฤติกรรม / เปลี่ยนพฤติกรรมดิสฯ = regression)
    - พ่วงมาอีก: `seq`/`series_id` ไม่มีความหมายกับตะกร้า · ต้องเอาคีย์ `(guild_id, channel_id)` ไปแปะบน `post_episodes` เพื่อหา "ตะกร้าที่เปิดอยู่ของห้องนี้"
    - ที่ยังรวมได้และทำอยู่: **ประวัติ** (ข้างล่าง) · ท่อโพสต์ `publishPipeline` ที่ใช้ร่วมกัน
  - **ประวัติ = แถว `done` ใน `post_social_history`** (เคาะ 2026-07-29 รวมคิว+ประวัติ) → ย้าย 10 แถวจาก `dc_media_history` เข้ามา + แก้ `getHistory()`/`addHistory()` ฝั่งบอท แล้ว **drop `dc_media_history`** · ห้ามเขียนประวัติ 2 ที่
    - ความเสี่ยงต่ำ: ไม่มี logic ไหนอ่านตารางนี้ไปตัดสินใจ — เขียน 2 จุด (`basketHandler` 766, 905) อ่านจุดเดียว (โชว์ "โพสต์ล่าสุด" ใน sticky ของตะกร้า) · พลาดแล้วเห็นทันที ไม่พังเงียบ
    - ⚠️ รูปร่างแถวเปลี่ยน: เดิม 1 แถว = 1 โพสต์หลายแพลตฟอร์ม (`platform` = `'fb,ig,x'` แล้ว UI `.split(',')`) → ใหม่ 1 แถว = 1 แพลตฟอร์ม ⇒ โค้ดโชว์ประวัติต้อง `GROUP BY batch_id` · ตอน migrate ต้อง**แตก 10 แถวเก่าตาม comma** (~15 แถว) ให้รูปร่างเดียวกันหมด
    - แมปคอลัมน์: `image_count`/`video_count` → นับจาก `media` jsonb · `posted_by` → `created_by_discord_id` · `schedule_time` (bigint unix) → `scheduled_at` (timestamptz) · `fb_url`/`ig_url`/`threads_url`/`x_url` → `result` jsonb
- [ ] **ก้อน 5** — AI เกลาสำนวน + แคปชัน/ไอเดียภาพ
- [ ] **ก้อน 6** — migrate `posts/*.md` เข้า DB (series D/E → `personal`) แล้วเลิกใช้โฟลเดอร์
- [ ] **ถอด prefix `dc_` ออกจากตารางที่เป็น org แล้ว** (user สั่ง 2026-07-29 · ทำ **หลังก้อน 4**) — สำรวจแล้วเหลือจริง 3 ตัว:
  - **หลักที่ user เคาะ 2026-07-29: prefix ต้องมีโมดูลจริงรองรับ** — ห้ามตั้ง prefix ลอยๆ ที่ไม่มีโฟลเดอร์/feature key รองรับ (เช่น `media_` ตกไปเพราะไม่มี `web/db/media/`) · `post_` ผ่านเพราะมี `web/db/posts/` + `orgFeatures` key `posts`
  - `dc_social_accounts` → **`post_social_accounts`** (14 ไฟล์) — ⚠️ ต้องมีคอมเมนต์หัวตารางว่าตะกร้าสื่อ/ลายน้ำ/Meta-X OAuth ใช้ร่วม **ห้าม drop ตามโมดูล posts**
  - `dc_orgchart_config` → `org_chart_config` (2) · `dc_orgchart_snapshot` → `org_chart_snapshot` (1) — มี `org_*` เป็นโมดูลรองรับอยู่แล้ว
  - `dc_media_baskets` คง `dc_` ไว้ — เป็นฟีเจอร์ของ Discord จริงๆ (ไม่ยุบเข้า posts แล้ว)
  - **ไม่ต้องแตะ** `dc_media_baskets` / `dc_media_history` / `dc_user_config` — ก้อน 4 ยุบหาย/รอ drop อยู่แล้ว (rename ตอนนี้ = เสียแรงฟรี)
  - **คง `dc_` ไว้ 12 ตัวที่เป็น Discord จริง**: guilds · guild_config (channel/message id ล้วน) · guild_roles (392) · guild_role_groups · activity_daily/mentions (89k แถว) · forum_config/posts · gogo_entries · ai_modes · user_ratings/reports
  - ⚠️ ทำ **ทีละตาราง ทีละ commit** grep แก้ด้วยตา — ห้าม sed รวด (เคย bulk-rename ตอน migrate calling แล้ว `orgId` ไหลเข้า `guild_id`)
  - ⚠️ บอท/เว็บ deploy ไม่พร้อมกัน → rename แล้วสร้าง **view ชื่อเดิม** คร่อมไว้ (auto-updatable) → deploy → drop view
- [ ] **บั๊กที่มีอยู่จริง (ไม่ผูกกับ posts): รูปในตะกร้าตายใน ~24 ชม.** — `dc_media_baskets.image_url` เป็น Discord signed URL (`?ex=&is=&hm=`) ตะกร้าที่ค้างข้ามวันแล้วกดโพสต์จะยิงไม่ออก (`fetchBuffer` ที่ `basketHandler` 783/801/1054 โยน · วิดีโอส่ง URL ให้ Meta ดึงเองที่ 711-756 ก็พังเหมือนกัน) · **รอเคาะว่าเอาทางไหน:**
  - **B. รีเฟรช URL ตอนใช้ (เชียร์)** — `client.rest.post('/attachments/refresh-urls')` (discord.js 14.25 เรียกได้ ไม่ต้องอัป) · **แก้วิดีโอด้วย** เพราะ Meta ต้องดึงจาก URL ที่ยังไม่หมดอายุ · แตะ helper 1 ตัว + จุดเรียก 3-4 จุด · ไม่รอด ถ้าข้อความต้นทางถูกลบ
  - **A. โหลดไฟล์ลงดิสก์ตอนหย่อนเข้าตะกร้า** — รอดแม้ข้อความถูกลบ · แต่ **แก้วิดีโอไม่ได้** (ไฟล์ในเครื่องเรา Meta เข้าไม่ถึง ต้องมี public URL อีกชั้น) · แตะ `addImages` + จุดอ่าน 4 จุด + หน้าเว็บตะกร้าต้องมี route เสิร์ฟรูป
  - เติม A ทับ B ทีหลังได้ ไม่ขัดกัน
  - ❌ **อย่าเอาไปรวมกับ `post_episode_media`** (คุยแล้ว 2026-07-29): `episode_id` เป็น FK NOT NULL → รับแถวตะกร้าต้องมีพ่อ 2 แบบ = polymorphic parent · และถ้าเลือกทาง B ตะกร้าไม่มีไฟล์เลย ไม่มีอะไรให้รวม · **ของที่ใช้ร่วมคือ logic (ลากเรียง/ลายน้ำ/แปลง buffer) ไม่ใช่ตาราง** — แบบเดียวกับที่ finance/docs เก็บไฟล์คนละตารางแต่ใช้ helper ตัวเดียว
- [ ] ลายน้ำยังผูก guild (`resolveWatermarkPath`) → org ไม่มี guild ใช้ลายน้ำไม่ได้ · ต้องยกขึ้น org วันหลัง
- [ ] จดไว้ทำทีหลัง: ดึงการ์ดที่ทำในดิสฯ เข้ามาเป็นสื่อของตอนบนเว็บ (ตอนนี้ทางฝั่งดิสฯ จบที่ตะกร้าซึ่งตัดออกแล้ว)

---

## 📱 SOCIAL ACCOUNTS org-native (Phase 0 ของ posts) — เสร็จ local 2026-07-29

`dc_social_accounts` = ตารางสุดท้ายในท่อ publish ที่ยัง guild-based · rebuild ใส่ `org_id` + `owner_user_id` แล้ว
รายละเอียด/กติกา + สิ่งที่ตั้งใจไม่แตะ อยู่ `md/posts/POSTS.md` §Phase 0

**⬜ เหลือ:**
- [ ] **deploy prod** — `migration.sql` (idempotent แต่ rebuild ตาราง → ทำตอนบอทไม่ได้เขียน) + build เว็บ + smoke ตะกร้าสื่อในบอทของจริง
- [ ] **เทสในเบราว์เซอร์** — `/bot/platforms` ตอนนี้โชว์บัญชี public ทั้งองค์กร (3 guild รวมกัน) ยังไม่ได้ดูด้วยตา ว่าอ่านออกไหมว่าอันไหนของแบรนด์ไหน (มีแต่ `group_name` เป็นตัวแยก)
- [ ] **app creds ยังเป็นราย guild** (`dc_guild_config` → `meta_app_id`/`x_consumer_key`) → org ที่ไม่มี guild **ถือครองบัญชีได้ แต่กด Connect ใหม่ไม่ได้** · เคาะ 2026-07-29 ว่ายังไม่ย้าย — ถ้าจะให้ org self-serve ผูกเพจเองได้ ต้องย้าย creds ขึ้น `org_config` (~3 ไฟล์ + เส้น OAuth)
- [ ] `/bot/*` ยังบล็อก org ที่ไม่มี guild ทั้งโซน → หน้าจัดการบัญชีโซเชียลควรย้ายออกจาก `/bot/` วันที่ posts มีหน้าของตัวเอง

---

## 📮 CASES — รอบ 2026-07-28
> รายละเอียด/ประวัติย้ายไป `md/case/CASE.md` แล้ว — ที่เหลือคืองานค้าง
**⬜ เหลือ:**
- [ ] **เทสในเบราว์เซอร์** — กดปุ่มแก้ไขจริง + กด refresh timeline บนเคสที่มีเธรด Discord จริง (ที่ verify ไปคือ production build ผ่าน + code review เท่านั้น)
- [ ] **"โอนเคสข้ามจังหวัด"** เป็น action แยก (admin-only, เช็ค scope ทั้งต้นทาง+ปลายทาง, ลง timeline) — ถ้ามีเคสจัดจังหวัดผิดจริง
- [ ] cron auto-sync timeline (อยู่ใน V2 ของ CASE.md เดิมอยู่แล้ว) — ตอนนี้ sync ด้วยปุ่มกดมือเท่านั้น ไม่มีใครกด = timeline ค้าง
- [ ] ข้อความที่ถูก **edit ทีหลัง** ใน Discord ไม่มีทางเข้าระบบ (`?after=` ดูแต่ ID ใหม่) — รู้ไว้เฉยๆ ยังไม่มีแผนแก้

---

## 🏷️ Rename โปรเจกต์ → platfor.org (เตรียมรางเสร็จ 2026-07-28 · **ยังไม่จดโดเมน**)

> ชื่อเคาะแล้ว: **display = `PLATFOR{m}.ORG`** · **domain = `platfor.org`** (ยังไม่จด — ตอนนี้ยังใช้ `pplevolunteers.org` ทั้งระบบ)
> ✅ commit `278a3a2` วางรางไว้แล้ว: ชื่อ/โดเมนอ่านจากที่เดียว ไม่มี hardcode กระจายอีก

**วันเปลี่ยนจริง — แก้แค่ 2 บรรทัดนี้ก่อน:**
1. `config/brand.js` → `BRAND_DOMAIN: 'platfor.org'`  (`BRAND_NAME` เป็น `PLATFOR{m}.ORG` อยู่แล้ว)
2. `.env` → `NEXTAUTH_URL=https://platfor.org`
   → ตกถึง `web/lib/baseUrl.js` → OAuth redirect_uri ทุกเจ้า + passkey RP_ID + title/footer ทั้งหมดอัตโนมัติ

**แล้วตามด้วยของนอกโค้ด (ลืมไม่ได้):**
- [ ] จดโดเมน + DNS + nginx `server_name` + SSL cert · เสิร์ฟโดเมนเก่า 301 ไปใหม่ไว้ก่อน
- [ ] **`dc_guild_config` key `web_base_url`** — อยู่ใน DB ราย guild ไม่ใช่ .env (บอทใช้ทำลิงก์ใน SMS/Discord) → `UPDATE` ให้ครบทุก guild
- [ ] **redirect URI ในคอนโซลข้างนอกทุกเจ้า:** Discord OAuth · Google · LINE · Meta · X
- [ ] ⚠️ **passkey จะพังทั้งหมด** — `RP_ID` ผูก hostname → passkey ที่ลงทะเบียนไว้ใช้ไม่ได้ · **ยังไม่เคาะ**ว่าจะ pin `PASSKEY_RP_ID=pplevolunteers.org` (ต้องเสิร์ฟโดเมนเก่าตลอด) หรือให้ลงทะเบียนใหม่ (เช็คก่อนว่ามีกี่คน)

**Rename folder / repo (แยกจากโดเมน ทำคนละวันได้):**
- [ ] local `~/VSites/node/pple-volunteers` → `platfor.org` (พาไปด้วย: Claude memory dir, VSCode workspace, `.claude/settings.local.json`)
- [ ] prod `/www/wwwroot/pple-volunteers` → `deploy.sh:44` เป็นบรรทัดเดียวที่รันจริง · อีก ~12 ไฟล์ใน `scripts/` เป็น comment วิธีรัน
- [ ] GitHub repo `numthang/pplevolunteers-bot` → rename (GitHub redirect ให้อยู่แล้ว ไม่พังทันที)
- [ ] 🔒 **git remote มี GitHub PAT plain text** (`ghp_...` ใน origin URL) → revoke + ออกใหม่ตอน rename repo
- [ ] pm2 `pple-dcbot` / `pple-web` — จะเปลี่ยนก็ได้ ไม่ผูกอะไร
- [ ] docs `md/*.md` + `CLAUDE.md` (~10 ไฟล์) — งาน mechanical ล้วน โยน subagent ได้

**เคาะแล้วว่า “ไม่แตะ”:** DB `pple_volunteers` + user `pple_dcbot` (ต้องแก้ .env+scripts ทุกที่ ได้แค่ความสวย เสี่ยง downtime) · `.wolf/memory.md` (log ประวัติ) · `web/app/tee/portfolio/` (อ้างระบบเดิมถูกแล้ว) · `.claude/settings.local.json` (แค่ allowlist)
**ทำก็ได้ไม่ทำก็ได้:** User-Agent 3 จุด (`CaseNewForm.jsx`, `LocationButton.jsx`, `sync-act-events.js`)

---

## 🌐 platformfor.org / CivicFlow — identity/tenant migration
> รายละเอียด/ประวัติย้ายไป `md/civicflow/CIVICFLOW.md` แล้ว — ที่เหลือคืองานค้าง
- [x] **B — grant ยศคน Discord ผ่านเว็บ (2026-07-16, commit 6d534fb)** — หน้า `/admin/roles` (ค้นสมาชิก → chip ยศ toggle) → สั่ง Discord เพิ่ม/ถอดยศจริง (`lib/discordRoles.js` PUT/DELETE) + write-through `dc_members.roles` + `clearAccessCache` + audit · gate `manageRoles`=admin/moderator (permissions.js) · grantable = 9 role (ยกเว้น admin) · **Discord = one source, เว็บเป็นรีโมท** (ตอบโจทย์ "แก้ที่ไหนก็ตรงกันทั้ง Discord+web") · verify curl 403/200 + jest 189 ผ่าน · ⬜ ยังไม่กดเทสจริงในเบราว์เซอร์ (แตะ Discord side-effect)
- [ ] **⭐ migrate `dc_members.roles` (Discord CSV ชื่อ) → `web_roles` (key)** (user สั่งจด 2026-07-16) — แปลชื่อ Discord → permission key ผ่าน catalog `dc_guild_roles` เขียนลง web_roles → เป้าหมาย **web_roles = แหล่งรวม key ของทุกคน (Discord+email) ที่เดียว** · ⚠️ **decision คู่กัน:** ถ้าจะให้ web_roles เป็น source เดียวจริง ต้องให้ **Discord sync เขียน web_roles ด้วย** (แปล name→key ตอน sync ใน `db/members.js`) + resolveAccess อ่าน web_roles → ไม่งั้น `roles`(name) กับ `web_roles`(key) diverge ทุก sync (sync ทับ `roles` แต่ไม่ทับ `web_roles`)
- [ ] **④ contract (เหลืออันเดียว)** — `DROP TABLE _dc_members` (7,298 แถว) + คอลัมน์ที่ไม่ใช้ · **ทำหลัง cutover ขึ้น prod แล้วนิ่ง** · ⚠️ `_dc_members` เป็น safety net จริง (2026-07-21 เคยใช้กู้ `member_id` ที่ถูกล้าง) — อย่าเพิ่งรีบลบ
  - ⬜ ยังไม่ได้ trigger email/SMS/OCR จริง (verify ผ่าน SQL simulate เท่านั้น — ต้องเทสตอน deploy) · db/finance.js = finance_config (guild-based) ไม่ต้องแตะ
> **⬜ เหลือของ docs:**
> **⬜ เหลือของ calling:**
  - ⬜ **ยังไม่กดจริงในเบราว์เซอร์** (tab switch, chip toggle UI, probe แสดง Section B หลัง hydrate)
  - [x] **home org-scope เสร็จ 2026-07-18** (org-core) — `app/page.js` branch org-first (mirror layout.js): resolve `resolveActiveOrg` → `guildsOfOrg`. **guildless org** (MRSJAN org 8) → org-native dashboard: profile (org icon+ชื่อ+email) + FinanceCard (org-scoped อยู่แล้วผ่าน getFINANCESummary/getOrgId) gated ด้วย `getOrgEnabledFeatures` + การ์ดสมาชิกองค์กร (member_count จาก resolveActiveOrg) → `/org/settings/members` + ปุ่มไป `/org/settings` · **ซ่อน** Discord-bot/guild-list + REST-API integrations (PPLE-global) · **guild org (PPLE org 1) คงเดิมทุกอย่าง** (ตกไป guild dashboard เดิม) · guard: Discord user ที่ไม่มี org row → fall-through guild dashboard (ไม่ regress) · email user ไม่มี org → prompt สร้างองค์กร · extract `FinanceCard`/`OrgIcon` component (pure JSX move) · verify: build + curl magic-login MRSJAN→switch org8→home 200 มี members/settings/finance ไม่มี CALLING/REST/Discord-bot leak · ⬜ org 1 guild path ยังไม่ curl-test (ต้อง Discord session — เทสจริงในเบราว์เซอร์) · ⬜ i18n (string ไทย hardcode ตาม convention ไฟล์เดิม)
    - ⬜ follow-up: getRealRoles โหลด web_roles ด้วย userId (เปิด email member ของ guild-backed org) → แล้วค่อย upgrade getGuildId เป็น org-derived
  - ⬜ ยังไม่กดจริงในเบราว์เซอร์ · prod: `public/uploads/org/` route mkdir เอง (nginx `/uploads` block มีแล้ว)
- [ ] เทสจริงในเบราว์เซอร์ (dropdown เปิด/สลับ/สร้าง/ออก) — curl เทส trigger+data แล้ว dropdown เป็น client-only

---

## 🍳 /cooking — UI/UX ปรับปรุง (จดไว้ 2026-07-11) — ✅ เขียนโค้ดเสร็จ + เทสเบราว์เซอร์ผ่านแล้ว (2026-07-14) รอ commit + deploy
> รายละเอียด/ประวัติย้ายไป `md/cooking/COOKING.md` แล้ว — ที่เหลือคืองานค้าง
- [ ] **ตอนแยก personal apps ออกไป domain ตัวเอง → เปลี่ยน image serving เป็น API route** (จดไว้ 2026-07-14) — ตอนนี้ cooking + finance upload เขียนลง `public/uploads/` แล้วเสิร์ฟผ่าน **nginx block** (`location ^~ /uploads/` บน prod — ดู DEPLOYMENT.md) ซึ่งผูกกับ server config · ตอนยกเว็บออก ให้เปลี่ยนไปเสิร์ฟผ่าน **API route อ่าน disk สด** แบบ `media-temp`/`docs`/`case` (route `/api/cooking/media/[filename]` + เปลี่ยน URL ที่ upload คืน + จุดแสดงรูป result card/คลังเมนู/preview) → **self-contained ใน repo, ยกออกไม่ต้อง config nginx, dev=prod เหมือนกัน** · แล้วลบ nginx /uploads block ทิ้งได้ · เหตุผลเลือกตอนนี้ยังใช้ nginx (เร็ว/เบา/ทำเสร็จแล้ว) แต่ตอนแยกออก portability คุ้มกว่า
- [ ] **อนิเมชันตอนกดสุ่มแบบ slot machine จริงจัง** (parked 2026-07-11) — ตอนนี้มี spin ง่ายๆ อยู่แล้ว (`spinning`/`reel` ใน CookingClient สุ่มโชว์ emoji+ชื่อสลับ, decelerate ~2.3s + animation cookslot) → อยากได้แบบสล็อตจริง (รีลหมุนแนวตั้ง, เสียง/สั่นได้)

---

## 📢 Social share → ห้องข่าวสาร + Discord Event — implement เสร็จ local
> รายละเอียด/ประวัติย้ายไป `md/discord/BOT.md` แล้ว — ที่เหลือคืองานค้าง

---

## 📢 ระบบเรื่องร้องเรียน (Case System) — implement เสร็จ local · ดู `md/case/CASE.md`
> รายละเอียด/ประวัติย้ายไป `md/case/CASE.md` แล้ว — ที่เหลือคืองานค้าง
- [ ] **Hamburger — เอา 3 เมนูบนออก** — `menuLinks` ซ้ำกับ app switcher → ซ่อนเมื่ออยู่ home/dashboard
- [ ] **Detect location → link จังหวัด** — หน้า `/case` ปุ่ม "ใช้ตำแหน่งของฉัน" → reverse geocode (Nominatim/OSM) → redirect `/case/new/[จังหวัด]`

---

## 🌐 pplevolunteers.org — Auth & Platform
> รายละเอียด/ประวัติย้ายไป `md/org/AUTH.md` แล้ว — ที่เหลือคืองานค้าง

---

## 🧭 Rebrand / Positioning — feature จากการสำรวจตลาด (จด 2026-07-03)

> กำลังเปลี่ยน positioning: pplevolunteers.org → บริการ bot + web multi-tenant สำหรับองค์กรบน Discord · ชื่อใหม่ยังไม่เคาะ — user ชอบแนว abstract มั่วๆ · **ตัวเต็ง: eegg (eegg.gg ว่าง, verify 2026-07-03)** — ชื่อที่ user เคยมั่วขึ้นมาเองแล้วชอบ + .gg เป็น TLD วัฒนธรรม Discord (~฿3k/ปี, eegg.com โดนจอง) · ตัวสำรอง: Ruampon/Khabuan/OrgGuild (.com ว่าง)
> คู่แข่งในตลาด (CommunityOne, Levellr, Mee6/VibeBot) เน้น engagement + analytics · **ไม่มีใครทำ "ระบบปฏิบัติงานองค์กร"** (สมาชิก/การเงิน/calling/เคส) = จุดขายหลักของเรา · benchmark ราคา $10–80/เดือน/เซิร์ฟเวอร์ต่อ feature เดี่ยว
> ทั้งหมดเป็น backlog — ยังไม่เริ่ม implement

### เคาะแล้ว — grilling session 2026-07-03
1. **โครงแบรนด์:** แบรนด์ใหม่ครอบเป็น parent · pplevolunteers.org คงอยู่เป็น tenant #1 + case study — ไม่ต้อง migrate user เดิม
2. **ลูกค้า 1–2 ปีแรก:** องค์กรภาคประชาชนสาย movement ในไทย (NGO/ภาคประชาสังคม/กลุ่มการเมืองรุ่นใหม่) ขายผ่าน network ที่มี · positioning = "NationBuilder สำหรับองค์กรที่ community อยู่บน Discord" — demand พิสูจน์แล้ว (Amnesty สากลจ่าย NationBuilder $34–160+/เดือน)
3. **รายได้:** solidarity pricing — **พื้น = ต้นทุนแปรผันของ tenant (SMS/AI/server) ต้องจ่ายเสมอ ห้ามเป็น donation** · เหนือพื้น = ค่าสนับสนุนตามกำลังองค์กร (ขั้นบันได) · mission-first: เป้า break-even + รายได้เสริม ยอมควักบ้าง · มอง grant สาย civic tech เสริม
4. **Bot identity:** bot กลางตัวเดียว สถาปัตยกรรมเดิม — nickname per server ที่แอดมินเปลี่ยนเองได้ครอบความต้องการ white-label ~80% แล้ว · custom avatar/token = premium คุยทีหลัง ไม่ refactor ตอนนี้
5. **Tenant web:** domain กลางเดียว + custom domain map ให้เฉพาะเจ้าที่ขอ (รายเจ้า ไม่ทำ self-serve)
6. **Customize:** โค้ดเดียวทุก tenant — ฟีเจอร์ที่ลูกค้าจ้างต้อง generalize เข้า core เป็น config/toggle (แบบ verify_phone) · generalize ไม่ได้ = ปฏิเสธ · ห้าม fork/branch ต่อ tenant
7. **การเมือง:** แบรนด์ platform เป็นกลาง — ชื่อ/สีไม่ผูกพรรค · ส้ม #ff6a13 เป็นสีของ tenant อาสาประชาชน ไม่ใช่สี platform → ต้องทำ palette ใหม่ตอน landing
8. **นิติบุคคล:** รับเงินแบบบุคคลธรรมดา (องค์กรหัก ณ ที่จ่ายได้) · จด หจก./บจก. เมื่อมีลูกค้า recurring 2–3 ราย หรือจะขอ grant
9. **ชื่อ:** ไม่จำกัดภาษา ขอแค่เข้าตัวตน + เป็นกลางทางการเมือง (ข้อ 7 ทำให้ "Khabuan" ต้องชั่งอีกที — สื่อ movement แรง · "Ruampon" กลางกว่า) · user คิดต่อเอง ใช้เวลาได้

### ชื่อ — ยังไม่เคาะ (user ขอคิดนานๆ เอาดีที่สุด · อัปเดต 2026-07-03)

**เงื่อนไข domain ที่ user ยอมรับ: .com / .xyz / .app / .org** (เท .co ไม่ชอบ, .gg/.ai แพง, .us จดไม่ได้)

**แคนดิเดตปัจจุบัน (เรียงตามน้ำหนัก):**
- **Numthang (นำทาง) — user เอนเอียงมาทางนี้ ("อวตารใหม่ก็ numthang.xyz ไปเลย")** · numthang.com + .app + .xyz ว่าง (เช็ค 2026-07-03) · ชื่อสวน/ชื่อลูกสาว user · ความหมายปิด metaphor: LINE=ถนน Discord=บ้าน นำทาง=พาสมาชิกเข้าบ้าน · **numthang.org — user เคยจดเอง (ตั้งแต่ 2006?) ตอนนี้อยู่ autoRenewPeriod หลังหมดอายุ 2026-05-27 ที่ Namecheap → ถ้าจะกู้คืนต้องรีบก่อนเข้า redemption (ค่าไถ่แพง)** · ข้อชั่ง: ใจ user เรื่องชื่อลูก (เบา: คำสามัญ · หนัก: ถ้าขายกิจการ/ดราม่า) · ถ้าเคาะ → จด .xyz + .com คู่กันกันโดนตัดหน้า
- **punkan.com ว่าง** — "ปันกัน" ล้อ solidarity pricing · ฝรั่งอาจอ่าน punk-an
- **eegg** — ชื่อที่ user รัก แต่ domain ตัน (.com/.xyz/.app โดนจองหมด)
- .app ว่างเผื่อเลือก: jipjip.app, pukpik.app, jubjai.app, hatchoo.app
- สำรอง .com: ruampon, khabuan, orgguild
- **eegg** — ชื่อที่ user มั่วขึ้นเอง · domain ตัน: .com/.org/.net/.app/.dev/.xyz โดนจอง · .co ว่างแต่ user ไม่ชอบ · .gg/.ai ว่างแต่แพง · .us จดไม่ได้ (เช็ค 2026-07-03)
- **Brand story ชั้นหลัก (ใช้สื่อสารจริง):** ไข่ = community ที่รอฟัก — องค์กรมีคนอยู่แล้วแต่ยังไม่เป็น community ที่มีชีวิต, eegg คือตู้ฟัก · tagline: **"where communities hatch"** / "ที่ที่ community ฟักตัว"
- **ลูกเล่นเก็บไว้ตอน pitch (อย่าเล่าพร้อมกันหมด):** (1) ตัวอักษรไม่อยู่เดี่ยว — e คู่ e, g คู่ g = ไม่มีใครทำงานองค์กรคนเดียว · (2) backronym: Engage · Empower · Gather · Grow หรือสายเล่น "Every Egg Grows a Guild" · (3) logo = รูปไข่ วงรีเดียว friendly, ไข่ฟักออกเป็น community ใช้เล่า onboarding ได้ทั้ง deck
- [ ] จด domain ทันทีที่เคาะชื่อ (Namecheap/Porkbun) — กันโดนตัดหน้า · brand story "ฟักไข่/hatch" ด้านบนใช้ได้กับ eegg เท่านั้น ถ้าเปลี่ยนชื่อต้องเล่าใหม่

### Next actions (หลังได้ชื่อ)
- [ ] จด domain + ทำ palette กลางของ platform
- [ ] Landing page แบรนด์ใหม่ (static แยกจาก app ได้) + pricing sheet แบบ solidarity tiers
- [ ] ตั้งราคาจริงกับ Amnesty เป็นเคสแรกของโมเดลรายได้

### Roadmap feature เรียงตามความคุ้ม:
1. [ ] **Analytics dashboard ต่อ guild** — active members, retention, "อาสาคนไหนกำลังจะหลุด" · ต่อยอดจาก activity tracker (`utils/`) ที่มีอยู่ · เป็น feature ชูโรงที่ตลาดขายกัน
2. [ ] **RAG AI → "AI ตอบคำถามองค์กร"** — ขายเป็น feature แบบ Spark ของ CommunityOne · โครงมีแล้ว (RAG section ด้านล่าง) + เพิ่ม report "คำถามที่ตอบไม่ได้" ให้แอดมิน
3. [ ] **Gamification สำหรับอาสา/สมาชิก** — คะแนนกิจกรรม, badge, leaderboard · เชื่อมข้อมูลกิจกรรมที่เก็บอยู่แล้ว · เข้ากับ volunteer org กว่า gaming
4. [ ] **ค่าสมาชิก/เงินบริจาคผ่านระบบ** — เชื่อม Finance ที่มีกับ membership dues · องค์กรไทยต้องการมาก ไม่มี bot ไหนทำ · เกี่ยวพัน section Donation ด้านล่าง
5. [ ] **Insight summary ให้ผู้บริหาร** — AI สรุปรายสัปดาห์ "สมาชิกพูดเรื่องอะไร อารมณ์เป็นยังไง" แบบ Levellr · ทำทีหลังได้ ใช้ AI infra เดิม

---

## 🌍 i18n — เว็บ + bot รองรับหลายภาษา
> รายละเอียด/ประวัติย้ายไป `md/WEB.md` แล้ว — ที่เหลือคืองานค้าง
- [ ] Migrate โซนที่เหลือ: **docs, bot pages (`web/app/bot/**`)** + shared components (finance: BankBadge/CategorySelect/AccountSelect; root: LoginPanel/NoGuildNotice ฯลฯ) + **bot จริง (`services/i18n.js`, discord.js embed/handler)** — ใช้ i18n-migrator agent ซอยทีละ 2-3 ไฟล์
- [ ] เว็บ fallback เป็น locale ของ guild ก่อนถึง default (ตอนนี้ cookie → th)
- [ ] คำสั่ง/หน้า config ตั้ง locale ต่อ guild
- [ ] แปล en จริง (ตอนนี้มีแค่ skeleton `common.*`)

---

## 📝 Custom Register Form — dynamic per-guild (design เคาะ 2026-07-03)

> แต่ละองค์กรต้องการข้อมูลแนะนำตัวคนละแบบ → ทำ register modal ที่ config field เองได้ต่อ guild โดยไม่แตะโค้ด · เป็น **จังหวะ 2** ของ [Member Onboarding](#-member-onboarding--verify_phone-เคาะ-2026-07-03) — `verify_phone` toggle (จังหวะ 1) ถูกดูดเข้ามาเป็น field type ที่นี่

### แนวคิดหลัก — แยก "นิยามฟอร์ม" ออกจาก "การ render"
ฟอร์ม = ลิสต์ field (นิยาม) · เวลาแสดงผล renderer **แยกตามชนิด field**:

| type | render เป็น | โควตา |
|---|---|---|
| `short` / `paragraph` | รวมลง Discord modal เดียว | ≤ 5 ช่อง (ลิมิต Discord) |
| `verified_phone` | OTP flow (ปุ่ม→modal เบอร์→ปุ่ม→modal OTP) | ไม่กิน slot modal (สเต็ปแยก) |
| `choice` | select menu | ผูก picker เดิม (`dc_guild_roles`) |

- field ทุกชนิดอยู่ในนิยามเดียวกัน แต่ render คนละกลไก → **verified_phone ไม่แย่งช่อง modal** (เหมือน choice ที่แยกเป็น dropdown อยู่แล้ว)
- `verified_phone` ต้องแยกเพราะ OTP async (หยุดรอ SMS) — modal รอไม่ได้ · จุดจุดชนวน: หลัง save text modal เสร็จ bot ไล่เจอ field ชนิดนี้ → เข้า OTP flow
- ลำดับ verify ก่อน/หลัง = `sort_order` ใน DB (ไม่แตะโค้ด)

### Discord constraints ที่กำหนดดีไซน์
- modal ≤ 5 text input · **text อย่างเดียว** (ไม่มี dropdown/date/checkbox ใน modal → choice ต้องแยกเป็น select เสมอ)
- modal เปิดต่อจาก modal submit ไม่ได้ → ต้องมีปุ่มคั่น (เกิน 5 ช่อง = modal 2 หน้า คั่นด้วยปุ่ม)

### Storage — ใช้ `dc_guild_config` ไม่ต้องมี table ใหม่
**นิยามฟอร์ม** เก็บเป็น json array ใน `dc_guild_config` key `register_form_fields` (reuse `getSetting`/`setSetting` เหมือน `enabled_features` / `config_register`):
```json
[
  { "field_key":"nickname", "label":"ชื่อ-นามสกุล", "type":"short",          "required":true, "maps_to":"nickname" },
  { "field_key":"chapter",  "label":"สาขา",         "type":"short",          "required":true, "maps_to":null     },
  { "field_key":"phone",    "label":"เบอร์",         "type":"verified_phone", "required":true, "maps_to":"phone"  }
]
```
- **ทำไมไม่ใช่ table:** ฟอร์มโหลดทั้งชุดเสมอเพื่อ render + admin save ทั้งชุดทีเดียว (overwrite array) + ไม่เคย query/join/filter ข้าม guild + ไม่มี FK เข้ามา → JSON blob ชนะ table (≠ `dc_guild_roles` ที่ต้อง lookup รายแถว + sync รายตัว)
- ลำดับ = ตำแหน่งใน array (เรียงใหม่ = เขียน array ใหม่)

**ค่าที่กรอก** (คนละเรื่องกับนิยาม) → `dc_members` column ตาม `maps_to` · field ที่ไม่มี column → `dc_members.extra JSONB` เก็บที่ `extra->>'field_key'`
- **JSONB ไม่ใช่ EAV:** PG query/filter/index ได้ (`WHERE extra->>'chapter' = 'กทม'` + expression index) → ยืดหยุ่น**และ**ค้นได้ · field ที่ common → เลื่อนเป็น native column ทีหลัง

### งานที่ต้องทำ
- migration: เพิ่ม `dc_members.extra JSONB` อย่างเดียว (นิยามฟอร์มไม่ต้อง migration — อยู่ใน config)
- backoffice `/bot/forms` — admin เพิ่ม/ลบ/เรียง field + เลือก type → save เป็น json ลง `register_form_fields` · seed 5 ช่องเดิมของอาสาประชาชนเป็น default (backward-compatible)
- `handlers/registerHandler.js` — สร้าง modal สดจาก `getSetting(guildId,'register_form_fields')` (เดิม hardcode 5 field) + dispatch ตาม type ตอน submit
- **north star:** ฟอร์ม 1 นิยามครอบทุกชนิด field · เพิ่ม type ใหม่ (เช่น `verified_email`) = เพิ่ม case ใน renderer ไม่ต้องทำปุ่มแยก

### maps_to — ยังไม่เคาะ
- admin เลือกเองว่า field ไหน map column ไหน **หรือ** fix (common → column, ที่เหลือ → extra อัตโนมัติ) — ตัดสินตอน implement

---

## 🔐 RBAC / Multi-guild — เหลืองานค้าง

> RBAC step 1–12 เสร็จ + deploy prod แล้ว (v2.13.0) — bot + web อ่าน role จาก DB ทั้งหมด ไม่มี hardcode policy · **รายละเอียด design เต็ม + feature matrix ดูได้จาก git history: `git show bbc8291:SPEC.md`**

### ยังไม่ทำ
- **Dynamic picker groups** — สร้างกลุ่ม picker เองได้ (schema เผื่อ `kind` ไว้แล้ว ไม่ต้องรื้อ)
- **Security gate (ยังไม่เร่ง เพราะยังไม่เปิดใช้จริง):**
  - `POST /api/calling/logs` ไม่เช็ค role · `GET /api/calling/stats`,`logs` ไม่ filter scope
  - `getEffectiveIdentity` fallback ใช้ JWT เก่าเมื่อ user ไม่อยู่ guild
  - JWT `maxAge` 90 วัน → stale roles · หลาย route ใช้ `session.user.roles` (JWT) แทน `getEffectiveRoles` (DB-fresh)
- **edge case guild-mismatch cookie (defer)** — user ที่ไม่ได้เป็น member ของ guild default แต่เป็น guild อื่น → ไม่มี cookie → `getGuildId` คืน default → Nav mismatch · RBAC กันข้อมูลอยู่ (`isMember=false`) · แก้ที่ดีต้อง middleware/cookie-on-login — ทำตอนเปิด guild ที่ 2 จริง
- **(optional) `dc_members.role_ids` ขนาน `roles`** — แก้ปัญหา rename role แล้วสิทธิ์หายชั่วคราว (web match ด้วยชื่อ) · เพิ่ม column `role_ids` (id ทน rename) ใช้เช็ค permission · ยังไม่จำเป็น จดเผื่อเจอ bug

### 🎯 เป้าหมาย: ใช้งานได้โดยไม่ต้องมี Discord (เคาะ 2026-07-21)

> **Discord = ส่วนเสริม ถ้ามีก็ดี ไม่มีก็ใช้ได้** — เป็นเป้าหมายที่ user ยืนยัน · ระบบ docs อาจเป็นตัวแรกที่ออกแบบใหม่ให้รองรับ org ที่ยังไม่มี Discord

**สภาพวันนี้ — ประตู email เปิดได้แค่ login ส่วนที่เหลือยังผูก Discord + PPLE ทั้งก้อน** (ยืนยันจากโค้ดจริง 2026-07-21):

1. **`scopeGrants` (พื้นที่) มาจากยศ Discord ทางเดียว** — `resolveAccess()` อ่าน `scope_node` จาก `dc_guild_roles` เท่านั้น · `web_roles` เติมแค่ permission ไม่เติม scope ([resolveAccess.js:79](../web/lib/resolveAccess.js#L79)) · คน email (`guild_id` NULL) → query `WHERE guild_id = NULL` → 0 แถว → **scope ว่างเสมอ**
   - ผลจริงต่อแอพ: calling = เด้ง `noAccess` เห็นศูนย์ · cases = ไม่เห็นเคสไหนเลย (ทุกเคสมีจังหวัด) · docs/finance = เห็นเฉพาะระดับประเทศที่ไม่ผูกจังหวัด · ยกเว้นได้ `admin`/`secretary_general` ที่ข้ามเรื่องพื้นที่
2. **คำศัพท์ "พื้นที่" เป็นของ PPLE เอง** — [web/lib/geography.js](../web/lib/geography.js) hardcode จังหวัด→ภาค 77 จังหวัด โดยชื่อภาคคือ**ชื่อ role ทีม Discord ของ PPLE** (`'ราชบุรี' → 'ทีมภาคกลางตะวันตก'`) · ในไฟล์เขียนกำกับเองว่า *"ชุดข้อมูลนี้คือของ guild อาสาประชาชน — multi-guild geography เป็นงานทำต่อ"* · org อื่นอาจแบ่งเป็นเขต/สาขา/ทีม ไม่ใช่จังหวัดไทยด้วยซ้ำ

**สิ่งที่ต้องมีก่อน (ยังไม่ออกแบบ — เป็นงานก้อนใหม่ ไม่ใช่แก้ของเดิม):** ให้ org **นิยาม "พื้นที่" ของตัวเองได้** แล้วผูกกับยศผ่านเว็บ

**ข่าวดีเชิงโครงสร้าง:** 4 แอพ (finance/calling/docs/cases) ไม่รู้จัก Discord เลย — มันกินแค่ `{ permissions, scopeGrants }` ที่ `resolveAccess` คืนมา · **ปลด Discord = เติม "แหล่งที่ 2" ที่ผลิตรูปร่างเดียวกัน ไม่ต้องรื้อ 4 แอพ** · `resolveAccess()` คือตะเข็บที่ควรลงมือ

---

## 🗄️ Database / Infrastructure

- [ ] **ลบ/แทนที่ `scripts/roles/syncAllMembers.js`** — ตัวเก่าพังหลัง migrate PG (เขียน table `members` + MySQL syntax) ใช้ `scripts/calling/sync-discord-members.js` แทน

---

## 🤖 PPLE Bot / Social Share

### Quote Modal — Pre-fill & AI
- [ ] **Future:** ตั้งค่า default ชื่อ/ตำแหน่งใน Quote modal ผ่าน backoffice (แทน `.setValue` hardcode ที่ลบออกแล้ว)
- [ ] **Future:** ปุ่ม "AI คัด quote เด็ด" ใน modal — ดึง quote + attribution จาก thread ด้วย mode `quote_highlight` แล้ว pre-fill
- [ ] backoffice Quote (`/bot/media/quote`) — เพิ่ม config **default crop position** (1:1) ต่อ user/guild
- [ ] **ตรวจสอบ:** ลายน้ำบน Quote Image ซ้ำซ้อนไหม (quote ส่งตรงจาก `/quote` ส่วน basket ติดลายน้ำตอน post อยู่แล้ว) → พิจารณาตัด dropdown ลายน้ำออกจาก quote modal

### Social Share — X (Twitter)
- [ ] **Future:** Infographic — แปลงบทความยาวเป็นรูปสรุปแนบโพสต์หลัก

### Social Share — ช่องทางใหม่: LINE OA + Email (จด 2026-07-03)
- [ ] เพิ่ม **LINE OA** (Messaging API broadcast) + **Email** เป็นช่องทางโพสต์ใน basket/social share คู่กับ FB/IG/X ที่มีอยู่ — content เดียว กระจายครบทุกช่องที่สมาชิก/ผู้ติดตามองค์กรอยู่
- เฟรมเดียวกับ positioning ใหม่: Discord = บ้าน · LINE OA/email = ถนนไปหาคนที่ยังไม่อยู่ใน Discord
- config token/credential ต่อ guild ตาม pattern platforms ที่มี (`/bot/server/platforms`)

### Context Menu — Add to Calendar
- [ ] Context menu บนข้อความ → เพิ่มเข้าปฏิทิน · parse Discord/Google Meet URL + วันเวลา · เลือกปฏิทินได้ (Google Calendar + ปฏิทินทีม)

---

## 💰 PPLE Finance

- [ ] ระบบเบี้ยเลี้ยง — โอนเงินเป็นรอบๆ (บัญชีเขต + บัญชีทีมงาน)
- [ ] ระบบบัญชีเบี้ยเลี้ยงจังหวัด — ส่งสลิปเก็บง่าย + DM สลิปไปหาสมาชิก
- [ ] จัดการเบี้ยเลี้ยงจากสมาชิก Discord
- [ ] ระบบชำระเงินค่าเบี้ยเลี้ยง — ผูกเบอร์บัญชีธนาคารกับสมาชิก

---

## 📞 PPLE Calling

### CSV import สมาชิก (`scripts/importGuildMembers.js`)
- รับ `<guild_id> <file.csv>` → insert ลง `ngs_member_cache`
- columns ขั้นต่ำ: `first_name`, `last_name`, `phone`; optional: `line_id`, `province`, `amphoe`
- ACT-specific fields = NULL; progress output ตาม convention
- **หมายเหตุ:** งานนี้ทับ roster import ของ Amnesty onboarding — ทำรวมกันได้

### ✅ แก้แล้ว (2026-07-26) — ลิงก์กิจกรรมหายจากกล่องส่ง SMS

`buildSmsTemplate` เปลี่ยนไปใช้ `act_event_id` ตั้งแต่ commit `335cd65` (แก้เรื่องส่งลิงก์ผิด id) แต่เติม column ให้แค่ `getCampaigns` ลืม `getCampaignById` → หน้า `/calling/assignments/[id]` ได้ `undefined` → บรรทัดลงทะเบียนหายทั้งหน้า · อีกจุด `RecordCallModal` ยังส่ง `campaign_id` (id ภายใน) เป็น act id → ลิงก์ผิด
> **บทเรียน:** เปลี่ยน field ที่ query หนึ่งแล้ว **ต้องไล่ทุก query ที่ป้อน component เดียวกัน** (list / byId / assigned) · ดู bug-058

### ยังเหลือ
- [ ] เบอร์กลางโทรออก — แสดงเบอร์กลางองค์กรแทนเบอร์ส่วนตัว (ต้องการ provider/config เบอร์กลาง)
- [ ] แสดง active event บน dashboard + default event จังหวัดดึงจาก XLS
- [ ] Audit logs — ดูประวัติการแก้ไข/เพิ่มข้อมูล
- [ ] Approval flow ข้ามภาค — จังหวัด → ภาค → ประเทศ

---

## 👥 PPLE Contacts

- [ ] **Import ข้อมูลผู้บริจาค** เข้า `calling_contacts` — ต้อง copy จากเว็บไซต์มาก่อน (format ยังไม่ชัด) → import script รับ CSV/Excel

---

## 🔌 Integration — Panel / ACT / External APIs

### Panel 360
- [ ] รายชื่อผู้บริจาค 360 — ขอ schema, pkey คืออะไร
- [ ] API สมาชิกพรรค และรายนามผู้บริจาค
- [ ] ขอ endpoint: `GET /api/members`, auth method, pagination (ต้องการ cursor-based)

### ACT Integration
- [ ] Self check-in ACT
- [ ] Webhook ACT — cache act event ทุกครั้งที่สร้างกิจกรรม
- [ ] ERM เคลียร์เอกสาร กกต + calling system — คุยกับนิ
- [ ] ACT เชื่อมกับ LINE — ACT มียศไหม? ตารางที่เกี่ยวข้อง? API กิจกรรม/สมาชิก
- [ ] Flow ต่ออายุสมาชิก — ตอนโทรไปหาสมาชิก ทำยังไงง่ายที่สุด
- [ ] API สมาชิกสำหรับ calling (ปัญเจ)
- [ ] ระบบยศภายใน — มีไหม? เชื่อมกับยศ Discord
- [ ] เข้าถึง People ID ยังไง

---

## 📋 PPLE Docs — E-Signature & E-Document

> รายละเอียดทั้งหมดอยู่ที่ [md/docs/DOCS.md](docs/DOCS.md) · shipped v2.15–v2.19: PDF pipeline, `docs_payers` role-based auto+override, security gate, ACT tab + attachment auto-crop, province filter, member_discord_id nullable, ระบบร่างหนังสือร้องเรียน (AI + PDF)

- **Docs self-fill (ผู้รับเงินนอก roster) — ✅ implement เสร็จ local 2026-07-07 · ยังไม่ deploy prod**
  - หน้าเซ็น: ค้น ngs เป็นทางหลักเหมือนเดิม + ลิงก์ "ไม่พบชื่อในทะเบียน? กรอกข้อมูลเอง" → ฟอร์ม ชื่อ/นามสกุล/เลขบัตร 13 หลัก/ที่อยู่ 6 ช่องตามบัตร
  - เก็บ: ชื่อ→`dc_members` · เลขบัตร+ที่อยู่→`override_data` ของ entry (PDF ออกครบ ทุก field override ชนะ ngs) · จำใน `dc_user_config` key `docs_self_info` → prefill ครั้งถัดไป
  - `verify` ส่ง `has_self_info` · ready/canSign = payer ‖ ngsLinked ‖ selfInfoDone · ราชบุรี (มี roster) ยังบังคับ link เหมือนเดิม
  - **Auto-apply (เคาะ 2026-07-07):** คนที่เคยกรอกครบแล้ว เปิดบิลใหม่ → ระบบเติมจาก `docs_self_info` ให้เองข้ามฟอร์ม (การตรวจจริง = ดู preview ก่อนเซ็น) · มีการ์ด "ใช้ข้อมูลผู้รับที่บันทึกไว้ + ปุ่มแก้ไขข้อมูล" · แก้แล้ว regen preview อัตโนมัติ
  - ไฟล์: `web/app/api/docs/sign/self-info/route.js` (ใหม่), `verify/route.js`, `web/app/docs/sign/[token]/page.js` · ไม่มี migration
  - **ค้าง:** เทสต์จริงกับ sign token จริง (สร้างบิล → กรอกเอง → preview/PDF ออกครบช่อง) · deploy prod
  - **Enhancement (จดไว้ ยังไม่ทำ):** OCR อ่านจากรูปบัตรที่อัปโหลด → prefill ฟอร์ม (Claude vision, Haiku 4.5 ~฿0.1/ใบ หรือ Opus 4.8 ~฿0.5/ใบ) — ตัดสินใจ 2026-07-06 ทำ manual ก่อน ถ้า user บ่นพิมพ์เยอะค่อยเสียบ · ข้อชั่ง: ส่งรูปบัตร ปชช. ไป Anthropic API (retention 30 วัน)

- **ค่าเบี้ยเลี้ยง กิจกรรมสัญจร — ยังไม่ implement**
  - กฎ: เบิกได้สูงสุด 5 คน คนละ 300 บาท · เงื่อนไข กิจกรรมต้องจัดมากกว่า 3 ชั่วโมง
  - ต้องเพิ่ม item type ใหม่ใน `web/config/fund69-rules.js` (`ALLOWED_ITEMS_BY_TYPE.mobile` ยังไม่มี `per_diem`) — ดู [md/docs/DOCS.md](docs/DOCS.md) หัวข้อ "กิจกรรมสัญจร"

- **Docs token consolidation — ✅ implement เสร็จ local 2026-07-05 · ยังไม่ deploy prod**
  - `project_token` ตัวเดียวแทน `pdf_token`/`export_token` · แยกเอกสารด้วย path `/receipt` vs `/registration`
  - **ก่อน deploy prod:** รัน `migration.sql` แล้ว restart ทันที (โค้ดเก่า INSERT column เก่า — window ไม่กี่วินาที) · backfill จาก `export_token` → **ลิงก์ registration (แนบท้าย 3) ที่แชร์ไปแล้วพัง ต้อง copy ใหม่** ลิงก์ receipt เดิมใช้ได้ต่อ

### 🐛 Bug — Internal Server Error ตอนสร้าง bill — **น่าจะเจอ root cause แล้ว 2026-07-06**
- **สาเหตุที่คาดว่าใช่:** prod DB ยังไม่ได้รัน `ALTER TABLE docs_activity_entries ALTER COLUMN member_discord_id DROP NOT NULL` (migration.sql:672) → สร้างบิลแบบ individual mode/ยังไม่กำหนดผู้รับ (`member_discord_id = NULL`) ชน NOT NULL constraint → error ถูกกลืนเป็น "Internal Server Error" ที่ `web/app/api/docs/entries/route.js:87` (catch-all ไม่ log detail ให้ client)
- เช็คแล้ว local dev DB column นี้ nullable แล้ว (รัน migration ไปแล้วตอน dev) — ต่างจาก prod ที่โดน error
- **ต้องทำ:** รัน `scripts/migration/migration.sql` เต็มไฟล์บน prod (ทุกบรรทัด idempotent) แล้วลองสร้างบิลซ้ำว่าหายไหม — ยังไม่ได้ยืนยัน 100% เพราะไม่มี stack trace จริงจาก prod log ตอนเกิดเหตุ

---

## 🤖 RAG AI — Discord Forum Search

> user ถามใน Discord แล้ว bot ตอบโดยดึงข้อมูลจาก forum_posts ใน Meilisearch

### Flow (reuse infra เดิม)
1. User `/ask <คำถาม>` → 2. `searchPosts()` top-K จาก Meilisearch → 3. ตัด snippet ~500 chars/โพสต์ → 4. `callAI(ragSystemPrompt, context + question)` → 5. embed reply + sources

### ไฟล์
- `commands/ask.js` · `services/ragSearch.js` (retrieval + context builder) · `handlers/askHandler.js`

### ต้นทุน token (Haiku 4.5 — $1/$5 per 1M)
- snippet 500 chars × K=5 ≈ **~$0.006/ครั้ง** (แนะนำ) · content เต็ม ≈ ~$0.018/ครั้ง · 1,000 query/เดือน ≈ ฿200 (snippet)

### ⚠️ Open Questions ก่อน implement
- **Meilisearch capacity** — index `forum_posts` มี 1,924 docs; เพิ่ม channel threads จำนวนกระโดด → ประเมิน doc count + query latency ก่อนตัดสินใจ index รวม/แยก
- **Privacy & third-party protection** — RAG ดึง content ที่อาจมี PII:
  - system prompt ห้าม AI สรุป/วิเคราะห์บุคคลที่ 3
  - ไม่ index channel ส่วนตัว (DM, private thread, off-limits channel)
  - strip ชื่อ/mention ออกจาก snippet ก่อนส่ง context
  - query ถามเรื่องคน (detect ชื่อจริง/mention) → refuse/redirect

### Chat with AI via Mention
- [ ] **`@bot <ข้อความ>` ในห้องที่กำหนด** — reuse `ragSearch.js` + `callAI()` · trigger จาก `messageCreate` + mention check · config ห้องใน `dc_guild_config` · อาจเพิ่ม conversation thread (multi-turn)

---

## 🛠️ Internal Tools / Productivity

- [ ] **File server องค์กร (EFSS แบบ Google Drive) — จด 2026-07-03**
  - ปัญหา: ตอนนี้อาสาซื้อพื้นที่ cloud ส่วนตัวกันเอง = ภาระ + ไฟล์งานไม่เป็นขององค์กร (อาสาออก ไฟล์หายตาม)
  - แนวทาง: self-host **Nextcloud** (ตัวมาตรฐาน; ตัวเทียบ Seafile) บน infra ที่มี · สิทธิ์ราย user/group/link + quota เหมือน Drive
  - ต้นทุน: VPS+storage 2TB ~฿400–800/เดือน จบทั้งองค์กร vs อาสา 20 คน × ฿70 = ฿1,400/เดือน
  - **จุดขาย platform:** Nextcloud รองรับ OIDC → login ด้วย Discord + map สิทธิ์โฟลเดอร์จาก role ใน `dc_members` (จังหวัด/ฝ่าย/ยศ) — เป็น module ใหม่ของ platform ที่ตลาดไม่มี
  - หมายเหตุ: Google for Nonprofits ฟรีสำหรับมูลนิธิจดทะเบียน แต่องค์กรการเมือง/movement ไม่ qualify → self-host ตอบโจทย์ลูกค้ากลุ่มเรา

- [ ] **Project management (Notion + Trello) — Discord-native**
  - Notion-side: page/doc แนบ project, nested tasks · Trello-side: Kanban drag-drop, swimlane ตาม assignee/label
  - สร้าง/อัปเดต task จาก Discord (slash command / context menu บนข้อความ → task ทันที)
  - แจ้งเตือนใน Discord เมื่อ task เปลี่ยนสถานะ/ถึง deadline/assign
  - member ผูก Discord user อัตโนมัติ (reuse `dc_members`) · web UI (`/projects`) board/table/doc view · reuse `guild_id` + RBAC pattern

---

## 🧙 Server Setup Wizard

> รายละเอียดที่ [md/discord/SERVER_WIZARD.md](discord/SERVER_WIZARD.md)

- [ ] **Wizard สร้าง Discord server สำเร็จรูป** — ตอบ 1–N คำถาม → ได้ server พร้อมใช้ + service pack
  - Wizard อยู่ที่ไหน (web/Discord DM) — ยังไม่เคาะ
  - Templates: พรรคการเมือง/มูลนิธิ/ชมรม/กลุ่มอาสา · Service packs: Calling/Finance/Cases/Media/AI
- [ ] **ห้อง honeypot ใน template** (จด 2026-07-09) — wizard สร้างห้อง honeypot ให้เลย + ตั้ง `honeypot_channel_id` ใน config อัตโนมัติ
  - permission: @everyone เห็นได้ (**ห้าม deny** ไม่งั้น bot join ใหม่มองไม่เห็น กับดักไร้ค่า) · deny ViewChannel ให้ `member_role_id` (role ที่ทุกคนได้ตอน verify ผ่าน `/panel register`/verify flow — ครอบสมาชิกจริงทุกคนแน่นอนกว่า interest/skill/province ที่เลือกหรือไม่เลือกก็ได้) · จะ deny เพิ่มที่ interest/skill/province ด้วยก็ได้แต่ไม่ใช่ตัวหลัก
  - ชื่อห้องกันคนจริงที่ยังไม่ verify เผลอพิมพ์ เช่น `🚫-do-not-post`
  - ผูกกับ Quarantine role (section ถัดไป) — ใครโพสต์ = auto-quarantine ตาม design ใน section Anti-Spam

---

## 🚫 Quarantine Role (anti-spam)

- [ ] เพิ่ม role `Quarantine` ใน template `th-civic-starter.json`
  - deny `ViewChannel` + `SendMessages` + `SendMessagesInThreads` + `CreatePublicThreads` + `CreatePrivateThreads` เป็น overwrite บน **ทุก category** (มองไม่เห็น ส่งไม่ได้ สร้าง thread ไม่ได้)
  - channel ที่ `lockPermissions()` (inherit) รับ deny มาอัตโนมัติ
  - channel ที่มี explicit overwrite ของตัวเองต้องเพิ่ม deny แยก
  - **position: สูงกว่า Admin** (ต่ำกว่า bot เท่านั้น) — ให้ mod assign Quarantine ให้ Admin ได้ด้วย
  - provisioner: สร้าง Quarantine **ก่อน** staff roles ทุกตัว (= position สูงกว่า) + เพิ่ม `{ role: "Quarantine", deny: ["ViewChannel", "SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"] }` เข้า overwrite ทุก category ใน template
  - ใช้: mod ติด role นี้กับ spammer → ส่งข้อความไม่ได้ทุก channel ทันที โดยไม่ต้อง ban
  - **ปัญหา:** category ที่ Admin สร้างเองทีหลังไม่มี Quarantine overwrite อัตโนมัติ
  - **แก้:** เพิ่ม subcommand `/server quarantine-sync` (หรือรวมใน `/server setup` idempotent) — วน loop ทุก category ใน guild แล้ว apply Quarantine deny ให้ครบ

---

## 💳 Donation — หน้าเว็บรับบริจาค

- [ ] **หน้าบริจาคสาธารณะ** — ผู้สนับสนุนภายนอกบริจาคผ่านเว็บ · scope/design ยังไม่ได้คุย

---

## 🛡️ Anti-Spam — Honeypot Channel (แทน Wick quarantine) — คุยไว้ 2026-07-05

> ที่มา: Wick quarantine ถอด role หมดเวลา sensitivity สูง → งง ตั้งค่าไม่ถูก ตอนนี้ quarantine ทำ manual เองอยู่แล้ว อยากได้ระบบ auto ที่ไม่ต้องเฝ้าห้อง

**แนวคิด:** สร้างห้องซ่อน (honeypot) ที่คนจริงมองไม่เห็น (deny "View Channel" ให้ role สมาชิกทั่วไป) — ใครก็ตามที่โพสต์ในห้องนี้ ถือว่าไม่ใช่คนจริงแน่นอน (ต่างจาก anti-spam ทั่วไปที่เดาจาก rate/pattern มี false-positive)

**จับได้ 2 เคส:**
1. สแปมบอท/self-bot ที่ join แล้วยิงรัวทุกห้องที่ token มัน permission ส่งได้ (ไม่ได้เลือกว่าคนคุยจริงไหม)
2. Account staff/admin ที่โดนแฮค — สคริปต์ยิงด้วย permission เดิมของ role ที่ถืออยู่ (เช่น `Administrator`) ซึ่ง **bypass channel overwrite ทุกอัน** → เห็น/โพสต์ห้องที่คนจริงมองไม่เห็นได้

**⚠️ จุดสำคัญที่ทำผิดพลาดง่าย:** ต้อง deny view เฉพาะ `member_role_id` (role ที่ติดอัตโนมัติตอน verify ผ่าน — ดู `handlers/registerHandler.js`/`verifyHandler.js` — ครอบสมาชิกจริงทุกคนแน่นอน ต่างจาก interest/skill/province ที่เลือกหรือไม่เลือกก็ได้) ห้าม deny @everyone/role พื้นฐานที่ได้ตอน join ใหม่ ไม่งั้น raid-bot ที่เพิ่ง join จะมองไม่เห็นห้องไปด้วย (permission บล็อกตั้งแต่ API level → ไม่มี event ให้จับเลย)

**เคาะแล้ว:**
- Admin สร้างห้อง honeypot เอง (ตั้งชื่อ) — bot ไม่ auto-create ห้อง
- **`/server antispam set honeypot_channel:<#ch>` auto-apply permission ให้เลย** (แก้ 2026-07-09 หลังพบว่า manual setup error-prone): deny ViewChannel ให้ `member_role_id` (จาก `config_register` — ต้องตั้ง `/panel register member_role` ไว้ก่อน) + เตือนถ้า @everyone โดน deny อยู่ (honeypot จะไม่ทำงาน) + เตือนถ้ายังไม่ได้ตั้ง `member_role_id`

**⚡ Threat model จริง (2026-07-09):** เคสที่เจอจริงแทบทั้งหมด = **account สมาชิกธรรมดาโดนแฮคมายิง** ไม่ใช่ bot join ใหม่ → honeypot จับเคสนี้ไม่ได้ (สมาชิกโดน deny มองไม่เห็นห้อง Discord reject ที่ API level) → honeypot ลดเป็นตัวรอง จับเฉพาะ admin/staff ที่มี Administrator โดนแฮค + bot join ใหม่ · ยังทำเพราะถูกมาก (listener เดียว)

### เงื่อนไขการติด Quarantine (เคาะแล้ว 2026-07-09)

**Auto-quarantine ทันที — เฉพาะพฤติกรรมที่คนจริงไม่มีทางทำ:**
| # | เงื่อนไข | เกณฑ์ (threshold ยังไม่เคาะ เคาะตอน implement) |
|---|---|---|
| 1 | **Duplicate ข้ามห้อง** (ตัวหลัก — จับ account โดนแฮค) | user เดิมส่ง content เหมือนเป๊ะใน ≥3 ห้อง ภายใน ~30 วิ · exact match (hash ต่อ user ใน memory) ไม่ใช่ fuzzy |
| 2 | **Mass-mention** | mention users+roles รวม ≥10 ในข้อความเดียว · `@everyone` ไม่ต้องเขียนโค้ด — กันด้วย server permission อยู่แล้ว |
| 3 | **โพสต์ในห้อง honeypot** | ข้อความใดๆ ในห้องที่ตั้งเป็น honeypot |

**Action เมื่อ trigger:** ติด **Quarantine role** + ลบข้อความ (เคส duplicate = ลบทุกห้อง) + แจ้งห้อง mod → mod ตัดสินเอง: ปลด role คืน (โดนแฮค กู้ account แล้ว — ยศอื่นอยู่ครบ ไม่ต้องจำ) หรือ ban (bot จริง) · **ไม่ถอดยศอื่น ไม่ใช้ timeout ไม่ ban อัตโนมัติ**

**พฤติกรรมกำกวม — ห้าม auto-quarantine (คนจริงทำได้):**
- พิมพ์รัว (เช่น 8 ข้อความ/5 วิ) → แจ้ง mod เฉยๆ
- ข้อความซ้ำในห้องเดิม → ลบตัวซ้ำ ไม่ลงโทษ (มักเป็น lag กดส่งซ้ำ)
- Invite link server อื่น → ลบ + แจ้ง mod

**ทำไม Quarantine role (ไม่ถอดยศ) ใช้ได้:**
- Quarantine role มี deny overwrite (SendMessages) ติดทุก category + ทุก channel แล้ว (ห้อง unsync ก็มี — copy overwrite มาตอน unsync + user ตั้งมือทุกครั้งที่สร้างห้อง) → โดนแล้วพิมพ์ไม่ได้ทุกห้อง
- กติกา allow-ชนะ-deny ระดับ role ไม่ทำให้พัง เพราะห้องลับ allow แค่ ViewChannel ให้ role สมาชิก ไม่ได้ allow SendMessages → deny ของ Quarantine อยู่
- จุดบอดที่ยอมรับ: ห้องที่ explicit allow SendMessages ให้ role อื่น (เช่นห้องประกาศ staff) · คนถือ Administrator (bypass ทุก overwrite — honeypot จับเคสนี้แทน แล้ว mod จัดการมือ)

**Implement (เสร็จแล้ว 2026-07-09):**
- `services/antiSpamCache.js` — in-memory guild config cache (honeypotChannelId, quarantineRoleId, modChannelId) populate ตอน `clientReady` (index.js) เหมือน pattern `forumCache.js`
- `handlers/antiSpamHandler.js` — `handleAntiSpam(message)` เช็ค 3 เงื่อนไข (honeypot/mass-mention/duplicate-cross-channel) + staff-exempt (`ManageMessages` ขึ้นไป → แจ้ง mod เฉยๆ ไม่ quarantine) + consolidate เป็น 1 action ต่อ 1 ข้อความ + quarantine-fail ยังแจ้ง mod (ไม่ swallow error)
  - duplicate cache เก็บ `{channelId, messageId, content, timestamp}` ต่อ user + prune เก่ากว่า 30s ทุกครั้งที่เช็ค + sweep ทุก 5 นาทีกัน memory โต
  - config เก็บผ่าน `/server antispam set/view/clear` (commands/server.js) → `dc_guild_config` keys: `antispam_honeypot_channel_id`, `antispam_quarantine_role_id`, `antispam_mod_channel_id`
  - wire เข้า `messageCreate` (index.js) เป็นจุดแรกสุด — return early ถ้ามี action กัน forum-index/search/RAG ประมวลผลข้อความที่กำลังจะถูกลบ
- ทดสอบ: mock smoke test 7 เคสผ่านหมด (ไม่ใช่ automated test suite ในโปรเจกต์ — สคริปต์ทดสอบทิ้งไว้ scratchpad ไม่ commit)

**ยังไม่ได้ทำ:**
- Deploy `/server antispam` command ขึ้นจริง (`node deploy-commands.js`) — รอ user สั่ง
- ทดสอบจริงใน Discord server (ต้องมี honeypot channel + quarantine role ตั้งค่าจริงก่อน)
- `channelCreate` listener เติม Quarantine deny อัตโนมัติ + audit script (optional, ยังไม่ทำ)

**สถานะ:** Code เสร็จ + mock test ผ่าน รอ deploy command + ทดสอบจริงบน Discord

---

## 🧹 Code Quality — Bot refactor (จาก external review, จดไว้ 2026-07-03)

> ที่มา: ให้ GLM อ่าน code แล้วสรุปจุดที่ควรปรับปรุง (ไฟล์ IMPROVEMENTS.md เดิมลบแล้ว — สาระอยู่ครบใน list นี้)

> **ตัดสินใจ 2026-07-05:** GLM list เป็น checklist ตำราทั่วไป ไม่ดูบริบท repo (bot ไม่มี test + คนเดียวดูแล) · P2 (แตกไฟล์ใหญ่) เสี่ยงพัง > ประโยชน์ ถ้าจะทำต้องเขียน test ครอบก่อน · P3/P4 churn เยอะ ผลลัพธ์ที่ user เห็น = 0 → **ตัด P2–P4 ทิ้ง**

- [ ] **ทยอยแทนที่ call site ที่เหลือ (boy-scout rule)** — ใช้ `utils/parseSetting.js` แทน pattern `typeof x === 'string' ? JSON.parse` ที่ซ้ำอยู่หลายจุด (เคยเป็นเหตุ basket CPU spike bug) · แตะไฟล์ไหน เก็บไฟล์นั้น ไม่ sweep รอบเดียว (กัน silent bug จาก fallback type ผิด) · ทำแล้ว: verifyHandler.js, panel.js

---

## 🎮 เพิ่ม engagement ให้คนอยู่บน Discord นานขึ้น — ไอเดีย, พับไว้ 2026-07-09

จุดประสงค์จริง: อยากดึงดูดคนอยู่บน Discord มากขึ้น (ไม่ใช่ต้องเป็นเกมขยับตัวเป๊ะๆ)

- ลองไล่มาแล้ว: Discord Activity (ตัดทิ้ง — ต้อง voice/browser), bot+embed grid ขยับ emoji (ตัดทิ้ง — ดูไม่น่าสนใจ)
- 3 ทางเลือกที่เสนอไว้ (ยังไม่เลือก):
  1. **Leveling/Rank system** — ต่อยอดจาก `db/activity.js` + `orgchartEmbed.js` ที่มีอยู่แล้ว, effort ต่ำสุด, engagement แบบ passive
  2. **Slash-command minigame แบบ RNG/สะสม** (เช่น ตกปลา) — loop ให้กลับมาเล่นทุกวัน ต้องออกแบบ economy
  3. **Event/quiz ประจำสัปดาห์** เกี่ยวกับองค์กร — spike engagement แต่ต้องมีคนคิด content ต่อเนื่อง
- **สถานะ:** นึกไม่ออกว่าจะเลือกทางไหน — พับไว้ก่อน ไม่ต้อง scope ต่อจนกว่าจะมีทิศทางชัดขึ้น

---

## 🧹 งานค้างจาก session กวาดเอกสาร (2026-07-21)

> เอกสารทุกฉบับที่ audit ต้องใช้ **ตรงกับ DB จริงแล้ว** (commit `a9d95c4` + `9810983`)

- [ ] **⭐ ให้โมเดลอื่นตรวจ RBAC ทั้ง 4 แอปหลัง org-scope** — พรอมต์พร้อมใช้อยู่ใน `<details>` ข้างล่าง · วางใน session ใหม่ได้เลย (Fable = สลับ `/model` ก่อน · Opus session ว่างๆ ก็ได้ผลใกล้เคียงและถูกกว่า)
  - ⚠️ `/code-review` ปกติดูแค่ diff ที่ยังไม่ commit → **ไม่ครอบ 71 commit ของ org migration** · ตัวที่ครอบทั้ง branch คือ `/code-review ultra` (คิดเงินแยก, ต้อง user สั่งเอง)
- [ ] **🐛 เคสที่สงสัยอยู่ รอ audit ชี้ขาด** — [web/app/api/calling/members/route.js:85-90](web/app/api/calling/members/route.js#L85-L90) ลิสต์สมาชิกกรองด้วย scope เต็ม แต่การเห็นเบอร์/LINE กรองด้วย `session.user.primary_province` ตัวเดียว · ฟิลด์นี้ user แก้เองได้ที่ /profile → คนถือ 2 จังหวัดสลับค่าเองแล้วเห็นเบอร์อีกจังหวัดได้ = ไม่ได้กั้นจริง · ที่อื่นเขาใช้ `getUserScope(access, primary_province)` แบบ**เสริม** scope ไม่ใช่แทน
- [ ] **สคริปต์ที่ยังอ้าง `dc_members`** (ไม่อยู่ใน runtime บอท/เว็บ ไม่บล็อก cutover)
  - `scripts/data/backfill-intro-peoplesparty.js` — pg จริง INSERT INTO dc_members → **พังจาก rename** ถ้าจะใช้ต่อต้องแก้เป็น 2 จังหวะ (users → org_members) ตาม `db/members.js`
  - `scripts/data/backfill-intro-ratchaburi.js` — `require('mysql2/promise')` ตายตั้งแต่ย้ายมา Postgres → ลบทิ้งได้
  - `scripts/social/x-get-token.js:130` — `pool.execute` + `?` + คอลัมน์ `user_id` ยุค MySQL · พังอยู่แล้วก่อน migration · ท่อน insert token น่าจะยังใช้ได้ ถ้ายังต้องใช้ควรซ่อมไม่ใช่ลบ
- [ ] **ฟีเจอร์ที่ ship แล้วแต่ไม่เคยมีเอกสาร** (agent ไม่กล้าเขียนเพราะไม่รู้เจตนา — ต้องคนที่รู้เขียน)
  - **flow ผู้จ่ายเซ็น (docs)** — คอลัมน์มีจริง (`payer_sign_token`, `payer_signed_at`, `docs_signatures.role`) แต่ DOCS.md ไม่มีสักบรรทัด · ไม่รู้ว่าเมื่อไหร่ payer ระดับ entry ต่างจากระดับ project
  - **ฟีเจอร์ SMS (calling)** — `/api/calling/sms`, `SmsModal.jsx`, status `sms_sent/delivered/failed` ยังไม่เคยถูกจด
  - ~12 endpoint ของ docs ที่เอกสารเงียบ · ลายน้ำบัตร ปชช. ที่เอกสารบอก 30°+"สำเนาถูกต้อง" แต่โค้ดจริงเป็น cross-hatch + วันที่
- [ ] **เก็บกวาด slash command** (คนละเรื่องกับโค้ด ทำเมื่อไหร่ก็ได้)
  - ไฟล์ซ้ำ 2 ที่ เนื้อหาเหมือนกันเป๊ะ: `~/.claude/commands/` กับ `.claude/commands/` — `build` `code-simplify` `plan` `review` `ship` `spec` `test` · เก็บที่เดียวพอ (แนะนำ global)
  - **`/review` ชนชื่อ built-in** ของ Claude Code (รีวิว GitHub PR) → ของเราทับอยู่ เรียก built-in ไม่ได้
  - `.claude/commands/code-simplify.md:5` อ้าง skill ที่ไม่ได้ติดตั้ง (`agent-skills:code-simplification`, `code-review-and-quality`) = dead reference

---

## 🌩️ PPLE Platform (console.ppleth.ai) — ไอเดียอนาคต, ยังไม่เริ่ม (2026-07-22)

พรรคมี internal PaaS ใหม่: Cloudflare Worker + Hono + D1 (SQLite) + R2 + `@pplethai/components`, auth = PPLE ID (OIDC, มี province-scope + delegation ในตัว), deploy คำสั่งเดียว `pple deploy` — mini-app รันใน "PPLE Today" · ลอง scaffold demo แล้วที่ `/home/tee/VSites/node/pple-demo` (นอก repo นี้) ใช้งานได้จริง

**แนวคิด: เอาระบบ calling มา rewrite บนแพลตฟอร์มนี้** — user เห็นด้วยถ้า Claude เขียนใหม่ให้ (ไม่ใช่ port ตรงๆ)
- **ไม่ใช่ migration — เป็น rewrite เต็ม:** Postgres→D1/SQLite, Next.js API routes→Hono Worker, Discord-guild RBAC→PPLE ID role/province
- **ข้อดีที่เห็น:** province-scope + delegation ของ PPLE ID ตรงกับที่ calling ต้องการ (coordinator ดูแลเฉพาะจังหวัด) อยู่แล้ว — ไม่ต้องประกอบ RBAC เองแบบตอนนี้
- **ต้องเช็คก่อนเริ่มจริง:** D1 storage/row limit รับข้อมูลปัจจุบันไหว (35 campaigns, 1,156+ logs และจะโตต่อ) ไหม
- ยังไม่เคาะ scope/timeline — แค่บันทึกไอเดียไว้

---

## 🔐 Calling — งานค้างต่อจากรอบอุดเลขบัตรรั่ว (2026-07-23)

**ที่แก้ไปแล้ว** (branch `org-core`, ยังไม่ commit): ปิดรูที่ payload ฝั่ง calling ส่ง `identification_number`
(เลขบัตร ปชช. 13 หลัก · 2,009 ราย), `date_of_birth`, ที่อยู่บ้าน ไปถึงเบราว์เซอร์ทุกคนที่เปิดหน้า calling
สาเหตุ = `SELECT m.*` จาก `cache_pple_member` ซึ่งเป็นสำเนาทะเบียนสมาชิกทั้งแถว → กันด้วย allowlist
ที่ `web/lib/callingFields.js` ครอบ 2 route (`members`, `pending`) · **master ก็รั่วเหมือนกัน** (bug-049)

- [ ] **แก้ที่ต้นทาง — เขียน SELECT ระบุคอลัมน์แทน `SELECT m.*` / `SELECT *`** ใน `web/db/calling/members.js`
      (มี 4 จุด `m.*` + 4 จุด `SELECT *`) · allowlist ที่ API เป็นแค่ตาข่ายกันชั้นสอง ไม่ควรเป็นด่านเดียว
- [ ] **hotfix ขึ้น master** — prod รั่วอยู่ตอนนี้ ไม่ต้องรอ cutover (patch ไม่พึ่งอะไรจาก org-core)
- [ ] **เคาะเรื่องด่าน PDPA ฝั่ง assignee** — `/api/calling/pending` เช็คแค่ `a.assigned_to = ฉัน`
      ไม่เช็คยศเลย ต่างจากหน้า roster ที่เช็ค `canSeeContacts` · และการ assign ต้องการแค่ `canSeeProvince`
      → เหรัญญิกที่ระบบตั้งใจไม่ให้เห็นเบอร์ในหน้า roster สามารถ assign คนให้ตัวเองแล้วอ่านเบอร์ได้
      (ยังไม่ได้ทดลองเดินทางนี้จริง — ต้องเขียนแถว assignment) · จะถือว่า "ถูกมอบหมาย = อนุญาตโดยปริยาย"
      ก็ได้ แต่ต้องเป็นการตัดสินใจ ไม่ใช่ผลข้างเคียง
- [ ] **ไล่ดูฟีเจอร์อื่นที่อ่าน `cache_pple_member`** ว่ามี `SELECT *` แบบเดียวกันไหม (docs/cases)
      — ฝั่ง docs ระวังเรื่องนี้อยู่แล้ว (`ngs-search` ส่งแค่ boolean `has_id_number`) แต่ยังไม่ได้ตรวจครบ

---

## 🔗 References

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — Production-grade engineering skills for AI coding agents
