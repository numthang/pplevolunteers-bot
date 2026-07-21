# CUTOVER RUNBOOK — org-core → master

> เขียน 2026-07-21 · **อัปเดตล่าสุด 2026-07-21 (รอบ docs/cases/audit)** · branch `org-core` นำ `master` อยู่ **71 commit** · prod ยังไม่เคยเห็นโค้ดชุดนี้เลย
> งานทั้งชุด (identity split + org core + org-scope ครบทั้ง 4 ฟีเจอร์ **finance/calling/docs/cases** + audit + bot repoint) **ต้องลงพร้อมกัน** — ลงครึ่งเดียว = พัง
> ⚠️ ยังไม่เคยซ้อมกับ DB ที่มี state เหมือน prod จริง (localhost migrate ไปแล้ว) → ต้องรัน §0 ก่อนตัดสินใจ

---

## 0) PROBE — ดูก่อนว่า prod อยู่สถานะไหน (read-only, รันบนเครื่อง prod)

```bash
sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && psql "$DATABASE_URL" -c "
SELECT
  to_regclass(''public.dc_members'')       AS dc_members,
  to_regclass(''public._dc_members'')      AS _dc_members,
  to_regclass(''public.users'')            AS users,
  to_regclass(''public.org_members'')      AS org_members,
  to_regclass(''public.orgs'')             AS orgs,
  to_regclass(''public.organizations'')    AS organizations_old,
  to_regclass(''public.org_config'')       AS org_config,
  to_regclass(''public.org_roles'')        AS org_roles,
  to_regclass(''public.ngs_member_cache'') AS ngs_cache_old,
  to_regclass(''public.cache_pple_member'')AS cache_new;
"'
```

**คาดว่า prod จะได้:** `dc_members` มี · `users`/`org_members`/`orgs`/`org_config` = NULL · `ngs_member_cache` มี · `cache_pple_member` = NULL
→ ถ้าตรงตามนี้ = ต้องรันครบทั้ง 4 ไฟล์ตาม §2 · **ถ้าไม่ตรง หยุดก่อน** แล้วเทียบทีละไฟล์ว่าอันไหนเคยรันไปแล้ว

เช็คเพิ่ม (ต้องมีก่อน migrate):
```sql
SELECT guild_id, name, org_id FROM dc_guilds;   -- org_id ต้องไม่ NULL ทุกแถว (ไม่งั้น backfill org ไม่ได้)
SELECT count(*) FROM dc_members;                -- จำนวนตั้งต้น จดไว้เทียบหลัง migrate
```

---

## 1) BACKUP (บังคับ — identity-refactor เป็น DESTRUCTIVE)

```bash
sudo -u www bash -c 'pg_dump "$DATABASE_URL" -Fc -f /www/backup/pple_pre_orgcutover_$(date +%F_%H%M).dump'
```
กู้: `pg_restore -c -d "$DATABASE_URL" <ไฟล์>`

---

## 1.5) ⭐ ซ้อมกับ dump ของ prod — **ทำก่อนวันจริง อย่าข้าม**

> เลื่อนมาทำ "ตอนจะ deploy จริง" (user เคาะ 2026-07-21) · **ยังไม่เคยซ้อมเลยสักครั้ง = ความเสี่ยงอันดับ 1 ที่เหลืออยู่**
> localhost รัน migration ทีละไฟล์ค่อยเป็นค่อยไปตลอดสัปดาห์ → **ไม่ได้พิสูจน์ว่า 10 ขั้นรันรวดเดียวบน data จริงจะผ่าน**
> prod มีข้อมูลเยอะกว่ามาก + มี state ที่ localhost ไม่มี (คนที่ไม่เคยถูก dedup, แถวกำพร้า, ค่าที่ map ไม่ได้)
> ได้ของแถม: **ตัวเลขเวลา downtime จริง** ไปแจ้งทีมล่วงหน้า

