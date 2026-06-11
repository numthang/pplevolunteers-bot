# PENDING.md — Backlog & Ideas

---

## 🌐 pplevolunteers.org — Auth & Platform

- [ ] ผูกระบบ PPLE กับ **LINE** และ **โทรศัพท์**, PASSKEY

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
7. ⏳ **เหลือ — DB-wiring (multi-guild จริง):** ตอนนี้ runtime ใช้ `web/lib/roleAccess.js` (policy mirror = seed) ทั้ง server+client · ขั้นต่อไป boundary (`getEffectiveIdentity`) เรียก `resolveAccess`/DB ส่ง access object · client (`useEffectiveRoles`) ต้องมี API ดึง permissions (แตะ DB ตรงจาก client ไม่ได้) · `normalizeAccess` รับ access object อยู่แล้ว ไม่ต้องแก้ access fn
8. ✅ **ลบ `config/roles.js`** — migrate consumer ทุกตัว query `dc_guild_roles` แทน hardcode · MEDIA_TEAM + province cascade รวมเป็น **`parent_role_id` column เดียว** (add → แปะ parent chain · remove → ถอด parent ถ้าไม่เหลือ sibling) · ทั้ง 2 handler โชว์ parent ที่ถูกแตะใน status · ข้อมูลเดิม archive ที่ `scripts/migration/_roles-archive.js` (seed scripts เท่านั้น) · **ยังไม่ deploy prod**
9. ⏳ **UI per-guild config + dynamic groups** — **blocker ตัวจริงของ tenant ใหม่:** catalog auto-sync แล้ว แต่ policy (`permission`/`scope_node`/`picker_group`/`parent_role_id`) = null → guild ใหม่ไม่มี picker/RBAC/cascade จนกว่าจะตั้ง · ตอนนี้ตั้งได้ทางเดียว = แก้ DB มือ → ต้องมีหน้า admin ตั้งเอง
10. ⏳ **web `GUILD_ID` → session/route param** — **blocker multi-tenant ฝั่ง web:** finance routes / profile / page.js / quote-config ยัง `process.env.GUILD_ID` (pin guild เดียว) · ต้องเปลี่ยนเป็น guild จาก session ก่อนรับ guild ที่สอง · bot runtime สะอาดแล้ว (เหลือ `services/financeOCR.js` ที่เดียว)

### Deferred (RBAC) — ทำตอนต้องใช้
- **registerHandler province part** — ✅ ย้าย DB แล้ว (`getRolesByScopePrefix`)
- **db/members.js** — ✅ derive province/interests จาก DB แล้ว (`getRolesByScopePrefix` + `getPickerRoles`)
- **MEDIA_TEAM + cascade → DB** — ✅ `parent_role_id` column · per-guild config rule เองได้ ไม่ hardcode
- **interest flat ≤20 ปุ่ม/ข้อความ** (Discord 5 แถว) — ตอนนี้ 18 · ถ้าเกินต้อง paginate

> **สถานะ 2026-06-11 (v2.11.0):** step 8 (ลบ config/roles.js) เสร็จ + **push origin/master แล้ว** (RBAC + web IA `/discord`→`/bot` + AI modes DB) · **bot roles multi-tenant แล้ว** — ทุก role มาจาก DB, `parent_role_id` คุม cascade (กราฟิก→สื่อ, จังหวัด→ภาคย่อย→ภาคใหญ่) · **แต่ยังไม่ multi-tenant เต็มตัว** — เหลือ blocker tenant ใหม่: step 9 (UI ตั้ง policy, ไม่งั้นต้องแก้ DB มือ) + step 10 (web ยัง pin GUILD_ID) · step 7 (web RBAC DB-wiring) ยังค้าง
> **prod deploy:** รอรันบน server (prod เป็น PG อยู่แล้ว) — ลำดับ: `git reset --hard origin/master` → `psql -f migration.sql` → `./deploy.sh --production` → `seed-guild-roles.js` → `seed-parent-roles.js` · rollback: `git reset --hard 22fae83`

---

## 🗄️ Database / Infrastructure

- ~~dc_server_settings → dc_guild_config~~ ✅ (2026-06-04)
- ~~MySQL → PostgreSQL migration~~ ✅ (2026-06-04)
- [ ] **Multi-guild role config** → ย้ายไปรวมที่ section **🔐 RBAC / Multi-guild Refactor** ด้านบน (design ตกผลึกแล้ว: `dc_guild_roles` DB table + permission abstraction + resolver)
- [ ] **Backfill member people party** (guild 1115613658408566844) — script เขียนเสร็จแล้ว รอรัน
  - `node scripts/calling/sync-discord-members.js 1115613658408566844` → สร้าง row + username/display_name
  - `node scripts/data/backfill-intro-peoplesparty.js --dry-run` → ดูผล parse free-form (ห้องแนะนำตัว 1115613659297751072)
  - แล้วรันจริง (fill-null upsert เติม firstname/nickname/province/position) — **ยังไม่ได้รัน dry-run review**
