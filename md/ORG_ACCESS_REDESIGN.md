# ORG_ACCESS_REDESIGN — ปลดสิทธิ์ออกจาก Discord

> **สถานะ: ขั้น 1–5 เสร็จ (2026-07-22)** — ทางอ่านและทางเขียนอยู่ที่ `org_member_roles` ทั้งคู่แล้ว
> เหลือขั้น 6 (ลบ `web_roles` + `geography.js`) และ `web/db/docs/payers.js` ที่ยังเป็นเส้นทางแยก
> เคาะทิศทาง 2026-07-21 · ผ่าน `/scrutinize` แล้ว 2026-07-22

## เป้าหมาย

ทุกแอพ (finance · calling · docs · cases) ใช้งานได้โดยไม่ต้องมี Discord
**Discord = ตัวช่วยกรอก ไม่ใช่แหล่งความจริง** — เว็บเป็นแหล่งความจริง

## ที่ user เคาะแล้ว (2026-07-21)

| ข้อ | เคาะว่า |
|---|---|
| PPLE ที่มี Discord อยู่แล้ว | **ย้ายมาทางใหม่ด้วย** — Discord ซิงค์ยศเข้ามาเติม แต่เว็บตัดสิน · มีระบบเดียวทั้งแพลตฟอร์ม |
| พื้นที่ของ org อื่น | **org สร้างโครงเอง ตั้งชื่อเอง ซ้อนชั้นได้** (เขต/สาขา/ทีม — ไม่ผูกจังหวัดไทย) |
| org ที่ไม่มี Discord ตั้งยศ | **สร้างตำแหน่งเองได้ แล้วผูกสิทธิ์ + พื้นที่เข้าไป** (เหมือน Discord แต่ทำในเว็บ) |
| **แหล่งความจริงของสิทธิ์** | **`org_member_roles` ที่เดียว** — `roles` และ `web_roles` เลิกใช้ตัดสินสิทธิ์ทั้งคู่ · `roles` เหลือเป็นสำเนา/log ไว้ดูย้อนกับ Discord เท่านั้น (เคาะ 2026-07-22) |

---

## ปัญหาวันนี้

สิทธิ์ + พื้นที่ ถูกอ่านจาก Discord ทางเดียว:

- `resolveAccess(guildId, roleNames, webRoleKeys)` อ่าน catalog จาก **`dc_guild_roles`** ซึ่ง key ด้วย `guild_id`
- `org_members.roles` = **ชื่อ role Discord** (comma string) · `web_roles` = permission key ตรงๆ **แต่ไม่ให้พื้นที่**
- คน email (`guild_id` NULL) → query `WHERE guild_id = NULL` → 0 แถว → **scope ว่างเสมอ** → calling/cases เห็นศูนย์
- `web/lib/geography.js` **hardcode** จังหวัด→ภาค 77 จังหวัด โดยชื่อภาค = ชื่อ role ทีม Discord ของ PPLE

---

## โครงที่เสนอ

### 1. `org_scope_nodes` — พื้นที่ของ org (แทน geography.js)

ต้นไม้ทั่วไป ซ้อนกี่ชั้นก็ได้ org ตั้งชื่อเอง

```sql
CREATE TABLE org_scope_nodes (
  id         SERIAL PRIMARY KEY,
  org_id     INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  parent_id  INT REFERENCES org_scope_nodes(id) ON DELETE CASCADE,
  key        VARCHAR(80)  NOT NULL,   -- slug คงที่ ใช้อ้างใน grant
  label      VARCHAR(120) NOT NULL,   -- ชื่อที่คนอ่าน
  sort_order INT NOT NULL DEFAULT 100,
  UNIQUE (org_id, key)
);
CREATE INDEX idx_org_scope_nodes_org    ON org_scope_nodes(org_id);
CREATE INDEX idx_org_scope_nodes_parent ON org_scope_nodes(parent_id);
```

PPLE ย้ายของเดิมเข้ามาเป็น 3 ชั้น: `ภาคใหญ่ → ภาคย่อย → จังหวัด` (77 จังหวัด)
org อื่นสร้างเองกี่ชั้นก็ได้ เช่น `ประเทศ → ภูมิภาค → สาขา`

### 2. `org_role_defs` — ตำแหน่งของ org (แทน dc_guild_roles)

