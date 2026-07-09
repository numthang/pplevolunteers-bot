# Discord Bot — Setup & Architecture

Node.js + discord.js v14 bot, handles commands, handlers, external services.

---

## Quick Start

```bash
# Local setup
npm install
node index.js

# Deploy commands (local)
node deploy-commands.js
./deploy.sh 'commit message'

# Deploy commands (guild-specific)
node deploy-commands.js --guild <guildId>
```

---

## Project Structure

```
index.js                   ← Entry point
deploy-commands.js         ← Register slash commands
deploy.sh                  ← Deploy script

commands/                  Slash commands
  panel.js
  register.js
  stat.js
  user.js
  orgchart.js
  forum.js
  rate.js
  record.js
  sticky.js

handlers/                  Interaction handlers
  forumSearch.js           Forum search & pagination
  forumDashboard.js        Forum dashboard refresh
  financeDashboard.js      Finance panel buttons
  openInterest.js          Interest panel
  openProvince.js          Province panel
  rateStars.js             Rating stars
  ratingPage.js            Rating pagination
  statHandler.js           Stat pagination

components/                Embed builders (reusable)
db/                        Database functions
  index.js                 MySQL pool
  members.js
  activity.js
  forum.js
  finance.js
  etc.

config/                    Constants & configs
  roles.js                 Role hierarchy
  hints.js                 Help hints
  orgchart.js              Org structure

utils/                     Utilities
  activityTracker.js       Track user activity
  orgchartGenerator.js     Generate org chart

services/                  External services
  emailPoller.js           IMAP polling for bank emails
  forumIndexer.js          Forum post indexing
  meilisearch.js           Search integration
  parsers/                 Email parsers per bank

scripts/                   One-off scripts
  backfill-forum.js        Index existing threads
  backfill-calling.js      Import calling system
  migration.js             DB migrations

logs/                      Log files
backups/                   SQL backups
```

---

## Discord.js Conventions

- **`MessageFlags.Ephemeral`** instead of `{ ephemeral: true }`
  ```js
  await interaction.reply({ content: 'text', flags: MessageFlags.Ephemeral });
  ```
- **Threads:** always use `parentId`
  ```js
  const channelId = channel.isThread() ? (channel.parentId ?? channel.id) : channel.id
  ```
- **Command names** use hyphens: `stat-server`, `panel-finance`
- **Command-first principle** — every button must have a backing slash command
- **`customId` max 100 chars** — don't encode Thai text; use embed title instead
- **`interaction.options.getChannel()`** returns partial → use `guild.channels.cache.get(id)`

### Discord mention syntax
```
<#CHANNEL_ID>   channel
<@USER_ID>      user
<@&ROLE_ID>     role
```

### Role Hierarchy
```
Admin / เลขาธิการ          → Full permissions
รองเลขาธิการ               → Central-level
ผู้ประสานงานภาค            → Regional-level
ผู้ประสานงานจังหวัด        → Province-level
กรรมการจังหวัด             → Province-level
เหรัญญิก                   → Finance permissions (scoped by role)
```

Role maps: `PROVINCE_ROLES`, `SUB_REGION_ROLES`, `MAIN_REGION_ROLES` in `config/roles.js`

### Score Formula
```
score = messages × 10 + voiceSeconds + mentions × 30
```

---

## Database Tables (Bot)

👉 See [md/DATABASE.md](DATABASE.md) for schema

```
dc_members             Users & metadata
dc_activity_daily      Daily activity scores
dc_activity_mentions   Mention tracking
dc_ratings             User ratings
dc_reports             Reports/feedback
dc_settings            Guild settings
dc_orgchart_config     Organization structure
dc_forum_posts         Forum post index
dc_forum_config        Forum per-channel config
dc_calling_*           Calling system tables
```

---

## External Services

### Email Poller (`services/emailPoller.js`)

```
IMAP polling every 1 minute
  → Parse bank emails (Regex per bank in services/parsers/)
  → Match account by account number
  → Save to finance_transactions
  → Check finance_account_rules
      Known pattern  → Use existing category
      Unknown       → Mention treasurer in thread
  → Update dashboard embed
```

