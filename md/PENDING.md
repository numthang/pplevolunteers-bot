# PENDING.md — Backlog & Ideas

> เก็บเฉพาะงานค้าง + design ที่ยังไม่ทำ · ของที่ทำเสร็จ+deploy แล้วย้ายไปอยู่ในโค้ด/`md/*` ตามระบบ

---

## 📢 ระบบเรื่องร้องเรียน (Case System) — implement เสร็จ local · ดู `md/case/CASE.md`

> ยังไม่ deploy prod

### ⚠️ ก่อน deploy prod
1. รัน `scripts/migration/migration.sql` บน prod DB — สร้าง `case_config`/`cases`/`case_assignees`/`case_attachments`/`case_timeline`/`audit_logs`/`case_letter_config` + `letters` column (IF NOT EXISTS ปลอดภัย)
2. `./deploy.sh` ลง slash command ใหม่ (`/panel case` + context menu + `/report`)
3. เปิด feature: เพิ่ม `"cases"` ใน `dc_guild_config.enabled_features` + `/panel case` ตั้ง forum channel + ตั้ง `case_default_province`
4. สร้าง Discord role + map permission `caseworker` ใน `dc_guild_roles`
5. **เทสต์ happy-path จริง** (ฟอร์ม → SMS เข้าเบอร์ตัวเอง → forum thread เกิด) — ยังไม่ได้เทสต์เพราะ SMS ยิงจริง
6. **แก้ crontab บน prod** — `sync-act-events.js` ย้ายไป `scripts/data/` แล้ว ต้องอัปเดต path ใน crontab ของ `www`
7. ใส่ `case_letter_config` per-province ผ่าน DB INSERT

### ⏳ ต้องทดสอบหลัง deploy
- **Discord import จากกระทู้** — context menu `📋 นำเข้าเป็นเคสร้องเรียน` บนข้อความใน thread → modal → สร้าง case + AI สรุป (build แล้ว ยังไม่ได้ทดสอบจริง)

### 🔧 Backlog — Case System UX
- **ปุ่มสีส้ม** — CaseNewForm + CaseManageActions เปลี่ยนปุ่ม primary จาก indigo → `bg-brand-orange hover:bg-brand-orange-light`
- **URL `/case/new/[province]` แทน `?province=`** — redirect `/case/new` → picker · link แชร์เป็น `/case/new/ราชบุรี` หรือ `/case/new/70`
- **Hamburger — เอา 3 เมนูบนออก** — `menuLinks` ซ้ำกับ app switcher → ซ่อนเมื่ออยู่ home/dashboard
- **Detect location → link จังหวัด** — หน้า `/case` ปุ่ม "ใช้ตำแหน่งของฉัน" → reverse geocode (Nominatim/OSM) → redirect `/case/new/[จังหวัด]`

### 🔄 Sync กระทู้เข้าระบบ — 2 ช่วง
- **Backfill** — script รัน 1 ครั้ง ดึงกระทู้เก่าทั้งหมดใน forum channel มาสร้าง case (skip ถ้ามี `discord_thread_id` แล้ว)
- **Manual** — context menu ทีละกระทู้ (สำหรับ historical ที่ bot พลาด)

**กระบวนการ sync — AI generate 3 ส่วน (เคาะแล้ว 2026-06-28):**
- format หัวข้อ = `[ประเภท] สาระสำคัญ — พื้นที่` เช่น `ถนนชำรุด ซ.วัดโพธิ์ หมู่ 3 — อ.โพธาราม ราชบุรี`
- เรื่องย่อ (`ai_summary`) — สรุปเนื้อหากระทู้ทั้งหมด
- timeline แยก table `case_timeline` (มี visibility control แยก)
  - schema: `(id, case_id, discord_message_id UNIQUE, body, is_public, occurred_at)`
  - partial unique index บน `discord_message_id` → dedup incremental
  - refresh: fetch message หลัง `last_synced_message_id` → AI คัด event → `INSERT ... ON CONFLICT DO NOTHING`
  - **Auto:** AI ตัดสิน is_public เอง (public=ความคืบหน้าทั่วไป, private=ชื่อ/เบอร์/นัดหมาย) → return JSON `[{ body, is_public, occurred_at }]`
  - **Manual:** caseworker เพิ่ม/แก้/toggle is_public รายตัวใน manage page
  - ต้องเพิ่มใน migration.sql + `web/db/cases.js` + `db/case.js` + backfillCaseThreads.js + tracking + manage page

