# Auth & Identity — บัญชีเดียว หลายช่องทาง login

> ประวัติ + สถานะของระบบ login/identity · ย้ายมาจาก md/PENDING.md (2026-07-29)

## 🔑 Phase 4 identity — บัญชีเดียว หลายช่องทาง login (2026-07-25 → 26)
> ย้ายมาจาก md/PENDING.md (2026-07-29)

เป้า: ทุกช่องทาง (Discord/Google/LINE/passkey/magic-link/เบอร์) ลงที่ `users` แถวเดียว · **เบอร์ยืนเดี่ยวได้ ไม่เกาะ Discord**

**เคาะแล้ว (2026-07-25):** ประตูสมัคร = เบอร์+OTP · Google · Discord · LINE (**passkey เพิ่มทีหลังเท่านั้น** — ไม่มี match key) · กันบัญชีซ้ำด้วย match-before-create จาก verified email + phone · เบอร์เก็บแบบ mirror email (column บน `users` + partial unique) ไม่ใช่แถวใน `user_identities`
> **ตัด true-merge ออกจากสโคป** — `users.id` ถูก ~20 FK อ้าง = โปรเจกต์แยก · ชนแล้วให้ **block-on-claimed** แทน

- [x] **`auth_nonces`** — nonce/challenge store keyed by `user_id` แทน `dc_user_config` (PK=discord_id) → คนที่ไม่มี Discord ใช้ passkey/OTP ได้ · `scripts/migration/migration.sql` บล็อก 2026-07-25
- [x] **ผูก Discord เพิ่มเข้าบัญชีเดิมได้** `/api/link/discord/*` + passkey ย้ายมาใช้ auth_nonces (commit 6670b38)
- [x] **slice 1 — ผูก+ยืนยันเบอร์เองจากหน้า `/profile`** (OTP 6 หลัก · TTL 5 นาที · 5 ครั้ง/วัน · cooldown 60 วิ · เก็บเป็น HMAC ไม่ใช่ sha256 เปล่า)
- [x] **ถอดช่องทาง login ได้ทุกอันแล้ว รวม Discord + เบอร์** — กันถอดจนเหลือ 0 วิธี (นับ identity rows + เบอร์ verified + email) · ถอด Discord = เคลียร์ `users.discord_id` ด้วย

## 🌐 pplevolunteers.org — Auth & Platform
> ย้ายมาจาก md/PENDING.md (2026-07-29)

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

### 🆕 Phone OTP login (web) — **UI ขึ้น prod แล้ว** (verify ด้วย curl 2026-07-08: /login มีปุ่ม "เข้าด้วยเบอร์มือถือ (SMS OTP)")

