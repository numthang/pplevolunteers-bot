# Server Setup Wizard — Requirements

> Living doc. เพิ่ม requirement ได้เรื่อยๆ ยังไม่ต้อง implement จนกว่าจะเคาะ spec ครบ

---

## 🎯 Vision

**SaaS เล็ก** — ขายบริการ "customizable Discord bot platform" ให้องค์กร โดยระบบ wizard
setup + customize Discord server ให้ลูกค้าได้เอง **โดยไม่ต้องมี developer มา setup manual ทุกครั้ง**

Wizard นี้คือชิ้นสุดท้ายที่เปลี่ยน "ระบบ custom ขององค์กรเดียว (อาสาประชาชน)" → "platform ที่องค์กรอื่นเอาไปใช้เองได้"
โดยต่อยอดจาก multi-guild RBAC refactor (step 1–12 เสร็จแล้ว โค้ดพร้อม multi-tenant)

ผลลัพธ์ที่ต้องการ:
- Admin องค์กร (ไม่ใช่คนเทคนิค) ตั้งค่า channel/role/feature เองได้
- **แก้ config ทีหลังได้ตลอด** (ไม่ใช่ one-time wizard — เป็น config panel ถาวรด้วย)
- รองรับทั้ง server ที่มีอยู่แล้ว + server สร้างใหม่

---

## ✅ Confirmed Decisions

| # | หัวข้อ | เคาะ | เหตุผล |
|---|---|---|---|
| D1 | **Business model** | SaaS เล็ก ขายบริการ | ไม่ over-engineer สำหรับ scale ใหญ่ |
| D2 | **ลูกค้าเป้าหมาย** | **Focus A** — องค์กรการเมือง/ภาคประชาสังคมไทย | feature ที่มี (calling/geography/ACT/docs) fit อยู่แล้ว ไม่ต้อง genericize เยอะ · B (องค์กรทั่วไป) = roadmap อนาคต |
| D3 | **Wizard = อะไร** | **Discord slash command `/server setup` คือ wizard ตัวจริง** (เคาะ 2026-07-02) | ไม่ต้องทำ web wizard · admin สั่งใน server ได้เลย · reuse `panel.js`/`dc_guild_roles`/`dc_guild_config` ที่มีอยู่ · web ปรับแต่งทีหลังผ่าน `/bot/*` ที่มีอยู่แล้ว |
| D4 | **Scope server** | v1 = setup server ที่ bot อยู่แล้ว · สร้าง server ใหม่ = defer | invite bot → `/server setup` |
| D5 | **แก้ทีหลังได้** | ใช่ — รัน `/server setup` ซ้ำได้ (idempotent) + ปรับผ่าน `/bot/*` เดิม | admin ที่ดูแลไม่ใช่คนเทคนิค |

### ⏳ Deferred (จดไว้ ยังไม่ออกแบบตอนนี้ — scale เล็ก)
- **Discord verification / 100-server limit** — bot ใช้ Message Content Intent หนัก (RAG/basket/AI/quote/sticky) พอเกิน 100 server ต้องผ่าน Discord app review · scale ยังไกล
- **Billing/subscription/entitlement** — service pack กลายเป็นหน่วยที่ขายได้ · ตอนนี้ยังใช้ feature toggle เดิมไปก่อน
- **Data isolation** — เดิม single public schema + boundary ที่ app layer (ดู PENDING RBAC §DB) · พอลูกค้าจ่ายเงินคนละองค์กรค่อย scrutinize ใหม่

---

## ❓ Wizard Questions (draft)

_ยังไม่เคาะ — เพิ่ม/แก้ได้ตลอด_