### 🆕 Auto-import เมื่อสร้างกระทู้ใหม่ใน forum
- `threadCreate` listener ใน `index.js` → เช็คว่า thread อยู่ใน `case_config.forum_channel_id`
- auto สร้าง case: `source='discord'`, `province=case_default_province`, `title`=thread title, `detail`=first message, `created_by`=Discord ID ผู้สร้าง
- AI สรุป → `ai_summary` · โพสต์ใน thread: "✅ เข้าระบบแล้ว · ref: `XX-XX-XXXX`"
- ไฟล์: `index.js` + `handlers/caseImportHandler.js` (เพิ่ม `handleThreadCreate`)

### 📌 Audit Log — ยังไม่ wire
- `audit_logs` table + `web/db/auditLog.js` (fire-and-forget) มีแล้ว · ใช้ใน cases แล้ว
- **ยังไม่ wire:** finance/docs/calling routes + admin log page (V2)

### 🏛️ ระบบแนะนำหน่วยงาน + ช่องทางยื่น
- จาก category + ประเภทปัญหา → AI แนะนำว่าควรยื่นหน่วยงานไหน (ท้องถิ่น/จังหวัด/สภา/ชาติ)
- บอก workflow ติดตาม: ยื่นแล้วทำอะไรต่อ ภายในกี่วัน มีสิทธิ์อุทธรณ์ไหม
- ต้องคุย scope: AI-generated per case หรือ static knowledge base + AI overlay

### V2 (เลื่อน)
- Public dashboard charts (จังหวัด/ประเภท/สถานะ) + flag "ซ่อนเคสจาก dashboard"
- ปุ่ม "อัปเดต AI สรุป" ฝั่ง web (ต้องเพิ่ม AI SDK ใน web ก่อน) · auto-assign · cron poll · แยกห้อง noti ตามจังหวัด · CAPTCHA

---

## 🌐 pplevolunteers.org — Auth & Platform

### 🆕 Member Onboarding — verify_phone (เคาะ 2026-07-03)

องค์กรที่มีฐานสมาชิกอยู่แล้ว (เบอร์/email) onboard เข้า Discord + ยืนยันตัวตนด้วย SMS OTP โดยไม่ตั้ง password ใหม่ (เคส Amnesty)

**สถาปัตยกรรม (เคาะแล้ว):**
- **Discord-first** — สมาชิกเข้า server แล้วยืนยันตัว *ใน Discord ทั้งหมด* (ไม่มีหน้าเว็บ, ไม่มีห้องใหม่) · OTP เข้ามือถือผ่าน ThaiBulkSMS แล้วกรอกกลับใน Discord modal
- **binding ใช้ของเดิม ไม่ refactor identity:** roster → `ngs_member_cache` (per-guild อยู่แล้ว) · ผูก Discord = `dc_members.member_id` → `ngs_member_cache.source_id` (unique `(guild_id, member_id)` กันแอบอ้าง — pattern เดียวกับ `/api/docs/sign/link-ngs`) · เบอร์ verified → `dc_members.phone`
- **ไม่ต้องสร้างตารางใหม่:** OTP session เก็บใน `dc_user_config` (key `otp_verify`, value json `{guild_id, phone, otp_hash, roster_source_id, attempts}`, TTL ผ่าน `updated_at` เหมือน passkey nonce)
- **Discord constraint:** modal เปิดต่อจาก modal ไม่ได้ → flow = ปุ่ม → modal(เบอร์) → ปุ่ม → modal(OTP) · OTP เป็นสเต็ปแยกหลัง register modal (async รอ SMS)
- **ตัดสินใจ:** insert `dc_members` แบบไม่มี discord_id = ❌ (พัง unique key/sync) · LINE/Google login ก่อนผูก Discord ทีหลัง = ❌ (สิทธิ์ทั้งระบบ anchor ที่ discord_id ไม่คุ้ม) · เลือก server ก่อน login = ไม่ต้อง (guild รู้จาก panel/slug อยู่แล้ว)