### Forum Indexer (`services/forumIndexer.js`)

```
Index Discord threads in forum channels
  → Store in dc_forum_posts (post_id = thread id)
  → Push to Meilisearch for full-text search
  → Hybrid search: MySQL LIKE + Meilisearch
  → Fallback to MySQL if Meilisearch unavailable
```

### Meilisearch

- Binary: `/usr/local/bin/meilisearch`
- DB path: `data.ms/`
- Environment: `MEILISEARCH_HOST`, `MEILISEARCH_KEY`
- Auto-fallback to MySQL LIKE if not running

---

## Forum System

### Architecture

- **`dc_forum_config`** — per-channel config (guild_id, channel_id, dashboard_msg_id, items_per_page)
- **`dc_forum_posts`** — post index (post_id = thread id, post_name, post_url, snippets)
- **dashboard_msg_id** = Thread ID of pinned dashboard thread (not message ID)
- Dashboard embed in starter message of that thread

### Hybrid Search

```
hybridSearch(keyword, guildId, channelId, sort)
  → Promise.all([MySQL LIKE post_name, Meilisearch full-text])
  → Merge + dedupe by post_id
  → Filter null post_name
  → Sort: both-match first, then newest
  → Fallback to MySQL-only if Meilisearch unavailable
```

### Setup

```bash
# Backfill existing threads
node scripts/backfill-forum.js               # All forum channels
node scripts/backfill-forum.js --channel ID  # Single channel
```

---

## Calling System

👉 See [md/CALLING.md](CALLING.md)

IMAP-based incoming call system with 35 campaigns, 1,156+ logs.

---

## Common Patterns

### Get Channel (always use cache)

```js
const channel = interaction.guild.channels.cache.get(channelId);
if (!channel) return;

// For threads, get parent
const parentId = channel.isThread() ? (channel.parentId ?? channel.id) : channel.id;
```

### Get User Roles

```js
const member = await interaction.guild.members.fetch(userId);
const hasRole = member.roles.cache.has(roleId);
```

### Ephemeral Reply

```js
await interaction.reply({
  content: 'Private message',
  flags: MessageFlags.Ephemeral
});
```

### Database Query

```js
const pool = require('./db');
const [rows] = await pool.query(
  'SELECT * FROM dc_members WHERE guild_id = ? LIMIT 10',
  [guildId]
);
```

---

## Debugging

```bash
# View bot logs
pm2 logs pple-dcbot --lines 50

# Check if bot is running
pm2 show pple-dcbot

# Restart bot
pm2 restart pple-dcbot
```

---

## Social Posting (Basket → FB/IG/Threads/X)

### Architecture
- Basket UI ผูกกับ Discord context menu ("🧺 หยิบลงตะกร้าสื่อ", "ดูตะกร้า")
- State เก็บใน `dc_server_settings` key `basket_state_<channelId>` (column `setting_value` เป็น **JSON type** — ดู Known Gotcha)
- ประวัติเก็บใน `dc_basket_history`

### Group System (multi-account ต่อ guild)
- `dc_social_accounts.group_name VARCHAR(100)` — แต่ละ account ใส่ชื่อกลุ่ม เช่น "ปชช.ราชบุรี" / "Unnop ส่วนตัว"
- Basket Row 1 (group select) ดึงจาก `getAvailableGroups(guildId, userId)` filter visibility + user_discord_id
- Default = กลุ่มแรกที่ user เห็น
- Row 2 multi-select platform → state.platforms `[]`
- ตอนโพสต์: `getConfig(guildId, platform, userId, group)` filter ตามกลุ่ม → ได้ account ที่ถูกต้อง

