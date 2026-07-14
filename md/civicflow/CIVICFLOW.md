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

## ก้อนอิฐก้อนแรก (เริ่มเมื่อหัวโล่ง)
**"org สมัครด้วย email → เห็น dashboard ว่างๆ ของตัวเอง"** — เล็กสุด เสี่ยง 0 พิสูจน์รากที่กลัวที่สุด (email-native identity + org ยืนเองได้)
- `organizations` มีแล้ว → เพิ่ม `users` (email) + `org_members` + หน้า signup
- ยังไม่ต้องมี docs/sign/finance · ไม่แตะโค้ด PPLE สักบรรทัด
- ก้อนถัดไปค่อยต่อ: docs + sign แบบ email token (ไม่พึ่ง dc_members / Discord role)

## Action Items
- [ ] วางก้อนแรก: `users` + org email signup + dashboard เปล่า (parallel, ไม่แตะ PPLE)
- [ ] เตรียม demo path เดียวให้ลื่น: email → org → docs → เซ็น (เป็นทั้ง portfolio + proof-of-core)
- [ ] ล็อกเรื่องสัญญา/IP ก่อนลงแรงลึก (core = license, custom = งานจ้าง)

## คำถามเปิด (ยังไม่รู้ — อย่าเดา)
- MIDI คืออะไรกันแน่ (coalition / เจ้าของ CivicFlow / ชื่อเดียวกัน?) · CivicFlow เป็นสมาชิกใน MIDI หรือตัวแม่?
- "ทนายจูน เจอกับ Article Group" — ใครเป็นใคร, Article Group คือองค์กร/กลุ่มทุน?
- Union More กับ CivicFlow = คนละผลิตภัณฑ์ หรือ 2 โมดูลใน platform เดียว?
- Engage Thailand "อยากลด___" = ภาษี (tax) หรือ ภาษา (language)? — เดาว่า tax แต่ยังไม่ยืนยัน
- "4 รูปแบบของอำนาจร่วม" — เนื้อในคืออะไร
- บทบาทคุณในดีลนี้กับ **ใครเป็นคนจ้าง** (CivicFlow / MIDI / Daybreaker?)
- Business model ของ CivicFlow เอง (SaaS / grant-funded via Higher Ground Labs / อื่นๆ) — เงินเข้าใคร