**จังหวะ 1 — ✅ implement + เทสต์จริงผ่าน (SMS จริง) 2026-07-03 · ยังไม่ deploy prod:**
- ✅ option `verify_phone` (boolean) ใน `/panel register` เก็บใน `config_register` + ปุ่มที่สอง `btn_open_verify_modal` บน panel row (`commands/panel.js`)
- ✅ `handlers/verifyHandler.js`: ปุ่ม→modal เบอร์→match roster→ส่ง OTP→ปุ่ม→modal OTP→ผูก `dc_members.member_id`+`phone`+ติด member_role (+sync roles)
- ✅ `services/sms.js` — port CJS จาก `web/lib/sendSms.js` (bot require ESM ไม่ได้ · env THAIBULKSMS_* อยู่ root .env แล้ว)
- ✅ route 2 ปุ่ม + 2 modal ใน `index.js`
- hardening ที่ใส่แล้ว: pre-check ก่อนยิง SMS (ผูกแล้ว/ถูก claim/เบอร์ซ้ำหลายแถว), quota 3 SMS/วัน + cooldown 60 วิ (key `otp_quota`), OTP เป็น HMAC (key=bot token), catch 23505, upsert dc_members ถ้า row หาย, role-add fail แจ้ง user, match เบอร์รองรับ 0xxx/66xxx
- **ค้าง:** `./deploy.sh` (slash option ใหม่) · เทสต์ happy-path จริง (SMS ยิงจริง) · panel เก่าที่วางไว้แล้วต้อง `/panel register verify_phone:true` ใหม่ถึงได้ปุ่ม
- **ค้าง:** import สมาชิก Amnesty เข้า `ngs_member_cache` (มี API sync หรือไฟล์ครั้งเดียว **ยังไม่เคาะ**)

### 🆕 Phone OTP login (web) — implement เสร็จ local 2026-07-05 · ยังไม่ deploy prod
- login เว็บด้วยเบอร์ + SMS OTP สำหรับสมาชิกที่ verify เบอร์ผ่าน Discord แล้ว (เข้า Discord ไม่ได้/ลืมรหัส) · session สิทธิ์เท่า Discord login
- เบอร์เป็น credential เฉพาะ `phone_verified_at IS NOT NULL` (verifyHandler เซ็ต / แก้เบอร์เองจาก profile → reset) · endpoint ตอบ generic ทุกกรณีกัน enumeration · quota แชร์ `otp_quota` กับ bot
- **ก่อน deploy prod:** รัน `migration.sql` (column `phone_verified_at`) · เทสต์ happy-path จริง (SMS ยิงจริง)
- หมายเหตุ: สมาชิกที่ verify เบอร์ก่อน 2026-07-05 ไม่มี `phone_verified_at` ต้อง verify ใหม่ — prod ยังไม่กระทบ (verify_phone ยังไม่ deploy)
- **Coverage (จด 2026-07-07):** phone login ใช้ได้เฉพาะคนที่ผูกเบอร์ผ่าน verify_phone ใน Discord → ผูกได้เฉพาะคนที่มีชื่อใน `ngs_member_cache` → **ตอนนี้ทะเบียนมีแค่ราชบุรี = phone login ครอบแค่ราชบุรี** · ขยายจังหวัด/องค์กรอื่น = import ทะเบียนเพิ่ม (งาน CSV import / Amnesty roster ที่จดไว้แล้ว) ไม่ต้องแก้โค้ด
- **Binding เป็น per-guild แต่ login เป็น global (จด 2026-07-07):** verify_phone เขียนเบอร์ลง `dc_members` เฉพาะ guild ที่วาง panel · login เว็บค้นเบอร์ข้ามทุก guild (`findOwnerByVerifiedPhone` ไม่ filter guild) → ผูกที่ guild เดียวก็ login ได้ session ระดับตัวคน ใช้ทุก guild ที่เป็นสมาชิก · ข้อจำกัด cosmetic: profile guild อื่นไม่โชว์เบอร์
- **⚠️ ก่อนวาง panel verify_phone ที่ server ราชบุรี:** ทะเบียน `ngs_member_cache` ทั้ง 4,488 รายชื่ออยู่ใต้ guild อาสาประชาชน (1340903354037178410) — วาง panel ใน server ราชบุรี (1111998833652678757) จะ **match ไม่เจอใครเลย** เพราะ verifyHandler ค้นเฉพาะ guild ที่กดปุ่ม → ต้องเลือก: (ก) วาง panel ใน server อาสาประชาชน หรือ (ข) import ทะเบียนราชบุรีเข้า guild_id ราชบุรีก่อน (script `importGuildMembers.js` ที่จดคิวไว้)

### 🔜 งาน session หน้า — Org layer: 3 guild = องค์กรเดียว (โมเดลเคาะแล้ว 2026-07-07)

> **โมเดลเคาะแล้ว** — ดู decision memory `decision_tenant_anchor_guild.md` · ที่นี่เก็บ scope งาน implement