> ⚠️ **ต้องเช็คด่วน:** prod รัน `migration.sql` (column `phone_verified_at`) แล้วหรือยัง — ถ้ายัง `findOwnerByVerifiedPhone` จะ query column ที่ไม่มี → `/api/auth/phone/request` พัง 500 ทั้งที่ปุ่มโชว์อยู่บน prod
> ทางเข้าลึก: หน้าแรกไม่มี CTA · ต้องกด text link จางๆ `เข้าสู่ระบบ` บน Nav ([Nav.jsx:694](../web/components/Nav.jsx#L694)) ก่อนถึงเจอปุ่ม OTP
- login เว็บด้วยเบอร์ + SMS OTP สำหรับสมาชิกที่ verify เบอร์ผ่าน Discord แล้ว (เข้า Discord ไม่ได้/ลืมรหัส) · session สิทธิ์เท่า Discord login
- เบอร์เป็น credential เฉพาะ `phone_verified_at IS NOT NULL` (verifyHandler เซ็ต / แก้เบอร์เองจาก profile → reset) · endpoint ตอบ generic ทุกกรณีกัน enumeration · quota แชร์ `otp_quota` กับ bot
- **ก่อน deploy prod:** รัน `migration.sql` (column `phone_verified_at`) · เทสต์ happy-path จริง (SMS ยิงจริง)
- หมายเหตุ: สมาชิกที่ verify เบอร์ก่อน 2026-07-05 ไม่มี `phone_verified_at` ต้อง verify ใหม่ — prod ยังไม่กระทบ (verify_phone ยังไม่ deploy)
- **Coverage (จด 2026-07-07):** phone login ใช้ได้เฉพาะคนที่ผูกเบอร์ผ่าน verify_phone ใน Discord → ผูกได้เฉพาะคนที่มีชื่อใน `ngs_member_cache` → **ตอนนี้ทะเบียนมีแค่ราชบุรี = phone login ครอบแค่ราชบุรี** · ขยายจังหวัด/องค์กรอื่น = import ทะเบียนเพิ่ม (งาน CSV import / Amnesty roster ที่จดไว้แล้ว) ไม่ต้องแก้โค้ด
- **Binding เป็น per-guild แต่ login เป็น global (จด 2026-07-07):** verify_phone เขียนเบอร์ลง `dc_members` เฉพาะ guild ที่วาง panel · login เว็บค้นเบอร์ข้ามทุก guild (`findOwnerByVerifiedPhone` ไม่ filter guild) → ผูกที่ guild เดียวก็ login ได้ session ระดับตัวคน ใช้ทุก guild ที่เป็นสมาชิก · ข้อจำกัด cosmetic: profile guild อื่นไม่โชว์เบอร์
- **⚠️ ก่อนวาง panel verify_phone ที่ server ราชบุรี:** ทะเบียน `ngs_member_cache` ทั้ง 4,488 รายชื่ออยู่ใต้ guild อาสาประชาชน (1340903354037178410) — วาง panel ใน server ราชบุรี (1111998833652678757) จะ **match ไม่เจอใครเลย** เพราะ verifyHandler ค้นเฉพาะ guild ที่กดปุ่ม → ต้องเลือก: (ก) วาง panel ใน server อาสาประชาชน หรือ (ข) import ทะเบียนราชบุรีเข้า guild_id ราชบุรีก่อน (script `importGuildMembers.js` ที่จดคิวไว้)

### ✅ Org layer + phone login — โค้ดเสร็จ local 2026-07-08 · **ยังไม่ deploy prod**

> โมเดลเต็ม + rationale ดู memory `decision_tenant_anchor_guild.md` · ที่นี่คือ checklist deploy + งานค้าง

**ทำเสร็จ + พิสูจน์กับ DB จริงแล้ว:**
- ตาราง `organizations` + `dc_guilds.org_id` — seed org "pple" ครอบ 3 guild (อาสาฯ `1340903354037178410` roster อยู่ที่นี่ / ราชบุรี `1111998833652678757` / people's party `1115613658408566844`)
- `db/org.js` + `web/lib/org.js` — `getOrgGuildIds()` (fallback `[guildId]` เดี่ยวถ้าไม่มี org)
- `verifyHandler.js` — roster match + dedup มองข้าม guild ในเครือ · **เขียน `member_id` ที่ guild เจ้าของ roster เท่านั้น** (ไม่ใช่ guild ปุ่ม — กัน dangling pointer, join `m.guild_id=n.guild_id` จะหาไม่เจอถ้าเขียนผิด guild) · ถ้า user ไม่ได้อยู่ guild เจ้าของ roster → error บอกตรงๆ ให้ไป join ก่อน (ไม่ silent fail)
- Bug 2 ตัวที่เจอระหว่างเทสและแก้แล้ว: (1) `deploy-commands.js` ไม่มี try/catch ต่อ guild → guild เดียวพัง (50001 Missing Access) ทำ guild อื่นไม่ได้ deploy ไปด้วย (2) early-exit "ยืนยันแล้ว" เช็คแค่ `member_id` ไม่เช็ค `phone_verified_at` → คนที่ผูกไว้ก่อนมีคอลัมน์นี้ (หรือผูกผ่าน docs) re-verify ไม่ได้ ติดกับดักถาวร login เว็บไม่ได้ (แก้แล้ว: เช็คทั้งคู่ + NOT EXISTS ตัดเฉพาะแถวคนอื่น claim)
- OTP ref code (4 ตัว, ตัด ILO01) ทั้ง bot+web — กัน SMS หลายฉบับสับสน + ปิดช่อง enumeration (คืน ref ทุกกรณี)
- quota 3→5 ครั้ง/วัน (แชร์ bot+web) — 3 ไม่พอเมื่อ SMS หาย/ขอใหม่
- Login UI รวมเป็นหน้าเดียว — หน้าแรก = login (การ์ด login 2 คอลัมน์กลางจอ, Discord ปุ่มส้มเด่น) · `/login` เหลือแค่ redirect (`pages.signIn` ยังต้องมี route นี้) · ลบ `LoginButton.jsx` (ตัวก่อความซ้ำซ้อน) · ถอดการ์ด CALLING/FINANCE ออกจากหน้า public (เตรียม rebrand)

**เคาะ scope แล้ว (คุยกับ user 2026-07-08):**
- **verify_phone panel ให้มีแค่ที่ guild อาสาประชาชน** — ห้ามเปิดที่ราชบุรี/peopleparty (เพราะ bind สำเร็จได้เฉพาะคนที่เป็นสมาชิกอาสาฯอยู่แล้ว จากทะเบียนที่ anchor ที่นั่น — เปิด panel ที่อื่นจะสร้าง error เปล่าๆ ให้คนที่ไม่ได้อยู่อาสาฯ)
- member_id **ห้าม sync/copy ไปหลาย guild** — เขียนแถวเดียวที่ guild เจ้าของ roster เท่านั้น (join พังถ้าเขียนผิด guild)
- `guildMemberAdd` upsert `dc_members` อัตโนมัติทุกคนที่ join (ไม่ต้องแนะนำตัว) — path fallback ใน verifyHandler (สร้างแถวถ้าไม่มี) ใช้จริงน้อยเพราะแถวมีอยู่แล้วเกือบทุกคน

**ยังไม่ทำ / ค้าง:**
- **Docs link-ngs (Phase 2b)** — ประตูผูก member_id ที่ 2 ยังเป็น guild-local ไม่ได้ทำ org-scope (ความเสี่ยง double-claim ต่ำ เพราะต้องรู้เลขบัตร 13 หลัก — แยกทำได้ไม่บล็อก phone login)
- **cases org-scope query** — ยังไม่เริ่ม (คนละก้อนกับ phone login)
- **ก่อน deploy prod:**
  1. รัน `migration.sql` เต็มไฟล์ (org block + `phone_verified_at`)
  2. `./deploy.sh` (slash option `verify_phone` ใหม่) + restart bot (โหลด `db/org.js`)
  3. build+restart web
  4. `/panel register verify_phone:true` **ที่ guild อาสาประชาชนเท่านั้น** (ไม่ใช่ราชบุรี)
  5. เทสต์ SMS จริงครบ flow: verify ใน Discord → `phone_verified_at` ขึ้น → login เว็บด้วยเบอร์ได้
- **people's party ยังไม่มี slash commands** (bot จริงยังไม่ได้ invite — เจ้าของตั้งใจไม่เอา tester bot เข้า ไม่ใช่ bug) — ต้อง invite bot จริงเข้า server นี้เอง แล้วรัน `deploy-commands.js` ใหม่

**Wrinkle cases (ยังไม่ตัดสิน, ไม่บล็อกงานอื่น):** caseworker ถูก assign เคสราชบุรีจากเว็บ → จะ ping ในกระทู้ได้ต้องเป็นสมาชิก guild ราชบุรีด้วย

**ความคืบหน้า (2026-07-08):**
- ✅ **Phase 1 — mapping:** ตาราง `organizations` + `dc_guilds.org_id` + seed org `pple` ผูก 3 guild (อาสาฯ `1340903354037178410`, ราชบุรี `1111998833652678757`, people's party `1115613658408566844` — pre-seed เพราะ bot ยังไม่ sync) · helper `db/org.js` + `web/lib/org.js` `getOrgGuildIds()` (fallback `[guildId]` ถ้า org_id NULL = ไม่ regress guild อื่น) · รัน local แล้ว
- ✅ **Phase 2a — verifyHandler:** roster match + "ผูกแล้วยัง" + claimed-check → org-scope (`guild_id = ANY(orgGuilds)`) · เขียน member_id ยังลง guild ตัวเอง · พิสูจน์ query จริง: ราชบุรี context เจอทะเบียนใต้อาสาฯ (source_id 44027) · `findOwnerByVerifiedPhone` ไม่แตะ (global อยู่แล้ว)
- ⏳ **Phase 2b — docs link-ngs (แยกทำ):** ประตูผูก member_id ที่ 2 · ต้อง trace เพิ่ม (ngs-search + `entry.guild_id` + จุด write) · **คำถาม design ค้าง:** signer ไม่ได้อยู่ guild ของบิล → เขียน member_id ที่ row guild ไหน · ความเสี่ยง double-claim ข้ามประตูต่ำ (docs ต้องเลขบัตร 13 หลัก) เลยแยกทำได้
- ⏳ **Phase 3 — deploy prod + เทสต์:** (1) รัน `migration.sql` (org block + `phone_verified_at`) (2) restart bot (โหลด db/org.js) (3) `/panel register verify_phone:true` ที่ **server ราชบุรี** (4) เทสต์ SMS จริง: verify เบอร์ที่ราชบุรี → เจอทะเบียน → login เว็บด้วยเบอร์

**หมายเหตุ decision:** org_id เก็บที่ `dc_guilds` **ที่เดียว** (single source of truth) — ไม่ copy ลง ngs_member_cache/ตารางอื่น · org scope ทำผ่าน `getOrgGuildIds()` หรือ JOIN dc_guilds

**cases (org-scope web query)** ยังไม่เริ่ม — คนละก้อนกับ phone login

**จังหวะ 2 (เลื่อน — เมื่อ org ต้องการ custom text field ต่างกันจริง):**
- ระบบฟอร์ม dynamic: นิยามฟอร์มเก็บใน `dc_guild_config` key `register_form_fields` (json array — **ไม่ต้องมี table ใหม่**) + `dc_members.extra JSONB` สำหรับค่าที่ไม่มี column · ดู section "Custom Register Form"
- modal สร้างสดจาก config · renderer dispatch ตาม type: text→modal(≤5 ช่อง), verified_phone→OTP flow, choice→picker เดิม (`dc_guild_roles`)
- หน้า backoffice `/bot/forms` (pattern เดียวกับ `/bot/roles`) · `verify_phone` toggle จังหวะ 1 ถูกดูดเข้ามาเป็น field type `verified_phone`
- เก็บ JSONB (ไม่ใช่ EAV) — PG query/index `extra->>'key'` ได้ · field common → เลื่อนเป็น native column
- **web `/join/<slug>` + SMS blast** สำหรับกลุ่มที่ยังไม่มี Discord เลย (ต้องเขียน custom OAuth + `guilds.join` scope) · Magic Link email เป็น fallback

