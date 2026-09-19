# Code Rules — แพตเทิร์นโค้ดที่บังคับใช้

> **อ่านก่อนลงมือเขียนโค้ดใน `web/`** — ไฟล์นี้ตอบว่า "เขียนยังไงให้เหมือนที่เหลือทั้งโปรเจกต์"
> · กฎหน้าตา → [DESIGN.md](DESIGN.md) · ภาพรวมระบบ → [../reference/ARCHITECTURE.md](../reference/ARCHITECTURE.md)
>
> แยกออกมาจาก `md/rules/DESIGN.md` เมื่อ 2026-09-19

## กฎที่มีเครื่องบังคับอยู่แล้ว — อย่าเขียนซ้ำที่นี่

กฎ 3 ข้อข้างล่างมี **ESLint / hook คอยตี** และเขียนไว้ครบใน [`CLAUDE.md`](../../CLAUDE.md) แล้ว
ที่นี่แค่ชี้ไป **ห้ามลอกเนื้อกฎมาไว้ที่นี่** (มี 2 ชุดเมื่อไหร่ = เพี้ยนกันเองเมื่อนั้น):

| กฎ | เครื่องที่บังคับ | อยู่ที่ |
|---|---|---|
| Query ต้องอยู่ใน `db/` เท่านั้น | `npm run lint:all` + `.claude/hooks/block-direct-db.js` | `CLAUDE.md §Query ต้องอยู่ใน db/` |
| Create มีปุ่มบันทึก · Update autosave | — (ตรวจด้วยตา) | `CLAUDE.md §กฎการบันทึก` · `DESIGN.md §6` |
| โค้ดใหม่ห้าม hardcode ข้อความ ต้องผ่าน `t()` | — | `CLAUDE.md §i18n` + §i18n ท้ายไฟล์นี้ |

> 📊 **หลักฐานว่าทำไมต้องมีเครื่องบังคับ** (วัด 2026-09-19): กฎที่มีเครื่องตรวจ ละเมิด **0 จุด** ·
> กฎที่มีแต่ข้อความในเอกสาร ละเมิด **16–403 จุด** ทุกข้อ → อะไร lint ได้ อย่าเขียนลงเอกสารอย่างเดียว

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

## Preferences

- Confirm Q&A before writing code
- Ask directly (casual is fine)
- Code must be runnable / copy-paste friendly
- No over-engineering

---

## Off-limits

- `.env` — never read or display values

---

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
