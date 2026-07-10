# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.


# pple-volunteers — Global Documentation

Quick navigation to detailed docs for the entire pple-volunteers project (Bot + Web).

## 🚀 Quick Links

| Topic | File |
|---|---|
| **Discord Bot** | [md/discord/BOT.md](md/discord/BOT.md) |
| **Web App (Next.js)** | [md/WEB.md](md/WEB.md) |
| **Finance System** | [md/finance/FINANCE.md](md/finance/FINANCE.md) |
| **Calling System** | [md/calling/CALLING.md](md/calling/CALLING.md) |
| **Contacts (CRM)** | [md/calling/CONTACT.md](md/calling/CONTACT.md) |
| **Database Schema** | [md/DATABASE.md](md/DATABASE.md) |
| **Production Deployment** | [md/DEPLOYMENT.md](md/DEPLOYMENT.md) |
| **Case System** | [md/case/CASE.md](md/case/CASE.md) |
| **Server Wizard** | [md/discord/SERVER_WIZARD.md](md/discord/SERVER_WIZARD.md) |
| **RAG AI** | [md/discord/RAG.md](md/discord/RAG.md) |

---

## 📦 Project Overview

- **Bot:** Node.js + discord.js v14 — root directory
- **Web:** Node.js + Next.js (App Router) — `/web/`
- **Database:** PostgreSQL `pple_volunteers` (host: localhost, port 5432, user: pple_dcbot)
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
- **ก่อน implement ฟีเจอร์ใหม่หรือ refactor ทุกครั้ง — ให้รัน `/scrutinize` ก่อนเสมอ** อย่าลงมือเขียน code จนกว่าจะผ่านขั้นตอนนี้

## 📖 Required Reading Before Coding

**ทุกครั้งก่อนเขียนหรือแก้ code ใน `web/` ต้องอ่านก่อนเสมอ:**
1. `md/WEB.md` — CSS conventions, dark mode classes, component patterns
2. ไฟล์ sibling ในโฟลเดอร์เดียวกัน — เพื่อ match pattern ที่ใช้จริง

**⚠️ สร้าง component ใหม่ใน `web/` — ห้าม write โดยไม่อ่าน sibling ก่อน:**
- อ่านไฟล์อื่นในโฟลเดอร์เดียวกันอย่างน้อย 1 ไฟล์เพื่อ copy CSS class pattern ที่ถูกต้อง
- dark mode ต้องใช้ `dark:text-disc-text`, `dark:border-disc-border`, `dark:text-disc-muted`, `bg-card-bg` เท่านั้น — ห้ามใช้ `dark:bg-warm-dark-*` หรือ `dark:text-warm-*`

**ถ้าแก้ไฟล์ที่มี stats/query — ต้องอ่าน query เทียบกับ tab/type อื่นด้วยว่า return field ครบไหม**

## ⚡ Token / Model — Claude บริหารเอง (user ไม่ต้องสั่ง)

User มักอยู่ model แพง (Opus/Fable) และ**ไม่อยากสลับ /model เอง** — หน้าที่ Claude คือบริหาร token ให้อัตโนมัติทุก session โดยไม่ต้องรอ user สั่ง (user เคาะแล้ว 2026-07-09):

- **งาน mechanical ก้อนใหญ่** (migrate string i18n, refactor ตาม pattern เดิม, งานซ้ำหลายไฟล์) → **spawn subagent `model: sonnet` เอง** แล้วบอก user สั้นๆ ว่ากำลังส่งให้ subagent
- **ซอยเป็นก้อนเล็ก 2-3 ไฟล์ต่อ subagent** อย่าโยนทั้งโซนรวดเดียว (เคยชนเพดานโควต้า account 2026-07-09 — Sonnet ก็ดึงจากโควต้าเดียวกัน จึงประหยัด "ต่อ token" ไม่ใช่ "ไม่จำกัด")
- **งานคิด / ออกแบบ / ตรวจงาน subagent / debug** → ทำใน main thread เอง
- user เปลี่ยนเรื่องคุย → แนะนำ `/clear` · session ยาวมาก → เตือนว่า context เริ่มแพง ควรปิดจบเป็นเรื่องๆ
- ถ้า Claude ลืม/พลาด — user นัดไว้ว่าจะพิมพ์คำเดียว "sonnet" เป็นสัญญาณเตือน

## 🌍 i18n — โค้ดใหม่ห้าม hardcode ข้อความ

รางวางแล้ว (2026-07-09) — **string ที่ user เห็น ในโค้ดใหม่ทุกไฟล์ต้องผ่าน t() เสมอ** (ไฟล์เก่าที่แก้เล็กน้อยยังไม่บังคับ — จะทยอย migrate เป็นโซน):

- **เว็บ:** key ลง `web/locales/th.json` (+ `en.json`) · client: `useTranslations('ns')` · server: `await getTranslations('ns')` จาก `next-intl/server`
- **Bot:** key ลง `locales/th.json` (+ `en.json`) · `const t = await getT(guildId)` จาก `services/i18n.js` → `t('ns.key', { vars })`
- Key naming: `<โมดูล>.<จุดใช้>` เช่น `calling.logForm.saveButton` · ใช้ interpolation `{name}` ไม่ต่อ string เอง
- locale ต่อ guild: `dc_guild_config` key `locale` (ไม่มี = `th`)

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
ให้ pass `txn_at || null` ตรงๆ ให้ pg (node-postgres) จัดการเอง

### Calling — `contact_type` ใน SQL ต้องใส่เสมอ
`calling_logs`, `calling_assignments`, `calling_member_tiers` ใช้ `member_id` ร่วมกันทั้ง member และ contact  
`ngs_member_cache.source_id` เริ่มจาก **55** แต่ `calling_contacts.id` เริ่มจาก **1** → overlap เมื่อมี contact ≥ 55 ตัว  
→ ทุก JOIN หรือ WHERE บนตาราง shared ต้องใส่ `AND contact_type = 'member'` หรือ `'contact'` เสมอ  
→ DB functions ทุกตัวใน `db/calling/` มี default `contactType = 'member'` แล้ว ไม่ต้องส่งถ้าเป็น member flow

### Debug mode — `discordId` เป็น null
เมื่อ Admin เปิด "View as role" cookie `debug_role` จะทำให้ทั้ง server (`getEffectiveIdentity`) และ client (`useEffectiveRoles`) คืน `discordId: null`  
→ ป้องกัน ownership bypass ใน debug mode  
→ role-based access ยังทำงานปกติ แค่ ownership หาย

---

## ⛔ Off-limits

- `.env` — ห้ามอ่านหรือแสดงค่า ยกเว้น key ที่ขึ้นต้นด้วย `DB_` (เช่น `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`) อนุญาตให้อ่านเพื่อ debug local ได้