```sql
CREATE TABLE org_role_defs (
  id            SERIAL PRIMARY KEY,
  org_id        INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,          -- "ผู้ประสานงานจังหวัดราชบุรี"
  permission    VARCHAR(40) REFERENCES org_roles(key),   -- คลังสิทธิ์เดิม ใช้ต่อ
  scope_node_id INT REFERENCES org_scope_nodes(id),      -- พื้นที่ (NULL = ไม่ผูกพื้นที่)
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (org_id, name)
);
```

= `dc_guild_roles` ที่ตัด `guild_id` ออก · `org_roles` (คลัง permission) **ใช้ของเดิมไม่ต้องแตะ**

### 3. `org_member_roles` — ใครถือตำแหน่งอะไร

```sql
CREATE TABLE org_member_roles (
  org_id      INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_def_id INT NOT NULL REFERENCES org_role_defs(id) ON DELETE CASCADE,
  source      VARCHAR(20) NOT NULL DEFAULT 'web',  -- 'web' | 'discord'
  granted_by  INT REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id, role_def_id)
);
```

**นี่คือแหล่งความจริงเดียวของสิทธิ์ทั้งระบบ** — แทนทั้ง `org_members.roles` (comma string ชื่อยศ Discord) และ `org_members.web_roles` (comma string permission key)

เหตุที่ไม่ใช้ `web_roles` เดิมต่อ ทั้งที่เจตนาตรงกัน — สตริงแบนแบกไม่ไหว 2 อย่าง:

| | `web_roles` (สตริง) | `org_member_roles` (ตาราง) |
|---|---|---|
| สิทธิ์ | ✅ | ✅ |
| **พื้นที่** | ❌ ต้องยัดเป็น `province_coordinator:ราชบุรี` → กลับไปเป็นปัญหาเดิมของ `roles` | ✅ ผ่าน `role_def` |
| **มาจากไหน** | ❌ | ✅ `source` |
| หลายตำแหน่ง | คั่นจุลภาค | หลายแถว |

`source` สำคัญตอน **ถอน**: ถ้าคนได้ `treasurer` ทั้งจาก Discord และจากที่ตั้งในเว็บ แล้วถอดยศ Discord ออก → ลบเฉพาะแถว `source='discord'` ของที่ตั้งในเว็บไม่หาย · สตริงแบนตอบเรื่องนี้ไม่ได้ ต้องเดา และเดาผิดทางไหนก็เจ็บ (ถอดเกิน = คนทำงานไม่ได้ · ไม่ถอด = สิทธิ์ค้าง)

### 4. Discord = adapter ขาเข้า

`dc_guild_roles` **ไม่หายไป** แต่เปลี่ยนหน้าที่ — เหลือแค่ตารางแปล:

```
discord role_id  →  org_role_defs.id
```

บอทซิงค์ยศ → เขียนลง `org_member_roles` (`source='discord'`) · เว็บอ่านที่เดียวเสมอ ไม่รู้ว่า Discord มีตัวตน
`org_members.roles` **ยังเขียนต่อไป แต่เลิกใช้ตัดสินสิทธิ์** — เหลือเป็นสำเนาไว้ดู/ตรวจย้อนว่า Discord ให้ยศอะไรมา

> ⚠️ **ข้อแลกเปลี่ยนที่ยอมรับแล้ว (user เคาะ 2026-07-22):** วันนี้แปล "ยศ Discord → สิทธิ์" ตอน **อ่าน** → แก้การแมปใน `dc_guild_roles` มีผลทันที (cache 5 นาที)
> แบบใหม่แปลตอน **เขียน** → แก้การแมปแล้ว **ของที่ซิงค์ไว้เดิมไม่เปลี่ยนจนกว่าจะซิงค์ใหม่**
> **ต้องทำคู่กัน:** เปลี่ยนการแมป (permission/scope ของ role) → ยิง re-sync ทั้ง guild ทันที ไม่ใช่รอรอบถัดไป · ถ้าไม่ทำ สิทธิ์จะค้างแบบเงียบ

### 5. `resolveAccess()` — ตะเข็บเดียวที่ต้องรื้อ

เปลี่ยน signature จาก `(guildId, roleNames, webRoleKeys)` → `(orgId, userId)` แล้ว query เดียว:

