# CivicFlow — บันทึกความรู้

> บริบท: กำลังจะเข้าร่วมงานกับ CivicFlow — โจทย์ตรงกับสิ่งที่ทำอยู่ใน pple-volunteers มาก (multi-tenant, ระบบกลาง). เป้าหมายระยะสั้น: เตรียม Portfolio/CV ส่งเพื่อรับงาน consult ให้ทีมนี้.

## ภาพรวม

**CivicFlow** เป็น platform ที่ทำหน้าที่เป็น**ตัวเร่ง (accelerant)** ให้องค์กรภาคประชาสังคม — สร้าง infrastructure กลางให้กลุ่ม movement ต่างๆ ใช้ร่วมกัน

- ต้นทาง: **ทนายจูน** เจอกับ **Article Group** แล้วต่อยอดมาเป็นโปรเจกต์นี้
- ฝั่งไทย: **Daybreaker** (NGO ไทย) เป็นผู้สนับสนุน — ทำหน้าที่สะสมองค์ความรู้ของเครือข่าย (network knowledge base)
- โฟกัสงาน: สื่อสารเชิงกลยุทธ์ (strategic communications) + movement infrastructure
- มีโปรแกรมชื่อ **Civic Incubation Program (Pilot)**

## Ecosystem — เครือข่าย MIDI

MIDI เป็นกลุ่มองค์กรพันธมิตรที่ทำงานร่วมกัน แต่ละองค์กรถนัดคนละด้าน:

| องค์กร | บทบาท |
|---|---|
| **Engage Thailand** | องค์กรไทยในสหรัฐฯ (US) กำลัง seek เงินทุน, ต้องการช่วยลดภาระด้านภาษี (tax) ให้ผู้บริจาค |
| **Daybreaker Network** | Learning community — สร้างฐานข้อมูล activist (~3,700 คน), ยิงอีเมล/ติดต่อคนในเครือข่าย |
| **Tune & Co.** | Creative agency — งานด้านสื่อ/creative |
| **Seedpod** | ช่วยเรื่องการเงิน (financial support) |

**โมเดลการทำงาน:** *"You train, we facilitate"* — CivicFlow/MIDI ไม่ได้ลงไปสอนเอง แต่ทำหน้าที่ facilitate ให้องค์กรภาคประชาสังคมแชร์องค์ความรู้กันเอง

**เป้าหมายเชิงพลัง:** สนับสนุนการสร้าง**อำนาจร่วม (collective power)** ของแต่ละองค์กร — แบ่งเป็น 4 รูปแบบ (ยังไม่ได้ระบุรายละเอียด 4 แบบนี้)

**ตัวเลขที่พูดถึง:**
- เครือข่ายปัจจุบัน ~3,729 คน
- เป้าหมาย unlock 1,000+ participants เพิ่ม ผ่าน:
  - Activist database
  - Creative (งานสื่อ)
  - SMS — รวมถึงทำ onsite / ใช้เป็นพื้นที่จัดกิจกรรมได้

## ปัญหาที่ CivicFlow กำลังแก้

องค์กรภาคประชาสังคมจำนวนมาก **สะสมสมาชิกได้ แต่ไม่มี data กลาง** (คล้ายปัญหาที่ระบบ **ACT** ของเราเจอ) — ต่างคนต่างเก็บ ไม่เชื่อมกัน

เครื่องมือ/แนวทางที่ถูกอ้างถึงในวงการนี้:
- **Union More** — membership management
- **CivicFlow** — การจัดการงบประมาณ (budget management)
- **Tech infrastructure ภาคประชาชน** — ได้รับการลงทุนจาก **Higher Ground Labs**

แนวทางที่ CivicFlow เลือก: ออกแบบเป็น**ระบบกลาง (centralized system)** แบบ **multi-tenant** — รองรับหลายองค์กรใช้แพลตฟอร์มเดียวกันได้

## Business Model — ยังไม่เคาะ (คำถามเปิด)

