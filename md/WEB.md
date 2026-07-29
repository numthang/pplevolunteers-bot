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
  - `news_channel_id` ยังอยู่ `dc_guild_config` (Discord artifact ราย guild)
- **Accounts** เก็บใน `dc_social_accounts`
  - `user_discord_id` + `guild_id` + `platform` + `social_id` (unique)
  - `visibility`: `public` (guild-wide) / `private` (เฉพาะ user เจ้าของ)
  - `group_name`: ชื่อกลุ่มสำหรับ basket Row 1 (เช่น "ปชช.ราชบุรี", "Unnop ส่วนตัว")
  - X stores creds เป็น JSON `{access_token, access_token_secret}` ใน `access_token` column (consumer key/secret มาจาก guild_config)
  - IG/Threads ใช้ `user_token` (Meta ปิด Page Token สำหรับ IG)

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

