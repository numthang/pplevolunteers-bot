# SPEC — Per-guild Role Config (RBAC + Picker)

> Status: DRAFT — รอ confirm ก่อน implement · เคาะ design แล้ว 2026-06-10
> Scope ref: `md/PENDING.md` → section "🔐 RBAC / Multi-guild Refactor"

---

## 1. Objective

ทำให้ **แต่ละ guild ปรับแต่ง role ของตัวเองได้** โดยไม่ต้องแก้ source code — ครอบทั้ง:
- **RBAC** (permission + province scope) สำหรับ calling/finance
- **Picker** (interest/skill/province) — เมนูปุ่มให้ user กดเลือก role เอง (ติดป้าย/เปิดห้อง)

วันนี้ทั้งหมด hardcode guild อาสาประชาชน: `web/lib/financeAccess.js`, `web/lib/callingAccess.js`, `web/lib/roles.js`, `config/roles.js`, `GUILD_ID` ใน `.env`

**Done เมื่อ:** เพิ่ม guild ใหม่ + config ผ่าน DB/UI → ใช้ calling/finance + panel ได้ทันที โดยไม่แตะ code · guild อาสาประชาชนทำงานเหมือนเดิมเป๊ะ (พิสูจน์ด้วย test เดิมที่ port มา)

### Non-goals (ไม่ทำรอบนี้)
- ❌ **สร้างกลุ่ม picker เองได้ (dynamic groups)** — รอบนี้ fix 3 กลุ่ม (interest/skill/province) แต่ data model เผื่อ `kind` ไว้แล้ว → เป็น feature ทำต่อ ไม่ต้องรื้อ schema
- ❌ Security gate (route ที่ยังไม่เช็ค role) — แยกงาน ยังไม่เปิดใช้จริง
- ❌ แยก Postgres schema — ทุกตารางอยู่ `public`
- ❌ ย้าย `super_admin` เข้า DB — ยังเป็น platform-level ผ่าน `DEV_DISCORD_IDS`
- ❌ redesign branching logic ของ access functions — แค่เปลี่ยน **input** เป็น permission/scope

---

## 2. แนวคิดหลัก — ทุกอย่างคือ "ตัวจัดการ role ต่อ guild" งานเดียว

role แต่ละตัวใน guild แขวนได้ **2 ป้าย** อิสระ (อันใดอันหนึ่ง / ทั้งคู่ / ไม่มีเลย):

```
role catalog ต่อ guild (bot sync อัตโนมัติทุก role)
   │
   ├─ ป้าย A — Picker:  group + label + emoji + order → render เป็นปุ่มกดเลือก (ติดป้าย/เปิดห้อง)
   └─ ป้าย B — RBAC:    permission + scope_node → คุมการเห็นข้อมูล (calling/finance)
```

| role ตัวอย่าง | ป้าย A (Picker) | ป้าย B (RBAC) |
|---|---|---|
| `อาสาส้ม` | กลุ่ม Interest | — (แค่ติดป้าย) |
| `ทีมราชบุรี` | กลุ่ม Province | scope=`province:ราชบุรี` ← **จุดเดียวที่ป้ายซ้อน** |
| `เลขาธิการ` | — (admin แปะให้ ไม่ใช่กดเอง) | permission=`secretary_general` |
| `Moderator` | — | permission=`moderator` |

→ จุดที่ป้าย A+B ซ้อนกันคือ **กลุ่ม Province**: เป็น picker (กดเลือกจังหวัด) ที่ role พ่วง scope_node ไป feed RBAC ด้วย

### หลักความปลอดภัยของ RBAC — เปลี่ยน "input" ไม่เปลี่ยน "logic"
**ไม่แตะ branching** ของ `canEditAccount`/`canViewAccount`/`canAccessMember` — เก็บโครงเดิม แค่เปลี่ยน leaf check:
```
เดิม:  roles.includes('เหรัญญิก')   → ใหม่:  permissions.has('treasurer')
       roles.includes('Admin')      → ใหม่:  permissions.has('admin')
```
**แชร์ได้:** permission vocabulary + role→permission mapping · **ห้ามแชร์:** วิธีนับ scope จังหวัด (finance/calling นับคนละแบบ §7)

