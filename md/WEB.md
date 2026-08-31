# Web App — Next.js Frontend

Node.js + Next.js (App Router), Discord OAuth auth, Finance system UI.

**Local path:** `/web/`  
**Production path:** `/www/wwwroot/pple-volunteers/web/`  
**Domain:** pplethai.org (subdomain TBD)

---

## Quick Start

```bash
cd web
npm install
npm run dev

# Build
npm run build

# Production
sudo -u www npm run build
pm2 restart pple-web
```

---

## Project Structure

```
app/
  layout.js                    Root layout
  page.js                      Home (redirect or landing)
  globals.css
  login/                       Discord OAuth login
  dashboard/page.js            Overview (post-login)
  
  finance/
    accounts/page.js           CRUD accounts
    transactions/page.js       CRUD transactions + filter
    categories/page.js         Category management
    report/page.js             Financial reports
  
  admin/                       Admin pages
  
  api/
    auth/                      next-auth endpoints
    finance/
      accounts/                POST, PATCH, DELETE
      categories/              POST, PATCH
      transactions/            POST, PATCH
      report/                  Report endpoints
    admin/
      logs/                    Admin logs

components/
  Nav.jsx                      Navigation
  Providers.jsx                Context/session providers
  AccountSelect.jsx            Account dropdown
  BankBadge.jsx                Bank logo component
  CategorySelect.jsx           Category dropdown

db/
  index.js                     PostgreSQL pool (pg)
  finance/
    accounts.js                Account queries
    transactions.js            Transaction queries
    categories.js              Category queries

lib/
  auth.js                      getServerSession helper
  auth-options.js              next-auth config (Discord provider)
  roles.js                     Role hierarchy helpers
  financeAccess.js             Finance permission checker

public/                        Static assets
```

---

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Next.js (App Router, not Pages Router)
- **Database:** PostgreSQL (`pple_volunteers`)
- **Auth:** Discord OAuth → next-auth
- **UI:** React (Server Components by default)

---

## Subsystems

This web app hosts multiple integrated systems:

### 1. **PPLE Finance** (`/finance/*`)
Transaction & account management with role-based access control.  
📄 See [md/FINANCE.md](FINANCE.md)

### 2. **PPLE Calling** (`/calling/*`)
Member calling system with tier tracking and assignment management.  
📄 See [md/CALLING.md](CALLING.md)

### 3. **PPLE Docs** (`/docs/*`, planned)
E-signature & document management for activity registration forms.  
📄 See [md/DOCS.md](DOCS.md)

### 4. **Social Accounts** (`/bot/social/accounts`)
Manage Meta (FB/IG/Threads) + X (Twitter) accounts ต่อ guild สำหรับ basket posting

**Architecture (multi-tenant):**
- **App credentials ราย org** เก็บใน `org_config` (ไม่ใช่ `.env` · ย้ายมาจาก `dc_guild_config` 2026-07-29)
  - `meta_app_id`, `meta_app_secret` — ใช้กับ FB + IG + Threads (Meta App เดียว)
  - `x_consumer_key`, `x_consumer_secret` — ใช้กับ X OAuth
  - org ต้อง set ทั้ง 4 keys ก่อนใช้ — ปุ่ม Connect/Add จะ disabled ถ้ายังไม่ set (ตั้งครั้งเดียวใช้ได้ทุก guild ในองค์กร)
  - อ่านผ่าน `web/lib/socialAppCreds.js` (`getMetaApp` / `getXApp` — org ก่อน แล้ว fallback `dc_guild_config` ช่วงเปลี่ยนผ่าน) · **ห้าม query เอง**
  - ฝั่งบอท: `getGuildMetaApp(guildId, orgId)` / `getGuildXApp(guildId, orgId)` — ส่ง orgId ตรงได้เมื่อ org ไม่มี Discord
  - `news_channel_id` **ย้ายไปผูกรายกลุ่มแล้ว** (2026-08-12) — ดู "ห้องข่าวสาร" ข้างล่าง · ค่าใน `dc_guild_config` เหลือเป็น fallback
