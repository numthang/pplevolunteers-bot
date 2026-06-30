# PENDING.md — Backlog & Ideas

---

## 📢 ระบบเรื่องร้องเรียน (Case System) — ✅ implement เสร็จ local 2026-06-26 · ดู `md/CASE.md`

> naming เคาะเป็น **`case`** (ไม่ใช่ complaint) · table `cases`/`case_*` · URL `/case/*` · permission `caseworker`

### ✅ ทำเสร็จแล้ว (ยังไม่ deploy prod)
- **Schema:** `cases`/`case_notes`/`case_assignees`/`case_attachments`/`case_config` (รัน dev DB แล้ว) + `config/province-codes.json` (77 จว.) + `config/case-options.json`
- **Public form** `/case/new?province=X` — province จาก URL/picker, PDPA consent, แนบภาพ/เสียง, honeypot + rate limit (เบอร์ 3/วัน, IP 10/วัน)
- **Submit API** `POST /api/case` → createCase + SMS tracking link (ThaiBulkSMS) + สร้าง forum thread ผ่าน Discord REST
- **Public tracking** `/case/[ref]` (status + public note, ไม่มี PII) + dashboard `/case` (headline count + ref lookup)
- **Discord import:** context menu `📋 นำเข้าเป็นเคสร้องเรียน` → modal (จังหวัด pre-fill `case_default_province` + ประเภท) → AI สรุปกระทู้ · `/panel case channel:#forum`
- **เปลี่ยน `/case` เก่า (report สมาชิก) → `/report`** (table `dc_user_reports` ไม่แตะ)
- **Caseworker workspace** `/case/manage` + `/case/manage/[ref]` (gate `canManageCases` + province scope) — รับเรื่อง/note(public·internal)/เปลี่ยนสถานะ + close_reason+public note บังคับตอนปิด
- **Ref:** `<รหัสมหาดไทย>-<พ.ศ.2หลัก>-<random4>` เช่น `70-69-A8F3` · scope เหมือน calling · 189 tests เขียว + build ผ่าน

### ⚠️ ก่อน deploy prod
1. รัน `scripts/migration/migration.sql` บน prod DB (`sudo -u www psql ... -f scripts/migration/migration.sql`) — สร้าง `case_config`/`cases`/`case_assignees`/`case_attachments`/`case_timeline`/`audit_logs`/`case_letter_config` + `letters` column ครบแล้ว (ลำดับถูกต้อง IF NOT EXISTS ปลอดภัย)
2. `./deploy.sh` ลง slash command ใหม่ (`/panel case` + context menu + `/report`)
3. เปิด feature: เพิ่ม `"cases"` ใน `dc_guild_config.enabled_features` ของ guild + `/panel case` ตั้ง forum channel + ตั้ง `case_default_province`
4. สร้าง Discord role + map permission `caseworker` ใน `dc_guild_roles`
5. **เทสต์ happy-path จริง** (ฟอร์ม → SMS เข้าเบอร์ตัวเอง → forum thread เกิด) — ยังไม่ได้เทสต์เพราะ SMS ยิงจริง
6. **แก้ crontab บน prod** — `sync-act-events.js` ย้ายจาก `scripts/` → `scripts/data/` แล้ว ต้องอัปเดต path ใน crontab ของ `www` user
7. ใส่ `case_letter_config` per-province ผ่าน DB INSERT (org_name/address/signer_name/signer_position/coordinator_name/coordinator_phone)

### ⏳ ต้องทดสอบหลัง deploy
- **Discord import จากกระทู้เรื่องร้องเรียน** — context menu `📋 นำเข้าเป็นเคสร้องเรียน` บนข้อความใน thread → modal → สร้าง case + AI สรุป (build แล้ว ยังไม่ได้ทดสอบจริง ต้อง deploy.sh ก่อน)

### 🔧 Backlog — Case System UX
- **ปุ่มสีส้ม** — CaseNewForm + CaseManageActions เปลี่ยนปุ่ม primary จาก indigo → `bg-brand-orange hover:bg-brand-orange-light`
- **`/bot/features` เปิด/ปิด feature cases** — เพิ่ม `cases` เข้า feature list ใน `/bot/features` UI (ปัจจุบัน toggle ได้แค่ผ่าน DB ตรงๆ)
- **URL `/case/new/[province]` แทน `?province=`** — เปลี่ยน route จาก `app/case/new/page.js` เป็น `app/case/new/[province]/page.js` · redirect `/case/new` → `/case/new/` (picker) · link ที่แชร์จะเป็น `/case/new/ราชบุรี` หรือ `/case/new/70`
- **Hamburger — เอา 3 เมนูบนออก** — เมนูบนใน hamburger คือ `menuLinks` (links ของ app ปัจจุบัน) ซ้ำกับ app switcher ด้านล่าง → ซ่อน section นี้เมื่ออยู่หน้า home/dashboard (หรือเอาออกถาวร ถ้า DASHBOARD_LINKS ซ้ำทุก app)
- **Detect location → link จังหวัด** — หน้า `/case` public dashboard มีปุ่ม "ใช้ตำแหน่งของฉัน" → `navigator.geolocation` → reverse geocode → redirect `/case/new/[จังหวัด]` (ต้องหา reverse geocode API ที่ไม่มีค่าใช้จ่าย เช่น Nominatim/OSM)

### 🔄 Sync กระทู้เข้าระบบ — 2 ช่วง
- **Backfill** — script รัน 1 ครั้ง ดึงกระทู้เก่าทั้งหมดใน forum channel มาสร้าง case (skip ถ้ามี `discord_thread_id` แล้ว)
- **Manual** — context menu `📋 นำเข้าเป็นเคสร้องเรียน` ทีละกระทู้ (สำหรับ historical ที่ bot พลาด)
- *(ต่อไป: auto-import ทุกครั้งที่สร้างกระทู้ใหม่ — ดู section ด้านล่าง)*

**กระบวนการ sync — AI generate 3 ส่วน:**
1. **หัวข้อ (title)** — ต้องการคุยก่อนว่า prompt ให้ AI เขียนอะไร ให้อ่านแล้วเข้าใจเรื่องได้เร็ว (เช่น "ถนนพัง ซ.3 ต.บ้านเลือก / ราชบุรี" หรือ "ไฟฟ้าดับซ้ำซาก อ.โพธาราม" ?)
2. **เรื่องย่อ (ai_summary)** — สรุปเนื้อหากระทู้ทั้งหมด
3. **Timeline** — เรียง message สำคัญจากกระทู้ (ยังไม่ได้ออกแบบ schema รองรับ)

