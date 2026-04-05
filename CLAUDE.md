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
- **อย่าใช้ `LIMIT ?` ใน prepared statement** — mysql2 ไม่รองรับ ให้ใช้ `LIMIT ${n}` แทน (n ต้องเป็น integer ที่ควบคุมเอง ไม่ใช่ user input)

## DB Tables — Activity System
```sql
dc_activity_daily (
  guild_id, user_id, channel_id, date,
  message_count, voice_seconds
  -- UNIQUE KEY: guild_id + user_id + channel_id + date
)

dc_activity_mentions (
  guild_id, user_id, mentioned_by, channel_id, timestamp
  -- ไม่มี replied_at — track แค่ว่าถูก mention กี่ครั้ง
)

dc_orgchart_config (
  guild_id, role_id, role_name, role_color,
  channel_id, channel_name,
  channel_type ENUM('text','voice','forum'),
  excluded TINYINT -- 1 = ไม่ track แต่ยังอยู่ใน config
)
```

## DB Tables — Forum Search System
```sql
dc_forum_posts (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id     VARCHAR(20) NOT NULL,
  channel_id   VARCHAR(20) NOT NULL,   -- parent forum channel id
  post_id      VARCHAR(20) NOT NULL UNIQUE,
  post_name    VARCHAR(500) NOT NULL,
  post_url     VARCHAR(200) NOT NULL,
  author_id    VARCHAR(20),
  created_at   DATETIME NOT NULL,
  indexed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild_channel (guild_id, channel_id)
)

dc_forum_config (
  guild_id          VARCHAR(20) NOT NULL,
  channel_id        VARCHAR(20) NOT NULL,  -- forum channel ที่ setup
  dashboard_msg_id  VARCHAR(20),           -- message id ของ dashboard ที่ปักหมุด
  items_per_page    INT DEFAULT 10,
  PRIMARY KEY (guild_id, channel_id)
)
```

## Activity System — Rules สำคัญ
- **Thread → ใช้ `parentId` เสมอ** ทั้งใน `activityTracker.js` และ `backfill-activity.js`
  ```js
  const channelId = channel.isThread()
    ? (channel.parentId ?? channel.id)
    : channel.id;
  ```
- `dc_orgchart_config` เก็บ parent channel ID — ถ้าบันทึก thread ID จะ miss ข้อมูลทั้งหมด
- Voice tracking ทำได้เฉพาะ live (`activityTracker.js`) — backfill ดึงย้อนหลังไม่ได้
- `channel_type = 'forum'` → push เข้า `textChannels` ไม่ใช่ `voiceChannels` (ดู `orgchartConfig.js`)

## Score Formula
```
score = messages × 10 + voiceSeconds + mentions × 30
```
- `mentions` = จำนวนครั้งที่ถูก @ ใน channels ของ role นั้น
- ใช้ใน `/orgchart` และ `/stat-*` ทุก command

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
| `/orgchart` | `commands/orgchart.js` | top active members ต่อ role (รับ `role` optional + `public`) |
| `/orgchart-scan` | `commands/orgchart-scan.js` | สแกน role+channel แล้วบันทึก config (admin) |
| `/setup-orgchart` | `commands/setup-orgchart.js` | วาง persistent select menu panel (admin) |
| `/stat-server` | `commands/stat-server.js` | overview ของ server |
| `/stat-top` | `commands/stat-top.js` | top 10 members ทั้ง server (filter role ได้) |
| `/stat-channel` | `commands/stat-channel.js` | stats ของ channel |
| `/stat-user` | `commands/stat-user.js` | stats ของ user |
| `/backup` | `commands/backup.js` | backup ข้อมูล |
| `/sticky-set` | `commands/sticky-set.js` | ตั้ง sticky message |
| `/forum` | `commands/forum.js` | forum search system (subcommands ดูด้านล่าง) |

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
| `orgchartProvinceSelect.js` | customId: `orgchart_province_region` — เลือกภาคสำหรับ province flow |
| `orgchartRoleSelect.js` | customId: `orgchart_role` — เลือก role แล้วแสดงผล |
| `forumDashboard.js` | customId: `forum_refresh_*`, `forum_list_*` — dashboard buttons |
| `forumSearch.js` | customId: `forum_search`, `forum_result_*` — modal submit + pagination |