```bash
# 1. ดึง dump จาก prod (ทำบนเครื่อง prod)
sudo -u www bash -c 'pg_dump "$DATABASE_URL" -Fc -f /www/backup/rehearsal_$(date +%F).dump'
#    แล้วก๊อปมาเครื่อง dev

# 2. สร้าง DB ซ้อมแยก (บนเครื่อง dev — ห้ามทับ pple_volunteers ที่ใช้อยู่)
createdb pple_rehearsal
pg_restore -d pple_rehearsal --no-owner --no-privileges rehearsal_YYYY-MM-DD.dump

# 3. รัน 10 ขั้นรวดเดียว จับเวลา (ON_ERROR_STOP = หยุดทันทีที่พัง จะได้รู้ว่าขั้นไหน)
time (
  for f in identity-refactor finance-org-scope cache-rename calling-org-scope \
           docs-org-scope docs-id-card-to-users docs-index-rename audit-org-scope; do
    echo "=== $f ==="
    psql -d pple_rehearsal -v ON_ERROR_STOP=1 -f scripts/migration/$f.sql || break
  done
  # ⚠️ #9 บล็อก PROD ของ cases (2 บรรทัด) — ต้องรันก่อน cases-org-scope
  psql -d pple_rehearsal -v ON_ERROR_STOP=1 -c "
    ALTER TABLE cases ADD COLUMN IF NOT EXISTS discord_guild_id VARCHAR(20);
    UPDATE cases SET discord_guild_id = guild_id WHERE discord_guild_id IS NULL;"
  psql -d pple_rehearsal -v ON_ERROR_STOP=1 -f scripts/migration/cases-org-scope.sql
)

# 4. เช็คจุดที่พังบ่อยบน data จริง (ทั้งหมดต้องได้ 0)
psql -d pple_rehearsal -c "
SELECT 'cases ที่มี thread แต่ไม่รู้ guild' t, count(*) FROM cases WHERE discord_thread_id IS NOT NULL AND discord_guild_id IS NULL
UNION ALL SELECT 'users ซ้ำ discord_id', count(*) FROM (SELECT discord_id FROM users WHERE discord_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) x
UNION ALL SELECT 'org_members กำพร้า',   count(*) FROM org_members om LEFT JOIN users u ON u.id=om.user_id WHERE u.id IS NULL
UNION ALL SELECT 'finance ไม่มี org',    count(*) FROM finance_transactions WHERE org_id IS NULL
UNION ALL SELECT 'calling ไม่มี org',    count(*) FROM calling_logs WHERE org_id IS NULL;"

# 5. ชี้เว็บ dev มาที่ DB ซ้อม แล้วกดใช้จริง (login → finance/calling/docs/cases)
#    เสร็จแล้วลบทิ้ง: dropdb pple_rehearsal
```

**ถ้าซ้อมพัง** = ดีแล้ว เจอบนของซ้อมดีกว่าเจอตอน prod ปิดอยู่ · แก้ migration แล้ว `dropdb && restore` ซ้อมใหม่ (ทำซ้ำได้ไม่จำกัด)

---

## 2) MIGRATION — ลำดับนี้เท่านั้น

