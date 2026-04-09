# pple-volunteers

## Stack & Paths
- **Bot:** Node.js + discord.js v14 — `/home/tee/VSites/node/pple-volunteers/`
- **Web:** Node.js + Next.js (App Router) — `/home/tee/VSites/node/pple-volunteers/web/`
- **Database:** MySQL `pple_volunteers` (host: localhost, user: pple_dcbot)
- **Auth (web):** Discord OAuth via next-auth

## Project Structure
```
pple-volunteers/
  index.js          ← Discord Bot entry point
  commands/         slash commands
  handlers/         interaction handlers (buttons, selects, modals)
  components/       reusable embed builders
  db/               database access functions (index.js = pool)
  config/           constants, roles, hints, orgchart
  utils/            activity tracker, orgchart generator
  services/         external services (meilisearch, emailPoller, financeOCR)
  scripts/          one-off scripts (backfill, migration)
  logs/             log files
  backups/          SQL backups
  web/              Next.js web app
    app/            App Router (pages + API routes)
    components/     React components
    db/             database access functions
    lib/            auth, roles helpers
```

---

## Production VPS

- **ทุก command ต้องรัน `sudo -u www` เสมอ**
  ```bash
  sudo -u www node scripts/xxx.js
  sudo -u www npm run build
  ```
- **Git branch:** `master` (ไม่ใช่ `main`)
- **PM2:**
  ```bash
  pm2 show pple-bot              # Discord Bot
  pm2 show pple-web              # Next.js Web
  pm2 logs pple-web --lines 20
  ```
- **nohup (ถ้าจำเป็น):**
  ```bash
  sudo -u www bash -c 'nohup node scripts/xxx.js > /home/tee/VSites/node/pple-volunteers/logs/xxx.log 2>&1 &'
  ```
  ต้องใช้ `bash -c '...'` เพื่อให้ redirect `>` รันด้วย `www`

## Deploy
```bash
# Bot
./deploy.sh                      # local
./deploy.sh 'commit message'     # git push + local
./deploy.sh --production         # production
node deploy-commands.js          # deploy guild slash commands

# Web
cd web
sudo -u www npm run build
pm2 restart pple-web
```

---

## Database

### Table Prefixes
```
dc_       → Discord bot tables (members, activity, settings ฯลฯ)
finance_  → Finance system tables
```

### Conventions
- **ทุก table มี `guild_id` (VARCHAR 20)** รองรับ multi-server
- **อย่าใช้ `LIMIT ?`** ใน prepared statement → ใช้ `LIMIT ${n}` แทน
- **อย่า assume column names** → ดูไฟล์ใน `db/` ก่อนเสมอ

### DB Tables — Bot
```
dc_members, dc_ratings, dc_reports, dc_settings
dc_activity_daily, dc_activity_mentions
dc_orgchart_config
dc_forum_posts, dc_forum_config
```

Score formula: `score = messages × 10 + voiceSeconds + mentions × 30`

---

## Role Hierarchy (`config/roles.js`)

```
ROLES['Admin']               → สิทธิ์สูงสุด ทุกอย่าง
ROLES['รองเลขาธิการ']        → ระดับส่วนกลาง
ROLES['ผู้ประสานงานภาค']     → ระดับภาค
ROLES['ผู้ประสานงานจังหวัด'] → ระดับจังหวัด
ROLES['กรรมการจังหวัด']      → ระดับจังหวัด
ROLES['เหรัญญิก']            → สิทธิ์แก้ไขการเงิน (scope ตาม role จังหวัด/ภาค)
```

Role Maps: `PROVINCE_ROLES`, `SUB_REGION_ROLES`, `MAIN_REGION_ROLES`

### Finance Access Control
```
เหรัญญิก + ทีมจังหวัด  → แก้ไขได้ทุกบัญชีของจังหวัดนั้น
เหรัญญิก + ทีมภาค     → แก้ไขได้ทุกบัญชีในภาคนั้น
เหรัญญิก + Admin      → แก้ไขได้ทั้งหมด
private account       → เจ้าของคนเดียวเท่านั้น
```