- **Accounts** เก็บใน `dc_social_accounts`
  - `user_discord_id` + `guild_id` + `platform` + `social_id` (unique)
  - `visibility`: `public` (guild-wide) / `private` (เฉพาะ user เจ้าของ)
  - `group_name`: ชื่อกลุ่มสำหรับ basket Row 1 (เช่น "ปชช.ราชบุรี", "Unnop ส่วนตัว")
  - `news_channel_id`: ห้องข่าวสารของกลุ่ม (2026-08-12) — ค่าระดับกลุ่มที่เก็บซ้ำทุกแถวเหมือน `guild_id`/`visibility`
  - X stores creds เป็น JSON `{access_token, access_token_secret}` ใน `access_token` column (consumer key/secret มาจาก guild_config)
  - IG/Threads ใช้ `user_token` (Meta ปิด Page Token สำหรับ IG)

**ห้องข่าวสาร (platform `news` ในกล่องเผยแพร่ + ตะกร้าดิสฯ) — ผูกรายกลุ่ม ไม่ใช่ราย guild (2026-08-12):**
- **กลุ่มไหนก็ผูกห้องไหนก็ได้ — ข้ามเซิร์ฟใน org เดียวกันได้ · ข้ามออกนอก org ไม่ได้** (user เคาะ 2026-08-12) · ตั้งที่ `/org/settings/social` → ปุ่ม **`+ Discord News`** (แถวเดียวกับปุ่ม Connect ทั้ง 2 โซน · ปุ่ม connect เป็นไอคอนล้วน) → modal เลือกกลุ่ม (ติด 🔒 = ส่วนตัว) + ห้อง · binding แสดงเป็น **แถวในลิสต์บัญชี** (badge 📢 + ชื่อห้อง + ชื่อเซิร์ฟของห้อง + dropdown ย้ายกลุ่ม + ปุ่มลบ) เพราะมีได้หลายกลุ่ม กลุ่มละห้อง — ไม่ใช่การ์ด config และไม่ใช่ป้ายสรุป
- **ตัวเลือกห้องใน modal = ห้องที่ตั้งไว้ที่ /bot เท่านั้น** (`GET /api/social/news-channels` — 1 ห้องต่อเซิร์ฟ จาก `dc_guild_config`) **ไม่กางห้องทั้งเซิร์ฟ** · เคยทำแบบกางทั้งเซิร์ฟ+ช่องค้นหา แล้ว user สั่งตัด (ราชบุรีมี 76 ห้อง)
- ⚠️ ห้องข่าวของ 2 เซิร์ฟ **ชื่อซ้ำกันเป๊ะ** ("📢┆ข่าวสารประชาชน" ทั้งคู่) → ทุกที่ที่โชว์ชื่อห้องต้องมีชื่อเซิร์ฟกำกับ ไม่งั้นแยกไม่ออก
- flow ตั้งค่าจริง: `/bot` (ตั้งห้องของเซิร์ฟ — สลับ guild switcher ทีละเซิร์ฟ) → `/org/settings/social` (ผูกห้องให้กลุ่ม)
- **บอทหาห้องด้วย `client.channels.fetch(channelId)` ไม่ผ่าน guild ของงาน** (pattern เดียวกับ newsWatch) → ห้องอยู่เซิร์ฟไหนก็ส่งได้ · `guild_id` ของกลุ่มไม่ถูกแตะจากการตั้งห้อง (ตะกร้าดิสฯ ยังหาบัญชีเจอเหมือนเดิม)
- **ด่านเดียวที่กันข้าม org:** ห้องต้องอยู่ใน "ทะเบียนห้องข่าว" = `dc_guild_config.news_channel_id` ของเซิร์ฟใน `guildsOfOrg(orgId)` (`guildOfNewsChannel` ใน `api/social/groups/route.js`) — ห้องนอกทะเบียน/ของ org อื่น = 400
- ชื่อห้องต้องดึงจากเซิร์ฟของ **ห้อง** (`newsTargetGuildId`) ไม่ใช่เซิร์ฟของกลุ่ม ไม่งั้นห้องข้ามเซิร์ฟจะไม่มีชื่อ
- **ไม่มีคำสั่งบอทสำหรับตั้งห้องข่าวสาร** (เคยคิดทำ `/panel newsroom` แล้วตัดออก — /bot + modal พอ) · `/panel news` เป็น digest ข่าวท้องถิ่น เก็บคีย์ `news_watch_feeds` คนละเรื่องกัน
- ลำดับตัดสินปลายทาง — **ต้องตรงกันทั้ง 2 ฝั่ง** (`attachNewsReady` ใน `web/lib/publishTargets.js` ↔ `getNewsChannelId` ใน `services/newsShare.js`):
  | `dc_social_accounts.news_channel_id` | ผล |
  |---|---|
  | `'off'` | ไม่ส่ง |
  | channel id | ส่งเข้าห้องนั้น |
  | ว่าง + กลุ่ม `public` | fallback `dc_guild_config.news_channel_id` (ค่าที่ /bot ตั้งไว้เดิม) |
  | ว่าง + กลุ่ม `private` | **ไม่ส่ง (ไม่ fallback)** — กลุ่มส่วนตัวยิงเข้าห้องข่าวองค์กรได้เฉพาะเมื่อทีมสื่อตั้งห้องให้ |