## UX Pattern — Role Selection
- `/setup-interest` และ `/setup-province` วาง **persistent public button** ใน channel
- เมื่อ user กด → trigger `openInterest.js` / `openProvince.js`
- Handler ส่ง **ephemeral response** แสดง state ปัจจุบันของ user นั้นๆ
- ใช้ `interaction.reply({ ephemeral: true })` (ไม่ใช่ `channel.send()` เพราะติด permission)
- ใช้ `deferUpdate()` ใน handler ก่อน update ephemeral message

## UX Pattern — Orgchart (UI/UX Friendly)

### Overview
Orgchart มี 2 entry point:
1. **`/orgchart`** — slash command เดิม ใช้ได้ทันที ไม่ต้องแก้
2. **`/setup-orgchart group:<group>`** — admin วาง persistent panel ต่อ 1 group ต่อ 1 channel

### DB — column ใหม่
```sql
-- เพิ่ม group_name ใน dc_orgchart_config (รัน add_group_name.sql)
group_name ENUM('main','skill','region','province','district','other') DEFAULT 'other'
```
- `main` — ทีมหลัก (อาสาประชาชน, ทีมเจ้าหน้าที่ ฯลฯ)
- `skill` — ทีม skill (กราฟิก, คอนเทนต์, กฎหมาย ฯลฯ)
- `region` — ทีมภาค (ภาคเหนือ, ภาคอีสาน ฯลฯ รวมถึง ฟา-)
- `province` — ทีมจังหวัด (ทีมเชียงใหม่, ทีมขอนแก่น ฯลฯ)
- `district` — ทีมอำเภอ (server ราชบุรีเท่านั้น)
- `other` — ยังไม่จัดกลุ่ม (ไม่แสดงใน panel)

### db/orgchartConfig.js — query ที่ต้องเพิ่ม
```js
// ดึง unique roles ของ group ที่ระบุ
async function getRolesByGroup(guildId, groupName)
// return: [{ roleId, roleName, roleColor }]
// WHERE guild_id = ? AND excluded = 0 AND group_name = ?
// GROUP BY role_id เพื่อ deduplicate (1 role มีหลาย channel)
// ORDER BY role_name
```

### Flow — /setup-orgchart
```
/setup-orgchart group:main     → วาง panel ทีมหลัก
/setup-orgchart group:skill    → วาง panel ทีม Skill
/setup-orgchart group:region   → วาง panel ทีมภาค
/setup-orgchart group:province → วาง panel ทีมจังหวัด (2 ชั้น)
/setup-orgchart group:district → วาง panel ทีมอำเภอ
```
- bot reply ephemeral "วาง panel แล้วครับ" ให้ admin
- panel วางใน channel ที่รัน command นั้น (public, persistent)
- ถ้าต้องการ refresh → admin รัน /setup-orgchart ใหม่

**Panel embed (group != province):**
- Title: ตาม group เช่น `🌟 ทีมหลัก`, `🛠️ ทีม Skill`
- Description: `เลือก role ที่ต้องการดู`
- StringSelectMenu รายชื่อ role ใน group นั้น (label = roleName, value = roleId)
- customId: `orgchart_role`

**Panel embed (group == province):**
- Title: `📍 ทีมจังหวัด`
- Description: `เลือกภาคที่ต้องการดู`
- StringSelectMenu ภาค 6 ภาค จาก `PROVINCE_REGIONS` ใน `config/constants.js`
- customId: `orgchart_province_region`
- value: region id เช่น `bkk`, `north`, `central`, `east`, `northeast`, `south`

### Flow — handlers

