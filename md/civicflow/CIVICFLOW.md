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

## 🌐 platformfor.org / CivicFlow — identity/tenant migration (✅ เสร็จ 2026-07-21 · เหลือ cutover)
> ย้ายมาจาก md/PENDING.md (2026-07-29)

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
  - รายละเอียดต่อฟีเจอร์อยู่ในหัวข้อย่อยข้างล่าง (FINANCE / CALLING / DOCS) · cutover runbook = `md/archive/CUTOVER.md` (10 ขั้น)
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

#### 💰 FINANCE org-scope — ✅ เสร็จ + verify 2026-07-17 (commit be4d8d3 บน org-core · localhost applied, prod ไม่แตะ)
**สรุปที่ทำจริง (ต่างจาก spec เดิม 2 จุด — ดีกว่า):**
- migration `scripts/migration/org-scope/02-finance-org-scope.sql` (applied localhost): **in-place type convert** `guild_id→org_id` + `owner_id/updated_by` varchar discord→INT users.id **คงตำแหน่งคอลัมน์** (ไม่ใช่ rename tail col ที่กองท้าย) · ลบ tail col (org_id/owner_user_id/updated_by_user_id) ที่เติมช่วงออกแบบ · FK→users/orgs · gotcha: USING ห้าม subquery → ใช้ pg_temp helper fn `_g2o`/`_d2u`
- **getOrgId = `orgIdOfGuild(getGuildId)` ไม่ใช่ active_org cookie** (ค้าน spec เดิม): access-control ยัง guild-keyed → derive org จาก guild เดียวกัน = data+access aligned ไม่มี seam · cookie-based เลื่อนไป org-switcher endgame (ขยับพร้อม RBAC-by-org)
- getTransactions/summaries **เพิ่ม** org filter ผ่าน account join (เดิมไม่ scope เลย — latent leak) · financeAccess owner_id===userId · getEffectiveIdentity+useEffectiveRoles คืน userId (debug-null) · ลบ admin guild-picker ใน account form
- verify: 57 tests + build + psql queries คืน data จริง + /finance 307
- ✅ **bot write-path เสร็จ 2026-07-18** (org-core, code-only ไม่มี schema change — finance schema convert เสร็จใน finance-org-scope.sql แล้ว) — emailPoller/smsWebhook/financeOCR INSERT `org_id` แทน `guild_id` (จาก `account.org_id`) · `updated_by`: email/sms income (automated) = `NULL` / OCR (user upload) = `userIdByDiscord(message.author.id)` (map discord→users.id ไม่ใช่ 'system'/snowflake) · finance_config lookup (notifyDiscord) ใช้ `env.GUILD_ID` (account ไม่มี guild_id แล้ว · finance_config คง guild-keyed = Discord artifact) · financeOCR SELECT accounts + dup-check → `org_id` · +helper `db/org.js` `orgIdOfGuild`/`userIdByDiscord` · verify: node --check ×4 + simulate INSERT org_id=1/updated_by=NULL ผ่าน schema + orgIdOfGuild(env)=1
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
> - ✅ **เก็บกวาด** `scripts/migration/org-scope/07-docs-index-rename.sql` (applied localhost, idempotent): index/constraint 4 ตัวชื่อหลอก `guild`/`discord_id` → `org`/`user_id` · ตัด dead code `changePayer()` + `assignedPayers` + state/prop ที่ค้าง (`payerSaving`, `eventId` ที่ DocEntryList ไม่ได้ใช้แล้ว)
>
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
> **✅ Phase 1 — RENAME เสร็จ+commit 715cffa (2026-07-19):** `ngs_member_cache→cache_pple_member` · `act_event_cache→cache_pple_event` (สื่อว่าเป็น cache external-sync ต่อ tenant) · `scripts/migration/org-scope/03-cache-rename.sql` (idempotent, prod cutover ต้องรันตอน merge) · 31 js + 5 md · ⚠️ column `docs_projects.act_event_cache_id` **คงชื่อเดิม** (rename column = docs scope creep) · cross-feature: rename แตะ docs ด้วย (docs ผูก 2 ตารางนี้หนัก) แต่ additive ไม่พัง · verify build exit0 139 pages + DB JOIN ผ่าน
>
> **✅ Phase 2 — org-scope + full parity เสร็จ+verify 2026-07-19 (commit 1be4d48 + 137f99f):**
> - `scripts/migration/org-scope/04-calling-org-scope.sql` (dry-run BEGIN/ROLLBACK ผ่านก่อน → COMMIT, applied localhost) · **prod cutover ต้องรันตอน merge** คู่กับ cache-rename.sql
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
> - **✅ แก้แล้ว 2026-07-21 (bug-034): email member ของ org ที่มี guild เข้า feature ไม่ได้เลย (404 ทุกหน้า)** — `featureGate.enabledFeaturesFor` ตกสาขา `getEnabledFeatures(getGuildId)` แต่ email user ได้ `getGuildId=null` (seam 2026-07-18) → features ว่าง → 404 ทั้งที่ API ตัวเดียวกันปล่อยผ่าน (incoherent) · **fix:** org มี guild + ไม่มี guildId → ใช้ config ของ **guild หลักของ org** (prefer `env.GUILD_ID` เหมือน dual-write ของ switcher) · verify: email member org 1 = 200 ทุกหน้า เห็น data org 1 · **ไม่ regress** — MRSJAN org 8 (guildless) ยัง 404 calling/docs + 200 finance · Discord user 200 เหมือนเดิม · หมายเหตุ: docs ยัง guild-scoped → email user เปิดได้แต่ query ด้วย guildId=null = ว่าง (ไม่ leak) ค่อยจัดตอน docs→org
> - `manageContacts` มี role set เท่ากับ `viewCalling` เป๊ะ → ใครเห็นหน้า contacts ก็ manage ได้ทั้งหมด → **ownership branch ของ contact (`created_by===userId`) เป็น dead code ในทางปฏิบัติ** · ถ้าตั้งใจให้มี "คนสร้าง contact ได้แต่แก้ได้เฉพาะของตัวเอง" ต้องแยก permission ก่อน
> - ~~`calling` อยู่ทั้ง `ORG_FEATURES` และ enabled_features ต่อ guild~~ **✅ รวมทางเดียวแล้ว 2026-07-22** — สวิตช์อยู่ที่ org ที่เดียว
> - `calling_assignments.org_id` อยู่ **ท้ายตาราง** (ตารางอื่น org_id อยู่หน้า) — ผิด convention เล็กน้อย ไว้จัดตอน cutover
> - ~~`calling` อยู่ทั้ง `ORG_FEATURES` และ enabled_features ต่อ guild~~ **✅ รวมทางเดียวแล้ว 2026-07-22** — สวิตช์อยู่ที่ org ที่เดียว
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
  - ✅ **org-config governance UI เสร็จ 2026-07-18** — `AppointPolicy.jsx` (owner-only, chips เลือกบทบาทที่แต่งตั้งได้) + `GET/PUT /api/org/orgs/[id]/appoint-policy` (กรอง admin/นอก catalog ออก, [] = owner-only ตั้งใจ) · gate appoint เพิ่ม `admin` god-mode เสมอ · getAppointPolicy respect [] · verify authed curl GET/PUT/filter ✓
