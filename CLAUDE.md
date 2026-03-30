Discord bot สำหรับองค์กรอาสาประชาชน **PPLE Volunteers** (อาสาประชาชน)

## Stack
- Runtime: **Node.js**
- Bot Framework: **discord.js v14** (ไม่ใช่ Sapphire)
- Database: **MySQL**
- OS: Linux Mint / Editor: VS Code
- Hosting: VPS Server (Ram 4G)

## Project Structure
```
commands/       slash commands (deploy ด้วย deploy-commands.js / deploy-commands-global.js)
handlers/       interaction handlers (buttons, selects)
components/     reusable embed builders
db/             database access functions (index.js = connection pool)
config/         constants, roles config, hints, orgchart
utils/          activity tracker, org chart generator
scripts/        one-off scripts (import, sync, backfill)
backups/        SQL backups
logs/           log files
```

## Database Conventions
- Database: `pple_volunteers`
- MySQL user: `pple_dcbot`
- ทุก table มี prefix `dc_` เช่น `dc_members`, `dc_ratings`, `dc_reports`, `dc_settings`
- ทุก table มี column `guild_id` (VARCHAR) — รองรับ multi-server
- **อย่า assume column names** — ให้ดูไฟล์ใน `db/` ก่อนเสมอ

## Key Commands
| Command | File | Description |
|---|---|---|
| `/register` | `commands/register.js` | ลงทะเบียนสมาชิก |
| `/interest` | `commands/interest.js` | เลือก interest roles |
| `/province` | `commands/province.js` | เลือก province roles |
| `/setup-interest` | `commands/setup-interest.js` | วาง entry-point button (admin) |
| `/setup-province` | `commands/setup-province.js` | วาง entry-point button (admin) |
| `/rate-user` | `commands/rate-user.js` | ให้คะแนนสมาชิก |
| `/ratings` | `commands/ratings.js` | ดูคะแนน |
| `/ratings-top` | `commands/ratings-top.js` | leaderboard |
| `/reports` | `commands/reports.js` | รายงานสมาชิก |
| `/orgchart` | `commands/orgchart.js` | แสดงโครงสร้างองค์กร |
| `/backup` | `commands/backup.js` | backup ข้อมูล |
| `/sticky-set` | `commands/sticky-set.js` | ตั้ง sticky message |

## Key Handlers
| File | Triggered by |
|---|---|
| `openInterest.js` | entry-point button จาก setup-interest |
| `openProvince.js` | entry-point button จาก setup-province |
| `interestSelect.js` | select menu ใน interest flow |
| `provinceSelect.js` | select menu ใน province flow |
| `registerHandler.js` | buttons ใน register flow |
| `rateStars.js` | star rating buttons |
| `reportHandler.js` | report flow buttons |
| `ratingsPage.js` | pagination buttons |
| `stickyHandler.js` | sticky message logic |

## UX Pattern — Role Selection
- `/setup-interest` และ `/setup-province` วาง **persistent public button** ใน channel
- เมื่อ user กด → trigger `openInterest.js` / `openProvince.js`
- Handler ส่ง **ephemeral response** แสดง state ปัจจุบันของ user นั้นๆ
- ใช้ `interaction.reply({ ephemeral: true })` (ไม่ใช่ `channel.send()` เพราะติด permission)
- ใช้ `deferUpdate()` ใน handler ก่อน update ephemeral message

## Conventions / Gotchas
- **อย่าตั้งชื่อ handler แบบ generic** เช่น `buttonHandler.js` — ใช้ชื่อ specific
- **อย่า assume table structure** — ขอดูไฟล์จริงก่อนเขียน SQL หรือ query เสมอ
- `guildId` มาจาก `interaction.guildId` หรือ `member.guild.id`
- `.setLabel()` ใน discord.js v14 **ไม่ได้ deprecated** — ใช้ได้ปกติ
- deploy guild-specific: `node deploy-commands.js`
- deploy global: `node deploy-commands-global.js`

## What's Done
- [x] DB migration: เพิ่ม `guild_id` ทุก table, rename เป็น `dc_` prefix
- [x] Multi-server support ใน db/, commands/, handlers/ ทั้งหมด
- [x] Role selection UX redesign (persistent button → ephemeral)
- [x] `openInterest.js` / `openProvince.js` handlers
- [x] `provinceSelect.js` แสดง roles ที่ถูก add/remove จริงๆ
- [x] `deploy-commands-global.js` สำหรับ multi-server deploy
- [x] Org chart system (`orgchart.js`, `generateOrgChart.js`)
- [x] Activity tracking (`utils/activityTracker.js`, `db/activity.js`)
- [x] Sticky message system

## Preferences
- ชอบ practical solution — ไม่ over-engineer
- **ยืนยัน decision ผ่าน Q&A ก่อนเขียน code เสมอ**
- ถามตรงๆ ได้ ไม่ต้อง formal
- Code ที่ให้ควรเป็น runnable / copy-paste friendly

## Off-limits
- `.env` — อย่าอ่านหรือแสดงค่าใน file นี้