**`handlers/orgchartProvinceSelect.js`** (customId: `orgchart_province_region`)
```
user เลือกภาค
  → deferUpdate
  → ดึง roles ทั้งหมดที่ group = 'province' จาก getRolesByGroup
  → filter เฉพาะ role ที่ roleName match จังหวัดในภาคนั้น
    (เช่น ภาคเหนือ → PROVINCE_REGIONS.find(r => r.id === value).provinces
     แล้ว filter role ที่ชื่อขึ้นต้นว่า "ทีม" + จังหวัด)
  → editReply ด้วย StringSelectMenu รายชื่อจังหวัด
    customId: orgchart_role
```

**`handlers/orgchartRoleSelect.js`** (customId: `orgchart_role`)
```
user เลือก role
  → deferUpdate
  → getConfigByRoleIds(guildId, [roleId])
  → guild.members.fetch()
  → getRoleStats → buildOrgChartEmbed
  → editReply ด้วย embed (ephemeral เสมอ)
```

### Files ที่ต้องสร้าง/แก้
| File | Action |
|---|---|
| `commands/setup-orgchart.js` | สร้างใหม่ |
| `handlers/orgchartProvinceSelect.js` | สร้างใหม่ |
| `handlers/orgchartRoleSelect.js` | สร้างใหม่ |
| `db/orgchartConfig.js` | เพิ่ม `getRolesByGroup` |
| `commands/orgchart.js` | **ไม่ต้องแก้** |

### customId สรุป
| customId | Handler | ความหมาย |
|---|---|---|
| `orgchart_province_region` | `orgchartProvinceSelect.js` | เลือกภาค (province flow) |
| `orgchart_role` | `orgchartRoleSelect.js` | เลือก role แล้วแสดงผล |

### Design Rules
- **`getRoleStats` และ `buildOrgChartEmbed` จาก `utils/orgchartEmbed.js` เสมอ** — ห้าม duplicate
- select menu value ใช้ `role_id` เสมอ ยกเว้น `orgchart_province_region` ใช้ region id
- output จาก panel = ephemeral เสมอ ทุก step
- ไม่เก็บ message_id ใน DB — ถ้า refresh ให้รัน /setup-orgchart ใหม่

## UX Pattern — Stat Commands
- ทุก `/stat-*` และ `/orgchart` มี option `public` (Boolean, default = false = ephemeral)
- ใช้ `MessageFlags.Ephemeral` แทน `{ ephemeral: true }` ใน discord.js v14
  ```js
  await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });
  ```
- `/stat-channel` — ถ้าไม่ระบุ channel ใช้ channel ปัจจุบัน, ถ้าเป็น thread ใช้ parent
- `/stat-user` — ถ้าไม่ระบุ user แสดงของตัวเอง

## UX Pattern — Forum Search (GUI + Command)

### Overview
Forum search มี 2 entry point เสมอ (command-first principle):
1. **`/forum <subcommand>`** — slash command ใช้ได้ทันที
2. **Dashboard message (ปักหมุด)** — GUI สำหรับ user ทั่วไป ทุกปุ่มมี command รองรับ

### Setup — /panel forum
```
/panel forum   channel items_per_page   — ตั้งค่า + สร้าง/อัปเดต dashboard (Moderator only)
```
- เพิ่ม subcommand `forum` เข้าไปใน `commands/panel.js` (ตาม pattern เดิม)
- บันทึก config ลง `dc_forum_config` + ส่ง dashboard message ลงใน channel ที่ระบุ

### Subcommands — /forum
```
/forum search  keyword(optional) channel(optional) sort(optional) public(optional) — ค้นหา post
/forum refresh channel                                                               — รีเฟรช dashboard (ทุกคนใช้ได้)
```
- `search` keyword ว่าง = ดูทั้งหมด (sort by newest)
- `search` sort options: `relevant` (default ถ้ามี keyword) / `newest` (default ถ้าไม่มี keyword) / `oldest`
- `search` ไม่ระบุ channel → ค้นทุก forum channel ใน server
- ตัด `list` ออก — ใช้ search keyword ว่างแทน