- **SaaS หรือไม่?** ถ้าเป็น SaaS เงินจะเข้าใคร โครงสร้างรายได้เป็นยังไง — ยังไม่ชัด
- **TLHR** (ศูนย์ทนายความเพื่อสิทธิมนุษยชน) เป็นผู้วางมาตรฐานการใช้งานแพลตฟอร์ม และเป็น pilot องค์กรแรก
- **ปัญหาการเก็บค่าใช้จ่าย:** แต่ละองค์กรมีกระบวนการเคลียร์งบ/ขอบประมาณไม่เหมือนกัน → ต้องออกแบบ **custom form** ต่อองค์กร ไม่ใช่ one-size-fits-all

## ความเกี่ยวข้องกับงานที่ทำอยู่ (pple-volunteers)

จุดที่ตรงกันมาก:

- **Multi-tenant** — CivicFlow ต้องรองรับหลายองค์กรบน platform เดียว ตรงกับทิศทาง rebrand ของ pple-volunteers ที่เคาะไปแล้วว่าจะเป็น multi-tenant org platform (ดู memory `project_rebrand`, `decision_tenant_anchor_guild`)
- **ปัญหา "ไม่มี data กลาง"** — ตรงกับที่ระบบ ACT พยายามแก้ และตรงกับที่ pple-volunteers กำลังทำ (guild → org mapping, membership/roster กลาง)
- **Custom form ต่อองค์กร** — คล้ายปัญหาที่เจอตอนออกแบบ role config / access ต่างกันในแต่ละ guild
- **ระบบขอเงิน + เซ็นเอกสารของ CivicFlow = docs ที่เราทำเป๊ะ** — เขาเพิ่งเริ่มหัดทำกับ Claude Code, เรานำไปไกลมาก (docs/finance/calling/cases รันจริง multi-tenant แล้ว)

---

# 🎯 กลยุทธ์ & ข้อสรุปที่เคาะแล้ว (grilling 2026-07-14)

## บทบาท & endgame
- **บทบาทเฉพาะหน้า:** เข้าไปเป็น consult — แต่ consult คือ **wedge** ไม่ใช่ปลายทาง
- **Endgame:** ดัน software ของเราให้เป็น **core platform** ที่ทุกองค์กรมารวมกัน
- **วิธีเข้าที่ทำให้ถอดไม่ออก:** ไม่ใช่ "ให้คำแนะนำ" (เขาเอาไปต่อ Claude Code เองได้ = เสียเปล่า) แต่ **เอา pilot จริง (TLHR) มารันบน platform ของเรา** → data เขาอยู่ในระบบเรา = core โดยพฤตินัย
- **Portfolio = demo รันได้จริง** ไม่ใช่สไลด์ (เขาเพิ่งตั้งไข่ เรามีของรันจริง = พูดแทน CV ทั้งใบ)

## โมเดลเงิน / IP — Open-core แยกชั้น (กฎเหล็ก)
> "พัฒนาของตัวเอง" + "รับจ้างพัฒนาให้เขา" ไปทางเดียวกันได้ **แต่ต้องแยกชั้นความเป็นเจ้าของ** ไม่งั้น work-for-hire โดย default = เขาเป็นเจ้าของ core เราฟรี

| ชั้น | เจ้าของ | เก็บเงิน |
|---|---|---|
| **Core engine** — multi-tenant, org/auth, docs/sign, finance, membership, RBAC, **form builder engine** | **เรา** (ผลิตภัณฑ์) | CivicFlow **license** มาใช้ |
| **Custom layer** — ฟอร์มขอเงินแต่ละอันของ TLHR, branding, onboarding org เขา, integration เฉพาะเขา, ข้อมูลเขา | **เขา** (งานจ้าง) | คิด**ค่าแรง**พัฒนา |

- **สัญญาต้องเขียนเส้นนี้เป็นลายลักษณ์อักษร** — core = pre-existing IP ของเรา ให้ใช้แบบ license ไม่ใช่ส่วนของงานจ้าง
- ในทางปฏิบัติ: **core อยู่ repo ของเรา** งาน CivicFlow ดึง core เข้าไปใช้ ไม่ใช่เขียน core ใหม่ในโปรเจกต์เขา
- ⚠️ **form builder engine = core (ของเรา) / ฟอร์มที่ถูกสร้างแต่ละอัน = ของเขา** — engine คือจุดขาย ห้ามยกให้

