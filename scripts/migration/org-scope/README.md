# org-scope migration — ชุด cutover `org-core` → `master`

ทั้งโฟลเดอร์นี้คือ migration ก้อนเดียวกัน **รันตามเลขหน้าไฟล์เท่านั้น** เลขคือลำดับ ไม่ใช่แค่ชื่อ
รายละเอียดว่าแต่ละไฟล์ทำอะไร + เหตุผลของลำดับ อยู่ที่ [`md/CUTOVER.md` §2](../../../md/CUTOVER.md)

| # | ไฟล์ | ทำอะไรคร่าวๆ |
|---|---|---|
| 00 | `org-roles.sql` | คลังคำ permission — **ไฟล์ 11 มี FK มาหา** · 01 ระบุเองว่าอยู่นอกขอบเขต |
| 01 | `identity-refactor.sql` | `dc_members` → `users` + `org_members` + `user_identities` · `organizations`→`orgs` |
| 02 | `finance-org-scope.sql` | finance 4 ตาราง `guild_id`→`org_id` |
| 03 | `cache-rename.sql` | `ngs_member_cache`→`cache_pple_member` · `act_event_cache`→`cache_pple_event` |
| 04 | `calling-org-scope.sql` | calling 5 ตาราง + roster |
| 05 | `docs-org-scope.sql` | docs 3 ตาราง |
| 06 | `docs-id-card-to-users.sql` | สำเนาบัตร → `users` |
| 07 | `docs-index-rename.sql` | rename index/constraint ที่ชื่อยังเป็น `guild`/`discord_id` |
| 08 | `audit-org-scope.sql` | `audit_logs` → org |
| 09 | `cases-discord-guild-artifact.sql` | ⚠️ **prod ใช้แค่บล็อกท้ายไฟล์** (ส่วนบน backfill hardcode ของ localhost) |
| 10 | `cases-org-scope.sql` | cases 5 ตาราง — **ห้ามสลับกับ 09** |
| 11 | `org-access-tables.sql` | `org_scope_nodes`/`org_role_defs`/`org_member_roles` · สวิตช์ฟีเจอร์ขึ้น org · ที่อยู่ใน `org_members` |
| 12 | `org-access-redesign.sql` | ย้ายสิทธิ์ที่มีอยู่เข้าโครงใหม่ + diff test |

> ไฟล์ 11 เดิมเป็น 3 บล็อกท้าย `../migration.sql` — ยกออกมาไว้ที่นี่ (2026-07-23)
> เพราะเป็นชุดเดียวกับ cutover นี้ · `migration.sql` ไม่ต้องรันคั่นกลางลำดับอีกแล้ว

## `_superseded/` — ห้ามรัน

ของที่ยกออกจาก `migration.sql` แต่ไม่อยู่ในลำดับ เก็บไว้เป็นประวัติ:
- `covered-by-01-identity-refactor.sql` — 01 ทำให้ครบแล้ว (Phase 0 · login tokens · web_roles · rename 2 ตัว)
- `finance-expand-2026-07-16.sql` — **ตายแล้ว** 02 เปิดหัวไฟล์ด้วย `DROP COLUMN` ทิ้งทั้ง 3 คอลัมน์ที่บล็อกนี้เติม
  และถ้ารันหลัง 01 จะ ERROR เพราะอ้าง `organizations`/`dc_members` ที่ถูก rename ไปแล้ว

## ⚠️ 4 อย่างที่พลาดแล้วเจ็บ

0. **00 ก่อน 11** — 11 มี `org_role_defs.permission REFERENCES org_roles(key)`
1. **11 ก่อน 12 เสมอ** — 12 เขียนลง 3 ตารางที่ 11 เป็นคนสร้าง
2. **09 ก่อน 10 เสมอ** — 10 แปลง `cases.guild_id`→`org_id` ถ้าไม่ copy ค่าลง `discord_guild_id` ก่อน ข้อมูลว่า thread อยู่ guild ไหนหายถาวร
3. **01 รันซ้ำไม่ได้** — มัน DROP + CREATE `users`/`org_members` แล้ว rebuild จาก `dc_members` → ของที่ไม่ได้มาจาก Discord (org ที่สร้างเอง, invite, สมัครด้วย email) หายหมด · หลัง cutover จบให้ rename เป็น `01-identity-refactor.applied.sql` ทันที

## ซ้อมกับ dump ของ prod

```bash
# บนเครื่อง prod
sudo -u www bash -c 'pg_dump "$DATABASE_URL" -Fc -f /www/backup/rehearsal_$(date +%F).dump'

# ก๊อปมาเครื่อง dev แล้ว
./scripts/migration/org-scope/rehearse.sh ~/Downloads/rehearsal_2026-07-23.dump
```

วาง dump ไว้ที่ไหนก็ได้ — ส่ง path เข้าไปตรงๆ · ไม่ต้อง `export PG*` เอง สคริปต์อ่าน `DB_*` จาก `.env` ให้
DB ซ้อมสคริปต์สร้างเองเป็นขั้นแรก (`dropdb --if-exists` → `createdb` → `pg_restore`) รันซ้ำได้ทุกรอบ
และ **ปฏิเสธถ้าสั่งให้ชี้ `pple_volunteers`** (01 จะ DROP `users`/`org_members` ของจริง)

รันครบทุกขั้นพร้อมจับเวลาต่อขั้น แล้วปิดท้ายด้วยชุด query ตรวจของที่พังบ่อยบน data จริง (ทุกบรรทัดต้องได้ 0)

ซ้อมพัง = ดีแล้ว เจอตอนซ้อมดีกว่าเจอตอน prod ปิดอยู่ · แก้แล้วรัน `rehearse.sh` ใหม่ได้ไม่จำกัด