---

## Discord.js Conventions

- **`MessageFlags.Ephemeral`** แทน `{ ephemeral: true }`
- **Thread → ใช้ `parentId` เสมอ**
  ```js
  const channelId = channel.isThread() ? (channel.parentId ?? channel.id) : channel.id
  ```
- **Discord mention syntax:** `<#CHANNEL_ID>` / `<@USER_ID>` / `<@&ROLE_ID>`
- **Command names ใช้ hyphen เสมอ** เช่น `stat-server`, `panel-finance`
- **Command-first principle** — ทุก GUI button ต้องมี slash command รองรับ
- **ถามก่อนเสมอว่า default ephemeral หรือ public** แล้วใส่ `public` Boolean option

## Key Commands
| Command | File |
|---|---|
| `/panel` | `commands/panel.js` |
| `/register` | `commands/register.js` |
| `/stat-*` | `commands/stat-*.js` |
| `/orgchart` | `commands/orgchart.js` |
| `/forum` | `commands/forum.js` |

## Key Handlers
| File | Triggered by |
|---|---|
| `openInterest.js` | btn_open_interest |
| `openProvince.js` | btn_open_province |
| `forumSearch.js` | forum_search |
| `forumDashboard.js` | forum_refresh |

---

## Finance — Bot Side

### emailPoller (`services/emailPoller.js`)
```
IMAP polling ทุก 1 นาที
  → parse email ธนาคาร (Regex แยกต่อธนาคาร)
  → match account จากเลขบัญชีใน email
  → บันทึกลง finance_transactions
  → เช็ก finance_account_rules
      รู้จัก → ใช้ category เดิม
      ไม่รู้จัก → mention เหรัญญิกใน thread
  → update dashboard embed
```

### financeOCR (`services/financeOCR.js`)
```
user ส่ง slip รูปใน Discord
  → Tesseract.js อ่าน
  → parse: ref_id + บันทึกช่วยจำ + เลขบัญชี
  → match account จากเลขบัญชี
  → validate ref_id → update category/note
```

### `/panel finance`
```
pattern เดียวกับ /panel forum
  → สร้าง thread "บัญชีรายรับ-รายจ่าย"
  → ส่ง starter message เป็น dashboard embed (ยอดคงเหลือ / รายรับ / รายจ่าย)
  → บันทึกลง finance_config
```

### Files ที่ต้องสร้าง/แก้ (bot side)
```
commands/panel.js             แก้ → เพิ่ม subcommand 'finance'
db/finance.js                 สร้างใหม่
handlers/financeHandler.js    สร้างใหม่
services/emailPoller.js       สร้างใหม่
services/financeOCR.js        สร้างใหม่
scripts/migration-finance.sql สร้างใหม่
```

---

## Meilisearch
- Binary: `/usr/local/bin/meilisearch`
- DB path: `/home/tee/VSites/node/pple-volunteers/data.ms/`
- env: `MEILISEARCH_HOST`, `MEILISEARCH_KEY`
- **fallback ไป MySQL LIKE อัตโนมัติ** ถ้าไม่ได้รัน

---

## Future Integration
```
people360  → ระบบติดต่อสมาชิกพรรค
ACT        → ระบบกิจกรรมสมาชิกพรรค
```
user identity: `discord_id` (primary) · `member_id` (เลขสมาชิกพรรค ใน dc_members) · `phone` · `line_id` · `google_id` · `act_id`

---

## Preferences
- ยืนยัน Q&A ก่อนเขียน code เสมอ
- ถามตรงๆ ได้ ไม่ต้อง formal
- Code ต้องเป็น runnable / copy-paste friendly
- ไม่ over-engineer

## Off-limits
- `.env` อย่าอ่านหรือแสดงค่า
