# PENDING.md — Backlog & Ideas

> เก็บเฉพาะงานค้าง + design ที่ยังไม่ทำ · ของที่ทำเสร็จ+deploy แล้วย้ายไปอยู่ในโค้ด/`md/*` ตามระบบ

## 📍 อ่านตรงนี้ก่อน — สถานะ ณ 2026-07-21

**org migration ปิดจบแล้วทั้งหมด** — identity split + org core + org-scope ครบทั้ง 4 ฟีเจอร์ (finance · calling · docs · cases) + audit_logs · **ไม่เหลือ tenant data ที่ยัง guild-based**

**งานถัดไปคือ cutover ขึ้น prod** → `md/CUTOVER.md` (10 ขั้น · branch `org-core` นำ `master` 71 commit · prod ยังไม่เคยเห็นโค้ดชุดนี้)
- ⛔ ค้าง 2 อย่างก่อน deploy: **user เทส docs+cases ในเบราว์เซอร์** · **ซ้อม migration กับ dump ของ prod** (CUTOVER §1.5 — ยังไม่เคยซ้อม = เสี่ยงสุด)

**เอกสารกวาดตรง schema จริงแล้ว (2026-07-21)** — DATABASE.md regenerate จาก DB สด 58 ตาราง · CASE/DOCS/CALLING/CONTACT ตามมา · งานที่งอกจากรอบนี้ + **พรอมต์ audit RBAC พร้อมใช้** อยู่หัวข้อ 🧹 ท้ายไฟล์

> ⚠️ หัวข้อข้างล่างเรียงตาม**ประวัติการทำงาน** ไม่ใช่ลำดับความสำคัญ · เช็ค `[x]/[ ]` ก่อนเชื่อว่ายังไม่ได้ทำ

---

## 🌐 platformfor.org / CivicFlow — identity/tenant migration (✅ เสร็จ 2026-07-21 · เหลือ cutover)

> **แผน + สถาปัตยกรรมเต็มอยู่ที่ `md/civicflow/CIVICFLOW.md`** (อ่านก่อนเริ่ม) · rebrand → email-first multi-tenant, Discord = adapter เสริม · consult wedge กับ CivicFlow (US nonprofit, โจทย์ตรงกัน)

- [x] **Phase 0 (2026-07-15)** — drop `members` (DB + migration block) · `dc_members` เพิ่ม `email` + partial-unique `uq_dc_members_email` · ปลด NOT NULL `discord_id`/`guild_id`/**`username`** (shell/email row ไม่มีทั้ง 3) · คง DEFAULT '' ของ guild_id (email-insert ใส่ NULL เอง)
- [x] **Phase 1 (2026-07-15)** — email-native login เสร็จ + verify curl ครบ flow (login→org→dashboard + invite→claim) · **namespace = `org`** (ไม่ใช่ `platform` — เลี่ยงผูกชื่อแบรนด์)
  - NextAuth **instance ที่ 2** แยกจาก PPLE: cookie `org-auth.*`, route `/api/org/auth/[...nextauth]`, options `web/lib/org-auth-options.js` · ⚠️ next-auth v4 `__NEXTAUTH` เป็น global → **ห้ามใช้ SessionProvider ซ้อน 2 basePath** → platform pages เป็น **server component** (getServerSession) + login trigger แบบ manual CSRF (`web/lib/orgSignIn.js`)
  - magic-link + org invite = **ส่งเมลจริงได้แล้ว (2026-07-17)** ผ่าน `web/lib/sendEmail.js` (nodemailer SMTP generic + dev-stub fallback: ไม่ตั้ง env=log link เฉยๆ พฤติกรรมเดิม) · token ใน `org_login_tokens` (email-keyed, TTL 15 นาที) · reuse nonce→credentials pattern แทน NextAuth EmailProvider (เลี่ยง DB adapter)
    - **เปิดส่งจริง:** ตั้ง env ใน `web/.env` → `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/EMAIL_FROM` แล้ว restart · Gmail = App Password (เปิด 2FA ก่อน), host smtp.gmail.com port 465 · **prod แนะนำย้าย Resend + โดเมน pplevolunteers.org (SPF/DKIM/DMARC)** — โค้ด SMTP generic ย้ายเจ้าแค่เปลี่ยน env ไม่แตะโค้ด
  - identity = `resolveOrgUser(email)` = findOrCreate `dc_members` by email + claim invites · org create self-serve (creator=owner) · invite = shell user + `org_members(status='invited')` → claim auto ตอน login email ตรง
  - ⛔ **Google เลื่อน (bug-org-oauth-basepath):** next-auth v4 ล็อก basePath ทั้ง process จาก `NEXTAUTH_URL` → instance ที่ 2 บน subpath ส่ง `redirect_uri=/api/auth/callback/google` (path PPLE) → OAuth พัง. ปิดปุ่ม+provider แล้ว. **Google กลับมาตอน unify auth เป็น instance เดียว** (endgame ที่ user ยืนยัน — auth-options.js เดิม extend, Discord+Google+email+magic = ปุ่มบนบัญชีเดียว)
  - ⚠️ **ข้อจำกัดที่ตั้งใจ (ไม่ใช่บั๊ก) — email login = สร้าง dc_members แถวใหม่ ไม่ reconcile กับบัญชี Discord เดิม** (user เคาะยอมรับ 2026-07-15). auto-merge ไม่ได้เพราะ (1) PPLE row ไม่มี email verified — `google_id` เป็น text พิมพ์เอง merge = account takeover (2) PPLE 1 คน = หลายแถว (per guild) ไม่มีแถวเดียวให้ email เกาะ. กัดเฉพาะคนซ้อน 2 โลก (target org = non-Discord ไม่กระทบ). **ทางแก้ทีหลัง:** (ก) link path — login Discord อยู่ → verify+เขียน email ลงแถวเดิม → email login เจอแถวนั้นเอง · (ข) เวอร์ชันสะอาด = Phase 3 identity unify (dc_members 1 คน 1 แถว) แล้ว email+discord_id อยู่แถวเดียว
- [x] **Phase 2 — ownership migration ครบทั้ง 4 ฟีเจอร์ ✅ เสร็จ 2026-07-21** (finance `be4d8d3` → calling `1be4d48` → docs `c73aaba`/`61afecd`/`c207d8f` → cases `37c70d6`/`091c8cc` · + audit_logs `e2f2965`)
  - **ไม่เหลือ tenant data ที่ยัง guild-based แล้ว** · ที่คง `guild_id` = Discord/ACT artifact โดยตั้งใจ: `case_config` · `finance_config` · `cache_pple_event` · `dc_*` ทั้งหมด
  - รายละเอียดต่อฟีเจอร์อยู่ในหัวข้อย่อยข้างล่าง (FINANCE / CALLING / DOCS) · cutover runbook = `md/CUTOVER.md` (10 ขั้น)
  <details><summary>spec เดิมของ Phase 2 (เก็บอ้างอิง — rule ที่ใช้จริงตลอดทั้ง 4 ฟีเจอร์)</summary>
  - **order: cases + finance ก่อน** (งาน org ทั่วไป generic ไม่ผูก geography/ตำแหน่งพรรค + ตรง CivicFlow) → **docs ทีหลัง** (ยากสุด: ผูก Discord role + geography ในสิทธิ์เซ็น)
  - **rule ไม่ใช่ swap ตรงๆ — judgment ทีละตาราง** (บทเรียนเดียวกับ "member 2 concept"):
    - `user_id` แทน `discord_id` = ค่อนข้าง universal (ตัวตน/เจ้าของ: created_by, assignee, ผู้บันทึก)
    - `org_id` แทน `guild_id` = **เฉพาะตาราง "data ของ tenant"** (transactions, cases)
    - **⚠️ config/artifact ของ Discord server เอง (เช่น `finance_config`, channel/guild settings) → คง `guild_id`** ไม่ยุบเป็น org_id (มันคือตั้งค่าของเซิร์ฟเวอร์ ไม่ใช่ของ org) · email org (ไม่มี guild) → เก็บ config ที่ org_id หรือ table แยก เคาะตอน migrate จริง
  - **discord_id → drop เป็น key** (ไม่ใช่ฆ่า Discord login): feature เลิกเกาะ discord_id → เกาะ user_id · `dc_members.discord_id` เหลือสถานะ **credential** (login Discord ยังใช้ → map เป็น user_id)
  - ⚠️ **RBAC เป็นคนละส่วน:** เปลี่ยน column เจ้าของ = ง่าย แต่ "ใครมีสิทธิ์ทำ" (financeAccess/caseGate เช็ค Discord role) โลก email ต้องสลับใช้ `org_members.role` ด้วย = ส่วนหนึ่งของงาน
  - ⚠️ org_members.user_id ชี้ dc_members.id ได้สะอาดเฉพาะ email row (guild_id NULL, 1/คน) — อย่า join PPLE per-guild row เข้า org_members
  </details>
- [x] **Phase 3 — identity split ✅ เสร็จ** (`93ef6de` สร้าง users+org_members · `1aeeb37` repoint บอท) — `dc_members` ถูก rename เป็น `_dc_members` (archive) แล้ว · เหลือแค่ **drop ทิ้งหลัง cutover นิ่ง** (ดู ④ ข้างล่าง)

### 🎫 Web-native role grant (RBAC — โลก email + จัดยศผ่านเว็บ)

- [x] **B — grant ยศคน Discord ผ่านเว็บ (2026-07-16, commit 6d534fb)** — หน้า `/admin/roles` (ค้นสมาชิก → chip ยศ toggle) → สั่ง Discord เพิ่ม/ถอดยศจริง (`lib/discordRoles.js` PUT/DELETE) + write-through `dc_members.roles` + `clearAccessCache` + audit · gate `manageRoles`=admin/moderator (permissions.js) · grantable = 9 role (ยกเว้น admin) · **Discord = one source, เว็บเป็นรีโมท** (ตอบโจทย์ "แก้ที่ไหนก็ตรงกันทั้ง Discord+web") · verify curl 403/200 + jest 189 ผ่าน · ⬜ ยังไม่กดเทสจริงในเบราว์เซอร์ (แตะ Discord side-effect)
- [x] **web_roles — grant ยศคน email (guildless)** ✅ commit 98aef7d — เพิ่ม column `dc_members.web_roles TEXT` (CSV ของ **key** จาก `org_roles` เช่น `treasurer,editor` — ไม่ใช่ชื่อไทย) · resolveAccess union: `roles`(ชื่อ Discord→แปลผ่าน catalog) + `web_roles`(key เป็น permission ตรงๆ **ไม่ต้องพึ่ง guild catalog** → คน email guildless resolve ได้) · grant API/UI ตัด `discord_id IS NOT NULL` ออก → คน email โผล่ + branch (Discord→เขียน Discord, email→web_roles) · ⚠️ email ยังเปิดหน้า `/finance` ไม่ได้จนกว่า unify login door (ยศติด+resolve ได้ แต่ page-access รอ)
- [ ] **⭐ migrate `dc_members.roles` (Discord CSV ชื่อ) → `web_roles` (key)** (user สั่งจด 2026-07-16) — แปลชื่อ Discord → permission key ผ่าน catalog `dc_guild_roles` เขียนลง web_roles → เป้าหมาย **web_roles = แหล่งรวม key ของทุกคน (Discord+email) ที่เดียว** · ⚠️ **decision คู่กัน:** ถ้าจะให้ web_roles เป็น source เดียวจริง ต้องให้ **Discord sync เขียน web_roles ด้วย** (แปล name→key ตอน sync ใน `db/members.js`) + resolveAccess อ่าน web_roles → ไม่งั้น `roles`(name) กับ `web_roles`(key) diverge ทุก sync (sync ทับ `roles` แต่ไม่ทับ `web_roles`)
### 🧬 Identity/Membership split (2026-07-16) — ✅ **repoint เสร็จครบแล้ว 2026-07-21** (เหลือแค่ contract)

- [x] **สร้าง `users` (lean identity) + `org_members` (membership+profile)** commit 93ef6de · script `scripts/migration/identity-split-expand.sql` (idempotent, prod-safe รันด้วย `-1`) · dedup dc_members หลายแถว/คน → users 1 แถว/คน (canonical = MIN(id) ต่อ discord_id) · verify localhost: **users 6573 (0 dup) · org_members 7295 (0 orphan) · dc_members ไม่แตะ**
  - **users** = ตัวตน + contact: `discord_id·email·google_id·username·phone·phone_verified_at·line_id·firstname·lastname` (+ created/updated_at)
  - **org_members** (id หน้าสุด) = ที่เหลือทั้งหมด: keys(`user_id`→users, `org_id`→orgs, `guild_id`) · membership(role/status/invited_by/joined_at/registered_at) · roles/web_roles/roles_assigned_at · position/member_id/serial · province/region · display_name/avatar/nickname/specialty · interests/referred_by · ย้ายจาก dc_members: amphoe/primary_province/bank_*/id_card_image
  - **หลักแบ่ง:** contact(phone/line)+ชื่อจริง → users · เอกสาร/bank/ที่อยู่/roles → org_members · "จังหวัดรับผิดชอบจริง" มาจาก **roles(scope_node)** ไม่ใช่ province column (verify แล้ว)
  - PK org_members = surrogate `id` · unique: Discord `(user_id,guild_id)` · email `(user_id,org_id)` (guild_id NULL)
  - ⚠️ **ไม่ auto-link Discord↔email** → คนละ users · email พี่ (unnop@) อยู่ orphan `dc_members.id=17505`, แถว discord `id=1` email ว่าง