| # | คำถาม | ตัวเลือก | ผลต่อ config |
|---|---|---|---|
| 1 | ประเภทองค์กรของคุณคืออะไร? | พรรคการเมือง / มูลนิธิ / ชมรม / กลุ่มอาสา / อื่นๆ | เลือก template หลัก |
| 2 | ขนาดทีม? | < 20 คน / 20–100 คน / 100+ คน | จำนวน channel / role granularity |
| 3 | ต้องการฟีเจอร์อะไรบ้าง? (multi-select) | ระบบโทรหาสมาชิก / จัดการการเงิน / รับเรื่องร้องเรียน / สื่อสังคมออนไลน์ / อื่นๆ | service pack ที่เปิด |
| 4 | มีพื้นที่ทางภูมิศาสตร์ไหม? | ระดับประเทศ / ภาค / จังหวัด / ท้องถิ่น | โครงสร้าง channel ตามพื้นที่ |
| 5 | ต้องการห้อง public (เปิดให้ทุกคนเห็น) ไหม? | ใช่ / ไม่ใช่ | สร้าง category public หรือไม่ |

---

## 🗂️ Server Templates

_แต่ละ template = ไฟล์ JSON นิยาม category→channel + role (RBAC/geography/picker) + feature + config_
_bot อ่าน JSON แล้ว provision ทีละ channel/role ผ่าน Discord REST (ไม่ใช่ native Discord template)_

โฟลเดอร์: `config/server-templates/`

### ✅ `th-civic-starter.json` (v0.1.0, 2026-07-01)