| # | ไฟล์ | ทำอะไร | ทำไมต้องลำดับนี้ |
|---|---|---|---|
| 1 | `scripts/migration/identity-refactor.sql` | `dc_members` → `users` + `org_members` + `user_identities` · `organizations`→`orgs` · `org_config`/`org_roles`/`org_login_tokens` · rename `dc_members`→`_dc_members` | ทุกไฟล์ที่เหลืออ้าง `users.id` / `orgs.id` — ต้องมีก่อน |
| 2 | `scripts/migration/finance-org-scope.sql` | finance 4 ตาราง `guild_id`→`org_id`, `owner_id`/`updated_by`→`users.id` | ต้องมี `users`+`orgs` แล้ว |
| 3 | `scripts/migration/cache-rename.sql` | `ngs_member_cache`→`cache_pple_member` · `act_event_cache`→`cache_pple_event` | ไฟล์ถัดไปอ้างชื่อใหม่ |
| 4 | `scripts/migration/calling-org-scope.sql` | calling 5 ตาราง + roster `guild_id`→`org_id` · person→`users.id` | ต้องผ่าน #1 (users) และ #3 (ชื่อ cache ใหม่) |
| 5 | `scripts/migration/docs-org-scope.sql` | docs 3 ตาราง `guild_id`→`org_id` · person 6 คอลัมน์→`users.id` · rename `act_event_cache_id`→`cache_pple_event_id` | ต้องผ่าน #1 (users) และ #3 (ชื่อ cache ใหม่) |
| 6 | `scripts/migration/docs-id-card-to-users.sql` | ย้ายสำเนาบัตร `org_members.id_card_image` → `users` (1 คน 1 ใบ) แล้ว DROP คอลัมน์เดิม | ต้องผ่าน #5 |
| 7 | `scripts/migration/docs-index-rename.sql` | rename index/constraint 4 ตัวที่ชื่อยังเป็น `guild`/`discord_id` | ต้องผ่าน #5 (ไม่งั้นหาชื่อเก่าไม่เจอ) |
| 8 | `scripts/migration/audit-org-scope.sql` | `audit_logs` `guild_id`→`org_id` · `actor_id`→`users.id` | ต้องผ่าน #1 |
| **9** | ⚠️ **บล็อก PROD ใน `cases-discord-guild-artifact.sql`** (ท้ายไฟล์ — 2 บรรทัด) | เพิ่ม `cases.discord_guild_id` แล้ว **copy ค่าจาก `guild_id` เดิม** | **ต้องรันก่อน #10 เท่านั้น** — ดูอันตรายข้างล่าง |
| 10 | `scripts/migration/cases-org-scope.sql` | cases 5 ตาราง `guild_id`→`org_id` · `created_by` + assignee→`users.id` | ต้องผ่าน #1 และ **#9** |

รันทีละไฟล์ ดู verify block ท้ายไฟล์ทุกครั้งก่อนไปตัวถัดไป:
```bash
sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/identity-refactor.sql'
```

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
4. รัน migration §2 ครบทั้ง 10 ขั้น **ตามลำดับเป๊ะๆ** (ห้ามสลับ #9/#10)
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
- [ ] **ซ้อม migration ทั้ง 10 ขั้นกับ dump ของ prod → ดูขั้นตอนพร้อมคำสั่งที่ [§1.5](#15--ซ้อมกับ-dump-ของ-prod--ทำก่อนวันจริง-อย่าข้าม)** ← เสี่ยงสุดที่เหลือ · user เคาะให้ทำ "ตอนจะ deploy จริง" (2026-07-21)
- [ ] เพิ่มขั้น **stop bot ก่อน migrate** ใน `deploy.sh --production`
- [ ] `scripts/data/backfill-intro-*.js` + `scripts/social/x-get-token.js` ยังอ้าง `dc_members` (one-off ที่รันไปแล้ว/ตายแล้ว — ตัดสินใจว่าจะแก้หรือลบ)
- [ ] RBAC: คน login email ของ org ที่**ไม่มี guild** ยังเปิด `/finance` ไม่ได้ (ตั้งใจ — เปิดตอน endgame) · ส่วน email member ของ org ที่**มี guild** แก้แล้ว (bug-034)

**✅ เคลียร์แล้วตั้งแต่เขียน runbook รอบแรก:**
- ~~docs ยัง guild-scoped~~ → docs → org เสร็จ 2026-07-21 (migration #5–#7)
- cases → org เสร็จ 2026-07-21 (#9–#10) · audit_logs → org เสร็จ (#8)
- **ไม่เหลือ tenant data ที่ยัง guild-based แล้ว** — ที่คง `guild_id` คือ Discord/ACT artifact โดยตั้งใจ: `case_config` · `finance_config` · `cache_pple_event` · `dc_*` ทั้งหมด