```sql
WITH RECURSIVE held AS (          -- node ที่ user ถือ
  SELECT d.permission, n.id
    FROM org_member_roles mr
    JOIN org_role_defs d  ON d.id = mr.role_def_id AND d.is_active
    LEFT JOIN org_scope_nodes n ON n.id = d.scope_node_id
   WHERE mr.org_id = $1 AND mr.user_id = $2
),
sub AS (                          -- ไล่ลูกทั้งหมดของ node ที่ถือ
  SELECT id FROM held WHERE id IS NOT NULL
  UNION
  SELECT c.id FROM org_scope_nodes c JOIN sub ON c.parent_id = sub.id
)
SELECT ... -- permissions + key ของทุก node ใน sub
```

**คืนรูปร่างเดิมเป๊ะ:** `{ isMember, permissions: Set, scopeGrants: [] }`

> 🔑 **4 แอพไม่ต้องแก้เลย** — finance/calling/docs/cases ไม่รู้จัก Discord อยู่แล้ว มันกินแค่รูปร่างนี้

---

## เคาะแล้ว (2026-07-21)

### 1. การไล่ชั้น = ✅ **ถือ node ไหน → ได้ทุกอย่างใต้ node นั้น เหมือนกันทุกแอพ**

เดิมแต่ละแอพนับไม่เท่ากัน (`expandGrants({ mode })` ใน `web/lib/geography.js`): finance ไล่ 3 ชั้น · calling ไล่ 2 ชั้น (ไม่รู้จักภาคใหญ่)
ความต่างนี้ **ไม่ได้ตั้งใจออกแบบ** — user ยืนยันว่าเจตนาแรกคือ "ดูแลภาคก็ดู contact ได้ทั้งภาค"

**blast radius ที่วัดจริง (ไม่ใช่เดา):**

⚠️ ยศพื้นที่อย่างเดียวไม่พอ — ต้องมี**ตำแหน่ง**พ่วงด้วย (`regional_coordinator` = ผู้ประสานงานภาค / รองเลขาธิการ) ถึงจะเข้าถึงอะไรได้ · คนถือแต่ยศ "ทีมภาคกลาง" เปล่าๆ ไม่มีสิทธิ์อยู่แล้วตั้งแต่แรก ไม่เกี่ยวกับกติกาการไล่ชั้น

- ผู้ประสานงานภาค (มีตำแหน่งจริง ไม่ใช่ admin) = **12 คน**
- ในนั้นถือยศภาคใหญ่ (`region:`) = 3 คน · **ทั้ง 3 ถือจังหวัดพ่วงมาด้วยหมด** → calling อ่านได้ปกติ
- ผู้ประสานงานภาคที่ถือ **แต่ภาคใหญ่เดี่ยวๆ** (= กลุ่มที่ calling คืนศูนย์) → **0 คน ไม่เคยกัดใครจริง**

เหตุที่ไม่เคยกัด: `addRoleWithParents` ไล่ติดยศแม่ให้อัตโนมัติ คนกดจังหวัดจึงได้ภาคย่อยติดมาเสมอ

→ กับดักจริงจึงแคบ: ต้องเป็นคนที่**มีตำแหน่งอยู่แล้ว** แล้วถูกติดยศภาคใหญ่เดี่ยวๆ · การรวมกติกาปิดกรณีนี้ไปด้วย

### 2. ซิงค์จาก Discord = ✅ **รับทั้งตำแหน่งและพื้นที่ (เหมือนพฤติกรรมวันนี้)**

ยศ Discord มี 2 ชนิดปนกัน: บอกตำแหน่ง (`permission`) กับบอกพื้นที่ (`scope_node`) — import เข้ามาทั้งคู่
ข้อดี: ย้ายแล้วคนใช้ไม่รู้สึกต่าง ไม่ต้องมาตั้งพื้นที่ให้ใครใหม่

> 📌 ผลพลอยได้ที่ต้องรู้ (ไม่ใช่ blocker แค่บันทึกไว้): ยศ "ทีม&lt;จังหวัด&gt;" สมาชิกกดติดเองได้จากแผงเลือกจังหวัด (`handlers/provinceSelect.js` — ไม่มี permission check) → พื้นที่จึงเป็นสิ่งที่ผู้ใช้กำหนดเองได้ **ทั้งก่อนและหลังย้าย** · ถ้าวันไหนอยากปิด ทำได้ที่ชั้น import (allowlist ว่ายศไหนให้พื้นที่ได้) โดยไม่ต้องแตะ Discord

---

## ผล /scrutinize (2026-07-22) — ต้องแก้แบบก่อนเขียนโค้ด

