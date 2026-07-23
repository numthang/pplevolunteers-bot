# CUTOVER RUNBOOK — org-core → master

> เขียน 2026-07-21 · **อัปเดตล่าสุด 2026-07-21 (รอบ docs/cases/audit)** · branch `org-core` นำ `master` อยู่ **71 commit** · prod ยังไม่เคยเห็นโค้ดชุดนี้เลย
> งานทั้งชุด (identity split + org core + org-scope ครบทั้ง 4 ฟีเจอร์ **finance/calling/docs/cases** + audit + bot repoint) **ต้องลงพร้อมกัน** — ลงครึ่งเดียว = พัง
> ⚠️ ยังไม่เคยซ้อมกับ DB ที่มี state เหมือน prod จริง (localhost migrate ไปแล้ว) → ต้องรัน §0 ก่อนตัดสินใจ
> 🔴 **แก้ 2026-07-24: แอปนี้ไม่มี `$DATABASE_URL`** — ต่อ DB ด้วย `DB_HOST/DB_USER/DB_PASS/DB_NAME` ใน `.env` (db/index.js)
>    ทุกคำสั่ง psql/pg_dump ข้างล่างจึงโหลด `DB_*` แล้ว map เป็น `PG*` ก่อน (เดิมอ้าง `$DATABASE_URL` ที่ว่าง → pg_dump ได้ไฟล์เปล่า/psql ต่อไม่ติด)

---

## 🔌 ต่อ DB — วางบรรทัดนี้นำหน้าทุกคำสั่ง psql/pg_dump บน prod

ทุก `sudo -u www bash -c '...'` เป็น shell ใหม่ (env ไม่ค้าง) → แต่ละบล็อกต้องโหลดเอง:
```bash
cd /www/wwwroot/pple-volunteers
set -a; . <(grep -E '^DB_(HOST|PORT|USER|PASS|NAME)=' .env); set +a
export PGHOST=$DB_HOST PGPORT=${DB_PORT:-5432} PGUSER=$DB_USER PGPASSWORD=$DB_PASS PGDATABASE=$DB_NAME
# ↑ หลังบรรทัดนี้ psql / pg_dump / pg_restore เปล่าๆ ต่อ prod DB ได้เลย ไม่ต้องใส่ -h -U -d
```

---

## 0) PROBE — ดูก่อนว่า prod อยู่สถานะไหน (read-only, รันบนเครื่อง prod)

ใช้ **heredoc ซ้อน** — เลี่ยงนรก quote (`''...''` ใน `bash -c '...'` ทำ single quote ของ SQL หาย
→ `to_regclass(public.dc_members)` ไม่มี quote → error · บั๊กนี้อยู่ในรันบุ๊กเดิมมาตลอด เพิ่งจับได้ 2026-07-24):
```bash
sudo -u www bash <<'OUTER'
cd /www/wwwroot/pple-volunteers
set -a; . <(grep -E '^DB_(HOST|PORT|USER|PASS|NAME)=' .env); set +a
export PGHOST=$DB_HOST PGPORT=${DB_PORT:-5432} PGUSER=$DB_USER PGPASSWORD=$DB_PASS PGDATABASE=$DB_NAME
psql <<'SQL'
SELECT to_regclass('public.dc_members')        AS dc_members,
       to_regclass('public.users')             AS users_new,
       to_regclass('public.org_roles')         AS org_roles,
       to_regclass('public.cache_pple_member') AS cache_new;
SELECT count(*) AS dc_members_count FROM dc_members;
SELECT guild_id, name, org_id FROM dc_guilds ORDER BY org_id NULLS LAST;
SQL
OUTER
```