**ปัญหา (1 ราก 2 อาการ):** ระบบ conflate `guild_id = tenant` แต่จริงๆ **3 guild เป็นองค์กรเดียวกัน** (อาสาประชาชน `1340903354037178410`, ราชบุรี `1111998833652678757`, + อีก 1 server ในเครือ — ระบุ id ตอนเริ่มงาน)
- **อาการ A — cases:** forum thread ฝังที่ guild ราชบุรี (ย้ายไม่ได้) แต่เว็บ manage มองทีละ guild → เห็นเคสไม่ครบทั้งเครือ
- **อาการ B — verify_phone / phone-login:** ทะเบียน `ngs_member_cache` 4,488 รายอยู่ใต้ guild อาสาประชาชนหมด แต่ verifyHandler ค้น**เฉพาะ guild ที่กดปุ่ม** → วาง panel ที่ราชบุรี match ไม่เจอใคร · เบอร์ผูก guild เดียว profile guild อื่นไม่เห็น

**โมเดลที่เคาะ:** org ครอบหลาย guild
- ตาราง `organizations (id, name, slug, created_at)` + `dc_guilds.org_id` (FK, nullable) — migration เพิ่มล้วน ไม่กระทบแอปเดิม
- seed: org "อาสาประชาชน" (slug `pple`) → set `org_id` ให้ทั้ง 3 guild
- **ทุก guild ต้องมี org เสมอ** (guild เดี่ยว = org สมาชิกตัวเดียว) → scope by `org_id` แบบเดียวหมด ไม่มี fallback พิเศษ
- Amnesty มาทีหลัง = insert org ใหม่ + set org_id ของ guild มัน → แยกขาดอัตโนมัติ (ทิศ multi-tenant คงอยู่)

**หลักแยก — แอปไหนต้องขยับ:**
- มี Discord artifact ต่อ guild (**cases**) → เปลี่ยน web query `WHERE guild_id = ?` → `WHERE guild_id IN (SELECT guild_id FROM dc_guilds WHERE org_id = $org)` · `/panel case` ยังตั้งต่อ guild
- **roster/verify_phone** → เปลี่ยน verifyHandler + `findOwnerByVerifiedPhone` จาก "ค้น guild ปุ่ม" → "ค้นทุก guild ใน org"
- **finance/calling/contacts** → ไม่แตะ (anchor guild อาสาประชาชนอันเดียว + filter จังหวัดพอ) จนกว่าจะมี cross-guild need จริง

**Wrinkle cases (ยังไม่ตัดสิน):** caseworker ถูก assign เคสราชบุรีจากเว็บ → จะ ping ในกระทู้ได้ต้องเป็นสมาชิก guild ราชบุรีด้วย

**Task order:** migration+seed → cases web query → verifyHandler/findOwner org-scope → เทสต์ · **ยังไม่ลงโค้ด**

**จังหวะ 2 (เลื่อน — เมื่อ org ต้องการ custom text field ต่างกันจริง):**
- ระบบฟอร์ม dynamic: นิยามฟอร์มเก็บใน `dc_guild_config` key `register_form_fields` (json array — **ไม่ต้องมี table ใหม่**) + `dc_members.extra JSONB` สำหรับค่าที่ไม่มี column · ดู section "Custom Register Form"
- modal สร้างสดจาก config · renderer dispatch ตาม type: text→modal(≤5 ช่อง), verified_phone→OTP flow, choice→picker เดิม (`dc_guild_roles`)
- หน้า backoffice `/bot/forms` (pattern เดียวกับ `/bot/roles`) · `verify_phone` toggle จังหวะ 1 ถูกดูดเข้ามาเป็น field type `verified_phone`
- เก็บ JSONB (ไม่ใช่ EAV) — PG query/index `extra->>'key'` ได้ · field common → เลื่อนเป็น native column
- **web `/join/<slug>` + SMS blast** สำหรับกลุ่มที่ยังไม่มี Discord เลย (ต้องเขียน custom OAuth + `guilds.join` scope) · Magic Link email เป็น fallback

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

### ยังเหลือ
- [ ] เบอร์กลางโทรออก — แสดงเบอร์กลางองค์กรแทนเบอร์ส่วนตัว (ต้องการ provider/config เบอร์กลาง)
- [ ] แสดง active event บน dashboard + default event จังหวัดดึงจาก XLS
- [ ] Audit logs — ดูประวัติการแก้ไข/เพิ่มข้อมูล
- [ ] Approval flow ข้ามภาค — จังหวัด → ภาค → ประเทศ

---

## 👥 PPLE Contacts

- [ ] **Import ข้อมูลผู้บริจาค** เข้า `calling_contacts` — ต้อง copy จากเว็บไซต์มาก่อน (format ยังไม่ชัด) → import script รับ CSV/Excel

---

## 🏗️ Web Architecture — ตัดสินใจแล้ว (2026-06-12)