### ⛔ ตัวหยุด: `resolveAccess(orgId, userId)` ฆ่าโหมด view-as-role

`DEBUG_COMBOS` (`web/lib/debugCombos.js`) เก็บเป็น **ชื่อยศ** แล้ว `resolveIdentity()` ยัดเข้า `resolveAccess(guildId, roleNames, webRoles)` ตรงๆ (`getEffectiveRoles.js:95`)
signature ใหม่อ่านจากตารางด้วย `userId` → **ไม่มีช่องยัดยศสมมติ** ฟีเจอร์ตาย

**แก้:** คงฟังก์ชัน pure ที่รับ "รายการ role def" ตรงๆ ไว้ (บทบาทเดียวกับ `reduceRoleRows` วันนี้ ซึ่งแยกไว้เพื่อ test โดยไม่แตะ DB อยู่แล้ว) แล้วให้ทั้งทางจริงและทางดีบั๊กเรียกตัวเดียวกัน
→ signature เป็น 2 ชั้น: `resolveAccess(orgId, userId)` (โหลด) + `reduceRoleDefs(defs)` (คำนวณ) · test เดิมส่วนใหญ่รอด

### ⚠️ ยุบสิทธิ์เป็นระดับ org — ตัดสินใจให้ตั้งใจ (แต่ผลจริงน้อย)

แบบนี้ตัดมิติ guild ทิ้งหมด แต่วันนี้ **finance/calling = org-wide แล้ว · docs/cases = ยัง guild เดียว** (`caseGate.js:25` + docs routes ใช้ `getEffectiveIdentity`)

วัดจริง: org 1 มี 3 guild · 678 คนถือยศต่างกันข้าม guild · **212 คนจะได้ permission ที่บาง guild ไม่มี** (caseworker 116 · province_coordinator 53 · district_coordinator 43 · moderator 15 · admin 2)

**แต่ blast radius จริงเกือบศูนย์** — `getGuildId()` (`lib/guildContext.js`) ให้ผู้ใช้สลับ guild เองได้อิสระ (เช็คแค่เป็นสมาชิกจริง) และ data ของ cases/docs **เป็น org-scoped อยู่แล้ว** → 212 คนนี้เข้าถึงได้อยู่แล้ววันนี้ แค่ต้องกดสลับ guild ก่อน · guild ไม่ใช่กำแพง เป็นขั้นตอน
`admin` 2 คน = เจ้าของระบบ + บัญชีบอท ไม่ใช่ความเสี่ยง

→ **สรุป: ไปทาง org-wide ได้ แต่ให้เป็นการตัดสินใจที่เขียนไว้ ไม่ใช่ผลข้างเคียง**

### ⚠️ กติกาไล่ชั้นกระทบ 3 แอพ ไม่ใช่แค่ calling

`docsAccess.js:49` ใช้ `expandGrants({ mode: 'calling' })` และ `caseAccess.js:12` re-export `getUserScope` ของ calling ตรงๆ → **docs + cases กว้างขึ้นด้วย** ต้องอยู่ใน diff test

### 🔬 หลักฐานจากการทดสอบจริง (2026-07-22) — `/org/settings/members`

user ลองแต่งตั้งยศให้ `somseed` (มี Discord, อยู่ 3 guild ของ org 1) → **ติดได้สิทธิ์เดียว** ที่เหลือขึ้น *"guild นี้ยังไม่มี Discord role สำหรับสิทธิ์นี้ (สร้าง+map ก่อน)"* และสิทธิ์ที่ติดได้ **ไม่โผล่ใน `web_roles`**

ทั้งสองอาการ = พฤติกรรมตามโค้ด ไม่ใช่บั๊ก แต่เปิดโปงข้อจำกัดของโครงเดิม:

1. **appoint เลือก guild ให้เองแบบเดา** — `DISTINCT ON (u.id) ... ORDER BY (om.role='owner') DESC, om.guild_id NULLS LAST` (`org/appoint/route.js:120`) → ได้ guild `1111998833652678757` ซึ่งแมปยศ Discord ไว้กับ `editor` **เพียงสิทธิ์เดียว** · สิทธิ์อื่นทั้งหมดแมปอยู่ที่ guild อาสาประชาชน (`1340903354037178410`) ที่ไม่ถูกเลือก
   → คนที่อยู่หลาย guild แต่งตั้งได้เฉพาะสิทธิ์ที่ guild ที่ "บังเอิญถูกเลือก" รองรับ **และผู้ใช้ไม่มีทางรู้ว่าระบบเลือก guild ไหน**