---

## 3. สถาปัตยกรรมชั้น

| ชั้น | เก็บที่ไหน | per-guild? |
|---|---|---|
| role catalog + ป้าย A (picker) + ป้าย B (RBAC) | **DB** `dc_guild_roles` | ✅ |
| นิยามกลุ่ม picker (interest/skill/province) | **DB** `dc_guild_role_groups` | ✅ |
| permission → capabilities (feature matrix) | code `web/lib/permissions.js` | ❌ universal |
| geography data (province↔subregion↔region) | code `web/lib/geography.js` | ❌ universal (data) |

> ⚠️ geography แชร์แค่ **ข้อมูล** (จังหวัดไหนอยู่ภาคไหน) — **วิธีเอาไปนับ scope ไม่แชร์** (§7)

---

## 4. Schema

```sql
-- migration.sql (+ comment วันที่+คำอธิบาย ตาม convention)

-- นิยามกลุ่ม picker ต่อ guild (รอบนี้ fix 3 กลุ่ม, kind เผื่อ dynamic)
CREATE TABLE dc_guild_role_groups (
  guild_id   VARCHAR(20)  NOT NULL,
  group_key  VARCHAR(40)  NOT NULL,          -- 'interest' | 'skill' | 'province'
  label      VARCHAR(100) NOT NULL,          -- ชื่อโชว์ เช่น 'ความสนใจ'
  kind       VARCHAR(20)  NOT NULL DEFAULT 'plain',  -- 'plain' | 'province'
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, group_key)
);

-- catalog ของทุก role + ป้าย A (picker) + ป้าย B (RBAC)
CREATE TABLE dc_guild_roles (
  guild_id     VARCHAR(20)  NOT NULL,
  role_id      VARCHAR(20)  NOT NULL,        -- discord snowflake (anchor สำหรับ rename)
  role_name    VARCHAR(100) NOT NULL,        -- ตรงกับที่ dc_members.roles เก็บ (CSV)
  -- ป้าย B (RBAC)
  permission   VARCHAR(40),                  -- nullable
  scope_node   VARCHAR(80),                  -- nullable; 'province:ราชบุรี'|'subregion:<role>'|'region:<role>'
  -- ป้าย A (Picker)
  picker_group VARCHAR(40),                  -- nullable; FK → dc_guild_role_groups.group_key
  picker_label VARCHAR(100),                 -- nullable; ข้อความบนปุ่ม (default = role_name)
  picker_emoji VARCHAR(40),                  -- nullable
  picker_order INT,                          -- nullable; ลำดับในกลุ่ม
  updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, role_id)            -- key ด้วย id (Discord ตั้งชื่อ role ซ้ำได้)
);
CREATE INDEX idx_dc_guild_roles_lookup ON dc_guild_roles (guild_id, role_name);  -- web lookup by name
CREATE INDEX idx_dc_guild_roles_picker ON dc_guild_roles (guild_id, picker_group);
```

**กฎ:**
- bot sync **ทุก** role เข้า `dc_guild_roles` (catalog) → เพิ่ม/ลบ role ไม่ต้องแตะ DB มือ
- rename หายเอง: sync จับคู่ด้วย `role_id` แล้วอัปเดต `role_name`
- fail-safe: role ที่ไม่มีแถว (หรือ permission/scope = null) = ไม่มีสิทธิ์
- ป้าย A/B เป็น human-set sparse ที่เหลือ null
- role ที่ไม่อยู่ใน picker (เลขาธิการ, Moderator) → `picker_group` null

---

## 5. Canonical permission set