**คาดว่า prod จะได้:** `dc_members` = ชื่อตาราง (มี) · `users_new`/`org_roles`/`cache_new` = NULL (ว่าง) · `dc_members_count` = ตัวเลข
→ ตรงตามนี้ = ยังไม่เคย migrate ต้องรันครบ §2 · **ถ้า `users_new` ไม่ NULL = เคยรันบางส่วนแล้ว หยุด** เทียบทีละไฟล์
→ `dc_guilds`: org 1 มี 3 guild (อาสาฯ/ราชบุรี/People's Party) · **NamWa + พันธมิตรชานม org_id = NULL** (ปกติ — guild นอกองค์กร #12 กันไว้แล้ว) · จด `dc_members_count` ไว้เทียบหลัง migrate

---

## 1) BACKUP (บังคับ — identity-refactor เป็น DESTRUCTIVE)

```bash
sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers
  set -a; . <(grep -E "^DB_(HOST|PORT|USER|PASS|NAME)=" .env); set +a
  export PGHOST=$DB_HOST PGPORT=${DB_PORT:-5432} PGUSER=$DB_USER PGPASSWORD=$DB_PASS PGDATABASE=$DB_NAME
  pg_dump -Fc -f /www/backup/pple_pre_orgcutover_$(date +%F_%H%M).dump'
```
> ✅ **เช็ก backup ไม่เปล่า:** `ls -lh /www/backup/pple_pre_orgcutover_*.dump` ต้องหลาย MB ไม่ใช่ 0 (ของจริงตอนซ้อม ~5MB)
กู้: โหลด `PG*` แบบเดียวกันแล้ว `pg_restore -c -d "$DB_NAME" <ไฟล์>`

---

## 1.5) ⭐ ซ้อมกับ dump ของ prod — **ทำก่อนวันจริง อย่าข้าม**

> เลื่อนมาทำ "ตอนจะ deploy จริง" (user เคาะ 2026-07-21) · **ยังไม่เคยซ้อมเลยสักครั้ง = ความเสี่ยงอันดับ 1 ที่เหลืออยู่**
> localhost รัน migration ทีละไฟล์ค่อยเป็นค่อยไปตลอดสัปดาห์ → **ไม่ได้พิสูจน์ว่า 12 ขั้นรันรวดเดียวบน data จริงจะผ่าน**
> prod มีข้อมูลเยอะกว่ามาก + มี state ที่ localhost ไม่มี (คนที่ไม่เคยถูก dedup, แถวกำพร้า, ค่าที่ map ไม่ได้)
> ได้ของแถม: **ตัวเลขเวลา downtime จริง** ไปแจ้งทีมล่วงหน้า

```bash
# 1. ดึง dump จาก prod (ทำบนเครื่อง prod) แล้วก๊อปมาเครื่อง dev
sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers
  set -a; . <(grep -E "^DB_(HOST|PORT|USER|PASS|NAME)=" .env); set +a
  export PGHOST=$DB_HOST PGPORT=${DB_PORT:-5432} PGUSER=$DB_USER PGPASSWORD=$DB_PASS PGDATABASE=$DB_NAME
  pg_dump -Fc -f /www/backup/rehearsal_$(date +%F).dump'

# 2. ซ้อมทั้งชุด — drop/restore DB ซ้อม + รัน 12 ขั้นตามลำดับ + จับเวลา + ตรวจผล
./scripts/migration/org-scope/rehearse.sh ~/Downloads/rehearsal_YYYY-MM-DD.dump
```

สคริปต์ทำให้ครบในคำสั่งเดียว: สร้าง `pple_rehearsal` แยก (ปฏิเสธถ้าชี้ `pple_volunteers`) ·
รัน 00–12 ด้วย `ON_ERROR_STOP` หยุดทันทีที่ขั้นไหนพัง · ใช้ **บล็อก PROD ของ #09** ไม่ใช่ทั้งไฟล์
(ส่วนบนเป็น backfill hardcode ของ localhost) · จับเวลาต่อขั้น + รวม = **ตัวเลข downtime จริง** ·
ปิดท้ายด้วยชุด query ตรวจของที่พังบ่อย (ทุกบรรทัดต้องได้ 0)

```bash
# 3. ชี้เว็บ dev มาที่ DB ซ้อม แล้วกดใช้จริง (login → finance/calling/docs/cases)
cd web && DB_NAME=pple_rehearsal npm run dev
# เสร็จแล้วเก็บกวาด: dropdb pple_rehearsal
```

**ถ้าซ้อมพัง** = ดีแล้ว เจอบนของซ้อมดีกว่าเจอตอน prod ปิดอยู่ · แก้ migration แล้ว `dropdb && restore` ซ้อมใหม่ (ทำซ้ำได้ไม่จำกัด)

---

## 2) MIGRATION — ลำดับนี้เท่านั้น

| # | ไฟล์ | ทำอะไร | ทำไมต้องลำดับนี้ |
|---|---|---|---|
| **0** | `scripts/migration/org-scope/00-org-roles.sql` | `org_roles` (คลังคำ permission) + FK `dc_guild_roles.permission` | **#11 มี FK มาหา** · `01` ระบุเองว่า org_roles อยู่นอกขอบเขต → prod ที่ไม่เคยรัน `migration.sql` จะไม่มีตารางนี้ |
| 1 | `scripts/migration/org-scope/01-identity-refactor.sql` | `dc_members` → `users` + `org_members` + `user_identities` · `organizations`→`orgs` · `org_config`/`org_roles`/`org_login_tokens` · rename `dc_members`→`_dc_members` | ทุกไฟล์ที่เหลืออ้าง `users.id` / `orgs.id` — ต้องมีก่อน |
| 2 | `scripts/migration/org-scope/02-finance-org-scope.sql` | finance 4 ตาราง `guild_id`→`org_id`, `owner_id`/`updated_by`→`users.id` | ต้องมี `users`+`orgs` แล้ว |
| 3 | `scripts/migration/org-scope/03-cache-rename.sql` | `ngs_member_cache`→`cache_pple_member` · `act_event_cache`→`cache_pple_event` | ไฟล์ถัดไปอ้างชื่อใหม่ |
| 4 | `scripts/migration/org-scope/04-calling-org-scope.sql` | calling 5 ตาราง + roster `guild_id`→`org_id` · person→`users.id` | ต้องผ่าน #1 (users) และ #3 (ชื่อ cache ใหม่) |
| 5 | `scripts/migration/org-scope/05-docs-org-scope.sql` | docs 3 ตาราง `guild_id`→`org_id` · person 6 คอลัมน์→`users.id` · rename `act_event_cache_id`→`cache_pple_event_id` | ต้องผ่าน #1 (users) และ #3 (ชื่อ cache ใหม่) |
| 6 | `scripts/migration/org-scope/06-docs-id-card-to-users.sql` | ย้ายสำเนาบัตร `org_members.id_card_image` → `users` (1 คน 1 ใบ) แล้ว DROP คอลัมน์เดิม | ต้องผ่าน #5 |
| 7 | `scripts/migration/org-scope/07-docs-index-rename.sql` | rename index/constraint 4 ตัวที่ชื่อยังเป็น `guild`/`discord_id` | ต้องผ่าน #5 (ไม่งั้นหาชื่อเก่าไม่เจอ) |
| 8 | `scripts/migration/org-scope/08-audit-org-scope.sql` | `audit_logs` `guild_id`→`org_id` · `actor_id`→`users.id` | ต้องผ่าน #1 |
| **9** | ⚠️ **บล็อก PROD ใน `cases-discord-guild-artifact.sql`** (ท้ายไฟล์ — 2 บรรทัด) | เพิ่ม `cases.discord_guild_id` แล้ว **copy ค่าจาก `guild_id` เดิม** | **ต้องรันก่อน #10 เท่านั้น** — ดูอันตรายข้างล่าง |
| 10 | `scripts/migration/org-scope/10-cases-org-scope.sql` | cases 5 ตาราง `guild_id`→`org_id` · `created_by` + assignee→`users.id` | ต้องผ่าน #1 และ **#9** |
| 11 | `scripts/migration/org-scope/11-org-access-tables.sql` | 3 ตาราง `org_scope_nodes`/`org_role_defs`/`org_member_roles` + `dc_guild_roles.org_role_def_id` · `enabled_features` ขึ้น `org_config` · ที่อยู่ใน `org_members` | ต้องผ่าน #1 และ **#0** |
| 12 | `scripts/migration/org-scope/12-org-access-redesign.sql` | ย้ายสิทธิ์เข้าโครงใหม่ + diff test | ต้องผ่าน **#11** (เขียนลง 3 ตารางที่ 11 สร้าง) |

> **ไม่ต้องรัน `migration.sql` คั่นกลางอีกแล้ว** (2026-07-23) — 3 บล็อกท้ายไฟล์ที่เกี่ยวกับ org
> ถูกยกมาเป็น `11-org-access-tables.sql` แล้ว · `migration.sql` ที่เหลือเป็นของเก่าที่ prod มีอยู่แล้ว

⚠️ บล็อก **feature toggle** (อยู่ใน #11) **ต้องรันก่อน deploy code** ไม่งั้นช่วงคาบเกี่ยว org ที่ยังไม่มีแถวจะได้ default = **เปิดทุกฟีเจอร์**

**รันทั้ง 12 ขั้นด้วยสคริปต์เดียว** (2026-07-24 — โครงเดียวกับ `rehearse.sh` ที่ซ้อมผ่าน แต่ยิงใส่ DB จริง ไม่ drop/create):
```bash
sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && ./scripts/migration/org-scope/run-prod.sh'
```
- โหลด `DB_*` จาก `.env` เอง · เติม `-1` ให้ #00/#01/#11 อัตโนมัติ · ใช้บล็อก PROD ของ #09
- `ON_ERROR_STOP` — พังขั้นไหนหยุดทันที (บอกให้ restore backup)
- safety guard: ปฏิเสธถ้าไม่มี `dc_members` หรือมี `users` แล้ว (กันรันซ้ำ 01 = ข้อมูลหาย) + ถาม `yes` ก่อนเริ่ม
- จบแล้วตรวจ 6 บรรทัดให้ = 0

อยากรันทีละไฟล์เองก็ได้ (ดู verify block ท้ายไฟล์) — โหลด `PG*` ก่อน (บล็อก 🔌 บนสุด) แล้ว:
```bash
psql -v ON_ERROR_STOP=1 -1 -f scripts/migration/org-scope/01-identity-refactor.sql
```

> 🔴 **`-1` ของ #01 และ #11 ห้ามลืม** (แก้ 2026-07-23 — คำสั่งในหน้านี้เดิม**ไม่มี** `-1` และพังจริงตอนซ้อม)
> `01-identity-refactor.sql` สร้าง `_idmap` เป็น `TEMP TABLE ... ON COMMIT DROP` และไม่มี `BEGIN;` ของตัวเอง
> → ไม่มี `-1` = psql commit ทีละ statement = temp table หายทันทีที่สร้างเสร็จ แล้วพังที่
> `ERROR: relation "_idmap" does not exist` **หลังจาก DROP users/org_members ไปแล้ว**
> ส่วน #02–#10 และ #12 ห่อ `BEGIN/COMMIT` มาในไฟล์เองแล้ว ไม่ต้องใส่ · `rehearse.sh` ตรวจให้อัตโนมัติ

### ⛔ อันตรายที่ต้องรู้

- 🔴 **#9 ต้องมาก่อน #10 เสมอ — พลาดแล้วกู้ไม่ได้บน prod**
  `cases.guild_id` เดิมทำ 2 หน้าที่ทับกัน: (1) scope ของ tenant (2) **บอกว่า thread ของเคสนี้อยู่ forum ของเซิร์ฟเวอร์ไหน**
  `cases-org-scope.sql` แปลง (1) เป็น `org_id` → **หน้าที่ (2) หายไปด้วย** ถ้าไม่ copy ค่าไว้ก่อน
  org 1 มี 3 guild → เดาจาก session ไม่ได้ = ลิงก์ thread พังหมด/ยิง forum ผิดเซิร์ฟเวอร์
  **เกิดขึ้นจริงบน localhost 2026-07-21** (กู้ได้เพราะจดค่าเดิมไว้ก่อนรัน — prod จะไม่มีใครจดให้)
  ```bash
  # รันก่อน cases-org-scope.sql เท่านั้น (บล็อก PROD ท้ายไฟล์ cases-discord-guild-artifact.sql)
  ALTER TABLE cases ADD COLUMN IF NOT EXISTS discord_guild_id VARCHAR(20);
  UPDATE cases SET discord_guild_id = guild_id WHERE discord_guild_id IS NULL;
  ```
  > ⚠️ ตัวไฟล์ `cases-discord-guild-artifact.sql` ส่วนบน = backfill **ตายตัวของ localhost** (hardcode ref 3 ใบ) — **prod ห้ามรันส่วนนั้น** ใช้แค่ 2 บรรทัดในบล็อก PROD
  > verify ทันทีหลังรัน #10: `SELECT count(*) FROM cases WHERE discord_thread_id IS NOT NULL AND discord_guild_id IS NULL;` ต้องได้ **0**

- **`identity-refactor.sql` = DROP + CREATE `users`/`org_members` แล้ว rebuild จาก `dc_members`** → อะไรที่ไม่ได้มาจาก `dc_members` (org ที่สร้างเอง, invite, สมัครด้วย email/Google, `web_roles` ที่ให้ผ่านเว็บ) **หายหมด**
  → prod รันได้ครั้งเดียวตอน cutover (prod ยังไม่มีข้อมูลพวกนี้) · **หลัง cutover ห้ามรันซ้ำเด็ดขาด** → ควร rename ไฟล์เป็น `*.applied.sql` ทันทีที่จบ
- `_dc_members` **อย่าเพิ่ง drop** — เป็น safety net จริง (2026-07-21 ใช้กู้ `member_id` ที่ถูกล้างมาแล้ว)
- **ไฟล์ที่ไม่อยู่ในลิสต์ §2 = ไม่ต้องรันตอน cutover:** `add-project-token-only.sql` + `hotfix-restore-docs-tokens.sql` (ของ 2026-07-06 อยู่ใน `master` และรันบน prod ไปแล้ว)
- `migration.sql` (ไฟล์สะสมเดิม 85KB) **พักอยู่** ระหว่างช่วงนี้ — ส่วน identity ในนั้นถูก supersede โดย `identity-refactor.sql` · กลับมาใช้ต่อหลัง cutover

---

## 3) DEPLOY CODE — ลำดับสำคัญ

```
1. pm2 stop pple-dcbot          ← หยุดบอทก่อน! บอทตัวเก่าเขียน dc_members ระหว่าง migrate = ข้อมูลหลุด
2. pm2 stop pple-web
3. git fetch && git reset --hard origin/master   (หลัง merge org-core→master แล้ว)
4. รัน migration §2 ครบทั้ง 12 ขั้น **ตามลำดับเป๊ะๆ** (ห้ามสลับ #9/#10)
5. npm install --omit=dev  →  cd web && npm install && npm run build
6. pm2 start pple-web  →  pm2 start pple-dcbot
```
> `deploy.sh --production` ทำข้อ 3/5/6 ให้อยู่แล้ว (มี `pm2 stop pple-web` ก่อน build กัน OOM)
> **แต่ยังไม่มีขั้น stop bot ก่อน migrate** — รอบนี้ต้องทำมือ หรือเพิ่มเข้า deploy.sh ก่อน

---

## 4) VERIFY หลังขึ้น (ไล่ตามนี้)

| จุด | วิธี | ผลที่ต้องได้ |
|---|---|---|
| นับข้อมูลไม่หาย | `SELECT count(*) FROM users;` / `org_members` | ≈ จำนวน `dc_members` เดิม (users น้อยกว่าได้ = dedup คนซ้ำข้าม guild) |
| login เว็บ | เข้าเว็บด้วย Discord | เข้าได้ + เห็นยศเดิม |
| finance | เปิด `/finance` | ยอด/บัญชีครบเท่าเดิม · ลอง SMS/อีเมลรายรับเข้า 1 รายการ → ต้องขึ้นเว็บ (org_id ไม่ NULL) |
| calling | เปิด `/calling` + กดบันทึกการโทร 1 ครั้ง | log ลง `calling_logs` `called_by` = users.id |
| **bot: verify OTP** | กดยืนยันตัวตนในดิสคอร์ด 1 คน | ผูก `org_members.member_id` + `users.phone_verified_at` (**flow นี้พังมาตั้งแต่ calling migration เพิ่งซ่อม — ต้องเทสจริง**) |
| bot: member join | ให้คนใหม่เข้า server หรือรัน sync | `users` + `org_members` เกิดแถวใหม่ ไม่มี error |
| bot: `/user ranking` | รันคำสั่ง | คืนชื่อจริง ไม่ใช่เลข id |
| **bot: `/panel finance-list`** | รันคำสั่งในดิสคอร์ด | ขึ้นรายชื่อบัญชีครบ · **ถ้าขึ้น "ยังไม่มีบัญชีในระบบ" = `org_id` ไม่ตรง** (จุดนี้เคยพังจริง — query ยังหา guild_id หลัง finance เป็น org · แก้แล้ว `de2cac2`) |
| **bot: แดชบอร์ดการเงิน** | ดูข้อความ dashboard ในห้องการเงิน (หรือ trigger ให้อัปเดต) | ยอดแต่ละบัญชีขึ้นครบ ไม่ใช่ 0 บัญชี — ใช้ `getAccountsSummary` ตัวเดียวกับข้อบน |
| bot: เคสจากดิสคอร์ด | สร้างเคสผ่าน `/panel` หรือ forum | `cases` ได้ `org_id` + **`discord_guild_id`** + `created_by`=users.id |

> ⚠️ **บอทต้องกดใช้จริงในดิสคอร์ด — build/smoke test ฝั่งเว็บจับบั๊กพวกนี้ไม่ได้เลย**
> (2026-07-21 เจอ 3 จุดฝั่งบอทที่ตกสำรวจมาหลายวันโดยที่เว็บเขียว 100% ตลอด)
| **docs** | เปิด `/docs` → เปิดโครงการ 1 ใบ | รายการผู้รับ/ผู้จ่ายครบ · ลองแก้ 1 entry แล้วเซฟได้ · gen PDF ออก |
| docs: สำเนาบัตร | เปิดหน้าเซ็นของ entry ที่มีบัตร | รูปขึ้น (URL เป็น `/api/docs/id-card/<users.id>` ไม่ใช่ snowflake) · คนนอก org ต้องได้ **403** |
| **cases** | เปิด `/case/manage` | เห็นเคสครบ **ทุก guild ของ org รวมกัน** · เปิดเคส 1 ใบ → ลิงก์ thread ต้องชี้ **เซิร์ฟเวอร์เจ้าของเคสจริง** ไม่ใช่เซิร์ฟเวอร์ที่กำลังเปิดอยู่ |
| cases: เขียน | กดรับเคส (assign) 1 ครั้ง | `case_assignees` ได้ `org_id` + `user_id` (ไม่ใช่ snowflake) |
| **audit** | ทำ action อะไรก็ได้ (เปลี่ยนสถานะเคส / กดโทร) | `SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1;` ต้องมีแถวใหม่ `org_id` + `actor_id`=users.id — **ถ้าไม่มีแถวเลย = ยังมีรูเดิม** (เคยหายเงียบเพราะ fire-and-forget กลืน error) |

---

## 5) ROLLBACK

| สถานการณ์ | ทำ |
|---|---|
| migration พังกลางทาง | `pg_restore` จาก §1 (ไฟล์ #2–#10 มี BEGIN/COMMIT ในตัว = อะตอมมิกทีละไฟล์ · #1 ใหญ่กว่านั้น ใช้ backup ปลอดภัยกว่า) |
| migrate ผ่านแต่โค้ดพัง | `git reset --hard <commit เดิม>` + `pg_restore` — **ย้อนโค้ดอย่างเดียวไม่พอ** เพราะ schema เปลี่ยนไปแล้ว |
| อยากคืนแค่ `dc_members` | `ALTER TABLE _dc_members RENAME TO dc_members;` (โค้ดเก่าใช้ได้ทันที แต่ข้อมูลใหม่หลัง cutover จะไม่อยู่ในนั้น) |

---

## 6) ยังค้างก่อน cutover (blocker)

- [ ] **user เทส docs + cases จริงในเบราว์เซอร์** (นัดไว้ 2026-07-21 — ยังไม่ได้เทส) · ที่ verify ไปคือ smoke test + write path บางส่วนเท่านั้น
- [ ] **ซ้อม migration ทั้ง 12 ขั้นกับ dump ของ prod → ดูขั้นตอนพร้อมคำสั่งที่ [§1.5](#15--ซ้อมกับ-dump-ของ-prod--ทำก่อนวันจริง-อย่าข้าม)** ← เสี่ยงสุดที่เหลือ · user เคาะให้ทำ "ตอนจะ deploy จริง" (2026-07-21)
- [ ] เพิ่มขั้น **stop bot ก่อน migrate** ใน `deploy.sh --production`
- [ ] `scripts/data/backfill-intro-*.js` + `scripts/social/x-get-token.js` ยังอ้าง `dc_members` (one-off ที่รันไปแล้ว/ตายแล้ว — ตัดสินใจว่าจะแก้หรือลบ)
- [ ] RBAC: คน login email ของ org ที่**ไม่มี guild** ยังเปิด `/finance` ไม่ได้ (ตั้งใจ — เปิดตอน endgame) · ส่วน email member ของ org ที่**มี guild** แก้แล้ว (bug-034)

**✅ เคลียร์แล้วตั้งแต่เขียน runbook รอบแรก:**
- ~~docs ยัง guild-scoped~~ → docs → org เสร็จ 2026-07-21 (migration #5–#7)
- cases → org เสร็จ 2026-07-21 (#9–#10) · audit_logs → org เสร็จ (#8)
- **ไม่เหลือ tenant data ที่ยัง guild-based แล้ว** — ที่คง `guild_id` คือ Discord/ACT artifact โดยตั้งใจ: `case_config` · `finance_config` · `cache_pple_event` · `dc_*` ทั้งหมด