- [ ] **ลบ/แทนที่ `scripts/roles/syncAllMembers.js`** — ตัวเก่าพังหลัง migrate PG (เขียน table `members` + MySQL syntax) ใช้ `scripts/calling/sync-discord-members.js` แทน

---

## 🤖 PPLE Bot / Social Share

- ~~Discord (Guild) Config — Restructure~~ ✅ (2026-06-04)
- ~~Watermark — Personal Account~~ ✅ (2026-06-04)
- ~~Web IA restructure~~ ✅ (2026-06-07) — basket/quote/platforms/watermark ใน path ใหม่
- ~~AI Thread Summarizer — context menu "🤖 AI สรุปเธรด"~~ ✅ (2026-06)

### Social Share — X (Twitter)
- [ ] **Optional / Future:** Infographic — แปลงบทความยาวๆ เป็นรูปสรุปแนบโพสต์หลัก

### Context Menu — Add to Calendar
- [ ] Context menu บนข้อความใน Discord → เพิ่มเข้าปฏิทิน
  - parse Discord event URL หรือ Google Meet URL จากข้อความ
  - parse วันที่/เวลาจากเนื้อความ
  - เลือกปฏิทินได้ (Google Calendar + ปฏิทินทีม เช่น "ทีมสื่อราชบุรี") — รองรับ 2-3 ปฏิทิน

---

## 💰 PPLE Finance

- [ ] ระบบเบี้ยเลี้ยง — โอนเงินเป็นรอบๆ (บัญชีเขต + บัญชีทีมงาน)
- [ ] ระบบบัญชีเบี้ยเลี้ยงจังหวัด — ส่งสลิปเก็บง่าย + DM สลิปไปหาสมาชิก
- [ ] จัดการเบี้ยเลี้ยงจากสมาชิก Discord
- [ ] ระบบชำระเงินค่าเบี้ยเลี้ยง — ผูกเบอร์บัญชีธนาคารกับสมาชิก

---

## 📞 PPLE Calling

- ~~Mobile bug — `/calling/campaigns/[id]/edit` เด้งขึ้นบน~~ ✅
- ~~Dashboard สรุป (`/calling/stats`) — gauges + charts~~ ✅

### ยังเหลือ
- [ ] เบอร์กลางโทรออก — แสดงเบอร์กลางขององค์กรแทนเบอร์ส่วนตัว (ต้องการ provider/config เบอร์กลาง)
- [ ] แสดง active event บน dashboard + default event จังหวัดดึงจาก XLS
- [ ] Audit logs — ดูประวัติการแก้ไข/เพิ่มข้อมูล
- [ ] Approval flow ข้ามภาค — จังหวัด → ภาค → ประเทศ ขอ approval ผ่านผู้ประสานงาน

---

## 👥 PPLE Contacts

- [ ] Multi-server design — ถกเรื่อง schema: แยก table ตาม guild หรืออยู่ table เดียวแยกด้วย `guild_id`

---

## ❓ Open Question — Guild Identity & Data Ownership

ยังไม่ได้ตัดสิน รอถกในอนาคต:

**Finance / Calling contacts ผูกกับ guild ไหน?**
- ตอนนี้ finance + calling ผูก `GUILD_ID` อาสาประชาชนโดย default (hardcode env)
- ถ้ามี 4 guilds แล้ว: บัญชีการเงิน/รายชื่อ contact ของแต่ละ guild แยกกันไหม? หรือ share ข้ามกัน?
- `ngs_member_cache` (calling) มาจากฐาน NGS ไม่ใช่ Discord → ไม่ผูก guild_id เลยตอนนี้

**User เข้า web ในฐานะ guild ไหน?**
- ตอนนี้ทุกคนเข้าในฐานะ "อาสาประชาชน" โดย default
- ถ้า user อยู่หลาย guild: web รู้ได้ยังไงว่า request นี้ของ guild ไหน (subdomain? route param? session?)
- ยังไม่มี multi-guild routing ใน web เลย

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

## 📋 PPLE Docs

<!-- รอ Schema จริงจากทาง ACT ก่อน — ดู PENDING.md section ACT Integration -->

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

---

## 🛠️ Internal Tools / Productivity

- [ ] Project management ในแบบ Notion/AppFlowy — simple, lightweight สำหรับทีม

---

## 🔗 References

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — Production-grade engineering skills for AI coding agents