2. **`web_roles` ไม่ขึ้นเพราะถูกต้องแล้ว** — target ที่มี `discord_id` วิ่งเข้าสาขา Discord เขียนลง `roles` · `web_roles` สงวนให้คนไม่มี Discord เท่านั้น

→ ทั้งคู่หายไปเองในโครงใหม่ เพราะตำแหน่งผูกกับ **org** ไม่ใช่ guild — ไม่ต้องเลือก guild ตั้งแต่แรก และไม่ต้องมียศ Discord รองรับก่อน
→ **ยืนยันด้วยว่าหน้านี้ตั้ง "พื้นที่" ไม่ได้เลย** — มีแต่ปุ่มตำแหน่ง ไม่มีช่องเลือกจังหวัด/เขต

### 📌 เล็กน้อย

- **ตำแหน่ง 1 ใบ = พื้นที่ 1 ที่** — วันนี้ PPLE แยก 2 ใบ (ใบตำแหน่ง `scope_node` NULL + ใบพื้นที่ `permission` NULL) · แบบใหม่ต้องระบุว่ายังแยกเหมือนเดิม ไม่งั้น migration ตีความได้ 2 ทาง
- **ต้นไม้พื้นที่ยังไม่กันวนลูป** — `parent_id` ชี้วนได้ · `UNION` ทำให้ไม่ค้าง แต่ผลเพี้ยนเงียบ → ใส่ CHECK/trigger หรือจำกัดความลึก
- **ก่อนลบของเดิมขั้น 6** ต้องสำรวจ `dc_guild_role_groups` + คอลัมน์ `is_managed`/`picker_*` ที่แบบนี้ยังไม่พูดถึง

---

## ต้องเคาะต่อ

- **ย้ายของเดิมยังไง** — PPLE มี `dc_guild_roles` ~80+ แถว และ `org_members.roles` 6,483 แถว ต้องเขียน migration แปลงเข้าโครงใหม่ + **diff test** ตรวจว่าสิทธิ์ก่อน/หลังตรงกันทุก user

---

## ลำดับงานที่เสนอ

| ขั้น | ทำอะไร | เสี่ยง |
|---|---|---|
| ✅ 1 | สร้าง 3 ตารางใหม่ (ยังไม่มีใครอ่าน) — `migration.sql` 2026-07-22 | ต่ำ |
| ✅ 2 | migration แปลงข้อมูล PPLE + **diff test** — `scripts/migration/org-access-redesign.sql` | ต่ำ (ยังไม่สลับ) |
| ✅ 3 | `web/lib/resolveAccessV2.js` คู่ขนาน ยังไม่ใช้ + unit test 12 เคส | ต่ำ |
| ✅ 4 | สลับ `getEffectiveOrgIdentity` + `getEffectiveIdentity` ไปเรียก V2 | **สูง — จุดตัดสิน** |
| ✅ 5 | บอทเขียน `org_member_roles` (`source='discord'`) · `roles` ยังเขียนต่อในฐานะสำเนา · **เพิ่ม re-sync เมื่อการแมปเปลี่ยน** | กลาง |
| 6 | ลบ `web_roles` + `geography.js` ทิ้ง · **`roles` เก็บไว้เป็น log** ไม่ลบ | ต่ำ (หลังนิ่ง) |

ขั้น 2 คือของสำคัญ — **diff test** พิสูจน์ว่าย้ายแล้วสิทธิ์ไม่เพี้ยน ก่อนสลับจริง

---

## บันทึกผลขั้น 1–3 (2026-07-22)

**ข้อมูลที่ย้ายมา (org 1):** 97 พื้นที่ · 107 ตำแหน่ง · 7,412 การถือครอง · `web_roles` เดิม 1 แถว → `source='web'`

**diff test — สิทธิ์ก่อน/หลังตรงกันเป๊ะ:**

| ตรวจ | ผล |
|---|---|
| permission หายไป | 0 |
| permission งอกเกิน | 0 |
| scope หายไป | 0 |
| scope งอกเกิน | 0 |

> migration ตั้งใจให้ **behavior-preserving** — การยุบสิทธิ์เป็นระดับ org เกิดตอน *อ่าน* (ขั้น 4) ไม่ใช่ตอนย้ายข้อมูล · ไม่ลักไก่ขยายสิทธิ์ในขั้น migration