### Dashboard message (ปักหมุดใน forum channel)
embed แสดง:
- **Title:** `PPLE Forum — {ชื่อ channel}`
- **Description:** `ค้นหาและเรียกดูโพสต์ในช่องนี้ได้เลย กดปุ่มด้านล่าง`
- **โพสต์ล่าสุด** (inline field): bullet list สูงสุด 5 อัน แต่ละอันมี hyperlink ชื่อโพสต์ + tag ชื่อ channel
- **ภาพรวม** (3 inline fields): จำนวนโพสต์ทั้งหมด / เดือนนี้ / วันนี้
- **Footer:** `อัปเดตล่าสุด: {วันที่ เวลา}`

buttons:
| customId | ทำอะไร | command เทียบเท่า |
|---|---|---|
| `forum_search` | เปิด modal ค้นหา (ทุกคน) | `/forum search` |
| `forum_refresh_{channelId}` | รีเฟรช dashboard (ทุกคน) | `/forum refresh` |

### Modal — ค้นหาโพสต์ (เปิดจากปุ่ม forum_search)
- **Title:** `ค้นหาโพสต์`
- **Field 1:** `คำค้นหา` (required) — placeholder: `เช่น น้ำท่วม, ไฟฟ้า...`
- **Field 2:** `ช่อง (ไม่บังคับ)` (optional) — placeholder: `ทิ้งว่างไว้ = ค้นทุกช่อง` / hint: `พิมพ์ชื่อช่อง เช่น ร้องเรียน, ประกาศ`
  - input เป็น text ธรรมดา (modal ไม่รองรับ channel selector) → match กับชื่อ channel แบบ partial

### Search flow
```
1. กดปุ่ม "ค้นหา" หรือรัน /forum search
2. (ถ้ากดปุ่ม) เปิด modal — กรอก keyword + channel (optional)
3. Hybrid search (Promise.all):
   - MySQL LIKE %keyword% บน post_name
   - Meilisearch ค้น content ทุก message ใน thread
   → merge + dedupe by post_id
   → post ที่ match ทั้งสองแหล่งขึ้นก่อน, ที่เหลือเรียง newest
   Fallback (Meilisearch ไม่พร้อม): ใช้แค่ MySQL LIKE
4. ตอบกลับ ephemeral embed + pagination buttons
5. กด next/prev → edit embed เดิม (ไม่ส่งใหม่)
```

pagination button customId: `forum_result_{keyword}_{channelId}_{sort}_{page}`

### Meilisearch index: "forum_posts"
```
searchable fields: post_name, content (ทุก message ใน post รวมกัน)
filterable fields: guild_id, channel_id
document: { id, post_name, content, post_url, channel_id, guild_id, created_at }
```

### Events (real-time index)
- `threadCreate` — ถ้า parent เป็น forum channel ที่มี config → insert `dc_forum_posts` + upsert Meilisearch (ชื่อ + OP message)
- `messageCreate` — ถ้า channel เป็น thread ของ forum channel ที่ config ไว้ → append content เข้า Meilisearch doc (upsert)

### Backfill script
```bash
# backfill ทั้ง server (วน loop ทุก forum channel ที่มี config)
node scripts/backfill-forum.js --guild GUILD_ID

# หรือเลือก channel เดียว
node scripts/backfill-forum.js --channel CHANNEL_ID
```
- รันครั้งเดียวตอน setup — ไม่มี slash command สำหรับ backfill
- log progress เป็น channel/post
- ทำ batch fetch รอบ Discord API rate limit

### Files ที่ต้องสร้าง/แก้
| File | Action | Description |
|---|---|---|
| `commands/panel.js` | แก้ | เพิ่ม subcommand `forum` |
| `commands/forum.js` | สร้างใหม่ | subcommands: search, refresh |
| `handlers/forumDashboard.js` | สร้างใหม่ | button: refresh |
| `handlers/forumSearch.js` | สร้างใหม่ | modal submit + pagination |
| `db/forum.js` | สร้างใหม่ | queries สำหรับ dc_forum_posts, dc_forum_config |
| `services/meilisearch.js` | สร้างใหม่ | init client, upsert, search |
| `services/forumIndexer.js` | สร้างใหม่ | logic ดึง messages แล้ว push เข้า Meilisearch |
| `scripts/backfill-forum.js` | สร้างใหม่ | one-off backfill script |