permission มี **2 แกน**:
- **🗂️ Data-access** — เห็น/แก้ข้อมูลองค์กร (ผูก scope จังหวัด)
- **🔧 Action** — ทำ action เฉพาะ **ไม่ได้สิทธิ์เห็นข้อมูล**

| permission | แกน | อาสาประชาชน role | หมายเหตุ |
|---|---|---|---|
| `admin` | both | `Admin` | god-mode/technical — เห็นทุกอย่างรวม **private ของคนอื่น** |
| `secretary_general` | 🗂️ | `เลขาธิการ` | หัวหน้าองค์กรสูงสุด — คุมงานได้หมด แต่ **ดู private คนอื่นไม่ได้** (≠admin) |
| `regional_coordinator` | 🗂️ | `ผู้ประสานงานภาค`, `รองเลขาธิการ` | deputy รวมที่นี่ scope เท่ากัน |
| `province_coordinator` | 🗂️ | `ผู้ประสานงานจังหวัด` | |
| `district_coordinator` | 🗂️ | `กรรมการจังหวัด` | ตทอ. = `กรรมการจังหวัด` · แยก token ไว้ปรับลดสิทธิ์ทีหลัง — **ปัจจุบันสิทธิ์เท่า `province_coordinator` เป๊ะ** |
| `treasurer` | 🗂️ | `เหรัญญิก` | ระดับจังหวัด/wide เกิดจากมี team role หรือไม่ |
| `editor` | 🗂️ | `ทีมบรรณาธิการ` | |
| `moderator` | 🔧 | `Moderator` | **action-only** — ลบ log ได้ แต่ดูข้อมูลสมาชิก/การเงินไม่ได้ |
| `member` | — | *(default)* | อยู่ guild แต่ไม่มี role พิเศษ |
| `super_admin` | both | *(env `DEV_DISCORD_IDS`)* | platform-level ไม่อยู่ใน dc_guild_roles |

> moderator เดี่ยวๆ ตกทุก data-access check เองอยู่แล้ว (check มองหา secretary_general/coordinator/treasurer) → fail-safe ฟรี ไม่ต้องเขียนกฎกั้น · ของ sensitive จริง = เบอร์/LINE มี `canSeeContacts` กั้นแยก · Discord moderation (เตะ/ลบข้อความ) เป็นของ Discord เอง

---

## 6. Picker / Panel (ป้าย A)

- bot render panel จาก `dc_guild_role_groups` + `dc_guild_roles.picker_*` (แทน `INTEREST_CONFIG`/`SKILL_CONFIG`/`PROVINCE_ROLES` hardcode)
- ทุกกลุ่ม **เลือกได้หลายอัน** (รวม province — user ถือได้หลายจังหวัด)
- กดปุ่ม → bot แปะ role (`role_id`) → role เปิดห้อง/เข้าทีมตาม Discord perms
- **2 ชนิดพฤติกรรม** (`kind`):
  - `plain` (interest/skill) → ติดป้าย/เปิดห้องอย่างเดียว
  - `province` → เหมือน plain + role มี `scope_node` พ่วงไป feed RBAC
- guild ไม่มีโครงสร้างจังหวัด → ไม่ต้องสร้างกลุ่ม `province`
- **rule:** การ render/แปะ ใช้ `role_id` เสมอ (ทน rename) · `dc_members.roles` (ชื่อ) ยัง sync ตามปกติ

---

## 7. Scope model — finance กับ calling นับ "คนละแบบ" (อย่ารวม)

scrutinize ยืนยันสองระบบนับ scope ต่างกันจริง ถ้ายัด set เดียว = เปลี่ยน behavior:

| | Finance ([financeAccess.js](web/lib/financeAccess.js)) | Calling ([callingAccess.js](web/lib/callingAccess.js)) |
|---|---|---|
| หัวหน้าภาค (regional) | expand 3 ชั้น (จังหวัด/ภาคย่อย/**ภาคใหญ่**) | expand แค่ **ภาคย่อย** (ไม่รู้จักภาคใหญ่) |
| ถือ 2 ทีมจังหวัด | ดูได้ทั้ง 2 (view) | ได้แค่ **จังหวัดเดียว** (primaryProvince) |
| edit บัญชีจังหวัด | exact ทีมจังหวัดเท่านั้น (ไม่ expand) | — |

**ข้อสรุป:** resolver **ไม่ pre-expand** — คืน **raw scope grants** แล้วแต่ละระบบ expand ด้วยฟังก์ชันเดิม
- `getUserScope` (calling) → เก็บไว้เหมือนเดิม (primaryProvince + single-province) แค่กิน grant แทนชื่อ role
- finance `hasProvinceScope`/exact-check → เก็บโครง 2-branch เดิม

---

## 8. Resolver contract

```
// web/lib/resolveAccess.js
resolveAccess(guildId, roleNames[]) → {
  isMember: boolean,                  // มีแถวใน dc_members ของ guild ไหม (membership gate ฟรี)
  permissions: Set<string>,           // canonical permissions
  scopeGrants: Array<string>,         // raw scope_node ['province:ราชบุรี','region:ทีมภาคกลาง'] — ยังไม่ expand
}
```

- query `dc_guild_roles` ด้วย `role_name` (index `idx_dc_guild_roles_lookup`)
- `permissions` = รวม `permission` ที่ไม่ null · `scopeGrants` = รวม `scope_node` ที่ไม่ null (**ดิบ**)
- geography ให้ helper `expandGrants(grants, { mode })` แต่ละระบบเรียกตาม semantics ตัวเอง
- **แทนที่** การ hardcode ชื่อ role ไทย (ไม่ใช่แทน `getUserScope` ทั้งดุ้น — มันยังอยู่ แค่กิน grant)
- ผ่าน `getEffectiveRoles`/`getEffectiveIdentity` เดิม (debug/view-as-role ยังทำงาน)
- cache `dc_guild_roles` map ใน memory (เปลี่ยนนานๆ ที)

---

## 9. Feature matrix (capabilities — universal)

**Finance**
- view **private** account คนอื่น → **{admin} เท่านั้น** ([financeAccess.js:117](web/lib/financeAccess.js#L117) เช็ค `Admin` ตรงๆ)
- view internal → {admin, secretary_general, regional_coordinator, province_coordinator, district_coordinator, treasurer} ∩ scope
- edit province account → {admin, secretary_general, province_coordinator, district_coordinator, treasurer} ∩ provinceScope
- edit wide (province=null) → {admin, secretary_general, treasurer}
- create non-private → {admin, secretary_general, regional_coordinator, province_coordinator, district_coordinator, treasurer}

**Calling**
- view campaigns/members → {admin, secretary_general, regional_coordinator, province_coordinator, district_coordinator} ∩ scope
- create campaign → {admin, secretary_general, regional_coordinator, province_coordinator, district_coordinator}
- see phone/LINE (PDPA) → {admin, secretary_general, regional_coordinator, province_coordinator, district_coordinator}
- override tier → {admin, secretary_general, treasurer}
- delete log → {admin, secretary_general, moderator}

**Bot/Social**
- manage social + guild config → {admin} · ai config → super_admin

---

## 10. Seed — อาสาประชาชน (`scripts/migration/seed-guild-roles.js`)

- อ่าน `config/roles.js`: `ROLES` (name→id), `PROVINCE_ROLES`/`SUB_REGION_ROLES`/`MAIN_REGION_ROLES` (จังหวัด→**id**), `INTEREST_CONFIG`, `SKILL_CONFIG`
- สร้าง `idToName` จาก invert `ROLES` ก่อน (ทุก map เก็บ id ต้องแปลงเป็น role_name)
- seed `dc_guild_role_groups`: interest/skill (`plain`) + province (`province`)
- seed `dc_guild_roles`:
  - ป้าย B: title → `permission` · team จังหวัด → `scope_node='province:<จ>'` · team ภาค → `subregion:`/`region:<role_name>`
  - ป้าย A: `INTEREST_CONFIG`/`SKILL_CONFIG` → `picker_group`+`picker_label`+`picker_emoji`+`picker_order` · team จังหวัด → `picker_group='province'`
- idempotent `ON CONFLICT (guild_id, role_id) DO UPDATE` · รัน `sudo -u www`

---

## 11. Migration plan (อาสาประชาชนใช้งานได้ทุก step)

1. `migration.sql` สร้าง 2 ตาราง (+ comment วันที่)
2. `seed-guild-roles.js` seed อาสาประชาชน (RBAC + picker)
3. `web/lib/geography.js` — geography data
4. `web/lib/permissions.js` — capability matrix
5. `web/lib/resolveAccess.js` — resolver
6. แก้ `financeAccess.js`/`callingAccess.js`/`roles.js` → เช็ค permission/scope (logic เดิม)
7. port `financeAccess.test.js`/`callingAccess.test.js` → permission input
8. bot: sync role catalog → `dc_guild_roles` (เพิ่มใน sync เดิม)
9. bot: render interest/skill/province panel จาก DB แทน `config/roles.js`
10. *(ทีหลัง)* UI per-guild role config + dynamic groups

---

## 12. Code style
- runnable / copy-paste, ไม่ over-engineer
- ESM ใน `web/`, CommonJS ใน root/bot
- SQL รวมใน `scripts/migration/migration.sql` พร้อม comment วันที่
- loop scripts: total ก่อนเริ่ม + progress inline + สรุปจบ

## 13. Testing strategy
- **safety net = test เดิม** (`financeAccess` 48, `callingAccess` 37) = behavior spec → port ให้ feed permission/scope ผลลัพธ์เท่าเดิม
- เพิ่ม unit test `resolveAccess` + `geography expand`
- `cd web && npm test` เขียวก่อน commit ทุกครั้งที่แตะ lib เหล่านี้

## 14. Boundaries
- **Always:** behavior อาสาประชาชนเป๊ะ (พิสูจน์ด้วย test) · fail-safe · sync catalog อัตโนมัติ · render/แปะ ใช้ role_id
- **Ask first:** อะไรที่จะเปลี่ยน behavior อาสาประชาชน
- **Never:** อ่าน/แสดง `.env` (ยกเว้น `DB_*`) · เปิด pg schema แยก · ย้าย super_admin เข้า DB · ทำ dynamic group UI รอบนี้

---

## 15. Decisions (เคาะแล้ว 2026-06-10)

1. **ขอบเขต** — รวม RBAC + interest/skill/province เป็นงานเดียว "per-guild role config" (ไม่แยก panel builder)
2. **กลุ่ม picker** — fix 3 (interest/skill/province) รอบนี้ · `kind`=plain/province · **สร้างกลุ่มเอง = feature ทำต่อ** (schema เผื่อแล้ว)
3. **province** — เลือกได้หลายอัน · guild มี/ไม่มีก็ได้ · feed scope เฉพาะกลุ่ม `kind=province`
4. **`district_coordinator`** — ✅ ตทอ. = `กรรมการจังหวัด` แยกเป็น token ของตัวเอง · **ปัจจุบันสิทธิ์เท่า `province_coordinator`** (ไว้ปรับลดทีหลังโดยไม่กระทบ `ผู้ประสานงานจังหวัด`)
5. **`moderator`** — ✅ canonical permission (action-only) จาก Discord `Moderator`
6. **`admin` vs `secretary_general`** — ✅ แยก 2 permission (admin เห็น private คนอื่น, secretary_general ไม่เห็น)
7. **key ตาราง** — `(guild_id, role_id)` (Discord ชื่อ role ซ้ำได้) · web lookup ด้วย role_name ผ่าน index
