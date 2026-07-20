# CUTOVER RUNBOOK — org-core → master

> เขียน 2026-07-21 · branch `org-core` นำ `master` อยู่ **59 commit** · prod ยังไม่เคยเห็นโค้ดชุดนี้เลย
> งานทั้งชุด (identity split + org core + finance/calling org-scope + bot repoint) **ต้องลงพร้อมกัน** — ลงครึ่งเดียว = พัง
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

## 2) MIGRATION — ลำดับนี้เท่านั้น

| # | ไฟล์ | ทำอะไร | ทำไมต้องลำดับนี้ |
|---|---|---|---|
| 1 | `scripts/migration/identity-refactor.sql` | `dc_members` → `users` + `org_members` + `user_identities` · `organizations`→`orgs` · `org_config`/`org_roles`/`org_login_tokens` · rename `dc_members`→`_dc_members` | ทุกไฟล์ที่เหลืออ้าง `users.id` / `orgs.id` — ต้องมีก่อน |
| 2 | `scripts/migration/finance-org-scope.sql` | finance 4 ตาราง `guild_id`→`org_id`, `owner_id`/`updated_by`→`users.id` | ต้องมี `users`+`orgs` แล้ว |
| 3 | `scripts/migration/cache-rename.sql` | `ngs_member_cache`→`cache_pple_member` · `act_event_cache`→`cache_pple_event` | ไฟล์ถัดไปอ้างชื่อใหม่ |
| 4 | `scripts/migration/calling-org-scope.sql` | calling 5 ตาราง + roster `guild_id`→`org_id` · person→`users.id` | ต้องผ่าน #1 (users) และ #3 (ชื่อ cache ใหม่) |

รันทีละไฟล์ ดู verify block ท้ายไฟล์ทุกครั้งก่อนไปตัวถัดไป:
```bash
sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/identity-refactor.sql'
```

### ⛔ อันตรายที่ต้องรู้
- **`identity-refactor.sql` = DROP + CREATE `users`/`org_members` แล้ว rebuild จาก `dc_members`** → อะไรที่ไม่ได้มาจาก `dc_members` (org ที่สร้างเอง, invite, สมัครด้วย email/Google, `web_roles` ที่ให้ผ่านเว็บ) **หายหมด**
  → prod รันได้ครั้งเดียวตอน cutover (prod ยังไม่มีข้อมูลพวกนี้) · **หลัง cutover ห้ามรันซ้ำเด็ดขาด** → ควร rename ไฟล์เป็น `*.applied.sql` ทันทีที่จบ
- `_dc_members` **อย่าเพิ่ง drop** — เป็น safety net จริง (2026-07-21 ใช้กู้ `member_id` ที่ถูกล้างมาแล้ว)
- `migration.sql` (ไฟล์สะสมเดิม 85KB) **พักอยู่** ระหว่างช่วงนี้ — ส่วน identity ในนั้นถูก supersede โดย `identity-refactor.sql` · กลับมาใช้ต่อหลัง cutover

---

## 3) DEPLOY CODE — ลำดับสำคัญ

```
1. pm2 stop pple-dcbot          ← หยุดบอทก่อน! บอทตัวเก่าเขียน dc_members ระหว่าง migrate = ข้อมูลหลุด
2. pm2 stop pple-web
3. git fetch && git reset --hard origin/master   (หลัง merge org-core→master แล้ว)
4. รัน migration §2 ทั้ง 4 ไฟล์
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

---

## 5) ROLLBACK

| สถานการณ์ | ทำ |
|---|---|
| migration พังกลางทาง | `pg_restore` จาก §1 (ไฟล์ #2/#3/#4 มี BEGIN/COMMIT ในตัว = อะตอมมิก · #1 ใหญ่กว่านั้น ใช้ backup ปลอดภัยกว่า) |
| migrate ผ่านแต่โค้ดพัง | `git reset --hard <commit เดิม>` + `pg_restore` — **ย้อนโค้ดอย่างเดียวไม่พอ** เพราะ schema เปลี่ยนไปแล้ว |
| อยากคืนแค่ `dc_members` | `ALTER TABLE _dc_members RENAME TO dc_members;` (โค้ดเก่าใช้ได้ทันที แต่ข้อมูลใหม่หลัง cutover จะไม่อยู่ในนั้น) |

---

## 6) ยังค้างก่อน cutover (blocker)

- [ ] เพิ่มขั้น **stop bot ก่อน migrate** ใน `deploy.sh --production`
- [ ] `scripts/data/backfill-intro-*.js` + `scripts/social/x-get-token.js` ยังอ้าง `dc_members` (one-off ที่รันไปแล้ว/ตายแล้ว — ตัดสินใจว่าจะแก้หรือลบ)
- [ ] docs ยัง guild-scoped → email user เปิดหน้าได้แต่ข้อมูลว่าง (ไม่ leak) — ยอมรับได้ชั่วคราว หรือรอ docs→org
- [ ] ซ้อม migration กับ DB ที่ restore จาก dump ของ prod จริงสักครั้ง (ตอนนี้ยังไม่เคยซ้อม — localhost migrate ไปก่อนแล้ว)
