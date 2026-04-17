# pple-volunteers — Global Documentation

Quick navigation to detailed docs for the entire pple-volunteers project (Bot + Web).

## 🚀 Quick Links

| Topic | File |
|---|---|
| **Bot Deployment & Setup** | [md/BOT.md](md/BOT.md) |
| **Web App (Next.js)** | [md/WEB.md](md/WEB.md) |
| **Discord.js Conventions** | [md/DISCORD.md](md/DISCORD.md) |
| **Database Schema** | [md/DATABASE.md](md/DATABASE.md) |
| **Finance System** | [md/FINANCE.md](md/FINANCE.md) |
| **Production Deployment** | [md/DEPLOYMENT.md](md/DEPLOYMENT.md) |
| **Calling System** | [md/CALLING.md](md/CALLING.md) |

---

## 📦 Project Overview

- **Bot:** Node.js + discord.js v14 — root directory
- **Web:** Node.js + Next.js (App Router) — `/web/`
- **Database:** MySQL `pple_volunteers` (host: localhost, user: pple_dcbot)
- **Auth:** Discord OAuth via next-auth
- **Search:** Meilisearch (binary: `/usr/local/bin/meilisearch`, data: `data.ms/`)

---

## 🔑 Key Conventions

- Git branch: `master` (production), local: `main` for PRs
- All production commands: `sudo -u www`
- Database: Every table has `guild_id` (VARCHAR 20) for multi-server support
- Discord.js: Use `MessageFlags.Ephemeral` not `{ ephemeral: true }`
- Code: runnable, copy-paste friendly, no over-engineering

---

## 📂 Directory Structure

```
pple-volunteers/
  index.js                 ← Bot entry point
  deploy-commands.js
  deploy.sh
  commands/                slash commands
  handlers/                interaction handlers
  components/              embed builders
  db/                      database functions
  config/                  constants, roles
  utils/                   activity tracker
  services/                external services
  scripts/                 one-off scripts
  logs/                    log files
  md/                      documentation
  web/                     Next.js app
    app/                   App Router
    components/            React components
    db/                    database functions
    lib/                   auth, roles, helpers
```

---

## ℹ️ Preferences

- Confirm Q&A before writing code
- Ask directly (casual is fine)
- Code must be runnable / copy-paste friendly
- No over-engineering

## 📋 Import / Sync Scripts

Scripts ที่ loop upsert ข้อมูลจำนวนมากต้องมี:
- บอก total ก่อนเริ่ม เช่น `Fetched 500 members, upserting...`
- progress inline ทุก N records เช่น `\r  120/500 (2 errors)` (ใช้ `process.stdout.write`)
- สรุปตอนจบ เช่น `Done: 498 upserted, 2 errors`

## 🔐 Environment Variables (key names)

- `DISCORD_BOT_TOKEN` — bot login token
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` — OAuth
- `GUILD_ID` — Discord server ID (used by bot + web API)

## ⛔ Off-limits

- `.env` — never read or display values