### customId สรุป
| customId | Handler | ความหมาย |
|---|---|---|
| `forum_search` | `forumSearch.js` | เปิด modal ค้นหา |
| `forum_result_{kw}_{ch}_{sort}_{page}` | `forumSearch.js` | pagination ผลค้นหา |
| `forum_refresh_{channelId}` | `forumDashboard.js` | รีเฟรช dashboard |

## Conventions / Gotchas
- **Command names ใช้ hyphen เสมอ** เช่น `stat-server`, `stat-top` (ไม่ใช่ camelCase)
- **Discord mention syntax ใน embed** — ใช้ clickable format เสมอ:
  - Channel → `<#CHANNEL_ID>`
  - User → `<@USER_ID>`
  - Role → `<@&ROLE_ID>`
- **อย่าตั้งชื่อ handler แบบ generic** เช่น `buttonHandler.js` — ใช้ชื่อ specific
- **อย่า assume table structure** — ขอดูไฟล์จริงก่อนเขียน SQL หรือ query เสมอ
- `guildId` มาจาก `interaction.guildId` หรือ `member.guild.id`
- `.setLabel()` ใน discord.js v14 **ไม่ได้ deprecated** — ใช้ได้ปกติ
- deploy guild-specific: `node deploy-commands.js`
- deploy global: `node deploy-commands-global.js`
- Channel name ใน embed ให้ resolve จาก `guild.channels.cache.get(id)?.name` ก่อน ถ้าไม่เจอค่อย fallback เป็นชื่อจาก DB
- **Command-first principle** — ทุกปุ่ม GUI ต้องมี slash command รองรับเสมอ ปุ่มและ command ใช้ logic function เดียวกัน

## What's Done
- [x] DB migration: เพิ่ม `guild_id` ทุก table, rename เป็น `dc_` prefix
- [x] Multi-server support ใน db/, commands/, handlers/ ทั้งหมด
- [x] Role selection UX redesign (persistent button → ephemeral)
- [x] `openInterest.js` / `openProvince.js` handlers
- [x] `provinceSelect.js` แสดง roles ที่ถูก add/remove จริงๆ
- [x] `deploy-commands-global.js` สำหรับ multi-server deploy
- [x] Org chart system (`/orgchart`, `/orgchart-scan`, `generateOrgChart.js`)
- [x] Activity tracking (`activityTracker.js`, `db/activity.js`, `db/stat.js`)
- [x] Backfill script (`scripts/backfill-activity.js`) — รองรับ date range
- [x] Stat commands (`/stat-server`, `/stat-top`, `/stat-channel`, `/stat-user`)
- [x] Sticky message system
- [ ] ติดตั้ง Meilisearch บน server (`curl -L https://install.meilisearch.com | sh`) + start service
- [ ] รัน `scripts/migration-forum.sql` สร้าง table
- [ ] deploy commands (`node deploy-commands.js`)
- [ ] รัน `scripts/backfill-forum.js` หลัง setup forum channel แล้ว
- [x] `commands/panel.js` — เพิ่ม subcommand `forum`
- [x] `commands/forum.js` (subcommands: search, refresh)
- [x] `handlers/forumDashboard.js` + `handlers/forumSearch.js`
- [x] `db/forum.js` + `services/meilisearch.js` + `services/forumIndexer.js`
- [x] `scripts/backfill-forum.js`
- [x] เพิ่ม `threadCreate` + `messageCreate` + `clientReady` handlers ใน `index.js`

## Preferences
- ชอบ practical solution — ไม่ over-engineer
- **ยืนยัน decision ผ่าน Q&A ก่อนเขียน code เสมอ**
- ถามตรงๆ ได้ ไม่ต้อง formal
- Code ที่ให้ควรเป็น runnable / copy-paste friendly
- **ทุก command ที่สร้างใหม่ต้องถามก่อนเสมอว่า default เป็น ephemeral หรือ public** แล้วใส่ `public` Boolean option ให้ทุกครั้ง
- **Command-first principle** — ทุก GUI button ต้องมี slash command รองรับเสมอ

## Off-limits
- `.env` — อย่าอ่านหรือแสดงค่าใน file นี้
