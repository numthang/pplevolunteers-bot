# Handoff — PostgreSQL Migration Testing (v2.7.0-pgsql-unstable)

**วันที่:** 2026-05-28  
**ส่งต่อจาก:** Claude Sonnet 4.6 บน Linux → Claude บน Mac  
**Branch:** `master` — `git pull origin master` แล้วเริ่มได้เลย

---

## สถานะตอนส่งมอบ

Migration code เสร็จ 100% — กำลังอยู่ในขั้น **local testing บน Mac**  
Feature freeze จนกว่าจะ test ผ่านทุกหน้า

| Component | สถานะ |
|---|---|
| Code migration mysql2 → pg | ✅ เสร็จ (~50 ไฟล์) |
| Data migration (pgloader) | ✅ รันบน Linux แล้ว — Mac copy มาจาก Linux |
| Sequences fix | ⚠️ ต้องรันบน Mac ก่อน (ดูด้านล่าง) |
| Web pages testing | 🔄 บาง page tested บน Linux แล้ว ต้อง confirm บน Mac |
| Bot commands testing | ❌ ยังไม่ได้ test |
| Production deploy | ❌ ยังไม่ทำ — รอ test local ผ่านก่อน |

---

## ขั้นตอนแรกที่ต้องทำบน Mac

### 1. Pull code
```bash
git pull origin master
```

### 2. รัน sequence fix (สำคัญมาก — ต้องทำก่อน test)
pgloader ไม่ได้สร้าง `DEFAULT nextval(...)` ให้ทุก table ทำให้ INSERT fail ด้วย:
```
null value in column "id" of relation "xxx" violates not-null constraint
```
Fix:
```bash
PGPASSWORD=<your_pass> psql -h localhost -U pple_dcbot -d pple_volunteers \
  -f scripts/migration/postgres_fix_sequences.sql
```
Script อยู่ที่: `scripts/migration/postgres_fix_sequences.sql`

### 3. Start web
```bash
cd web && npm run dev
```

---

## Pages ที่ต้อง test ทีละหน้า

| Page / Flow | สถานะ Linux | หมายเหตุ |
|---|---|---|
| `/` — home, login | ✅ OK | |
| `/bot/social/accounts` | ✅ OK | |
| `/api/admin/guilds` | ✅ OK | |
| `/calling` — campaign list | ✅ OK | |
| `/calling/[id]` — member list | ✅ fixed | เคยเจอ duplicate rows |
| `/calling/assignee?tab=starred` | ✅ fixed | เคยเจอ type cast error |
| `/calling/stats` | ✅ fixed | เคยเจอ type cast error |
| Record call modal (บันทึก log) | ✅ fixed | เคยเจอ null id error |
| `/calling/assignee?tab=contacts` | ❓ ยังไม่ test | |
| `/calling/assignee?tab=pending` | ❓ ยังไม่ test | |
| Finance — accounts, transactions | ❓ ยังไม่ test | |
| Finance — report | ❓ ยังไม่ test | |
| Bot Discord commands (slash) | ❓ ยังไม่ test | |

---

## Bug patterns ที่เคยเจอ — reference สำหรับ debug ต่อ

### Pattern A: Type mismatch integer vs varchar
```
operator does not exist: integer = character varying
```
**สาเหตุ:** `ngs_member_cache.source_id` เป็น `integer` แต่ `calling_*.member_id` เป็น `varchar`  
**Fix:** ใส่ `::text` cast ทุกที่ที่ JOIN หรือเปรียบเทียบกัน
```sql
-- ผิด
WHERE a.member_id = m.source_id
-- ถูก
WHERE a.member_id = m.source_id::text
```
ไฟล์ที่แก้แล้ว: `web/db/calling/members.js`, `tiers.js`, `assignments.js`, `starred.js`, `web/app/api/calling/stats/route.js`  
ถ้าเจอ error นี้กับไฟล์อื่น — ใส่ `::text` แบบเดิม

### Pattern B: Duplicate rows
```
React: Each child in a list should have a unique "key" prop
```
หรือข้อมูลแสดงซ้ำ  
**สาเหตุ:** GROUP BY บน log columns ทำให้ member ที่มีหลาย log แตกเป็นหลาย row  
**Fix:** ใช้ `LEFT JOIN LATERAL (SELECT ... ORDER BY called_at DESC LIMIT 1) ll ON TRUE`  
ดูตัวอย่างใน `web/db/calling/members.js`

### Pattern C: null value in column "id"
```
null value in column "id" of relation "xxx" violates not-null constraint
```
**สาเหตุ:** ยังไม่ได้รัน `postgres_fix_sequences.sql`  
**Fix:** รัน script ตามขั้นตอนด้านบน

### Pattern D: Alias ใน ORDER BY
```
column "alias_name" does not exist
```
**สาเหตุ:** PostgreSQL ไม่ allow computed alias ใน ORDER BY บาง context  
**Fix:** Wrap เป็น subquery
```sql
SELECT * FROM (
  SELECT ..., COUNT(*) AS mentions ...
  GROUP BY user_id
) sub ORDER BY mentions DESC
```
ดูตัวอย่างใน `db/stat.js`

### Pattern E: Correlated subquery + ungrouped column
```
subquery uses ungrouped column "d.guild_id" from outer query
```
**Fix:** แทน column reference ด้วย parameter `$2` แทน
ดูตัวอย่างใน `db/stat.js`

---

## สถาปัตยกรรม DB ที่ต้องรู้

- **`ngs_member_cache.source_id`** → `integer` (member NGS ID เริ่มจาก 55)
- **`calling_*.member_id`** → `varchar` (เก็บทั้ง member และ contact ร่วมกัน)
- **`calling_contacts.id`** → `integer` เริ่มจาก 1 → overlap กับ source_id ได้
- **ทุก query บน calling shared tables ต้องมี `AND contact_type = 'member'` หรือ `'contact'` เสมอ**

---

## Files หลักที่เปลี่ยนใน migration

```
db/index.js                          ← bot pool (pg, CJS)
web/db/index.js                      ← web pool (pg, ESM)
db/*.js (12 files)                   ← bot db functions
web/db/calling/*.js (7 files)        ← calling db functions
web/db/finance/*.js (4 files)        ← finance db functions
web/db/guilds.js
web/app/api/**/*.js (~18 routes)
services/*.js (emailPoller, financeOCR, metaApi, smsWebhook, xApi)
commands/panel.js, user.js
scripts/migration/postgres_fix_sequences.sql ← NEW
```

---

## เมื่อ test ผ่านทั้งหมด

1. ลบไฟล์นี้หรือ archive ไว้
2. Tag `v2.7.0` (stable)
3. Deploy production ตาม `md/DEPLOYMENT.md`
4. Feature freeze ยกเลิกได้

---

## วิธีใช้ไฟล์นี้

บอก Claude บน Mac ว่า:
> "อ่าน `md/HANDOFF_PGSQL.md` ก่อน แล้วช่วยทดสอบและแก้ bug PostgreSQL migration ต่อ"