## Product identity — email-first, Discord เป็นชั้นสูง (เคาะหลัง grill หนัก)
- **กลุ่มลูกค้าจริง = คนที่ยังไม่คุ้น Discord = กลุ่มใหญ่ที่สุด** (TLHR = สำนักงานทนาย ไม่รันองค์กรบน Discord)
- ดังนั้น **core product = email/web-first เรียบง่าย** · **Discord = ชั้นสูง (adapter) สำหรับ org ที่พร้อม** ไม่ใช่ประตูทางเข้า
- แยกให้ชัด: **"Discord เป็น workspace" = value ที่เก็บไว้ได้** ≠ **"Discord เป็นประตู/ตัวตน" = ตัวที่ต้อง demote**. สองอันนี้ไม่ขัดกัน (org สมัคร email → ระบบพาเข้า Discord workspace ทีหลัง)
- **โมเดล "บันได":** ประตูหน้า = email + web (docs/เซ็น/ขอเงิน/สมาชิก, คุ้นเคย ไม่หักดิบ) → ชั้นสูง = เชื่อม Discord (roster real-time, bot, ห้องชุมชน) ปลดล็อกเมื่อ link

## สถานะโค้ดจริง (verify แล้ว 2026-07-14)
- ✅ มี `organizations` table (id/name/slug) แต่ **เกิดจาก guild** — สร้าง org โดยไม่มี Discord ไม่ได้; `dc_guilds.org_id` เชื่อม guild→org
- ⚠️ ทุกฟีเจอร์ยังยึด `guild_id` (**103 refs** ใน migration vs `org_id` แค่ **5**); org ใช้จริงแค่ใน cases นิดเดียว
- ⚠️ **Identity เป็น Discord ล้วน** — Google/Line login ก็วิ่งไป `findDiscordIdByProvider` แปลงกลับเป็น `discordId`; ไม่มี user ที่ยืนด้วย email เอง
- ⚠️ **docs ผูกลึกกับ Discord role** — `docs_payers` คำนวณสิทธิ์เซ็นจาก `resolveAccess(guildId, roleNames)` + geography → รื้อ = แตะหัวใจระบบ

## แนวทางเทคนิค — สร้าง core สะอาดวางข้างๆ (ห้ามรื้อของเดิม)
> ของที่ "ผูก Discord เต็มไปหมด" = **customization ของ tenant เดียว (PPLE)** ไม่ใช่ core → ปล่อยไว้ ไม่ต้องแตะ

- **ของเดิม (PPLE)** = "tenant #1 ที่เปิด Discord adapter เต็มสูบ" — โชว์เคส ไม่ใช่ตัวที่ต้อง migrate
- **core ใหม่** = org + email user + generic role + docs/sign แบบ email token — **สร้างใหม่สด ขนานกัน risk ต่อ production ≈ 0**
- ค่อยรวม 2 อันทีหลัง (Stage 1+) เฉพาะเมื่อมีเหตุจ่ายเงินจริง
- **identity ไม่แทนที่ discordId แต่ยกขึ้น:** `users(id, email, discord_id)` — discord_id เป็นแค่ column ที่ห้อยใต้ user กลาง; backfill discordId เดิมทุกตัว → ของเดิมไม่พัง

## Data model — identity/tenant core (ออกแบบ 2026-07-14)
> หลักการคุม: **ตัวตน = email · สิทธิ์ = role · แยกกัน** (Discord หลอม 2 อันนี้รวมกัน = ต้นตอความสับสนเดิม)

```
organizations  (มีอยู่แล้ว)          ← ตัวตนองค์กร = tenant anchor
  id, name, slug
  discord_guild_id  NULL             ← Discord ใช้/ไม่ใช้ก็ได้ (เสริม ไม่ใช่แกน)

members  (เพิ่มใหม่ — ตารางเดียว)     ← ตัวตนคน (email-native)
  id, org_id, email, display_name
  role                               ← สิทธิ์ในองค์กร
  discord_id  NULL                   ← สะพานเชื่อม Discord ทีหลัง

ownership ทุกตารางฟีเจอร์ = org_id (tenant) + member id (person)
  แทนที่ WHERE guild_id=? → WHERE org_id=?  (เฉพาะ core ใหม่ — โลกนี้ไม่มี guild)
  แทนที่ owner=discordId  → owner_id=members.id
```