### X (Twitter) Posting Rules
- **Thread split** — caption > 280 → ตัดที่ขอบคำ (word boundary) เป็น thread max 4 tweets, ใส่ `i/n` indicator
- **URL strip** — `https?://\S+` ใน caption → ย้ายไป reply tweet สุดท้ายเป็น `🔗 ลิงก์:\n<urls>` (กัน reach penalty + URL tax)
- รูปสูงสุด 4 ต่อ tweet, ติด **tweet แรกของ thread เท่านั้น**
- ถ้า caption เป็น URL ล้วน → tweet เดียวพร้อมรูป + URLs ในเดียวกัน
- X Premium account โพสต์ยาว 25k chars ก็จริง — แต่ algorithm ยัง collapse "Show more" → thread ดีกว่า

### Platform Scheduling Support
| Platform | API รองรับตั้งเวลา |
|---|---|
| FB | ✅ ส่ง `scheduled_publish_time` + `published=false` |
| IG | ❌ Meta whitelist only — ระบบโพสต์ทันที + แจ้ง user |
| Threads | ❌ ยังไม่มีใน Threads API |
| X | ❌ Free/Basic tier ไม่มี — ต้อง custom scheduler ฝั่งเรา |

### Discord Component Routing
- ต้องเพิ่ม customId ใหม่ใน `index.js` (whitelist routing) เช่น `basket_group`, `basket_platform`
- ถ้าลืม → interaction fail แบบเงียบ (ไม่มี handler ตอบใน 3 วินาที)

---

## Anti-Spam System (Quarantine + Honeypot)

> ที่มา: แทน Wick quarantine (ถอด role หมด งงตั้งค่า) — design เต็มใน [md/PENDING.md](../PENDING.md) section "🛡️ Anti-Spam"

### Threat model
เคสจริงที่เจอเกือบทั้งหมด = **account สมาชิกโดนแฮคมายิงสแปม** ไม่ใช่ bot join ใหม่ — honeypot จับเคสนี้ไม่ได้ (สมาชิกโดน deny มองไม่เห็นห้อง) จึงมี 3 signal คนละบทบาท:

| Signal | จับอะไร | Threshold |
|---|---|---|
| **Duplicate ข้ามห้อง** (ตัวหลัก) | account โดนแฮค ยิงข้อความเดิมหลายห้อง | content เหมือนเป๊ะ ≥3 ห้อง ภายใน 30s (exact match ไม่ fuzzy) |
| **Mass-mention** | สคริปต์แฮคยิง mention รัว | mention users+roles รวม ≥10 ในข้อความเดียว |
| **Honeypot channel** | self-bot / staff ที่มี `Administrator` โดนแฮค | โพสต์ในห้องที่ตั้งเป็น honeypot |

### Action เมื่อ trigger
ติด **Quarantine role** (ไม่ถอดยศอื่น) + ลบข้อความ (duplicate = ลบทุกห้องที่ match) + แจ้งห้อง mod → mod ตัดสินเอง (ปลด role คืนถ้าโดนแฮค กู้แล้ว / ban ถ้าเป็นบอทจริง)

- **Staff exempt** — สมาชิกที่มี `ManageMessages` ขึ้นไป ไม่ auto-quarantine จาก mass-mention/duplicate (กันเคสมือจริงประกาศงาน mention เยอะ/โพสต์ซ้ำหลายห้อง) — แค่แจ้ง mod เฉยๆ
  - **honeypot ไม่มี staff-exempt** (แก้ 2026-07-09) — `Administrator` bypass ViewChannel/SendMessages deny ทุกที่อยู่แล้ว ถ้า exempt ด้วยจะเท่ากับ honeypot จับ hacked-Admin ไม่ได้เลย ซึ่งเป็นเคสหลักที่ตั้งใจจับ (case 2 ในหัวข้อ threat model)
- **Quarantine role ทำงานได้โดยไม่ถอดยศ** เพราะมี deny `SendMessages` overwrite ติดทุก category/channel อยู่แล้ว (setup มือ) — allow-ชนะ-deny ระดับ role ไม่ทำให้พัง เพราะห้องอื่นไม่มี explicit allow `SendMessages` ให้ role สมาชิก (มีแค่ allow `ViewChannel`)
- **Honeypot permission ต้องห้าม deny @everyone** — deny ViewChannel ให้ `member_role_id` (role ที่ติดอัตโนมัติตอน verify ผ่าน `registerHandler.js`/`verifyHandler.js` — ครอบสมาชิกจริงทุกคนแน่นอน ต่างจาก interest/skill/province ที่เลือกหรือไม่เลือกก็ได้) ไม่งั้น bot/account ที่เพิ่ง join จะมองไม่เห็นห้องไปด้วย (กับดักไร้ค่า)

