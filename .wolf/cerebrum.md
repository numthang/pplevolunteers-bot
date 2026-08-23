# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-08-19

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->
- **[2026-07-18] org-base migration convention** — ทุกครั้งที่ migrate feature → org (cases/calling/docs ต่อจาก finance): (1) **ต้องบันทึก SQL migration เสมอ** ลง `scripts/migration/identity-refactor.sql` (2) **จัดคอลัมน์ `org_id`/`owner_id` ไว้ข้างหน้า** ด้วย in-place ALTER TYPE USING (+ pg_temp helper fn `_g2o`/`_d2u`) แบบ `finance-org-scope.sql` — **ห้าม** ADD COLUMN ต่อท้ายแล้ว drop เก่า (user เกลียด column กองท้าย)
- **[2026-07-17] Nav ที่จะโต + mobile → sidebar/list แนวตั้ง ไม่ใช่ underline tab แนวนอน** — tab scroll แนวนอนบนมือถือเมื่อเมนูเพิ่ม. settings hub ใช้ pattern GitHub/Notion/Slack: list แนวตั้ง (rounded, active=bg-orange/10) + `md:grid [200px_1fr]` sidebar. user ไม่ชอบ tab (บอกเอง "ไม่ friendly กับ mobile"). อย่า default เป็น horizontal tab สำหรับ nav ที่จะขยาย

- **[2026-07-03] ตอบสั้น** — user บอกตรงๆ ว่าพูดเยอะเกินจนตาลาย: เอาเฉพาะสิ่งที่ต้องทำ/คำตอบตรงคำถาม ตัด context ซ้ำ ตารางเปรียบเทียบ และคำอธิบายที่ไม่ได้ถาม

### User Preferences (2026-07-09 — token saving)

- Fable แพง 2x Opus — user เคาะแล้ว: งาน mechanical ชิ้นใหญ่ให้เสนอ delegate เป็น subagent model:sonnet (บอกก่อนทุกครั้ง), แนะนำ /clear เมื่อเปลี่ยนเรื่อง, เตือนเมื่อ session ยาว — ทำเป็นประจำโดยไม่ต้องรอสั่ง

### User Preferences (2026-07-29 — โมดูลใหม่ต้องใช้ของกลางร่วมกับบอท)

- ฟีเจอร์ใหม่บนเว็บที่ทำงานทับกับบอท (โพสต์โซเชียล/ลายน้ำ/การ์ดคำคม) **ต้องเรียก library เดียวกัน** ไม่ใช่เขียนของตัวเอง — "เวลาจะ bug จะได้แก้ที่เดียว"
- ถ้าต้องยกโค้ดออกมาเป็นของกลาง (เช่น `services/publishPipeline.js` จาก `basketHandler`) **ต้องเปลี่ยนตัวเดิมมาใช้ในรอบเดียวกัน** ห้ามก๊อปแล้วปล่อยของเดิมไว้
- ก่อนเสนอตารางใหม่ ให้ดูก่อนว่าตารางเดิมรับได้ไหม (เช่น ประวัติโพสต์ใช้ `dc_media_history` เดิม ไม่สร้าง `post_publish_history`)

### User Preferences (2026-07-29 — user ท้าทายการแตกตารางเสมอ)

- user จะถามทุกครั้งว่า "ทำไมต้องแยกตาราง รวมกันไม่ได้เหรอ" — **ห้ามตอบด้วยหลัก normalization ลอยๆ** ต้องยกจุดชนที่เป็นรูปธรรม (เช่น gate อนุมัติจะไปบล็อก flow ดิสฯ) ไม่งั้นถือว่าเหตุผลไม่ผ่าน
- ถ้า user ล้มเหตุผลข้อไหนได้ **ให้ยอมทันทีและแก้ของจริง** (เคสลิงก์รีวิว: ผมยกเหตุผลผิด user ล้มถูก → แก้ schema ทันที) แล้วบอกตรงๆ ว่าข้อไหนของเราพัง
- user ชอบให้สรุปว่า "ไอเดียผมถูกกี่ข้อ" แบบไม่เออออ — ระบุชัดว่าข้อไหนถูก ข้อไหนค้านได้ครึ่งเดียว

### User Preferences (2026-07-29 — กติกาตั้งชื่อตาราง)

- **prefix ต้องมีโมดูลจริงรองรับ** — ห้ามเสนอ prefix ลอยๆ ที่ไม่มีโฟลเดอร์/feature key อยู่จริง (เสนอ `media_*` แล้วโดนปฏิเสธด้วยเหตุผลนี้)
- user **ไม่ชอบตารางที่ไม่มี prefix** เลย (เช่น `social_accounts` เปล่าๆ) — ต้องมีเสมอ
- ตารางของกลางที่หลายโมดูลเขียน ให้ใช้ prefix ของโมดูลเจ้าของหลัก + **เขียนคอมเมนต์หัวตารางว่าใครใช้ร่วมบ้าง ห้าม drop ตามโมดูล** (แทนที่จะเลี่ยงไปตั้งชื่อกลางๆ)

### User Preferences (2026-07-30 — อธิบายของนอกสายงานให้สั้นและตอบว่า "จำเป็นไหม")

- user ตอบกลับว่า "R2 มีไว้ทำไมนะ ผมอ่านไม่ทัน ไม่เข้าใจ จำเป็นเหรอ" หลังได้คำอธิบายเชิงเปรียบเทียบยาว
- → เวลาเสนอเทคโนโลยีนอกสายงาน: **1 บรรทัดว่ามันคืออะไร + 1 บรรทัดว่ามีไว้ทำไมในงานนี้ +
  ตอบตรงๆ ว่า "จำเป็นไหม"** ก่อน · ตารางเปรียบเทียบ/ราคาเก็บไว้ทีหลังหรือใส่ใน PENDING

### User Preferences (2026-08-08 — อธิบายเรื่อง auth/DB ให้คนที่ไม่ได้มองเป็นโค้ด)

- User พิมพ์ "งง" / "ไม่รู้เรื่องเลย" / "อะไรวะ" = สัญญาณว่าคำตอบเป็นเชิงเทคนิคเกินไป → ตอบใหม่ด้วยภาพ/อุปมา (เช่น "บัตรประจำตัว 1 ใบ 2 ช่อง: Discord / Email") แล้วให้ **ท่าเดียวที่ต้องทำ** ไม่ใช่หลายทางเลือก
- ห้ามใส่ TEMP TABLE / CTE / สคริปต์หลายชั้นในคำตอบ SQL ที่ user จะเอาไปแปะ DBeaver — user ต้องการ 2-3 บรรทัดตรงๆ ที่แก้เลขเองได้ (โดน "อะไรวะ งง" ตอนให้ `CREATE TEMP TABLE kill`)
- อย่ายกตัวอย่างด้วย id จาก DB local ปนกับงาน prod — user นึกว่ามั่วเลข (2026-08-08) ถ้าจะยกตัวอย่างให้ใช้ `<ใส่ id ตรงนี้>` ไปเลย

### 2026-08-10 — AI per-org BYO-key

- **User Preference:** เวลาเสนอกลไกคุมต้นทุน อย่าเสนอ "สวิตช์ที่ต้องกดเอง" — user ถามทันทีว่า "ยืมไปแล้วใช้ตลอดทำไง" · กลไกที่บังคับตัวเองได้ (โควต้า/หมดอายุ) ชนะสวิตช์เสมอ
- **User Preference:** รายงานยาวๆ แบบ finding list ทำให้ user ตอบว่า "ไม่เข้าใจ" — ต้องแปลเป็นภาษาคน + ยกตัวอย่างรูปธรรม ก่อนถามให้เลือก

### User Preferences (2026-08-12 — หน้า settings: อย่าเพิ่ม "การ์ด config" ใหม่)

- user เห็นการ์ด "การตั้งค่ารายกลุ่ม" ที่ผมทำแล้วบอก **"UI ประหลาดอย่างแรง"** → ของที่เป็น "ปลายทางของกลุ่ม" ต้องวางเป็น **ปุ่มแถวเดียวกับปุ่ม Connect + modal** ไม่ใช่การ์ด config ก้อนใหม่ต่อท้ายหน้า
- user คิดเป็น flow เดียวกับการเชื่อมบัญชี: "+ Discord News" = เพิ่มปลายทางอีกอันให้กลุ่ม (เหมือน Connect Meta/X) — ทั้งโซนองค์กรและโซนส่วนตัว
- **user ท้าทายของที่ซ้ำซ้อนเสมอ** — ผมเสนอคำสั่งบอท `/panel newsroom` user ถามกลับทันทีว่า "ทำไม ในเมื่อ /bot ทำได้อยู่แล้ว" → ถูก ตัดออก · ก่อนเสนอ "ทางเข้าใหม่" ต้องเช็คก่อนว่าทางเข้าเดิมขาดอะไรจริง
- dropdown ที่ยัดตัวเลือกดิบทั้งหมดใช้ไม่ได้กับของจริง — เซิร์ฟราชบุรีมี **76 ห้อง** → ต้องมีกล่องค้นหา + จัดอันดับตัวที่น่าจะใช้ขึ้นก่อน

### User Preferences (2026-08-14 — ชื่อโมดูล)

- **user ชอบชื่อโมดูลที่มีเมตาฟอร์/เล่นคำ** (มี `cooking`, `dojo` อยู่แล้ว) แต่ต้องเป็นคำที่**สื่อความหมายของสิ่งนั้นจริง** ไม่ใช่ชื่อสวยลอยๆ
  ชื่อที่ **ตกรอบแล้ว** สำหรับ PM module — อย่าเสนอซ้ำ: Work *(user บอกไม่คูล)* · Mission · Field · Relay · Atlas · Quest · Rally · Co-op · Swarm · Ops · Board

### User Preferences (2026-08-18 — user คิดเป็น "รูปแบบเดียวจบ" ไม่ใช่ "หน้าเยอะๆ")

- user: *"ทำไมต้องมีซ้ำซ้อน 2 หน้า ผมอยากให้คนคุ้นเคยรูปแบบเดียวจบ"* → ยุบ /kanban กับ /kanban/board เป็นหน้าเดียว
  สิ่งที่ผู้ใช้เลือกกลายเป็น **ปุ่มควบคุม** (แสดง: ของฉัน/ทั้งหมด/กรุ · จัดกลุ่ม: สถานะ/กำหนดส่ง) ไม่ใช่ URL
- **ก่อนเสนอ UI ใหญ่ user ขอ "เห็นภาพ"** — วาด ASCII 3 เฟรม (ของเดิม / บนคอม / บนมือถือ) แล้วถามเช็ค 4 ข้อ
  ได้ผลดีมาก user ตอบ "เอาที่แนะนำมาก่อนเลย" ทันที · ทำแบบนี้อีกเวลาจะรื้อ layout
- ข้อห้ามเดิมในเอกสาร (เช่น "ห้ามให้กระดานกลืนหน้าแรก") **ให้ดูที่เหตุผลเบื้องหลัง** (มือถือ=ปัดแนวนอน)
  ถ้าแก้เหตุผลนั้นได้ที่ layout แล้ว ข้อห้ามก็ไม่ต้องยืนตามตัวอักษร — แต่ต้องจดว่าทำไมถึงเปลี่ยน

### User Preferences (2026-08-18 — user ท้าทายสถาปัตยกรรมเป็นนิสัย ให้ตอบด้วยของจริง)

- user ถามคำถามระดับราก ("ทำไมไม่ยุบ cases/posts เป็น kanban board เลย") — **ห้ามตอบด้วยหลักการลอยๆ** ให้ยกของจริงในโปรเจกต์
  (cases มี SMS/หน้าติดตามสาธารณะ/PII · posts มีคิวเผยแพร่/ลายน้ำ/lock) แล้วชี้ว่าสิ่งที่ยุบได้จริงคือ *หน้าจอ* ไม่ใช่ *ตาราง*
- **"ยังนึกภาพไม่ออก" = ให้วาด ASCII ทันที** ได้ผลทุกครั้งในเซสชันนี้ (ยุบ 2 หน้า · การ์ดที่ผูกโพสต์ · หน้าตั้ง field)
- user จับความไม่สอดคล้องเก่ง — ถ้าเราจะสร้าง 2 กลไกทำเรื่องเดียวกัน (ตาราง URL แยก vs field ชนิด url) เขาจะทักก่อนเสมอ **ให้เช็คเองก่อนเสนอ**

### User Preferences (2026-08-19 — migration: ห้ามทำไฟล์ SQL แยก)

- **user รัน "ทุกอย่างหลัง marker" ใน `scripts/migration/migration.sql` เสมอ** เป็น workflow ประจำ
- ⛔ **ห้ามตัด DDL ที่ค้างออกไปเป็นไฟล์ใหม่** (เคยทำ `pending-2026-08-19.sql` แล้วโดนทัก)
  เหตุผล user: กลายเป็นต้องซิงก์ 2 ที่ แล้วมันหลุดจากกันแน่นอน
- ของที่อยากเพิ่ม (transaction / คำเตือนลำดับ) ให้ **ใส่ไว้ใต้ marker ใน migration.sql เลย**
  ตอนนี้ใต้ marker มี `BEGIN; … COMMIT;` ห่อไว้ + คำเตือนว่าต้อง TRUNCATE ก่อน
- เสร็จแล้วเลื่อน marker ลงมาท้ายไฟล์ + commit (กติกาเดิม)

## Key Learnings

- **Project:** my-discord-bot
- **PG `array_agg(...) FILTER (WHERE ...)` คืน `null` ไม่ใช่ `[]`** เมื่อไม่มีแถวตรง condition → ต้อง `(x || [])` ก่อน `.filter/.map` เสมอ (bug-017)
- **dc_guild_roles แยก permission กับ scope_node คนละ row:** role "ผู้ประสานงานจังหวัด" ถือ permission `province_coordinator` (scope=null), role "ทีมนครปฐม" ถือ `scope:province:นครปฐม` (permission=null) — query หา "member ที่มี permission X + scope ครอบจังหวัด" ต้องแยก 2 ขั้น (has_permission CTE ก่อน แล้ว agg scope ทุก role ทีหลัง) ห้าม filter permission+scope ใน row เดียว
- **regional_coordinator ครอบจังหวัดผ่าน `region:`/`subregion:` scope** → `expandGrants(mode:'finance')` expand region→ทุกจังหวัดในภาค (calling mode ไม่รู้จัก region) — docs payer pool ใช้ finance mode
- **Docs payer source of truth = `docs_activity_entries.payer_discord_id` (ราย entry)** · `docs_projects.payer_discord_id` = **project default payer** (revived 2026-06-24) ตั้งจาก payer dropdown บนสุด → `autoAssignPayers`/`setProjectPayer` อ่านเป็น default · ไม่ dead แล้ว
- **Payer position บน PDF/dropdown = ยศสูงสุดที่ถือ** (`getHighestPositions` ใน payers.js): rank permission secretary_general > regional_coordinator > province_coordinator > district_coordinator → คืน role_name ของ rank สูงสุด (เช่น Jatsada เป็น province_coordinator แต่ถือ "รองเลขาธิการ" regional → แสดง รองเลขาธิการ)
- **Payer UX (เคาะ 2026-06-24):** payer dropdown ระดับโครงการอยู่เหนือ tab สร้างบิล (set ก่อนสร้าง) · ต้องมี eligible payer ≥2 ถึงสร้างบิลได้ (บล็อก <2) · payer==recipient → auto-swap คนถัดไป (ทั้งตอนสร้าง autoAssign/setProjectPayer และตอนแก้ผู้รับใน PATCH entries/[id]) · dropdown override รายกลุ่มใน entry list = ตัวแก้รายเคส

- nextjs-toploader ฟัง click ที่ document โดยไม่เช็ค defaultPrevented — ปุ่มที่อยู่ใน <Link> ต้องใช้ e.nativeEvent.stopImmediatePropagation() (ไม่ใช่ e.stopPropagation()) ไม่งั้น orange progress bar ขึ้นค้าง (bug-275)
- **`dc_members.phone` ไม่ใช่เบอร์ verified เสมอ** — user แก้เองได้จากหน้า profile (PATCH /api/profile allowed list) · อะไรก็ตามที่ใช้เบอร์เป็น identity/credential ต้องเช็ค `phone_verified_at IS NOT NULL` (เพิ่ม 2026-07-05, verifyHandler เซ็ต / profile PATCH reset) · หมายเหตุ: `member_id` ก็อยู่ใน allowed list เดียวกัน — แก้เองได้เหมือนกัน ยังไม่ได้ปิด
- **Web login provider ใหม่ (credentials/nonce)** — ต้องแตะ 2 จุดใน auth-options.js เสมอ: เพิ่ม CredentialsProvider (ใช้ helper `nonceAuthorize(key)`) **และ** เพิ่ม provider id ใน jwt callback branch ที่อ่าน `user.discordId` — ลืมจุดหลัง = login ผ่านแต่ session ไม่มี discordId (พังเงียบ)
- **Endpoint สาธารณะที่รับเบอร์โทร ต้องตอบ generic เหมือนกันทุกกรณี** (ไม่เจอ/quota/cooldown/SMS fail) — กัน enumeration รายชื่อสมาชิก (org movement = รายชื่อ sensitive) · pattern อยู่ที่ /api/auth/phone/request
- **ngs_member_cache ทั้งหมด (4,488 รายชื่อ รวมชุดราชบุรี) อยู่ใต้ guild อาสาประชาชน (1340903354037178410)** — server ราชบุรี (1111998833652678757) ไม่มีทะเบียนของตัวเอง · feature ที่ match roster ต่อ guild (verify_phone, docs link-ngs) จะไม่เจอใครถ้าใช้จาก server ราชบุรี จนกว่าจะ import ทะเบียนเข้า guild นั้น · phone binding เป็น per-guild row แต่ phone login เว็บค้นข้าม guild → ผูกที่เดียวพอ

### Key Learnings (2026-07-08 — gogo session_id)

- **gogo panel เป็น sticky**: sticky config key = `sticky_${channelId}` (1 sticky/ห้อง). `refreshSticky` ลบข้อความเก่า+โพสต์ใหม่ = **message_id เปลี่ยนทุก repost**
- **sticky re-render จาก snapshot ไม่ใช่ DB**: `refreshSticky` ส่ง `config.embeds` ที่เก็บไว้ตรงๆ → handler ที่แก้ roster ต้องอัปเดต `config.embeds` เสมอ ไม่งั้น repost แล้ว roster ย้อนกลับ
- **อย่า key ข้อมูลถาวรด้วย message_id ของ sticky** — มัน ephemeral. ใช้ session_id ที่ mint ตอนสร้าง ฝังใน button customId (survive repost เพราะ config เก็บ components)
- modal submit ไม่มี `interaction.message` → ต้อง thread ทั้ง sid (DB) + live msgId (edit embed) ผ่าน modal customId

### Key Learnings (2026-07-08 — social share → ข่าวสาร/Event)

- **basket ไม่มี scheduler ฝั่ง bot** — "ตั้งเวลาโพสต์" คือส่ง `scheduleTime` ให้ Facebook (scheduled_publish_time) จัดการฝั่ง Meta เท่านั้น IG/Threads/X/Discord โพสต์ทันที · feature ใหม่ที่อยากตั้งเวลาฝั่ง Discord ต้องทำ queue เอง (ดู pattern ใน services/newsShare.js: dc_guild_config key + setInterval worker)
- **discord.js 14.25 รองรับ select menu ใน modal แล้ว** — `ModalBuilder.addLabelComponents(new LabelBuilder().setChannelSelectMenuComponent(...))` + อ่านค่า `interaction.fields.getSelectedChannels(customId, false)` (required=false คืน collection ว่างได้) · TextInput ใน modal แบบใหม่ก็ใช้ LabelBuilder ห่อแทน ActionRowBuilder
- **event ผูก Stage channel ต้องใช้ entityType StageInstance ไม่ใช่ Voice** — เช็ค `channel.type === ChannelType.GuildStageVoice` ก่อนสร้าง scheduledEvents
- **web /bot/platforms App Credentials card = generic key/value editor** — เพิ่ม config key ใหม่แค่ 3 จุด: `ALLOWED_KEYS` ใน api/social/guild-configs + แถวใน array หน้า page + title map ใน edit modal · bot อ่านด้วย getSetting key เดียวกัน

### Discord permission aggregation (2026-07-09)

- Channel overwrite: member overwrite > role overwrites > @everyone overwrite > base perms
- ชั้น role ด้วยกัน: **allow ชนะ deny** (รวม deny ทุก role ก่อน แล้ว allow ทับ) — Quarantine role deny แพ้ allow ของ role อื่นใน permission เดียวกัน
- Quarantine ของ user: ติด role เพิ่ม (ไม่ถอดยศ) deny SendMessages — ใช้ได้เพราะห้องลับ allow แค่ ViewChannel ไม่ได้ allow SendMessages · จุดบอด: ห้องที่ explicit allow SendMessages ให้ role อื่น + คนถือ Administrator
- Threat model จริงของ guild นี้: spam มาจาก account สมาชิกโดนแฮคเกือบทั้งหมด ไม่ใช่ bot join ใหม่ → duplicate-ข้ามห้อง เป็น detector หลัก, honeypot เป็นรอง

### Key Learnings (2026-07-09 — i18n rails)

- i18n วางรางแล้ว: เว็บ = next-intl 4.13.1 ไม่มี locale routing (cookie `locale` → default th, config `web/i18n/request.js`), bot = `services/i18n.js` (`getT(guildId)` → sync t, cache 5 นาที)
- `dc_guild_config` เป็น key-value table (guild_id, "key", value JSON) — config ใหม่ = key ใหม่ ไม่ต้อง ALTER
- bot มี `db/configResolver.js` `resolveConfig(discordId, guildId, key)` priority personal > guild > global — config ใหม่ควรขี่ตัวนี้
- โค้ดใหม่ทุกไฟล์: string ที่ user เห็นต้องผ่าน t() (กติกาใน CLAUDE.md section 🌍 i18n)

### Key Learnings (2026-07-09 — i18n)

- migrate i18n ที่ดี: subagent สร้าง dictionary (map ทุก string เป็น key) ให้เสร็จก่อน แล้วค่อยแทน t() ใน component ทีละก้อนเล็ก 2-3 ไฟล์
- ข้อมูล domain (BANKS/PROVINCES) ห้ามแปลผ่าน t() เพราะ match กับ DB + financeAccess.js logic

### Key Learnings (2026-07-15 — "member" มี 2 concept ในโค้ด)

- คำว่า **"member" ในโค้ดหมายถึง 2 อย่างที่ต่างกัน — แยกถูกแล้ว อย่ารวม:**
  - **user / person (identity)** = `dc_members` table (จริงๆ ควรชื่อ "users"), `member_discord_id` (~38 จุด)
  - **membership องค์กร** = `member_id` (~237 จุด) = **เลขสมาชิกองค์กรภายนอก คนละ concept — ห้าม rename เป็น user_id**
- ⚠️ **Do-Not-Repeat:** find-replace "member" รวดเดียวตอน rename `dc_members→users` = พัง `member_id` 237 จุด · rename เชิง concept ต้อง judgment ทีละจุด
- going forward (platformfor.org): identity ตั้งชื่อ **"user"** · membership คงคำ **"member"** — map เข้าโมเดล multi-tenant (user=คน, member=คนอยู่ org) · ดู `md/civicflow/CIVICFLOW.md`

### Key Learnings (2026-07-16 — Phase 2 ownership migration: order + rule)

- **order:** migrate cases + finance ก่อน (generic org ops, ไม่ผูก geography/party-role) → docs ทีหลัง (ผูก Discord role+geography ในสิทธิ์เซ็น = ยากสุด)
- **`org_id` ≠ swap ตรงๆ ของ `guild_id`** — judgment ทีละตาราง (เหมือน "member 2 concept"):
  - `user_id`←`discord_id` = universal (เจ้าของ/ตัวตน) · `org_id`←`guild_id` = เฉพาะ "data ของ tenant" (transactions/cases)
  - **config/artifact ต่อ Discord server (finance_config, channel settings) → คง `guild_id`** ห้ามยุบเป็น org_id (คือตั้งค่าของเซิร์ฟเวอร์ ไม่ใช่ของ org)
- **discord_id → drop เป็น key ไม่ใช่ฆ่า Discord login** — feature เกาะ user_id · discord_id เหลือ credential (login → map เป็น user_id)
- **RBAC เป็นคนละงานกับ column** — เปลี่ยนเจ้าของเป็น user_id ง่าย แต่ financeAccess/caseGate เช็ค Discord role → email world ต้องสลับใช้ org_members.role