- [x] **feature-toggle (org-native) เสร็จ 2026-07-18** (org-core) — `lib/orgFeatures.js` (registry `ORG_FEATURES` + `getOrgEnabledFeatures` จาก org_config key `enabled_features`, default=all, [] ตั้งใจได้) · tab **ฟีเจอร์** `/org/settings/features` (OrgFeatures toggle switches, owner) · API `GET/PUT /api/org/orgs/[id]/features` (กรองนอก registry) · layout guildless branch อ่าน getOrgEnabledFeatures แทน hardcode `['finance']` → **คุม Nav app tabs/links จริง** (verify: PUT []→GET / nav gate)
  - ✅ **รวมสวิตช์มาที่ org ที่เดียวแล้ว 2026-07-22** — `ORG_FEATURES` ครบ 4 (finance/calling/docs/cases) · `/bot/features` เหลือ `ai_mention` · `layout.js` + `featureGate.js` เลิกแตกสาขา guild/guildless · migration ย้ายค่าขึ้น org = union ของทุก guild (org 1 → ครบ 4) · `Nav.ORG_NATIVE_APP_KEYS` เปิดครบ 4 app ให้ org ที่ไม่มี guild
  - เพิ่ม feature org-native ใหม่ = เพิ่มใน `ORG_FEATURES` โผล่เอง
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