**⚠️ บั๊กที่ diff test จับได้ (bug-044)** — รอบแรกยุบตำแหน่งด้วย `role_name` ทำให้ **6 คนได้ `admin` ทั้ง org** เพราะ guild `1115613658408566844` มียศชื่อ `Admin` ที่ **จงใจไม่แมป** ส่วนอาสาประชาชนแมป `admin` ไว้
การสำรวจ "ไม่มีชื่อชนกัน" ก่อนหน้าพลาดเพราะกรอง `WHERE permission IS NOT NULL OR scope_node IS NOT NULL` = กรองแถวที่ไม่แมปทิ้งพอดี
**แก้:** การถือครองเดินผ่าน `dc_guild_roles` ของ guild ที่ user อยู่จริง → `org_role_def_id` แทนการ join ด้วยชื่อ

**ตรวจต้นไม้พื้นที่เทียบ `geography.js`:** จังหวัด→ภาคย่อย ตรง **80/80** · ชั้นภาคใหญ่ต่าง 15 แต่ไม่ใช่ drift — กรุงเทพ/ปริมณฑล/ภาคตะวันออก เป็น subregion ที่ไม่มี region เหนือขึ้นไป (DB = `parent_id` NULL · geography.js = ชี้ตัวเอง) ความหมายเดียวกัน
→ ต้นไม้ที่ย้ายมาจาก `parent_role_id` เชื่อถือได้

## บันทึกผลขั้น 4 — สลับใช้จริงแล้ว (2026-07-22)

### กฎการไล่ชั้น: **กั้นด้วยตำแหน่ง ไม่ใช่รูปร่างต้นไม้**

เดิมเคาะไว้ว่า "ถือ node ไหน = ได้ทุกอย่างใต้มัน เหมือนกันทุกแอพ" — **ผิด และแก้แล้ว**

เหตุ: ยศ `ทีม<ภาค>` บน Discord **ติดอัตโนมัติ**ให้ทุกคนที่กดเลือกจังหวัด (`addRoleWithParents` ใน `db/guildRoles.js`) → คนที่ถือ node มีลูก **2,222 คน แต่ 1,970 คนถือลูกของมันด้วย** = ลายเซ็นของการติดอัตโนมัติ ไม่ใช่การมอบหมายจริง

ถ้าไล่ชั้นให้ทุกคนที่ถือ node มีลูก → วัดแล้ว **caseworker 483/894 คนกว้างขึ้น เฉลี่ย 1.1 → 5.5 จังหวัด** สูงสุดถึง 80 จังหวัด (ข้อมูลเรื่องร้องเรียน)

**กฎที่ถูก (user ยืนยันว่าเป็นกฎดั้งเดิม):**
```
admin / เลขาธิการ           → ทุกพื้นที่ (scope = null)
ผู้ประสานงานภาค / รองเลขาฯ  → ไล่ชั้นลงไปทุกอย่างใต้ node ที่ถือ
ที่เหลือ                     → เฉพาะ node ที่ถือตรงๆ (ยศภาคที่ติดมาเองจึงไม่มีผล
                              เพราะชื่อภาคไม่เคยแมตช์กับ "จังหวัด" ของข้อมูลจริง)
```

> 📌 บทเรียน: สิ่งที่ผมเรียกว่า "ความไม่สม่ำเสมอที่หลุดมา" ตอน `/scrutinize` (finance ไล่ 3 ชั้น · calling ไล่ 2 ชั้น) **จริงๆ มันทำงานอยู่** — โค้ดเดิมที่ไม่ไล่ชั้นให้ตำแหน่งระดับจังหวัด คือตัวกันไม่ให้ยศพ่อที่ติดอัตโนมัติกลายเป็นสิทธิ์

**blast radius จริงหลังใช้กฎนี้: เปลี่ยน 1 คน** (ผู้ประสานงานภาคที่ถือภาคใหญ่ ได้เพิ่ม 14 จังหวัด) · **ไม่มีใครเสียสิทธิ์** — คือช่องว่างที่ตั้งใจปิดพอดี (เดิม calling/cases ไม่รู้จัก `region:`)

### สิ่งที่แก้

