# Architecture — เว็บ Next.js ภาพรวม

> **ไฟล์นี้ตอบว่า "ระบบประกอบด้วยอะไร อยู่ตรงไหน"** — เปิดเมื่อต้องการ ไม่ต้องอ่านทุกครั้งก่อนแก้โค้ด
> · กฎหน้าตา (คลาส · สี · type scale · มือถือ) → [../rules/DESIGN.md](../rules/DESIGN.md)
> · แพตเทิร์นโค้ด (filter state · server component · ฟอร์ม · i18n) → [../rules/CODE.md](../rules/CODE.md)
> · schema → [DATABASE.md](DATABASE.md) · ขั้นตอน deploy → [DEPLOYMENT.md](DEPLOYMENT.md)
>
> แยกออกมาจาก `md/rules/DESIGN.md` เมื่อ 2026-09-19 (ไฟล์เดิมทำ 4 หน้าที่ในไฟล์เดียว 674 บรรทัด ≈ 13,500 token
> แต่ถูกสั่งให้อ่าน **ทุกครั้ง** ก่อนแก้ `web/`)

---

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
📄 See [md/modules/finance/FINANCE.md](../modules/finance/FINANCE.md)

### 2. **PPLE Calling** (`/calling/*`)
Member calling system with tier tracking and assignment management.  
📄 See [md/modules/calling/CALLING.md](../modules/calling/CALLING.md)

### 3. **PPLE Docs** (`/docs/*`, planned)
E-signature & document management for activity registration forms.  
📄 See [md/modules/docs/DOCS.md](../modules/docs/DOCS.md)

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

📄 See [md/modules/discord/BOT.md](../modules/discord/BOT.md) สำหรับ basket posting + X thread split + scheduling rules

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
See: [FINANCE.md - RBAC](../modules/finance/FINANCE.md#access-control-rbac) | [CALLING.md - Permission](../modules/calling/CALLING.md#permission--access-control)

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

## Deployment

👉 See [md/reference/DEPLOYMENT.md](DEPLOYMENT.md)

```bash
# Production build & restart
sudo -u www npm run build
pm2 restart pple-web

# Full deploy (from root)
./deploy.sh --production
```