- ด่านสิทธิ์อยู่ที่ **ตอนตั้งค่า** ไม่ใช่ตอนกดโพสต์: ผูกเซิร์ฟ = `canManageSocialGuild` · ตั้งห้อง = `canManageSocialGuild || isMediaTeam`
  (เจ้าของกลุ่ม private ตั้งเองไม่ได้ → กฎ "จำกัดวงคนส่ง" บังคับได้จุดเดียว ไม่ต้องเช็คยศในบอท)
- **ห้าม `UPDATE ... WHERE group_name = $1`** — `group_name` เป็น free text ซ้ำข้าม org/เจ้าของได้ → fan-out ต้องเอา id จาก `listPublishGroups()` แล้ว `WHERE id = ANY($n)` (`web/app/api/social/groups/route.js`)
- ย้ายบัญชีเข้ากลุ่มทีหลังจะ inherit `guild_id` + `news_channel_id` จากแถวพี่ให้เอง (`inheritGroupFields` ใน `accounts/[id]/route.js`) — ไม่งั้นแถวใหม่ `guild_id` ว่าง แล้วตะกร้าดิสฯ มองไม่เห็น
- ประกาศกิจกรรม (@everyone) ยังเป็นของ guild — เรียก `getNewsChannelId(guildId)` โดยไม่ส่งชื่อกลุ่ม

**Token storage by platform:**
| Platform | `access_token` | `user_token` |
|---|---|---|
| fb | Page Access Token | — |
| ig | — | IG User Token (+ expires_at, auto-refresh เมื่อ < 7 วัน) |
| threads | — | Threads User Token |
| x | JSON `{access_token, access_token_secret}` | — |

**Web routes:**
- `GET/POST /api/social/accounts` — list / create
- `PATCH/DELETE /api/social/accounts/[id]` — update (visibility, group_name) / delete
- `GET/PATCH /api/social/guild-configs` — admin only, จัดการ app credentials
- `GET /api/meta/oauth/start` + `/api/meta/oauth/callback` — Meta OAuth (อ่าน app credentials จาก guild_config)
- `GET /api/x/oauth/start` + `/api/x/oauth/callback` — X OAuth 1.0a (PIN-less flow)

**UI features (`/bot/social/accounts`):**
- กล่อง App Credentials per guild (mask secrets, edit modal มี ESC/click-outside/X-button)
- รายการ accounts แยกตาม guild พร้อม group dropdown + visibility toggle + delete
- ปุ่ม Connect Meta OAuth + X (Guild form) + X (ส่วนตัว OAuth)
- Banner แสดงผลหลัง OAuth callback (success/error from query params)

📄 See [md/discord/BOT.md](discord/BOT.md) สำหรับ basket posting + X thread split + scheduling rules

---

## Shared Infrastructure

### Central Member Cache (`bq_members`)
- ~100k party members synced from ACT system via API
- Used by both **Calling** and **Docs** for member identity
- Source: ACT party system (external)
- Sync: Daily via adapter pattern

### Role-Based Access Control (RBAC)
All subsystems use the same role hierarchy from `config/roles.js`:
- Admin / เลขาธิการ
- รองเลขาธิการภาค / ผู้ประสานงานภาค
- ผู้ประสานงานจังหวัด / กรรมการจังหวัด
- ตทอ. (ผู้ประสานงานอำเภอ)