แม่แบบแรก — จับโครงสร้างจริงจากเซิร์ฟเวอร์ **อาสาประชาชน** (tenant #1, dogfood):
- **Channels:** หมวด ทีมงาน / INFORMATION / {{org_name}} (จาก screenshot จริง)
- **RBAC roles:** 9 permission (admin, secretary_general, regional/province/district_coordinator, treasurer, editor, moderator)
- **Geography (optional):** 4 ภาค + 13 ภาคย่อย + จังหวัด generate จาก `province-codes.json`
- **Pickers:** interest (17) + skill (8) + province — เก็บ list จริงอาสาประชาชนเป็นตัวอย่าง
- **Features:** calling, docs, cases, ai_mention
- **Config:** autorole, register panel, welcome DM, sticky — **ไม่รวม secret/credential/channel-id จริง**

**หลักการที่ใช้ร่าง:**
1. จับโครงสร้างอาสาประชาชนซื่อตรง แต่ templatize `{{org_name}}`
2. ไม่ inline 77 จังหวัด — อ้าง data source (reference data ไม่ใช่อัตลักษณ์องค์กร)
3. interest/skill เก็บ list จริง (องค์กรต้องเห็นเพื่อแก้)
4. ไม่มี secret/id จริงหลุดเข้า template

### Template อื่น (roadmap)

> มูลนิธิ / ชมรม — ยังไม่ได้ออกแบบ (focus B อนาคต)

---

## 📦 Service Packs

_feature pack ที่ activate ได้ — แต่ละ pack = เปิด enabled_features + สร้าง channel ที่จำเป็น + seed config_

| Pack | Bot Features | Channel ที่สร้าง | เงื่อนไข |
|---|---|---|---|
| **Calling** | calling system | #โทรหาสมาชิก | ต้องเลือก Q3 |
| **Finance** | finance system | #การเงิน | เปิดเสมอถ้าเลือก |
| **Cases** | case/complaint system | Discord Forum | ต้องเลือก Q3 |
| **Media** | basket / quote / watermark | #สื่อโซเชียล | ถ้าเลือก |
| **AI** | bot mention + RAG | #ถามAI | optional |

---

## 🔧 `/server setup` — Spec v1 (เคาะ 2026-07-02)

> **นี่คือ wizard ตัวจริง** — Discord slash command ล้วนๆ ไม่ต้องมี web wizard · ปรับแต่งเพิ่มทีหลังผ่าน `/bot/*` ที่มีอยู่แล้ว · **ไม่แตะ production guild เดิม (อาสาประชาชน)** — ทดสอบบน server ใหม่/ว่างเท่านั้น

### Command
```
/server setup  org_name:<ชื่อองค์กร>  [template:th-civic-starter]  [include_optional:false]
```
- subcommand ใหม่ใต้ `/server` เดิม
- `org_name` (required) — แทน `{{org_name}}` ทุกที่ในเทมเพลต
- `template` (optional, default `th-civic-starter`) — เลือกไฟล์ใน `config/server-templates/`
- `include_optional` (optional, default false) — สร้าง channel ที่ `optional:true` ด้วยไหม (เช่น 🙋┆follow-me)

### Gate / Guard
- **ผู้ใช้**: ต้องมี `Administrator` (สูงกว่า `/server` เดิมที่ใช้ ManageMessages) — เช็คใน execute
- **bot**: ต้องมี `ManageChannels` + `ManageRoles` + `ManageGuild` (สำหรับเปิด Community) — เช็คก่อน ถ้าขาด abort พร้อมบอก perm ที่ต้องเพิ่ม

### ♻️ Idempotency — รันซ้ำได้ ไม่ error (design goal)
รันกี่ครั้งก็ได้ ผลลัพธ์เหมือนเดิม ไม่สร้างซ้ำ ไม่พัง — ใช้ pattern ต่างกันตามชนิด resource:

| Resource | Pattern | วิธี |
|---|---|---|
| **Roles** | find-or-create | หา role ชื่อตรงใน `guild.roles.cache` ก่อน · เจอ = reuse id, ไม่เจอ = create · เก็บ map ชื่อ→id จากทั้ง 2 ทาง |
| **Categories/Channels** | find-or-create | match ชื่อ + type (+ parent สำหรับ channel) · เจอ = reuse, ไม่เจอ = create |
| **Community** | check-then-skip | `guild.features.includes('COMMUNITY')` = true → ข้าม enable (แค่ ensure rules/updates channel ตั้งไว้) |
| **Permission overwrites** | set (replace) | `permissionOverwrites.set()` แทนที่ทั้งหมด → รันซ้ำ = ผลเดิม ปลอดภัยโดยธรรมชาติ |
| **Register panel / role picker** | check sticky | มี sticky ใน `dc_guild_config` key `sticky_<channelId>` แล้ว → ไม่โพสต์ใหม่ (update ถ้าจำเป็น) |
| **forum_search post** | check-exists | มีโพสต์ค้นหาใน forum แล้ว → ข้าม |
| **dc_guild_roles / dc_guild_config** | upsert | `ON CONFLICT DO UPDATE` → idempotent อยู่แล้ว |

- **ห้าม abort เมื่อเจอของเดิม** — reuse แทน · report แยก `สร้างใหม่ N · มีอยู่แล้ว M (ข้าม)`
- ทุก create call ห่อ try/catch — 1 อันพัง ไม่ล้มทั้ง batch, เก็บ error ไปสรุปตอนจบ

### Flow
```
1. เช็ค user perm (Administrator) + bot perm
2. โหลด template JSON → แทน {{org_name}}
3. reply confirm embed: "จะสร้าง N roles, M channels, เปิด Community — ยืนยัน?"
   [✅ ยืนยัน] [❌ ยกเลิก]   (awaitMessageComponent 60s — ไม่ route ผ่าน index.js)
4. on confirm → serverProvisioner.run() พร้อม edit progress inline (find-or-create ทุกขั้น)
5. report สรุป: "✅ roles: สร้าง N/ข้าม M · channels: สร้าง N/ข้าม M · X errors"
```

### Provisioner steps (`services/serverProvisioner.js`)
ตาม `bot_provisions.order` ในเทมเพลต — delay ~500ms/create เลี่ยง 429:
1. สร้าง roles (staff → org_role) เก็บ map `ชื่อ → id` · geography ข้าม (provision_at_setup=false)
2. สร้าง category ทีมงาน + INFORMATION + text channel ที่ Community ต้องใช้ (📕┆ข้อตกลง, moderator-only)
3. **เปิด Community**: `guild.edit({ features:[...,'COMMUNITY'], rulesChannelId, publicUpdatesChannelId, verificationLevel, explicitContentFilter, ... })` ⚠️ จุดเสี่ยง — ต้องทดสอบวิธี enable จริงใน discord.js v14
4. สร้าง channel ที่เหลือ (announcement/forum/stage/voice) — ได้แล้วหลัง Community
5. ตั้ง `permission_overwrites` รายช่อง (map ชื่อ role → id, `"inherit"` = ข้าม)
6. วาง **register panel** ที่ 👋┆แนะนำตัว + 🙋┆follow-me · **interest panel** ที่ 🎖️┆ติดยศ — **ไม่ refactor panel.js** · provisioner สร้าง embed + ปุ่ม (customId เดิม `btn_open_register_modal` / `btn_open_interest` ที่ index.js route อยู่แล้ว) เอง ~10 บรรทัด · เช็ค panel เดิมก่อนโพสต์ (idempotent) · register เขียน `config_register` ด้วย
7. สร้างโพสต์ 'ค้นหาโพสต์' ในทุก forum (forum_search)
8. **sync role catalog → `dc_guild_roles`**: upsert row พร้อม policy จากเทมเพลต (rbac_permission, picker_group/label/emoji, parent) — ไม่ใช่แค่ auto-sync ที่ได้ null
9. **seed `dc_guild_config`**: `config_register` = `{ member_role_id: <org_role id>, interest_select:true, log_channel_id: <moderator-only id> }` + `enabled_features` + `welcome_dm`
   - ⚠️ **ไม่ตั้ง `autorole_id`** — ยศองค์กรได้หลังกรอก modal แนะนำตัวเท่านั้น (ยืนยัน 2026-07-02)

### ยังไม่ทำใน v1 (defer)
- Rollback อัตโนมัติ (ถ้าค้างกลางทาง ลบเองใน Discord)
- Geography/จังหวัด (เพิ่มทีหลังผ่าน command/web)
- Web wizard UI
- สร้าง server ใหม่ (v1 = setup server ที่ bot อยู่แล้วเท่านั้น)

---

## ⚠️ Open Questions (เฟสถัดไป)

- [ ] ~~Web wizard UI~~ — **ยกเลิก** ใช้ `/server setup` เป็น wizard แทน (2026-07-02) · web ใช้แค่ปรับแต่งผ่าน `/bot/*` เดิม
- [ ] สร้าง server ใหม่ (native template link vs invite-then-setup)
- [ ] onboarding checklist/DM สำหรับ admin หลัง setup เสร็จ
- [ ] Service pack activate/deactivate ทีหลัง (ตอนนี้ผ่าน `/bot/features` ได้แล้ว)
- [ ] ราคา / business model
- [ ] Geography provisioning — command หรือ web

---

## 📝 Requirements Log

_เพิ่ม requirement ตามลำดับเวลา — ไม่ต้องจัดหมวดก่อน_

### 2026-07-01
- [init] เริ่มต้น concept: wizard ตอบคำถาม 1–5 → สร้าง server พร้อม service pack
- สร้าง `th-civic-starter.json` จากโครงสร้างจริงอาสาประชาชน (channels + 11 staff roles + picker)

### 2026-07-02
- เคาะ SaaS เล็ก / focus A / web ต่อยอด backoffice / รองรับ existing+new
- template v0.4.0: ตัด log/bot-tester/ตลาด · voice→ประชุมทั่วไป · stage→เวทีสาธารณะ · separator `┆` · Caseworker→ทีมพื้นที่/ร้องเรียน (ชื่อจริง)
- **ยศองค์กรได้หลังแนะนำตัวเท่านั้น** — `config_register.member_role_id` (ไม่ใช่ autorole-on-join) · setup seed ให้อัตโนมัติ
- เคาะ spec `/server setup` v1 (slash command, provisioner 9 ขั้น, เปิด Community อัตโนมัติ, geography defer)
- เคาะ **idempotent** เป็น design goal — รันซ้ำได้ (find-or-create / set / upsert / check-sticky)
- **เปลี่ยน decision:** ยกเลิก web wizard — `/server setup` bot command คือ wizard ตัวจริง

---

## 🔗 Related

- [md/WEB.md](WEB.md) — web conventions
- [md/DATABASE.md](DATABASE.md) — schema reference
- `dc_guild_config` — feature toggles per guild
- `dc_guild_roles` — role catalog per guild
- `dc_guild_role_groups` — role group (picker) per guild