**ตัดสินใจย่อยที่เคาะแล้ว:**
- **ตารางเดียว `members`** (ไม่แยก users + org_members) — 1 คนต่อ 1 องค์กร = 1 แถว · ยอมรับ identity per-org ก่อน · cross-org identity เป็น nice-to-have ทีหลัง (จับด้วย email)
- **`organizations.id` = ตัวตนองค์กร** ไม่ใช่ server_id/guild_id · Discord guild = column เสริม null ได้
- **org แบนก่อน** · สาขา = เติม `org_units` + `unit_id` (nullable) ทีหลัง ไม่พัง org แบน
- **ห้ามใช้ `dc_members` เดิมเป็น members** — query PPLE (`WHERE guild_id`, join discord_id, resolveAccess บน Discord role) จะปนกับแถว email-org = เสี่ยง PPLE · ตารางใหม่แยก = PPLE เสี่ยง 0

**dc_members ↔ members — coexistence:**
- **v1:** แยก 2 โลก 100% · PPLE อยู่ dc_members · org ใหม่อยู่ members · **ไม่เชื่อม ไม่ sync** · สร้าง members แล้วลืม dc_members ได้เลย
- **สะพาน (Stage 2, org ปีนบันไดขึ้น Discord):** `members.discord_id` · org link guild → bot sync roster → จับคู่ members ด้วย discord_id · ข้อมูล Discord (role ในguild) เก็บใน roster cache แบบ dc_members
- **ปลายทาง = 1 ระบบกลาง (ไม่ใช่ 2 ตลอดไป):** migrate PPLE ขึ้น `members` (backfill ผ่าน discord_id) → `dc_members` ลดเหลือ **Discord roster/role cache** ไม่ใช่ตัวตนอีกต่อไป. "เริ่ม 2 เพื่อไม่พังของเดิม แล้วบรรจบเป็น 1"

## Role / Permission model — reuse โครง PPLE ที่มีอยู่ (สำรวจโค้ดจริง 2026-07-14)
> ชื่อแพลตฟอร์ม: **platformfor.org** · core ตัวเดียวกันนี้ใช้ทั้ง PPLE + CivicFlow + org อื่น

**สำคัญ: ระบบ PPLE ปัจจุบันมี two-layer model ที่เราต้องการอยู่แล้ว** — reuse pattern ได้เลย ไม่ต้องประดิษฐ์ใหม่

**"role ทำอะไรได้" กำหนด 3 ที่ (ตอนนี้):**
```
Discord role ──①──► permission ──②──► capability ──③──► action
```
- **① Discord role → permission** = DB ตาราง `dc_guild_roles` · ตั้งผ่าน web UI `web/app/bot/roles` (API `web/app/api/bot/roles/route.js`) + seed `scripts/migration/seed-guild-roles.js` · ต่อ guild
- **② permission → capability** = **hardcode ใน `web/lib/permissions.js`** ⭐ ไฟล์หลัก · universal ไม่ขึ้น guild
- **③ feature เช็ค capability** = ในแต่ละหน้า/API ตอนทำ action

**`web/lib/permissions.js` มี 2 ส่วน (= "กลาง" ที่เราตามหา):**
- `PERMISSIONS` = 10 ตำแหน่ง: admin, secretary_general, regional_coordinator, province_coordinator, district_coordinator, treasurer, editor, moderator, caseworker, member
- `CAPABILITIES` = matrix "capability → permission ที่ทำได้" เช่น `editWide: ['admin','secretary_general','treasurer']`, `manageCases: [...,'caseworker']`, `sendBulkSms: [...]`