**เคาะแล้ว 2026-06-28:**
- format หัวข้อ = `[ประเภท] สาระสำคัญ — พื้นที่` เช่น `ถนนชำรุด ซ.วัดโพธิ์ หมู่ 3 — อ.โพธาราม ราชบุรี`
- timeline แยก table `case_timeline` (ไม่ใช้ case_notes) — เพราะบาง event ไม่อยากเผยแพร่ มี visibility control แยก
  - schema: `(id, case_id, discord_message_id UNIQUE, body, is_public, occurred_at)`
  - partial unique index บน `discord_message_id` → dedup incremental update ได้
  - refresh: fetch message หลัง `last_synced_message_id` → AI คัด event → `INSERT ... ON CONFLICT DO NOTHING`
  - **Auto:** AI generate จาก Discord messages → ตัดสิน is_public เองจากเนื้อหา (public=ความคืบหน้าทั่วไป, private=ชื่อ/เบอร์/นัดหมายภายใน) → return JSON `[{ body, is_public, occurred_at }]`
  - **Manual:** caseworker เพิ่ม/แก้/toggle is_public รายตัวใน manage page
  - ต้องเพิ่มใน migration.sql + `web/db/cases.js` + `db/case.js` + backfillCaseThreads.js + หน้า tracking + manage page

### 🆕 Auto-import เมื่อสร้างกระทู้ใหม่ใน forum
- `threadCreate` listener ใน `index.js` → เช็คว่า thread อยู่ใน `case_config.forum_channel_id` ของ guild
- auto สร้าง case: `source='discord'`, `province=case_default_province`, `category=null`, `title`=thread title, `detail`=first message, `created_by`=Discord ID ผู้สร้าง, `complainant_phone=null`
- AI สรุป → `ai_summary` · โพสต์ใน thread: "✅ เข้าระบบแล้ว · ref: `XX-XX-XXXX`"
- context menu เดิมยังไว้ใช้กับ historical thread ที่ bot พลาด
- ไฟล์: `index.js` + `handlers/caseImportHandler.js` (เพิ่ม `handleThreadCreate`)

### V2 (เลื่อนไว้)
- Public dashboard charts (จังหวัด/ประเภท/สถานะ) + flag "ซ่อนเคสจาก dashboard"
- ปุ่ม "อัปเดต AI สรุป" ฝั่ง web (ต้องเพิ่ม AI SDK ใน web ก่อน) · auto-assign · cron poll · แยกห้อง noti ตามจังหวัด · CAPTCHA

### ✅ Audit Log กลาง (v2.19.0)
- table `audit_logs (id, guild_id, app, action, actor_id, target_id, meta JSONB, created_at)` — migration เสร็จแล้ว
- `web/db/auditLog.js` fire-and-forget · ใช้ใน cases routes แล้ว
- ยังไม่ wire: finance/docs/calling routes + admin log page (V2)

### 📍 Auto-detect location บน `/case/new`
- โหลดหน้า → `navigator.geolocation` อัตโนมัติ (ถ้าไม่มี province ใน URL) → Nominatim → pre-fill จังหวัด
- ถ้า user ปฏิเสธ/ไม่รองรับ → ตกไปที่ combobox เลือกเอง

### ✅ ระบบร่างหนังสือร้องเรียน (v2.19.0, 2026-06-30)
- AI ร่างหนังสือจากข้อมูลเคส → แก้ไข → บันทึกร่างหลายฉบับใน `cases.letters` (JSONB)
- header/ผู้ลงนามดึงจาก `case_letter_config` per-province อัตโนมัติ (ไม่ต้องกรอกในฟอร์ม)
- สร้าง PDF (LibreOffice headless + TH Sarabun New) → preview image + ดาวน์โหลด + พิมพ์
- เลขอารบิกในเอกสาร → เลขไทยอัตโนมัติ · margin left 2cm · font 16pt
- `CaseLetterModal` 5 steps: init → pick draft → AI loading → edit → preview
- ไฟล์: `web/app/api/case/[ref]/letter/` (draft/drafts/save/generate) · `web/components/case/CaseLetterModal.jsx` · `web/lib/generateComplaintLetter.js` · `web/db/caseLetterConfig.js` · `web/templates/complaint/`

### 🏛️ ระบบแนะนำหน่วยงาน + ช่องทางยื่น
- จาก category + ประเภทปัญหา → AI แนะนำว่าควรยื่นหน่วยงานไหน (ท้องถิ่น / จังหวัด / สภา / ระดับชาติ / อื่นๆ)
- บอก workflow ติดตาม: ยื่นแล้วต้องทำอะไรต่อ ภายในกี่วัน มีสิทธิ์อุทธรณ์ไหม
- ต้องคุย scope ก่อน: เป็น AI-generated per case หรือ static knowledge base + AI overlay

---

## 🤖 Discord Bot AI Chat (Mention)

- [ ] **Bot ตอบเมื่อ mention** — `@bot <คำถาม>` ในทุกห้อง bot ตอบ plain text reply
  - trigger: `messageCreate` + `message.mentions.has(client.user)` (ไม่ใช่ slash command)
  - retrieval: `searchPostsWithContent()` จาก Meilisearch (ต้องเพิ่ม fn ใหม่ใน `meilisearch.js` — คืน id/post_name/post_url/content ไม่ตัด crop)
  - context: forum content เป็น context เสริม ถ้าไม่มีก็ตอบ general knowledge ได้เลย
  - บุคลิก: casual เหมือนทีมงานคนนึง ไม่ formal
  - reuse `callAI` จาก `aiSummarize.js` (ต้อง export เพิ่ม)
  - toggle เปิด/ปิด: feature key `ai_mention` ที่ `/bot/features` (ระบบ `dc_guild_config` enabled_features ที่มีอยู่แล้ว)
  - ไฟล์ใหม่: `services/ragSearch.js` (buildRagContext) · แก้: `services/meilisearch.js`, `services/aiSummarize.js`, `index.js`

---

## 📲 LINE Messaging API

- [ ] **LINE Push Notification** — ส่งแจ้งเตือน 1:1 หา user ผ่าน LINE OA ที่มีอยู่แล้ว
  - ต้องเปิด Messaging API บน OA (LINE Official Account Manager → Settings → Messaging API)
  - User ต้อง add OA เป็นเพื่อน + ผูก LINE OAuth ในระบบ → ได้ LINE User ID (`line_sub` ใน `dc_user_identities`)
  - use case: แจ้งสลิปโอนเงิน, แจ้ง calling campaign, แจ้ง tier
  - ค่าใช้จ่าย: 200 ข้อความ/เดือนฟรี, หลังจากนั้นคิดเงินเหมือน broadcast plan

---

## 🌐 pplevolunteers.org — Auth & Platform