**Guild switcher** — ทุกหน้า, ทุก feature; user เห็นเฉพาะ guild ที่เป็น Discord member; admin เห็นทุก guild; data เปลี่ยนตาม guild ที่เลือก · **Feature toggle** ระดับ guild เก็บใน `dc_guild_config` key `enabled_features`:

| Feature | Default |
|---|---|
| Finance | เปิดตลอดทุก guild (ไม่มี toggle) |
| Calling | อาสาประชาชน = on, อื่น = off |
| Contacts | อาสาประชาชน = on, อื่น = off |
| Bot | public ทุก guild |

> scope ปัจจุบัน: toggle ซ่อน nav เท่านั้น (ไม่ block route) — ข้อมูล isolate ด้วย guild_id อยู่แล้ว · guild switcher + feature toggle + view-as-role + per-guild role config UI live แล้ว

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

**⚠️ จุดสำคัญที่ทำผิดพลาดง่าย:** ต้อง deny view เฉพาะ role สมาชิกทั่วไป (interest/skill/province role) ห้าม deny @everyone/role พื้นฐานที่ได้ตอน join ใหม่ ไม่งั้น raid-bot ที่เพิ่ง join จะมองไม่เห็นห้องไปด้วย (permission บล็อกตั้งแต่ API level → ไม่มี event ให้จับเลย)

**เคาะแล้ว:**
- Admin สร้างห้อง honeypot เอง (ตั้งชื่อ/permission เอง) + ตั้ง channel_id ผ่าน `/panel` (bot เก็บ config อย่างเดียว ไม่ auto-create ห้อง)

**ยังไม่เคาะ:**
- Action เมื่อมีคนโพสต์ในห้อง — ban ทันที vs timeout + แจ้งเตือน mod ก่อน
  - ข้อมูลประกอบ (2026-07-07): timeout 28 วัน (เพดาน Discord) + ลบข้อความ + แจ้งห้อง mod = ปลอดภัยกว่าสำหรับเคส staff โดนแฮค (ban แล้ว unban ประวัติ/role หาย) · ban ทันที = เด็ดขาดเหมาะกับ spam bot ล้วน
- เก็บ config ที่ไหน (น่าจะ `dc_guild_config` key ใหม่ เช่น `honeypot_channel_id` + `honeypot_action` ตาม pattern เดิม — ยังไม่ยืนยัน)
- listener: น่าจะ hook `messageCreate` เช็ค `message.channel.id === honeypotChannelId` แล้ว action ตาม config (ยังไม่ได้ออกแบบ error handling/logging)
- user (เจ้าของ) ยังไม่เข้าใจ permission mechanism ทั้งหมด 100% — ต้องอธิบายซ้ำ/ทดสอบจริงตอน implement

**สถานะ:** แค่จดไว้ ยังไม่ implement — user จะไปทำต่อบนเครื่อง Linux (ไม่ถนัดทำงานบน Mac)

---

## 🧹 Code Quality — Bot refactor (จาก external review, จดไว้ 2026-07-03)

> ที่มา: ให้ GLM อ่าน code แล้วสรุปจุดที่ควรปรับปรุง (ไฟล์ IMPROVEMENTS.md เดิมลบแล้ว — สาระอยู่ครบใน list นี้)

> **ตัดสินใจ 2026-07-05:** GLM list เป็น checklist ตำราทั่วไป ไม่ดูบริบท repo (bot ไม่มี test + คนเดียวดูแล) · P2 (แตกไฟล์ใหญ่) เสี่ยงพัง > ประโยชน์ ถ้าจะทำต้องเขียน test ครอบก่อน · P3/P4 churn เยอะ ผลลัพธ์ที่ user เห็น = 0 → **ตัด P2–P4 ทิ้ง**

- [x] **JSON parse helper** — `utils/parseSetting.js` สร้างแล้ว (2026-07-05) · แทน pattern `typeof x === 'string' ? JSON.parse` ที่ซ้ำ ~34 จุด (เคยเป็นเหตุ basket CPU spike bug)
- [ ] **ทยอยแทนที่ call site ที่เหลือ (boy-scout rule)** — แตะไฟล์ไหน เก็บไฟล์นั้น ไม่ sweep รอบเดียว (กัน silent bug จาก fallback type ผิด) · ทำแล้ว: verifyHandler.js, panel.js
- ~~magic numbers → constants, ย้าย require ขึ้น top~~ — cosmetic, ทำเฉพาะตอนแตะไฟล์นั้นอยู่แล้ว ไม่ต้องเป็น task

---

## 🔗 References

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — Production-grade engineering skills for AI coding agents