**หลักการ (คำศัพท์ในโค้ด):** code เรียก "permission" = *ตำแหน่ง* (role bundle) · "capability" = *ความสามารถ* (atomic action) · `reduceRoleRows` (pure, ใน `resolveAccess.js`) = ตัวรวบ permission จาก role ที่ถือ

**ดีไซน์ platformfor.org core:**
- **reuse pattern `permissions.js`** (PERMISSIONS list + CAPABILITIES matrix) — hardcode v1, จุดเดียวเห็นหมด
- **"กลาง" ที่แชร์จริง = capability vocabulary** (CAPABILITIES) — feature เช็คอันนี้ ไม่เช็คชื่อ role
- **role = named bundle** ตั้งชื่อต่างกันได้ต่อ org แต่ map เข้า capability กลางชุดเดียว
- **PPLE = template ของภาคประชาสังคมไทย** (โครงสร้างองค์กรคล้ายกัน — coordinator ตามพื้นที่/เหรัญญิก/เลขา/caseworker) ไม่ใช่ "tenant แปลก" → ใช้เป็นชุด role ตั้งต้นได้
- **scope (geography)** = มิติ optional · PPLE ใช้ (province:) · org แบน/CivicFlow = null · `reduceRoleRows` คืน permissions + scopeGrants แยกกันอยู่แล้ว
- v1 hardcode → ตาราง `org_roles` ตอนลูกค้าขอ custom (reduceRoleRows ไม่ต้องแก้)

**⚠️ ยังไม่รู้:** role/ตำแหน่งจริงของ CivicFlow (user ยังไม่ส่ง — อย่าเดา/มั่ว) · ถ้ายังไม่มี เริ่มด้วย template PPLE ไปก่อน

## ก้อนอิฐก้อนแรก (เริ่มเมื่อหัวโล่ง)
**"org สมัครด้วย email → เห็น dashboard ว่างๆ ของตัวเอง"** — เล็กสุด เสี่ยง 0 พิสูจน์รากที่กลัวที่สุด (email-native identity + org ยืนเองได้)
- `organizations` มีแล้ว → เพิ่ม `users` (email) + `org_members` + หน้า signup
- ยังไม่ต้องมี docs/sign/finance · ไม่แตะโค้ด PPLE สักบรรทัด
- ก้อนถัดไปค่อยต่อ: docs + sign แบบ email token (ไม่พึ่ง dc_members / Discord role)

## Action Items
- [ ] วางก้อนแรก: `users` + org email signup + dashboard เปล่า (parallel, ไม่แตะ PPLE)
- [ ] เตรียม demo path เดียวให้ลื่น: email → org → docs → เซ็น (เป็นทั้ง portfolio + proof-of-core)
- [ ] ล็อกเรื่องสัญญา/IP ก่อนลงแรงลึก (core = license, custom = งานจ้าง)

## Hosting — ย้าย CivicFlow จาก Vercel มา VPS (เคาะ 2026-07-14)

**บริบท:** CivicFlow ทำ prototype บน Vercel (+น่าจะ Supabase) แบบ vibe-code เพราะทีมไม่รู้โค้ด — ไม่ใช่ requirement, เป็นของทิ้งได้. เราเป็นคนกำหนดสถาปัตยกรรม (นั่นคือเหตุผลที่เขาจ้าง)

**ความเข้าใจพื้นฐาน (กันลืม):**
- **Vercel = "ตู้กดน้ำ" สำหรับ *ส่วนหน้าเว็บ*** — deploy ง่าย, auto-scale, เร็วทั่วโลก (CDN วางสำเนาใกล้ผู้ใช้ + หน้าเว็บทำเสร็จรอไว้), zero-ops. **แต่รันของค้างไม่ได้** (bot/websocket/งานเบื้องหลัง ดับทุกครั้ง) + ไม่มี database ในตัว (stateless ขัดกับ stateful)
- **Supabase = database+auth สำเร็จรูป เช่ารายเดือน** — จ่ายค่า "คนดูแลแทน" ไม่ใช่ค่า software
- **เว็บใหญ่ที่ใช้ Vercel** = ใช้แค่ชั้นหน้า, backend/db/ของหนักอยู่ที่อื่นเสมอ — ไม่มีใครยัดทุกอย่างลง Vercel
- **VPS = "ครัว"** ทำได้ทุกอย่างเพราะเราเป็นเชฟเอง · ข้อจำกัด Vercel = ราคาที่จ่ายเพื่อ zero-ops · เรามีสกิล → ครัวคุ้มกว่า
- **CDN ต่างจังหวัด:** VPS เดียววิ่งที่เดียว แต่ผู้ใช้อยู่โซนเดียว (ไทย/ภูมิภาค) = เร็วพอ · โตค่อยเอา CDN ครอบหน้า VPS ได้