- ✅ **Multi-provider login** (v2.13.0, 2026-06-17) — Discord บังคับครั้งแรก แล้วผูก LINE / Google / Passkey ได้จากหน้า profile
  - `dc_user_identities` table (provider, provider_id, credential json) — migration อยู่ใน `scripts/migration/migration.sql`
  - `dc_user_config` table — เก็บ passkey challenge + nonce (TTL 2 นาที)
  - Link UI ใน `/profile?tab=security` + `LinkAccountsBanner` บน dashboard (ผูกได้เลยไม่ต้องเข้าหน้า profile)
  - Login page: icon เล็ก LINE/Google/Passkey ใต้ปุ่ม Discord
  - session username/avatar โหลดจาก `dc_members` ทุก provider (ไม่ใช่จาก provider profile)
  - **⚠️ prod pending:** เพิ่ม redirect URI `https://pplevolunteers.org/api/auth/callback/google` ใน Google Cloud Console + ตั้ง env `LINE_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `PASSKEY_RP_ID`

---

## 🔐 RBAC / Multi-guild Refactor

> **รายละเอียดเต็มอยู่ที่ `SPEC.md` (root)** — ที่นี่เก็บสรุปไว้กัน SPEC.md ถูกลบหลัง implement

**เป้าหมาย:** ให้แต่ละ guild **ปรับแต่ง role ของตัวเอง**ได้โดยไม่แก้ code — ครอบทั้ง **RBAC** (permission+scope สำหรับ calling/finance) และ **Picker** (interest/skill/province = เมนูปุ่มกดเลือก role ติดป้าย/เปิดห้อง) ตอนนี้ hardcode อาสาประชาชนทุกที่: `financeAccess.js`, `callingAccess.js`, `roles.js`, `config/roles.js`, `GUILD_ID`

### แนวคิดหลัก — role แขวน 2 ป้าย
- **ป้าย A (Picker):** group + label + emoji + order → ปุ่มกดเลือก
- **ป้าย B (RBAC):** permission + scope_node → คุมการเห็นข้อมูล
- ป้ายซ้อนกันจุดเดียว = กลุ่ม **province** (กดเลือกจังหวัด + role พ่วง scope)

### Canonical permission set (2 แกน)
- 🔧 action: `admin` (เห็น private คนอื่น), `moderator` (action-only ไม่เห็นข้อมูล)
- 🗂️ data: `secretary_general`=เลขาธิการ (≠admin ดู private คนอื่นไม่ได้), `regional_coordinator` (รวม deputy), `province_coordinator`=ผู้ประสานงานจังหวัด, `district_coordinator`=กรรมการจังหวัด (ตทอ. · สิทธิ์เท่า province_coordinator ตอนนี้ แยก token ไว้ปรับลดทีหลัง), `treasurer`, `editor`
- `super_admin` (env), `member` (default)
- เปลี่ยนแค่ input ไม่แตะ branching logic → test เดิม 57+37 พิสูจน์
- ⚠️ `supervisor` เปลี่ยนชื่อเป็น `secretary_general` แล้ว (เลี่ยงชนชื่อ Discord role `supervisor` ที่เป็นสาย technical)

### Schema (2 ตาราง)
- `dc_guild_role_groups` — นิยามกลุ่ม picker (guild_id, group_key, label, **kind** plain/province, sort_order); fix 3 กลุ่ม รอบนี้ (สร้างเองทีหลัง)
- `dc_guild_roles` — catalog ทุก role + ป้าย B (permission, scope_node) + ป้าย A (picker_group, picker_label, picker_emoji, picker_order); PK `(guild_id, role_id)`, lookup by role_name ผ่าน index
- bot sync catalog อัตโนมัติ (เพิ่ม/ลบ/rename ไม่ต้องแตะมือ) · fail-safe: ไม่มีแถว/null = ไม่มีสิทธิ์

### Resolver
`resolveAccess(guildId, roleNames[]) → { isMember, permissions: Set, scopeGrants: [] }`
- คืน **raw scope grants ไม่ pre-expand** — finance/calling expand เองคนละแบบ (สองระบบนับ scope ต่างกัน: finance 3-ชั้น/ถือหลายจังหวัดได้, calling ภาคย่อย+จังหวัดเดียว/primaryProvince) **ห้ามยุบรวม**
- `getUserScope` (calling) เก็บเหมือนเดิม แค่กิน grant แทนชื่อ role

### Feature matrix (สกัดจาก code)
- **Finance** — view private คนอื่น: **admin เท่านั้น** · edit province: admin/supervisor/province_coordinator(scope)/treasurer(scope) · edit wide: admin/supervisor/treasurer · create non-private: +regional_coordinator
- **Calling** — view campaigns/members: admin/supervisor/regional/province(scope) · create campaign: เหมือน view (ไม่รวม member) · see phone/LINE: admin/supervisor/regional/province · override tier: admin/supervisor/treasurer · delete log: admin/supervisor/**moderator**
- **Bot/Social** — manage social+guild config: admin · ai config: super_admin

### ขอบเขต
- ✅ ทำรอบนี้: RBAC (permission+scope) + Picker (interest/skill/province render จาก DB) — **fix 3 กลุ่ม**
- ⏳ ทำต่อ: **สร้างกลุ่ม picker เองได้ (dynamic groups)** — schema เผื่อ `kind` ไว้แล้ว ไม่ต้องรื้อ
- ⏳ ทำต่อ: UI per-guild role config

### หลักการ DB (ตัดสินแล้ว)
- ทุกตารางอยู่ `public` schema เดียว — **ไม่แยก** calling/finance เป็น pg schema (share `dc_members` หนัก, data น้อย, join ยุ่งขึ้นเปล่าๆ)
- แยกด้วยชื่อขึ้นต้น (`dc_`/`calling_`/`finance_`) พอ
- boundary public/internal บังคับที่ **app layer** (membership gate + resolver) ไม่ใช่ DB schema
- Tier 0 identity (`dc_`, `dc_guild_roles`, `dc_guild_config`) อ่านโดย resolver → Tier 1 feature data (`calling_`, `finance_`) เข้าได้หลังผ่าน gate+permission

### Security gate (แยกงาน — ยังไม่เร่ง เพราะยังไม่เปิดใช้จริง)
- `POST /api/calling/logs` ไม่เช็ค role · `GET /api/calling/stats`,`logs` ไม่ filter scope
- `getEffectiveIdentity` fallback ใช้ JWT เก่าเมื่อ user ไม่อยู่ guild
- JWT `maxAge` 90 วัน → stale roles · หลาย route ใช้ `session.user.roles` (JWT) แทน `getEffectiveRoles` (DB-fresh)

### ลำดับทำ (guild อาสาประชาชนทำงานปกติทุก step)
1. ✅ migration 2 ตาราง (`dc_guild_role_groups` + `dc_guild_roles`) — commit bbc8291
2. ✅ seed — **ดึง role id↔name สดจาก Discord** (ไม่พึ่ง config/roles.js ที่ drift) + overlay policy · รัน DB จริงแล้ว (207 roles)
3. ✅ `web/lib/` geography + permissions + resolveAccess + tests
4. ✅ financeAccess/callingAccess เช็ค permission/scope (commit e6cf556) — ลบ map ใหญ่, branching เดิม
5. ✅ port test (finance 57 + calling 37) ผ่านครบ · รวม suite 134 เขียว
6. **bot:** (a) ✅ catalog auto-sync → `dc_guild_roles` (commit 894f596 · `db/guildRoles.js` + index.js ready/roleCreate/Update/Delete · ไม่แตะ policy) · (b) ✅ render **interest/skill** จาก DB (commit 644abe1 · customId=role_id, ทิ้ง divider) · (c) ✅ **province จาก DB** — `getRolesByScopePrefix('province:')` + cascade ผ่าน `parent_role_id` chain
7. ✅ **DB-wiring เสร็จ (2026-06-11):** `getEffectiveIdentity` คืน `access` จาก `resolveAccess`(DB) · เพิ่ม `GET /api/me/access` (permissions เป็น array เพราะ Set ข้าม JSON ไม่ได้) · `useEffectiveRoles` fetch endpoint นี้ · consumer 22 ไฟล์ส่ง `access` แทน array · **ลบ mirror (`roleToAccess`+`PERMISSION_BY_ROLE`) ออกจาก `roleAccess.js` แล้ว** ย้ายเป็น test fixture `lib/__tests__/_rolesToAccess.js` · test 134 เขียว + build ผ่าน
   - ✅ **เลขาธิการ:** สร้าง role ใน Discord + sync `dc_guild_roles` จาก production แล้ว — `secretary_general` active
8. ✅ **ลบ `config/roles.js`** — migrate consumer ทุกตัว query `dc_guild_roles` แทน hardcode · MEDIA_TEAM + province cascade รวมเป็น **`parent_role_id` column เดียว** (add → แปะ parent chain · remove → ถอด parent ถ้าไม่เหลือ sibling) · ทั้ง 2 handler โชว์ parent ที่ถูกแตะใน status · ข้อมูลเดิม archive ที่ `scripts/migration/_roles-archive.js` (seed scripts เท่านั้น)
9. ✅ **UI per-guild role config (เสร็จ 2026-06-13):** `/bot/roles` + `GET/PATCH /api/bot/roles` · admin ตั้ง `permission`/`scope_node`/`picker_group`/`parent_role_id` ต่อ role ได้ · clearAccessCache ทันทีหลัง patch · dynamic group (สร้างกลุ่มเองได้) ยังไม่ทำ — schema เผื่อ `kind` ไว้แล้ว ขยายได้ทีหลัง
10. ✅ **web `GUILD_ID` → session (เสร็จ 2026-06-13, v2.12.0):** `lib/guildContext.js` `getGuildId(session)` (cookie `selected_guild` → validate member → fallback env) · `getEffectiveIdentity` guild-aware · ทุก consumer (calling 9 + finance 5 + profile + page + debug-role) → `await getGuildId(session)` · **guild switcher UI** (dropdown แทน app switcher) + **feature toggle** + **no-guild gate** + **super_admin เห็นทุก guild** · เหลือ edge fallback (defer)
11. ✅ **แทนที่ name-check ด้วย permission (เสร็จ 2026-06-14):** ทุก gate ฝั่ง web เช็ค **permission** (ผ่าน `can()` / `isAdmin(access)`) แทนชื่อ Discord role → guild ที่ตั้งชื่อ role ต่างทำงานถูก
    - **foundation:** `lib/roles.js` `isAdmin/isEditor` รับ `access` object แทน array (+ ลบ dead helper canViewAccount/canEditFinance/isRegion/isProvince/isเหรัญญิก) · `lib/permissions.js` เพิ่ม capability `editGlobalCategory`/`manageContacts`/`sendBulkSms`/`viewServerLogs` · test ใหม่ `permissions.test.js` (37 เคส) — รวม suite **171 เขียว**
    - **finance:** admin-flag `getAccountsAll` → `can('viewPrivateOther')` = **admin เท่านั้น** (เลขาธิการเห็น private คนอื่นไม่ได้ ตรง SPEC; เดิม `app/page.js` ใช้ isAdmin เพี้ยน) · `getTransactions` admin param เป็น dead arg → ลบทิ้ง · categories ×2 → `isAdmin(access)`+`editGlobalCategory`
    - **server admin-gate (~11 routes):** social ×3 / bot roles·features·quote-config·ai-modes / meta-oauth / admin-guilds → `getEffectiveIdentity().access` · **debug-role ×2 → `getRealAccess()`** (effective จะ trap admin ใน debug mode) · เพิ่ม `getRealAccess()` + `realAdmin` ใน `/api/me/access`
    - **calling/admin logs:** `calling/logs` → `can('deleteLog')` · `admin/logs` route+page → `can('viewServerLogs')`
    - **client:** Nav (link `capability:` + `userIsAdmin=realAdmin`), platforms, categories, contacts, assignee, assignments, RecordCallModal, transactions → `can()`/`isAdmin(access)` ผ่าน `useEffectiveRoles` (access เริ่ม null = fail-closed)
    - **คงไว้โดยตั้งใจ:** `useEffectiveRoles.js:19` (optimistic debug-combo read ฝั่ง client — authoritative gate ย้ายไป server `getRealAccess` แล้ว) · `lib/debugCombos.js` (debug fixture data ไม่ใช่ gate)
    - **follow-up (2026-06-14):** `db/guilds.js getAdminGuildIds` เคยหลุด (อยู่ใน `db/` grep ไม่โดน) ยัง name-check `Admin`/`เลขาธิการ` → แก้เป็น JOIN `dc_guild_roles` หา permission `admin`/`secretary_general` (multi-tenant) · parity ผ่าน: อาสาประชาชน admin ครบ, ราชบุรีไม่มี admin ทั้ง 2 query, 6 pair ที่ต่างอยู่ใน guild ไม่ register (benign) · bot/ai page เลิก name-check `ทีมบรรณาธิการ` → `isEditor(access)`

12. ✅ **view-as-role effective ทุกหน้า/ทุก role (2026-06-14):** เดิม effective แค่ finance/calling — แก้ให้ครบ
    - **กัน trap ก่อน:** `DebugRoleButton`/`DebugRoleBanner` โผล่จาก cookie `active` อย่างเดียว (ไม่ผูก `isAdmin`) → ออกจาก debug ได้เสมอแม้ view เป็น role ที่ไม่ใช่ admin
    - **Nav `userIsAdmin`** เปลี่ยน `realAdmin` → `isAdmin(access)` (effective) → เมนู admin/adminOnly สะท้อน view-as-role · superAdmin (env) ยังเป็น escape hatch (preview-as-lower ไม่ได้ = by design)
    - **กระทบเฉพาะ debug session** — user ปกติ effective==real ไม่มี regression · combo ใหม่ตาม use case (เพิ่ม Moderator, ตัดตัวซ้ำ regional/district) ใน `debugCombos.js`
    - **ยังไม่ effective โดยตั้งใจ:** assignee (key personal discordId), stats (ไม่ filter scope — security gate งานแยก PENDING §RBAC line 55-56)

### Deferred (RBAC) — ทำตอนต้องใช้
- **registerHandler province part** — ✅ ย้าย DB แล้ว (`getRolesByScopePrefix`)
- **db/members.js** — ✅ derive province/interests จาก DB แล้ว (`getRolesByScopePrefix` + `getPickerRoles`)
- **MEDIA_TEAM + cascade → DB** — ✅ `parent_role_id` column · per-guild config rule เองได้ ไม่ hardcode
- **interest flat ≤20 ปุ่ม/ข้อความ** (Discord 5 แถว) — ตอนนี้ 18 · ถ้าเกินต้อง paginate
- **(optional) `dc_members.role_ids` ขนานกับ `roles`** — แก้ปัญหา *rename role แล้วสิทธิ์หาย*: web เช็ค permission โดย match **ชื่อ** `dc_members.roles` ↔ `dc_guild_roles.role_name` → ถ้า admin เปลี่ยนชื่อ role ใน Discord, `dc_guild_roles` อัปเดตทันที (roleUpdate) แต่ `dc_members.roles` ค้างของเก่าจน member re-sync → match ไม่เจอ สิทธิ์หายชั่วคราว · ทางแก้: เพิ่ม column `role_ids` (id, comma) ใช้ **เช็ค permission อย่างเดียว** (id ทน rename), คง `roles` เดิมไว้ display ไม่แตะ · `_deriveRoleFields` เขียน 2 ช่อง, resolveAccess match `role_id`, backfill member เก่า + fallback ชื่อระหว่าง migrate · **ยังไม่จำเป็นตอนนี้** (rename ไม่บ่อย) จดเผื่อเจอ bug สิทธิ์หายจะได้นึกออก · bot ไม่เจอปัญหานี้เพราะใช้ role_id อยู่แล้ว

> **สถานะ 2026-06-17 (v2.13.0):** ✅ **RBAC step 1–12 เสร็จครบ + deploy prod แล้ว** — bot + web roles อ่านจาก DB ทั้งหมด ไม่มี hardcode policy · guild switcher + feature toggle + view-as-role + per-guild role config UI live · multi-provider login (LINE/Google/Passkey) live · เหลือ: dynamic groups (step 9 ส่วนขยาย) + security gate (deferred) + edge case guild-mismatch cookie (defer)
> **prod deploy history:** v2.11.0 (2026-06-11) step 1–8 · v2.12.0 (2026-06-13) guild switcher · v2.13.0 (2026-06-17) step 9–12 + multi-provider login

---

## 🗄️ Database / Infrastructure

- ~~dc_server_settings → dc_guild_config~~ ✅ (2026-06-04)
- ~~MySQL → PostgreSQL migration~~ ✅ (2026-06-04)
- [ ] **Multi-guild role config** → ย้ายไปรวมที่ section **🔐 RBAC / Multi-guild Refactor** ด้านบน (design ตกผลึกแล้ว: `dc_guild_roles` DB table + permission abstraction + resolver)
- [ ] **ลบ/แทนที่ `scripts/roles/syncAllMembers.js`** — ตัวเก่าพังหลัง migrate PG (เขียน table `members` + MySQL syntax) ใช้ `scripts/calling/sync-discord-members.js` แทน

---

## 🤖 PPLE Bot / Social Share

- ~~Discord (Guild) Config — Restructure~~ ✅ (2026-06-04)
- ~~Watermark — Personal Account~~ ✅ (2026-06-04)
- ~~Web IA restructure~~ ✅ (2026-06-07) — basket/quote/platforms/watermark ใน path ใหม่
- ~~AI Thread Summarizer — context menu "🤖 AI สรุปเธรด"~~ ✅ (2026-06)

### Quote Modal — Pre-fill & AI
- [ ] **Optional / Future:** ตั้งค่า default ชื่อ/ตำแหน่งใน Quote modal ผ่าน backoffice (แทน `.setValue` hardcode ที่ลบออกแล้ว)
- [ ] **Optional / Future (ถ้าไม่ซับซ้อนเกิน):** ปุ่ม "AI คัด quote เด็ด" ใน modal — ดึง quote + attribution จาก thread อัตโนมัติโดยใช้ mode `quote_highlight` แล้ว pre-fill ช่องให้
- [ ] backoffice Quote (`/bot/media/quote`) — เพิ่ม config **default crop position** (ตำแหน่งครอป 1:1) ต่อ user/guild ให้ขึ้น pre-select ใน dropdown เหมือน template + watermark
- [ ] **ตรวจสอบ:** ลายน้ำบน Quote Image มีประโยชน์จริงไหม? — Quote ส่งตรงจาก `/quote` ไม่ผ่าน basket ส่วน basket ติดลายน้ำตอน post อยู่แล้ว → ถ้า flow หลักคือ quote → basket → post ลายน้ำบน quote อาจซ้ำซ้อน พิจารณาตัด dropdown ลายน้ำออกจาก quote modal

### Social Share — X (Twitter)
- [ ] **Optional / Future:** Infographic — แปลงบทความยาวๆ เป็นรูปสรุปแนบโพสต์หลัก

### Context Menu — Add to Calendar
- [ ] Context menu บนข้อความใน Discord → เพิ่มเข้าปฏิทิน
  - parse Discord event URL หรือ Google Meet URL จากข้อความ
  - parse วันที่/เวลาจากเนื้อความ
  - เลือกปฏิทินได้ (Google Calendar + ปฏิทินทีม เช่น "ทีมสื่อราชบุรี") — รองรับ 2-3 ปฏิทิน

---

## 💰 PPLE Finance

- ~~Web routes multi-guild~~ ✅ — 5 ไฟล์ใช้ `getGuildId(session)` ครบแล้ว (v2.12.0)
- [ ] ระบบเบี้ยเลี้ยง — โอนเงินเป็นรอบๆ (บัญชีเขต + บัญชีทีมงาน)
- [ ] ระบบบัญชีเบี้ยเลี้ยงจังหวัด — ส่งสลิปเก็บง่าย + DM สลิปไปหาสมาชิก
- [ ] จัดการเบี้ยเลี้ยงจากสมาชิก Discord
- [ ] ระบบชำระเงินค่าเบี้ยเลี้ยง — ผูกเบอร์บัญชีธนาคารกับสมาชิก

---

## 📞 PPLE Calling

- ~~Mobile bug — `/calling/campaigns/[id]/edit` เด้งขึ้นบน~~ ✅
- ~~Dashboard สรุป (`/calling/stats`) — gauges + charts~~ ✅

### ยังเหลือ

#### Schema + tenant-ready (3 ขั้น) — ✅ เสร็จ 2026-06-13

- ✅ **ขั้น 1 Migration** — `guild_id` + index + backfill 4 tables (commit 2fd9e5f) · รัน DB จริงแล้ว rowcount ครบ
- ✅ **ขั้น 2 DB functions** — members/tiers/starred/logs/assignments รับ `guildId` param (commit 2fd9e5f) · ครอบ read+write path
- ✅ **ขั้น 3 Web routes** — calling routes ใช้ `await getGuildId(session)` แทน `process.env.GUILD_ID`
- test 134 เขียว + build ผ่าน

---

#### CSV import สมาชิก (`scripts/importGuildMembers.js`)
- รับ `<guild_id> <file.csv>` → insert ลง `ngs_member_cache`
- columns ขั้นต่ำ: `first_name`, `last_name`, `phone`; optional: `line_id`, `province`, `amphoe`
- ACT-specific fields = NULL; progress output ตาม convention (total → `\r N/total` → สรุป)

---

- [ ] เบอร์กลางโทรออก — แสดงเบอร์กลางขององค์กรแทนเบอร์ส่วนตัว (ต้องการ provider/config เบอร์กลาง)
- [ ] แสดง active event บน dashboard + default event จังหวัดดึงจาก XLS
- [ ] Audit logs — ดูประวัติการแก้ไข/เพิ่มข้อมูล
- [ ] Approval flow ข้ามภาค — จังหวัด → ภาค → ประเทศ ขอ approval ผ่านผู้ประสานงาน

---

## 👥 PPLE Contacts

- ~~Multi-server design~~ ✅ ตัดสินใจแล้ว: `calling_contacts` อยู่ table เดียว แยกด้วย `guild_id` (มีอยู่แล้ว) — ล็อคเฉพาะ อาสาประชาชน
- [ ] **Import ข้อมูลผู้บริจาค** เข้า `calling_contacts` — ข้อมูลต้อง copy จากเว็บไซต์มาก่อน (format ยังไม่ชัด) → ต้องทำ import script รับ CSV/Excel

---

## 🏗️ Web Architecture — ตัดสินใจแล้ว (2026-06-12)

**Guild switcher** — ทุกหน้า, ทุก feature; user เห็นเฉพาะ guild ที่ตัวเองเป็น Discord member (`dc_members WHERE discord_id = ?`); admin เห็นทุก guild; data เปลี่ยนตาม guild ที่เลือก

**Feature toggle** — ระดับ guild (ไม่ใช่ระดับ user); เก็บใน `dc_guild_config` key `enabled_features`; เมนูซ่อนตาม toggle:

| Feature | Default |
|---|---|
| Finance | เปิดตลอดทุก guild (ไม่มี toggle) |
| Calling | อาสาประชาชน = on, อื่น = off |
| Contacts | อาสาประชาชน = on, อื่น = off |
| Bot | public ทุก guild |

✅ **Nav.jsx เสร็จแล้ว (2026-06-12):**
- แก้บั๊ก ภาพรวม/Dashboard active ตลอด (เพิ่ม `exact: true` สำหรับ root links `/finance` และ `/calling`)

- ✅ **Guild switcher เสร็จ (2026-06-13):** guild dropdown แทน app switcher (ซ้ายบน) · app switching → hamburger · `getUserGuilds(discordId)` list เฉพาะ guild ที่เป็น member (INNER JOIN `dc_guilds`) · route `POST /api/guild/switch` set cookie `selected_guild` + validate membership · `router.refresh()` เปลี่ยน data
  - **รากฐาน (chunk 1–4):** `lib/guildContext.js` `getGuildId(session)` (cookie → validate member → fallback env) · `getEffectiveIdentity` guild-aware · ทุก consumer `process.env.GUILD_ID` → `await getGuildId(session)` (calling 9 + finance 5 + profile + page + debug-role) · เหลือ fallback ใน guildContext + login ใน auth-options (ตั้งใจ)
  - ✅ **no-guild gate:** login แต่ไม่ได้เป็น member ของ guild ใด → `NoGuildNotice` (layout block children) · ยกเว้น super_admin
  - ✅ **super_admin เห็นทุก guild:** `getUserGuilds(discordId, { all })` → `all=true` คืน `getGuilds()` ทั้งหมด
  - ⚠️ **edge case ค้าง (defer):** user ที่ไม่ได้เป็น member ของ guild default (env=อาสาประชาชน) แต่เป็น guild อื่น → ไม่มี cookie → `getGuildId` คืน default → backend query default แต่ Nav โชว์ guilds[0] = mismatch · RBAC กันข้อมูลอยู่ (`isMember=false`) · ไม่กระทบตอนนี้ (user หลักเป็น member อาสาประชาชน) · แก้ที่ดีต้อง middleware/cookie-on-login (เลี่ยง +query ทุก request) — ทำตอนเปิด guild ที่ 2 จริง
- ✅ **Feature toggle เสร็จ (2026-06-13):** `getEnabledFeatures(guildId)` อ่าน `dc_guild_config` key `enabled_features` (json array) · Nav `APPS`/`DASHBOARD_LINKS` มี field `feature` ('calling'/'contacts') · `featureOn()` ซ่อนเมนู · finance/bot เปิดตลอด · seed อาสาประชาชน `["calling","contacts"]` · guild ใหม่ default `[]` = off · **scope ปัจจุบัน: ซ่อน nav เท่านั้น (ไม่ block route)** — ข้อมูลถูก isolate ด้วย guild_id อยู่แล้ว
  - ✅ **Backoffice UI เปิด/ปิด feature ต่อ guild** — `/bot/features` toggle UI พร้อมแล้ว
- ✅ **API routes:** Finance 5 + Calling 9 routes เปลี่ยน `process.env.GUILD_ID` → `await getGuildId(session)` แล้ว (อยู่ใน chunk 3–4)
- ✅ **Client-component reload ตอนสลับ guild (เสร็จ 2026-06-14):** เดิม `router.refresh()` รีเฟรชแค่ server component · client page/component ที่ fetch เองไม่รีโหลด → เพิ่ม `window.addEventListener('guild-switched', load)` + cleanup ครบ **11 จุด** (finance accounts/categories/transactions/report · calling contacts/assignee/stats · bot platforms/ai · QuotePanel · WatermarkPanel) · transactions ล้าง accountId filter + WatermarkPanel re-fetch currentGuildId → remount GuildPanel · home (server comp) ใช้ router.refresh เหมือนเดิม · **ยังไม่ deploy prod**

---

## 🔌 Integration — Panel / ACT / External APIs

### Panel 360
- [ ] รายชื่อผู้บริจาค 360 — ขอ schema, pkey คืออะไร
- [ ] API สมาชิกพรรค และรายนามผู้บริจาค
- [ ] ขอ endpoint: `GET /api/members`, auth method, pagination format (ต้องการ cursor-based)

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

> รายละเอียดทั้งหมดอยู่ที่ [md/docs/DOCS.md](docs/DOCS.md)

- ✅ `act_event_cache` sync จาก `act.pplethai.org` (`scripts/sync-act-events.js`)
- ✅ **PDF pipeline (v2.15.0, 2026-06-21)** — docxtemplater + LibreOffice headless; `template-1.docx` (ส่วน 1/2/4) + `body-1/[item_type].docx` (ส่วน 3 inject ด้วย XML merge); สีน้ำเงิน #1A47CC อัตโนมัติทุก variable run; body files: break/lunch/dinner/equipment/sound/speaker/supplies/transport/venue; `generatePdf.js` refactor ครบ (HEADER_MAP, injectBodyIntoTemplate, colorVariableRuns, payerPosition)
- ✅ **`docs_payers` table** — guild_id, discord_id, display_name, position, sort_order; auto-select per-entry (setProjectPayer SQL subquery); getEntryById JOIN docs_payers ดึง position; /docs/settings จัดการ payers list (2026-06-21)
- ✅ **Docs security (v2.16.0, 2026-06-23)** — PDF + ID card ดูได้เฉพาะ canManageDocs; ซ่อนลิงก์ PDF ใน DocEntryList; /docs redirect คนไม่มีสิทธิ์; Nav ซ่อน Docs link + ไม่ fetch projects ถ้าไม่มีสิทธิ์
- ✅ **Page titles (v2.16.0)** — layout template `%s — Docs`; generateMetadata per page; document.title สำหรับ client pages
- ✅ **Sign page UX (v2.16.0)** — ผู้รับเงินแสดงชื่อจริง + @username; ชื่อโครงการใหญ่/ย่อย; upload บัตร ปชช. ซ่อนถ้าไม่ใช่เจ้าของ; mobile layout (2-row + ปุ่มเปิด PDF แทน embed)
- ✅ **Edit entry (v2.16.0)** — แก้ได้ทุก field รวมเปลี่ยนผู้รับเงิน (member search); เปลี่ยนคนที่เซ็นแล้ว → reset ลายเซ็นอัตโนมัติ + confirm ก่อน
- ✅ **ACT tab + Attachment system (v2.17.0, 2026-06-23)** — Tab ACT ใน DocProjectView ลิงก์แนบท้าย 3; อัพโหลดภาพเอกสาร auto-crop A4 (OpenCV `scripts/crop_document.py`); `docs_project_attachments` table; รวมต่อท้าย export PDF; API auth-gated `/api/docs/projects/[id]/attachments/`
- ✅ **Province filter (v2.17.0, 2026-06-23)** — `/docs` page แสดง 2 เดือนย้อนหลัง + filter chips จังหวัด (`DocsProvinceFilter`); `/calling/campaigns` มี filter จังหวัดเหมือนกัน; sync-act-events รองรับ `?province=XX` pages
- ✅ **member_discord_id nullable (v2.17.0, 2026-06-23)** — migration รันแล้ว; DocEntryList inline "กำหนดผู้รับ" per unassigned entry; generatePdf fallback 'ยังไม่ระบุผู้รับ'
- ✅ **Sign button disable (v2.17.0)** — DocEntryList ส่ง `sign_token: null` ถ้า entry ไม่มีผู้รับ → sign badge disabled อัตโนมัติ
- ✅ **Export PDF skip unassigned (v2.17.0)** — route.js กรอง `member_discord_id != null` ก่อนสร้าง PDF; ส่ง header `X-Skipped-Count` กรณีมี entry ถูก skip
- ✅ **Payer logic null check (v2.17.0)** — ตรวจสอบแล้ว: `autoAssignPayers` ไม่ error เมื่อ entry มี null recipient (ระบบ payer-switching trigger เฉพาะเมื่อ recipient มีค่า)
- ✅ **DocAutoCalc UX rewrite (v2.17.0, 2026-06-23)** — Layout ใหม่: Field/Check abstraction, one orange accent, label token สม่ำเสมอ; "รายการเบิก" section (ค่าอาหาร/ค่าเดินทาง default checked, option inline ใต้ checkbox แต่ละตัว); ค่าเช่าสถานที่ auto-fill เพดานตามจำนวนคน; ค่าเดินทาง 2 mode (เท่ากัน 300 บ./คน / ตามจริง = blank entries กรอกระยะทางทีหลัง); กรอบงบลิงก์กับ stats card (2-way sync ผ่าน `projectBudget` prop + `onBudgetChange` callback); ปุ่มล้างบิลทั้งหมด (DELETE `/api/docs/entries?projectId=X`)
- ~~act_event_registers~~ ✅ (2026-06-25)
- ~~**แนบใบลงทะเบียน**~~ ✅ (2026-06-25)
- ~~**Bot command `/link-ngs`**~~ ✅ (2026-06-25)
- ~~**Transport แบบแยกใบรายบุคคล (rich)**~~ ✅ (2026-06-25)
- ✅ **Payer redesign — role-based auto + manual override (เสร็จ local 2026-06-24)** — เปลี่ยนจาก manual `docs_payers` เป็น source หลัก → query `dc_members` ตาม role:
  - **Source of truth:** payer ราย entry (`docs_activity_entries.payer_discord_id`) เท่านั้น · `docs_projects.payer_discord_id` = dead column (เลิกเขียน)
  - **Pool `getPayersForEvent(guildId, province)`** — รวมทุก level dedupe (ไม่ fallback หยุด):
    1. `province_coordinator` ครอบจังหวัด — เรียง scope น้อยก่อน → `primary_province` ตรง → ชื่อ
    2. `regional_coordinator` ครอบจังหวัด (region/subregion expand finance mode)
    3. `docs_payers` manual — **กรองด้วย scope coverage** เหมือน role-based (gatedScopeNodes)
    - **position = ชื่อ role ที่ให้ permission** (province_coordinator→"ผู้ประสานงานจังหวัด", regional→"ผู้ประสานงานภาค") ไม่ใช่ docs_payers.position · dedup เก็บ level แรก
  - **Auto-assign** (`autoAssignPayers`, idempotent): default = pool[0] คนเดียวทั้งโครงการ · ถ้า default==recipient → คนถัดไปใน pool ที่ ≠ recipient · **ข้าม entry ที่ยังไม่มีผู้รับ** (member_discord_id NULL) → resolve ตอนกำหนดผู้รับ (trigger ใน PATCH entries/[id])
  - **Manual override:** dropdown ที่ group header รายผู้รับ (`DocEntryList`) · pool ตัด recipient ออก · POST `/api/docs/projects/[id]/set-payer` `{recipientDiscordId, payerDiscordId}` → `setRecipientGroupPayer` (gen token ใหม่ + reset ลายเซ็น payer เดิมถ้าเซ็นแล้ว) · validate payer≠recipient
  - **กล่อง "ผู้จ่ายเงิน" บนหน้า** = summary read-only (แก้ที่ group header เท่านั้น)
  - แก้: `payers.js`, `entries.js`, `set-payer/route.js`, `entries/[id]/route.js`, `DocEntryList.jsx`, `DocProjectView.jsx` · 175 tests ผ่าน · build ผ่าน
  - ✅ **deploy prod + clear stale assignment (2026-06-25)**
  - **nuance จดไว้:** คนถือหลาย role permission เดียวกัน (Jatsada regional ผ่าน "รองเลขาธิการ") → `array_agg[1]` หยิบตัวแรก · เคสจริงไม่กระทบ (resolve ผ่าน level1)
- [ ] **Consolidate docs tokens เป็น token เดียว** — ตอนนี้ `docs_projects` มี 2 token (`pdf_token`/`export_token`) แยกกัน → เปลี่ยนเป็น `project_token` ตัวเดียว แยกเอกสารด้วย URL path: `/dl/[token]/receipt` (ใบสำคัญรับเงิน) vs `/dl/[token]/registration` (ใบลงทะเบียน) · DB: ลบ 4 column เก่า + เพิ่ม 2 column ใหม่ · แก้ ~5 ไฟล์ (projects.js, tokens/route.js, receipt/route.js, registration/route.js, DocProjectView.jsx)
- ✅ **Docs v2.18.0 (2026-06-24)** — sound item type, override_data duration, payer real name, DocAutoCalc UX fixes:
  - **Sound item type ครบทุกที่:** `ITEM_LABELS` ใน `DocProjectView` + `DocEntryList` (ไม่เคยมีมาก่อน ทำให้แสดงเป็น "sound" แทนชื่อไทย) · manual entry มี soundHours dropdown (1–8 ชม.) · `overrideData.duration` เก็บทั้ง speaker และ sound
  - **override_data.duration ทั้ง 2 path:** auto-calc — ยก `durationHours` ออกนอก `if (eventDate)` block แล้วส่งเป็น `Math.round(durationHours)` ให้ sound · manual form — speaker ส่ง `speakerHours`, sound ส่ง `soundHours` → PDF `{{duration}} ชั่วโมง` แสดงถูกต้อง
  - **Payer dropdown แสดงชื่อจริง:** `getPayersForEvent` / `queryPayersByPermission` JOIN `ngs_member_cache n ON n.source_id = mr.member_id` → `COALESCE(n.first_name, mr.firstname)` · dropdown option แสดงชื่อจริงถ้ามี fallback display_name · `enrichPayerInfo` ใช้ real name ก่อน
  - **DocAutoCalc:** end time fallback +4h เมื่อไม่มี `eventEndDate` · sound checkbox disabled (ไม่ hidden) เมื่อ `venueType === 'hotel'` เหมือน สัญจร · รายการเบิก collapsible toggle (ซ่อน by default)

---

## 🤖 RAG AI — Discord Forum Search

> ให้ user ถามคำถามใน Discord แล้ว bot ตอบโดยดึงข้อมูลจาก forum_posts ใน Meilisearch

### Flow (reuse infra ที่มีอยู่)
1. User `/ask <คำถาม>`
2. `searchPosts()` → top-K โพสต์จาก Meilisearch (index `forum_posts`, 1,924 docs)
3. ตัด snippet ~500 chars/โพสต์ → build context string
4. `callAI(ragSystemPrompt, context + question)` → คำตอบ + cite URL โพสต์
5. ส่ง embed reply พร้อม sources

### ไฟล์ที่ต้องสร้าง/แก้
- `commands/ask.js` — slash command รับคำถาม
- `services/ragSearch.js` — retrieval + context builder (glue layer ใหม่)
- `handlers/askHandler.js` — interaction handler

### ต้นทุน token (Haiku 4.5 — $1/$5 per 1M)
| กลยุทธ์ | Input | Output | รวม/ครั้ง |
|---|---|---|---|
| snippet 500 chars × K=5 | ~3,000 tokens | ~500 tokens | **~$0.006 ≈ ฿0.20** |
| content เต็ม × K=5 | ~15,500 tokens | ~500 tokens | ~$0.018 ≈ ฿0.65 |

- แนะนำ: **snippet strategy** — ถูก + เร็ว; ขยับเป็น content เต็มถ้าคุณภาพไม่พอ
- Prompt caching ช่วยน้อย (context เปลี่ยนทุก query + system prompt < 4,096 tokens)
- 1,000 query/เดือน ≈ ฿200 (snippet) หรือ ฿650 (เต็ม)

- [ ] implement `services/ragSearch.js` + `/ask` command

### ⚠️ Open Questions ก่อน implement

- **Meilisearch capacity — channel threads:** ตอนนี้ index `forum_posts` มี 1,924 docs (forum เท่านั้น) ถ้าจะเพิ่ม channel thread messages จำนวนจะกระโดดอีกหลายเท่า → ต้องประเมิน doc count จริง + ทดสอบ query latency ก่อนตัดสินใจ index รวมหรือแยก index (`channel_threads`)

- **Privacy & third-party protection:** RAG ดึง content จาก forum/thread ที่อาจมีชื่อ/เบอร์/ข้อมูลส่วนตัวของบุคคล → ต้องมีมาตรการก่อน deploy:
  - system prompt ห้าม AI สรุป/วิเคราะห์บุคคลที่ 3 โดยตรง
  - filter ไม่ index channel ส่วนตัว (DM, private thread, channel ที่กำหนด off-limits)
  - พิจารณา strip ชื่อ/mention ออกจาก snippet ก่อนส่ง context ให้ AI
  - ถ้า query ถามเรื่องคน (detect keyword ชื่อจริง/mention) → refuse หรือ redirect

### Chat with AI via Mention (ต่อเนื่องจาก RAG)
- [ ] **ห้อง chat คุยกับ AI ได้โดย mention bot** — user พิมพ์ `@bot <ข้อความ>` ในห้อง Discord แล้ว bot ตอบโดยดึง context จาก RAG (Meilisearch) เหมือน `/ask`
  - เหมาะกับ channel ที่กำหนดไว้ (เช่น `#ask-ai`) ไม่ใช่ทุกห้อง — config ได้ใน `dc_guild_config`
  - reuse `ragSearch.js` (retrieval) + `callAI()` (services/ai.js)
  - ต่างจาก `/ask` แค่ trigger จาก `messageCreate` event + mention check แทน slash command
  - อาจเพิ่ม conversation thread (Discord thread auto-created) เพื่อ multi-turn ต่อเนื่อง

