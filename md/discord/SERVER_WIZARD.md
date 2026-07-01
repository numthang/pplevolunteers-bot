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
| D3 | **Wizard อยู่ที่ไหน** | Web (ต่อยอด backoffice `/bot/`) | auth + multi-guild + `/bot/features` + `/bot/roles` มีอยู่แล้ว |
| D4 | **Scope server** | รองรับทั้ง existing + new server | new server: Template link / invite bot แล้ว wizard config ต่อ (code path เดียวกัน) |
| D5 | **แก้ทีหลังได้** | ใช่ — wizard + customization panel ถาวร | admin ที่ดูแลไม่ใช่คนเทคนิค |

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

## 🔧 Technical Approach (draft — ยังไม่เคาะ)

### Option A: Web Wizard → API
- หน้า web `/setup` (public หรือ gated)
- form multi-step → POST `/api/setup/create-server`
- server สร้างผ่าน Discord REST (require bot มี permission ใน guild ปลาย)
- seed `dc_guild_config`, `dc_guild_roles`, `dc_guild_role_groups`

### Option B: Discord Slash Command
- `/setup-server` wizard ใน DM กับ bot
- modal 1–N ขั้น
- require bot อยู่ใน server ก่อน

> **ยังไม่ตัดสินใจ** — รอ user เคาะ

---

## ⚠️ Open Questions

_เติมเมื่อมีข้อสงสัยระหว่าง define requirements_

- [ ] Wizard อยู่ที่ไหน — web page หรือ Discord DM?
- [ ] Bot ต้องมีสิทธิ์ "Manage Server" ใน guild ที่จะ setup ไหม?
- [ ] สร้าง server ใหม่ได้เลย หรือแค่ setup server ที่มีอยู่?
- [ ] มี onboarding step สำหรับ admin หลังตั้งค่าเสร็จไหม? (checklist / DM)
- [ ] Service pack สามารถ activate/deactivate ทีหลังได้ไหม?
- [ ] ราคา / model ธุรกิจ (ถ้ามี)?

---

## 📝 Requirements Log

_เพิ่ม requirement ตามลำดับเวลา — ไม่ต้องจัดหมวดก่อน_

### 2026-07-01
- [init] เริ่มต้น concept: wizard ตอบคำถาม 1–5 → สร้าง server พร้อม service pack

---

## 🔗 Related

- [md/WEB.md](WEB.md) — web conventions
- [md/DATABASE.md](DATABASE.md) — schema reference
- `dc_guild_config` — feature toggles per guild
- `dc_guild_roles` — role catalog per guild
- `dc_guild_role_groups` — role group (picker) per guild