Each subsystem defines its own permission rules based on this hierarchy.  
See: [FINANCE.md - RBAC](FINANCE.md#access-control-rbac) | [CALLING.md - Permission](CALLING.md#permission--access-control)

---

## Theming & CSS Conventions

### CSS Variables (`web/app/globals.css`)

```css
:root {
  --card-bg: #fafaf9;   /* light mode */
}
.dark {
  --card-bg: #111827;   /* dark mode */
}
```

→ **แก้สีที่เดียวใน `globals.css` เปลี่ยนทุกหน้า**

---

### Dark Mode Classes — ใช้ชุดนี้เท่านั้นทั้งโปรเจกต์

| Element | ✅ ใช้ | ❌ ห้ามใช้ |
|---|---|---|
| Background (card/container/input) | `bg-card-bg` | `bg-white dark:bg-gray-800`, `dark:bg-warm-dark-*` |
| Border | `border-warm-200 dark:border-disc-border` | `dark:border-gray-*`, `dark:border-warm-dark-*` |
| Primary text | `text-warm-900 dark:text-disc-text` | `dark:text-white`, `dark:text-warm-50` |
| Secondary/muted text | `text-warm-500 dark:text-disc-muted` | `dark:text-gray-400`, `dark:text-warm-dark-400` |
| Hover background | `hover:bg-warm-50 dark:hover:bg-disc-hover` | `dark:hover:bg-gray-700`, `dark:hover:bg-warm-dark-200` |
| Placeholder | `placeholder-warm-400 dark:placeholder-disc-muted` | `dark:placeholder-gray-*` |

---

### ความกว้างของหน้า — ค่าเริ่มต้น 1024px · โซนไหนอยากเต็มจอให้ประกาศ `data-wide`

`app/layout.js` ครอบ `<main>` ไว้ที่ `max-w-5xl` (1024px) เป็นค่าเริ่มต้นของทั้งแอพ

⛔ **`-mx-4` แหกกรอบไม่ได้** — negative margin หักล้างได้แค่ *padding* ของพ่อ ทะลุ `max-width` ไม่ได้
(นี่คือเหตุผลที่ `max-w-7xl` ใน `app/calling|posts|docs/layout.js` เป็น dead code มาตลอด — เจอ 2026-08-17)

**วิธีทำให้โซนเต็มจอ — เติมคำเดียวที่ layout ของโซน:**
```jsx
<div data-wide className="-mx-1 sm:-mx-4 -mt-3 min-h-screen bg-warm-50 dark:bg-disc-bg2">
```
`app/globals.css` มี 2 กฎที่เกาะ attribute นี้อยู่แล้ว → เนื้อหา **และ** แถบ nav ยืดตามเอง
ไม่ต้องแก้ `globals.css` ไม่ต้องแก้ `Nav.jsx`

| ใช้กับ | ความกว้าง |
|---|---|
| canvas แนวนอน (กระดาน kanban · ผังทีม) | **เต็มจอ** — `data-wide` |
| ตาราง/รายการหลายคอลัมน์ | 1280px — `data-wide` แล้วครอบ `max-w-7xl` ในหน้านั้นเอง |
| ฟอร์ม · ข้อความยาว · หน้าตั้งค่า | **ปล่อยค่าเริ่มต้น 1024px** (กว้างกว่านี้ตาต้องกวาดไกล อ่านยากกว่าเดิม) |

ตอนนี้ประกาศ `data-wide` แล้ว 2 โซน: `app/kanban/layout.js` · `app/team/layout.js`

### จอมือถือ — ออกแบบที่ **375px** เสมอ · ตรวจด้วยเครื่องก่อนส่งงาน

> เขียนกฎนี้ 2026-08-31 เพราะ user ต้องเป็นคนเปิดมือถือไปเจอเองทุกครั้งแล้วมาสั่งให้ไล่แก้
> (`12230e0 fix(team)`, `8408571 fix(case)`, `a97661d fix(kanban/board)` — reactive ทั้งหมด)
> เหตุผลเดียวกับ §Type scale: โซนใหม่เดาเอง แล้ว user รับบทเป็นคนตรวจ

**งบความกว้างจริง — ที่ 375px เหลือใช้ 336px** (`main px-1` 8px + `px-3` ของ layout โซน 24px + safe 7px)
ในโมดัลเหลือ ~288px · ตัวเลขนี้คือเพดานจริง ไม่ใช่ 375

⛔ **กับดักที่ทำให้ "ดูแล้วไม่เห็นพัง" ทั้งที่พัง:** Chrome บนมือถือ **ถ่าง layout viewport เองเมื่อเนื้อหาล้น**
(เช่น 375 → 409) แล้วย่อทั้งหน้าลงให้พอดีแทนที่จะตัด → เปิด DevTools แล้วดูเผินๆ "ไม่มีอะไรล้น"
แต่ของจริงบนเครื่อง user คือ **ทั้งหน้าถูกย่อจนตัวหนังสือเล็ก + ปุ่มริมขวากดไม่ถึง**
→ ต้องวัดเทียบ **ความกว้างจอที่ตั้งใจ** เสมอ ห้ามเทียบ `window.innerWidth`

**ตรวจด้วยเครื่อง — บังคับก่อนบอกว่าเสร็จ:**
```bash
node scripts/dev/mobileAudit.mjs --routes /หน้าที่แก้     # exit 1 = ยังมีจุดล้น
node scripts/dev/mobileAudit.mjs --all                    # กวาดทุกโซน
```
หน้าที่มี dropdown/modal ต้องเพิ่ม `steps` ใน `scripts/dev/mobileAudit.routes.mjs` ก่อน ไม่งั้นตรวจไม่ถึง

| ห้าม | ให้ทำแทน |
|---|---|
| แถวปุ่ม / segmented ยาวๆ ที่ไม่มีทางหนี | `flex-wrap` **หรือ** `<select>` ที่ `sm:hidden` คู่กับแถบปุ่ม `hidden sm:inline-flex` (ดู `Segmented` ใน `KanbanHome.jsx`) |
| `absolute` panel กว้างตายตัว (`w-64`, `w-72`) | เติม `max-w-[calc(100vw-1.5rem)]` เสมอ · หรือใช้ `w-full` ในกล่อง `relative` (`TagCombobox.jsx`) |
| กริดสองคอลัมน์ความกว้างตายตัวทุกจอ | `grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)]` (`FieldRow.jsx:25`) |
| `p-6` / `px-6` ในโมดัล | `p-4 sm:p-6` — คืนพื้นที่ 16px ที่จอ 375 |
| `opacity-0 group-hover:opacity-100` เป็นทางเดียวที่เข้าถึงปุ่ม | `opacity-100 sm:opacity-0 sm:group-hover:opacity-100` — **จอสัมผัสไม่มี hover** ปุ่มจะกดไม่ได้เลย |
| ปัดแนวนอน (`overflow-x-auto` เป็นทางแก้) | user เกลียดการปัด — ให้ซ้อนลงมาแล้วพับได้แทน (กระดาน kanban `flex-col … xl:grid`) |
| แถว flex ที่ลูกไม่มี `min-w-0` / ปุ่มไอคอนไม่มี `shrink-0` | ปุ่มไอคอน `h-9 w-9` ต้อง `shrink-0` เสมอ ไม่งั้นโดนบีบจนไม่เป็นสี่เหลี่ยม |

**ข้อความไทยหลอกตา:** เบราว์เซอร์หาจุดตัดบรรทัดตรงพยางค์ได้ (`"ยังไม่มีคน"` ตัดจาก `"ช่วย"`)
→ min-content แคบกว่าที่คิดมาก ข้อความสั้นๆ ก็ตกบรรทัดได้แม้จอกว้าง **ห้ามอนุมานจาก CSS เฉยๆ ต้องวัดจริง**

---

### Type scale — ใช้ 5 ขนาดนี้เท่านั้นทั้งโปรเจกต์

> เขียนกฎนี้ 2026-08-17 เพราะโซนใหม่ (kanban) เดาสเกลเองแล้วหลุดทั้งโซน — user ต้องมาไล่แก้ซ้ำทุกครั้งที่ทำแอพใหม่
> **ตัวเลขอ้างอิงของจริง:** `components/calling/` ใช้ `text-base` 74 จุด · `text-sm` 28 · `text-lg` 6 · `text-2xl` 5

| ใช้กับ | class |
|---|---|
| หัวหน้าเพจ (h1) | `text-2xl font-bold` |
| หัวข้อกอง / หัว modal (h2) | `text-lg font-medium` (กองในหน้า list ใช้ `font-semibold` ได้) |
| ชื่อการ์ด / หัวข้อย่อย (h3) | `text-base font-semibold` |
| **เนื้อความ · meta · ปุ่ม · input · ข้อความ error — ค่าเริ่มต้นของทุกอย่าง** | `text-base` |
| label ฟอร์ม · badge/chip · ตัวเลขกำกับ · hint | `text-sm` |

❌ **ห้ามใช้ `text-xs` และห้ามใช้ขนาดกำหนดเอง** (`text-[11px]`, `text-[13px]`) — เล็กสุดของโปรเจกต์คือ `text-sm`
❌ ห้ามใช้ `rounded-xl` กับการ์ด/กล่อง — การ์ดทั้งโปรเจกต์เป็น `rounded-lg`
❌ ปุ่มห้ามเป็น `px-3 py-1.5 text-sm` — ปุ่มมีขนาดเดียวคือ `px-4 py-2 text-base` (ดู §Primary button)
✅ ไอคอน `lucide-react` ใช้ `size={16}` เป็นค่าเริ่มต้น (18-20 เฉพาะปุ่มปิด/ไอคอนเดี่ยว)

**ก่อนเขียน component ใหม่:** เปิดไฟล์ใน `components/calling/` (เช่น `CampaignCard.jsx`, `SmsModal.jsx`) มาวางข้างจอแล้ว **ลอกคลาสมาตรงๆ** — ห้ามเขียนสเกลขึ้นเอง

#### Badge / Chip
```
px-3 py-1 text-sm font-medium rounded-full
```

---

### Component Patterns

#### Input / Select
```
h-11 px-3 text-base rounded-lg
border border-warm-200 dark:border-disc-border
bg-card-bg text-warm-900 dark:text-disc-text
placeholder-warm-400 dark:placeholder-disc-muted
focus:outline-none focus:ring-2 focus:ring-teal
```

#### Label
```
text-sm font-medium text-warm-700 dark:text-disc-muted mb-1
```

#### Textarea — **ต้องยืดตามข้อความเสมอ (fluid) ไม่มีข้อยกเว้น**
user ทักซ้ำหลายรอบ: กล่องข้อความความสูงตายตัวที่ต้องเลื่อน scroll ข้างในหรือลากมุมเอง = ผิดทั้งโปรเจกต์

```jsx
import useAutoGrow from '@/lib/useAutoGrow.js'

const ref = useAutoGrow(value)          // ← hook กลาง อย่าเขียนใหม่เอง
<textarea ref={ref} value={value} onChange={...}
  className="... resize-none overflow-hidden min-h-[140px]" />
```

- ❌ `rows={8}` + `style={{ resize: 'vertical' }}` เฉยๆ · ❌ `overflow-y-auto` ในกล่องพิมพ์
- ⚠️ ห้ามเรียก `autoGrow()` ซ้ำใน `onChange` — hook ทำให้แล้ว 1 ครั้งต่อ render · ใส่ซ้ำ = forced reflow 2 รอบต่อ 1 ตัวอักษร = พิมพ์สะดุดบนข้อความยาว
- ใช้แล้วที่: `components/case/CaseContentEditor.jsx`, `components/case/CaseManageActions.jsx` (`components/posts/PostEditor.jsx` มีสำเนาของตัวเองมาก่อน hook — ของใหม่ใช้ hook)

#### Card / Row item
```
border border-warm-200 dark:border-disc-border bg-card-bg
hover:bg-warm-50 dark:hover:bg-disc-hover
```

#### Primary button
```
bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2
```

#### Secondary / Cancel button
```
border border-warm-200 dark:border-disc-border
text-warm-900 dark:text-disc-text
hover:bg-warm-50 dark:hover:bg-disc-hover
rounded-lg text-base font-medium px-4 py-2
```

#### Phone number — ต้องเป็น link เสมอ
```jsx
<a href={`tel:${phone}`} className="text-teal font-medium">{phone}</a>
```

#### Note / remark text — italic + quote marks
```jsx
<p className="text-base text-warm-500 dark:text-disc-muted italic">"{note}"</p>
```

---

## Next.js Conventions

- Use **App Router** (not Pages Router)
- API routes in `app/api/`
- Auth via Discord OAuth → next-auth
- No custom user system → use `dc_members.discord_id` as FK
- **Server Components by default** — add `'use client'` only when needed
  ```js
  'use client'  // Only for client-side state, hooks
  ```

---

## Authentication

### Setup (next-auth)

```
Discord OAuth → next-auth config (lib/auth-options.js)
  → Validates Discord token
  → Checks dc_members.discord_id
  → Uses guild roles for finance access
```

### Get Current User

```js
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';

export default async function Page() {
  const session = await getServerSession(authOptions);
  if (!session) return <div>Not authenticated</div>;
  
  const { user } = session;
  // user.id = discord_id, user.name, user.email, user.image
}
```

---

## Finance System

### DB Tables

👉 See [md/DATABASE.md](DATABASE.md) for full schema

```
finance_accounts              User & org accounts
finance_transactions          Income/expense records
finance_categories            Category lookup (global + per-guild)
finance_account_rules         Pattern matching for auto-categorization
finance_config                Per-guild config (dashboard thread)
```

### Access Control

```
Private account           → Owner only
เหรัญญิก + ทีมจังหวัด    → Edit all province accounts
เหรัญญิก + ทีมภาค       → Edit all regional accounts
เหรัญญิก + Admin        → Edit all accounts
```

Check via `lib/financeAccess.js` — reads Discord roles from OAuth token.

### Account Visibility

```
Private   → Owner only
Internal  → Organization members (by hierarchy)
Public    → Anyone (no login needed)
```

### UX Rules

- Dropdowns sorted by `usage_count DESC` (frequent first)
- Categories: both global and per-guild
- Notifications configured via web only (no Discord command)

---

## Pages

### Current

```
/                          Home/redirect
/login                     Discord OAuth
/dashboard                 Account overview
/finance/accounts          CRUD accounts
/finance/transactions      CRUD transactions + filter
/finance/categories        Category management
/finance/report            Financial report
```

### Deferred

```
/settings                  Notification & email config
/finance/export            Excel/PDF export
/finance/budget            Budget & approval flow
/donate                    Public donate button
/recurring                 Recurring transactions
/summary                   Monthly summaries (auto)
```

---

## API Routes

### Finance Endpoints

```
POST   /api/finance/accounts
PATCH  /api/finance/accounts/[id]
DELETE /api/finance/accounts/[id]

POST   /api/finance/transactions
PATCH  /api/finance/transactions/[id]
DELETE /api/finance/transactions/[id]

POST   /api/finance/categories
PATCH  /api/finance/categories/[id]

GET    /api/finance/report
```

### Auth Endpoints

```
GET    /api/auth/[...nextauth]     next-auth handlers
```

---

## Common Patterns

### URL-based Filter State (บังคับใช้ในทุกหน้าที่มี filter)

Filter state ต้องอยู่ใน URL เสมอ — reload กลับมา state เดิม, share link ได้

```js
'use client'
import { useSearchParams, useRouter } from 'next/navigation'

export default function Page() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // อ่านค่าเริ่มต้นจาก URL
  const [filterFoo, setFilterFoo] = useState(() => searchParams.get('foo') || '')
  const [filterBar, setFilterBar] = useState(() => searchParams.get('bar') || '')

  // Sync filter → URL ทุกครั้งที่เปลี่ยน
  useEffect(() => {
    const p = new URLSearchParams()
    if (filterFoo) p.set('foo', filterFoo)
    if (filterBar) p.set('bar', filterBar)
    const qs = p.toString()
    router.replace(qs ? `/path?${qs}` : '/path', { scroll: false })
  }, [filterFoo, filterBar])
}
```

**หน้าที่ใช้แล้ว:**
- `/calling/[campaignId]` — district, tier, status, assignee, rsvp
- `/calling/pending` — campaign, status, rsvp

**กฎ:**
- default filter = `''` (ทั้งหมด) ไม่ใช่ hardcode ค่าใดค่าหนึ่ง
- ค่าว่าง → ไม่ append ใน URL (URL สะอาด)
- ใช้ `router.replace` ไม่ใช่ `push` (ไม่สะสม history)



### Server Component with Database

```js
// app/finance/accounts/page.js
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { getAccounts } from '@/db/finance/accounts';

export default async function Page() {
  const session = await getServerSession(authOptions);
  const accounts = await getAccounts(session.user.id);
  
  return (
    <div>
      {accounts.map(acc => (
        <div key={acc.id}>{acc.name}</div>
      ))}
    </div>
  );
}
```

### Client Component with Form

```js
'use client'

import { useState } from 'react';

export default function AccountForm() {
  const [name, setName] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/finance/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    // ...
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit">Create</button>
    </form>
  );
}
```

### Check Finance Access

```js
import { canEditAccount } from '@/lib/financeAccess';

const canEdit = await canEditAccount(session.user, accountId);
if (!canEdit) return { error: 'Unauthorized' };
```

---

## Deployment

👉 See [md/DEPLOYMENT.md](DEPLOYMENT.md)

```bash
# Production build & restart
sudo -u www npm run build
pm2 restart pple-web

# Full deploy (from root)
./deploy.sh --production
```

---

## Preferences

- Confirm Q&A before writing code
- Ask directly (casual is fine)
- Code must be runnable / copy-paste friendly
- No over-engineering

---

## Off-limits

- `.env` — never read or display values

## 🌍 i18n — เว็บ + bot รองรับหลายภาษา (จด 2026-07-09 · วางรางเสร็จ local 2026-07-09)
> ย้ายมาจาก md/PENDING.md (2026-07-29)

> string ไทย hardcode อยู่ ~2,500 บรรทัด/201 ไฟล์ (web) + ~1,500 บรรทัด/70 ไฟล์ (bot) · **รางวางแล้ว** — โค้ดใหม่ต้องใช้ t() เสมอ (กติกาใน CLAUDE.md) หนี้จะหยุดโต ของเก่าทยอย migrate

### ✅ รางที่วางแล้ว (ยังไม่ deploy)
- **เว็บ:** next-intl 4.13.1 (ไม่มี locale routing) · locale จาก cookie `locale` default `th` · config: `web/i18n/request.js`, strings: `web/locales/{th,en}.json` · ใช้: `useTranslations` (client) / `getTranslations` (server)
- **Bot:** `services/i18n.js` — `const t = await getT(guildId)` → `t('common.error')` · locale ต่อ guild = `dc_guild_config` key `locale` ผ่าน resolveConfig (guild > global, cache 5 นาที) · strings: `locales/{th,en}.json`
- ไม่ต้อง migrate schema — `dc_guild_config` เป็น key-value อยู่แล้ว

### ⏳ งานที่เหลือ (ทยอยตามสะดวก)
- [x] **finance — เสร็จครบทั้งโซน (2026-07-09)** — ทุกไฟล์ใน `web/app/finance/**` + `web/components/finance/**` migrate แล้ว · dictionary 113 keys th=en ตรงกัน · ทุก route โหลดผ่าน · ใช้ i18n-migrator (Sonnet) 3 ก้อน
  - ⚠️ **ยังไม่ได้แปล:** อาเรย์ `BANKS`/`PROVINCES` ใน `AccountFormFields.jsx` เว้นไว้ตั้งใจ (เป็นข้อมูล domain ผูก DB + financeAccess.js) — ถ้าจะรองรับ en จริงต้องทำ mapping แยก ไม่ใช่แค่ t() → เป็น design decision ทีหลัง
  - shared component ที่ finance ใช้แต่อยู่ `web/components/` (BankBadge, CategorySelect, AccountSelect) — ยังไม่แตะ รอเคาะ namespace กลางตอน migrate โซนที่ใช้ร่วม
- [x] **calling — เสร็จครบทั้งโซน (2026-07-10)** — ทุกไฟล์ `web/app/calling/**` + `web/components/calling/**` migrate แล้ว · `calling` namespace 277 keys th=en · verify ทุก route 200 + i18n สลับ th/en ได้ · ใช้ i18n-migrator (Sonnet) 7 ก้อน
  - ⚠️ follow-up: **gauge labels ในหน้า stats มาจาก `web/app/api/calling/stats/route.js`** (API generate ข้อความไทย server-side) — ไม่ได้อยู่ในไฟล์ UI เลยยังไม่ได้แปล ต้องทำแยกถ้าจะรองรับ en เต็ม
  - ⚠️ follow-up: tooltip ดาว `StarredStar` (calling.starredStar.*) ถ้อยคำต่างจาก `calling.assignee.starTitle/unstarTitle` — พิจารณารวมให้เป็นคำเดียว
- [x] **case — เสร็จครบทั้งโซน (2026-07-14)** — ทั้ง 14 ไฟล์ `web/app/case/**` + `web/components/case/**` migrate แล้ว · `case` namespace 140 keys th=en ตรงกัน · build compile ผ่าน + ทุก route verify 200/307 · ใช้ i18n-migrator (Sonnet) 5 ก้อน
  - ⚠️ follow-up: status/action display labels ใน `web/lib/caseOptions.js` (`statusLabel`) + `web/lib/caseOptionsClient.js` (`STATUS_LABELS`) ยัง hardcode ไทย — เป็น lookup keyed ด้วย DB enum value ไม่ได้อยู่ในไฟล์ UI เลยยังไม่แตะ ต้องทำ mapping แยกถ้าจะรองรับ en เต็ม
  - ⚠️ เว้นตั้งใจ: `CASE_CLOSE_REASONS` values (เก็บลง DB ตรงๆ) + province data list = domain data ผูก DB ไม่แปล
- [x] UI เปลี่ยนภาษาบนเว็บ (2026-07-09) — `web/components/LocaleSwitcher.jsx` (ปุ่ม ไทย/EN) วางในเมนู hamburger ถัดจาก dark mode toggle · set cookie `locale` + `router.refresh()`