**ข้อเสนอที่จะพูดกับ CivicFlow:**
> ระบบเราต้องมีของรันตลอดเวลา (bot, งานเบื้องหลัง) ซึ่ง Vercel ทำไม่ได้ — VPS ทำได้ครบในที่เดียว ถูกกว่า และผมมี server พร้อมอยู่แล้ว ดูแลให้เอง

3 เหตุผล (ภาษาคนไม่รู้โค้ด):
1. **ทำได้ครบ** — Vercel รัน bot/backend ค้างไม่ได้ ต้องต่อบริการเสริมหลายเจ้า · VPS จบที่เดียว
2. **ถูกกว่า** — มี server เหลืออยู่แล้ว ต้นทุนแทบไม่เพิ่ม · Vercel+Supabase จ่ายรายเดือนหลายเจ้า ยิ่งโตยิ่งแพง
3. **มีคนดูแล** — จัดการอัปเดต/สำรองข้อมูล/แก้ปัญหาให้หมด (บน Vercel ทีมไม่รู้โค้ดจะตันเมื่อเจอข้อจำกัด)

**พูดตรงเพื่อความน่าเชื่อ:**
- Vercel เหมาะกับทีม *ไม่มีคนเทคนิค* + traffic *พุ่งมหาศาลกะทันหัน* — CivicFlow ไม่ใช่ทั้งคู่ → ข้อดี Vercel ไม่ได้ใช้ ข้อจำกัดกลับมาขวาง
- **โปร่งใส:** server เป็นของเรา แต่ข้อมูลเป็นของ CivicFlow · ย้ายออกได้ตลอดถ้าแยกทาง (ไม่จับเป็นตัวประกัน) — พูดก่อนตัดข้อกังขา "อยากผูกเรา?"
- Vercel prototype เดิม = ใช้เป็น mockup ต่อได้ · platform จริงรันบน VPS

**เผื่อโต:** ตอน scale เป็น SaaS หลาย tenant → ควร containerize (Docker) ให้ VPS ย้าย/ก็อปได้ ไม่ผูกเครื่องเดียว/คนเดียว · ยังไม่ต้องทำตอนนี้

## 🔧 Migration Plan — identity/tenant (เคาะ 2026-07-15, ทำ session หน้า)

**สถาปัตยกรรมที่ล็อกแล้ว:**
- **identity = `dc_members` ตารางเดียว** (evolve เป็น universal user table) · `dc_members.id` = canonical user id · **drop ตาราง `members`** ที่สร้างไว้ตอนแรก (ซ้ำซ้อน)
- **แกน ownership:** `discord_id → user_id` (FK → dc_members.id) · **แกน tenant:** เพิ่ม `org_id` (FK → organizations.id) — เลือก org_id ไม่ใช่คง guild_id เพราะ tenant คือ org จริงๆ, เลี่ยง snowflake ปลอม, เกาะ migration เดิมต้นทุนน้อย
- **org ≤ 1 guild (1:1)** — ตัดความซับซ้อน "หลาย guild ต่อ org" ทิ้ง → ไม่มี scope-widening · email org = 0 guild
- **Discord-only/adapter tables ไม่แตะ** (`dc_user_ratings`, `dc_user_reports`, `dc_social_accounts`) — คง discord_id+guild_id (Discord per-guild โดยธรรมชาติ)
- **ห้าม auto-generate guild ต่อ org** — ผิดกลยุทธ์ (บังคับ Discord) + ทำไม่ได้ (Discord API: bot ใน >10 guild สร้าง guild ไม่ได้) · Discord = **link** เอง ไม่ generate
- pattern = **expand → migrate → contract** (เพิ่ม column ใหม่ + backfill ก่อน, ค่อยสลับ code ทีละจุด, ลบเก่าทีหลัง)