- [x] **rename** `organizations`→`orgs` · `dc_user_identities`→`user_identities` (commit 93ef6de + update code refs: guilds/orgMembers/userIdentities/auth-options) · คง `dc_` เฉพาะ Discord-context (dc_members/dc_guilds/dc_guild_roles/dc_user_config/ratings/reports)
- [x] **Nav org-layout** commit 1899a6b — org switcher (group guild→org, `getUserGuilds` +org_id) + app tabs กางบน topbar (ตัด sub-nav ซ้ำบน home) · Phase A commit 8919047
- [x] **① repoint โค้ด ✅ เสร็จ** — ทุกฟีเจอร์อ่าน/เขียน `users`+`org_members` แล้ว (finance/calling/docs/cases) · `owner_id` re-backfill ผ่าน canonical + FK→users(id) เรียบร้อยตอน finance-org-scope · resolveAccess อ่าน `org_members.web_roles` แล้ว ([getEffectiveRoles.js:34](web/lib/getEffectiveRoles.js#L34))
- [x] **② single-auth เทสได้แล้ว ✅** — ไม่ได้ merge 17505 ตามแผนเดิม แต่ใส่ email ให้ `users.id=1` โดยตรง แล้วลบ shell row ทิ้ง → magic-link login ได้ session ที่มี `discordId` ครบเทียบเท่า Discord OAuth (ใช้เป็น harness เทสมาตลอด — ดู [[reference_local_browser_test_login]])
- [x] **③ bot sync ✅ เสร็จ** commit `1aeeb37` — `db/members.js` upsert 2 จังหวะ (users → org_members) เขียน `org_members.roles` แล้ว
- [ ] **④ contract (เหลืออันเดียว)** — `DROP TABLE _dc_members` (7,298 แถว) + คอลัมน์ที่ไม่ใช้ · **ทำหลัง cutover ขึ้น prod แล้วนิ่ง** · ⚠️ `_dc_members` เป็น safety net จริง (2026-07-21 เคยใช้กู้ `member_id` ที่ถูกล้าง) — อย่าเพิ่งรีบลบ

#### 💰 FINANCE org-scope — ✅ เสร็จ + verify 2026-07-17 (commit be4d8d3 บน org-core · localhost applied, prod ไม่แตะ)
**สรุปที่ทำจริง (ต่างจาก spec เดิม 2 จุด — ดีกว่า):**
- migration `scripts/migration/finance-org-scope.sql` (applied localhost): **in-place type convert** `guild_id→org_id` + `owner_id/updated_by` varchar discord→INT users.id **คงตำแหน่งคอลัมน์** (ไม่ใช่ rename tail col ที่กองท้าย) · ลบ tail col (org_id/owner_user_id/updated_by_user_id) ที่เติมช่วงออกแบบ · FK→users/orgs · gotcha: USING ห้าม subquery → ใช้ pg_temp helper fn `_g2o`/`_d2u`
- **getOrgId = `orgIdOfGuild(getGuildId)` ไม่ใช่ active_org cookie** (ค้าน spec เดิม): access-control ยัง guild-keyed → derive org จาก guild เดียวกัน = data+access aligned ไม่มี seam · cookie-based เลื่อนไป org-switcher endgame (ขยับพร้อม RBAC-by-org)
- getTransactions/summaries **เพิ่ม** org filter ผ่าน account join (เดิมไม่ scope เลย — latent leak) · financeAccess owner_id===userId · getEffectiveIdentity+useEffectiveRoles คืน userId (debug-null) · ลบ admin guild-picker ใน account form
- verify: 57 tests + build + psql queries คืน data จริง + /finance 307
- ✅ **bot write-path เสร็จ 2026-07-18** (org-core, code-only ไม่มี schema change — finance schema convert เสร็จใน finance-org-scope.sql แล้ว) — emailPoller/smsWebhook/financeOCR INSERT `org_id` แทน `guild_id` (จาก `account.org_id`) · `updated_by`: email/sms income (automated) = `NULL` / OCR (user upload) = `userIdByDiscord(message.author.id)` (map discord→users.id ไม่ใช่ 'system'/snowflake) · finance_config lookup (notifyDiscord) ใช้ `env.GUILD_ID` (account ไม่มี guild_id แล้ว · finance_config คง guild-keyed = Discord artifact) · financeOCR SELECT accounts + dup-check → `org_id` · +helper `db/org.js` `orgIdOfGuild`/`userIdByDiscord` · verify: node --check ×4 + simulate INSERT org_id=1/updated_by=NULL ผ่าน schema + orgIdOfGuild(env)=1
  - ⬜ ยังไม่ได้ trigger email/SMS/OCR จริง (verify ผ่าน SQL simulate เท่านั้น — ต้องเทสตอน deploy) · db/finance.js = finance_config (guild-based) ไม่ต้องแตะ
- ⚠️ **ค้าง cutover ก่อน merge master:** RBAC email-user เปิด /finance ผ่าน org (guildless org ยังเข้าไม่ถึง — ตั้งใจ, เปิดตอน endgame)

<details><summary>spec เดิม (grill 2026-07-17) — เก็บอ้างอิง</summary>

หลักการ: **scope→org_id (ทิ้ง guild_id) · person→user_id (ทิ้ง discord snowflake) · Discord artifact→เก็บ guild-based**
- **4 ตาราง data → org_id scope, drop guild_id:** `finance_accounts`, `finance_categories`, `finance_transactions`, `finance_incoming_log`
  - backfill `org_id` จาก `dc_guilds` (guild→org · collapse 3 guild ของ org 1 → org_id=1) — org_id column มีแล้ว แค่ backfill + repoint query
- **person-ref → ชื่อสั้น + user_id** (user เคาะ ไม่เอาชื่อยาว): **drop** `owner_id`/`updated_by` เก่า (VARCHAR discord) → **rename** `owner_user_id→owner_id`, `updated_by_user_id→updated_by` (INT → users.id)
  - FK owner_id/updated_by remap `_dc_members` → `users(id)` + re-backfill **canonical** (map _dc_members.id → users.id via discord_id)
  - code: `financeAccess` ownership `owner_id === discordId` → `owner_id === userId`
- **เก็บ:** `finance_transactions.discord_msg_id` (artifact ข้อความ bot โพสต์ ใช้แก้/ลบ)
- **finance_config = OUT OF SCOPE** — เป็น Discord dashboard config (channel/thread/dashboard_msg, bot-only: emailPoller/financeOCR/smsWebhook/db/finance.js) คง guild-based · **future bot-cleanup:** ยุบเข้า `dc_guild_config` (key 'finance_dashboard') — มันคือ guild config ไม่ใช่ finance data
- **dependency:** ต้องมี `getOrgId(session)` resolver ในแอปหลัก (finance page เปลี่ยน getGuildId→getOrgId) · reuse logic `active_org` cookie จาก `lib/activeOrg.js` (/org shell) · = ชิ้นเล็กสุดของ org-switcher-endgame ที่ finance-first ดึงมา
- ⚠️ RBAC page-access: email user เปิด /finance ได้เมื่อ resolve permission ผ่าน org_members.web_roles + scope org (ไม่ใช่ guild membership)
</details>

#### 📄 DOCS → org migration (feature ที่ 3 · grill เคาะ 2026-07-21)

> **สถานะ (2026-07-21):**
> - ✅ **Phase 1** commit `c73aaba` — schema org-scope (`docs-org-scope.sql`) + guild_id→org_id + person→users.id ใน db/route
> - ✅ **Phase 2** commit `61afecd` — `id_card_image` org_members→`users` (1 คน 1 ใบ) + `isMemberOfOrg()` ปิดรู PDPA ข้าม org + flow เซ็นใช้ users.id
> - ✅ **Phase 3** commit `c207d8f` (server) + `7514cf3` (client) — **ตัด bridge discord→users.id ทิ้งทั้งเส้น** · API รับ/คืน `user_id` ตรงๆ (`memberUserId`/`payerUserId`/`userId`) · `/api/docs/members(/recent)` คืน `user_id` (เดิมมีแต่ discord_id → คน email เลือกเป็นผู้รับไม่ได้) · client 5 ไฟล์คีย์ด้วย user_id · `member_discord_id` เหลือเป็น **display-only** สำหรับลิงก์โปรไฟล์ Discord เท่านั้น
>   - 🐛 latent bug ที่เจอระหว่างทาง: `getPayersForEvent` dedup pool ด้วย `discord_id` → manual payer (ไม่มีฟิลด์นี้) และ payer ที่ล็อกอิน email (NULL) โดนทิ้งเงียบ · **ยังไม่เคยกัดจริง** (localhost มี docs_payers 1 แถว) แต่จะกัดทันทีที่มีตัวที่ 2 → เปลี่ยนเป็น dedup ด้วย user_id แล้ว
>
> - ✅ **เก็บกวาด** `scripts/migration/docs-index-rename.sql` (applied localhost, idempotent): index/constraint 4 ตัวชื่อหลอก `guild`/`discord_id` → `org`/`user_id` · ตัด dead code `changePayer()` + `assignedPayers` + state/prop ที่ค้าง (`payerSaving`, `eventId` ที่ DocEntryList ไม่ได้ใช้แล้ว)
>
> **⬜ เหลือของ docs:**
> - **เทสจริงในเบราว์เซอร์ครบ flow (write path)** — สร้างบิล → กำหนดผู้รับ/ผู้จ่าย → เซ็น → gen PDF · **user ขอเทสเอง (2026-07-21)** · ที่ verify ไปคือ smoke test authed (ทุกหน้า/API 200 + PATCH entry 1 ครั้ง assert DB)
> - `POST /api/docs/projects/[id]/set-payer` **โหมด per-group (`recipientUserId`) ไม่มี client เรียกแล้ว** — UI ที่เคยใช้หายไปก่อนหน้านี้ (ตัว `changePayer` ที่เพิ่งลบเป็นซากของมัน) · เก็บ API ไว้ก่อน ถ้าไม่เอาจริงค่อยตัดทั้ง route mode + i18n key `entryList.confirmResetPayerSignature` ที่ลอยอยู่
> - `queryPayersByPermission` อ่านแค่ `org_members.roles` (ชื่อ role Discord) ไม่อ่าน `web_roles` → ดู **"อำนาจลงนาม → org-generic"** ข้างล่าง (grill เคาะแล้ว รอลงมือหลัง user เทส)

##### ✍️ อำนาจลงนาม (payer) → org-generic — grill เคาะ 2026-07-21 · **รอ user เทส docs ก่อนค่อยลงมือ**

> **ทำไมยังไม่ทำทันที:** user ยังไม่ได้เทส docs migration เลย · เอา schema+UI ใหม่ไปทับก่อนเทส = เจอบั๊กแล้วแยกไม่ออกว่ามาจากไหน · และรูนี้**ยังไม่มีใครตกจริง** (ผู้จ่ายจริงในระบบ 3 คน เป็นคน Discord ครบ) · **ไม่มีลูกค้า/org รอใช้ docs (user ยืนยัน 2026-07-21)**

**🔍 กลไกจริงที่ค้นเจอตอน grill (ก่อนหน้านี้เข้าใจผิด):**
- scope ของผู้ลงนามมาจาก **Discord role 2 ใบคนละหน้าที่ ที่ต้องถือครบคู่**:
  - **"ยศ"** เช่น `ผู้ประสานงานจังหวัด` → `dc_guild_roles.permission = province_coordinator` · **ไม่มี scope_node**
  - **"ทีมพื้นที่"** เช่น `ทีมราชบุรี` → `scope_node = province:ราชบุรี` · **ไม่มี permission**
  - ใน 392 role: 11 ใบเป็นยศ · 97 ใบเป็นทีมพื้นที่
- [resolveAccess.js:78](web/lib/resolveAccess.js#L78) `web_roles` เติม **permission อย่างเดียว ไม่เติม scopeGrants** → คนที่ตั้งยศผ่านเว็บได้ "ยศ" แต่ไม่ได้ "พื้นที่" → `gatedScopeNodes` คืน `[]` → โดน `if (!scope_nodes.length) return false` คัดออก **ทั้ง role-based และ manual list** (docs_payers ก็คำนวณ scope จาก role catalog เหมือนกัน ไม่ได้มีของตัวเอง)
- ตัวเลข org 1: มียศลงนาม 181 คน · มีทีมพื้นที่ 2,310 · **ครบคู่เซ็นได้จริง 110** · **เคยเป็นผู้จ่ายจริง 3 คน** (Tee 11 ใบ · Noom 7 · add_teerapon 3)

**✅ เคาะแล้ว:**
1. **ผู้ลงนามผูกกับ "ลิสต์ที่ org กรอกเอง" (`docs_payers` = แหล่งจริง)** ไม่ใช่ระบบยศ · ยศ Discord ลดชั้นเป็น **ทางลัดเติมลิสต์** (feature เสริมของ PPLE ปิดได้) · เหตุผล: `docs_payers` มี `display_name`/`position`/`signature_base64`/`sort_order` ของตัวเองครบอยู่แล้ว **ขาดแค่ scope** → เติมช่องเดียวจบ · org ใหม่ไม่ต้องมี Discord ไม่ต้องมียศพรรคก็ใช้ได้
2. **งานที่ต้องทำ (เล็ก):** `+docs_payers.scope_nodes` (รูปแบบเดียวกับ `dc_guild_roles.scope_node` เช่น `province:ราชบุรี` เพื่อใช้ `expandGrants` ตัวเดิมได้) · หน้า `/docs/settings` เพิ่มช่องเลือกจังหวัด · `getPayers` ใช้ scope ของแถวตัวเองแทนการคำนวณจาก role catalog

**❓ ยังไม่เคาะ (ไว้ตอนลงมือ จะรู้จาก usage จริงแล้ว):** ทางลัดจากยศ Discord เป็นแบบไหน — (ก) ปุ่ม "ดึงจากยศ" import ครั้งเดียวแล้วลิสต์เป็นเจ้าของ (แนะนำ — แหล่งเดียวจริง) · (ข) auto คำนวณสดทุกครั้ง (= 2 แหล่ง ขัดข้อ 1) · (ค) ไม่มีทางลัด กรอกมือล้วน (ใช้จริงแค่ 3 คน อาจพอ แต่จังหวัดใหม่จะ dropdown ว่าง)

**🧱 กำแพงตัวจริงที่ใหญ่กว่า payer — "org สร้าง event เองไม่ได้" (blocker ของ docs generic ทั้งก้อน):**
- `docs_projects.cache_pple_event_id` **NOT NULL + FK** → ทุกโครงการต้องเกาะ event ที่มีอยู่ก่อน
- `cache_pple_event` = cache sync จากระบบ **ACT ของพรรค** · `guild_id` NOT NULL · เขียนได้จาก `scripts/data/sync-act-events.js` เท่านั้น — **ไม่มี UI สร้างงานบนเว็บเลย**
- [projects.js:115](web/db/docs/projects.js#L115) ยัง `WHERE id = $1 AND guild_id = $2` → org ไม่มี guild query ได้ 0 แถว
- → org ใหม่เปิด /docs = dropdown "เลือกงาน" **ว่างตลอดกาล** ไม่ว่า payer จะ generic แค่ไหน · `province` ที่ใช้กรอง payer ก็มาจาก event ตัวนี้
- **ทำตอนมีลูกค้าจริง** — ก้อนใหญ่ (event CRUD + ตัด dependency ACT) และ **แตะ calling ด้วย** (ใช้ `cache_pple_event` เป็น campaign)

**+ PPLE hardcode อีกจุด:** [generatePdf.js:136](web/lib/generatePdf.js#L136) ฝังชื่อโครงการพรรคไว้ในโค้ด (`'การจัดประชุมสมาชิกสัมพันธ์และผู้สนับสนุนพรรคทั่วประเทศ ปี 2569'`) → ต้องย้ายเป็น config ต่อ org ตอนทำ generic

<details><summary>สเปกเดิมจาก grill (2026-07-21) — เก็บอ้างอิง</summary>
> **ทำก่อน cutover** (เคาะ 2026-07-21 — user ค้านแผนเดิมที่จะ cutover ก่อนแล้วทำ docs ทีหลัง และมีเหตุผลแข็งกว่า): ขึ้น prod ครึ่งเดียว = จ่ายต้นทุน cutover 2 รอบ + prod มี 2 โมเดลพร้อมกัน (finance/calling=org, docs=guild) + **migration ก้อน docs จะไปรันกับ data ที่คนใช้จริง** แทนที่จะรันตอนยังไม่มีใครพึ่ง
>
> **ขนาดจริง (เล็กกว่า calling มาก):** projects 9 · payers 1 · attachments 3 · entries 29 · signatures 7 · guild เดียวทั้งหมด · **web อย่างเดียว — ไม่มีโค้ดฝั่งบอทเลย** (5 ไฟล์ `web/db/docs/`, 30 route, 5 page)
>
> **สเปกที่เคาะ:**
> 1. **scope → org_id** 3 ตารางที่มี `guild_id`: `docs_projects` · `docs_payers` · `docs_project_attachments` · ⚠️ `docs_activity_entries` + `docs_signatures` **ไม่มี guild_id ของตัวเอง** → scope ผ่าน `project_id` (ต้องไล่ทุก query ว่า join ถึง project จริง ไม่งั้นหลุด scope)
> 2. **person → users.id** 6 คอลัมน์: `projects.created_by` · `projects.payer_discord_id` · `entries.member_discord_id` · `entries.payer_discord_id` · `payers.discord_id` · `signatures.signed_by_discord_id`
>    - **คนนอก (ไม่มีบัญชี Discord) = NULL เหมือนเดิม ไม่สร้าง shell user** — ตอนนี้ entries 8/29 แถวเป็นแบบนี้อยู่แล้ว (ผู้รับเงินที่เซ็นผ่านลิงก์) ชื่อ/ข้อมูลกรอกในเอกสารแทน = พฤติกรรมไม่เปลี่ยน
>    - `projects.created_by` มี **1 แถว map ไม่ได้** (คนหายจากระบบ) → NULL + **log ค่า discord_id เดิมไว้ใน migration** ให้เห็นก่อนทิ้ง
>    - ที่เหลือ map 100% (payer 7/7 · entries 21/21 · payers 1/1 · signatures 7/7)
> 3. **rename column** `docs_projects.act_event_cache_id` → `cache_pple_event_id` (จงใจเว้นไว้ตอน calling rename เพราะไม่อยากลาม — ตอนนี้กำลังแตะ docs อยู่แล้ว = จังหวะที่ถูก) · ตัว `cache_pple_event` **ยังคง guild-based** (ACT/Discord artifact)
> 4. **`id_card_image`: org_members → `users`** (1 คน 1 ใบ) — ที่มันอยู่ org_members เป็นมรดกจาก identity split ที่ลากตามสูตร ไม่ได้ตัดสินใจใหม่ · ของเดิมสมัย docs เคาะไว้ที่ `dc_members` per-guild โดยรู้ว่าซ้ำ · **PDPA ข้าม tenant** = เหตุผลเดียวที่ต้องระวัง → เก็บใบเดียวที่ users แต่ **ประตูเข้าถึงผูก org**: ผู้ขอต้องอยู่ org เดียวกับเจ้าของ + มีสิทธิ์ docs ใน org นั้น (`/api/docs/id-card/[discordId]` ตอนนี้เช็ค guild จาก session → เปลี่ยนเป็น org)
> 5. client + route ใช้ `getOrgId` / `getEffectiveOrgIdentity` / `scope:'org'` เหมือน finance/calling
>
> **⚠️ scrutinize เจอเพิ่ม 2026-07-21 — ต้องทำ ไม่งั้นเปิดรูระหว่างทาง:**
> - 🔴 **การเช็ค "อยู่ org เดียวกัน" ไม่เคยมีในระบบ** — [id-card/[discordId]/route.js:28-32](web/app/api/docs/id-card/[discordId]/route.js#L28-L32) เช็คแค่ `isOwner || canManageDocs` · ทุกวันนี้รอดเพราะ storage เป็น per-guild (คนดูแล guild A เห็นได้แค่สำเนาของ guild A) · **พอรวมเป็นใบเดียวที่ users ตัวกันนี้หายทันที** → ต้องเขียนเช็คสมาชิกภาพใหม่ (เจ้าของบัตรต้องมีแถว `org_members` ใน org ของผู้ขอ) + เปลี่ยนเป็น `getEffectiveOrgIdentity` · **เช็คต้องขึ้นก่อนย้าย storage**
> - 🔴 **URL บัตรประกอบจาก discord_id ฝั่ง client** — [sign/[token]/page.js:90](web/app/docs/sign/[token]/page.js#L90) `/api/docs/id-card/${d.data.member_discord_id}` → พอเป็น `member_user_id` จะกลายเป็น `undefined` **รูปไม่ขึ้นเงียบๆ** = bug-032 ซ้ำ → เปลี่ยน route param + ไล่ caller พร้อมกัน (+ เช็ค join ใน `generatePdf.js:275`)
> - 🟠 **`link-ngs` ผูก `member_id` แบบ per-guild** ([link-ngs/route.js:44-50](web/app/api/docs/sign/link-ngs/route.js#L44-L50)) แต่ verifyHandler (แก้ 2026-07-21) ผูกทั้ง org → สองมาตรฐาน · คอมเมนต์ยังอ้าง `unique (guild_id, member_id)` ที่ถูกแทนด้วย trigger ระดับ org แล้ว (bug-036) → ทำให้ตรงกัน
> - 🟠 **อัปโหลดบัตรบังคับ `session.user.discordId`** ([id-card/route.js:17](web/app/api/docs/id-card/route.js#L17)) → คน email อัปไม่ได้ · และ 404 "ไม่พบข้อมูลสมาชิกใน guild นี้" จะหายไปเองหลังย้ายไป users = พฤติกรรมเปลี่ยน ต้องตั้งใจ ไม่ใช่หลุดมา
> - ✅ ตรวจแล้วปลอดภัย: entries/signatures scope ผ่าน `docs_projects` ครบทุก read · `getEntryByToken` **ไม่มี scope โดยตั้งใจ** (token = ตัวสิทธิ์) ห้ามเผลอยัด org filter · docs ไม่มี `process.env.GUILD_ID` ฝังตรงไหนเลย (ต่างจาก calling) · `getGuildId` 10 route ที่ต้องเปลี่ยนเป็น `getOrgId`
>
> **บทเรียนที่ต้องใช้ (จาก calling — bug-029…032):** หลังแปลงชนิดคอลัมน์ต้อง grep หา `COALESCE(<col>, '')` · param text เทียบ column INT (`= $n` → ต้อง `::int`) · **ฟังก์ชันที่ signature ไม่มี orgId จะรอด sweep ทั้งดุ้น** (grep `process.env.GUILD_ID` ปิดท้าย) · client map ที่ยัง key ด้วย discord_id
>
> **+ บทเรียนใหม่จาก Phase 3 (2026-07-21):** เปลี่ยน key จาก **string (snowflake) → number (users.id)** แล้วโค้ด client ที่เรียกเมธอดของ string จะพังทันที — เจอจริง `key.startsWith('__')` = TypeError หน้าพังทั้งหน้า · ต้อง grep หา `.startsWith(` / `.includes(` / `.split(` บนตัวแปรที่เคยเป็น id · และ `<select>` คืน **string เสมอ** → ต้อง `Number()` ก่อนเทียบกับ user_id ไม่งั้น `!==` เป็นจริงตลอด

</details>

#### 📞 CALLING → org migration (feature ที่ 2 · grill เคาะ 2026-07-19 · WIP)
> เคาะ: **calling ก่อน cases** (cases ROI ต่ำ Discord-bound — grill แยกทีหลัง) · depth = **full parity กับ finance**
>
> **Reframe สำคัญ:** calling ไม่ใช่ twin finance ตรงๆ. callee 2 ฝั่ง — `member`(99.9% ของ log) = roster จากระบบ **NGS** · `contact`(590) = CRM ของ org. campaigns = event จากระบบ **ACT**. หลักการปรับ (2026-07-19): **NGS data = ของ org (org-scope)** · **ACT/Discord event = guild artifact (คง guild)**. guildless org = contacts-only calling (roster/campaign เป็น PPLE-guild)
>
> **✅ Phase 1 — RENAME เสร็จ+commit 715cffa (2026-07-19):** `ngs_member_cache→cache_pple_member` · `act_event_cache→cache_pple_event` (สื่อว่าเป็น cache external-sync ต่อ tenant) · `scripts/migration/cache-rename.sql` (idempotent, prod cutover ต้องรันตอน merge) · 31 js + 5 md · ⚠️ column `docs_projects.act_event_cache_id` **คงชื่อเดิม** (rename column = docs scope creep) · cross-feature: rename แตะ docs ด้วย (docs ผูก 2 ตารางนี้หนัก) แต่ additive ไม่พัง · verify build exit0 139 pages + DB JOIN ผ่าน
>
> **✅ Phase 2 — org-scope + full parity เสร็จ+verify 2026-07-19 (commit 1be4d48 + 137f99f):**
> - `scripts/migration/calling-org-scope.sql` (dry-run BEGIN/ROLLBACK ผ่านก่อน → COMMIT, applied localhost) · **prod cutover ต้องรันตอน merge** คู่กับ cache-rename.sql
> - guild_id→org_id in-place 6 ตาราง (calling 5 + **cache_pple_member roster**) · person→users.id 7 คอลัมน์ · `calling_starred.user_discord_id`→`user_id` · 13 FK ใหม่ · person map 100% (14/14, 20/20, 2/2, 1/1) ไม่มี NULL surprise · `cache_pple_event` (campaign=ACT) คง guild-based · roster รับแค่ org_id (created_by/approved_by = user ระบบ NGS ไม่แตะ)
> - code: db/calling 7 ไฟล์ + 17 route + 4 page + 5 component → `getOrgId`/`getEffectiveOrgIdentity`/`scope:'org'`
> - **ปิด global-aggregate hole ครบ:** stats 5 query + `getTotalCallStats` + `getTodayCallCount` + `getCONTACTSCount` + **`getCampaigns`** (เดิมไม่ scope เลยทั้งหมด)
> - `org_members` join → **LATERAL LIMIT 1** 4 จุด (กัน row multiplication จาก per-guild rows — บทเรียน dedup)
> - cutover 3 import script (xlsx/member-csv/seed-contacts) เขียน org_id · docs `link-ngs` 1 query
> - **verify live:** magic MRSJAN org8 guildless + เปิด calling ชั่วคราว → `/calling` `/calling/contacts` `/calling/campaigns` = **200** · campaigns/contacts/stats = ว่างทั้งหมด **ไม่ leak PPLE** (68 event / 590 contact / 5203 log) · data ครบไม่หาย · revert config org8 กลับ `["finance"]` แล้ว
> - 🐛 bug ที่ transform สร้างเอง แล้วเก็บใน 137f99f: `/api/calling/users` ส่ง orgId เข้า `om.guild_id` · picker chain ยังใช้ discord_id ทั้งที่ `assigned_to`=users.id · `createContact` key mismatch · ownership พังเงียบ 2 จุด (ContactModal prop / RecordCallModal `called_by`)
>
> **✅ Phase 3 — เทสจริงในเบราว์เซอร์ (write path) เสร็จ 2026-07-20 (Playwright กดจริง + assert DB):**
> - **วิธีเข้า org 1 แบบมี discordId:** ใส่ email จริงให้ `users.id=1` (เดิมว่าง) → magic-link login → auth เติม `discordId` จาก users ให้เอง = session เทียบเท่า Discord OAuth ทุกประการ (`{userId:1, discordId:1098…, isSuperAdmin:true}`) · ลบ users 17518 (shell row email เดียวกัน invited ค้างจาก org 8) ทิ้งก่อน · **harness ต้อง mint token ลง `org_login_tokens` ตรงๆ ห้ามยิง `/api/org/auth/magic`** (SMTP จริง → สแปมเมลตัวเอง, bug-033)
> - **ผ่านหมด:** star toggle (org_id=1/user_id=1/member, กดซ้ำลบคืน) · record call ฝั่ง member (`called_by`=1) · record call ฝั่ง contact (`contact_type=contact`) · assign ผ่าน SplitModal ทั้ง member และ contact (POST ส่ง `assigned_to`=users.id, DB `1|1|1|member` / `…|contact`) · create/edit/delete contact (`created_by`/`updated_by`=1) · sweep 22 route/API = 200 ทั้งหมด · เทสเสร็จลบ test row คืนสภาพ (5203 logs / 8 stars เท่าเดิม)
> - **🐛 เจอบั๊กจริง 4 ตัวที่ curl ไม่เจอ — แก้แล้ว (bug-029…032):** `COALESCE(assigned_to,'')` บน INT → **500 ทั้งหน้า assignments** · `assigned_to = $n` (text param) → `operator does not exist: integer = text` · **contacts.js 3 ฟังก์ชัน campaign-scope ตกหล่นจาก migration** ยังใช้ `process.env.GUILD_ID` เป็น org_id → 500 · client `usersMap` key ด้วย discord_id แต่ `assigned_to` เป็น users.id → โชว์เลข id + ลิงก์ Discord พัง
>
> - **✅ ownership (non-admin) เทสแล้ว 2026-07-20:** สร้าง test user `zztest.owner@localhost` (users 17559, org_members org 1, `web_roles=province_coordinator` — **ยังอยู่ใน DB localhost** ใช้ซ้ำได้/ลบทิ้งได้) → บันทึกการโทรได้ `called_by`=17559 · `PATCH /api/calling/logs` แก้ log ตัวเอง = 200 DB เปลี่ยนจริง · แก้ log ของ user 1 = **403** ไม่ถูกแตะ · `DELETE` ไม่มี permission `deleteLog` = **403** → ownership เทียบ users.id ถูกจริง ไม่ใช่ผ่านทางลัด admin
>
> **⬜ เหลือของ calling:**
> - **✅ แก้แล้ว 2026-07-21 (bug-034): email member ของ org ที่มี guild เข้า feature ไม่ได้เลย (404 ทุกหน้า)** — `featureGate.enabledFeaturesFor` ตกสาขา `getEnabledFeatures(getGuildId)` แต่ email user ได้ `getGuildId=null` (seam 2026-07-18) → features ว่าง → 404 ทั้งที่ API ตัวเดียวกันปล่อยผ่าน (incoherent) · **fix:** org มี guild + ไม่มี guildId → ใช้ config ของ **guild หลักของ org** (prefer `env.GUILD_ID` เหมือน dual-write ของ switcher) · verify: email member org 1 = 200 ทุกหน้า เห็น data org 1 · **ไม่ regress** — MRSJAN org 8 (guildless) ยัง 404 calling/docs + 200 finance · Discord user 200 เหมือนเดิม · หมายเหตุ: docs ยัง guild-scoped → email user เปิดได้แต่ query ด้วย guildId=null = ว่าง (ไม่ leak) ค่อยจัดตอน docs→org
> - `manageContacts` มี role set เท่ากับ `viewCalling` เป๊ะ → ใครเห็นหน้า contacts ก็ manage ได้ทั้งหมด → **ownership branch ของ contact (`created_by===userId`) เป็น dead code ในทางปฏิบัติ** · ถ้าตั้งใจให้มี "คนสร้าง contact ได้แต่แก้ได้เฉพาะของตัวเอง" ต้องแยก permission ก่อน
> - `calling` อยู่ทั้ง `ORG_FEATURES` และ enabled_features ต่อ guild (`/bot/features`) → ตอนนี้ requireFeature org-aware แยกทางให้แล้ว แต่ควรรวมทางเดียวตอน endgame
> - `calling_assignments.org_id` อยู่ **ท้ายตาราง** (ตารางอื่น org_id อยู่หน้า) — ผิด convention เล็กน้อย ไว้จัดตอน cutover
> - `calling` อยู่ทั้ง `ORG_FEATURES` และ enabled_features ต่อ guild (`/bot/features`) → ตอนนี้ requireFeature org-aware แยกทางให้แล้ว แต่ควรรวมทางเดียวตอน endgame
>
> **(อ้างอิง) scrutinize findings ที่ทำครบแล้ว:**
> - `+org_id` 6 ตาราง: calling_logs/assignments/member_tiers/contacts/starred + **cache_pple_member (roster)** · backfill=orgIdOfGuild · in-place type-convert แบบ finance (pg_temp `_g2o`/`_d2u`) → ไฟล์ `calling-org-scope.sql` (mirror finance-org-scope.sql)
> - person→users.id: `called_by`/`assigned_to`/`assigned_by`/`override_by`/`created_by`/`updated_by`/`user_discord_id` · ⚠️ **roster รับแค่ org_id — ห้ามแตะ created_by/approved_by ของมัน** (นั่น user ของ NGS ภายนอก)
> - `cache_pple_event` (campaigns) **คง guild-based** (ACT/Discord artifact)
> - **scrutinize findings ที่ต้องทำ (ไม่งั้น org-native ไม่จริง):**
>   1. person conversion มี consumer เดียว = [logs/route.js:96](web/app/api/calling/logs/route.js#L96) `called_by !== session.user.discordId` → **flip เป็น userId** (ไม่งั้น ownership พังเงียบ)
>   2. rewire 3 จุดให้ guildless เข้า calling ได้: (a) เพิ่ม `calling` ใน `ORG_FEATURES`/getOrgEnabledFeatures (b) ปลด/แก้ bug-025 guildless guard ที่ /calling (c) [stats/route.js:12](web/app/api/calling/stats/route.js#L12) auth `!discordId`→ userId-based
>   3. **contact_type landmine:** ทุก query ที่เติม `WHERE org_id` ต้อง **AND** contact_type ไม่ใช่แทนที่ (source_id≥55 overlap contact.id)
> - scope ทุก query + **ปิด stats global-aggregate hole** · client scope=org (3 หน้าเหมือน finance) · cutover 2 import script เขียน org_id
> - honest scope: data 100% org 1 → payoff = ปิด stats hole + วางราง · justify = ทำตอน calling เล็กถูกกว่าทีหลัง

#### 🚪 ORG-SWITCHER SPINE — งานถัดไป (grill design เคาะ 2026-07-17 · = "ประตูเลือกองค์กร" + สิทธิ์แบบ org-keyed · เป็นหัวใจ ทำก่อน feature อื่น)
> เหตุ: ตอนนี้ finance เทสจริงไม่ได้เพราะเข้าได้ทางเดียว (Discord→org 1). ต้องมี spine นี้ก่อน guildless org (MRSJAN) ถึงเข้า finance ได้ + เป็น harness ให้ calling/docs/cases ต่อไป

**Design ที่เคาะแล้ว (org-access + appointment):**
1. **สิทธิ์ระดับ org = union `roles` + `web_roles` ของทุกแถว `org_members` ใน org นั้น** (คน Discord→`roles`, คนเว็บ→`web_roles`, org หลาย guild→รวมทุกแถว) · ภาษากลาง = `permission` (`org_roles` key); `dc_guild_roles.permission` แปลง role_name→permission, web_roles เก็บ permission key ตรงๆ
2. **ห้ามก๊อป `roles`→`web_roles` เป็น data** (ดริฟต์+clobber ตอน Discord sync) — สัมพันธ์กันผ่าน `permission` ไม่ใช่สำเนาซ้ำ
3. **แต่งตั้งยศ = propagate ตอน action ไม่ใช่ mirror column:** คน Discord→หน้าเว็บสั่ง **Discord role จริง** (เลือกชื่อ role ตรงๆ) →บอท sync ลง `roles` (มีบางส่วนแล้ว) · คน email→เขียน `web_roles` (permission key) · 2 ทาง (เว็บ↔Discord) sync ผ่าน action จริง = ไม่ดริฟต์ · ข้อจำกัด: คนไม่อยู่ Discord→อยู่แค่ web_roles (ถูกต้อง) · บอทต้องรัน+role สูงกว่า
4. **`position` (ตำแหน่งแสดง) ≠ `permission` (สิทธิ์):** รองเลขาธิการ vs ผู้ประสานงานภาค = position ต่าง แต่ permission เท่ากัน → **ไม่ต้องเพิ่ม permission ใหม่** (แก้ปัญหา 1-permission-2-role: คนแต่งตั้งชี้ role เจาะจงเอง ระบบไม่เดา)
5. **อำนาจแต่งตั้ง = governance ต่อ org (config ได้ ไม่ hardcode)** · ⚠️ ตอนนี้ `moderator` แต่งตั้งได้ทุกคน = escalation hole (mod ตั้งตัวเองเป็น admin ได้) ต้องปิด · **floor บังคับเสมอ: แต่งตั้งไม่เกินอำนาจตัวเอง**

**ต้อง grill/สร้างต่อ:** getEffectiveIdentity เปลี่ยนเป็น org-keyed (union ข้าม guild ใน org) · guildless org resolve จาก web_roles ตรงๆ · UI switcher อ่าน listUserOrgs · หน้าแต่งตั้ง (gate + floor + org-config)
> ⚠️ **บทเรียน per-guild dedup (2026-07-17):** `org_members` เป็น per-guild → org หลาย guild (org 1 = 3) ให้ user คนเดียวมีหลายแถว · query ระดับ org ที่ทำ list ต้อง dedupe (GROUP BY / DISTINCT ON user_id) — เจอแล้วแก้: listUserOrgs, listOrgMembers, activeOwnerCount · **ตอนทำ ② หน้าแต่งตั้ง: `/admin/roles` (admin/roles/route.js) ที่ list สมาชิก+roles ต้อง dedup per-guild เหมือนกัน**

**✅ SPINE CORE เสร็จ+verify 2026-07-17 (org-core, ยังไม่ commit) — ①③④ + Finding A:**
- **① org-first switcher:** `getOrgId` = `resolveActiveOrg(userId).activeOrg.id` (org-first, cookie `active_org`) แทน `orgIdOfGuild(getGuildId)` → guildless org (MRSJAN org 8) เข้า finance ได้ · Nav อ่าน `orgs` (listUserOrgs) จริงแทน grouping guilds (ของเดิม fake — เห็นเฉพาะ guild) · layout.js feed orgs/activeOrgId ทุก session ที่มี userId (ไม่ใช่แค่ discordId) · switch route `/api/org/orgs/switch` **dual-write** `selected_guild`=guild หลักของ org (prefer env.GUILD_ID) → guild-based features (calling/docs/cases/bot) align กับ active_org เสมอ · `getGuildId` ไม่แตะ (blast radius 0)
- **Finding B (guildless gating):** org ไม่มี guild → `enabledFeatures=['finance']` (ORG_NATIVE_FEATURES), Nav ซ่อน app guild-based (เหลือ home+finance) · เดิม email user ตกลง env.GUILD_ID = incoherent
- **Finding A (owner=superuser):** `getEffectiveOrgIdentity` — row `role='owner' AND status='active'` → `permissions.add('admin')` (bounded org ตัวเอง, Slack/Notion model) · verify: ทั้ง DB มี 1 row trigger (MRSJAN), org 1 = 0 → ไม่ elevate ใคร · แก้ deadlock self-serve owner ไม่มีสิทธิ์
- **③ client access org-aware:** `/api/me/access?scope=org` → getEffectiveOrgIdentity · `useEffectiveRoles(session,{scope:'org'})` · finance 3 client page (accounts/transactions/categories) ใช้ scope=org · feature อื่นคง guild-based
- **④ เคาะ: ไม่ flip getEffectiveIdentity ทั้งระบบ** — ~50 route ยัง guild_id-scoped, flip access เป็น org-union = elevation (permission guild A ทำ guild B ใน org 1 = prod) · orgAccess finance-only, revisit ต่อ feature ตอน migrate
- verify: node --check ครบ + dev curl (/=200, /finance=307, /finance/accounts=200, me/access?scope=org=401 auth, switch=401) ไม่มี 500 + SQL assert owner-superuser + finance isolation (org8=0 acct, org1=11)
- **✅ LIVE LOGIN-FLOW TEST ผ่าน 2026-07-17 (session จริง via curl):** mint magic token MRSJAN → credentials sign-in → session {userId:17516,discordId:null} · /api/me/access?scope=org = `{isMember:true, permissions:['admin']}` (owner-superuser ทำงาน) · switch org 8 → active_org=8, selected_guild **ไม่** เขียน (guildless ✓) · finance accounts = `[]` (org 8 scoped, org 1 มี 11 = isolated) · create account → org_id=8 ✓
  - 🔴 **เจอ + ปิด cross-tenant write hole (bug-383):** `POST /api/finance/accounts` line 31 `isAdmin && data.org_id` → owner=superuser ทำให้ MRSJAN ส่ง `org_id:1` เขียนเข้า org 1 ได้ (พิสูจน์แล้ว) · เหตุ: leftover admin guild-picker (ลบ UI แล้วแต่ server ยัง trust) · fix: scope=ORG_ID เสมอ, ลบ override+isAdmin import · re-test: attack org_id:1 → ลง org 8 ✓
- ✅ **② หน้าแต่งตั้ง เสร็จ 2026-07-17** (org-core, commit ต่อจาก 02df5ac) — 3 เฟส:
  - **A (backend infra):** `org_config` KV table (org_id,key,value) + `db/orgConfig.js` (`getAppointPolicy` default `[admin,secretary_general]`) · migration ใน `identity-refactor.sql` · ⚠️ **ไม่รีเนม dc_guild_config** (41/42 key เป็น Discord artifact — channel/msg/role — คง guild-keyed) · org_config = ของ org (รองรับ guildless)
  - **B (API `/api/org/appoint`):** GATE = owner(เสมอ) หรือ permission ∈ appoint_policy (`getEffectiveOrgIdentity`) · **FLOOR = capability-subset** (`canAppoint` ใน permissions.js: caps ของ role เป้าหมาย ⊆ caps ผู้แต่งตั้ง → "แต่งตั้งไม่เกินตัว" · admin ห้าม web-grant · ปิดรู mod→treasurer) · Discord→role จริง+write-through roles / email→web_roles · audit · dedup per-guild
  - **C (UI hub):** `/org/settings` เป็น hub มี sub-nav (nested route `layout.js` + `OrgSettingsNav`) — **ทั่วไป** (`/org/settings` ชื่อ org) · **สมาชิก & บทบาท** (`/org/settings/members`: Section A ทีมงาน+invite+search membership / Section B แต่งตั้ง permission role chips, gated ด้วย appoint probe, ชิปจางถ้าเกิน floor) · ลบ OrgSettings.jsx เก่า
  - **verify:** floor unit 9/9 · authed curl (owner MRSJAN → grant treasurer→web_roles / admin=400 / revoke=ว่าง) · SSR /org/settings/members = 200 ไม่ 500 · gate 401/403
  - ⬜ **ยังไม่กดจริงในเบราว์เซอร์** (tab switch, chip toggle UI, probe แสดง Section B หลัง hydrate)
  - ✅ **org-config governance UI เสร็จ 2026-07-18** — `AppointPolicy.jsx` (owner-only, chips เลือกบทบาทที่แต่งตั้งได้) + `GET/PUT /api/org/orgs/[id]/appoint-policy` (กรอง admin/นอก catalog ออก, [] = owner-only ตั้งใจ) · gate appoint เพิ่ม `admin` god-mode เสมอ · getAppointPolicy respect [] · verify authed curl GET/PUT/filter ✓
- [x] **feature-toggle (org-native) เสร็จ 2026-07-18** (org-core) — `lib/orgFeatures.js` (registry `ORG_FEATURES` + `getOrgEnabledFeatures` จาก org_config key `enabled_features`, default=all, [] ตั้งใจได้) · tab **ฟีเจอร์** `/org/settings/features` (OrgFeatures toggle switches, owner) · API `GET/PUT /api/org/orgs/[id]/features` (กรองนอก registry) · layout guildless branch อ่าน getOrgEnabledFeatures แทน hardcode `['finance']` → **คุม Nav app tabs/links จริง** (verify: PUT []→GET / nav gate)
  - ⚠️ **thin ตอนนี้:** org-native มี finance ตัวเดียว · guild features (calling/docs/cases/media) ยังเปิดปิด per-guild ที่ `/bot/features` (ถูกต้อง — Discord config) · เพิ่ม feature org-native ใหม่ = เพิ่มใน `ORG_FEATURES` โผล่เอง
  - [x] **home org-scope เสร็จ 2026-07-18** (org-core) — `app/page.js` branch org-first (mirror layout.js): resolve `resolveActiveOrg` → `guildsOfOrg`. **guildless org** (MRSJAN org 8) → org-native dashboard: profile (org icon+ชื่อ+email) + FinanceCard (org-scoped อยู่แล้วผ่าน getFINANCESummary/getOrgId) gated ด้วย `getOrgEnabledFeatures` + การ์ดสมาชิกองค์กร (member_count จาก resolveActiveOrg) → `/org/settings/members` + ปุ่มไป `/org/settings` · **ซ่อน** Discord-bot/guild-list + REST-API integrations (PPLE-global) · **guild org (PPLE org 1) คงเดิมทุกอย่าง** (ตกไป guild dashboard เดิม) · guard: Discord user ที่ไม่มี org row → fall-through guild dashboard (ไม่ regress) · email user ไม่มี org → prompt สร้างองค์กร · extract `FinanceCard`/`OrgIcon` component (pure JSX move) · verify: build + curl magic-login MRSJAN→switch org8→home 200 มี members/settings/finance ไม่มี CALLING/REST/Discord-bot leak · ⬜ org 1 guild path ยังไม่ curl-test (ต้อง Discord session — เทสจริงในเบราว์เซอร์) · ⬜ i18n (string ไทย hardcode ตาม convention ไฟล์เดิม)

- ✅ **BROWSER SMOKE-TEST spine เสร็จ 2026-07-18** (Playwright headless + inject MRSJAN session org 8, localhost) — **ทุกหน้า render + nav ผ่าน ไม่เจอ bug ใหม่:** home org 8 (org-native, ไม่มี PPLE leak) · org switcher dropdown (email+MRSJAN✓+สร้าง/จัดการ/โปรไฟล์/ออก) · /org/settings (ไอคอน preview+อีโมจิ+อัปโหลด+ชื่อ) · /org/settings/members (sidebar nav แนวตั้ง, ทีมงาน owner+invited, chips แต่งตั้ง, AppointPolicy) · /org/settings/features · ไม่มี console/4xx error จริง
  - 🐛 **fix: OrgFeatures toggle switch เพี้ยน** (knob ล้นนอกราง) — [bug-023] knob span ไม่มี `left-0.5` (ใช้ translate-x-0.5) → `<button>` padding ดัน absolute · fix match sibling `bot/features` (`left-0.5` + off=no-translate) · **verify ด้วยตา: knob อยู่ในรางพอดี ✓**
  - ✅ **INTERACTIVE WRITE-ACTIONS เทสครบ 2026-07-18** (Playwright กดจริง + DB assert ทุกขา, mutate org 8 แล้ว revert): emoji icon ✓ (fail แรก = hydration race ตอน dev first-compile ไม่ใช่ bug — retest หน้า warm ผ่าน) · upload icon ✓ · ลบไอคอน ✓ · **chip แต่งตั้ง grant→web_roles=secretary_general + revoke→ว่าง ✓** · **feature toggle off→FinanceCard หาย/on→กลับมา ✓** (DB PUT ทั้งคู่) · **create org + switch ไปกลับ ✓** (TESTORG_DEL org 12 — ลบทิ้งแล้ว) · ไม่เจอ product bug ใหม่
    - 📝 minor: removeIcon ไม่ unlink ไฟล์บน disk (`public/uploads/org/` orphan สะสม) — จิ๋ว ไว้กวาดตอน endgame
- ✅ **ORG-SCOPE SEAM AUDIT + fix cross-tenant leak 2026-07-18** (org-core) — audit ทุก page/route ที่ guildless org (email user, discordId null) เปิด URL guild-feature ตรงๆ:
  - 🔴 **[bug-024] leak จริง: `/calling`** — guildless เห็น PPLE aggregate stats (5,166 member / 5,056 contact / campaigns) · root: [guildContext.js:18](web/lib/guildContext.js#L18) `if(!discordId) return env.GUILD_ID` → email user ตกไป PPLE guild + calling guard แค่ `if(!session)` (docs/case block ด้วย permission gate, calling ลืม) · **fix: เพิ่ม guildless guard** (getOrgId→guildsOfOrg, []→redirect) แบบ home · verify guildless=307/PPLE ผ่าน · severity ต่ำ (aggregate ไม่ใช่ PII, ราย-record API 401)
  - ✅ ปลอดภัยแล้ว (ไม่ leak data): `/admin/roles` `/bot/features` `/bot/media/basket` = client-gate "ไม่มีสิทธิ์" + **API 403** (shell เปล่า) · `/docs` `/case/manage` = 307 block · `/calling/contacts` = client component + API 401 · `/case` `/case/new` = public intake (ตั้งใจ)
  - ✅ **SYSTEMIC SEAM เสร็จ+verify+commit 4e8b6bb 2026-07-18 (org-core) — เคาะ ก (org-derived) → impl 1-liner หลัง scrutinize:**
    - **root fix [guildContext.js:18]:** `if(!discordId) return userId ? null : fallback` — email user (มี userId ไม่มี discordId) → **null** (guildless, ไม่ผูก guild) · unauth/degenerate → คง `env.GUILD_ID` เดิม · Discord user ไม่แตะ (blast=0) · scrutinize เคาะ **ไม่ทำ org-derived machinery** (guildsOfOrg) เพราะ payoff=0 วันนี้ (0 email user ใน guild-backed org + [getEffectiveRoles.js:31] block web_roles-by-userId อยู่ดี) → upgrade org-derived คู่กับ getRealRoles fix
    - **seam ทำให้ 2 consumer แตก → แก้ด้วย:** ① **requireFeature → org-aware** ([featureGate.js] mirror layout.js: guildless→`getOrgEnabledFeatures`, guild org→`getEnabledFeatures(getGuildId)` เดิม) เพราะ finance (org-native) เคยผ่าน gate ได้เพราะ fallback→PPLE บังเอิญ · หลัง seam=null → finance 404 ผิด → org-aware แก้ (guild org ไม่เปลี่ยนพฤติกรรม) · ② **calling guard คืน** (getMembersCount/getTotalCallStats = **global aggregate ไม่ scope guild**) → guildless layout 404 แล้วแต่ page render พร้อมกันฝัง stats ใน RSC payload ของ 404 → early redirect กัน query รัน [bug-025]
    - **verify live (magic MRSJAN org8 guildless):** /calling=404 no-leak ✓ · /finance=200 org-isolated 0 acct ✓ · /docs=404 ✓ · guild org 1 config=`[finance,calling,docs,...]` → guild path byte-identical (browser confirm ยังค้างเหมือนเดิม — ต้อง Discord session)
    - ℹ️ org 11 (ราชบุรี) ก็ guildless → ได้ org-native finance ด้วยอัตโนมัติ
    - ⬜ follow-up: getRealRoles โหลด web_roles ด้วย userId (เปิด email member ของ guild-backed org) → แล้วค่อย upgrade getGuildId เป็น org-derived

**🎨 Org switcher DRAFT (2026-07-17) — Notion/AppFlowy style · `components/OrgSwitcherMenu.jsx`:**
- เมนู workspace hub: email header + org list (member_count + ✓) + สร้าง workspace + จัดการ/โปรไฟล์/ออก · เปิดได้เสมอแม้ org เดียว · icon ตัวหน้า = กลับหน้าแรก `/`, ชื่อ+chevron = เปิดเมนู
- เอา app tabs ออกจาก topbar (เบียดกัน) → เข้าถึงผ่าน hamburger + การ์ด dashboard · title = **Platfor.ORG** (layout.js metadata)
- [x] **org icon เสร็จ 2026-07-17** (org-core) — org มี icon ของตัวเอง (emoji หรือรูปอัปโหลด) ไม่ยืม guild:
  1. ✅ `orgs.icon TEXT` (migration ใน identity-refactor.sql) — emoji string หรือ url `/uploads/org/xxx`
  2. ✅ `/org/settings` (ทั่วไป, OrgGeneral): preview + ช่องอีโมจิ + อัปโหลดรูป + ลบไอคอน · owner เท่านั้น · upload route `POST /api/org/orgs/[id]/icon` gate ด้วย **org-owner** (ไม่ใช่ discordId — email owner ใช้ได้) · emoji ผ่าน PATCH `/api/org/orgs/[id]` (icon)
  3. ✅ `OrgAvatar` (OrgSwitcherMenu): fallback `org.icon`(รูป→img / emoji→text) → `iconUrl`(guild) → letter · `isImgSrc` detect path
  4. ✅ listUserOrgs + getOrg คืน icon (+ `setOrgIcon` ใน db) · verify: emoji/upload/remove authed curl ✓ + SSR 200
  - ⬜ ยังไม่กดจริงในเบราว์เซอร์ · prod: `public/uploads/org/` route mkdir เอง (nginx `/uploads` block มีแล้ว)
- [x] **i18n เสร็จ 2026-07-19** (ns `org` ใหม่ 111 keys, 13 sub-ns) — migrate 12 ไฟล์ org UI ครบ (Sonnet 4 ก้อน, Opus ตรวจ+render authed ทุกหน้า): OrgGeneral/Features/AppointPolicy · OrgMembers/SettingsNav · OrgSwitcherMenu(ลบ const T)/OrgHome(→async server)/CreateModal · OrgShell/NewOrgForm/login/personal/verify · th=en 111/111 · residual Thai เหลือแค่ comment · **defer: metadata `title` 5 หน้า** (browser tab — ทั้งแอป finance/calling ก็ hardcode → ทำรวมทีเดียวตอนหลัง ไม่งั้น inconsistent)
- [ ] เทสจริงในเบราว์เซอร์ (dropdown เปิด/สลับ/สร้าง/ออก) — curl เทส trigger+data แล้ว dropdown เป็น client-only

- [x] Portfolio consult (web page) เสร็จ — `web/app/tee/portfolio/` (เนื้อหาใน data/portfolio.json แก้เอง) + artifact · รอ deploy prod ให้ขึ้น pplevolunteers.org/tee/portfolio
- ⚠️ **org-core ยังไม่ merge เข้า master** (prod = master `2e81e6e` guild-based, ไม่แตะ) · deploy org = merge org-core→master เมื่อ org เสร็จ · **ก่อน deploy prod:** รัน migration.sql (rename orgs/user_identities + dc_members email/nullable + org_roles + web_roles) + `identity-split-expand.sql` · tag ของเก่า `layout-guild-v1`

---

## 🍳 /cooking — UI/UX ปรับปรุง (จดไว้ 2026-07-11) — ✅ เขียนโค้ดเสร็จ + เทสเบราว์เซอร์ผ่านแล้ว (2026-07-14) รอ commit + deploy

- [ ] **ตอนแยก personal apps ออกไป domain ตัวเอง → เปลี่ยน image serving เป็น API route** (จดไว้ 2026-07-14) — ตอนนี้ cooking + finance upload เขียนลง `public/uploads/` แล้วเสิร์ฟผ่าน **nginx block** (`location ^~ /uploads/` บน prod — ดู DEPLOYMENT.md) ซึ่งผูกกับ server config · ตอนยกเว็บออก ให้เปลี่ยนไปเสิร์ฟผ่าน **API route อ่าน disk สด** แบบ `media-temp`/`docs`/`case` (route `/api/cooking/media/[filename]` + เปลี่ยน URL ที่ upload คืน + จุดแสดงรูป result card/คลังเมนู/preview) → **self-contained ใน repo, ยกออกไม่ต้อง config nginx, dev=prod เหมือนกัน** · แล้วลบ nginx /uploads block ทิ้งได้ · เหตุผลเลือกตอนนี้ยังใช้ nginx (เร็ว/เบา/ทำเสร็จแล้ว) แต่ตอนแยกออก portability คุ้มกว่า

> spec หลัก: `md/cooking/COOKING.md` · 2 Sonnet subagent เขียน 2026-07-11 · build ผ่าน ยังไม่ commit ยังไม่เปิดจริงในเบราว์เซอร์

- [x] **เพิ่มของในครัว — ตัด dropdown เลือกหมวดหมู่** → single-add เรียก AI (`guessGroupViaAI` → `/api/cooking/ingredients/bulk` ส่ง 1 รายการ) เดาหมวดให้ · fallback `seasoning` · bulk-confirm ยังส่ง grp เอง bypass AI
- [x] **ย้ายแก้ไข/ลบ ingredient ไปหน้าใหม่ `/cooking/ingredients`** — chip ในหน้า /cooking เหลือแค่แตะสลับมี/หมด · หน้าใหม่ = CRUD wiki (group 5 หมวด, modal add/edit, delete + คำเตือน gate เมนู) `IngredientsClient.jsx` · ลิงก์ "จัดการวัตถุดิบ →" ที่หัวการ์ดของในครัว
- [x] **ฟอนต์ chip ใหญ่ขึ้น** — `text-sm` → `text-base`
- [x] **ปุ่มแก้ไขเมนู ที่การ์ดผลสุ่ม** — เปิด `MenuForm` (mode edit) modal · `handleMenuSaved` อัพเดตทั้ง menus + result.main ทันที
- [x] **อัพโหลดรูปเมนูจริง** — route ใหม่ `POST /api/cooking/upload` (login-gated, mime jpeg/png/webp, ≤5MB, เขียน `web/public/uploads/cooking/{uuid}.ext` คืน url) · MenuForm เพิ่ม file input + preview thumbnail (คงช่องวาง URL เดิมไว้ด้วย)

- [x] **เทสเบราว์เซอร์ครบทุก flow** (2026-07-14) — ไม่เจอปัญหา

**เหลือ:** (1) commit (2) deploy prod — ต้อง `mkdir web/public/uploads/cooking` บน prod (dir เปล่า git ไม่ track) ให้สิทธิ์ www เขียนได้

- [ ] **อนิเมชันตอนกดสุ่มแบบ slot machine จริงจัง** (parked 2026-07-11) — ตอนนี้มี spin ง่ายๆ อยู่แล้ว (`spinning`/`reel` ใน CookingClient สุ่มโชว์ emoji+ชื่อสลับ, decelerate ~2.3s + animation cookslot) → อยากได้แบบสล็อตจริง (รีลหมุนแนวตั้ง, เสียง/สั่นได้)

### 🎯 ส่ง Sonnet ทำเสร็จแล้ว (commit 12-13 ก.ค. — build ผ่าน + เทสเบราว์เซอร์ผ่านแล้ว 2026-07-14)

- [x] **Combobox วัตถุดิบหลัก/เสริม + รสชาติ** — `ComboTagInput` (autocomplete dropdown + free-add ด้วย Enter) · core/optional เป็น array แล้ว · suggestion: วัตถุดิบ→`/api/cooking/ingredients` · รสชาติ→รส distinct · reuse 3 จุด
- [x] **MenuForm → autosave ทั้งฟอร์ม เอาปุ่ม "บันทึก" ออก** — `idRef`/`savingRef`/`pendingRef` guard กัน double-create · `patchNow` (event ชัด: tag/chip/อัปโหลดรูป) vs `patchDebounced` ~1s (พิมพ์: ชื่อ/ขั้นตอน) · add-mode create-on-first-edit · ชื่อว่างไม่เซฟ · `SaveIndicator` บอกสถานะ
- [x] **protein gate derive จาก wiki** — `getProteinEnum()` query `grp='protein'` สดทุก request (gates-suggest + import) · fallback `PROTEIN_ENUM_FALLBACK` · เพิ่มโปรตีน (ไข่/เนื้อวัว) = เพิ่มวัตถุดิบ 1 แถว โผล่เป็น chip + gate + AI รู้จักเอง
- [x] **หมู่อาหาร (food_groups) รวม constant** — `web/lib/cookingConstants.js` (`FOOD_GROUPS`/`FOOD_GROUP_ENUM`) import ร่วม (ไม่ทำ user-extensible ตามที่เคาะ)

**เหลือของทั้งโซน cooking:** (1) เปิดเบราว์เซอร์ทดสอบ combobox/autosave/slot จริง — โดยเฉพาะ add-mode พิมพ์ชื่อใหม่+สลับ chip รัวๆ ต้องไม่ create ซ้ำ (2) deploy prod (git pull + build + restart) — `mkdir web/public/uploads/cooking` + สิทธิ์ www + nginx `/uploads` block (ดู DEPLOYMENT.md)

---

## 📢 Social share → ห้องข่าวสาร + Discord Event — implement เสร็จ local (2026-07-08)

> โค้ดเสร็จ ยังไม่ทดสอบ dev / ยังไม่ deploy · files: `services/newsShare.js`, `handlers/basketHandler.js`, `index.js`, `web/app/bot/platforms/page.js` + guild-configs API

### ⚠️ ก่อน deploy prod
1. ตั้ง `news_channel_id` ต่อ guild — หน้าเว็บ /bot/platforms (การ์ด config) หรือ INSERT `dc_guild_config`
2. ให้สิทธิ์ bot ในห้องข่าวสาร: **Send Messages + Mention Everyone** และระดับ guild: **Manage Events**
3. ทดสอบ dev ก่อน: โพสต์ตะกร้า (เลือก 📢) → กดปุ่ม 📅 → modal (มี channel select — feature ใหม่ discord.js 14.25) → event เกิด + ประกาศเข้าห้องข่าวสาร
4. ทดสอบ quiet hours: สร้าง event หลัง 21:00 → ประกาศต้องเข้าคิว (`dc_guild_config` key `pending_event_announcements`) แล้วส่ง 09:00

### 📝 Design ที่เคาะแล้ว
- 📢 ข่าวสาร = option ใน platform select (default เปิดเมื่อตั้ง config), โพสต์ caption+รูป **ไม่ ping**, ลงทันทีเสมอ (ไม่มี scheduler ฝั่ง bot — FB ตั้งเวลาฝั่ง Meta)
- 📅 Event = ปุ่ม follow-up หลังโพสต์ → modal เดียว (ชื่อ prefill/เริ่ม/จบ default +2 ชม./ห้องประชุม **หรือ** สถานที่ free text — ห้องชนะ) → ประกาศแยกใน ห้องข่าวสาร + **@everyone** template อัตโนมัติ (เชิญชวน+เวลา+สถานที่+กดกระดิ่ง)
- quiet hours 21:00–09:00 ไทย → อั้นประกาศส่ง 09:00 (event ตัวจริงสร้างทันที)

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
- [x] **ปุ่มสีส้ม** — CaseNewForm + CaseManageActions ใช้ `bg-orange`/`bg-brand-orange` แล้ว
- [x] **URL `/case/new/[province]`** — route มีแล้ว (`/case/new` = picker, `/case/new/ราชบุรี` = fix จังหวัด)
- [x] **ถอนตัวจากเคส** (2026-07-14) — ปุ่ม "ถอนตัวจากเคสนี้" + `DELETE /api/case/[ref]/assign` (`removeAssignee`) + audit `case.unassigned`
- [x] **ลิงก์คลิกได้ Discord↔เว็บ** (2026-07-14) — ref ในข้อความ bot เป็นลิงก์ไปหน้า manage (base จาก `guild_config.web_base_url` → fallback `.env WEB_BASE_URL`) · หน้า manage โชว์ชื่อ+ลิงก์กระทู้ Discord
- [x] **รองรับ alias จังหวัด** (2026-07-14) — พิมพ์ "กรุงเทพ/กทม/กรุงเทพฯ" → normalize เป็น "กรุงเทพมหานคร" (`normalizeProvinceName`) ตอน import
- [ ] **Hamburger — เอา 3 เมนูบนออก** — `menuLinks` ซ้ำกับ app switcher → ซ่อนเมื่ออยู่ home/dashboard
- [ ] **Detect location → link จังหวัด** — หน้า `/case` ปุ่ม "ใช้ตำแหน่งของฉัน" → reverse geocode (Nominatim/OSM) → redirect `/case/new/[จังหวัด]`

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

## 🌍 i18n — เว็บ + bot รองรับหลายภาษา (จด 2026-07-09 · วางรางเสร็จ local 2026-07-09)

> string ไทย hardcode อยู่ ~2,500 บรรทัด/201 ไฟล์ (web) + ~1,500 บรรทัด/70 ไฟล์ (bot) · **รางวางแล้ว** — โค้ดใหม่ต้องใช้ t() เสมอ (กติกาใน CLAUDE.md) หนี้จะหยุดโต ของเก่าทยอย migrate

### ✅ รางที่วางแล้ว (ยังไม่ deploy)
- **เว็บ:** next-intl 4.13.1 (ไม่มี locale routing) · locale จาก cookie `locale` default `th` · config: `web/i18n/request.js`, strings: `web/locales/{th,en}.json` · ใช้: `useTranslations` (client) / `getTranslations` (server)
- **Bot:** `services/i18n.js` — `const t = await getT(guildId)` → `t('common.error')` · locale ต่อ guild = `dc_guild_config` key `locale` ผ่าน resolveConfig (guild > global, cache 5 นาที) · strings: `locales/{th,en}.json`
- ไม่ต้อง migrate schema — `dc_guild_config` เป็น key-value อยู่แล้ว

### ⏳ งานที่เหลือ (ทยอยตามสะดวก)
- [x] **finance — เสร็จครบทั้งโซน (2026-07-09)** — ทุกไฟล์ใน `web/app/finance/**` + `web/components/finance/**` migrate แล้ว · dictionary 113 keys th=en ตรงกัน · ทุก route โหลดผ่าน · ใช้ i18n-migrator (Sonnet) 3 ก้อน
  - ⚠️ **ยังไม่ได้แปล:** อาเรย์ `BANKS`/`PROVINCES` ใน `AccountFormFields.jsx` เว้นไว้ตั้งใจ (เป็นข้อมูล domain ผูก DB + financeAccess.js) — ถ้าจะรองรับ en จริงต้องทำ mapping แยก ไม่ใช่แค่ t() → เป็น design decision ทีหลัง
  - shared component ที่ finance ใช้แต่อยู่ `web/components/` (BankBadge, CategorySelect, AccountSelect) — ยังไม่แตะ รอเคาะ namespace กลางตอน migrate โซนที่ใช้ร่วม
- [x] **calling — เสร็จครบทั้งโซน (2026-07-10)** — ทุกไฟล์ `web/app/calling/**` + `web/components/calling/**` migrate แล้ว · `calling` namespace 277 keys th=en · verify ทุก route 200 + i18n สลับ th/en ได้ · ใช้ i18n-migrator (Sonnet) 7 ก้อน
  - ⚠️ follow-up: **gauge labels ในหน้า stats มาจาก `web/app/api/calling/stats/route.js`** (API generate ข้อความไทย server-side) — ไม่ได้อยู่ในไฟล์ UI เลยยังไม่ได้แปล ต้องทำแยกถ้าจะรองรับ en เต็ม
  - ⚠️ follow-up: tooltip ดาว `StarredStar` (calling.starredStar.*) ถ้อยคำต่างจาก `calling.assignee.starTitle/unstarTitle` — พิจารณารวมให้เป็นคำเดียว
- [x] **case — เสร็จครบทั้งโซน (2026-07-14)** — ทั้ง 14 ไฟล์ `web/app/case/**` + `web/components/case/**` migrate แล้ว · `case` namespace 140 keys th=en ตรงกัน · build compile ผ่าน + ทุก route verify 200/307 · ใช้ i18n-migrator (Sonnet) 5 ก้อน
  - ⚠️ follow-up: status/action display labels ใน `web/lib/caseOptions.js` (`statusLabel`) + `web/lib/caseOptionsClient.js` (`STATUS_LABELS`) ยัง hardcode ไทย — เป็น lookup keyed ด้วย DB enum value ไม่ได้อยู่ในไฟล์ UI เลยยังไม่แตะ ต้องทำ mapping แยกถ้าจะรองรับ en เต็ม
  - ⚠️ เว้นตั้งใจ: `CASE_CLOSE_REASONS` values (เก็บลง DB ตรงๆ) + province data list = domain data ผูก DB ไม่แปล
- [ ] Migrate โซนที่เหลือ: **docs, bot pages (`web/app/bot/**`)** + shared components (finance: BankBadge/CategorySelect/AccountSelect; root: LoginPanel/NoGuildNotice ฯลฯ) + **bot จริง (`services/i18n.js`, discord.js embed/handler)** — ใช้ i18n-migrator agent ซอยทีละ 2-3 ไฟล์
- [x] UI เปลี่ยนภาษาบนเว็บ (2026-07-09) — `web/components/LocaleSwitcher.jsx` (ปุ่ม ไทย/EN) วางในเมนู hamburger ถัดจาก dark mode toggle · set cookie `locale` + `router.refresh()`
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

<details><summary>📋 พรอมต์ audit RBAC — copy ทั้งก้อนไปวางใน session ใหม่</summary>

```
ช่วยตรวจ RBAC ของทุกแอปหลัง identity + org-scope refactor ว่ายังทำงานถูกและตรง spec ไหม

## บริบท
repo: pple-volunteers · branch `org-core` (นำ master 71 commit, ยังไม่ deploy) เพิ่งทำ refactor 2 ชั้นซ้อน:

**1. identity split** — `dc_members` (1 คน หลายแถว/guild) ถูกผ่าเป็น
   - `users` = ตัวตน 1 แถว/คน (discord_id, email, google_id, phone, firstname/lastname, id_card_image)
   - `org_members` = membership+profile ต่อ (org, guild) — user_id, org_id, guild_id, roles, web_roles, position, province, bank_*
   - ตารางเดิม rename เป็น `_dc_members` (archive, โค้ดไม่ควรอ้างถึงแล้ว)
   - rename อื่น: organizations→orgs · dc_user_identities→user_identities · ngs_member_cache→cache_pple_member · act_event_cache→cache_pple_event

**2. org-scope** — tenant data เลิกเกาะ guild ย้ายมาเกาะ org:
   - `guild_id`→`org_id`: finance_* · calling_* · cases/case_* · docs_* · audit_logs · cache_pple_member
   - person-ref: discord snowflake (VARCHAR) → `users.id` (INT)
   - **ตั้งใจคง `guild_id`** (Discord artifact ไม่ใช่ tenant data): finance_config · case_config · cache_pple_event · dc_* ทั้งหมด · cases.discord_guild_id

## แหล่งความจริง
1. **DB จริง** — `psql -c "\d <table>"` (ใช้ DB_* ใน .env) · **`md/DATABASE.md` regenerate จาก DB สดเมื่อ 2026-07-21 ครบ 58 ตาราง = เชื่อได้**
2. **โค้ด**
3. **md อื่น** — FINANCE/CALLING/CONTACT/DOCS/CASE กวาดให้ตรง schema แล้ว แต่กวาดเฉพาะ "กลไก" (ชื่อตาราง/คอลัมน์/path) · ส่วน "เจตนา/กฎธุรกิจ" ยังไม่มีใครตรวจ ถ้าเจอว่าเจตนาที่เขียนไว้ขัดกับโค้ด → นั่นแหละคือของที่ตามหา

## ตรวจอะไร — แอปละ 4 ข้อ (finance · calling · docs · cases + /admin/roles)
1. **gate ยังกันได้จริงไหม** — web/lib/{financeAccess,callingAccess,docsAccess,caseAccess,caseGate,orgAccess,roleAccess,permissions,resolveAccess,getEffectiveRoles}.js
2. **ownership เทียบถูกชนิดไหม** — จุดที่เคยเทียบ discord snowflake (string) ตอนนี้ต้องเทียบ users.id (int) · `===` ข้ามชนิดจะ false เงียบๆ = คนถูกล็อกออกจากของตัวเอง หรือหลุดให้คนอื่นเห็น
3. **query scope หลุดไหม** — ทุก SELECT/UPDATE/DELETE บน tenant table ต้องมี org filter · ตอน migrate finance เจอว่า getTransactions เดิมไม่ scope เลย (latent leak) → หาแบบเดียวกันในแอปอื่น
4. **ตกสำรวจจาก bulk rename** — เคยพลาดว่า orgId ไหลเข้าตัวแปร/คอลัมน์ชื่อ guild_id (และกลับกัน) → หาจุดที่ชื่อตัวแปรกับค่าที่ใส่จริงไม่ตรงกัน

**ฝั่งบอทด้วย** — build/test ของเว็บจับบั๊กบอทไม่ได้เลย · ไล่ db/ handlers/ commands/ services/ scripts/ ว่ายังมีที่อ่าน/เขียนตารางหรือคอลัมน์ที่ถูก rename ไปแล้วไหม

## 🎯 เคสที่สงสัยอยู่แล้ว — ช่วยชี้ขาดให้ที
`web/app/api/calling/members/route.js:85-90` — ลิสต์สมาชิกกรองด้วย scope เต็ม (ทุก role `province:` ที่ถือ) แต่การมองเห็นเบอร์/LINE กรองด้วย `session.user.primary_province` ตัวเดียว · และ `primary_province` เป็นฟิลด์ที่ผู้ใช้แก้เองได้จากหน้า /profile
→ มันเป็นการกั้น PDPA จริง หรือเป็นแค่ default การแสดงผลที่หลงเหลือจากยุค "คนละ 1 จังหวัด"? ที่อื่นเขาใช้ `getUserScope(access, primary_province)` แบบเสริม scope ไม่ใช่แทน scope
ถ้าเป็นรูจริง มีที่อื่นพลาดแบบเดียวกันอีกไหม (ฟิลด์ที่ user แก้เองได้ ถูกใช้เป็นตัวกั้นสิทธิ์)

## รู้อยู่แล้ว ไม่ต้องรายงานซ้ำ
- คน login email ยังเปิด /finance ไม่ได้ (page-access รอ unify login door) — ตั้งใจ
- `web_roles` เติมแค่ permission ไม่เติม scopeGrants → คนตั้งยศผ่านเว็บไม่มี "พื้นที่" (resolveAccess.js:78) — รู้แล้ว รอแก้
- `queryPayersByPermission` อ่านแค่ org_members.roles ไม่อ่าน web_roles — รู้แล้ว
- Discord กับ email ไม่ auto-link = คนละแถว users — ตั้งใจ
- `POST /api/docs/projects/[id]/set-payer` โหมด per-group ไม่มี client เรียกแล้ว — รู้แล้ว

## กติกา
- **ถามก่อนแก้เสมอ** — รายงานสิ่งที่เจอ + ความร้ายแรง + ทางแก้ที่เสนอ แล้วรอเคาะ ห้ามแก้เอง
- verify ได้: `cd web && npm test` (~189 tests) · `npm run build` · psql localhost
- .env ห้ามอ่าน ยกเว้น key ที่ขึ้นต้น DB_
- เรียงผลตามความร้ายแรง (ข้อมูลรั่วข้าม org > สิทธิ์เกิน > คนถูกล็อกออกจากของตัวเอง > cosmetic)
```

</details>

---

## 🔗 References

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — Production-grade engineering skills for AI coding agents