- `orgAccess.getEffectiveOrgIdentity` → `resolveAccessV2(orgId, userId)` · owner→admin คงไว้
- `getEffectiveRoles.getEffectiveIdentity` → V2 · impersonate คนจริงใช้ `userId` ของคนนั้น · combo สมมติใช้ `accessFromRoleNames`
- `getRealAccess` → V2
- `financeAccess` / `callingAccess` / `docsAccess` → เลิกเรียก `expandGrants` ทั้งหมด · scope เช็คด้วย membership ตรงๆ (V2 ไล่ชั้นมาให้แล้ว)
- fixture กลาง `_rolesToAccess.js` เปลี่ยนสัญญาเป็น "ชื่อพื้นที่ล้วน ไล่ชั้นแล้ว" → **เคส behavior เดิม 85 ตัวผ่านหมดโดยไม่แก้ body** = หลักฐานว่าพฤติกรรมไม่เพี้ยน

### verify

| | ผล |
|---|---|
| `npm test` (ไม่ต้องมี DB) | 206 ผ่าน |
| `npm run build` | ผ่าน |
| `npm run test:live` (ต่อ DB จริง) | 5 ผ่าน — verify user จริง 200 คน ทั้ง permission และ scope + view-as-role + fail-safe คนนอก org |

### ยังไม่ย้าย — งานขั้นถัดไป

`db/docs/payers.js` เป็น**เส้นทางแยก** ที่คำนวณอำนาจลงนามเองจาก `dc_guild_roles` + `org_members.roles` (เรียก `resolveAccess` เดิมภายใน ไม่ได้รับ `scopeGrants` จากข้างนอก) → **ยังทำงานได้ ไม่พัง** แต่ไม่เห็นสิทธิ์ที่ตั้งผ่านเว็บ · ต้องย้ายมาอ่าน `org_member_roles` ในขั้น 5

---

**`resolveAccessV2.js` — โครง 2 ชั้นตามผล scrutinize:**
- `expandScope(nodeIds, tree)` + `reduceRoleDefs(defs, tree)` = pure ทดสอบได้ไม่แตะ DB · กันวนลูปด้วย `seen`
- `resolveAccessV2(orgId, userId)` = ทางจริง
- `accessFromRoleNames(orgId, names)` = ทางดีบั๊ก (view-as-role) เรียก reducer ตัวเดียวกัน → preview ตรงกับของจริงเสมอ
- คืน `scopeGrants` ที่ **ไล่ชั้นเสร็จแล้ว** (ไม่มี prefix `province:`) → ขั้น 4 ต้องแก้ `getUserScope` ใน `callingAccess`/`docsAccess`/`financeAccess` ให้เลิกเรียก `expandGrants` ด้วย
- test 12 เคส (รวม 201 ทั้ง suite)

## บันทึกผลขั้น 5 — ทางเขียนย้ายแล้ว (2026-07-22)

ขั้น 4 สลับ "ทางอ่าน" ไป `org_member_roles` แต่ทางเขียนยังเขียนที่เดิม → **สิทธิ์แช่แข็ง**
ขั้นนี้ปิดช่องนั้น · ตัวกลางคือฟังก์ชันเดียวที่ทุกทางเขียนเรียกร่วมกัน

### แกน: recompute ไม่ใช่ diff

`resyncDiscordRolesForUser(userId)` = คำนวณแถว `source='discord'` ใหม่ทั้งหมดจาก `org_members.roles`
ของ user คนนั้น **ทุก guild ใน org** แล้วลบส่วนเกิน — SQL ตัวเดียวกับ migration ขั้น 2

**ทำไมต้องข้าม guild ไม่ใช่ทีละ guild:** มี role_def ที่หลาย guild แมปร่วมกันจริง
(`ทีมบรรณาธิการ`/editor = def 142 แมปทั้ง 2 guild) ถ้าลบตาม guild ที่กำลังซิงค์
สิทธิ์จะหายๆ กลับๆ ตามลำดับการซิงค์ · แบบ recompute เป็น idempotent ลำดับไม่มีผล

**หลักฐานว่าทางเขียนตรงกับทางอ่าน:** รัน recompute ทับ user ทั้งหมด (7,413 คู่) เทียบกับผล migration
→ **lost 0 / gained 0** · ทางเขียนใหม่ reproduce ข้อมูลที่ทางอ่านใช้อยู่ได้เป๊ะ

### สิ่งที่แก้