---

## 🔤 Page Titles (UX)

- [ ] **ทุกหน้าควรมี `<title>` ที่บ่งบอกว่าหน้านั้นคืออะไร** — ตอนนี้หลายหน้าแสดงแค่ชื่อ app เช่น "Docs" ทุกหน้า ทุก app ควรแก้ให้ title สะท้อน context จริง เช่น "ใบสำคัญรับเงิน — โครงการ X", "Settings — Docs", "Campaigns — Calling" ฯลฯ ครอบทุก app ไม่ใช่แค่ Docs

---

## 🛠️ Internal Tools / Productivity

- [ ] **Project management (Notion + Trello) — Discord-native** — ระบบจัดการงานที่ทำงานร่วมกับ Discord แบบไร้รอยต่อ
  - **Notion-side:** page/doc แนบกับ project, rich content, nested tasks
  - **Trello-side:** Kanban board drag-and-drop, swimlane ตาม assignee/label
  - สร้าง/อัปเดต task จาก Discord (slash command หรือ context menu บนข้อความ → กลาย task ทันที)
  - แจ้งเตือนใน Discord channel เมื่อ task เปลี่ยนสถานะ / ถึง deadline / assign ให้ใคร
  - member ผูกกับ Discord user โดยอัตโนมัติ (reuse `dc_members`)
  - web UI (`/projects`) — board view + table view + doc view
  - reuse โครงสร้าง `guild_id` + RBAC pattern ที่มีอยู่แล้ว

---

## 🔗 References

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — Production-grade engineering skills for AI coding agents