**Phase 0 — เปิดทาง email identity (เล็ก, additive, ปลอดภัย):**
- **drop ตาราง `members`** + ลบ block ใน migration.sql (2026-07-15)
- `dc_members`: **เพิ่ม column `email`** (ยังไม่มี! มีแต่ phone/line_id/google_id) · ทำ `discord_id` + `guild_id` **nullable** (email user ไม่มีทั้งคู่)
- แถว email = discord_id/guild_id null → PPLE query (`WHERE guild_id=X`) มองข้ามเอง = ไม่กระทบของเดิม

**Phase 1 — email-native login (จุดเริ่ม "start from login"):**
- login path ใหม่: Google + magic-link → หา/สร้าง `dc_members` ด้วย email (ไม่ต้องมี discord_id, ไม่โดน block NotLinked)
- แยก platform login ออกจาก PPLE Discord login (repo เดียว คนละ route/surface) · session ถือ user_id (dc_members.id) + org
- **login เดียว หลายปุ่ม บัญชีเดียว** (Google/email/Discord = ปุ่ม, ผูก dc_members ตัวเดียว)
- **+ ตาราง `org_members` (membership — user↔org many-to-many):** ออกแบบ 2026-07-15
  ```sql
  CREATE TABLE org_members (
    org_id INT REFERENCES organizations(id), user_id INT REFERENCES dc_members(id),
    role VARCHAR(40) DEFAULT 'member',        -- permission vocab (permissions.js)
    status VARCHAR(12) DEFAULT 'active',       -- 'active' | 'invited'
    invited_by INT REFERENCES dc_members(id), joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (org_id, user_id) );
  CREATE INDEX idx_org_members_user ON org_members (user_id);
  ```
  - **จำเป็นเพราะ 1 user อยู่หลาย org ได้** (role อยู่ที่ membership ไม่ใช่ที่ user) → ยัดลง dc_members ไม่ได้ (1 แถว/คน) ไม่งั้นต้อง duplicate คน
  - **รวบ `dc_user_guild` มาในตัว** — พอ org ≤ 1 guild, membership คิดระดับ org พอ ไม่ต้องแยก per-guild → core = 3 ตาราง (users / organizations / org_members)
  - **flow:** สร้าง org → INSERT org_members(role=owner) · login → `SELECT org_id,role WHERE user_id=? AND status=active` → 0=onboarding / 1=เข้าเลย / N=org picker+switcher · session ถือ `{user_id, active_org_id, role}`
  - **กติกา:** org ต้องมี owner ≥ 1 เสมอ (ห้ามลบ/ลดขั้น owner คนสุดท้าย) · self-serve: ใครก็สร้าง org ได้ (เป็น owner)
  - **invite = (ก) เคาะแล้ว 2026-07-15:** เชิญ = สร้าง **shell user** (users แถวเปล่า มีแค่ email, discord_id=NULL) + `org_members(status='invited')` → พอเจ้าตัว login ด้วย email เดียวกัน → เติมข้อมูล shell + flip status='active' · **ตารางเดียว ไม่ต้อง org_invites** เพราะยึด email จับคู่ได้ก่อนมี account · (ข้อ ข = org_invites แยก — ไม่เอา)
  - **✅ design phase core ปิดแล้ว** — ที่เหลือ (org switcher UI, org_roles custom) = แก้ตอน build · session หน้า **ลงมือ Phase 0 → 1**