| ไฟล์ | เปลี่ยนอะไร |
|---|---|
| `db/orgMemberRoles.js` (ใหม่, บอท) · `web/db/orgMemberRoles.js` (ใหม่, เว็บ) | ตัว recompute + ทางเขียนฝั่งเว็บ (แยก 2 ไฟล์เพราะคนละ pool คนละ module system เหมือน `db/guilds.js`) |
| `db/members.js` | `upsertMember` (เฉพาะตอนส่ง `roles`) · `upsertMemberFromDiscord` · `syncMemberRoles` → เรียก resync ต่อท้าย |
| `web/app/api/org/appoint/route.js` | เขียน `org_member_roles` เป็นหลัก · Discord = กระจกเงา · **ทิ้ง logic เดา guild** |
| `web/app/api/bot/roles/route.js` | PATCH การแมป → `syncRoleDefFromGuildRole` + `resyncDiscordRolesForGuild` ทันที |
| `web/app/admin/roles/` + `web/app/api/admin/roles/` | **ลบทิ้ง** — ซ้ำกับ `/org/settings/members` ที่ใหม่กว่า ไม่มีลิงก์ในเมนู (grep ยืนยันไม่มีที่อื่นเรียก) |

### appoint เปลี่ยนความหมาย — เว็บเป็นแหล่งความจริงจริงๆ

เดิม: target มี Discord → สั่ง Discord + เขียน `roles` · target email → `web_roles` · **เว็บเป็นรีโมท**
ใหม่: เขียน `org_member_roles` (`source='web'`) **เสมอ** ไม่ว่า target แบบไหน · Discord ซิงค์ตามแบบ best-effort

หายไปด้วย 2 บั๊กที่ `/scrutinize` จับได้:
- ไม่ต้องเดา guild อีก (ตำแหน่งผูกกับ org) → คนอยู่หลาย guild แต่งตั้งได้ทุกสิทธิ์
- ไม่ต้องมียศ Discord รองรับก่อน → error *"guild นี้ยังไม่มี Discord role สำหรับสิทธิ์นี้"* หายไป

**⚠️ ตอนถอดต้องถอดยศ Discord ด้วย** — `source='web'` กับ `source='discord'` เป็นคนละแถว (source อยู่ใน PK)
ถ้าลบแค่แถว web แล้วยศ Discord ยังอยู่ ซิงค์รอบหน้าจะคืนสิทธิ์กลับมาเงียบๆ
→ route จึงถอดยศทุก guild ที่แมปสิทธิ์นั้น · ถอดไม่สำเร็จ = คืน `warning` ให้ UI แสดง ไม่กลืนเงียบ

### verify

| | ผล |
|---|---|
| `npm test` | 206 ผ่าน |
| `npm run build` | ผ่าน (ต้อง `rm -rf .next` ก่อน — cache เก่าค้าง route ที่ลบไปแล้ว) |
| `npm run test:live` | **9 ผ่าน** (เดิม 5 + ใหม่ 4) |
| recompute ทับทั้ง org เทียบ migration | lost 0 / gained 0 |
| `org_member_roles` หลังเทสจบ | 7,412 discord + 1 web = เท่าเดิมเป๊ะ (live test คืนค่าครบ) |

live test ใหม่ (`web/lib/__tests__/orgMemberRoles.live.test.js`) พิสูจน์ 4 อย่าง:
resync ซ้ำแล้วนิ่ง · **ถอดยศ → สิทธิ์หายจริง / ใส่กลับ → กลับมาจริง** (คือสิ่งที่ขั้น 4 ทำไม่ได้) ·
`syncRoleDefFromGuildRole` ทับยศเดิม 40 ตัวแล้วไม่ขยับอะไร · สิทธิ์ที่ตั้งจากเว็บไม่ถูกซิงค์ Discord ลบทิ้ง

> 🔧 พ่วง: `npm run test:live` **เดิมรันไม่ได้เลย** — vitest 4 merge `--exclude` จาก CLI เข้ากับ config
> แทนที่จะแทนที่ → live test ถูก exclude ทิ้งทุกครั้ง (และไม่โหลด `.env` ด้วย)
> แก้ด้วย `vitest.live.config.js` + `vitest.live.setup.js` แยก

### ยังไม่ย้าย

`web/db/docs/payers.js` — ยังคำนวณอำนาจลงนามเองจาก `dc_guild_roles` + `org_members.roles`
**ไม่พัง** แต่ไม่เห็นสิทธิ์ที่ตั้งผ่านเว็บ · แยกเป็นงานรอบถัดไป (คนละเรื่องกับทางเขียน)
