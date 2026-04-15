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

👉 See [md/DISCORD.md](DISCORD.md) for detailed conventions

Key points:
- `MessageFlags.Ephemeral` not `{ ephemeral: true }`
- Threads: always use `parentId`
- Commands use hyphens (`stat-server`)
- Command-first principle (buttons need slash command)
- `customId` max 100 chars — don't encode Thai text

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

## Deployment

👉 See [md/DEPLOYMENT.md](DEPLOYMENT.md) for production VPS setup
