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

## 🎨 Brand Colors

| Token | Hex | ใช้งาน |
|---|---|---|
| `orange` | `#ff6a13` | Primary / CTA |
| `orange-light` | `#f37a2c` | Hover / Secondary orange |
| `navy` | `#002b49` | Background dark / Hero |
| `red-accent` | `#df492e` | Accent / Danger |
| `blue-light` | `#b5d1dc` | Muted / Border / Subtle |
| `white` | `#ffffff` | — |
| `black` | `#000000` | — |

---

## ℹ️ Preferences

- Confirm Q&A before writing code
- Ask directly (casual is fine)
- Code must be runnable / copy-paste friendly
- No over-engineering

## 📋 Import / Sync Scripts

**PRODUCTION: Always run with `sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/...'`**

Scripts ที่ loop upsert ข้อมูลจำนวนมากต้องมี:
- บอก total ก่อนเริ่ม เช่น `Fetched 500 members, upserting...`
- progress inline ทุก N records เช่น `\r  120/500 (2 errors)` (ใช้ `process.stdout.write`)
- สรุปตอนจบ เช่น `Done: 498 upserted, 2 errors`

## 🔐 Environment Variables (key names)

- `DISCORD_BOT_TOKEN` — bot login token
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` — OAuth
- `GUILD_ID` — Discord server ID (used by bot + web API)

## 🧪 Testing (web/)

```bash
cd web && npm test          # รันครั้งเดียว
cd web && npm run test:watch  # watch mode
```

- Test files: `web/lib/__tests__/*.test.js`
- ตอนนี้มี: `financeAccess.test.js` (48), `callingAccess.test.js` (37)
- **รัน `npm test` ก่อน commit ทุกครั้งที่แก้ไฟล์ใน `lib/financeAccess.js` หรือ `lib/callingAccess.js`**

---

## ⚠️ Known Gotchas

### Timezone bug — `updateTransaction` / `createTransaction`
`txn_at` ที่รับมาจาก form input เป็น local Thai time string (`"2026-04-19T23:20"`)  
**ห้ามแปลงผ่าน `new Date(txn_at).toISOString()`** — Node.js server ทำงานใน UTC จะทำให้เวลา +7 ชั่วโมงทุกครั้งที่ save  
ให้ pass `txn_at || null` ตรงๆ ให้ mysql2 จัดการเอง

### Debug mode — `discordId` เป็น null
เมื่อ Admin เปิด "View as role" cookie `debug_role` จะทำให้ทั้ง server (`getEffectiveIdentity`) และ client (`useEffectiveRoles`) คืน `discordId: null`  
→ ป้องกัน ownership bypass ใน debug mode  
→ role-based access ยังทำงานปกติ แค่ ownership หาย

---

## ⛔ Off-limits

- `.env` — ห้ามอ่านหรือแสดงค่า ยกเว้น key ที่ขึ้นต้นด้วย `DB_` (เช่น `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`) อนุญาตให้อ่านเพื่อ debug local ได้