### Files
```
services/antiSpamCache.js    In-memory guild config cache (honeypotChannelId, quarantineRoleId, modChannelId)
                              populate ตอน clientReady, อัปเดตตอน /server antispam set (pattern เดียวกับ forumCache.js)
handlers/antiSpamHandler.js  handleAntiSpam(message) — เช็ค 3 signal, staff-exempt, consolidate เป็น 1 action/ข้อความ
                              duplicate cache: {channelId, messageId, content, timestamp} ต่อ user, prune 30s + sweep ทุก 5 นาที
commands/server.js           /server antispam set/view/clear — เก็บ dc_guild_config
                              keys: antispam_honeypot_channel_id, antispam_quarantine_role_id, antispam_mod_channel_id
```

Wire เข้า `messageCreate` (index.js) เป็นจุดแรกสุด — ถ้ามี action ให้ `return` ทันที กัน forum-index/search/RAG ประมวลผลข้อความที่กำลังจะถูกลบ

### Setup (ต่อ guild)
1. สร้างห้อง honeypot มือ (แค่สร้าง+ตั้งชื่อ ไม่ต้องตั้ง permission เอง) — bot ไม่ auto-create ห้อง
2. Quarantine role ต้องมี deny `SendMessages`+`ViewChannel` ทุก category อยู่แล้ว + position สูงกว่า Admin (ต่ำกว่า bot)
3. ตั้ง `member_role` ไว้ก่อนที่ `/panel register` (ถ้ายังไม่มี) — honeypot permission auto-apply ต้องใช้ค่านี้
4. `/server antispam set honeypot_channel:<#ch> quarantine_role:<@&role> mod_channel:<#ch>` — **auto deny ViewChannel ให้ `member_role_id` ในห้อง honeypot ให้เลย** + เตือนถ้า @everyone โดน deny อยู่ (ต้องแก้เองให้ @everyone เห็นห้องได้)
   - `honeypot_channel` กับ `mod_channel` **ห้ามเป็นห้องเดียวกัน** — command reject ให้เลยถ้าตั้งซ้ำ (honeypot ห้ามมีใครพิมพ์ได้แม้ mod ไม่งั้น mod ตอบ alert ในห้องเดียวกันจะโดน auto-quarantine ตัวเอง — honeypot ไม่มี staff-exempt)

### สถานะ (2026-07-09)
Code เสร็จ + mock smoke test ผ่าน (7 เคส) — ยังไม่ deploy command จริง / ยังไม่ทดสอบใน Discord จริง

---

## Known Gotcha

### `dc_server_settings.setting_value` เป็น JSON column type
- mysql2 driver **auto-parse JSON column เป็น JS object** ไม่ใช่ string
- **ห้าม `JSON.parse()` ซ้ำ** กับค่าที่ getSetting คืน — จะ throw `"[object Object]" is not valid JSON`
- ในตอน setSetting ปัจจุบันยังทำ `JSON.stringify` ก่อนเก็บ (redundant แต่ไม่เสียหาย)
- ระยะยาวควรเลิก stringify ใน `db/settings.js` — แต่ต้องตามแก้ caller ทุกที่ที่อาจ parse ซ้ำ

### Silent error suppression ใน basketHandler
- เก่ามี `.catch(() => {})` หลายจุด → error เงียบ debug ยาก
- ใหม่ใช้ `.catch(e => console.error('[label]', e))` แทน
- ถ้าจะเพิ่ม async ใน basket flow ให้ log error เสมอ

---

## Deployment

👉 See [md/DEPLOYMENT.md](DEPLOYMENT.md) for production VPS setup
