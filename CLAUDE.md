# pple-volunteers

## Stack & Paths
- **Bot:** Node.js + discord.js v14 — `/home/tee/VSites/node/pple-volunteers/`
- **Web:** Node.js + Next.js (App Router) — `/home/tee/VSites/node/pple-volunteers/web/`
- **Database:** MySQL `pple_volunteers` (host: localhost, user: pple_dcbot)
- **Auth (web):** Discord OAuth via next-auth
- **Search:** Meilisearch (binary: `/usr/local/bin/meilisearch`, data: `data.ms/`)

## Project Structure
```
pple-volunteers/
  index.js          ← Discord Bot entry point
  deploy-commands.js
  deploy.sh
  commands/         slash commands
  handlers/         interaction handlers (buttons, selects, modals)
  components/       reusable embed builders
  db/               database access functions (index.js = pool)
  config/           constants, roles, hints, orgchart
  utils/            activity tracker, orgchart generator
  services/         external services (meilisearch, emailPoller, forumIndexer, parsers/)
  scripts/          one-off scripts (backfill, migration)
  logs/             log files
  backups/          SQL backups
  memory/           Claude memory files
  web/              Next.js web app
    app/            App Router (pages + API routes)
    components/     React components
    db/             database access functions
    lib/            auth, roles, financeAccess helpers
```

---

## Production VPS

- **ทุก command ต้องรัน `sudo -u www` เสมอ**
  ```bash
  sudo -u www node scripts/xxx.js
  sudo -u www npm run build
  ```
- **Git branch:** `master` (ไม่ใช่ `main`)
- **Production path:** `/www/wwwroot/pple-volunteers/`
- **PM2:**
  ```bash
  pm2 show pple-dcbot            # Discord Bot
  pm2 show pple-web              # Next.js Web
  pm2 logs pple-dcbot --lines 20
  pm2 logs pple-web --lines 20
  ```
- **nohup (ถ้าจำเป็น):**
  ```bash
  sudo -u www bash -c 'nohup node scripts/xxx.js > /www/wwwroot/pple-volunteers/logs/xxx.log 2>&1 &'
  ```
  ต้องใช้ `bash -c '...'` เพื่อให้ redirect `>` รันด้วย `www`

## Deploy
```bash
# Bot + Web (local)
./deploy.sh                      # deploy commands local
./deploy.sh 'commit message'     # git push + deploy commands local

# Bot + Web (production)
./deploy.sh --production         # full production deploy
./deploy.sh --production --guild <guildId>

# Manual
node deploy-commands.js          # deploy guild slash commands
node deploy-commands.js --guild <guildId>

# Web only
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

### DB Tables — Finance
```
finance_accounts, finance_transactions, finance_categories
finance_account_rules, finance_config
```

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
- **`interaction.options.getChannel()` คืน partial object** → ต้องใช้ `guild.channels.cache.get(id)` เสมอ
- **customId limit 100 chars** — อย่า encode Thai text ลง customId, ใช้ embed title แทน

## Key Commands
| Command | File |
|---|---|
| `/panel` | `commands/panel.js` |
| `/register` | `commands/register.js` |
| `/stat-*` / `/stat` | `commands/stat.js` |
| `/user` | `commands/user.js` |
| `/orgchart` | `commands/orgchart.js` |
| `/forum` | `commands/forum.js` |
| `/rate` | `commands/rate.js` |
| `/record` | `commands/record.js` |
| `/sticky` | `commands/sticky.js` |

## Key Handlers
| File | Triggered by |
|---|---|
| `forumSearch.js` | `forum_search` button, modal submit, result pagination |
| `forumDashboard.js` | `forum_refresh_{channelId}` button |
| `financeDashboard.js` | finance buttons |
| `openInterest.js` | `btn_open_interest` |
| `openProvince.js` | `btn_open_province` |
| `rateStars.js` | rate star buttons |
| `ratingPage.js` | rating pagination |
| `statHandler.js` | stat pagination |

---

## Forum System

### Architecture
- **`dc_forum_config`** — config per forum channel (guild_id, channel_id, dashboard_msg_id, items_per_page)
- **`dc_forum_posts`** — index of posts (post_id = thread id, post_name, post_url, content snippets)
- **dashboard_msg_id** = thread ID ของ pinned dashboard thread (ไม่ใช่ message id)
- dashboard embed อยู่ใน starter message ของ thread นั้น

### Search (Hybrid)
```
hybridSearch(keyword, guildId, channelId, sort)
  → Promise.all([MySQL LIKE post_name, Meilisearch full-text])
  → merge + dedupe by post_id
  → filter null post_name
  → sort: both-match first, then newest
  → fallback to MySQL-only ถ้า Meilisearch ไม่พร้อม
```

### Setup
```bash
# Backfill existing threads
node scripts/backfill-forum.js               # ทุก forum channel
node scripts/backfill-forum.js --channel ID  # channel เดียว
```

### Meilisearch
- Binary: `/usr/local/bin/meilisearch`
- DB path: `data.ms/`
- env: `MEILISEARCH_HOST`, `MEILISEARCH_KEY`
- fallback ไป MySQL LIKE อัตโนมัติถ้าไม่ได้รัน

---

## Finance — Bot Side

### emailPoller (`services/emailPoller.js`)
```
IMAP polling ทุก 1 นาที
  → parse email ธนาคาร (Regex แยกต่อธนาคาร, อยู่ใน services/parsers/)
  → match account จากเลขบัญชีใน email
  → บันทึกลง finance_transactions
  → เช็ก finance_account_rules
      รู้จัก → ใช้ category เดิม
      ไม่รู้จัก → mention เหรัญญิกใน thread
  → update dashboard embed
```

### financeOCR (TBD)
```
user ส่ง slip รูปใน Discord
  → Tesseract.js อ่าน
  → parse: ref_id + บันทึกช่วยจำ + เลขบัญชี
  → match account จากเลขบัญชี
  → validate ref_id → update category/note
```

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