**Phase 2 — ownership migration ต่อ feature (incremental · order+rule เคาะใหม่ 2026-07-16):**
- เพิ่ม `user_id` + `org_id` + backfill (user_id จาก discord_id ผ่าน dc_members · org_id จาก guild_id ผ่าน dc_guilds.org_id)
- **order: cases + finance ก่อน** (งาน org generic ไม่ผูก geography/ตำแหน่งพรรค + ตรง CivicFlow) → **docs ทีหลัง** (ยากสุด: docs_payers สิทธิ์เซ็นผูก Discord role + geography)
- **⚠️ rule ไม่ใช่ swap ตรงๆ — judgment ทีละตาราง:**
  - `user_id`←`discord_id` = universal (ตัวตน/เจ้าของ) · `org_id`←`guild_id` = **เฉพาะตาราง "data ของ tenant"**
  - **config/artifact ของ Discord server เอง (เช่น `finance_config`, channel settings) → คง `guild_id`** (ตั้งค่าของเซิร์ฟเวอร์ ไม่ใช่ของ org) · email org (0 guild) → config ที่ org_id/table แยก เคาะตอน migrate
- **discord_id → drop เป็น key** (Discord login ยังอยู่ = credential map เป็น user_id) · **RBAC คนละส่วน:** email world สลับ financeAccess/caseGate ไปใช้ `org_members.role`
- ตารางมี person-ref 2 อัน → 2 user_id column · เช็ค capability ผ่าน permission (permissions.js)

**Phase 3 — deferred (ทำเมื่อจำเป็น / subagent):**
- extract `dc_user_guild` (ย้าย roles/nickname per-guild ออกจาก dc_members — เก็บ PPLE multi-guild dup) — 112 refs, isolate
- rename `dc_members → users` (subagent + checkpoint commit) — อย่าพันกับ Phase 1-2 · **⚠️ ไม่ใช่ find-replace "member" มั่วๆ**

**🏷️ Naming — "member" ในโค้ดมี 2 ความหมาย แยกถูกแล้ว (verify ด้วยตัวเลข 2026-07-15):**
- **user / person = identity** → `dc_members` (ตารางนี้ตั้งชื่อเพี้ยน จริงๆ คือ "users"), `member_discord_id` (38 จุด)
- **member = membership องค์กร** → `member_id` (237 จุด = **เลขสมาชิกองค์กรภายนอก คนละ concept ห้าม rename เป็น user_id**)
- scope rename identity จริง ≈ **~150 จุด** (112 ตาราง + 38 member_discord_id + ตัวแปรบางส่วน) ไม่ใช่ 400+
- **going forward: identity ตั้งชื่อ "user" · membership คงคำ "member"** · map เข้าโมเดล multi-tenant พอดี (user=คน, member=คนอยู่org)
- **บทเรียน:** rename เชิง concept ต้อง judgment ทีละจุด — find-replace "member" รวดเดียว = พัง member_id 237 จุด
- เคาะ PPLE 3 guild: อาสาฯ = org หลัก, ราชบุรี/People's Party เอาไง
- cases ข้าม org (รวมเรื่องร้องเรียน) = feature เฉพาะ ไม่ใช่ core layer

**scope person-ref:** ไม่ใช่แค่ column ชื่อ discord_id — มี target_id/rater_id/reporter_id/member_discord_id/payer_discord_id ด้วย → grep person-ref ทุกชื่อก่อนลงมือ

## คำถามเปิด (ยังไม่รู้ — อย่าเดา)
- MIDI คืออะไรกันแน่ (coalition / เจ้าของ CivicFlow / ชื่อเดียวกัน?) · CivicFlow เป็นสมาชิกใน MIDI หรือตัวแม่?
- "ทนายจูน เจอกับ Article Group" — ใครเป็นใคร, Article Group คือองค์กร/กลุ่มทุน?
- Union More กับ CivicFlow = คนละผลิตภัณฑ์ หรือ 2 โมดูลใน platform เดียว?
- Engage Thailand "อยากลด___" = ภาษี (tax) หรือ ภาษา (language)? — เดาว่า tax แต่ยังไม่ยืนยัน
- "4 รูปแบบของอำนาจร่วม" — เนื้อในคืออะไร
- บทบาทคุณในดีลนี้กับ **ใครเป็นคนจ้าง** (CivicFlow / MIDI / Daybreaker?)
- Business model ของ CivicFlow เอง (SaaS / grant-funded via Higher Ground Labs / อื่นๆ) — เงินเข้าใคร