- **2026-07-16 — org auth = instance เดียว (ยกเลิก org-auth ที่ 2):** user เคาะ unify ผ่าน users+user_identities แทน 2 NextAuth instance. เหตุผล: 2 instance = แยก identity ตามประตู login = ขัด concept identity-split (1 users, หลาย provider). instance ที่ 2 เป็นแค่ workaround basePath bug + เลี่ยงแตะ PPLE auth. session เก็บทั้ง userId(canonical)+discordId ระหว่าง repoint. หมุดก่อน: user_identities ต้อง key user_id ไม่ใช่ discord_id (ทำแล้ว #0).

### Key Learnings (2026-07-17 — finance org-scope: in-place column convert)

- **Postgres reorder column ในที่เดิมไม่ได้** (คอลัมน์ใหม่กองท้ายเสมอ, RENAME ไม่ย้ายตำแหน่ง). user เกลียด column กองท้ายใน DBeaver → ถ้ากำลัง migrate ตารางอยู่แล้ว ให้ **ALTER COLUMN ... TYPE ... USING** แปลง type คอลัมน์หน้าเดิมคาที่ (คงตำแหน่ง+ชื่อ) แทนการ drop เก่า+rename ตัวใหม่ที่ท้าย. ถ้าไม่ migrate → DBeaver ลาก header สลับ column ได้ (virtual, ไม่แตะ DB).
- **ALTER COLUMN TYPE USING ห้าม subquery** (`cannot use subquery in transform expression`) → สร้าง `pg_temp` helper fn (LANGUAGE sql STABLE) ที่ข้างในทำ SELECT lookup แล้วเรียก fn ใน USING. verify migration ด้วย BEGIN…ROLLBACK + verify block ก่อนเปลี่ยนเป็น COMMIT.
- **finance db เดิมไม่ scope guild เลยหลายจุด** (getTransactions/summaries scope แค่ visibility/account) — single-tenant prod บังไว้. ตอน org-scope ต้อง **เพิ่ม** org filter ผ่าน account join ไม่ใช่แค่ rename guild_id→org_id.
- **getOrgId = orgIdOfGuild(getGuildId)** ไม่ใช่ active_org cookie แยก: access-control (getEffectiveIdentity) ยัง guild-keyed → derive org จาก guild เดียวกัน = data+access aligned. cookie-based org-select ต้องขยับ**พร้อม** RBAC-by-org ตอน endgame ไม่งั้น mismatch (org เลือกได้ แต่สิทธิ์มาจาก guild ผิด).

### Key Learning (2026-07-22) — สลับทางอ่านกับย้ายทางเขียน แยก commit ไม่ได้

ORG_ACCESS_REDESIGN ขั้น 4 สลับ `resolveAccess` ไปอ่าน `org_member_roles` แต่ขั้น 5 (ทางเขียน)
ยังไม่ทำ → สิทธิ์ทุกคนแช่แข็ง **โดยไม่มี error ใดๆ** build ผ่าน test ผ่าน 206 ตัว
→ เวลาย้ายแหล่งความจริงของข้อมูล ให้ถือว่า read-switch + write-switch เป็นงานชิ้นเดียว
→ ถ้าจำเป็นต้องแยกจริงๆ ต้องมี test ที่ "แก้ข้อมูลต้นทางแล้วเช็คว่าปลายทางขยับ" ไม่ใช่แค่ test ว่าอ่านถูก

### Key Learning (2026-07-22) — ซิงค์ข้อมูล: recompute ทั้งก้อน ดีกว่า diff ทีละส่วน

ซิงค์ยศ Discord → `org_member_roles` ถ้าลบ "เฉพาะของ guild ที่กำลังซิงค์" จะพังเมื่อ role_def
ถูกแมปร่วมกันหลาย guild (มีจริง: ทีมบรรณาธิการ/editor) — สิทธิ์หายๆ กลับๆ ตามลำดับการซิงค์
→ recompute ใหม่ทั้ง org ต่อ user แล้วลบส่วนเกิน = idempotent ลำดับไม่มีผล SQL ก็สั้นกว่า

### Key Learning (2026-07-22) — พิสูจน์ทางเขียนด้วยการ replay ทับ migration

วิธี verify ที่ได้ผลจริง: เอา SQL ทางเขียนใหม่ recompute ทับ **ข้อมูลทั้งหมด** แล้ว diff กับผลที่ migration
ทำไว้ (lost/gained) ใน transaction ที่ ROLLBACK → ได้ 0/0 = ทางเขียนกับทางอ่านตีความตรงกันเป๊ะ
ถูกกว่าและแน่นกว่าการไล่อ่านโค้ดเทียบทีละบรรทัด

### Key Learning (2026-07-22) — feature toggle เคยมี 2 ระบบซ้อนกันแล้ว "guild ชนะ"

`/org/settings/features` (org_config) กับ `/bot/features` (dc_guild_config) มีอยู่พร้อมกัน
แต่ `layout.js` + `featureGate.js` แตกสาขา "org มี guild → อ่าน guild" → หน้าฝั่ง org **กดแล้วไม่มีผล**
กับ PPLE เลย ทั้งที่ UI ดูเหมือนทำงาน · รวมมาที่ org ที่เดียวแล้ว (ai_mention ยังราย guild เพราะบอทอ่านเอง)
→ บทเรียน: UI ที่ "กดได้แต่ไม่มีผล" ไม่มี error ให้จับ — เวลามี config 2 ที่ ต้องไล่ดู consumer ว่าใครชนะ

### org_member_roles มี 2 ชนิดปนกัน — แยกก่อนเอาไปโชว์เสมอ (2026-07-23)

`org_member_roles` เก็บทั้ง **ใบตำแหน่ง** (`org_role_defs.permission IS NOT NULL` เช่น เหรัญญิก)
และ **ใบพื้นที่** (`permission IS NULL, scope_node_id IS NOT NULL` เช่น ทีมราชบุรี) ปนกัน
คนทำงานส่วนกลางถือใบพื้นที่ได้เป็นร้อยใบ (วัดจริง: user 5057 ถือ 94 ใบ)
→ UI ไหนที่จะโชว์ "ยศ" ต้องแยก 2 กองก่อนเสมอ ไม่งั้นได้รายชื่อจังหวัดทั้งประเทศ
→ `org_members.roles` เป็นแค่สำเนาชื่อยศ Discord ต่อ guild (log) ห้ามใช้เป็นแหล่งความจริง
- dc_members.member_id เป็น pointer ไป ngs_member_cache.source_id (join ด้วย m.guild_id = n.guild_id เสมอ) → **เขียนได้เฉพาะแถว guild เจ้าของ roster เท่านั้น** ห้าม sync/copy ไป guild อื่นในเครือ — แถวอื่น join ไม่เจอ = ขยะที่ดูเหมือนใช้ได้ (เคาะกับ user 2026-07-08)
- people's party (1115613658408566844): มี bot จริง แต่ **ไม่เอา tester bot เข้า** (ตั้งใจ) — dev รัน deploy-commands จะขึ้น 2/3 + ข้าม people's party เสมอ = พฤติกรรมที่ถูกต้อง ไม่ใช่ bug (2026-07-08)

### Key Learnings (2026-07-27 — home dashboard unify org-first)

- `web/app/page.js` เคยแยก 2 branch: guildless org (hardcode finance+members) กับ guild dashboard (feature จาก toggle + INTEGRATIONS + Discord-user header). สาเหตุ = ตอนทำ org-scope เขียน branch ใหม่แปะ ไม่ได้ refactor ของเดิม → รวมเป็น dashboard org-first ตัวเดียวแล้ว
- การ์ด feature ทุกใบ (calling/finance/docs/cases) เป็น org-native → render จาก `getOrgEnabledFeatures(activeOrg.id)` ที่เดียวได้ทั้ง org ที่มี/ไม่มี guild
- `getEffectiveOrgIdentity` รองรับ guildless org (web_roles ล้วน) + debug delegate guild-based; `access` shape เดียวกับ `getEffectiveIdentity` → `isAdmin`/`canManageCases` ใช้ร่วมได้
- แยกจริงแค่ INTEGRATIONS (Discord Bot/REST API) → gate ด้วย `hasGuild = orgGuilds.length > 0`
- `!activeOrg && discordId` fallback = dead (discord users 6610 มี active org 6609) → ยุบเป็น CTA "ยังไม่มีองค์กร" ได้

### Key Learnings (2026-07-28 — rebrand: brand/URL single source)

- **ชื่อแบรนด์ = constant, ไม่ใช่ env** — `config/brand.js` (BRAND_NAME/BRAND_DOMAIN) เพราะไม่ต่างตาม environment + client component อ่าน process.env ไม่ได้ (ต้อง NEXT_PUBLIC_ ที่ inline ตอน build อยู่ดี) + prod ลืมตั้ง = fallback เงียบ
- **domain/URL = env** — `.env` NEXTAUTH_URL คือ source of truth, อ่านผ่าน `web/lib/baseUrl.js` ที่เดียว ห้ามเขียน `process.env.NEXTAUTH_URL || 'https://...'` กระจายอีก
- web import ไฟล์นอก `web/` ได้จริง (CJS ก็ได้) เพราะ next.config ตั้ง `outputFileTracingRoot: '../'` — แต่ให้ข้ามขอบผ่าน `web/lib/brand.js` ไฟล์เดียว ที่เหลือใช้ alias `@/`
- root `.env` เป็น env เดียวของทั้ง bot + web — [web/next.config.js:2](web/next.config.js) โหลด `../.env` (override: true) ไม่มี `web/.env`

### Key Learnings (2026-07-29 — โครงเอกสาร)

- **กติกา: "งานค้าง" อยู่ `md/PENDING.md` ที่เดียว** · ไฟล์เอกสารโมดูล (`md/<โมดูล>/*.md`) เก็บเฉพาะประวัติ/กลไก ห้ามมี checklist `- [ ]` ค้าง — ไม่งั้นแก้ที่นึงลืมอีกที่
- ของเสร็จแล้วใน PENDING ให้ **ย้าย ไม่ใช่ลบ** ไปไฟล์โมดูล แล้วเหลือ stub `## หัวข้อ` + `> ย้ายไป <ไฟล์>` + บรรทัด `- [ ]` ที่ยังค้าง
- **ห้ามย้าย `md/ORG_ACCESS_REDESIGN.md` เข้า archive** — โค้ดที่รันอยู่อ้างถึงเป็น spec (`web/lib/resolveAccessV2.js`, `web/db/orgMemberRoles.js`, SQL 2 ไฟล์)
- วิธี verify ว่าจัดเอกสารแล้วไม่มีอะไรหาย: `comm -23` ระหว่างบรรทัด unique ของไฟล์เดิม (git show HEAD:) กับ union ของไฟล์ใหม่ทั้งหมด — เหลือเฉพาะที่ตั้งใจลบเท่านั้น

### Key Learnings (2026-07-29 — dc_social_accounts → org-native)

- **PG14 = ไม่มี `NULLS NOT DISTINCT`** → ตารางที่คีย์มีคอลัมน์ nullable (org_id/owner_user_id/guild_id) ต้องใช้ **expression unique index** `(COALESCE(org_id,0), COALESCE(owner_user_id,0), COALESCE(guild_id,''), platform, social_id)` และ `ON CONFLICT` **ทุกจุดต้องเขียน expression ซ้ำให้ตรงตัวอักษร** (inference ตาม expression ไม่ใช่ชื่อ index) — verify ด้วยการยิง upsert จริงใน BEGIN…ROLLBACK อย่าดูแค่ DDL ผ่าน
- **`DROP TABLE` ลาก sequence ที่ own อยู่ไปด้วย** → rebuild ตารางต้อง `ALTER SEQUENCE … OWNED BY NONE` ก่อน แล้ว `OWNED BY <new>.id` + `setval` ทีหลัง (rebuild = วิธีเดียวที่วางคอลัมน์ in-place ได้เมื่อ **เพิ่ม** คอลัมน์ ไม่ใช่แปลง type ของเดิม — ต่างจาก finance 2026-07-17)
- **คอลัมน์ owner ต้องนิยามให้ตรงกับ upsert** — `owner_user_id` ตั้งเฉพาะแถว `private` (public = ของ org → NULL) · ถ้า backfill ใส่ owner บนแถว public ด้วย คีย์จะไม่ตรงกับที่ code เขียนเข้ามา → OAuth reconnect ครั้งเดียวได้แถวซ้ำทันที
- **scope แยกตามฝั่งได้ ไม่ต้องเปลี่ยนพร้อมกัน**: เว็บอ่านด้วย `org_id` (posts เลือกได้ทั้งองค์กร) · บอทยังอ่าน `guild_id`/`user_discord_id` เหมือนเดิม (ตะกร้าสื่อ/ลายน้ำเป็นของ guild จริงๆ + ถ้าเปลี่ยนเป็น org ทันที `LIMIT 1` จะหยิบข้ามแบรนด์) → เก็บคอลัมน์ Discord ไว้เป็น artifact = migration ไม่ต้องแตะบอทเลย
- **สิทธิ์คือของจริงที่บล็อก guildless org ไม่ใช่คอลัมน์** — `getSocialManagerGuildIds()` match `org_members.roles` กับ `dc_guild_roles` = ผูก guild 100% · `canManageSocialGuild(access)` เป็น permission จาก `resolveAccessV2(orgId,userId)` อยู่แล้ว = org-native ใช้ได้เลย · ตอน migrate ตารางไหนเป็น org ต้องไล่ **ทั้ง query และ gate** ไม่งั้นได้ schema ใหม่แต่ยังใช้ไม่ได้
- **ยังเหลือด่านสุดท้ายของ "ไม่ต้องมี Discord"**: OAuth app creds (`meta_app_id`/`x_consumer_key`) อยู่ใน `dc_guild_config` → org ไม่มี guild ถือครองบัญชีได้ แต่กด Connect ใหม่ไม่ได้ (เคาะ 2026-07-29 ว่ายังไม่ย้าย)
- **local browser-test login เร็วสุด**: insert แถวลง `org_login_tokens (token,email)` แล้ว `GET /api/auth/csrf` → `POST /api/auth/callback/magic` (csrfToken+token+json=true) ด้วย cookie jar เดียว = ได้ session จริงไว้ curl API ต่อ (ห้ามยิง `/api/org/auth/magic` = ส่งเมลจริง)

### Key Learnings (2026-07-29 — ของเดิมที่ posts ต้องต่อ)

- **ท่อโพสต์จริงอยู่ใน `handlers/basketHandler.js:776-900` ไม่ใช่ `services/metaApi.js`** — fetchBuffer → applyWatermark → sharp → ยิง 4 แพลตฟอร์ม ปนกับ `interaction.editReply` · ใครจะโพสต์จากที่อื่นต้อง extract เป็น pipeline ก่อน ไม่งั้นได้ 2 สำเนา
- **`postTo*()` เลือกบัญชีเองข้างใน** (`getConfig(guildId, platform, discordUserId, groupName)` + `LIMIT 1`) → คนกดเลือกบัญชีบนเว็บไม่มีผล · และ user ที่ล็อกอินด้วยอีเมล (private account มี `owner_user_id` แต่ `user_discord_id` NULL) หาบัญชีตัวเองไม่เจอ → ต้องส่ง `accountId` เข้าไปตรงๆ
- **`dc_media_baskets.image_url` = Discord signed URL หมดอายุ ~24 ชม.** (`?ex=&is=&hm=`) → อะไรที่เก็บเกิน 1 วันห้ามอิง URL นี้ · ตะกร้าเป็นถาดชั่วคราวที่ `clearBasket()` ล้างหลังโพสต์
- **ตั้งเวลาอย่าซ้อน 2 ชั้น** — ของเดิมส่ง `scheduled_publish_time` ให้ FB (จึงมีกติกา ≥20 นาที) · ถ้ามีคิวของตัวเองแล้วยังส่งอีก = เลื่อนซ้ำ/เวลาเป็นอดีต · ถือคิวเอง = ได้ตั้งเวลา IG/Threads/X ที่ FB-only ทำไม่ได้ฟรี
- `utils/quoteStyles.js` `renderQuoteStyle()` เป็น pure (canvas in → PNG out) 20 สไตล์ · `shortenQuote()` อยู่ `services/aiLayout.js:130` · เว็บมี `@napi-rs/canvas` + `outputFileTracingRoot` ชี้ราก repo อยู่แล้ว → น่าจะ import ข้าม package ได้ (ต้อง spike)
- **`/scrutinize` ≠ `/grill`** — scrutinize ตรวจแผนที่มีอยู่ว่าถูกไหม · grill ไล่ถามจนกิ่งการตัดสินใจหมด · รอบนี้รัน scrutinize 2 ครั้งแต่ไม่เคย grill เลย จน user ถามเอง → ก่อน implement ฟีเจอร์ใหญ่ควรได้ทั้งคู่

### Key Learnings (2026-07-29 — app creds โซเชียล → org_config)

- **`org_config.value` = `text` ดิบ · `dc_guild_config.value` = `json`** — ย้ายค่าข้ามตารางต้องแกะด้วย `value #>> '{}'`
  ไม่งั้นได้ค่าติดเครื่องหมายคำพูด (`"1616…"`) แล้ว OAuth พังแบบเงียบๆ · เขียนลง org_config ห้าม `JSON.stringify`
  (ยกเว้นค่าที่เป็น array/object จริง เช่น `enabled_features` / `appoint_policy` ที่ consumer `JSON.parse` เอง)
- **แพตเทิร์นย้าย config ขึ้น org แบบไม่ล้ม prod**: copy ไป org_config → โค้ดอ่าน "org ก่อน เติมคีย์ที่ขาดจาก guild"
  → แถวเดิมยังอยู่เป็น fallback → ลบทีหลังรอบถัดไป (ไม่มีจังหวะที่อ่านไม่เจอ)
- **helper อ่าน creds มีที่เดียวต่อฝั่ง**: เว็บ `web/lib/socialAppCreds.js` · บอท `services/metaApi.js`/`xApi.js`
  เดิม 4 route OAuth ก๊อป query ตัวเดียวกันคนละก๊อป → แก้ 1 ที่ลืมอีก 3 ที่
- `/bot/platforms` มี config 2 ชั้นในการ์ดเดียว: 4 app creds = ราย org · `news_channel_id` = ราย guild (Discord artifact)
  → route `/api/social/guild-configs` PATCH แยกทางเขียนตาม key ไม่ใช่ตาราง

### โพสต์จากเว็บเลือกด้วย "กลุ่ม" ไม่ใช่ "บัญชี" (2026-07-30)

`dc_social_accounts` 1 แถว = 1 แพลตฟอร์ม · `group_name` = ตัวตนที่พาดข้ามแพลตฟอร์ม (ตะกร้าดิสฯ ใช้ group มาตั้งแต่ต้น)
ให้ client ส่ง **ชื่อกลุ่ม** แล้ว server resolve เป็นบัญชีรายแพลตฟอร์มเอง — ห้ามรับ account id จาก client
(private account เช็ค org_id อย่างเดียวไม่พอ ต้องเช็คเจ้าของ ไม่งั้นคนใน org เดียวกันโพสต์ในนามคนอื่นได้)

### ห้ามรัน `npm run build` ตอน `next dev` รันอยู่ (2026-07-30)

ใช้ `.next/` ร่วมกัน → dev พังทั้ง server (`Cannot find module './vendor-chunks/…'`) ต้องรีสตาร์ท dev · ดู bug-070

### `teal` ในโปรเจกต์นี้ = สีส้มแบรนด์ ไม่ใช่สีเขียว (2026-07-30)

`tailwind.config.js`: `teal.DEFAULT = var(--brand-orange)` → `bg-teal` กับ `bg-orange` เป็นสีเดียวกันเป๊ะ
(ชื่อ `teal` ค้างมาจากธีมเก่า) · อย่าอ้างว่า "หน้านี้ใช้ teal ปนกับ orange = หลายสี" มันสีเดียว
เวลาต้องการสีที่ **ต่างจริง** ให้ใช้ palette มาตรฐานของ Tailwind (indigo/lime/…) ซึ่งยังใช้ได้ปกติเพราะ colors อยู่ใน `extend`

### optimistic lock ต้องบังคับ token เสมอ (2026-07-30)

`if (lockToken && ...)` = คนที่ไม่ส่ง token ผ่านฟรี · ด่านที่ข้ามได้ด้วยการ "ไม่ส่งค่ามา" ไม่ใช่ด่าน
คู่กัน: ฟอร์ม/editor ที่ autosave ต้องมี flag ว่า "โหลดข้อมูลจริงเข้ากล่องแล้ว" ก่อนยอมให้เซฟ
ไม่งั้น state ว่างตอนเริ่มจะถูกเซฟทับของจริง (debounce ชนะ fetch ได้เสมอถ้าเน็ต/คอมไพล์ช้า)

### Key Learnings (2026-07-30 — ก้อน 4c: ยุบตะกร้าสื่อเข้า post_episodes)

- **ตะเข็บคือตัวช่วยชีวิตตอนเปลี่ยนที่เก็บ** — เขียน `db/mediaBasket.js` ใหม่ทั้งไฟล์แต่คง
  ลายเซ็น 9 ฟังก์ชัน + รูปร่างแถวเดิม (`{id,type,image_url,caption,message_id,sort_order}`)
  → `handlers/basketHandler.js` (12k tok, ทีมสื่อใช้ทุกวัน) แทบไม่ต้องแตะ · ถ้าไป refactor handler
  ตรงๆ จะเสี่ยงกว่ามาก และ commit checkpoint กลางทางจะไม่มีสถานะที่ "บอทยังใช้งานได้"
- **บอท CJS + เว็บ ESM = คนละ pool import ข้ามกันไม่ได้** → โมดูล DB ที่ทั้งสองฝั่งต้องใช้ ต้องมี
  "ฝาแฝด" 2 ตัว (`db/mediaBasket.js` ↔ `web/db/posts/basket.js`) · เขียน comment ชี้หากันไว้เสมอ
- **เช็ค `\d` ของตารางจริงก่อนวางแผน migration เสมอ** — แผนก้อน 4c ไม่ได้พูดถึง NOT NULL ของ
  `org_id`/`owner_user_id`/`path` และ check constraint ของ `kind` เลย ทั้งที่ 4 ตัวนี้บล็อกแผนทั้งหมด
- **partial unique index ใช้เป็น invariant ได้ดีกว่าตาราง slot** — `UNIQUE (channel_id) WHERE
  channel_id IS NOT NULL AND archived_at IS NULL` = "1 ห้อง 1 ตะกร้าเปิด" บังคับที่ DB ·
  archive แล้วหลุด index เอง · ยังเก็บ provenance ว่าโพสต์มาจากห้องไหน (ตารางแยกทิ้งของนี้ตอนลบแถว)
- **ไฟล์ที่ระบบต้องหยิบไปใช้ต่อ ต้องมี fallback เสมอ** — path บนดิสก์ → source_url → refresh
  เพราะมีช่วงที่ path ยัง NULL (หย่อนเสร็จกดโพสต์ทันที) · ห้ามลบตัวรีเฟรชฝั่งบอททิ้งตามแผน

### Key Learnings (2026-07-30 — ปุ่มที่เปลี่ยน status/หมวด ห้ามยิง API เองถ้าไม่ได้ถือ lockToken)

- `setPostStatus` / ทุก PATCH ของ posts bump `updated_at` = lockToken ของ PostEditor หมดอายุ → autosave เด้ง 409 (bug-071)
- ปุ่มที่ย้ายไปการ์ดอื่น (หมวด, ส่งตรวจ/อนุมัติ/ถอนกลับ) จึงใช้ pattern: **การ์ด dispatch CustomEvent →
  PostEditor เป็นคนยิง API แล้วรีโหลด token** (`posts:set-category`, `posts:request-status`)
- เวลาเพิ่มปุ่มที่เขียน DB ในหน้านี้ ให้ถามก่อนเสมอว่า "ใครถือ lockToken" ไม่ใช่ยิงจากที่ที่ปุ่มอยู่

### Key Learnings (2026-07-31 — ของที่เขียนบ่อยห้ามยัดลง post_episodes)

- อยากเก็บอะไรที่ "เขียนถี่แต่ไม่ใช่เนื้อหาโพสต์" (ข้อเสนอ AI, log, สถิติ) → **ตารางแยกเสมอ**
- เหตุ: ทุก UPDATE บน `post_episodes` bump `updated_at` ซึ่งเป็น optimistic lock token ของ PostEditor
  → autosave ของคนที่เปิดหน้าอยู่เด้ง 409 ทันที (bug-071) แม้จะไม่ได้แตะ title/body เลย
- เช็คลิสต์ก่อนเพิ่มคอลัมน์ลง post_episodes: "ของนี้เขียนตอนคนกำลังพิมพ์อยู่ไหม" ถ้าใช่ = แยกตาราง

### Key Learnings (2026-08-08 — auth gate: 404 vs redirect ไปล็อกอิน)

- **"ไม่มี session" กับ "org ปิดฟีเจอร์" คนละความหมาย ห้ามยุบเป็น `notFound()` เหมือนกัน** — สวิตช์ฟีเจอร์ผูกกับ org ของ *คนนั้น* (`resolveActiveOrg(userId)`) คนไม่ล็อกอินจึงไปไม่ถึงด่านนั้นเลย ระบบไม่ได้ตัดสินว่า "ปิด" แค่ตอบไม่ได้ → ต้อง redirect ไปล็อกอิน · 404 ไว้ใช้กับคนที่ล็อกอินแล้วแต่ org ปิดฟีเจอร์ (ตรงนั้นแหละที่ต้องปิดบัง) · การ redirect ทุกคนที่ยังไม่ล็อกอินไม่รั่วอะไร เพราะทุก path ให้ผลเดียวกัน
- **App Router ไม่มี API ให้ server component รู้ pathname ตัวเอง** — layout/page รับแต่ `params` · ต้องพึ่ง `web/middleware.js` (สร้าง 2026-08-08) ที่ยิง header `x-pathname` แล้วอ่านผ่าน `headers()` · middleware `headers.set()` ทับของที่ client ส่งมาเสมอ = spoof ไม่ได้ (ยังใส่ regex `/^\/(?![/\\])/` กัน open-redirect ซ้ำอีกชั้น)
- **ห้ามเขียน `redirect('/')` ตรงๆ เวลาไม่มี session** — ใช้ `redirectToLogin()` จาก `lib/auth.js` เสมอ (ทำ callbackUrl ให้เอง) · ไม่งั้นล็อกอินเสร็จเด้งไป `/dashboard` ตาม default ของ `LoginPanel` แทนที่จะกลับหน้าที่ user ตั้งใจเปิด
- **page ที่อยู่ใต้ layout ที่มี gate ก็ยังต้องมี guard ของตัวเอง** — layout กับ page render พร้อมกัน ลำดับ redirect ไม่การันตี ถ้า page เผลอ `redirect('/')` เปล่าๆ มันอาจชนะ layout แล้ว callbackUrl หาย → ต้องใช้ helper ตัวเดียวกันทั้งคู่
- **verify auth redirect ให้ใช้ `next build` + `next start -p 3100` แล้ว `curl -w "%{http_code} -> %{redirect_url}"`** — ไม่ต้อง login จริง เห็น 307 + callbackUrl ครบทุกโซนในคำสั่งเดียว (build ใส่ `NEXT_DIST_DIR=.next-verify` กัน .next ของ dev server ปน)

### Key Learnings (2026-08-08 — โมเดลสิทธิ์ของ posts ตอบโจทย์ "ใครก็แก้ได้ · editor เท่านั้นที่โพสต์" อยู่แล้ว)

- `posts_policy` เก็บใน `org_config` (KV ต่อ org) · **ไม่มีแถว = ใช้ `DEFAULT_POSTS_POLICY` = `{read:'org', write:'org', approval:'required'}`** · ตรวจแล้วบน prod = 0 rows → org post **ทุกคนใน org แก้ได้อยู่แล้ว** ไม่ต้องแก้โค้ด/policy อะไรเลย
- **ไม่มีหน้า UI ไหนเขียน `posts_policy` เลยทั้งโปรเจกต์** (อ้างถึงแค่ 3 ที่ ล้วนเป็นฝั่งอ่าน) → ค่านี้ตั้งได้ทาง DB อย่างเดียว
- `visibility:'personal'` **ลัด policy ทิ้งทั้งหมด** — `canReadPost`/`canWritePost` ตัดที่ `isOwner` ทันที คนอื่นมองไม่เห็นด้วยซ้ำ (ไม่ใช่แค่แก้ไม่ได้)
- **`status='approved'` ล็อกการแก้ของทุกคน รวม editor และเจ้าของ** (`canEditPost` เช็ค `status !== 'approved'`) — แต่ปลดล็อกเองได้ ไม่ต้องรอ editor: `canRequestChanges` → `canWritePost` → ทุกคนใน org กด "กลับไปแก้" ได้ · **อาการ "ติดขัด" ที่ user เจอมักมาจากตรงนี้ ไม่ใช่เรื่อง role**
- ด่าน editor จริงมีที่เดียว = `canApprove` (admin/secretary_general/editor) → กันที่ขั้นอนุมัติ ซึ่ง `canPublishPost` บังคับว่าต้อง approved ก่อนถึงโพสต์ได้ (เมื่อ `approval:'required'`)

### Key Learnings (2026-08-08 — ยศใน org แยก 2 ชนิด · UI ต้อง gate ตาม `can` ที่ API ส่งมาให้)

- **"user ที่ไม่มีสิทธิ์อะไรเลย" ≠ คนนอก org** — somseed (uid 5273) ถือยศ 6 ใบ (ทีมภาคกลาง/นครปฐม/ราชบุรี/สาธารณสุข/ภาคกลางตะวันตก/อาสาประชาชน) ทั้งหมดเป็น **ใบพื้นที่** (`permission IS NULL`) → `isMediaTeam()` = false แต่ยังเป็นสมาชิก org → policy `write:'org'` ผ่านหมด **แก้โพสต์ได้ตามดีไซน์** · เวลา user บอกว่า "ไม่มีสิทธิ์แต่ทำได้" ต้องแยกก่อนว่าหมายถึง "ไม่มียศ" หรือ "ไม่ได้อยู่ใน org"
- **ด่าน editor ของ posts อยู่ที่ `canApprove` ที่เดียว ไม่ได้อยู่ที่ปุ่มเผยแพร่** — `canPublishPost` เช็คแค่ `canWritePost` + `status==='approved'` → **พออนุมัติแล้ว ใครใน org ก็กดยิงขึ้นเพจได้** (user เคาะ 2026-08-08 ว่า **คงไว้แบบนี้** ถือว่าการอนุมัติคือด่านจริง ส่วนการกดยิงเป็นงาน mechanical)
- **`GET /api/posts/[id]` คืน `can` ครบ 6 ตัวอยู่แล้ว (edit/delete/publish/approve/requestChanges/promote) — การ์ดฝั่งขวาต้องหยิบไปใช้** · `PostPublishPanel` เคยยิง endpoint นี้แล้วหยิบไปแค่ `media` เลยกางปุ่มเผยแพร่ให้ทุกคน (bug-094) · **เขียนการ์ดใหม่ในโซนนี้เมื่อไหร่ ให้เช็คก่อนว่าหยิบ `can` ที่ตรงกับปุ่มมาใช้หรือยัง**
- ปุ่มที่สิทธิ์ขึ้นกับ **สถานะ** ต้องผูก listener `posts:changed` ที่มี `detail.status` ด้วย (ไม่งั้น editor อนุมัติแล้วปุ่มยังเทาค้าง) — แพทเทิร์นนี้ `PostMetaPanel` ทำอยู่แล้ว ลอกได้เลย
- **user เลือก "โชว์แต่ disable + บอกเหตุผล" มากกว่า "ซ่อน"** สำหรับปุ่มที่กดไม่ได้ — ซ่อนแล้วคนงงว่าเผยแพร่ยังไง

### Key Learnings (2026-08-08 — token โซเชียลแต่ละแพลตฟอร์มอายุไม่เหมือนกัน)

- **fb** = Page token → **ไม่มีวันหมด** · **x** = OAuth 1.0a (`services/xApi.js:95` HMAC-SHA1) → **ไม่มีวันหมด** — 2 ตัวนี้ไม่ต้อง refresh
- **ig** = user token 60 วัน · มี refresh-on-use ที่ `finalizeConfig` (metaApi.js:107) ทำงานจริง
- **threads** = long-lived 60 วัน **ต่ออายุได้ไม่จำกัดรอบ** ผ่าน `graph.threads.net/refresh_access_token?grant_type=th_refresh_token` (ต้องอายุ ≥24 ชม. **และยังไม่หมด** · เลย 60 วัน = ตายถาวร ต้อง OAuth ใหม่)
  → แต่โปรเจกต์นี้**ไม่มีโค้ดต่ออายุ Threads เลย** — `refreshUserToken` hardcode `graph.facebook.com` + `fb_exchange_token` (คนละ host คนละ grant) และเช็คเฉพาะ `user_token` ส่วน Threads เก็บที่ `access_token` → เงื่อนไขไม่เคยเป็นจริง
- **refresh-on-use อย่างเดียวไม่พอเป็นกลไกกันตาย** — มันขึ้นกับ "บังเอิญมีคนโพสต์ถูกกลุ่มในหน้าต่าง 7 วันสุดท้าย" ซึ่งไม่การันตี · ของที่ตายไปแล้ว refresh กู้ไม่ได้ (ต้องใช้ token ที่ยังไม่หมด)
- **ไม่มี cron ในโปรเจกต์นี้เลย** — งานเป็นรอบเกาะ `sweep()` ใน `services/publishWorker.js:205` (วันละครั้ง, start จาก index.js:99) ⚠️ `sweep()` ถูกเรียกทันทีตอน start ด้วย = บอท restart ทุกครั้ง = ยิงซ้ำ → งานที่มี rate limit ต้องกันด้วย threshold เอง

### Key Learnings (2026-08-09 — autocrop เอกสาร: guard ที่ใช้ได้จริง ≠ สัดส่วนกระดาษ)

- **ห้ามเอาสัดส่วน A4 (1.414) มาเป็นเกณฑ์ตัดสินว่า quad ที่ detect ได้ "ใช่เอกสารไหม"** — quad ในรูปคือเงาฉายของกระดาษ ถ่ายเอียงนิดเดียวสัดส่วนก็เพี้ยนไปมาก วัดจริงตอนเทส: A4 ถ่ายเฉียงได้ 1.02 · ตั้งเกณฑ์แคบ = autocrop ไม่ทำงานเลยทั้งที่หาเอกสารเจอ (เจอกับตัวเอง ต้องแก้เกณฑ์รอบสอง)
- เกณฑ์ที่ตรงกับ false-positive จริงคือ **"quad กินเกือบทั้งเฟรม"** (จับขอบโต๊ะ/ขอบรูป) — ใช้ 92% ของพื้นที่เฟรม · ส่วนเกณฑ์สัดส่วนให้หลวม (1.05–1.95) ไว้ตัดเฉพาะของยาว/แบนผิดปกติ
- **ทุกจุดที่ normalize รูปเป็น A4 ต้อง fit + เติมขอบ ห้าม resize ตรงๆ** — และต้องไล่ให้ครบทุกเส้นทาง: ที่นี่มี 2 ที่คนละภาษา (`crop_document.py` ตอนอัปโหลด กับ `export/route.js` ที่ทำ PDF รวมด้วย pdf-lib) แก้ที่เดียวอาการย้ายไปโผล่อีกที่
- **อย่าลบต้นฉบับหลังประมวลผล** — เดิม `cropAndSave` ลบ tmp ทิ้งทันที ทำให้ย้อนวัดคุณภาพ autocrop ไม่ได้เลยและครอบใหม่ก็ไม่ได้ · ตอนนี้เก็บเป็น `<uuid>.orig.<ext>` คู่ไฟล์ผลลัพธ์ (ลบพร้อมกันใน `removeFile`)
- **เดาแล้วผิด แพงกว่าไม่ทำ** — fallback เดิมเดาหมุน 90° เมื่อรูปแนวนอน ทั้งที่ไม่รู้ว่าเอกสารวางแนวไหน · หลักที่ใช้: worst case ต้องเป็น "ไม่ครอบ/ไม่หมุน" ไม่ใช่ "ครอบเบี้ยว/ตะแคง"

### Key Learnings (2026-08-09 — เปิดให้อัปคลิปจากเว็บ)

- **`isAllowedMime()` / `MAX_FILE_SIZE` ใน `web/lib/postsStorage.js` ใช้ร่วมกัน 3 ทางเข้า** — สื่อในโพสต์ · คลังภาพ `/api/posts/assets` · `PUT /api/posts/media/[id]` (แก้รูป) · ขยาย predicate กลางเพื่อรับชนิดไฟล์ใหม่ = เปิดรูให้ทางเข้าอื่นด้วยเสมอ → แยกเป็น `isAllowedVideoMime()` ต่างหาก แล้วให้ทางเข้าที่ต้องการเรียกเพิ่มเอง
- **เสิร์ฟไฟล์วิดีโอผ่าน route ต้องรองรับ HTTP Range** — ไม่มี `Accept-Ranges`/206 = Safari/iOS ไม่ยอมเล่น `<video>` เลย (Chrome เล่นได้แต่ seek ไม่ได้) · ดู bug-099
- **`loadMediaSources()` เก็บ `videoUrl` ได้ตัวเดียว** (ลูปทับไปเรื่อยๆ) → ต้องบังคับ 1 คลิป/โพสต์ตั้งแต่ตอนอัปโหลด ไม่งั้นคลิปที่เกินมาหายเงียบตอนโพสต์ · และ `publishOne()` เช็ค `isVideo` ก่อน แล้ว**ทิ้ง images ทั้งชุด**
- **ลิงก์ที่ส่งเข้าห้องข่าว Discord ห้ามเป็น media-temp** — `cleanTempMedia()` ลบไฟล์ใน 24 ชม. ข้อความจะเหลือลิงก์ตาย · แนบไฟล์ตรงแทน (เพดานตาม `guild.premiumTier`: 10/50/100MB — discord.js v14 ไม่มี getter ให้ ต้องแปลงเอง)
- **retention ที่ลบไฟล์อัตโนมัติต้องถามก่อนว่า "ยังมีต้นฉบับที่อื่นไหม"** — คลิปจากตะกร้าดิสฯ มี `source_url` กลับไปหาได้ แต่คลิปที่อัปจากเว็บไม่มี ลบแล้วหายจริง
- **local: ล็อกอิน curl ได้ด้วย next-auth credentials `magic`** — mint token ลง `org_login_tokens (token,email)` → `GET /api/auth/csrf` → `POST /api/auth/callback/magic` ด้วย `csrfToken`+`token`+`json=true` (เปิด `/org/verify?token=` ด้วย curl เฉยๆ ไม่ได้ผล เพราะเป็น client-side `signIn()`)

### Key Learnings (2026-08-09 — video/ffmpeg)

- **ffprobe: ห้ามใช้ `-show_entries ...:side_data=rotation`** — มันจะไล่ dump ทุก packet/frame ของทั้งคลิป · ใช้ `-show_streams` แล้วอ่าน `side_data_list` จาก object ของสตรีมแทน
- **rotation เก็บ 2 ที่ เครื่องหมายกลับกัน** — tag `rotate` = ตามเข็ม · side_data `rotation` = ทวนเข็ม · และ **ffmpeg 4.4 ไม่ autorotate ให้ใน `-filter_complex`** (ต่างจาก `-vf`) ต้องใส่ `transpose` เอง + ล้าง `-metadata:s:v:0 rotate=0` กันเครื่องเล่นหมุนซ้ำ
- **`-filter_complex overlay` ล้วน เสียงไม่หาย** (เทสแล้ว default stream selection เลือก audio ให้) แต่ `-c:a copy` ใช้ได้เฉพาะ aac — mov จากกล้องบางตัวเป็น pcm ที่ใส่ mp4 ไม่ได้
- **`replaceMediaFile()` hardcode `kind='upload'`** — ใช้กับคลิปไม่ได้ ต้องมี `replaceVideoFile()` แยก ไม่งั้นคลิปกลายเป็นรูปในสายตา UI และท่อโพสต์
- **JSON.parse+stringify ทับไฟล์ locale จะยุบคีย์ซ้ำทิ้ง** — th.json มีคีย์ซ้ำอยู่ (ค่าที่ระบบใช้จริงคือตัวหลัง) การเขียนใหม่จึงลบตัวแรกที่ตายแล้วออก ไม่ได้ทำข้อความหาย แต่ต้องเช็ค diff ทุกครั้ง
- **`pkill -f "next start -p 3100"` ไม่โดน** — โปรเซสจริงชื่อ `next-server` · ถ้าไม่เช็ค `pgrep -af next-server` ก่อน จะได้เทสของ build เก่าโดยไม่รู้ตัว (port ชนแล้ว server ใหม่ตายเงียบ แต่ curl ยังได้ 200 จากตัวเก่า)

### 2026-08-10 — AI per-org BYO-key

- **Key Learning:** ตัวเลขช่องเดียว (โควต้า 0/30/9999) แทนได้ทั้ง boolean flag และเพดาน — ไม่ต้องมี 2 คอลัมน์
- **Key Learning:** จุดที่ยิง Anthropic ในโปรเจกต์นี้มี 9 จุด ไม่ใช่ 4 — `services/aiSummarize.js`, `services/aiLayout.js`, `web/lib/ai.js`, `web/app/api/case/[ref]/timeline/refresh`, `.../letter/draft`, `web/app/api/cooking/*` (4 route) · เส้น aiLayout เรียกข้ามฝั่งเว็บ→โค้ดบอทผ่าน `requireFromRoot`
- **Key Learning (2026-08-10):** alias map ของ quote style มี **3 ชุดแยกกัน** — `utils/quoteStyleKeys.js`, `utils/quoteStyles.js` (renderer มีของตัวเอง), `web/lib/quoteStyles.js` · แก้ไม่ครบ = การ์ดเก่าโยน "Unknown style"
- **Key Learning (2026-08-10):** เว็บ (Next) import CJS จาก root ได้ผ่าน `@/../utils/x.js` / `@/../config/x.js` (มี precedent ที่ `config/callingCategories.js`) → โค้ด zero-dep ที่ต้องใช้ทั้ง bot+web ไม่ต้องเขียนซ้ำ 2 ฝั่ง แต่ต้อง import แบบ default แล้ว destructure
- **Key Learning (2026-08-10):** `org_config.value` เป็น **text** ส่วน `dc_guild_config.value` เป็น **json** — เขียน JSON ลง org_config ต้อง stringify เอง ไม่มี `::json` cast

### 2026-08-10 — ลายน้ำย้ายออกจาก guild

- **Key Learning:** ลายน้ำ/สี CI/สไตล์การ์ด ถูกอ่านทั้งฝั่งบอทและเว็บ → เป็นของ "แบรนด์ = กลุ่มโซเชียล" ไม่ใช่ของบอทหรือของ posts · เกณฑ์ตัดสินที่อยู่หน้า: ใครอ่านค่านั้นบ้าง ไม่ใช่ใครตั้งค่า
- **Key Learning:** `dc_social_accounts.group_name` + `visibility` คือ "แบรนด์" ที่ระบบมีอยู่แล้ว — ยังไม่ต้องมีตาราง social_groups จนกว่าจะอยากเปลี่ยนชื่อกลุ่ม/ให้สิทธิ์รายกลุ่ม
- **Key Learning (2026-08-10):** การ์ด `plain-*` (พื้นสี CI) มีโลโก้ฝังตั้งแต่ตอนสร้างผ่าน `renderPlainCard(params, accent, wm)` → ห้ามแปะลายน้ำซ้ำตอนเผยแพร่

### quote font-size: fitFont maxLines ตายตัวทำให้ preset/สเกลไม่มีผลกับคำคมยาว — แก้เสร็จเป็น slider แล้ว (2026-08-11)

`utils/quoteStyles.js` — root cause: `fitFont(..., N, ...)` ที่ N (maxLines) คงที่ไม่ว่าฟอนต์เริ่มต้นใหญ่แค่ไหน คำคมยาวจะถูกหรี่ลงจน wrap พอดี N บรรทัดเท่ากันหมด ไซส์ต่างกันจึงมองไม่เห็นผล (ปัญหานี้เจอซ้ำ 2 รอบ: preset s/m/l รอบแรก แล้วก็ scale คูณจุดเริ่มต้นรอบสอง — สุดท้ายเปลี่ยนดีไซน์ทั้งระบบเป็น **slider ต่อเนื่อง 60-140%** แทน 3 ปุ่ม)
→ ตัวแก้ถาวร: `sizeScaleOf(pct)` (=pct/100) คูณเข้ากับจุดเริ่มต้นของแต่ละสไตล์ **พร้อมกับ** `scaledMaxLines(base, pct)` ที่สเกล maxLines ตามด้วยเสมอ — แก้แค่ตัวคูณขนาดเฉยๆ (ไม่แตะ maxLines) จะกลับไปเจอบัคเดิม
→ ใช้ร่วมกันทั้ง "ไม่มีรูป" (`renderPlain`, base 0.092) และ "มีรูป" (ember/renderBorder/renderBorder2/renderPanel/drawQuoteBlock+renderMatte/renderSide/renderCenter) — `font=null`/`textSize=100` (TEXT_SIZE_DEFAULT) = พฤติกรรมเดิมเป๊ะ ไม่กระทบการ์ดเก่า
→ UI: QuoteGeneratorModal.jsx ใช้ `<input type="range">` (60-140, step 5) พร้อม debounce 350ms เหมือน color picker ไม่ใช่ปุ่ม 3 ตัวเลือกแล้ว · state `plainFont`/`textSize` ใช้ร่วมกันทั้ง 2 โหมด (มีรูป/ไม่มีรูป)

### Key Learnings (2026-08-12 — ห้องข่าวสาร: ค่าระดับ "กลุ่ม social" อยู่บนแถวบัญชี ไม่ต้องมีตารางกลุ่ม)

- `dc_social_accounts` เก็บค่าระดับกลุ่มซ้ำทุกแถวอยู่แล้ว (`group_name`, `guild_id`, `visibility`) → เพิ่ม `news_channel_id` เดินรางเดิม ไม่ต้องสร้าง `dc_social_groups`
- **ห้ามเก็บค่าระดับกลุ่มเป็น "แถวปลอม" `platform='news'`** — ตารางนี้ถูกอ้าง 23 ไฟล์/47 จุด (token sweep, `getAvailablePlatforms`, botStatus, ตะกร้า, scripts) พลาดที่เดียว = โผล่บัญชีไม่มี token ในหน้าจัดการ
- อ่านค่าระดับกลุ่มจากแถว = ยึด non-null ตัวแรก (`listPublishGroups` ทำแบบนี้กับ `guildId` มาก่อนแล้ว) เพราะแถวที่เข้ากลุ่มทีหลังยังว่าง
- **fan-out ต้องใช้ `WHERE id = ANY($ids)` จาก `listPublishGroups`** ห้าม `WHERE group_name = $1` — `group_name` เป็น free text ไม่มี constraint ซ้ำข้าม org/เจ้าของ private ได้ = เขียนข้าม tenant
- ค่า config ที่มี fallback ต้องมี **3 สถานะ** (ว่าง=ใช้ค่า fallback / มีค่า / `'off'`=ปิด) ไม่งั้น user "ล้างค่าเพื่อปิด" ไม่ได้ — มันเด้งกลับไปใช้ค่ากลาง
- ชื่อห้อง Discord **ไม่ต้องเก็บลง DB** — ดึงสดจาก `GET /guilds/{id}/channels` ด้วย bot token (cache 60s ที่ `web/lib/discordChannels.js`) ห้องเปลี่ยนชื่อแล้วชื่อที่โชว์เปลี่ยนตามเอง · ดึงไม่ได้ต้องคืน `null` ≠ `[]` ไม่งั้นกลายเป็น "ห้องหายหมด" ตอนบอทล่ม
- gate สิทธิ์ที่ **จุดตั้งค่า** ประหยัดกว่า gate ที่ **จุดใช้งาน**: ตั้งห้องข่าวให้กลุ่ม private ได้เฉพาะทีมสื่อ + กลุ่ม private ไม่ fallback → ไม่ต้องยกระบบยศไปเช็คในบอท (บอทไม่มี `isMediaTeam`)

### Key Learnings (2026-08-14 — git + gitignore ข้ามเครื่อง)

- **`git pull` กลืนทับไฟล์ที่ถูก gitignore อยู่โดยไม่เตือน** (พิสูจน์ด้วย repo ทดลอง)
  ไฟล์ **ยัง ignored** ตอน pull → git ถือว่าเป็นของทิ้งได้ → เขียนทับเงียบ ขึ้นแค่ `create mode 100644`
  ไฟล์ **เลิก ignored แล้ว** → git abort (`untracked working tree files would be overwritten`) ✅
  → ก่อนเลิก ignore ไฟล์ที่มีอยู่จริงบนอีกเครื่อง ต้องสำรองฝั่งนั้นก่อน pull เสมอ
  → `.gitattributes` `merge=union` เหมาะกับไฟล์ append-only (เช่น cerebrum.md) — เก็บทั้งสองฝั่ง ไม่มี conflict
  → ⛔ ห้ามใช้ `merge=union` กับ JSON (เช่น `buglog.json`) — จะได้ `]` ปิดสองอัน = JSON พัง

### Key Learnings (2026-08-14 — โครงสร้าง posts ที่ฟีเจอร์อื่นต้องรู้)

- **`post_episodes` มี 2 แกนสถานะ ไม่ใช่แกนเดียว** (`web/db/posts/episodes.js:42`)
  `status` = `draft`/`review`/`approved` (แกนเขียน) · published/queued = **derived** จาก `post_social_history` ไม่เก็บเป็น status
  → อะไรที่ map สถานะโพสต์ ต้องรองรับทั้ง 2 แกน

- **โพสต์ที่มาจาก Discord เริ่มด้วย `category` ว่างเสมอ** (`episodes.js:26`)
  → กฎ routing ใดๆ ที่อิง category ต้องรองรับเคส "ยังไม่จัดหมวด" ไม่งั้นโพสต์กลุ่มนี้หายเงียบ

- **`canApprove()` = `isMediaTeam()` = `admin`/`secretary_general`/`editor`** (`web/lib/postsAccess.js:41`)
  โพสต์ `approved` ถูกล็อกแก้ ต้องผ่าน `canRequestChanges()` ก่อน (บรรทัด 100, 112)
  → ฟีเจอร์ใหม่ที่เปลี่ยนสถานะโพสต์ทางอ้อม (เช่น ลากการ์ด kanban) **ต้องผ่านด่านเดิม ไม่ใช่ด่านของตัวเอง**

- **`setPostCategory` (`episodes.js:287`) เป็น dead code — ไม่มีใครเรียกทั้ง repo**
  คอมเมนต์บอกว่า *"ลากการ์ดข้ามหมวดในหน้า list"* แต่ UI นั้นไม่เคยถูกสร้าง
  → อย่าเชื่อคอมเมนต์ว่าฟีเจอร์มีจริง · `grep -rn` หา caller ก่อนเสมอ (ตรงกับบทเรียน 2026-06-30 `_roles-archive.js`)

- **โพสต์ลบได้ 2 แบบ** — `archivePost` = soft (`archived_at`) · `deletePost` (`episodes.js:334`) = **hard `DELETE FROM post_episodes`** เรียกจาก `api/posts/[id]/route.js:91`
  ส่วน **เคสไม่มี hard delete** (ไล่ทั้ง repo ไม่เจอ `DELETE FROM cases`) → FK ที่ชี้ไป post ต้องคิดเรื่อง CASCADE, ที่ชี้ไป case ไม่ต้อง

- **`setPostStatus` (`episodes.js:274`) bump `updated_at` โดยไม่เช็ค lock** — และ `updated_at` คือ optimistic lock token ของ autosave (`episodes.js:15`)
  → ฟีเจอร์ใดที่เปลี่ยนสถานะโพสต์จากนอกหน้า `/posts` จะทำให้คนที่กำลังพิมพ์อยู่โดน 409 เซฟไม่ลง

### สีทุกครั้ง = หยิบจากคลังสีของ user ห้ามคิดเฉดเอง (2026-08-17)

user มีคลังสีพาสเทลตั้งชื่อไว้ 21 ชุด ชุดละ 5 hex (memory `reference_pastel_palettes`) · รอบนี้ผมไปหยิบโทน AppFlowy/Material มาใช้เพราะคิดว่า 5 สีไม่พอกับป้าย 29 อัน → user ทักว่า "เคยส่งให้แล้วนี่ จะได้มี pattern ไม่ใช่เดาสุ่ม" แล้วบอกว่า "เหนื่อยใจ"
**ถ้าคลังสีไม่พอกับงาน ให้ถามว่าจะผสมชุดไหน ไม่ใช่เงียบแล้วไปหาสีเอง** · โซน kanban เคาะแล้ว = เทา + ชมพูอ่อน + ม่วง
เทคนิคที่ใช้: ส่ง hex เดียวเข้า CSS var `--kb` แล้วให้ `.kb-tint` ใน globals.css ผสมกับ `--card-bg` (พื้น) และดำ/ขาว (ตัวอักษร) → ได้ทั้ง light/dark จาก hex ชุดเดียว ไม่ต้องมี hex ชุดที่ 2 และไม่ต้องพึ่ง Tailwind scan

### ⛔ ห้ามเดาสเกล CSS เอง — เปิด components/calling/ มาลอกก่อนเสมอ (user โมโห 2026-08-17)

user: "css font ตอนนี้ผมไม่ consistency อีกแล้ว ไปดู calling ดิ · เบื่อจังเลยต้องมาแก้ไขซ้ำซากทุกครั้งที่ทำแอพใหม่"
อาการซ้ำ: อ่าน `md/WEB.md` แล้วคิดว่าพอ → WEB.md เดิม**ไม่มี type scale เขียนไว้** เลยเดาเอง ได้ `text-xs`/`text-[11px]`/`rounded-xl`/ปุ่ม `py-1.5 text-sm` = หลุดทั้งโซน
แก้ต้นเหตุแล้ว: เพิ่ม §Type scale ใน `md/WEB.md` (5 ขนาด · ห้าม text-xs · การ์ด rounded-lg · ปุ่ม px-4 py-2 text-base · badge px-3 py-1 text-sm · icon size=16)
**วิธีทำงานที่ถูก:** ก่อนเขียน component ใหม่ เปิด `components/calling/CampaignCard.jsx` + `SmsModal.jsx` มาลอกคลาสตรงๆ · ตรวจตัวเองด้วย `grep -rho "text-\(2xl\|xl\|lg\|base\|sm\|xs\)" <โฟลเดอร์ใหม่>` แล้วเทียบสัดส่วนกับ calling — ถ้ามี text-xs โผล่ = ผิดแล้ว

### Tailwind ไม่ได้สแกน web/lib/ (แก้แล้ว 2026-08-17 — bug-409)

`web/tailwind.config.js` content เดิมมีแค่ `app/` + `components/` → คลาสที่ประกาศในไฟล์ `lib/*.js` (จานสีชิปป้าย kanban) ไม่ถูก generate เป็น CSS · อาการหลอกมาก: สีที่บังเอิญมีไฟล์อื่นใช้อยู่แล้วจะขึ้น สีที่ไม่มีใครใช้หายเงียบ · เพิ่ม `./lib/**/*.{js,jsx}` แล้ว · **วิธี verify: build แล้ว grep hex/คลาสใน `.next/static/css/*.css`** ไม่ใช่ดูแค่ build ผ่าน
ผลพลอยได้: สีที่เก็บใน DB (`kanban_labels.color`) ต้องเป็นคลาสจากชุดที่มีในโค้ดเท่านั้น — สตริงที่ DB คิดขึ้นเองไม่มีทางถูกสแกน

### kanban: กติกา "เจ้าภาพ ↔ สถานะ" ต้องอยู่ชั้น DB ไม่ใช่ route (2026-08-17)

`setCardStatus` บังคับ "ย้ายมา backlog = ถอดเจ้าภาพ" ไว้ที่ db แล้ว แต่ขาฝั่งตรงข้าม (ตั้งเจ้าภาพให้การ์ด backlog ต้องเป็น doing) เคยอยู่ที่ route ทางเดียว → บอท/cron ที่เรียก `db/kanban/cards.js` ตรงๆ สร้าง "รอรับ + มีเจ้าภาพ" ได้ (bug-406) · ย้ายลง `setCardOwner` ครบทั้ง 2 ทางแล้ว
คนใน org 1 = **7,376 active** → ทุกกล่องเลือกคนต้องเป็น "ค้นหา (>=2 ตัวอักษร, LIMIT)" ห้าม dump dropdown · และชื่อที่โชว์ต้องใช้สูตร DISPLAY_NAME เดียวกับ `db/kanban/cards.js` ไม่งั้นเลือกชื่อนึงแล้วการ์ดขึ้นอีกชื่อ (`org_members.display_name` ≠ `users.firstname/lastname`)

### Key Learnings (2026-08-17 — จับคู่ชื่อคนตอน import)

- **`org_members` เก็บ display_name/nickname "ต่อเซิร์ฟ" ไม่ใช่ต่อคน** — org นี้มี 3 guild
  คนเดียวมีได้ 3 แถว ชื่อแสดงคนละอย่าง → **ห้าม `DISTINCT ON (user_id)` ตอนค้นชื่อ**
  ต้องค้นทุกแถวก่อนแล้วค่อยยุบเป็นรายคน ไม่งั้นชื่อที่ตรงถูกทิ้งไปก่อนได้เทียบ
  (นับจำนวนคนก็ต้อง DISTINCT — 7376 แถว = 6650 คน)

- **matcher ต้องไล่เป็นลำดับชั้น ห้ามเอาเงื่อนไขมา OR กันแล้วนับ** — ชื่อที่ตรงเป๊ะ 1 คน
  แต่มีคนอื่นเข้าเงื่อนไขหลวมด้วย จะถูกนับเป็น "ซ้ำ" แล้วไม่เติมให้
  ชั้นที่ใช้จริง: nickname > display_name > username > firstname > คำในชื่อ

- **ห้ามจับคู่ชื่อคนด้วย substring** — ชื่อเล่นสั้น 2-3 ตัวอักษรแมตช์มั่วทันที
  (Nu → moonut5376 · Ti → artidaksorn) · ผลคือการ์ดไปแขวนคออาสาที่ไม่เกี่ยวแล้วไม่มีใครรู้ตัว
  **รายงานผล matcher ต้องแยก "ตรงเป๊ะ" กับ "เดา" เสมอ** — รอบแรกรายงาน "เดาได้ 23/26" ทั้งที่ตรงจริง 1

- **ตัวตัดที่ดีเวลาชื่อซ้ำคือ "อยู่เซิร์ฟไหน"** — ทีมงานจริงอยู่ guild เล็ก (347 คน) ไม่ใช่ guild ใหญ่ (5550)
  แต่ **ห้าม hardcode guild id ในโค้ด** ให้เป็น option ที่คนรันบอก

### Key Learnings (2026-08-17 — orgchart บนเว็บ)

- **ตาราง activity ยังเป็น Discord snowflake ทั้งชุด** — `dc_activity_daily` / `dc_activity_mentions` มี `user_id`,`channel_id`,`guild_id` เป็น varchar (snowflake) ส่วน `org_members.user_id` เป็น `users.id` (int) หลัง identity split → **join ข้ามสองโลกนี้ต้องผ่าน `users.discord_id` เสมอ** ไม่งั้น `operator does not exist: character varying = integer` (bug-408) · ตรงกับ pattern "หลัง migrate ชนิดคอลัมน์ ต้อง sweep" ที่จดไว้ 2026-07-20
- **สมาชิกต่อ role อ่านจาก `org_members.roles` (ชื่อยศ คั่น comma) เท่านั้น — ไม่มีตาราง junction ที่ key ด้วย role_id เลยทั้งระบบ** · pattern ที่ใช้อยู่จริง 2 แบบ: `unnest(string_to_array(COALESCE(roles,''),','))` + `trim()` (web/db/orgMemberRoles.js) และ `(','||roles||',') LIKE ('%,'||role_name||',%')` (web/db/guilds.js getAdminGuildIds) → ของใหม่ให้ลอกแบบแรก · ข้อจำกัดที่ยอมรับแล้ว: role ชื่อซ้ำใน guild เดียวกันจะถูกนับรวม (วัดจริง 2026-08-17: guild อาสาฯ ไม่มีชื่อซ้ำเลย)
- **สเกลจริงของ orgchart config**: guild อาสาประชาชน = **138 role** (ทีมจังหวัด 81, ทีมหลัก 18, region 16, other 13, skill 10) · guild ราชบุรี = 31 role → **หน้า visualize ต้อง drill-down ทีละกลุ่ม ห้ามกางทุก role พร้อมกัน** (เคาะกับ user 2026-08-17)
- **กราฟ node ที่ป้ายเป็นภาษาไทย: ผลักกันต้องคิดเป็น "กล่อง" ไม่ใช่ "วงกลม"** — ชื่อบทบาทไทยทำให้ป้ายกว้างกว่าวงกลม 3-6 เท่า ผลักด้วยรัศมีอย่างเดียวป้ายทับกันเละทั้งที่วงกลมไม่ชน · ใช้ overlapX/overlapY แล้วดันออกทางแกนที่ทับน้อยกว่า (วัดผล: 18 ป้าย ทับ 0 คู่)
- **SVG กราฟที่ลากได้ใน React: อย่าเก็บตำแหน่งโหนดใน state** — ตอน pointermove ต้องเขียน `transform` ลง DOM ตรงๆ ผ่าน ref ไม่งั้น re-render ทั้ง tree ทุกเฟรม · แยก "ลาก" ออกจาก "คลิก" ด้วยระยะสะสม < 4px = คลิก
- **recharts ที่โปรเจกต์มีอยู่ใช้ที่เดียว** (`web/app/calling/stats/page.js` — PieChart) และ **ไม่มี force/graph layout** → งานกราฟความสัมพันธ์ต้องเขียน layout เอง ไม่ใช่ความขี้เกียจ
- **"ผังเล็กเกินไป" เกือบทั้งหมดไม่ใช่เรื่องขนาดโหนด แต่เป็น 3 อย่างนี้** (วัดจริง 2026-08-17: scale 0.23 → 1.27 เท่า โดยไม่แตะขนาดโหนดสักตัว)
  1. **viewBox ต้องมีอัตราส่วนเท่ากรอบจริงเสมอ** — `preserveAspectRatio` ปริยายคือ `xMidYMid meet` = ย่อให้พอดีด้านที่คับกว่าแล้วเว้นอีกด้านทิ้ง · viewBox จัตุรัสในกรอบ 2.3:1 = ใช้พื้นที่จริงแค่ ~40%
  2. **วางโหนดเป็นวงรีตามอัตราส่วนจอ ไม่ใช่วงกลม** — `kx=sqrt(aspect), ky=1/kx` (คงพื้นที่) + เส้นรอบวงใช้สูตร Ramanujan แทน 2πR ตอนคำนวณรัศมีจากความกว้างรวม · relax ต้องดึงเข้า "วงรี" ด้วย (`d=hypot(x/ringX,y/ringY)`, บนวง = 1) ไม่งั้นมันดึงกลับเป็นวงกลม
  3. **chrome รอบผังกินที่มากกว่าที่คิด** — หัวเรื่อง+แถวกรอง+แถวชิป+แถบปุ่มใต้ผัง = ~440px บนจอสูง 800 · ยุบชิปเข้าแถวกรอง + เอาแถบปุ่มไปลอยทับผัง (`pointer-events-none` ที่กรอบ, `auto` ที่ปุ่ม) ได้คืนมา ~150px ทุกจอ · แล้ว fitView ต้องกันแถบล่างไว้ (`TOOLBAR_H`) ไม่งั้นโหนดล่างสุดโดนบัง
- **ค่าเริ่มต้นของกราฟต้องเป็นชั้นบนสุดเสมอ** — กางรายคนทุกบทบาทพร้อมกัน = ~100 โหนด กระจายกว้างจน fit แล้วอ่านไม่ออก · ต่อจากกติกา "ห้ามกางทุก role พร้อมกัน" ที่เคาะไว้ก่อนหน้า

### Key Learnings (2026-08-17 — คลัง permission token อยู่ที่ DB `org_roles` ไม่ใช่ array ใน JS)

- `web/lib/permissions.js` `PERMISSIONS[]` **ไม่ใช่แหล่งความจริง** — เป็นแค่ตัวป้อน dropdown + validate ที่ `web/app/api/bot/roles/route.js:59,80`
- แหล่งความจริงคือตาราง **`org_roles`** (seed ที่ `scripts/migration/org-scope/00-org-roles.sql`) และมี **FK 2 เส้นชี้เข้ามา**:
  - `dc_guild_roles.permission → org_roles(key)` (constraint `fk_dc_guild_roles_permission`)
  - `org_role_defs.permission → org_roles(key)` (`11-org-access-tables.sql:42`)
- → **เพิ่ม permission token ใหม่ต้อง INSERT ลง `org_roles` ก่อนเสมอ** ไม่งั้น `syncRoleDefFromGuildRole()` ตายที่ FK violation ตอนบันทึกหน้า `/bot/roles` · แก้แค่ JS array = พังเงียบ
- `org_roles` ยังป้อนหน้าแต่งตั้ง (`/api/org/appoint` อ่าน `label_th`/`category`/`sort_order`) → token ที่ไม่มีแถวใน DB จะไม่โผล่ให้แต่งตั้งเลย
- capability `viewCalling` ใน `permissions.js:39` เป็น **dead code** — ไม่มีใครเรียก · โซน `/calling` กั้นด้วย `requireFeature(session, 'calling')` ที่ `web/app/calling/layout.js` (feature toggle ระดับ guild) ไม่ใช่ permission
- `web/app/api/calling/contacts/route.js:26` + `contacts/[id]/route.js:9` คำนวณสิทธิ์ด้วย `isAdmin || isRegionalCoordinator || isProvincialCoordinator` แทน `canSeeContacts` / `can('manageContacts')` — วันนี้ผลลัพธ์เท่ากันเป๊ะ (union ตรงกับ CAPABILITIES) แต่ถ้าเพิ่ม token ใหม่เข้า capability จะลืม 2 จุดนี้แน่นอน

### Key Learnings (2026-08-17 — ป้ายที่สีมาจาก hash ของชื่อ = ชื่อคือ primary key เชิงสายตา)

- `web/lib/kanbanLabelColors.js` เลือกสีชิปจาก `hash(กลุ่ม/ชื่อ)` เมื่อ `color` เป็น NULL → **การเปลี่ยนชื่อคือการเปลี่ยนสี**
  ทุกฟีเจอร์ที่แก้ชื่อของสิ่งที่มีสีอัตโนมัติ ต้อง**แช่ค่าที่คำนวณได้ลง DB ก่อนแก้** ไม่งั้นผู้ใช้เห็นสีทั้งหน้าสลับพร้อมกัน (bug-414)
- pattern "ลบทั้งชุดแล้วใส่กลับตามที่ client ส่งมา" (`setCardLabels`) **ปลอดภัยเฉพาะเมื่อ client เห็นของครบ**
  พอมีคอนเซปต์ "ซ่อน" เข้ามา client จะเห็นไม่ครบทันที → ต้องจำกัดขอบเขต DELETE ให้เท่ากับสิ่งที่ client มองเห็น (bug-415)
  ⚠️ กฎนี้ใช้ได้กับทุก replace-all endpoint ในโปรเจกต์ ไม่ใช่แค่ป้าย
- สีเก็บเป็น **hex ตรงๆ ใน DB ได้** — `.kb-tint` ใน globals.css ผสมสีจาก CSS var `--kb` เอง ไม่ต้องพึ่ง Tailwind scan
  (เอกสารเก่าใน PENDING เขียนว่าต้องเก็บเป็น class เต็มสตริง — **ผิด แก้แล้ว**)

### Key Learnings (2026-08-17 — ลายน้ำกับ contrast)

- `assets/watermark/org_1/ประชาชนราชบุรี/1. pplerb-white-white.png` เป็น **#FFFFFF ล้วน 100%** → ใช้ได้เฉพาะพื้นเข้ม · โพสต์แนวสแกนหนังสือราชการ (กระดาษขาว) ต้องใช้ `3. pplerb-grey-orange.png`
- ซ้ำร้าย: การ์ดที่ข้อความอยู่ล่าง (`*-bottom-*`, pillar/frame/matte) ถูกบังคับให้ลายน้ำไปอยู่**มุมบน**ทั้ง 3 มุม — ถ้าบนเป็นพื้นสว่างล้วน ลายน้ำขาวหายสนิททุกครั้ง
- **user เคาะว่าไม่ต้องทำตัวเลือกมุมแบบวัด contrast** (2026-08-17) เหตุผล: รูปแบบนี้ทั้ง 6 มุมใช้ไม่ได้อยู่แล้ว (บน=ขาว ล่าง=ตัวหนังสือ) เขียนเพิ่มก็ไม่เปลี่ยนผล — ปัญหาอยู่ที่**ตัวไฟล์ลายน้ำ** ไม่ใช่ตำแหน่ง
- วิธีจับเคสลายน้ำแบบนี้ที่ได้ผล: repro ด้วย `prepareImages()` ของงานจริงบนเครื่องนั้น แล้ว **diff พิกเซลกับต้นฉบับ + วัดความสว่างพื้นหลังตรงที่แปะ** (ดูสคริปต์ที่ใช้ใน buglog bug-417)

### Key Learnings (2026-08-18 — kanban source_url)

- **Discord jump URL ต้องมี channelId ไม่ใช่แค่ messageId** — รูปแบบ `https://discord.com/channels/{guild}/{channel}/{message}` · `handleKanbanImportStart`/`handleKanbanImportModal` (`handlers/kanbanImportHandler.js`) เป็นคนละ interaction กัน ตัวแปร `msg` ของรอบเปิด modal หายไปตอน submit → ต้องฝัง `msg.channelId` ลง customId ด้วย เดิมฝังแค่ `msg.id` พอจะประกอบ URL ไม่ได้ (เจอจาก `/scrutinize` ก่อนเขียนโค้ด)
- ฝัง URL เต็มลง customId ไม่ได้เลย ยาวเกิน limit 100 ตัวอักษรของ Discord (3 snowflake ~19 หลัก + prefix ยาวกว่า 100 พอดี) ต้องฝังแค่ channelId+messageId แล้วประกอบ URL ตอน submit จาก `interaction.guildId` แทน

### Key Learnings (2026-08-18 รอบเย็น — kanban custom field ก้อน 2)

- **Postgres CASE ห้ามผสม `json_agg`/`'[]'::json` กับ `to_jsonb()` ในกิ่งเดียวกัน** — CASE ต้องคืนชนิดเดียวกันทุกกิ่ง `to_jsonb()` คืน jsonb แต่ `json_agg` คืน json → ชน error 42846 "could not convert type json to jsonb" ทันทีที่มีแถวเข้ากิ่งนั้น (เจอจาก smoke test ไม่ใช่ error ตอน migrate เพราะ CASE ไม่ error จนกว่าจะมีข้อมูลจริงให้ประเมิน) แก้ด้วย `jsonb_agg`/`'[]'::jsonb` ให้ตรงกันทุกกิ่ง — เจอที่ `web/db/kanban/cards.js` AGG ตอนเพิ่ม select/multi_select/checklist เข้า CASE เดิมที่มี to_jsonb(number/date/checkbox) อยู่แล้ว
- **id จาก json_build_object ≠ id จาก SELECT ตรง แม้เป็นคอลัมน์เดียวกัน** — SELECT bigint ตรงๆ pg คืนเป็น string เสมอ (กันเสีย precision) แต่ `json_build_object('id', bigint_col)` ฝัง JSON เป็นเลขไม่มีเครื่องหมายคำพูด → parse ออกมาเป็น JS number ต้อง `String()` ครอบทั้ง 2 ฝั่งก่อนเทียบเสมอ (โค้ด UI ที่ทำถูกอยู่แล้ว: `LabelPicker`/`TagCombobox` ใช้ `new Set(labels.map(l => String(l.id)))`) — เจอบั๊กใน smoke test เอง (เทียบ id ตรงๆ ไม่ผ่าน String()) ไม่ใช่บั๊กใน app code เพราะ UI ครอบด้วย String() อยู่แล้วทุกจุด

### Key Learnings (2026-08-18 — avatar / ข้อมูลที่เป็นของ "บัญชี" ไม่ใช่ของ "guild")

- **ก่อนเก็บ field ลง `org_members` ให้ถามก่อนว่ามันเป็นของบัญชีหรือของ guild** · avatar เคยอยู่ผิดที่ = คนเดียวกันต้อง backfill ซ้ำทุก guild (prod 5 guild) · ย้ายมา `users` แล้ว guild ที่ไม่เคย backfill เลยได้รูปฟรีทันที (วัด 2026-08-18: 12 → 588 คน โดยไม่ได้ยิง Discord สักครั้ง)
- **URL รูป Discord ฝัง hash ไว้ → เปลี่ยนรูปเมื่อไหร่ของเก่า 404 ทันที** · ต้องมี `userUpdate` listener · **`guildMemberUpdate` ไม่ยิงตอนเปลี่ยนรูปโปรไฟล์** เพราะเป็นเหตุการณ์ระดับ user ไม่ใช่ระดับ guild (ยิงเฉพาะ nickname/ยศ/guild avatar)
- **ลำดับ COALESCE ต้องให้แหล่งที่ "สด" ชนะ** — `COALESCE(u.avatar, om.avatar)` ไม่ใช่กลับกัน · ถ้าเอาตารางเก่าขึ้นก่อน ค่าที่ค้างอยู่จะบังค่าใหม่ตลอดกาล (บั๊กเงียบคลาสสิกตอน migrate ทีละครึ่ง)
- **ถอดค่าออกต้องเขียน NULL จริง ห้าม COALESCE** — upsert ที่ COALESCE ทุก field ลบค่าไม่ได้เลย ต้องมีฟังก์ชันเขียนทับตรงๆ แยกไว้ (`setUserAvatar`)
- **คอลัมน์ที่บอทเขียนอัตโนมัติ ห้ามให้ user เขียนทับที่เดียวกัน** — วันหน้าเว็บมี "อัปโหลดรูปเอง" ต้องแยก `users.avatar_custom` แล้วอ่าน `COALESCE(avatar_custom, avatar, om.avatar)` ไม่งั้น `userUpdate` ทับรูปที่ผู้ใช้ตั้งเองหายเงียบ

### Key Learnings (2026-08-18 — ชื่อที่แปะผิดตัวคือบั๊ก ไม่ใช่เรื่องสไตล์)

- kanban เคยมี 2 concept ที่คำสลับกัน: ช่อง `cancelled` ถูกเรียก "กรุ" (แต่ยังเห็นบนกระดาน) ส่วน `archived_at`
  ที่เป็น archive จริงถูกเรียก "ลบ" และ**ไม่มีทางเข้าถึงเลย** → user จับได้เองว่าไม่ consistent (bug-416)
  บทเรียน: เวลาเพิ่ม soft-delete ต้องส่งมาพร้อม **ทางดู + ทางกู้** เสมอ ไม่งั้นข้อมูลอยู่แต่เท่ากับหาย
- ปลายทางตอนนี้: `backlog`=รอทำ · `cancelled`=พักไว้ · `archived_at`=กรุ (มีโหมด "แสดง: กรุ" + ปุ่มเอาออก)
  **key ใน DB ไม่เคยเปลี่ยนตามป้าย** — เปลี่ยนคำ = แก้ locales + คอมเมนต์ ไม่ต้อง migration

### Key Learnings (2026-08-18 — AppFlowy เก็บ field ยังไงจริงๆ)

- **Postgres ของ AppFlowy-Cloud ไม่มี schema ของ field** — อยู่ใน collab document (CRDT blob) + MinIO → `pg_dump` ไม่ช่วย อย่าเสียเวลาแกะ docker
- ของจริงในซอร์ส: `Field { field_type(0..7), type_options: Map<FieldType,TypeOption> }` · cell = `(row_id, field_id) → ค่าก้อนเดียว`
- **ลอกได้:** ชุดชนิด · `type_options` เก็บ config ของทุกชนิดที่เคยเป็น (สลับชนิดไปกลับไม่เสียค่า) · options ของ select อยู่ในตัว field ไม่ใช่คลังกลาง
- **ลอกไม่ได้:** cell เป็น blob ก้อนเดียว — เขาคำนวณในเครื่องบน CRDT ส่วนเราต้อง `WHERE`/`SUM`/เรียง บน Postgres → ต้องแยกคอลัมน์ตามชนิด

### Key Learnings (2026-08-19 — ESLint ลงแล้ว ทั้งบอทและเว็บ)

- **มี ESLint แล้ว** — flat config 2 ตัวแยกกัน: `eslint.config.mjs` (root = บอท, node/CJS) และ `web/eslint.config.mjs` (React/Next)
  รัน: `npm run lint` (แต่ละฝั่ง) · `npm run lint:all` ที่ root = ทั้งสองฝั่ง
- **ปรัชญาของ config นี้: จับบั๊กจริงเท่านั้น ไม่ใช่ตำรวจสไตล์** — `no-undef` เป็น error, `no-unused-vars` + `exhaustive-deps` เป็น warn
  rule สไตล์ (`no-img-element`, `no-empty`, `no-useless-escape`, `no-irregular-whitespace` ฯลฯ) ปิดหมด
  → **ห้ามเปิด rule สไตล์เพิ่มโดยไม่ถาม** เหตุผลคือ เสียงรบกวนเยอะ = ไม่มีใครอ่าน = ตาข่ายพัง
- baseline ตอนติดตั้ง: **web 0 error / 97 warn · bot 0 error / 42 warn** → ถ้าเห็น error แปลว่าของใหม่ ไม่ใช่หนี้เก่า
- **`sourceType: 'module'` ทั้ง root** — ไม่ใช่ `'commonjs'` เพราะ Node 22+ ตรวจ ESM/CJS จากเนื้อไฟล์เอง
  โปรเจกต์นี้มี `.js` ทั้งสองแบบปนกันจริง (`config/callingCategories.js` เป็น ESM เพราะเว็บ import ไปใช้ · `scripts/docs/*.js` ก็ ESM)
  `'commonjs'` จะ parse error 5 ไฟล์ · `'module'` อ่านได้ทั้งคู่ (require/module/__dirname มาจาก `globals.node`)
- `reportUnusedDisableDirectives: 'off'` — โค้ดเก่ามี `// eslint-disable-next-line` ค้างจากยุคก่อนมี ESLint ~13 จุด ไม่ใช่บั๊ก

### Key Learnings (2026-08-19 — import AppFlowy รอบจบ · ระบบป้ายหายไปจาก DB แล้ว)

- **`kanban_labels` / `kanban_card_labels` ถูก DROP แล้ว** — ไม่มีตารางนี้อีกต่อไปบน dev
- **ลิงก์ดิสคอร์ดของการ์ด = `kanban_cards.source_url`** (ช่องประจำ บอทใช้ช่องเดียวกัน) **ห้ามทำ custom field ซ้ำ**
  เช่นเดียวกับ **ลิงก์โพสต์เฟซบุ๊ก = โมดูล posts** ห้ามทำ field ซ้ำใน kanban (user เคาะ 2026-08-19)
  → กติกาทั่วไป: ก่อนสร้าง custom field ใหม่ ให้เช็คก่อนว่ามี "ช่องประจำ" หรือโมดูลอื่นถือของนั้นอยู่แล้วไหม
- **`createFieldDef()` เดิมไม่ตั้ง `sort_order`** → field ใหม่ทุกอันได้ 0 แล้วลอยไปแทรกกลางตาราง
  แก้เป็น MAX+1 แล้ว 2026-08-19 (กระทบปุ่ม "เพิ่มช่องข้อมูล" ในเว็บด้วย ไม่ใช่แค่สคริปต์)
- **`blocked` / `blocked_reason` ถูก DROP ออกจาก `kanban_cards`** — ฟีเจอร์ "ติดปัญหา" ตายสนิทแล้ว
- xlsx ของ AppFlowy: **คอลัมน์ Checklist เป็น % (`0.73`) ไม่มีตัวข้อความ** — กู้ไม่ได้ถาวร อย่าเสียเวลาลองอีก
- `ref_no` = `MAX()+1` ต่อ org → TRUNCATE แล้วเริ่ม K-1 ใหม่เอง ไม่ต้องรีเซ็ต sequence

### ชื่อคนที่โชว์ทั้งระบบ (2026-08-19)

- **สูตรเดียวอยู่ที่ `web/db/displayName.js`** — `displayNameSql(userAlias, orgExpr)` คืน SQL fragment
  ลำดับ: `org_members.display_name` → `org_members.nickname` → `users.firstname lastname` → `users.username`
- **ทำไมไม่เริ่มที่ชื่อจริง:** org 1 มี active 7,490 คน แต่มีชื่อจริงแค่ 1,402 (19%) · display_name มี 7,100 (95%)
  เริ่มที่ชื่อจริง = 81% ตกไปโชว์ username ดิบ (`mark30260`) ซึ่งไม่มีใครรู้ว่าใคร
- ⚠️ **`org_members` มีได้หลายแถวต่อ 1 คนใน org เดียว** — แยกแถวต่อ guild และ org 1 คร่อม 3 guild
  (708 คนมีแถวซ้ำ) → subquery ต้อง `ORDER BY om.id LIMIT 1` เสมอ ไม่งั้น error 21000 ตอน runtime
  เลือก id น้อยสุด = **ตัดสินใจเหมือนเดิมทุกครั้ง** ไม่ใช่ "ถูกที่สุด" (ชื่อกระพริบสลับหาสาเหตุยากกว่า)
- ยังมีอีก 3 จุดที่ยังใช้สูตรเก่าอยู่ (`db/posts/episodes.js` ×2, `db/posts/aiSuggestions.js`) — ยังไม่ได้ย้าย

### กล่องเลือกคน — @username เป็นบรรทัดรอง ห้ามต่อเข้าไปในชื่อ (2026-08-19)

org 1 มีคนชื่อ "Ploy" 6 คน "Oat" 3 คน → กล่องค้นหาต้องมีตัวแยก
แต่ถ้าต่อเป็น `name (@username)` ก้อนเดียว **ชิปที่ติดบนการ์ดจะติด `(@…)` ไปด้วยตอน optimistic render**
→ ส่งเป็น field แยก (`sub`) ให้ combobox วาดเป็นบรรทัดรองในลิสต์เท่านั้น

### สคริปต์ import ที่ map คนแบบ "ข้ามถ้าจับคู่ไม่ได้" = เลื่อนคนผิดขึ้นเป็นเจ้าภาพเงียบๆ (2026-08-19)

`scripts/import/kanbanFromAppflowy.mjs` เอา "คนแรกในคอลัมน์" เป็นเจ้าภาพ แล้ว `.filter(Boolean)` ก่อน
→ `"Mek, Mark"` ที่ Mek เป็น null กลายเป็น **Mark เป็นเจ้าภาพ** ทั้งที่ไม่ใช่ · user จับได้เอง ("mark30260 เหมือนจะผิดคน")
บทเรียน: **ชื่อที่จับคู่ไม่ได้ต้องทำให้การ์ด "ไม่มีเจ้าภาพ" ไม่ใช่เลื่อนคนถัดไปขึ้นมา** —
ไม่มีเจ้าภาพเห็นชัดว่าต้องแก้ ส่วนเจ้าภาพผิดคนดูเหมือนถูกต้องทุกประการ

### endpoint "ดูโปรไฟล์คนจาก userId" ต้อง gate ด้วย org_members ก่อนเสมอ (2026-08-20)

`displayNameSql()` fallback ไปที่ `users.firstname/lastname/username` และ `users.avatar` (คอลัมน์ source-of-truth
ใหม่ 2026-08-18) **ทั้งคู่ไม่ผูก org เลย** เป็นคอลัมน์ global บนตาราง `users` ตรงๆ
→ endpoint ไหนก็ตามที่รับ `userId` จาก client แล้วคืนชื่อ/avatar โดยไม่เช็คก่อนว่า userId นั้นเคยอยู่ org ของผู้ถามจริง
จะกลายเป็น **user-enumeration ข้าม org** ทันที (ไล่เลข userId ดูชื่อจริง+รูปคนทั้งระบบได้ ไม่ใช่แค่คนใน org ตัวเอง)
ต้อง `WHERE EXISTS (SELECT 1 FROM org_members WHERE user_id=$userId AND org_id=$callerOrgId)` ก่อนคืนค่าเสมอ
(เจอตอนออกแบบ `getPersonProfile()` ใน `web/db/kanban/people.js` — จับได้จากการไล่ trace เอง ไม่ใช่ user ทัก)
ตรรกะเดียวกับที่ `kanbanGuard.js` ใช้กันการ์ดข้าม org (404 ไม่ใช่ 403) — ใครทำ "ดูของคนอื่นจาก id" ต่อไปให้ลอกแบบนี้

### `org_ai_prompts` kind='slot' (posts.*, case.*) ไม่มี UI แก้เลยสักช่อง จนถึง 2026-08-20

`web/db/orgAiPrompts.js` มีครบ `getPrompt/listPrompts/setPrompt/resetPrompt` พร้อมใช้ (per-org override, org_id ไม่ NULL)
แต่ **ไม่มี route/page ไหนเรียก `listPrompts`/`setPrompt` เลย** — prompt ของ posts.compose/case.letter_draft ฯลฯ
แก้ได้แค่จากโค้ด `config/aiPrompts.js` เท่านั้น ทั้งที่ดีไซน์ไว้ให้ org แก้ทับได้แล้ว (คนละระบบกับ `org_ai_prompts` kind='mode'
ที่มี UI ที่ `/bot/ai` ModesSection — นั่นแก้ **ชุดกลาง** org_id IS NULL คนละคอลัมน์ unique กันคนละ path)
→ เพิ่ม slot ใหม่ (`bot.ai_mention`, 2026-08-20) ต้องสร้าง route เองเสมอ ใช้ `getGuildId(session)` → `orgIdOfGuild()`
resolve orgId (guild-first เหมือน `/api/bot/features` ไม่ใช่ org switcher) แล้วเรียก `setPrompt(orgId, value, head)` ตรงๆ
ดู `web/app/api/bot/ai-mention-prompt/route.js` เป็นแบบอ้างอิง — ถ้าจะเปิดแก้ posts.*/case.* ทีหลังก็ลอกทรงนี้ได้
(orgId=null ใช้กับ setPrompt ไม่ได้ — ON CONFLICT ของฟังก์ชันนี้ผูกกับ index ที่ `WHERE org_id IS NOT NULL` เท่านั้น)

### เทส UI local ด้วย Playwright + คุกกี้จาก curl magic-link login — ใช้งานได้จริง ไม่ต้องขับ browser ทำ OAuth (2026-08-21)

ต่อยอด [[reference_local_browser_test_login]] (mint token ลง `org_login_tokens` ตรงด้วย psql ห้ามยิง endpoint จริง = สแปมเมล):
1. เปิด dev server แยกพอร์ต (`NEXT_DIST_DIR=.next-test npx next dev -p 3100`) กัน `.next` ชนกับที่ user รันอยู่พอร์ต 3000
2. login ผ่าน next-auth ด้วย curl ล้วนได้ ไม่ต้องพึ่ง browser เลย: `GET /api/auth/csrf` เอา csrfToken →
   `POST /api/auth/callback/magic` ด้วย `csrfToken` + `token` (จาก org_login_tokens) + `json=true` → คุกกี้ session ลง cookie jar (`curl -c`)
3. เอาคุกกี้ไฟล์นั้นไปโหลดใส่ Playwright context (`context.addCookies(...)`) แล้วเปิดหน้าเว็บจริง — ได้ browser ที่ล็อกอินแล้วโดยไม่ต้องเดิน OAuth flow
4. `npm install playwright@latest` ในโฟลเดอร์ scratchpad เร็วมาก (ไม่โหลด browser binary ใหม่) เพราะเครื่องนี้มี chromium cache ที่ `~/.cache/ms-playwright` ตรงเวอร์ชันอยู่แล้ว

**⛔ กับดัก:** ไฟล์คุกกี้แบบ Netscape (`curl -c`) ที่ curl เก็บมาจะขึ้นต้นบรรทัดด้วย `#HttpOnly_<domain>` สำหรับคุกกี้ที่มี
flag HttpOnly (next-auth session/csrf ทุกตัวเป็นแบบนี้) — ถ้า parse ไฟล์แล้ว filter บรรทัดที่ขึ้นต้นด้วย `#` ทิ้งแบบไม่คิด
จะเผลอกรองคุกกี้จริงออกหมด (เจอเอง: `cookies.filter(l => !l.startsWith('#'))` ทำให้ array คุกกี้ว่างเปล่า login ไม่ติดเงียบๆ)
ต้อง filter ด้วย `l.includes('\t')` แทน (คอมเมนต์จริงของไฟล์ไม่มี tab) แล้วตั้ง `httpOnly: domain.startsWith('#HttpOnly_')` ตรงๆ

การทดสอบวิธีนี้จับบั๊กจริงได้ 1 ตัว (ดู Do-Not-Repeat "3-state cycle") ที่ eslint/build/vitest ผ่านหมดแต่พังตอนคลิกจริง — ยืนยันว่า
"เทสอัตโนมัติ + build ผ่าน" ไม่พอสำหรับ interaction ที่มี state cycle หลายจังหวะ ต้องคลิกจริงเสมอ (ตรงกับกฎ CLAUDE.md §UI testing)

### PDF ใบสำคัญรับเงิน — พื้นที่ท้ายหน้าไม่คงที่ (2026-08-24)

- ทุก surface ของ docs (`/docs/sign/[token]`, `/api/docs/sign/pdf`, `/api/docs/sign/preview(-img)`, `/dl/<t>/receipt`, `/api/docs/projects/[id]/export`) เรียก **`generateEntryPdf()` ตัวเดียวกันหมด** — แก้ layout ที่ `web/lib/generatePdf.js` ที่เดียวเปลี่ยนครบทุกหน้า ไม่ต้องไล่แก้ route
- **พื้นที่ว่างท้ายใบไม่คงที่** ขึ้นกับ `item_type` (body template คนละไฟล์) + ความยาว `description` + **มีลายเซ็นจริงหรือยัง** (รูปลายเซ็นที่ inject ผ่าน `{%sig}` ทำให้บรรทัดสูงขึ้น ดันเนื้อหาตกหน้าใหม่) → วัดจากใบที่ยังไม่เซ็นแล้วสรุปเป็นค่าคงที่ = พลาด
- เทส layout PDF ในเครื่อง dev ได้โดยไม่ต้องมี DB: เขียน `.mjs` เรียก `generateEntryPdf()` ตรงๆ ด้วย entry ปลอม แล้ว `pdftoppm` เป็นรูปมาดู — **ต้อง `cd web` ก่อนรัน** เพราะ `idCard.js` หา font จาก `process.cwd()/../assets/fonts`
- ช่องลงชื่อผู้รับ/ผู้จ่ายอยู่ฝั่งขวา (x≈290pt ขึ้นไป) → มุมล่างซ้ายเป็นที่ว่างประจำของทุก template ใช้วางบล็อกสำเนาบัตรได้
- `buildCertifyBlock()` cap ความสูงลายเซ็นด้วย `sigMaxH` แบบไม่ลดความกว้าง → ถ้า `sigW/3 > sigMaxH` ลายเซ็นจะ**ถูกบีบสัดส่วน** (ลายเซ็น normalize มาเป็น 3:1 เสมอ) ตั้งค่าให้ `sigW/3 ≤ sigMaxH`

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- **[2026-07-17] ห้ามอ่าน/แก้/ขับงานจาก `NOTE.md`** — เป็น scratchpad ส่วนตัวของ user (คำถาม/ไอเดียดิบ) ไม่ใช่ backlog. user ย้ำ 2 รอบ. backlog + design ที่เคาะแล้ว = `md/PENDING.md` เท่านั้น. ต้นทุกงานเปิด PENDING หางานถัดไป
- **[2026-07-25] Discord `@everyone`/`@here` ในเธรด → ปิงเฉพาะคนที่ join เธรดนั้นเท่านั้น** (user ยืนยันจากการใช้จริง). ไม่ใช่ทั้ง server และไม่ใช่ทุกคนที่เห็นห้อง — ต้องเป็นสมาชิกเธรด (โพสต์/ถูกดึง/ถูก mention เข้ามาแล้ว) ถึงจะโดน. `@here` = เหมือนกันแต่เฉพาะคน active. **หมายเหตุ: รอบนี้ผมตอบวน 2 ที (แรกถูก กลางผิดว่า scoped-by-channel-access) — ยึดกฎนี้: thread-member-scoped**. นี่คือเหตุผลที่ `/user mention` มีค่า = mention รายคน → ดึง join เธรด → หลังจากนั้น `@everyone` ในเธรดถึงจะครบกลุ่ม
- **[2026-06-24] `/docs/[id]` URL ใช้ `act_event_cache.id` ไม่ใช่ `docs_projects.id`** — `docs_projects.id` ไปถึงแค่หลักสิบ, `act_event_cache.id` อยู่ในหลักร้อย. page.js ใช้ `eventCacheId` เป็นชื่อตัวแปรเพื่อความชัดเจน. ถ้าต้อง query ด้วย project id ให้ดึงจาก `getDocProjectByEventId(eventCacheId)` ก่อน
- **[2026-06-30] ก่อนลบ/ย้ายไฟล์ script ต้อง `grep -rn` หา reference ทั้ง repo ก่อนเสมอ** — อย่าเชื่อ description ใน anatomy.md อย่างเดียว. เคสจริง: `scripts/migration/_roles-archive.js` ถูก mark ว่า "ARCHIVED ข้อมูลถูก seed แล้ว" แต่ `seed-guild-roles.js` ยัง `require('./_roles-archive')` ใช้เป็น **data source** อยู่ — ลบแล้วพัง. "archived" = data ลง DB แล้ว ≠ ไฟล์ไม่ถูกใช้. นอกจากนี้ ย้าย script ที่ใช้ `__dirname`/`import.meta.url` + relative path (`../`) ต้องบวก `../` ตามระดับที่ลึกขึ้น (เช่น `../web` → `../../web`); แต่ script ที่ใช้ `sys.argv`/cwd-relative/absolute path ไม่กระทบ

- **[2026-07-05] discord.js `PermissionsBitField#add()` ไม่ mutate — คืน instance ใหม่** — เขียน `role.permissions.add(...)` แล้วเช็ค `role.permissions.has(...)` ซ้ำหลัง `setPermissions()` จะได้ค่าเก่า (stale) เสมอ ต้องเก็บ return value ของ `role.setPermissions()` (คืน Role ที่อัปเดตแล้ว) มาเช็คแทน — เจอตอนรัน `grantModPermissions.js` บน production แล้ว log "หลัง" โชว์ false/false ทั้งที่ API call สำเร็จจริง
- **[2026-07-05] Script ที่แก้ live permission/role บน production ต้อง dry-run กับ test guild ก่อนเสมอ** — มี test guild ("PPLE Test") อยู่แล้วในมือ ควรรันพิสูจน์ logic ให้ถูกก่อนส่ง command ให้ user รันจริงบน production ไม่ใช่ส่งให้รันเลยแล้วมาแก้ทีหลัง
- **[2026-07-06] ห้ามแนะนำ "รันทั้งไฟล์ migration.sql เพราะ idempotent ปลอดภัย" แบบเหมา** — idempotent (รันซ้ำได้ไม่พัง) ≠ deploy-compatible (โค้ดปัจจุบันบน prod ยังรันได้หลัง migration) เคสจริง: บอก user รันทั้งไฟล์เพื่อแก้ bug อื่น แต่ท้ายไฟล์มี block DROP COLUMN ของ feature ที่ **โค้ดยังไม่ได้ deploy** (docs token consolidation) → โค้ดเก่าที่ query column เดิมพังทันที (Internal Server Error ทั้งหน้า) ต่อไปต้อง: (1) เช็คว่า migration block ไหนมี DROP/RENAME COLUMN แล้วแยกเตือนเป็นพิเศษ ห้ามมัดรวมกับ block อื่นที่ปลอดภัยกว่า (2) ถ้า feature นั้นยังไม่ deploy code — บอกให้รันเฉพาะ block ที่จำเป็นกับ bug ที่กำลังแก้เท่านั้น ไม่ใช่ "รันทั้งไฟล์"

- **[2026-07-28] ห้ามรัน `npm run build` ใน `web/` ขณะที่ `next dev` ยังรันอยู่** — ใช้ `web/.next/` ร่วมกัน production build เขียนทับโครงของ dev → **ทุกหน้า 500** ด้วย `TypeError: Cannot read properties of undefined (reading 'call')` รวมหน้าที่ไม่ได้แก้ ทำให้เข้าใจผิดว่าโค้ดใหม่พัง (จริงๆ build ผ่าน exit 0). วิธีเช็คว่าใช่เคสนี้: curl หน้าที่ไม่ได้แตะเลย ถ้า 500 ด้วย = cache พัง ไม่ใช่โค้ด. แก้: `rm -rf web/.next` + restart dev. **ป้องกัน: verify ด้วย curl บน dev server ที่รันอยู่ (dev คอมไพล์ให้เอง) อย่าเรียก build — และถ้าจะ spawn subagent อย่าสั่งให้มันรัน build ด้วย**

- **[2026-07-30] ⚠️ ทำผิดกฎข้างบนซ้ำ — รัน `npx next build` ทั้งที่ `next dev` รันอยู่ 2 ตัว (:3000, :3001)** → `/posts` ตอบ 404 ทั้งคู่. กฎนี้อยู่ใน cerebrum อยู่แล้วแต่ไม่ได้อ่านก่อนกด. **เช็ค `pgrep -af "next dev"` ก่อน build เสมอ** — ถ้ามี dev อยู่ ให้ verify ด้วย `curl` บน dev server แทน (dev คอมไพล์เอง)
- **[2026-07-30] อย่าตีความ "ไฟล์เก่า = ยกเว้น i18n" เอง** — รื้อ render ใหม่ทั้งก้อนใน `PostsHome.jsx` แล้วเขียนข้อความไทยใหม่ ~15 ประโยคแบบ hardcode, user ทัก. เส้นที่เคาะแล้วอยู่ใน `CLAUDE.md` §i18n: **เพิ่ม/เปลี่ยนข้อความที่ผู้ใช้เห็น ≥3 ประโยค หรือรื้อ block render ทั้งก้อน = โค้ดใหม่ → ต้อง `t()` ทั้งไฟล์** · ถ้าเลี่ยงเพราะทั้งโซนยังไม่ migrate ต้องจดลง `md/PENDING.md` ทันที ห้ามปล่อยเงียบ

### Do-Not-Repeat (2026-07-08)

- gogo: ห้ามใช้ `interaction.message.id` เป็น roster key — churn ทุก sticky repost. ใช้ `btnSid(interaction)` (sid จาก customId, fallback message.id)
- Local test DB หลัง import: id sequence เพี้ยน → ต้อง `setval(pg_get_serial_sequence(...), MAX(id))` ก่อน insert

### Do-Not-Repeat (2026-07-09) — anti-spam staff-exempt scope bug

- เขียน `isStaffExempt()` (ManageMessages permission) แล้วเอาไปกันทุก trigger reason รวม honeypot — ผิด เพราะ Administrator (ซึ่งมี ManageMessages ด้วย) bypass channel overwrite ทุกอันอยู่แล้ว รวม Quarantine role's SendMessages deny → ถ้า exempt honeypot ด้วย honeypot จะจับ hacked-Admin ไม่ได้เลย (เคสหลักที่ตั้งใจจับ)
- แก้: staff-exempt ใช้เฉพาะ mass-mention/duplicate-cross-channel เท่านั้น ห้ามใช้กับ honeypot — ไม่มีเหตุผลที่ staff จริงจะโพสต์ในห้องที่ซ่อนจากสมาชิกทั่วไป
- เจอจาก user ถามคำถามง่ายๆ "ผมพิมพ์ใน honeypot ได้ไหมเพราะเป็น admin" — เตือนใจว่า exemption logic ที่ครอบทุก signal เหมือนกันหมด ต้องเช็คแยกทีละ signal ว่า threat model ของมันคืออะไร ไม่ใช่ apply exemption แบบเหมารวม

### Do-Not-Repeat (2026-07-09 — i18n migration)

- ตัวแปรลูปชื่อ t (เช่น items.map(t => ...) ที่ t=transaction) จะบัง translation hook const t = useTranslations() -> migrate i18n ต้อง precompute label เป็น const ก่อนเข้าลูป ห้าม rename t transaction ทั้งไฟล์
- custom agent ใน .claude/agents/*.md โหลดตอนเปิด session เท่านั้น สร้างเสร็จ session เดียวกันเรียกด้วยชื่อไม่ได้ (Agent type not found) ต้องใช้ general-purpose + inline instructions ไปก่อน session หน้าถึงเรียกชื่อได้

### Do-Not-Repeat (2026-07-15)

- **อย่า curl-verify กับ dev server ที่ค้างมานาน** — dev server รันมาตั้งแต่ 14 ก.ค. ทำ `/api/*/csrf` คืน 500 (mask ด้วย `_document.js` ENOENT = stale `.next`, ไม่ใช่บั๊กโค้ด) ทั้ง PPLE+org. ground truth = `next build` (ผ่าน) แล้ว restart dev + `rm -rf .next` → csrf 200 ทั้งคู่. เจอ `_document.js ENOENT` ในเว็บ App-Router = stale dev ให้ restart ก่อน debug โค้ด

### Do-Not-Repeat (2026-07-17 — grep external callers)

- **[2026-07-17] ตอนหา caller ของ module ที่กำลัง repoint ห้ามใช้ `grep -v <module-path>`** — มันกรอง import line (ที่มี path นั้น) ทิ้งเอง → พลาด caller. เคสจริง: repoint db/finance เป็น org-scope, grep external caller ด้วย `grep -v db/finance` → พลาด app/page.js (home dashboard) ที่ส่ง guild_id ให้ getAccountsAll → runtime crash "out of range for integer". ต้อง grep importers ตรงๆ แล้วดู list เต็ม. **build ไม่จับ** class นี้ (JS untyped: string ผ่าน compile พังตอน SQL) → repoint แบบ guild_id→org_id ต้องเทสหน้าที่ render จริง ไม่ใช่แค่ build.

### 2026-07-20 — หลัง migrate ชนิดคอลัมน์ (guild snowflake → INT id) ต้อง sweep 4 pattern นี้เสมอ

1. `COALESCE(<int_col>, '')` ที่ตกค้างจากยุค VARCHAR → 500 ทันที (`invalid input syntax for type integer: ""`)
2. `WHERE col = $n` ที่ param เป็น text แต่ column เป็น INT → `operator does not exist: integer = text` (error แม้ param เป็น null เพราะ Postgres resolve type ตอน plan) → cast `$n::int`
3. **ฟังก์ชันที่ signature ไม่มี orgId** จะรอด sweep รอบแรกทั้งดุ้น (ยังฝัง `process.env.GUILD_ID` ข้างใน) — grep `process.env.GUILD_ID` ปิดท้ายทุกครั้ง
4. client map/lookup ที่ key ด้วย id เก่า (`usersMap[u.discord_id]`) — พังเงียบ แสดงเลข id แทนชื่อ + ลิงก์ Discord ผิดคน

### 2026-07-20 — เทสในเบราว์เซอร์บน localhost: อย่ายิง endpoint ที่ส่งอีเมล

`/api/org/auth/magic` ส่ง SMTP จริง (ไม่ใช่ stub แล้ว) — ลูปเทส Playwright ยิงซ้ำ = สแปมกล่องเมล user · ให้ mint token ลง `org_login_tokens` ด้วย psql แล้วเปิด `/org/verify?token=` แทน

### 2026-07-21 — rename ตาราง = constraint/index ไม่ได้ย้ายตามความหมาย

`dc_members` → `_dc_members` แล้วยกคอลัมน์ไป `org_members`: คอลัมน์ย้ายครบแต่ **unique index ค้างอยู่กับตารางเก่า** → โค้ดที่ดัก `23505` กลายเป็นโค้ดตาย พังเงียบ (ใครก็ claim เลขสมาชิกซ้ำได้) · **หลัง split/rename ทุกครั้ง: `SELECT indexdef FROM pg_indexes WHERE tablename IN (old,new)` เทียบว่า constraint ตามมาครบไหม**
ถ้าเงื่อนไขใหม่ index แสดงไม่ได้ (เช่น "หนึ่งค่าต่อ org ต้องเป็นของ user เดียว" แต่ user ถือหลายแถว) → trigger + `RAISE ... USING ERRCODE='unique_violation'` ให้ catch เดิมทำงานต่อได้ ไม่ต้องรื้อโครง

### 2026-07-21 — รวม upsert หลาย caller เป็นฟังก์ชันเดียว = ระเบิดข้อมูลเงียบ

เดิมแต่ละ caller เขียน SQL ระบุคอลัมน์ของตัวเอง (ไม่แตะ field คนอื่น) · พอรวมเป็น `upsertMember(guildId, data)` ที่ `SET` ทุกคอลัมน์ → caller ที่ส่งแค่บาง field ล้างที่เหลือเป็น NULL (ล้าง `member_id` จริงมาแล้ว) · **upsert รวมศูนย์ต้องสร้าง column list จาก key ที่มีจริงใน data (`data[c] !== undefined`) เสมอ**
คู่กัน: **ห้าม `node -e "require('scripts/xxx.js')"` เพื่อดึงฟังก์ชันมาเทส** — สคริปต์ CLI ที่มี `client.login()` top-level จะรันจริงทันที (เผลอ sync 5,308 แถวมาแล้ว)

### Do-Not-Repeat (2026-07-21)

- **อย่าสรุปกลไกสิทธิ์จากชื่อฟังก์ชัน/คอลัมน์ แล้วรายงาน user** — เคยบอก user ว่า "manual payer list อ่าน web_roles ได้ ✅ / role-based ❌" ทั้งที่จริงพังทั้งคู่ (web_roles ไม่ให้ scope) · ต้องเปิด resolveAccess.js อ่านจริงก่อนพูด
- **subagent ที่ repoint identity: ต้องสั่งให้ไล่ "ชนิดข้อมูล" ไม่ใช่แค่ชื่อฟิลด์** — เปลี่ยน key จาก string (snowflake) → number (users.id) แล้ว `key.startsWith('__')` = TypeError หน้าพังทั้งหน้า · grep `.startsWith(`/`.includes(`/`.split(` บนตัวแปรที่เคยเป็น id · และ `<select>` คืน string เสมอ ต้อง `Number()` ก่อนเทียบ
- **อย่ารัน `npm run build` ใน web/ ตอน dev server ของ user รันอยู่** — มันเขียนทับ `.next` ทำให้ dev server 500 ทั้งเว็บ · ถ้าต้อง verify ให้เปิด dev server พอร์ตอื่นเอง แล้วบอก user ว่าต้อง restart ตัวเขา

### Do-Not-Repeat (2026-07-22)

- `npm run build` ใน web/ หลังลบ route: ต้อง `rm -rf .next` ก่อน ไม่งั้น prerender พังที่ route
  ที่ไม่เกี่ยวกันเลย (`/api/admin/logs`, `/404`) — อาการหลอกให้ไปไล่ผิดที่
- vitest 4: `--exclude` จาก CLI **merge** กับ config ไม่ override → กัน live test ด้วยวิธีนี้ไม่ได้ ต้องแยก config

### Do-Not-Repeat (2026-07-22)

- default ของ config 2 ที่ไม่เหมือนกันได้: guild ไม่มีแถว = **ปิดหมด** · org ไม่มีแถว = **เปิดหมด**
  → migration ต้องเขียนแถวให้ทุก org แม้ค่าจะว่าง (`[]`) ไม่งั้น org ที่เคยปิดหมดจะเปิดหมดเงียบๆ
- ตอนตัด key ออกจาก TOGGLEABLE อย่าให้ PATCH เขียนทับทิ้งค่าเดิม — ค่าเก่าเป็นต้นทางของ migration

### Do-Not-Repeat (2026-08-07) — ห้ามป้อนวันที่แบบ th-TH ให้ AI parse กลับเป็นข้อมูล

`new Date(x).toLocaleString('th-TH')` **default เป็นปี พ.ศ. (+543)** — ใช้แสดงผลตรงให้คนอ่านได้ปกติ
แต่ถ้าเอาไปป้อนเป็น context ให้ AI แล้วสั่งให้ AI สกัดวันที่กลับมาเป็น ISO/ข้อมูลเก็บ DB (เช่น
`services/caseTimeline.js` ป้อน log ข้อความ Discord ให้ AI สกัด `occurred_at`) — AI ไม่รู้ว่าต้องลบ 543
กลับ จะยัดเลขปี พ.ศ. เป็น ค.ศ. ตรงๆ → ข้อมูลที่บันทึกเพี้ยน +543 ปี (ถ้าฝั่งแสดงผลทำ th-TH ซ้ำอีกที
จะเพี้ยนสะสม +1086 ปี — bug-086, `case_timeline.occurred_at` ปี 3108/3111 ที่ user เจอ)
→ **วันที่ที่จะป้อนให้ AI parse กลับ ต้องใช้ `{ calendar: 'gregory' }` เสมอ** (`new Date(x).toLocaleString('th-TH', { calendar: 'gregory' })` ยังได้ชื่อเดือนไทยแต่ปีเป็น ค.ศ.) หรือส่ง ISO ตรงๆ ไปเลย
→ เช็คด้วย: grep `toLocaleString('th-TH')` ทุกจุดที่ output กลายเป็น **input ของ AI ครั้งที่ 2** ไม่ใช่แค่แสดงผลจบที่จอคน

### Do-Not-Repeat (2026-08-07 — posts: bigint id ฝั่ง API + drag บนมือถือ)

- **ห้าม validate id ที่มาจาก client ด้วย `Number.isInteger(n)` ตรงๆ ถ้าคอลัมน์เป็น `bigint`** — node-postgres คืน int8 เป็น **string** (ไม่มี type parser ใน `web/db/index.js`) → ค่าที่ client ส่งกลับมาเป็น string เสมอ แล้ว validate ตกทุกครั้ง. เคสจริง: `PATCH /api/posts/[id]/media` ตอบ 400 มาตลอด = ลากเรียงรูปไม่เคยถูกบันทึกเลย และไม่มีใครรู้เพราะ client `.catch(()=>{})`. ทำ `raw.map(Number)` ก่อนเช็คเสมอ (ตารางที่ id เป็น bigint: `post_episodes`, `post_episode_media`, `post_assets`)
- **`fetch(...).catch(() => {})` = กลืน 4xx เงียบ** — `fetch` ไม่ reject เมื่อ status 4xx/5xx, `.catch` จับแค่ network error. ทุกที่ที่เขียนข้อมูล ต้องเช็ค `res.ok` แล้วโชว์ error + sync state กลับ ไม่งั้นบั๊กจะซ่อนได้เป็นเดือน
- **HTML5 drag-and-drop (`draggable`/`onDragStart`) ไม่ทำงานบนจอสัมผัสเลย** — งานเรียงลำดับต้องใช้ Pointer Events (`setPointerCapture` + `document.elementFromPoint().closest('[data-...]')`) และลากจาก "ที่จับ" ที่ใส่ `touch-none` เฉพาะจุด จะได้ไม่กินการเลื่อนหน้าจอ
- **ห้ามใช้ `onBlur` เป็นตัวปิดโหมด input ที่เพิ่ง mount** — บนมือถือ `autoFocus` ไม่ยึด focus + native select ที่ปิดตัวลงยิง blur ทันที = โหมดเด้งกลับก่อน user พิมพ์ได้ (เคส "หมวดใหม่" ใน `CategoryPicker.jsx`). ใช้ปุ่ม ✓/✕ + Enter/Escape เป็นตัวปิด และ blur ให้ commit เฉพาะเมื่อมีค่าแล้ว
- **แทนที่ไฟล์รูปที่ URL เดิม ต้องมี cache-buster** — `/api/posts/media/[id]` เสิร์ฟด้วย `Cache-Control: private, max-age=3600` → ทับไฟล์แล้วเบราว์เซอร์ยังโชว์รูปเก่าอีก 1 ชม. (ร้ายแรงเมื่อรูปเก่าคือรูปที่ยังไม่ได้เบลอหน้า)
- **[2026-08-08] `setPointerCapture` ใช้กับ element ที่ตัวเองถูกสลับตำแหน่งไม่ได้** — React reorder keyed children = `insertBefore` = ถอด node ออกจาก document ชั่วขณะ → เบราว์เซอร์ปล่อย capture + ยิง `lostpointercapture` → ถ้าเอา event นั้นไปจบการลาก จะ "หลุดมือ" ทุกครั้งที่สลับสำเร็จ. ท่าที่ถูก: `pointerdown` ที่ที่จับ แล้วผูก `pointermove/pointerup/pointercancel` ที่ **window** ตลอดช่วงลาก (กรองด้วย `pointerId`) · อย่าใส่ `scale-*` ให้ช่องที่กำลังลาก — ช่องหดแล้วเกิดร่องว่าง `elementFromPoint` หาช่องปลายทางไม่เจอเป็นพักๆ
- **[2026-08-08] element ที่มีทั้ง `onClick` + `hover:` บนตัวเดียวกัน = iOS Safari ต้องแตะ 2 ครั้ง** — WebKit ตีความแตะแรกเป็นการจำลอง `:hover` (ไม่ยิง click) ถ้า element ที่แตะ (หรือ ancestor) match selector `:hover`/`.group:hover .x` ใดๆ อยู่ ต้องแตะซ้ำถึงจะ click จริง. เคสจริง: การ์ด `PostRow` ใน `PostsHome.jsx` ต้องจิ้ม 2-3 ครั้งถึงเปิด postEditor เพราะการ์ดมี `onClick` + `hover:border-teal hover:shadow-md` + ลูก `group-hover:text-teal` อยู่ในตัวเดียวกัน. ทางแก้: ครอบทุก hover/group-hover ที่ผูกกับ element ที่ clickable ด้วย arbitrary variant `[@media(hover:hover)]:hover:...` ให้ทำงานเฉพาะอุปกรณ์ที่มี hover จริง — **เจอ pattern นี้ที่ไหนอีก (การ์ดคลิกได้ + hover state บนตัวเอง) ต้องเช็คทุกครั้ง**
- **[2026-08-08] `opacity-0 group-hover:opacity-100` ไม่ตัด `pointer-events` — บนมือถือกลายเป็นปุ่มโปร่งใสที่ยังกดได้ตลอด** เพราะไม่มี hover จริงให้ trigger opacity เปลี่ยน = ปุ่มที่ควรซ่อนโผล่เป็น "dead zone" กดโดนแล้วทำงานเงียบๆ (เคส ปุ่มลบ/กู้คืนที่มุมขวาบนของ `PostRow` กินการแตะที่ตั้งใจจะเปิดโพสต์). ทางแก้: โชว์ปุ่มถาวรบนมือถือ (`opacity-100` default) แล้วค่อยซ่อน-จนกว่าจะ hover เฉพาะอุปกรณ์ที่มี hover จริง (`[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100`)

### Do-Not-Repeat (2026-08-08 — อย่าเดา origin จาก req.url หลัง reverse proxy)

- **`new URL(path, req.url)` / `new URL(req.url).origin` ใน route handler = ได้ origin ภายใน (`http://localhost:3000`) บน production** เพราะ Next ฟังที่ localhost แล้วมี reverse proxy ครอบอีกที — `req.url` คือ URL ที่ **proxy ยิงเข้ามา** ไม่ใช่ URL ที่ผู้ใช้พิมพ์. เคสจริง (bug-093): ปุ่ม "🖼️ จัดการสื่อ" ในตะกร้าดิสฯ ลิงก์ไป `pplevolunteers.org/bot/media/basket?...` ถูกแล้ว แต่ route นั้น redirect ต่อด้วย `req.url` เป็น base → ผู้ใช้เด้งไป localhost ทั้งที่ `.env` ถูกทุกตัว (**หลงแก้ env อยู่นาน เพราะอาการชี้ไปทาง env**)
- **redirect/absolute URL ทุกที่ในโปรเจกต์นี้ต้องมาจาก `BASE_URL` ใน `web/lib/baseUrl.js`** (= `NEXTAUTH_URL` · fallback `BRAND_DOMAIN`) — ที่อื่นทำแบบนี้หมดอยู่แล้ว (`api/link/*`, `api/x/oauth/*`) เหลือ `bot/media/basket` ที่หลุด
- **ลิงก์ที่บอทวางในดิสฯ ควรชี้ปลายทางจริงตรงๆ ไม่ต้องผ่านตัว redirect** ถ้าข้อมูลพอสร้าง URL ปลายทางได้ — ตะกร้า 1 ใบ = 1 แถวใน `post_episodes` และ `getBasket()` คืน `episode_id` มากับทุกแถวอยู่แล้ว → ลิงก์ `/posts/{id}` ได้เลย ตัดทั้ง hop และตัดโอกาสเดา origin ผิด
- **แต่ห้ามลบ route `/bot/media/basket` ทิ้ง** — ปุ่ม Link ในข้อความดิสฯ เก่าแก้ย้อนหลังไม่ได้ URL เดิมต้องใช้ได้ตลอดไป

### Do-Not-Repeat (2026-08-08 — อย่าวินิจฉัยอาการบน production ด้วยข้อมูลจาก DB local)

- **`.env` ของ repo นี้ชี้ DB local (`DB_HOST=localhost`) — query จากเครื่อง dev ไม่ได้บอกอะไรเกี่ยวกับ production เลย** เคสจริง: user บอกว่า posts แก้ไขไม่ได้บน prod → query local เจอ `post_episodes` เป็น `personal` ล้วน 23 ใบ เลยสรุปว่า "default visibility คือต้นตอ" แล้วลงมือแก้โค้ด · **ผิดทั้งดุ้น** — prod มี org post อยู่แล้ว (และมีของ owner คนอื่นด้วย) · ต้องขอให้ user รัน SQL บน prod มาให้ดูก่อนเสมอ ก่อนสรุปสาเหตุหรือแตะโค้ด

### Do-Not-Repeat (2026-08-08 — ลำดับแก้บัญชีแตกร่าง)

- ต้อง **ลบ row email ใหม่ก่อน** แล้วค่อย `UPDATE users SET email=... WHERE discord_id=...` — สลับลำดับจะชน `uq_users_email` (partial unique WHERE email IS NOT NULL)
- `DELETE FROM users` ต้องลบ `org_members` ก่อนเสมอ (FK `NO ACTION`) · ส่วน user_identities/org_member_roles/user_config/auth_nonces เป็น CASCADE หายเอง = **ลบเงียบไม่ error** ระวังตอนเขียน merge script
- `WHERE discord_id IS NULL` ไม่ได้แปลว่า "ร่างแตก" — บัญชี email แท้ๆ (รวมบัญชีของ user เอง) ก็เข้าเงื่อนไขนี้ ห้าม DELETE แบบเหมาเข่ง ต้องระบุ id ทีละตัว

### Do-Not-Repeat (2026-08-08)

- **อย่าแนะนำให้รัน script โดยไม่เปิดอ่านก่อน** — บอก user ให้รัน `scripts/social/meta-setup.js` 2 รอบ ทั้งที่มันเป็นโค้ดยุค MySQL (`pool.execute`+`?`+`ON DUPLICATE KEY`) เขียนคอลัมน์ `owner_type`/`owner_id`/`page_id` ที่ไม่มีแล้ว → รันไปก็พังทันที
- **อย่าวินิจฉัยสถานะ prod จาก DB local** — บอก user ว่า "IG token หมดไปแล้ว 13 วัน" จาก DB local (ข้อมูลค้างเก่า) ของจริง prod เหลือ 42 วันปกติดี · เรื่อง state ของข้อมูลจริง **ต้องขอผล query จาก prod เสมอ** ห้ามเดาจาก local
- **แถวซ้ำใน `dc_social_accounts` = ตัว id น้อยสุดชนะเสมอ** (`listPublishGroups` web/lib/publishTargets.js:45 + `getConfig` metaApi.js:97 `id ASC`) → เชื่อมบัญชีใหม่ด้วยการ INSERT แถวใหม่ = **แถวเก่าที่ตายแล้วบังตลอด** ต้อง UPDATE ในที่เดิม · ซ้ำร้าย `upsertSocialRow` (meta/oauth/callback:17) **ไม่เขียน `group_name`** → แถวใหม่ถูก `SELECT_VISIBLE` กรองทิ้งหมด (มองไม่เห็นในกล่องเผยแพร่)
- **`refreshUserToken` UPDATE ด้วย `user_discord_id` อย่างเดียว ไม่ดู platform** (metaApi.js:66) — ถ้าเอา Threads token ไปเก็บที่ `user_token` วันไหน IG refresh จะทับ Threads ทิ้งทันที · เติม `AND platform IN ('fb','ig')` แล้ว 2026-08-08

### Do-Not-Repeat (2026-08-08 — Meta Dashboard "Form can't be saved")

**สาเหตุจริง = apostrophe (`'`) ใน Threads Display Name** (`Peoples' Volunteers`) — Meta ไม่บอกว่าช่องไหนผิด ขึ้นแค่ generic error
→ เจอ error แบบ "ตรวจสอบข้อมูลอีกครั้ง" ที่ไม่ระบุฟิลด์ ให้**สงสัยอักขระพิเศษในช่องข้อความก่อนเสมอ** (`'` `"` `&`) ถูกสุด เร็วสุด
→ บทเรียนวิธีทำงาน: รอบนี้ผมตั้งสมมติฐานที่ฟังดูมีเหตุผล 2 อัน (Meta ping เช็ค URL / ช่อง Uninstall+Delete บังคับ) **ผิดทั้งคู่** แล้วเกือบให้ user deploy 2 รอบเปล่าๆ · ที่แก้ได้คือเทสฟรี 2 วินาทีที่ดองไว้ท้ายสุด
→ **เรียงเทสตามต้นทุน ไม่ใช่ตามความมั่นใจ** — เทสฟรีต้องมาก่อน deploy/เขียนโค้ดเสมอ แม้จะรู้สึกว่า "ไม่น่าใช่"
→ ข้อมูลที่ตัดสมมติฐานได้จริงรอบนี้คือ curl ดู HTTP code ของ prod (404 → 302) ไม่ใช่การให้เหตุผล

### 2026-08-10 — AI per-org BYO-key

- **Do-Not-Repeat:** อย่า `sed` แทนที่ทั้งไฟล์เมื่อไฟล์มีหลายฟังก์ชันคนละ scope (ดู bug-101) — เช็ค `grep -n "^async function"` ก่อนเสมอ
- **Do-Not-Repeat (2026-08-10):** ลบบรรทัดใน JSON ด้วย filter บรรทัดทำ trailing comma พัง (th.json เสียชั่วคราว) — ต้องลบพร้อม comma ของบรรทัดก่อนหน้า แล้ว `json.load()` validate ทุกครั้ง

### 2026-08-10 — ลายน้ำย้ายออกจาก guild

- **Do-Not-Repeat:** ล็อกอิน localhost ด้วย curl ต้อง POST `/api/auth/callback/magic` เอง (csrfToken จาก `/api/auth/csrf`) — หน้า `/org/verify` เรียก `signIn()` ฝั่ง client, curl ตามไม่ได้ → session ว่าง
- **Do-Not-Repeat:** `pkill -f "next start -p 3100"` ฆ่า shell ตัวเอง (exit 144) และไม่ฆ่า server จริง → รอบถัดไปเทสโดน build เก่าหลอก · ใช้ `lsof -ti:3100 | xargs -r kill` แทน
- **Do-Not-Repeat (2026-08-10):** อย่าเดาตำแหน่งข้อความของการ์ดคำคมจากชื่อ layout — `pillar`(เสาซ้าย)/`frame`(กรอบขวา) ข้อความอยู่**ล่าง**ทั้งคู่ (renderBorder/renderBorder2 วางที่ `H - pad - textH`) เสา/กรอบเป็นแค่ภาพประกอบ · ต้องอ่าน renderer จริงใน utils/quoteStyles.js
- **Do-Not-Repeat (2026-08-10):** ย้ายหน้าที่รับ OAuth callback ต้อง grep หา redirect ที่ชี้มาหามันด้วย (`link_success`/`link_error` 12 จุดใน api/link/*/callback) ไม่งั้นผูกบัญชีเสร็จแล้วเด้งไปหน้าที่ไม่อ่าน query
- **Do-Not-Repeat (2026-08-10):** `lsof -ti:PORT` บางทีมองไม่เห็น process ที่ถือพอร์ต — ใช้ `ss -ltnp | grep PORT` แล้ว kill pid ตรงๆ ไม่งั้นเทสโดน build เก่าหลอก (เจอ 2 รอบ)

### Do-Not-Repeat (2026-08-11 — Meta OAuth scope)

- **ห้ามใส่ `pages_manage_engagement` ใน SCOPES ของ `web/app/api/meta/oauth/start/route.js`** — ใส่แล้ว**หน้าขอสิทธิ์ FB พังทั้งหน้า** ("This content isn't available at the moment · Invalid Scopes: **pages_read_user_content**") ชื่อที่ฟ้องไม่ใช่ของที่เราส่ง — Meta ผูก legacy dependency ไว้ภายในกับ permission ที่ตัวเองลบไปแล้ว
- พิสูจน์ครบแล้ว อย่าไล่ซ้ำ: `pages_show_list` เดี่ยว ✅ · ชุดเดิม 5 ตัว ✅ · +`pages_manage_engagement` ❌ · ตัด `auth_type=rerequest` ออกก็ยังพัง ❌ · เปลี่ยน dialog เป็น v23.0 ก็ยังพัง ❌
- ใน App Dashboard permission ตัวนี้ขึ้น "Ready for testing" (เหมือน `pages_manage_metadata` ที่ใช้งานได้ปกติ) แต่ยังขอผ่าน dialog ไม่ได้ · เมนู Actions มีแค่ "Go to App Review" กับ "Remove" — **ไม่มีปุ่มเปิดสิทธิ์แบบกดเดียว** ทางเดียวคือส่ง App Review (อัดวิดีโอ + รอเป็นสัปดาห์) → เคาะแล้วว่าไม่คุ้ม
- **ผลลัพธ์: บอทคอมเมนต์ในนามเพจไม่ได้** ฟีเจอร์ไหนที่ต้องคอมเมนต์อัตโนมัติ ให้ออกแบบเป็น "เตรียมข้อความให้คนแปะเอง" แทน
- บทเรียนของผมเอง: **ผมบอก user ว่า "ได้ Standard Access อัตโนมัติ ไม่ต้องผ่าน App Review" แล้วให้ deploy — ผิด ทำปุ่ม connect บน prod พัง** · scope ใหม่ของ Meta ต้อง**ทดสอบด้วยการยิง dialog URL ตรงๆ ก่อนเสมอ** ไม่ใช่เชื่อความจำว่า permission ไหนต้อง/ไม่ต้อง review

### Do-Not-Repeat (2026-08-12 — เส้น resolve ต้องมาจากแหล่งเดียวกับพี่น้องของมัน)

- อย่าให้ platform ใน list เดียวกัน resolve ปลายทางคนละเส้น: `fb/ig/threads/x` มาจากกลุ่มที่เลือก แต่ `news` เคยมาจาก `getGuildId(session)` = โพสต์ลงห้องผิดเซิร์ฟแบบเงียบๆ (bug-400) · `resolved.guildId` มีให้ใช้อยู่แล้วแต่ไม่มีใครเรียก
- อย่าเพิ่ม field ที่ "บอทต้องใช้" โดยไม่มีที่ตั้งค่าใน UI: `guild_id` เป็นตัวที่ตะกร้าดิสฯ ใช้หาบัญชี แต่ PATCH accounts ไม่รับมาตั้งแต่ย้าย accounts ไป org → บัญชีใหม่ `guild_id` ว่าง แก้ได้แค่ SQL

### Do-Not-Repeat (2026-08-12 — อย่าเชื่อความจำ user เรื่องชื่อคำสั่ง ให้ grep ยืนยันก่อน)

- user บอก "การ set ห้องข่าวสารใช้คำสั่งบอทเหมือนเดิม" → grep ทั้ง repo แล้ว **ไม่มีคำสั่งนั้นเลย** ที่มีคือ `/panel news` = digest ข่าวท้องถิ่น (คีย์ `news_watch_feeds`) คนละเรื่องกับห้องส่งข่าว (`news_channel_id` ตั้งได้จาก /bot เท่านั้น)
- 2 คีย์ชื่อใกล้กันในตารางเดียว (`news_channel_id` vs `news_watch_feeds`) = แหล่งความสับสนถาวร เวลาคุยต้องระบุว่า "ห้องส่งข่าว" หรือ "digest"

### Do-Not-Repeat (2026-08-12 — ห้องข่าวของ 2 เซิร์ฟชื่อซ้ำกันเป๊ะ)

- guild ราชบุรีและอาสาฯ มีห้องชื่อ **"📢┆ข่าวสารประชาชน" เหมือนกันทั้งคู่** (ต่าง id) → UI ที่โชว์แต่ชื่อห้องจะแยกไม่ออก ต้องมีชื่อเซิร์ฟกำกับทุกที่
- ตัวเลือกห้องใน modal ต้องมาจาก **ทะเบียนที่ /bot** (`dc_guild_config.news_channel_id` ราย guild) ไม่ใช่กางห้องทั้งเซิร์ฟจาก Discord — user สั่งตัดตัวกางทั้งเซิร์ฟ (+ ช่องค้นหา) ออกหลังเห็นของจริง
- **คีย์ `common.*` อยู่ top-level ของ locales ไม่ได้อยู่ใต้ `org`** → ใน component ที่ `useTranslations('org')` ต้องเปิด hook ที่ 2 `useTranslations('common')` · `t('common.cancel')` = หา `org.common.cancel` ซึ่งว่าง (bug เดิมใน OrgSocialAccounts.jsx โดนแก้ไปด้วย 2026-08-12)

### Do-Not-Repeat (2026-08-12 — อย่าสร้างข้อจำกัดให้ผู้ใช้จากทางที่ตัวเองเลือกเดิน)

- ผมล็อคว่า "กลุ่มใช้ได้แต่ห้องข่าวในเซิร์ฟที่กลุ่มสังกัด" **โดยไม่มีใครสั่ง** — ต้นเหตุคือผมเลือกให้บอทหาห้องผ่าน
  `guild.channels.fetch` (จาก guild ของงาน) ทั้งที่ `client.channels.fetch(id)` มีอยู่และใช้อยู่แล้วใน `newsWatch.js`
  แล้วยังไปเพิ่ม validation + hack ย้าย `guild_id` มาทับปัญหาอีกชั้น · user จับได้ว่า "ไม่ได้กำหนดสักหน่อย"
- **เช็คตัวเองก่อนเขียน validation:** ข้อจำกัดนี้มาจาก requirement ของ user หรือมาจาก implementation ที่ฉันเพิ่งเลือก?
  ถ้าอย่างหลัง → เปลี่ยน implementation ไม่ใช่เขียนกฎห้าม
- เวลาต้อง gate ให้ gate ที่ **เส้นแบ่ง tenant** (org) เท่านั้น — เส้นอื่น (เซิร์ฟ/โซน/visibility) อย่าเดาแทน user

---

### Do-Not-Repeat (2026-08-14)

- **"ดีมะ / ดีไหม / โอเคมะ" = ถามความเห็น ไม่ใช่การเคาะ — ห้ามลงมือแก้ไฟล์**
  เคสจริง: user พิมพ์ *"ผมชอบ kanban อ่ะ ดีมะ"* → Claude rename `md/work/` → `md/kanban/` + แก้เนื้อหา 3 จุดทันที
  user สวนกลับ *"หยุด"* + *"ผมยังไม่ได้ฟันธง เลย แก้ทำไม"* · ที่จริง user กำลังชั่งใจเพราะ Claude เพิ่งทักท้วงข้อเสียของชื่อไป
  **ลงมือได้ต่อเมื่อ user พูดเป็นประโยคบอกเล่า ("เอา X" / "โอเค") หรือกดเลือกใน AskUserQuestion**
  ครอบคลุมเอกสาร/ชื่อไฟล์ด้วย ไม่ใช่แค่โค้ด

- **ถ้าข้อมูลใหม่ทำให้ข้อค้านเดิมของเราตกไป ต้องบอกว่าตกไป**
  user เลือก `kanban` เพราะพ้องเสียง "การบ้าน" ซึ่งปิดข้อค้าน 2/3 ข้อที่ Claude ยกไว้เอง
  การยืนกรานความเห็นเดิมทั้งที่ข้อมูลเปลี่ยน = ให้คำแนะนำผิด

- **อย่าทำเรื่องให้ใหญ่เกินโจทย์** — user ถามแค่ "ย้ายเครื่องต้องเอาอะไรไปบ้าง"
  Claude เสนอ rework `.gitignore` + `.gitattributes` + สคริปต์ย้าย · user ตอบ *"ยุ่งมากเลยอ่ะ"*
  ทางที่ user เลือกเอง (ไฟล์ inbox ที่อยู่ใน git) เรียบง่ายกว่าและแก้ปัญหาเดียวกันได้ครบ

- **ห้ามเอาผล query จาก DB สำเนาบนเครื่องรองมาตัดสินใจฟีเจอร์ — ต้อง re-query บนเครื่องที่กำลังตัดสินใจ**
  พิสูจน์ 2026-08-14 · `post_episodes`: แมค (`platfor`) = 27 ใบ จัดหมวด **0**/27 · Linux (`pple_volunteers`) = 29 ใบ จัดหมวด **28**/29
  user ยืนยันว่า "ข้อมูลเหมือนกัน แค่ตั้งชื่อ DB ใหม่" → ถ้าจริง **ค่ากลับด้านทั้งคอลัมน์แบบนี้เกิดจาก rename ไม่ได้** = ก้อนบนแมคน่าจะหายระหว่างย้าย
  ตรงกับกับดักที่จดไว้แล้ว: **DBeaver data transfer auto-create ตารางแล้วทิ้ง DEFAULT/sequence + map คอลัมน์เพี้ยน**
  → เกือบตัดฟีเจอร์ auto-mirror ทิ้งเพราะเชื่อตัวเลขจากสำเนาที่พร่อง
  → ✅ ปิดเรื่อง: user เคาะว่าข้อมูลบนแมคเก่า/ไม่อัปเดต **ห้ามใช้ตัดสินใจ ไม่ต้องตามต่อ**
  → ต่อยอดบทเรียน 2026-08-08 (อย่าวินิจฉัย production ด้วย DB local) — **เลขที่ตัดสินใจได้จริงมีที่เดียวคือ prod ไม่ใช่ dev เครื่องไหนเลย**
  → `CLAUDE.md` ที่เขียนว่า `pple_volunteers` **ถูกต้องสำหรับเครื่องหลัก** ไม่ต้องแก้ (เครื่องนี้มี `pple_volunteers` + `pple_rehearsal` ไม่มี `platfor`)

### Do-Not-Repeat (2026-08-17 — Discord commands: อย่าให้มีทั้ง global และ guild-level)

- **อาการ:** context menu ใน Discord เบิ้ลอย่างละ 2 เมนู + เมนูที่ลบออกจากโค้ดไปแล้ว (💧ติดลายน้ำ, 💬 Quote Image) ยังโผล่อยู่ **ทุกเครื่อง ทุก client** (desktop/มือถือ/เบราว์เซอร์)
- **สาเหตุ:** application commands ถูกลงทะเบียน **2 scope พร้อมกัน** — global + guild-level · Discord **ไม่ merge** สอง scope นี้ มันแสดงทั้งคู่ → ชื่อซ้ำโผล่ 2 ครั้ง และคำสั่งที่เหลืออยู่แค่ใน global ยังโชว์แม้ลบจากโค้ดแล้ว
- **ที่วินิจฉัยผิดไป 3 รอบ (อย่าทำซ้ำ):**
  1. โทษ "client cache ค้าง" → ผิด เพราะเป็นทุกเครื่องพร้อมกัน = server-side เสมอ · **"เป็นทุกเครื่อง" ตัด cache ออกได้ทันที**
  2. โทษ "มีบอทชื่อซ้ำ 2 ตัวใน guild" → ผิด user ยืนยันมีตัวเดียว
  3. บอกว่าอิโมจิ 🎭 ไม่ตรงกับที่ deploy → ผิด อ่านรูปพลาดเอง · **อย่าสรุปจากการอ่านอิโมจิในสกรีนช็อต**
- **เช็คให้ถูกตั้งแต่แรก:** ดู **ทั้งสอง** endpoint เทียบกัน — `Routes.applicationCommands(appId)` (global) และ `Routes.applicationGuildCommands(appId, guildId)` (guild) · ถ้ามีของทั้งคู่ = ต้นเหตุ
- **กติกาถาวรของโปรเจกต์นี้: guild-level อย่างเดียว ห้ามใช้ global**
  - guild-level เปลี่ยน**ทันที** · global รอ propagate ถึง 1 ชม.
  - `deploy.sh --production` เดิมเรียก `--global` เป็น default → แก้เป็น guild-level loop แล้ว (2026-08-17)
  - เดิมกับดักคือ user รัน `./deploy.sh --guild X` เพื่อ test (เร็ว) ทับบน global ที่มีอยู่ → เบิ้ลทุกครั้งโดยไม่รู้ตัว
  - `deploy-commands.js` เพิ่ม `--clear-global` แล้ว · `--global` ต้องใส่ `--force-global` กำกับถึงจะทำงาน
  - guild ทั้งหมดมาจาก `dc_guilds` ที่ `upsertGuilds()` (index.js:97) sync ให้เองตอนบอท ready → guild-only ไม่มีทางตกหล่น

### Do-Not-Repeat (2026-08-17 — `.env` เครื่อง dev ไม่ใช่บอทตัวจริง)

- `.env` บนเครื่อง dev ผูกกับ Discord app ชื่อ **"Tester"** (id `1482374359296245820`) **ไม่ใช่ "MunMuang"** ที่ใช้ production
- Tester ถูก invite เข้า guild จริงบางตัวคู่กับ MunMuang → เรียก REST API จาก dev **ไปโดน Tester** แม้ guild เดียวกัน = เห็น state ผิดตัวโดยไม่รู้ตัว
- **เช็คก่อนเสมอ:** `rest.get(Routes.oauth2CurrentApplication())` ดูชื่อแอปก่อนจะสรุปอะไรเกี่ยวกับ commands
- production อยู่คนละเครื่อง — เครื่อง dev **ไม่มี** `/www/wwwroot/pple-volunteers` · ต้องให้ user รันเอง

### Do-Not-Repeat (2026-08-17)

- **useEffect ที่ผูก event listener กับ ref ห้ามใช้ deps `[]` ถ้า element นั้นถูก render แบบมีเงื่อนไข** — `/team` ผูก wheel/pan ตอน `loading=true` ซึ่ง `<svg>` ยังไม่ mount → `svgRef.current` เป็น null, return ทิ้ง, ไม่ผูกอีกเลย = zoom/pan ตายเงียบตั้งแต่วันแรกโดย build/lint ไม่ฟ้อง (bug-410) · ใส่ deps ที่เปลี่ยนตอน element โผล่ (`[loading, error, view]`) หรือใช้ callback ref
- **ตำแหน่งที่ user ลาง/ลากไว้ ห้าม restore ข้ามโครง** — เก็บพิกัดโหนดลง localStorage แบบ flat `{id:{x,y}}` แล้วยัดกลับทุกครั้งที่ build layout ใหม่ = โหนดของผังเก่าไปนั่งในผังใหม่ ลูกหลุดจากพ่อ เส้นลากข้ามจอ และ bbox พองจนผังถูกย่อจนอ่านไม่ออก (bug-411) · ต้องเก็บคู่ signature ของโครง (`{key: layoutKey, pos}`) แล้ว restore เฉพาะตอน key ตรงกัน
- **กราฟ interactive: geometry ต้องไม่ขึ้นกับ "สิ่งที่กางอยู่" เลย** (user 2026-08-17: "กดทีเด้งที พันกันยุ่งไปหมด") · สูตรที่ใช้ได้จริงกับผัง /team:
  - ความกว้างที่ใช้แบ่งส่วนมุม คิดจากป้ายของโหนดเองเท่านั้น **ห้ามบวกขนาดกลุ่มลูกที่กางอยู่** ไม่งั้นกางกิ่งเดียว = ตัวหารเปลี่ยน = ทั้งผังขยับ
  - โหนดที่ถูกซ่อน (กลุ่มยุบ) ยังต้อง **สร้างไว้ให้ "จองที่" ในขั้นคลายทับ** แล้วค่อยกรองออกก่อนวาด — ถ้าเอาออกจากการคำนวณ เพื่อนบ้านจะไม่ถูกดันเหมือนเดิม
  - ขนาดโหนดที่คิดจาก "จำนวนโหนด" ต้องนับจากช่องที่จองไว้ ไม่ใช่โหนดที่วาดจริง
  - **relax 2 จังหวะ**: โครงหลักก่อน → ตรึง (`fixed`) → ค่อยคลายโหนดลูก · กริดต้องใส่โหนดที่ตรึงด้วย (ลูกจะได้หลบ) และฝ่ายที่ขยับได้ต้องหลบเต็มระยะคนเดียว
  - **กล้องแยก key จาก layout**: `filterKey` (ชุดข้อมูลที่ดู) → จัดกล้องใหม่ได้ · `layoutKey` (รวมสิ่งที่กาง) → สร้างโหนดใหม่แต่ห้ามแตะกล้อง · ล้าง `viewRef` ทุกครั้งที่ rebuild = เด้งแม้โหนดจะนิ่ง
  - โหนดลูกกางเป็น **รูปพัดออกด้านนอกวง** (~0.85π) ไม่ใช่ล้อมรอบทุกทิศ — ด้านนอกคือที่ว่างจริง
  - ค่าเริ่มต้นของกล้อง = **100% แต่ไม่เกินพอดีจอ** · 100% ล้วนกับผังที่ใหญ่กว่าจอ 2 เท่า = เห็นแต่ hub กับเส้นวิ่งออกนอกจอ ดูเหมือนหน้าพัง
- **user เลือก "จองที่ล่วงหน้า + กางหมด" มากกว่า accordion** (เคาะ 2026-08-17 เย็น — เปลี่ยนจากที่เคาะตอนบ่ายว่า "เปิดทีละตัวพอ") · หลักคิดของ user: ให้ทุกโหนดมีที่ของตัวเองตายตัว ผังใหญ่ได้ไม่เป็นไร เลื่อนดูเอา · การจองที่ = คิดขนาดกลุ่มลูก **ทุกโหนดเสมอ ไม่ว่ากางอยู่หรือไม่** แล้วเอาไปบวกในส่วนแบ่งมุม
- **จองที่ให้โหนดลูก ต้องจัดเป็น "ตารางยื่นออกด้านนอก" ไม่ใช่พัดกว้าง** — พัด 153° ทำให้ที่ต้องจองต่อบทบาท ~500 หน่วย (chord โตตามรัศมี) วงบานเป็น 4000 หน่วยจนกลางผังโล่ง · ตาราง 2 คอลัมน์กินด้านข้างคงที่ ~2 ป้าย ส่วนความยาวไหลออกนอกวง = ที่ว่างฟรี (bug-413)
- **โหนดลูกที่จัดเป็นตาราง ต้องยึด `homeX/homeY` ไม่ใช่ anchor แบบรัศมี** — pull เข้าหารัศมีจะทำให้คลายทับแล้วไหลไปวนรอบพ่อ เสียรูปตาราง
- **กล้องตั้งต้นของผัง radial ห้ามเล็งกลางผัง** เมื่อผังใหญ่กว่าจอ — กลางวงคือที่ว่างเสมอ เปิดมาจะเจอแต่ hub กับเส้นวิ่งออกนอกจอ · ให้เล็งชิดซ้ายของ bbox แทน เจอโหนดเต็มจอตั้งแต่เฟรมแรก
- **เทส SVG canvas ต้องวัดตัวเลข ไม่ใช่ดูภาพ** — เทียบ `boxAspect` กับ `vbAspect` และคำนวณ `scale = boxWidth / viewBox.w` · ภาพหน้าจอบอกไม่ได้ว่าเสียพื้นที่ไปกับ letterbox เท่าไร
- **`/org/verify?token=…` ขับด้วย curl ไม่ได้** — เป็น client component ที่เรียก `signIn('magic')` ฝั่งเบราว์เซอร์ · ล็อกอินเทสด้วย curl ต้องยิง credentials flow เอง: `GET /api/auth/csrf` → `POST /api/auth/callback/magic` (form-urlencoded: csrfToken/token/json=true + header `X-Auth-Return-Redirect: 1`) · token ใน `org_login_tokens` อายุ 15 นาที และถูก DELETE ทิ้งตอนใช้
- **playwright ไม่ได้ลงไว้ในโปรเจกต์** — มีใน scratchpad ของ session เก่า (`ba257f9c-…/scratchpad/node_modules`, playwright 1.62.1 + chromium-1234) · symlink `node_modules` มาใช้ซ้ำได้ ไม่ต้อง npm install ใหม่

### Do-Not-Repeat (2026-08-17 — อย่าเปิดให้ทุกคนสร้าง "คำศัพท์กลาง" โดยไม่มีทางเก็บกวาด)

ป้าย/หมวด/แท็ก ที่ทุกคนใน org สร้างได้ + **ลบไม่ได้** = ขยะถาวร (org 1 มีสมาชิก active 7,376 คน)
ทางที่เลือก: สร้างป้ายได้ทุกคน **แต่ตั้งกลุ่มใหม่ไม่ได้** (กลุ่มต้องมีอยู่แล้ว) + ซ่อน/เปลี่ยนชื่อเป็นสิทธิ์ admin
→ ได้ self-service โดยไม่ต้องสร้าง permission ใหม่ · ใช้ซ้ำได้กับ tag/หมวด ของโมดูลอื่น

### Do-Not-Repeat (2026-08-17 — ไล่บั๊กลายน้ำ posts)

- **"diff 0 พิกเซล" ไม่ได้แปลว่า "ไม่ได้ composite"** — ขาวทับขาวก็ได้ 0 · ผมสรุปผิดจากตรงนี้แล้วชี้ต้นเหตุไปผิดจุด (การ์ด `plain-*`) ทั้งที่งานจริงเป็น `shade-bottom-left` · ก่อนสรุปจากตัวเลข diff ต้องเช็คก่อนว่า **สีของสิ่งที่แปะ vs สีพื้นตรงนั้น** ต่างกันพอให้เห็นผลไหม
- **ห้ามใส่กฎ "รูปแบบนี้ไม่ต้องแปะลายน้ำ" ลงใน `watermarkSpotsFor()`** (utils/quoteStyleKeys.js) — ที่นั่นตอบได้แค่ "มุมไหนไม่ทับตัวหนังสือ" · user เคาะ: **ต้องแปะได้ทุกกรณี คนเลือกเอง** · เคยตัด `plain-*` ทิ้งทั้งกลุ่มแล้วกลายเป็นเลือกลายน้ำแล้วเงียบ ไม่มี error ไม่มี log (bug-416)

### Do-Not-Repeat (2026-08-18 รอบเย็น — custom field UI · Opus ตรวจเจอหลัง Sonnet บอกว่าเสร็จ)

- ⛔ **เมนู/ป๊อปอัปในกล่องที่อยู่ท้าย modal ห้ามใช้ `absolute left-full`** — งอกออกนอกจอทั้ง desktop
  (y=819 บนจอ 720) และมือถือ (y=913 บนจอ 844) กดไม่ได้เลย · ใช้ **inline expand** ไหลใน scroll
  container แทน แล้ว `scrollIntoView({block:'nearest'})` ตอนกาง · เทสด้วย `elementFromPoint(กลางปุ่ม)`
  ว่าโดนปุ่มจริงไหม — `isVisible()` ของ Playwright คืน true ทั้งที่อยู่นอก viewport (เช็คแค่ CSS+ขนาด)
- ⛔ **กล่องเลือกหลายค่าห้ามอ่าน selected จาก prop ตรงๆ** — ต้องมี local state + seq/inflight guard
  ไม่งั้นกดรัวๆ อันหลังทับอันหน้า (lost update) · `LabelPicker.jsx` แก้ไปแล้วและ comment เตือนไว้
  ที่บรรทัด 11 — **เขียนกล่องเลือกใหม่ต้องเปิด LabelPicker มาลอกก่อนเสมอ** (พลาดเพราะไม่ได้เปิดดู)
- ⛔ **rename ที่ server ปฏิเสธ ต้องเด้งค่าเดิมกลับ ไม่ใช่แค่ขึ้น error** — ถ้า `option.name` ไม่เปลี่ยน
  `useEffect([option.name])` จะไม่ทำงาน ช่องค้างโชว์ชื่อที่ DB ไม่เคยรับ = UI โกหก ปิดเปิดใหม่ค่าเด้ง
  → ให้ `onSave` คืน boolean แล้วตัวเรียก `setName(option.name)` เองเมื่อ false
- ⛔ **ห้ามเรียก `load()` ของ CardModal จาก child หลังทำ action** — มันเขียนทับ title/detail/กำหนดส่ง
  ที่ยังพิมพ์ค้างไม่ได้เซฟ = งานหายเงียบ · ให้ child คืนข้อมูลที่สร้างใหม่ แล้ว parent ต่อเข้า state เอง
- **บทเรียนกระบวนการ:** รายงานว่า "เทสในเบราว์เซอร์แล้ว" ทั้งที่เทสแค่ happy path หลัก
  ไม่ได้กดฟีเจอร์ที่ user ขอมาตรงๆ (เมนู "...") — **ต้องไล่เทสตามรายการที่ user ขอทีละข้อ**
  ไม่ใช่เทสเท่าที่สคริปต์เขียนง่าย · และ **เทสมือถือด้วยเสมอ** (390×844) user ใช้มือถือเป็นหลัก

### Do-Not-Repeat (2026-08-18 — งานคิว/แจ้งเตือน)

- **ห้ามเขียนตัวแจ้งเตือนที่ตัดสินจาก "สถานะตอนนี้" อย่างเดียว** — `notifyBatchDone` เช็คแค่ "ทั้ง batch จบหรือยัง" ไม่มีบันทึกว่าเคยแจ้ง → แจ้งซ้ำทุกครั้งที่ batch กลับมาจบอีกรอบ (bug-418) · ต้องมีธง (`notified_at`) + จองสิทธิ์แจ้งด้วย UPDATE ... WHERE flag IS NULL แบบ atomic
- **ก่อนแก้บั๊ก "ส่งซ้ำ" ให้ดู DB ก่อนเดา** — `attempts` กับจำนวนแถวตัดสมมติฐานได้ในคำสั่งเดียว: 2 แถว = สร้างงานซ้ำ · 1 แถว attempts>1 = worker ยิงซ้ำ · 1 แถว attempts=1 = ชั้นล่าง (REST retry) หรือคนละข้อความกันตั้งแต่แรก

### Do-Not-Repeat (2026-08-18 รอบดึก — kanban ลบถาวร/duplicate/checklist คลัง)

- **อย่าติ๊ก `/scrutinize` ว่าเสร็จทั้งที่ทำได้ข้อเดียว** — user จับได้ ("เอ นี่ไม่ทำ scrutinize แล้วเหรอ")
  รอบนี้เจอ finding ข้อเดียวจากคำถามของ user แล้วปิด task เอง · พอกลับมาตรวจจริงเจอ blocker ที่ทำให้แผนก้อน C ใช้ไม่ได้
  **กฎ: skill ที่ user สั่ง/กฎบ้านบังคับ ต้องเดินให้จบ workflow หรือบอกตรงๆ ว่าข้าม ไม่ใช่ปิดเงียบ**
- **`archive` ที่ไม่ได้ป้องกันอะไรเลย = ขยะล้วน** — `kanban_field_options` ซ่อนแล้ว `cards.js` ก็มี
  `AND o.archived_at IS NULL` ใน JOIN อยู่ดี → ชิปหายจากทุกการ์ดเหมือนลบจริง แถมไม่มี unarchive/ไม่มีที่ดู
  **ก่อนใส่ soft delete ต้องเช็คก่อนว่า reader กรอง archived ทิ้งอยู่แล้วไหม** ถ้ากรอง = soft delete ไม่ได้ป้องกันอะไร
- **`TagCombobox` (Set ของ option id เขียนทีเดียวทั้งก้อน) เอาไปทำเช็คลิสต์ไม่ได้** — เช็คลิสต์เป็นแถวจริง
  ที่แต่ละแถวมี `id`/`done`/`sort_order` ของตัวเอง · **เทียบ value model ก่อนวางแผน "reuse component"**
  ของที่ reuse ได้จริงมักเป็น endpoint ฝั่ง server ไม่ใช่ตัว component
- **retry `23505` ในทรานแซกชันต้องมี `SAVEPOINT`** — ไม่มีแล้ว unique violation ทำให้ transaction ทั้งก้อน abort
  รอบถัดไปยิงอะไรก็ `current transaction is aborted` (เจอตอนเขียน `duplicateCard` ที่เอา `createCard` มาใช้ซ้ำไม่ได้)
- **`process.exit()` ใน `finally` กลืน throw ทิ้ง** — `scripts/smoke/kanbanCards.mjs` crash กลางทางตั้งแต่ `712a45a`
  แต่พิมพ์ "✅ ผ่านหมด" + exit 0 มาตลอด = สโมคโกหก **ต้องมี `catch` ที่นับ fail ก่อน `finally` เสมอ**
- **`value_options BIGINT[]` ไม่ใช่ FK** — ลบ option ต้องกวาดเอง 3 จังหวะในทรานแซกชันเดียว
  (คัดชื่อลง `checklist.text` → `array_remove` → `DELETE`) · ข้อแรกพลาดง่ายสุดเพราะ `ON DELETE SET NULL` ทิ้งบรรทัดว่างไว้

### Do-Not-Repeat (2026-08-19 — kanban รื้อ UI ทั้ง modal)

- **`next build` ผ่าน ≠ โค้ดใช้ได้** — ลบฟังก์ชันเป็น "ช่วง" (`s[i:j]`) แล้วคร่อมฟังก์ชันอื่นที่แทรกไว้ก่อนหน้าไปด้วย
  → `ReferenceError: searchPeople is not defined` ตอน render · build ผ่านฉลุย เพราะเป็น runtime ไม่ใช่ compile
  **ลบโค้ดด้วยการ slice ช่วง = ต้อง grep ชื่อฟังก์ชันที่อยู่ในช่วงนั้นก่อนเสมอ** · โปรเจกต์ยังไม่มี ESLint
- **อย่าเขียนตัวตรวจ scope ด้วย regex** — ลองแล้ว 86 false positive (จับเลข/พารามิเตอร์/ตัวแปรใน closure)
  วิเคราะห์ scope ต้องใช้ parser จริงหรือ ESLint เท่านั้น
- **แทรกคีย์ลง JSON ด้วย anchor ต้องเช็คว่าคีย์นั้นอยู่ namespace ถูกไหม** — `actions.duplicate` ไปตกใน `modal`
  เพราะยึด anchor ที่บังเอิญอยู่คนละบล็อก → `MISSING_MESSAGE` user เจอเอง
  **มีสคริปต์ตรวจแล้ว:** ไล่ `t('...')` ทุกตัวใน `components/kanban/*.jsx` เทียบกับ th+en (184 สตริง) — รันทุกครั้งที่แตะ locale
- **แทรกคีย์ซ้ำที่มีอยู่แล้ว** — `searchPeopleHint` มีอยู่ก่อน แทรกซ้ำได้ JSON 2 บรรทัด ตัวหลังชนะเงียบๆ
  → เช็ค `if key in dict` ก่อนแทรกเสมอ
- **`//` คอมเมนต์ในแท็ก JSX ใช้ไม่ได้** — ต้องอยู่นอกแท็ก หรือใช้ `{/* */}`
- **`<button>` ซ้อน `<button>` = HTML ผิด** เบราว์เซอร์แก้โครง DOM เอง
  เจอ 2 ที่รอบนี้: ชิปที่มีปุ่ม × ในทริกเกอร์ combobox · ปุ่ม + บนหัวกองที่เป็น button อยู่แล้ว
  → เปลี่ยนตัวนอกเป็น `<div role="button" tabIndex={0}>` + `onKeyDown` Enter/Space
- **`NEXT_DIST_DIR` ลืมไม่ได้** — รัน `npx next build` เปล่าๆ ไปเขียนทับ `.next` ที่ dev server ของ user ใช้อยู่
  แล้วพังกลางทาง (`Failed to collect page data`) user ต้อง restart เอง (กฎนี้จดไว้แล้วแต่ยังพลาด)
- **เส้นบอกจุดวางตอนลากต้องขึ้น "แถวเดียว" ที่เมาส์อยู่จริง** — เขียน `dragId && dragId !== ตัวเอง` = ขึ้นทุกแถวพร้อมกัน
  ไม่ได้บอกอะไรเลย user ว่า "ดูแล้วงง" · ต้องคำนวณจาก `getBoundingClientRect` ว่าอยู่ครึ่งบน/ล่าง
  และตอนวางต้องปรับ index ให้ตรงกับเส้น (+1 ถ้าครึ่งล่าง, −1 ถ้าลากลง) ไม่งั้นเส้นกับผลลัพธ์ไม่ตรง = UI โกหก
- **`setDragImage` จำเป็นเมื่อ `draggable` อยู่บน handle เล็กๆ** — ไม่งั้นภาพที่ติดเมาส์เป็นไอคอนจิ๋ว
  และ **ต้อง `dataTransfer.setData()` ด้วย ไม่งั้น Firefox ไม่เริ่มลากเลย** (Chrome ปล่อยผ่าน)

### Do-Not-Repeat (2026-08-19 — build ผ่าน ≠ โค้ดไม่พัง)

- **`next build` ไม่ตรวจว่าตัวแปรมีจริง** (แค่ transpile) และ **บอทไม่มี build step เลย** → ReferenceError โผล่ตอน runtime อย่างเดียว
  **หลังลบ/ย้ายฟังก์ชันทุกครั้ง ต้องรัน `npm run lint:all` ไม่ใช่แค่ build + test**
- ยืนยันด้วยของจริง: รัน lint ครั้งแรกเจอบั๊ก 2 ตัวที่ build+test 419 ข้อไม่เคยจับได้เลย
  1. `web/app/api/docs/sign/self-info/route.js` — POST ไม่ได้ destructure `userId` → 500 (bug-427)
  2. `handlers/caseImportHandler.js` — `const messages` อยู่ใน try block → AI timeline ของเคสจากดิสฯ **ตายเงียบมาตลอด** (bug-428)
- **บทเรียนรูปแบบ: `try { const x = ... } ... ใช้ x ข้างล่างใน try อีกอัน` = ReferenceError ที่ catch กลืน = ฟีเจอร์ตายเงียบ**
  ของแบบนี้ไม่มีใครรายงานเพราะไม่มี error โผล่ให้เห็น — lint คือทางเดียวที่จับได้

### Do-Not-Repeat (2026-08-19 — คอมเมนต์ที่ทำโค้ดพัง 2 แบบในวันเดียว)

- ⛔ **ห้ามใส่ backtick ในคอมเมนต์ SQL ที่อยู่ใน JS template literal** (bug-429)
  `db/kanban/cards.js` const AGG เป็น template literal ทั้งก้อน — backtick ตัวแรกปิด template กลางคัน
  `npm test` ไม่จับเพราะไม่ได้ import ไฟล์นั้น · เจอตอนสคริปต์รันจริง
- ⛔ **แทนบล็อก JSX ด้วยคอมเมนต์แล้วอย่าลืม `}`** — ปิดเป็น `*/` เฉยๆ = JSX container ไม่ปิด ทั้ง component พัง (bug-430)
  **ESLint จับได้ทันที ส่วน `npm test` ผ่านฉลุย** → หลังแก้ JSX/SQL ต้องรัน `npm run lint` ไม่ใช่แค่เทส

### [2026-08-19] ห้ามแก้ปัญหา "ข้อความล้น" ด้วย truncate — user สั่งให้แสดงเต็มเสมอ

ชิปในการ์ดการบ้านที่ชื่อมีเว้นวรรคหักบรรทัดกลางชิป ผมไป "แก้" ด้วย `truncate` + `max-w-full`
ผลคือพังหนักกว่าเดิม: `truncate` = `overflow:hidden` → flex item ย่อได้ถึง **0** →
ชิปเจ้าภาพเหลือแต่ปุ่ม × ไม่มีตัวหนังสือเลย · สถานะเหลือ "D.." · คนช่วยเหลือ "Tee (ร..."

user: *"ต้องแสดงให้หมด ไม่ใช่แก้ไขด้วยการ truncate ใครสั่งให้ทำแบบนี้วะ ไม่แน่ใจถามอย่าเดา"*

**กติกา:** ข้อความที่เป็น **ชื่อคน / ชื่อแท็ก** ห้ามตัด — ให้ตกบรรทัดใหม่ทั้งใบแทน
(`whitespace-nowrap` บนชิป + `flex-wrap` บนกล่อง = ชิปไม่หักกลางใบ แต่ขึ้นบรรทัดใหม่ได้)
`truncate` ใช้ได้เฉพาะกับ **ชื่อ field ในคอลัมน์ซ้ายที่กว้างคงที่** (11rem) เท่านั้น
และถ้าไม่แน่ใจว่า user ต้องการแบบไหน — **ถาม อย่าเดา**


### [2026-08-19 ดึก] ถังขยะทุกที่ต้องขึ้น DeleteChoiceDialog — ห้าม window.confirm

user สั่งพร้อมสกรีนช็อตกล่อง "Delete task": *"เวลากด ถังขยะ ไม่ว่าจะจาก select/multi-select
หรือ checklist ให้ขึ้น prompt แบบ ลบ card แบบนี้"*

เหตุผลเชิงดีไซน์: `window.confirm` ให้ได้แค่ **ตกลง/ยกเลิก** → บังคับให้ "ลบถาวร" เป็นทางเดียว
ส่วน `DeleteChoiceDialog` โชว์ **ซ่อน / ลบถาวร / ยกเลิก** พร้อมกัน คนเลือกทางที่กู้ได้เองโดยไม่ต้องรู้ล่วงหน้า
→ ปุ่ม "ซ่อน" ที่เคยอยู่ใน `OptionEditor` ถูกถอดออก เพราะซ้ำกับกล่อง

**"ซ่อน" แปลว่า ซ่อนจากคลัง + เอาออกจากการ์ดใบนี้ พร้อมกัน** (user ย้ำเอง)
- archive อย่างเดียว = การ์ดที่ติดไว้แล้วยังเห็น → กดถังขยะแล้วไม่มีอะไรเกิดขึ้นบนจอ
- ลบแถวอย่างเดียว = ยังถูกเสนอให้หยิบกลับมาใหม่เรื่อยๆ
- การ์ด **ใบอื่น** ที่ใช้อยู่ยังเห็นเหมือนเดิม ← เส้นแบ่งกับ "ลบถาวร"

**เช็คลิสต์ไม่มีเมนู `...`** — user: *"ไม่ต้องมีไข่ปลาให้กดเปลี่ยนสี หรือ delete tag เอาออกไปเลย ไม่ได้ใช้"*
ชิปคลังเหลือหน้าที่เดียวคือกดหยิบเข้าการ์ด · จัดการตัวเลือกทำจากถังขยะท้ายงานย่อยที่เดียว
(select/multi_select ยังมี `...` อยู่ เพราะต้องเปลี่ยนสีชิปได้)

### [2026-08-19 ค่ำ] เช็คลิสต์ = พฤติกรรมเดียวกับ select ทุกอย่าง (กลับคำ 2 รอบในวันเดียว)

รอบเช้า: "แก้ข้อความงานย่อย = แก้เฉพาะการ์ดใบนี้" → implement ด้วย `ensureFieldOption(ชื่อใหม่)` แล้วชี้ item ไปตัวใหม่
ผล: **คลังงอกตัวใหม่ทุกครั้งที่แก้ ตัวเก่ากลายเป็นขยะกำพร้า** · user จับได้เอง:
*"เวลาแก้ไขมันควรจะเป็นการแก้ไขตัวนั้น ไม่ใช่การ insert ใหม่ป่ะ"*

รอบค่ำ user เคาะใหม่: *"todo list เอาเหมือน select เลย พฤติกรรม"*

| การกระทำ | ผล (ใช้กับ select · multi_select · checklist เหมือนกันหมด) |
|---|---|
| แก้ชื่อ | rename ตัวเลือกในคลัง → ทุกการ์ดตาม · ชื่อซ้ำ = 409 |
| ซ่อน | หายจากรายการให้เลือก · การ์ดที่ติดไว้แล้วยังเห็น · เอากลับได้ |
| ลบถาวร | หายจากทุกการ์ดจริงๆ (แถวเช็คลิสต์ถูก DELETE ด้วย) · ยืนยันพร้อมจำนวน |

**บทเรียนเชิงดีไซน์:** "แก้เฉพาะที่นี่" กับ "คลังใช้ร่วมกัน" อยู่ด้วยกันไม่ได้ —
ต้องเลือกอย่างใดอย่างหนึ่ง ถ้าฝืนให้มีทั้งคู่จะได้ fork ตัวใหม่ทุกครั้ง = ขยะสะสม
Notion ก็แยกขาด: to-do ในหน้า = ข้อความล้วนไม่มีคลัง · select = คลังร่วม rename แล้วเปลี่ยนทุกหน้า

**⛔ กับดักที่ทำให้ archive ตายรอบแรก (2026-08-18) และห้ามทำซ้ำ:**
`cards.js` เคยมี `AND o.archived_at IS NULL` ใน JOIN ที่ดึงชิปของการ์ด →
ซ่อนแล้วชิปหายเกลี้ยงทุกการ์ด = ไม่ต่างจากลบ เลยสรุปผิดว่า "archive ไม่มีประโยชน์" แล้วถอดทิ้ง
ความจริงคือ**ต้นเหตุอยู่ที่เงื่อนไขนั้น ไม่ใช่ที่ archive** · ถอดออกแล้ว 2026-08-19 ค่ำ — ห้ามใส่กลับ

**ทางเขียนเดียว:** ทุกจุดที่แตะ option ต้องผ่าน `web/lib/kanbanOptionActions.js`
(`fetchOptions` / `patchOption` / `setOptionArchived` / `deleteOptionWithConfirm`)
และ `OptionEditor` export จาก `TagCombobox.jsx` ใช้ร่วมกัน — ห้ามลอก markup ไปวางซ้ำ

### "เอาเหมือน X เลย" ไม่ได้แปลว่าเหมือนทุกปุ่ม — ต้องเช็คทีละการกระทำ (2026-08-20)

ตารางข้างบน (รอบค่ำ 19 ส.ค.) เขียนว่า "ใช้กับ select · multi_select · checklist เหมือนกันหมด" — **ผิดที่แถว "ซ่อน"**
user ทัก 20 ส.ค.: *"hide คือการเอาออกจาก checklist ไม่ใช่การซ่อน item ทั้งจากการ์ดและจากคลัง"*
ผมเอา `setOptionArchived()` ไปใส่ใน `hideItem()` ของ `ChecklistFieldBox.jsx` → กดถังขยะงานย่อย 1 ชิ้น
ไป archive ตัวเลือกในคลังของทั้ง org ด้วย (กระทบการ์ดใบอื่นที่ยังไม่ได้ใช้ตัวนั้น)

**กติกาที่ถูก (user เคาะรอบ 2 วันเดียวกัน):** แยกเป็น **2 ปุ่มคนละที่ ตามขอบเขตผลกระทบ**
- 🗑️ ถังขยะท้ายงานย่อย = `removeItem()` **ลบแถวของการ์ดใบนี้ทันที ไม่ถาม ไม่แตะคลัง**
- ✕ บนชิปในรายการแนะนำ (คลัง) = เปิด `DeleteChoiceDialog` ให้เลือก ซ่อน (`setOptionArchived`) / ลบถาวร (`deleteOption`)

**หลักที่ user ใช้ตัดสิน — เอาไปใช้ที่อื่นได้:** ของที่ **ย้อนได้ใน 1 คลิก → ทำเลย ไม่ต้องถาม** ·
ของที่ **กระทบคนอื่น / ย้อนยาก → ต้องมีกล่องถาม + บอกตัวเลขผลกระทบ**
ของเดิมถามผิดที่: ถามตอนเอางานย่อยออก (ย้อนง่ายมาก) แต่ไม่มีทางแตะคลังเลย (ของจริงที่อันตราย)
→ เวลาวางปุ่มลบ ให้ถามก่อนว่า "กดผิดแล้วกดกลับกี่คลิก" ไม่ใช่ "มันชื่อว่าลบหรือเปล่า"

**บทเรียนที่กว้างกว่าเคสนี้:** เวลา user พูดสั้นๆ ว่า *"เอาเหมือน X เลย พฤติกรรม"* ห้ามลอกยกชุด —
ให้ไล่**ทีละการกระทำ**ว่าอันไหน semantic ตรงกันจริง เพราะของ 2 ชนิดที่ "คล้ายกัน" มักต่างกันตรง
ขอบเขตผลกระทบ (ของการ์ดใบเดียว vs ของคลังทั้ง org) ซึ่งเป็นจุดที่คนใช้รู้สึกทันทีว่าผิด

### ESC ในกล่องซ้อนกล่อง — 3 กลไกที่ต้องมีครบ ไม่งั้นกดทีเดียวปิดหมด (2026-08-20)

user สั่ง: *"เวลากดแก้ไข element ไหน กด esc ไม่ต้องให้ปิด modal … ให้ยกเลิกการแก้ไข element นั้นสิ"*
ตอนไล่ทั้งโมดูลเจอที่ลืม **5 จุด** (ชื่อ field · ค่า scalar · ฟอร์มเพิ่ม field · dropdown ของ TagCombobox · ช่องชื่อการบ้าน)

| ชั้น | กลไกที่ต้องใช้ | เหตุผล |
|---|---|---|
| ช่องกรอก inline | `e.stopPropagation()` ใน `onKeyDown` + คืนค่าเดิม + `blur()` | React ผูก listener ที่ root container → stopPropagation หยุด native event ไม่ให้ไหลถึง document/window |
| dropdown ที่ฟัง `document` | `e.stopPropagation()` ใน listener | document bubble ทำงาน**ก่อน** window เสมอ |
| กล่องซ้อน (dialog/modal ลูก) | `addEventListener('keydown', fn, true)` (**capture**) + `stopPropagation` | listener ของ modal แม่ถูกผูก**ก่อน** (mount ก่อน) → bubble ธรรมดาแม่ชนะเสมอ · capture ทำงานก่อน bubble ไม่ว่าผูกทีหลังแค่ไหน |
| ตาข่ายกันลืม (modal แม่) | เช็ค `document.activeElement` เป็น INPUT/TEXTAREA/SELECT/contentEditable → ไม่ปิด | ของ 3 ข้อบนต้องจำทุกครั้งที่เพิ่มช่องใหม่ = ลืมแน่ · ด่านนี้ปลอดภัยโดยอัตโนมัติ |

**⛔ บั๊กเงียบที่เจอระหว่างทาง — ESC กลายเป็น "บันทึก" แทน "ยกเลิก":**
แพตเทิร์น `onKeyDown: setName(ค่าเดิม); e.currentTarget.blur()` คู่กับ `onBlur={commit}` **พังเสมอ** —
`setName` เป็น async แต่ `blur()` ยิง `onBlur` แบบ **synchronous** → `commit` ยังอ่าน state ตัวเก่า
(ค่าที่พิมพ์ทิ้งไป) แล้วบันทึกจริง · มีอยู่ 3 ที่พร้อมกัน (`FieldNameInput` `ItemTextInput` `OptionEditor`)
**วิธีแก้: ธง `cancelled` เป็น `useRef` ไม่ใช่ `useState`** แล้วให้ `commit()` เช็คแล้ว return ทันที
(ref เขียนปุ๊บอ่านได้ปั๊บ — state ไม่ทันรอบ render เดียวกัน)

### 3-state cycle (asc→desc→null) ต้องเทียบกับ "ทิศเริ่มต้นของ field นั้น" ไม่ใช่ 'asc' ตรงๆ (2026-08-21)

เขียนเมนู "เรียงลำดับ" ของ `/kanban` (`KanbanHome.jsx` ปุ่ม sort) — ตั้งใจให้กดฟิลด์เดิมซ้ำวน
`ยังไม่เลือก → ทิศเริ่มต้น → ทิศตรงข้าม → null` แต่ทิศเริ่มต้นไม่ใช่ asc เสมอ (วันที่/ตัวเลข/เช็คลิสต์ = desc
ก่อนเพราะ "ล่าสุด/เยอะสุดก่อน" เข้าใจง่ายกว่า) โค้ดแรกเขียน `if (prev.dir === 'asc') return desc; else return null`
→ ฟิลด์ที่ทิศเริ่มต้นเป็น desc (เช่นวันที่) วนได้แค่ 2 จังหวะ (desc→null) ข้ามจังหวะ asc ไปเลย
**เจอด้วย Playwright จริง ไม่ใช่อ่านโค้ดเจอ** — เทสอัตโนมัติ/eslint/build ผ่านหมดเพราะไม่มี type error
ต้องคลิกจริงในเบราว์เซอร์ 3 ครั้งแล้วดู pill ถึงเห็น
**แก้ถูก:** เก็บ `defaultDir` ของ type นั้นไว้ก่อน แล้วเทียบ `prev.dir === defaultDir` (ไม่ใช่ `=== 'asc'`)
ดู [[project_kanban_module]]


## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
- **Roster→Discord binding มีกลไกแล้ว (ค้นพบ 2026-07-02):** `ngs_member_cache` มี `guild_id NOT NULL` (multi-tenant แล้ว) · `dc_members.member_id INT NULL` → FK ไป `ngs_member_cache.source_id` · unique index `uq_dc_members_guild_member (guild_id, member_id)` กัน impersonation · `/api/docs/sign/link-ngs` คือ flow claim ตัวตนด้วยเลขบัตร 13 หลัก — member onboarding (SMS OTP) คือการสร้าง binding เดียวกันด้วย verify คนละแบบ ไม่ต้อง refactor identity
- **ORG-SWITCHER SPINE — org-first scope, guild ไม่ใช่ anchor (เคาะ 2026-07-17):** feature org-native (finance) scope ด้วย `org_id` · **owner (membership role) = org superuser** → getEffectiveOrgIdentity add 'admin' (bounded org ตัวเอง, แก้ deadlock owner ไม่มีสิทธิ์) · **ไม่ flip getEffectiveIdentity ทั้งระบบเป็น org-keyed** — feature ที่ยัง guild_id-scoped (calling/docs/cases/bot ~50 route) ถ้า access เป็น org-union = elevation (permission guild A ทำ guild B ใน org เดียว) → orgAccess **finance-only** revisit ต่อ feature ตอน migrate · guild-based features ตาม active_org ผ่าน **dual-write selected_guild** ตอน switch (ไม่แตะ getGuildId = blast 0) · guildless org → Nav ซ่อน app guild-based (ORG_NATIVE_FEATURES=['finance']) · client gating: `/api/me/access?scope=org`
- **config เก็บที่ไหน — JSON blob ใน dc_guild_config vs table ใหม่ (เคาะ 2026-07-03):** ถ้าข้อมูล (a) โหลดทั้งชุดเสมอ (b) เขียนทั้งชุดทีเดียว (c) ไม่ query/join/filter ข้าม guild (d) ไม่มี FK เข้ามา → เก็บเป็น json ใน `dc_guild_config` key ใหม่ (reuse `getSetting`/`setSetting` ใน db/settings.js เหมือน `enabled_features`/`config_register`) **ห้ามสร้าง table**. table คุ้มเฉพาะเมื่อ lookup/sync รายแถว (เช่น `dc_guild_roles`: resolver lookup by role_name + sync roleCreate/Update/Delete). ตัวอย่าง: register_form_fields → config ✅ (เคยเผลอเสนอ table `dc_guild_form_fields` เพราะลอก pattern dc_guild_roles ผิด)

### Decision Log (2026-07-08 — basket หยิบข้อความจาก bot message)

- **`handleBasketAdd` (handlers/basketHandler.js) เคยมี `isBot` guard กันไม่ให้หยิบ caption จากข้อความที่ bot โพสต์เอง** (เจอตอน debug: "🧺 หยิบลงตะกร้าสื่อ" บนข้อความ AI สรุปเธรด public ไม่ทำงาน) — guard นี้เกิดจาก commit แรกสุดของ feature (ef8a7b0) ไม่มี comment อธิบายเหตุผล เดาว่ากันไม่ให้ SMS ธนาคารดิบ (`services/smsWebhook.js:249` ส่ง `txn.raw` เข้าห้อง finance) หลุดลง caption โดยไม่ตั้งใจ
- **User ตัดสินใจ (2026-07-08): เอา `isBot` guard ออกทั้งหมด** — ให้เป็นวิจารณญาณของคนกด right-click เอง ไม่ต้องเดาเจตนาแทนคนใช้ ("อันนี้มันให้เราหยิบลงตะกร้าโดยมนุษย์ไม่ใช่เหรอ ให้เป็นวิจารณญาณของมนุษย์ไปเลย ไม่น่าจะต้องไปคิดแทน") — ถ้ามีคนเผลอหยิบ SMS ธนาคารลง caption ในอนาคต นี่คือ known trade-off ที่เคาะไว้แล้ว ไม่ใช่ bug ใหม่

### Decision Log (2026-07-09 — i18n)

- เลือก next-intl (มาตรฐาน App Router) ฝั่งเว็บ / dictionary เองฝั่ง bot (ไม่ต้องพึ่ง lib)
- locale ระดับ guild เป็นหลัก (ข้อความใน channel แชร์กัน) + cookie override ฝั่งเว็บ · ยังไม่ migrate string เก่า ~4,000 บรรทัด — ทยอยเป็นโซน งาน mechanical ใช้ Sonnet ได้

### Decision Log (2026-07-10 — cooking checklist → DB)

- **กลับคำจาก v2 เดิม** ("เมนู + ลิสต์วัตถุดิบ = static JSON") — user อยากแก้/เพิ่ม 44-slot checklist เองได้ทั้งหมดโดยไม่ต้องแก้โค้ด → ย้ายเข้า `cooking_ingredients` เป็นของ user คนเดียว (`scripts/cooking/migrateCanonicalToOwn.js`, idempotent)
- **Trade-off ที่เคาะไว้แล้ว**: `cooking_ingredients.owner` เป็น NOT NULL — ไม่มีแนวคิด "system/กลาง" เหมือน `cooking_menus` (owner NULL) ดังนั้น user ใหม่ในอนาคต (ถ้ามี multi-user) จะไม่เห็น 44 รายการนี้ จนกว่าจะรัน migrate script ให้ตัวเอง — user ยอมรับ trade-off นี้แล้วเพราะแอพนี้ใช้คนเดียวจริงๆ ตอนนี้ (ดู [[project_personal_apps]])
- `byGroup()` ใน `CookingClient.jsx` dedup แบบ graceful: ถ้า token มีใน DB ของ owner แล้วใช้แถว DB แทน static, ถ้าไม่มี fallback ไป static — กันโชว์ซ้ำโดยไม่พัง flow ของ owner ใหม่ที่ยังไม่ได้ migrate
- **เจอ pattern เดิมซ้ำกับ `cooking_menus`**: seed 121 เมนู (`owner NULL`) แก้/ลบไม่ได้เพราะ guard `WHERE owner=$` ไม่ match NULL — user ขอโอน ownership ทั้งหมดเป็นของตัวเองเหมือน ingredients (`scripts/cooking/migrateMenusToOwn.js`) แทนที่จะ patch guard ให้ superadmin แก้ seed ได้โดยไม่โอน (ทางเลือกที่เสนอไปแต่ user ไม่เลือก) → **cooking_menus ไม่มีแนวคิด "seed" เหลือแล้วในแอพนี้** (0 แถว owner NULL) — ถ้า resurrect ในอนาคตต้องรัน `seedMenus.js` ใหม่ (จะ INSERT owner NULL กลับมาเป็นเมนูซ้ำ ไม่ update ของเดิม เพราะ id ชนกัน ON CONFLICT DO UPDATE...WHERE owner IS NULL จะ skip แถวที่โอนไปแล้ว)

### Decision Log (2026-07-11 — cooking v3: public wiki + kitchens)

- **กลับคำจาก v2 อีกรอบ**: menus/ingredients เลิกผูก owner คนเดียว กลายเป็น public wiki (ใครก็แก้/ลบได้ — แต่ต้อง login Discord ก่อน, `/cooking` ยัง view ได้แบบ anon) · pantry/history แยกไปผูก "kitchen" (หลายคนช่วยจัดการครัวเดียวกันได้ ไม่มี role/tier) แทน owner คนเดียว
- **คำถามที่คิดว่าเคาะแล้วแต่กลับคำในวันเดียวกัน**: ตอนแรกตั้งใจให้เชิญสมาชิกครัวด้วยการพิมพ์ Discord ID ตรงๆ เพื่อเลี่ยงผูกกับ org roster (`dc_members`) ตาม principle "bounded, ไม่ import business logic ของ org" ที่วางไว้ตั้งแต่ต้น cooking app — user ขอเปลี่ยนเป็นค้นชื่อทันทีหลังเห็น UI จริง → สรุปว่า **read-only lookup เพื่อความสะดวก (autocomplete) ไม่นับเป็น business-logic coupling แบบที่ principle ตั้งใจกัน** (ที่กันจริงๆ คือ permission/role logic ซับซ้อน) — เกณฑ์แยกสองอย่างนี้ยังไม่เคยเขียนไว้ชัดมาก่อน จดไว้กันงงรอบหน้า

### Decision Log (2026-07-15 — org core: namespace + parallel auth)

- **namespace = `org`** (ไม่ใช่ `platform`/ชื่อแบรนด์) สำหรับ auth/identity ชั้นใหม่ — user เคาะ: ชื่อเว็บอาจเปลี่ยน ห้ามผูกชื่อแบรนด์กับ filename/identifier. ตรงกับ vocab เดิม (organizations, org_members, dc_guilds.org_id)

### Decision Log (2026-07-17 — getOrgId derive-from-guild)

- ค้าน spec (PENDING §FINANCE ที่ว่า "reuse active_org cookie") — premise พัง: ดึง org selection มาข้างหน้าแต่ไม่ได้ดึง org RBAC มาด้วย. เลือก orgOf(getGuildId) = เล็กสุด+consistent+reversible. guildless org เข้า finance ไม่ได้ (ตั้งใจ, RBAC ยัง resolve ให้ไม่ได้อยู่ดี).

### Decision Log (2026-07-21 — docs payer → org-generic)

- **ผู้ลงนาม (payer) ผูกกับ `docs_payers` (ลิสต์ที่ org กรอกเอง) ไม่ใช่ระบบยศ** — ยศ Discord ลดชั้นเป็น "ทางลัดเติมลิสต์" · เพราะ docs_payers มี display_name/position/signature/sort_order ของตัวเองครบแล้ว ขาดแค่ scope → เติมช่องเดียวจบ · org ใหม่ไม่ต้องมี Discord
- **กลไก scope ที่ต้องจำ:** Discord role แบ่ง 2 ชนิดที่ต้องถือครบคู่ — "ยศ" (`dc_guild_roles.permission`, ไม่มี scope_node) + "ทีมพื้นที่" (`scope_node = province:X`, ไม่มี permission) · `web_roles` เติมแค่ permission → คนตั้งยศผ่านเว็บได้ยศแต่ไม่ได้พื้นที่ → ถูก `if (!scope_nodes.length) return false` คัดออก
- **blocker ตัวจริงของ docs generic ไม่ใช่ payer** — `docs_projects.cache_pple_event_id` NOT NULL + `cache_pple_event` sync จาก ACT ผ่าน guild เท่านั้น ไม่มี UI สร้าง event บนเว็บ → org ไม่มี Discord ใช้ docs ไม่ได้โดยโครงสร้าง
- **ลำดับงาน:** ไม่เอา schema/UI ใหม่ไปทับก่อน user เทสของที่เพิ่ง migrate เสร็จ (แยกไม่ออกว่าบั๊กมาจากไหน) — ต่อให้เป็นงานเล็ก

### Decision Log (2026-07-22) — guild "ทีมภูมิภาค" ไม่แมปยศ = ตั้งใจ

guild `1115613658408566844` มี 117 ยศ แมป permission 0 ยศ → 82 คนที่เป็น "ผู้ประสานงานจังหวัด"
เฉพาะในเกิลด์นี้ไม่มีสิทธิ์ในระบบ · **user เคาะว่าปล่อยไว้แบบนี้** ใครต้องการสิทธิ์ให้ตั้งผ่าน
/org/settings/members หรือถือยศในเกิลด์อาสาประชาชน
→ อย่าไล่ "ซ่อม" ในเซสชันหน้า · ตัวเลขเก็บไว้ใน md/PENDING.md

### Decision Log — 2026-07-24: Identity unification phasing (Phase 2+3 done)

- **Context:** ต้องการให้ login วิธีไหนก็ได้ (google/email/passkey/phone) โดยไม่บังคับ Discord + ผูก Discord เพิ่มได้
- **Key finding (scrutinize):** access layer (resolveAccessV2) userId-keyed แล้ว แต่ per-user state (dc_user_config PK=discord_id), ownership (watermark/personal path user_${discordId}), cooking/upload gate ยัง key ด้วย discord_id → "login ได้แต่ใช้ไม่ได้" ถ้าไม่มี discord_id
- **Decision:** ทำ Phase 2 (superadmin dual-key discordId||userId + DEV_USER_IDS) + Phase 3 (link Discord จากทุก login, /api/link/discord[/callback], linkState→user_id, /api/identities+/unlink→userId, profile Discord card) ก่อน · **เลื่อน** Phase 0/1/4 (auth_nonces, passkey/phone decouple) จนกว่าจะย้าย dc_user_config/ownership ออกจาก discord_id
- **Merge policy:** ผูก Discord ที่เป็นของ user อื่น = BLOCK (already_taken) ไม่ auto-merge · link flow ใช้ lookup-only (findUserIdByProvider) ไม่ใช่ resolveUserByDiscord (create-on-login)
- **Deploy notes:** (1) Discord dev portal ต้อง add redirect URI ${NEXTAUTH_URL}/api/link/discord/callback (2) DEV_USER_IDS เป็น optional env (discord superadmin เดิมไม่ต้องแก้)

### Decision Log (2026-07-28 — rebrand → platfor.org)

- display name = `PLATFOR{m}.ORG` · domain = `platfor.org` (**ยังไม่จด** — BRAND_DOMAIN ยังเป็น pplevolunteers.org ไปก่อน)
- ตอนจดโดเมนจริง: แก้ 2 ที่ = `config/brand.js` (BRAND_DOMAIN) + `.env` (NEXTAUTH_URL) แล้วไปอัปเดต redirect URI ในคอนโซล Discord/Google/LINE/Meta/X
- ⚠️ passkey RP_ID ผูก hostname → เปลี่ยน domain = passkey เดิมใช้ไม่ได้ (ยังไม่เคาะว่าจะ pin PASSKEY_RP_ID หรือให้ลงทะเบียนใหม่)
- DB name `pple_volunteers` + user `pple_dcbot` → ตัดสินใจ **ไม่แตะ** (เสี่ยง/ไม่คุ้ม)

### Decision Log (2026-07-29 — social accounts scope)

- เลือกแบบ C: `org_id` = scope หลัก · `guild_id` คงไว้เป็น optional metadata **และยังอยู่ในคีย์ unique** — เพราะบัญชีเดียวถูกใช้ข้าม guild ในองค์กรเดียวกันจริง (Threads 2 แถว 2 group) และ OAuth reconnect ของ guild เดิมต้องอัปเดตแถวเดิม
- `/bot/platforms` หัวข้อเปลี่ยนเป็น "บัญชีขององค์กร" (public = org-wide) แต่ App Credentials ยังกำกับชื่อ guild — 2 สิ่งนี้คนละ scope กันแล้ว ต้องเขียนบนจอให้ต่างกัน

### Decision Log (2026-07-29 — posts: ดีไซน์ก่อน implement)

- **เลิกลอก flow ดิสฯ ขึ้นเว็บ** (user เคาะ): modal 5 ชั้นของ quote เกิดจากข้อจำกัดดิสฯ ไม่ใช่ดีไซน์ที่ดี → เว็บออกแบบใหม่: ไฮไลต์ข้อความ → การ์ดโผล่ทันทีไม่มีขั้นยืนยัน, ธัมบ์เนลสไตล์ของจริงคลิกสลับ, เก็บ params ไม่ใช่แค่ PNG (แก้ข้อความ → re-render + ป้าย "ต้นทางเปลี่ยน")
- **ไม่แยก "ชนิดโพสต์"** (ข้อความ/ภาพ/โควต) — ต่างกันแค่จำนวนและชนิดของสื่อ · โพสต์จริงมักผสม · ล็อก type = พอเปลี่ยนใจต้องสร้างตอนใหม่
- **prefs ผู้ใช้: แปลง `dc_user_config` → `user_config` key ด้วย `user_id` ไม่สร้างตารางใหม่** · ห้ามเขียนได้ 2 คีย์ (discord + user) เพราะค่าจะแตกเป็น 2 ชุด = ปัญหาเดิมที่ unify identity เพิ่งปิด · discord_id เหลือเป็น artifact อ่านอย่างเดียว
- **AI คืนโครงก่อน แล้วร่างทีละตอน** ไม่ใช่ร่างเต็มรวดเดียว — โครงผิดแล้วเสีย token ทั้งก้อน + ผู้ใช้รอ 30-60 วิ

### Decision Log (2026-07-29 — /grill posts: 16 กิ่ง)

- สิทธิ์อ่าน/เขียน/บังคับอนุมัติของ posts เป็น **policy ราย org** (`org_config.posts_policy` = `{read,write,approval}`) ไม่ใช่กติกา hardcode — user ต้องการให้แต่ละองค์กรตั้งเอง
- `post_episodes.status` เก็บแค่สถานะงานเขียน (draft/review/approved) · เผยแพร่เป็น derived จาก jobs
- ไฟล์สื่อ posts อยู่ **นอก `public/`** (`storage/posts/`) + route เช็คสิทธิ์ — ต่างจาก finance/cooking ที่เขียนลง `public/uploads/` เพราะร่าง personal เป็นเนื้อหาการเมือง
- แก้ตอนที่ published แล้ว = แก้ในระบบ **ไม่ sync กลับ** (FB แก้ได้ IG/Threads/X แก้ไม่ได้ → ปุ่มเดียวจะมี 4 พฤติกรรม)
- worker: grace 2 ชม. สำหรับ job ที่เลยเวลาเพราะบอทดับ · เกินนั้น `stale` แล้วถามคนสั่ง

### Decision Log (2026-07-29 — posts: รวม/ไม่รวมตาราง)

- **รวม:** คิวโพสต์ + ประวัติโพสต์ = ตารางเดียว `post_social_history` (แถว pending = คิว, done = ประวัติ) → `dc_media_history` ยุบเข้ามาแล้ว drop ตอนก้อน 4 · user เป็นคนเสนอเอง เหตุผล: แถว done คือประวัติอยู่แล้ว เขียน 2 ที่ = ขัดกติกา "bug แก้ที่เดียว"
- **รวม:** ลิงก์รีวิวผูก `episode_id` ไม่ใช่ `series_id` — อนุมัติรายตอนอยู่แล้ว ลิงก์ผูกชุดคือความซับซ้อนเปล่า + เพิกถอนทีละตอนไม่ได้
- **ไม่รวม:** `dc_media_baskets` ไม่ยุบเป็น `post_episodes` — ชนกับ gate อนุมัติ (org series ต้อง approved ก่อนโพสต์) → คนกดโพสต์ในดิสฯ จะโดนบล็อกรอบรรณาธิการ = regression ของที่ใช้ทุกวัน · พ่วง `seq`/`series_id` ที่ไม่มีความหมาย + ต้องเอา `(guild_id,channel_id)` ไปแปะบน episodes
- **ไม่รวม:** สื่อของตะกร้าไม่เข้า `post_episode_media` — `episode_id` FK NOT NULL → ต้องมีพ่อ 2 แบบ = polymorphic parent
- **หลักที่ได้จากทั้งหมด:** "แก้ที่เดียว" = **logic ที่เดียว** (publishPipeline / media helper) ไม่ได้แปลว่า **ตารางเดียว** · ตัวอย่างในโปรเจกต์: finance/docs เก็บไฟล์คนละตารางแต่ใช้ helper ตัวเดียว

### Decision Log (2026-07-29 เย็น — posts: ทิ้ง series ใช้ category)

- **ทิ้ง `post_series` ทั้งตาราง** — user: "ผมทำงานเป็น episode แล้วแยกด้วย category เอา · จะแยกกลุ่มก็ใช้ category ใน column ก็ได้" · หน่วยงานหลัก = **ตอนเดี่ยวๆ** ไม่ใช่ชุด
- จัดกลุ่มด้วยคอลัมน์ `post_episodes.category varchar(60)` **ไม่มีตาราง lookup** — แลกกับ rename หมวด = UPDATE ทุกแถว (ยอมรับได้)
- `org_id` / `owner_user_id` / `visibility` / `source_idea` / `created_via` **ย้ายจาก series ลงมาที่ episode** · ทิ้ง `series_id` + `seq` (ไม่มีเลขตอน เรียงตามเวลา)
- เคาะพ่วง: visibility อยู่ที่ตัวโพสต์ (ไม่ใช่ที่หมวด) · 1 โพสต์ = 1 หมวด (ไม่ใช่ tag) · ไม่มีลำดับตอนในหมวด
- ⚠️ **บทเรียน:** เรื่อง "ทำงานเป็น episode + category" เคยคุยกันแล้วแต่ **ไม่มีใครจดลงไฟล์** → หลัง /clear หายเกลี้ยง กลับไปทำ series ต่อจนโดนทัก · **decision ที่ยังไม่ลงไฟล์ = ไม่มีอยู่จริง** ต้องจดทันทีที่เคาะ ไม่ใช่ตอนจบ session

### Decision Log (2026-07-30 — ที่เก็บสื่อระยะยาว: retention ก่อน ไม่ใช่ R2)

- user ถาม "ดิสก์จะไม่พอไหม" ตอนกำลังทำ 4c → **แก้ที่ "ไฟล์นี้ยังมีค่าอยู่ไหม" ไม่ใช่ "เก็บที่ไหน"**
  · `services/postsRetention.js` ลบไฟล์ที่โพสต์ออกไปแล้ว (คลิป 30 วัน / รูป 180 วัน) → ดิสก์นิ่ง
- **ไม่ต่อ R2 ตอนนี้** — R2 มีค่าตรง "URL สาธารณะให้ IG/Threads มาดึงคลิป" ซึ่ง `saveMediaToTemp()`
  + `/api/media-temp/` ทำแทนได้แล้ว · 3 GB/ปี ไม่ใช่ปัญหา · ค่อยต่อวันที่เต็มจริง
- **Google Drive ไม่ใช่ที่เก็บของระบบ** — ลิงก์ Drive ให้ Meta crawler ดึงไม่ได้ (redirect/rate limit/
  virus-scan interstitial) + ต้อง OAuth · เหมาะเป็น "คลังฟุตเทจให้คนเปิดดู" ซึ่งเป็นฟีเจอร์คนละตัว
- กันไว้ล่วงหน้าแบบไม่ over-engineer: **ทุกจุดที่แตะไฟล์ผ่าน `utils/postsStorage.js` โมดูลเดียว**
  → วันย้ายไป R2/Drive แก้ไฟล์เดียว ไม่ต้องไล่ call site

### Decision Log (2026-07-30 เย็น — หน้า Update ที่มี autosave ห้ามมีปุ่ม "บันทึก")

- เดิม CLAUDE.md §กฎการบันทึก บังคับให้หน้า Update มีปุ่มบันทึกควบคู่ autosave (เคาะเช้าวันเดียวกัน)
- user ขอเอาปุ่มออกที่ `/posts/[id]` → ผมทักว่าขัดกฎที่เขาเพิ่งเคาะ → เขายืนยันและสั่ง **"แก้กฎเลย"**
- กฎใหม่: **Update + autosave = ห้ามมีปุ่มบันทึก** · ต้องมีแทน = ป้าย "กำลังบันทึก…/บันทึกแล้ว" +
  `beforeunload` ตอน debounce ยังไม่ยิง · **Create ยังต้องมีปุ่มเหมือนเดิม** · Update ที่ไม่มี autosave ก็ยังต้องมีปุ่ม
- เหตุ: ปุ่มซ้ำซ้อนกับ autosave + แถวปุ่ม 5 ตัวใน PostEditor แตกเป็น 3 บรรทัดเบี้ยวบนมือถือ
- โค้ดในโปรเจกต์ตรงกับกฎใหม่แล้วทั้งหมด (`cooking/MenuForm.jsx` ทำถูกอยู่ก่อนแล้ว · แก้แค่ `PostEditor.jsx`)

### Decision Log (2026-08-09 — แก้ autocrop ก่อน แล้วค่อยลง editor แก้มือ)

- user ถามว่า "แก้ autocrop ให้ไม่เพี้ยน" กับ "เพิ่ม editor แก้มือแบบ posts" อันไหนง่ายกว่า → เคาะทำ**ก้อนถูกก่อน**: แยกให้เห็นว่าอาการมี 2 สาเหตุ — ยืดสัดส่วน (deterministic แก้ ~1 ชม.) กับ detect ผิด (จูน CV = เดาแล้วลอง ไม่มีตัววัด และของเก่าย้อนวัดไม่ได้เพราะต้นฉบับถูกลบ)
- **ไม่ไล่จูน detection** — ลงทุนไม่คุ้ม พิสูจน์ไม่ได้ · แทนที่ด้วย guard ให้ล้มแบบปลอดภัย แล้วปิดจ็อบด้วย editor แก้มือ (ก้อน 2, จดใน PENDING) ซึ่งกดทดสอบเห็นผลจริงได้
- ผลพลอยได้: ถ้าก้อน 1 พอ → autocrop ยังเปิดไว้ได้ (ประหยัดแรงคนอัป) editor เป็นแค่ตาข่ายรับ ไม่ใช่ของบังคับใช้ทุกใบ — ต่างจากที่เคยเคาะไว้ตอนแรกว่าจะปิด autocrop ถาวร

### Decision Log (2026-08-09 — คำคมบนคลิป: ไม่เพิ่มตาราง)

- **user ค้านการเพิ่มตารางใหม่ทันทีที่ได้ยิน** ("เพิ่มตารางอีกแล้วเหรอ") → ก่อนเสนอ schema ใหม่ทุกครั้ง ให้ไล่ก่อนว่ามีกลไกเดิมรับได้ไหม · รอบนี้ตัดตาราง+worker+poll ทั้งกองแล้วแลกด้วย nginx 1 บรรทัด (`proxy_read_timeout 300s`)
- **เว็บ (Next.js) render งานหนักเองได้** — `lib/quoteRender.js` เรียก canvas+sharp จากรากอยู่แล้ว · ffmpeg เป็น child process จึงไม่บล็อก event loop · ไม่จำเป็นต้องโยนงานข้ามไปโปรเซสบอทเสมอไป
- **วัดก่อนเลือกสถาปัตยกรรม** — benchmark ffmpeg overlay บนเครื่องจริง (0.68 × ความยาวคลิป) คือสิ่งที่ทำให้เลือก sync ได้อย่างมั่นใจ ไม่ใช่เดาว่า "ffmpeg ช้าต้องเข้าคิว"
- **user ถามกลับทุกครั้งที่ตัวเลขไม่มีที่มา** ("ทำไมได้แค่ 60 วิ") → อย่าใส่ค่าคงที่แบบเผื่อไว้ ต้องผูกกับข้อจำกัดจริง (90 วิ = เพดาน Reels · 200MB = คลิป 1080p ~90 วิ)

### Decision Log (2026-08-09 — posts AI: เรียบเรียง 1 โพสต์ ไม่ซอยเป็นชุด)

- **ทิ้งดีไซน์ "AI ซอยไอเดีย/บทความเป็นชุดโพสต์"** (`ai/outline` สร้าง 1-12 แถว) — user โยนบทความยาว 1 เรื่องแล้วได้ร่าง 4-5 อัน = ไม่ใช่สิ่งที่ต้องการเลย
- mental model ที่ถูกต้องของ user: **"พิมพ์บทความในหัวเร็วๆ → ช่วยสรุปทำโพสต์ให้ 1 อัน"** · AI = ตัวเรียบเรียง ไม่ใช่ตัววางแผนซีรีส์
- endpoint ใหม่ `POST /api/posts/ai/compose` → `{category,title,body,format}` สร้างแถวเดียว แล้วเด้งเข้า `/posts/[id]` ทันที (ไม่ทิ้งของไว้ในฟีดให้ไปตามหาเอง)
- **ของดิบที่ user พิมพ์ต้องเก็บเป็น revision แรกเสมอ** — `createPost({ originalRevision })` insert ก่อน snapshot ฉบับ AI โดยถอย `created_at` 1 วิ (revision ใน transaction เดียวได้ `now()` เท่ากันเป๊ะ → ลิสต์ประวัติแยกไม่ออก) + `listRevisions` ต้องมี tiebreak `r.id DESC`

### 2026-08-10 — AI per-org BYO-key

- **Decision Log:** BYO-key ชนะ key กลาง+metering เพราะไม่ต้องทำ usage tracking · แต่ทางที่ยืม key กลางยังต้องนับ "จำนวนครั้งต่อวัน" (ไม่ใช่ token/เงิน)
- **Decision Log (2026-08-10):** ถอดสไตล์ "✨ AI จัดให้" ออกจากการ์ดคำคม — AI เลือกแค่ band/align/สี ซึ่งซ้ำกับที่คนเลือกเองได้อยู่แล้ว (24 สไตล์ + สุ่ม) · user: "ใช้วิจารณญาณมนุษย์ดีกว่า"

### 2026-08-10 — ลายน้ำย้ายออกจาก guild

- **Decision Log (2026-08-10):** ของ "ส่วนตัว" รวมที่ `/profile` (hub) + `/profile/settings/*` สมมาตรกับ `/org` + `/org/settings/*` · ทิ้งคำว่า personal เพราะ profile เป็นคำที่คนรู้จักแล้ว · เกณฑ์คัดของเข้า = "ตามคนข้าม org ไหม"

### Decision Log (2026-08-12 — ลายน้ำพื้นหลังการ์ดคำคม plain-logo = ขาวดำ)

- `bg='logo'` ของ `renderPlain` desaturate ไฟล์ลายน้ำก่อนวาด (`sharp(path).grayscale()`) — ไม่ใช่ `drawTinted`
- ต่างกันคนละเรื่องกับที่ user เคยตีตก: **ย้อมสีเดียวแบนๆ** ถูกตีตก ("อ่านเป็นเงา") · **ขาวดำ** คงน้ำหนักอ่อน-เข้มของโลโก้ไว้ครบ = ผ่าน
- node-canvas/@napi-rs/canvas **ไม่มี CSS filter** (`ctx.filter` เป็น quality hint ไม่ใช่ `grayscale()`) → ต้องแปลงผ่าน sharp เสมอ
- ลายน้ำที่เป็นขาว/ดำอยู่แล้ว (`pple-white`, `asa-*-white-txt`) ผลลัพธ์ไม่ต่าง — ที่ต่างคือไฟล์มีสี (`pple-orange`, `asa-profile`)
- `bg='mark'` (เครื่องหมายคำพูด) **ไม่แตะ** ยังใช้สีไฟล์ตามเดิม

### Decision Log (2026-08-12 — ห้องข่าวสารรายกลุ่ม)

- **เคาะ: ผูกห้องข่าวสารที่กลุ่ม** (user: "ผมโพสต์จากกลุ่มประชาชนราชบุรี ต้องวิ่งเข้าห้องข่าวราชบุรี") — ผมเสนอเลื่อนไปทำวันมีเคส 2 กลุ่ม/1 เซิร์ฟ แต่ user ต้องการชัดเจนว่าต้องเลือกได้ต่อกลุ่ม
- user เสนอเองว่าใช้ `dc_social_accounts` แทนตารางใหม่ → ถูกกว่าและตรงกับ pattern เดิม (ผมถอนข้อเสนอ `dc_social_groups`)
- ที่ตั้งค่า = `/org/settings/social` (การ์ดรายกลุ่ม) ไม่ใช่ `/bot` — ตั้งได้ทุกกลุ่มทุกเซิร์ฟในหน้าเดียว ไม่ต้องสลับ guild switcher
- กติกา **1 กลุ่ม = 1 เซิร์ฟ** (ตะกร้าดิสฯ หาบัญชีด้วย guild+platform → กลุ่มคร่อม 2 เซิร์ฟจะเห็นไม่ครบ) · UI เตือนถ้าเจอ `mixedGuilds`

### Decision Log (2026-08-13 — calling XLSX import backoffice)

- **ตำแหน่ง:** `/calling/campaigns/import` (ไม่ใช่ /org/settings — user เคาะ: เข้ากับ concept campaign ที่มีอยู่แล้ว) · link "นำเข้าจาก Excel" โผล่บน `/calling/campaigns` เฉพาะ `isAdmin` (เหมือนปุ่ม "สร้างแคมเปญ" ที่โผล่ตาม `canCreateCampaign`)
- **โหมด:** preview (parse อย่างเดียว ไม่แตะ DB) → กดยืนยันค่อย commit ใน transaction เดียว (`runCallingImport` ใน `web/db/calling/importXlsx.js`) — ตามกฎ Create ต้องมีปุ่มบันทึก ห้าม autosave
- **campaign_id พิมพ์เอง** เหมือน CLI script เดิม (ไม่ใช่ dropdown) — ชื่อแคมเปญ auto = `${province}.xlsx` เสมอ (ผูกตายตัวกับ province ที่เลือก ไม่ให้พิมพ์เอง)
- สิทธิ์ = `isAdmin` เท่านั้น (สูงกว่า `canCreateCampaign` ปกติ) เพราะเขียนตรงเข้า `cache_pple_member` ข้าม sync ปกติ + insert `calling_logs`/`calling_member_tiers` จำนวนมาก
- parse logic เป็น **port ตรงจาก** `scripts/calling/import-calling-xlsx.js` ไปที่ `web/lib/calling/parseXlsxImport.js` (pure function, `XLSX.read(buffer)` แทน `readFile`) — โครงสร้างชีต/logic เหมือนเดิมทุกจุด กันผลลัพธ์เพี้ยนจาก CLI
- เขียน DB ด้วย parameterized multi-row INSERT เอง (chunk 400 แถว/statement) แทนต่อ string อย่าง script เดิม — กัน SQL injection จากข้อมูลในไฟล์ผู้ใช้อัปโหลด (ต่างจาก CLI ที่รันโดย dev เอง เชื่อ input ได้)
- เทสแล้ว: parser กับไฟล์ synthetic (sourceId จาก hyperlink cell, tier จาก TIER col, log จาก note col) + `runCallingImport` ยิงเข้า local DB จริง (org_id=1, guild ราชบุรี) รวม idempotent re-run แล้ว cleanup — งานยังไม่ commit ผ่าน git

### Decision Log (2026-08-14 — โมดูล kanban)

- **โมดูล PM ตัวใหม่ = `kanban` (UI ไทย "การบ้าน")** — org-native feature #6
  ดีไซน์เต็มอยู่ที่ `md/kanban/KANBAN.md` · ผ่าน grill 13 ข้อ + `/scrutinize` + เช็คข้อมูลจริงบน Linux แล้ว → **ก้อน 0 ปิด เริ่มก้อน 1 ได้**
  แก่นที่ห้ามลืม: **การ์ดที่ผูกเคส/โพสต์ ห้ามเก็บสถานะเอง** ต้องคำนวณสดจาก entity ทุกครั้งที่แสดง
  ไม่งั้นบอร์ดโกหก → คนเลิกเชื่อ → กลายเป็น "ที่เก็บงานที่ 6" ซึ่งแย่กว่าไม่ทำ
  ⚠️ ข้อมูลจริง: โพสต์ `visibility='org'` มีแค่ **6 ใบ** (personal 23 ใบ ห้ามขึ้นบอร์ด) และเป็น `draft` เกือบหมด
  → **ห้ามขาย auto-mirror เป็นหมัดเด็ดรอบแรก** · ลำดับก้อนที่สลับไว้ (การบ้านของฉัน 3 ตารางก่อน) รับมือข้อนี้อยู่แล้ว

### Decision Log (2026-08-17 — ไม่เพิ่มยศ "ธุรการจังหวัด")

- โจทย์: ผช. ผู้ประสานงานจังหวัด ต้องโทรหาสมาชิก = ต้องเห็นเบอร์/LINE (PDPA) จำกัดจังหวัดเดียว
- เคยจะเพิ่ม token `province_clerk` แต่ **user ยกเลิกเอง** — `district_coordinator` (กรรมการจังหวัด) อยู่ใน `seeContacts` อยู่แล้ว และ scope ไม่ไล่ชั้น (`EXPANDING_PERMISSIONS = ['regional_coordinator']` เท่านั้น ที่ `resolveAccessV2.js:80`) = ได้จังหวัดเดียวตามต้องการ
- วิธีทำจริง: ติดยศกรรมการจังหวัด + ผูก `scope_node = province:<จังหวัด>` ที่ `/bot/roles` — ไม่แตะโค้ด
- ข้อแลก (user รับแล้ว): `district_coordinator` พ่วง `viewInternal`/`editProvinceAccount`/`createNonPrivate` (การเงินจังหวัด), `manageCases`, และเป็นผู้ลงนามเอกสารได้ (`db/docs/payers.js:18`) · ส่ง SMS หมู่ไม่ได้ (`api/calling/sms/route.js:14`)
- ถ้าวันหน้าอยากตัดการเงินออกจริง → ต้องแตก token ใหม่ และ **อย่าลืม INSERT `org_roles` ก่อน** (ดู Key Learnings ข้างบน)

### Decision Log (2026-08-18 — kanban custom field: กลับคำ 2 ข้อ)

1. **tripwire "รอทีม/org ที่ 2" ตกไป** — จุดประสงค์คือรอสัญญาณว่าจะมี field เรื่อยๆ · user บอกเองว่า "ผมนี่แหละจะเริ่มเพิ่มแล้ว" = สัญญาณมาแล้ว
2. **"category/อำเภอ/อุปกรณ์ ใช้ป้ายแทน custom field" ตกไป → ยุบป้ายเข้า field**
   บทเรียน: คำตอบเดิมเอา 2 คำถามมาปนกัน — *"status ควรเป็น custom ไหม" (ไม่ควร ยังถูก)* กับ *"category ควรเป็น custom ไหม"*
   ซึ่งตอบว่าใช้ป้าย **เพราะตอนนั้นไม่อยากสร้าง custom field** ไม่ใช่เพราะป้ายเป็นบ้านที่ถูก
   ⚠️ ระวังรูปแบบนี้: **เหตุผล "ยังไม่ถึงเวลา" ปลอมตัวเป็นเหตุผล "นี่คือดีไซน์ที่ถูก" ได้ง่ายมาก** พอเงื่อนไขเวลาเปลี่ยน ต้องรื้อคำตอบมาดูใหม่ทั้งอัน

**เกณฑ์เดียวที่ใช้ตัดสิน fix vs custom (จำไว้ใช้กับโมดูลอื่นได้):**
> **ระบบต้องอ่านค่านี้ไปทำงานเองไหม** — ถ้าลบ field ทิ้งแล้วมีโค้ดพัง = คอลัมน์จริง · ถ้าแค่ช่องว่างบนจอ = custom field

### Decision Log (2026-08-18 — โพสต์เบิ้ล: ตัด auto-retry ทิ้งทั้งระบบ)

- **"ล้ม = จบ ไม่ลองใหม่เอง เดี๋ยวมนุษย์ทำต่อ"** — user เคาะหลังเจอใบสรุปโพสต์เด้ง 2 รอบ · `MAX_ATTEMPTS` 3→1 ใน `services/publishWorker.js` และ `rest: { retries: 0, timeout: 60_000 }` ใน `index.js`
- เหตุผล: **"ได้ error กลับมา" ≠ "ยังไม่ได้โพสต์"** — โพสต์ออกแล้วแต่คำตอบหาย (timeout/5xx หลังบันทึก) หน้าตาเหมือนล้มจริงเป๊ะ · retry เองจึงเสี่ยงเบิ้ลซึ่งเรียกคืนไม่ได้ แลกกับ "ประหยัดคลิกเดียว" = ไม่คุ้ม · ปุ่ม "ลองใหม่" มีอยู่แล้วในหน้า /posts
- ค่า default ที่ต้องรู้: `@discordjs/rest` = timeout 15 วิ + retries 3 และมันมองว่า **AbortError (timeout) = ควรลองใหม่** → อัปรูป 10 ใบเกิน 15 วิ = ยิงซ้ำทั้งที่ Discord รับไปแล้ว · 429 ไม่เกี่ยวกับ `retries` (คนละเส้น ยังรอแล้วยิงต่อเองปกติ)

### Decision Log (2026-08-18 — kanban: เส้นแบ่งสิทธิ์ลอก Notion)

- **"ย้อนได้ = ทุกคน · ย้อนไม่ได้ = admin"** — user ปฏิเสธ admin gate ที่ผมเสนอทับ `fields/*` + `options/*` ทุกเส้น
  (*"ถ้าจำกัดให้คนแก้ option ได้น้อย ก็ใช้ยากอีก"* · *"ลอก notion มาเลย ตอนนี้ appflowy ใครก็ลบ แก้ไขได้ทุกอย่างไม่มี permit เลย"*)
  → Notion ไม่มีสิทธิ์ราย property เลย · กันพลาดด้วย **กล่องยืนยันที่บอกจำนวนจริง + ถังขยะ** ไม่ใช่ด้วยการห้าม
  `canPurge()` = admin เท่านั้น ใช้แค่ 2 ที่ (ลบ field · ลบการ์ด) — **ห้ามลามไปที่อื่น**
- **"กรุ" ที่มีอยู่แล้วคือถังขยะแบบ Notion พอดี** (มีโหมดดู + ปุ่มเอาออก) แค่ยังไม่มีปุ่มเทถังข้างใน — ไม่ต้องสร้างกลไกใหม่
- **ไม่ทำ "ชุดตั้งต้น" ของเช็คลิสต์** — user เคาะใช้ **duplicate card เป็น template** แทน (ก้อนเดียวได้ทั้งระบบ ไม่ใช่เฉพาะเช็คลิสต์)
- **duplicate = ลอกมาหมด** (*"ถ้า duplicate ก็ต้องลอกมาหมดเลยดิ"*) ยกเว้นของที่เป็น "ประวัติ" ไม่ใช่ "เนื้องาน"

### Decision Log (2026-08-19 — kanban UI: ลอก Notion/AppFlowy ทั้ง modal)

- **`FieldRow.jsx` = แถว `[ไอคอน · ชื่อ] | [ค่า]` ที่ของระบบกับ custom field ใช้ตัวเดียวกัน**
  เหตุผล: ถ้าต่างคนต่างเขียน grid เอง คอลัมน์จะเยื้องทันทีที่มีคนแก้ตัวเลขข้างเดียว
  จอแคบพับเป็นบนล่าง (ซ้าย 11rem บนจอ 390px เหลือที่ให้ค่าไม่พอ)
- **`TagCombobox` มี 3 โหมด** — `field` (ของเดิม แก้ตัวเลือกได้), `static` (สถานะ 6 แบบ), `search` (คนใน org)
  user: *"ทำให้อ่านอย่างเดียว"* = เลือกค่าได้ แต่แก้ตัวเลือกไม่ได้ · **โหมด field ห้ามแตะ**
  ⚠️ โหมด search ต้องค้น ไม่ใช่โหลดมาก่อน (org มี 7,376 คน) และ **ห้ามกรองซ้ำฝั่ง client**
  เพราะ server แมตช์ชื่อเล่น/ชื่อจริง/username หลายทาง กรองซ้ำจะตัดผลที่ถูกทิ้ง
- **ภาษาอังกฤษ: โมดูล = `Kanban` · ตัวงาน = `task`** (เดิมใช้ `Homework` ซึ่งแปลว่าการบ้านเด็กนักเรียน)
  แทนคำเดียวรวดไม่ได้ — "+ Add Kanban" / "Archive this Kanban?" อ่านไม่รู้เรื่อง · **ฝั่งไทยไม่แตะ**
- **ปุ่มลบ = ปุ่มเดียวแล้วเลือกในกล่อง (ลอก `PostsHome`)** — ไม่บังคับ 2 จังหวะ "ซ่อนก่อนแล้วค่อยลบ"
  user บอกว่าอ่านไม่รู้เรื่อง · ด่านกันพลาดคือ **ตัวเลขจริงในกล่อง** + ปุ่มลบถาวรที่แยกจากปุ่มซ่อน
- **`+` เพิ่มการ์ดในกอง: กองที่ไม่ใช่ backlog ตั้งคนกดเป็นเจ้าภาพ** (`assignToMe`)
  เพราะ DB CHECK ห้ามการ์ดไม่มีเจ้าภาพออกจาก backlog — **ยังไม่ได้ให้ user ยืนยันพฤติกรรมนี้**

### Decision Log (2026-08-19 — วิธียุบป้าย)

- **ไม่ DROP ตารางป้ายในรอบเดียวกัน** — ย้ายข้อมูล + สลับโค้ดก่อน เก็บตารางไว้จน prod นิ่ง ค่อย DROP รอบหน้า
  (แนวเดียวกับตอนยุบตะกร้าสื่อ ก้อน 4c) · rollback ไม่งั้นต้องกู้จาก dump
- **ไม่ทิ้งตัวกรอง — ชี้ไปที่ field แทน** กติกา OR-ในกลุ่ม/AND-ข้ามกลุ่ม แมปกับ field ได้ 1:1
  เปลี่ยนแค่ทางอ่านข้อมูล เคสเทสเดิม 19 ข้อผ่านหมดโดยไม่แก้ body (แก้แค่ helper `card()`)
- **`addCardTags` เพิ่มไม่ทับ** ต่างจาก `setCardLabels` เดิมที่เขียนทับทั้งชุด — import ไม่ควรลบค่าที่คนกรอกเอง
- อุปกรณ์เป็น checklist (ไม่ใช่ multi_select) ตามที่ user ออกแบบไว้เอง → ป้าย 8 ตัว/16 เส้น กลายเป็นงานย่อยที่ยังไม่ติ๊ก

### Decision Log (2026-08-19 — ล้างแล้ว import ใหม่ แทนการทำ dedupe)

- user เคาะ: **TRUNCATE แล้ว import ใหม่ทั้งชุด** ดีกว่าเขียน dedupe (ข้อมูลบนกระดานยังเป็นของ import ล้วน ไม่มีของที่คนกรอกเองที่กู้ไม่ได้)
- ⚠️ ข้อแลก: ทำแบบนี้ได้เฉพาะตอนยังไม่มีคนใช้จริง — พอมีคนกรอกงานเองแล้ว **ห้ามใช้วิธีนี้อีก** ต้องทำ dedupe
- TRUNCATE เฉพาะ `kanban_cards` (CASCADE ลูก) — **ไม่แตะ `kanban_field_defs`/`kanban_field_options`**
  เพราะ field + ตัวเลือกคือของที่ user จัดเองไว้ ไม่ใช่ผลผลิตของ import

### Do-Not-Repeat (2026-08-24 — 6 บั๊กเล็ก kanban รอบเดียว)

- **`TagCombobox.jsx` โหมด `onOpenProfile` (owner/helpers): outer wrapper ต้องเป็น `items-start` ไม่ใช่ `items-center`**
  เดิมปากกา (pencil, sibling นอกกล่อง flex-wrap ของชิป) ใช้ items-center → พอคนช่วย ≥3 คนทำให้ชิปตกไป 2 บรรทัด
  ปากกาลอยกลางแนวตั้งระหว่าง 2 บรรทัดพอดี ดูเหมือนหลุดไปอยู่บรรทัดล่างเดี่ยวๆ (ยืนยันด้วย screenshot จริง ไม่ใช่เดา CSS)
  items-start ยึดปากกาไว้กับขอบบนของบรรทัดแรกเสมอ ไม่ว่าจะ wrap กี่บรรทัด
- **`helpers/route.js` POST self-add ต้องเช็ค `canEditCard` ควบ `canClaimCard`** — เดิมใช้ canClaimCard อย่างเดียว
  ซึ่งบล็อกสถานะ done/cancelled (ตั้งใจกันคน "อาสา" งานที่ปิดแล้ว) แต่ดันบล็อกเจ้าภาพ/คนสร้างเองที่ควรแก้การ์ดตัวเองได้เสมอ
  ผลคือ "เพิ่มตัวเองไม่ได้แต่เพิ่มคนอื่นได้" (เพิ่มคนอื่นใช้ canEditCard อยู่แล้วซึ่งไม่เช็คสถานะ)
- **`fmtDueShort` ใน KanbanHome.jsx ไม่มี `year`** — ใส่ `year: '2-digit'` ตาม pattern เดียวกับ `components/calling/`
  (`day: 'numeric', month: 'short', year: '2-digit'`) งานข้ามปีดูวันที่ไม่ออกว่าปีไหนถ้าไม่มีปีกำกับ
- **แก้ badge/chip css ใน React แบบมี flex-wrap ซ้อนกันหลายชั้น — ต้อง screenshot จริงก่อนสรุป ห้ามเชื่อ CSS spec reasoning ล้วนๆ**
  วิเคราะห์ CSS ด้วยเหตุผลอย่างเดียวบอกว่า "น่าจะ work" ได้ แต่ browser จริงต่างจากที่คิด (เจอกับปากกา items-center)
  วิธี verify ไม่มี playwright/chromium-cli ในโปรเจกต์นี้ → ใช้ **google-chrome --headless=new --remote-debugging-port + ws (มีอยู่แล้วใน web/node_modules) คุย CDP ตรงๆ** ได้ ไม่ต้องติดตั้งอะไรเพิ่ม
  · login ทดสอบ: insert token ตรงลง `org_login_tokens` (อีเมล users.id=1) แล้ว nav ไป `/org/verify?token=...` ได้ session จริง — อย่ายิง POST /api/org/auth/magic (ส่งอีเมลจริง)
  · สคริปต์ .mjs ต้องวางใน `web/` ไม่ใช่ scratchpad — resolve `ws` ผ่าน web/node_modules (ESM ไม่ใช้ NODE_PATH) แล้วลบทิ้งหลังใช้เสร็จ
- **สถานะ 6 แบบ กรองได้ (`filter.statusGroup`) เพิ่มเข้าแถวตัวกรองแล้ว** — แยกจาก "จัดกลุ่มตามอะไร" (groupBy)
  กรองซ่อนใบที่ไม่เข้าเกณฑ์ ใช้ได้ทั้ง 2 โหมด groupBy (status/due) ตัวเลือกตายตัวเสมอ ปุ่มกรวยเลยโผล่ไม่มีเงื่อนไข
- **`TagCombobox.jsx` root div (`ref={boxRef}`) ต้องมี `w-full` เสมอ** — เดิมไม่มี width class เลย เป็น flex item
  ตัวเดียวใน value column ของ FieldRow (`min-w-0 flex items-center`) ไม่มี flex-grow เลยไม่ยืดเต็มคอลัมน์
  → กว้างแค่ shrink-to-fit ตาม min-content ของข้อความข้างใน **ข้อความไทยไม่มีวรรคแต่เบราว์เซอร์ยังหาจุดตัดบรรทัด
  ตรงพยางค์ได้** (เช่น "ยังไม่มีคน" ตัดจาก "ช่วย") → min-content แคบกว่าที่คิดมาก ข้อความสั้นๆ ตกบรรทัดทั้งที่จอกว้าง
  1280px ก็ยังตก (ไม่ใช่แค่จอมือถือ) ยืนยันด้วย screenshot จริง 2 รอบ (ก่อน/หลังแก้) ห้ามอนุมานจาก CSS spec เฉยๆ
