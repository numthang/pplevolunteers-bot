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
  index.js                     MySQL pool
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
- **Database:** MySQL (`pple_volunteers`)
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