**🎨 Org switcher DRAFT (2026-07-17) — Notion/AppFlowy style · `components/OrgSwitcherMenu.jsx`:**
- เมนู workspace hub: email header + org list (member_count + ✓) + สร้าง workspace + จัดการ/โปรไฟล์/ออก · เปิดได้เสมอแม้ org เดียว · icon ตัวหน้า = กลับหน้าแรก `/`, ชื่อ+chevron = เปิดเมนู
- เอา app tabs ออกจาก topbar (เบียดกัน) → เข้าถึงผ่าน hamburger + การ์ด dashboard · title = **Platfor.ORG** (layout.js metadata)
- [x] **org icon เสร็จ 2026-07-17** (org-core) — org มี icon ของตัวเอง (emoji หรือรูปอัปโหลด) ไม่ยืม guild:
  1. ✅ `orgs.icon TEXT` (migration ใน identity-refactor.sql) — emoji string หรือ url `/uploads/org/xxx`
  2. ✅ `/org/settings` (ทั่วไป, OrgGeneral): preview + ช่องอีโมจิ + อัปโหลดรูป + ลบไอคอน · owner เท่านั้น · upload route `POST /api/org/orgs/[id]/icon` gate ด้วย **org-owner** (ไม่ใช่ discordId — email owner ใช้ได้) · emoji ผ่าน PATCH `/api/org/orgs/[id]` (icon)
  3. ✅ `OrgAvatar` (OrgSwitcherMenu): fallback `org.icon`(รูป→img / emoji→text) → `iconUrl`(guild) → letter · `isImgSrc` detect path
  4. ✅ listUserOrgs + getOrg คืน icon (+ `setOrgIcon` ใน db) · verify: emoji/upload/remove authed curl ✓ + SSR 200
- [x] **i18n เสร็จ 2026-07-19** (ns `org` ใหม่ 111 keys, 13 sub-ns) — migrate 12 ไฟล์ org UI ครบ (Sonnet 4 ก้อน, Opus ตรวจ+render authed ทุกหน้า): OrgGeneral/Features/AppointPolicy · OrgMembers/SettingsNav · OrgSwitcherMenu(ลบ const T)/OrgHome(→async server)/CreateModal · OrgShell/NewOrgForm/login/personal/verify · th=en 111/111 · residual Thai เหลือแค่ comment · **defer: metadata `title` 5 หน้า** (browser tab — ทั้งแอป finance/calling ก็ hardcode → ทำรวมทีเดียวตอนหลัง ไม่งั้น inconsistent)

- [x] Portfolio consult (web page) เสร็จ — `web/app/tee/portfolio/` (เนื้อหาใน data/portfolio.json แก้เอง) + artifact · รอ deploy prod ให้ขึ้น pplevolunteers.org/tee/portfolio
- ⚠️ **org-core ยังไม่ merge เข้า master** (prod = master `2e81e6e` guild-based, ไม่แตะ) · deploy org = merge org-core→master เมื่อ org เสร็จ · **ก่อน deploy prod:** รัน migration.sql (rename orgs/user_identities + dc_members email/nullable + org_roles + web_roles) + `identity-split-expand.sql` · tag ของเก่า `layout-guild-v1`

