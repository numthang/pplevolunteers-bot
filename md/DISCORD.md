# Discord.js v14 Conventions

Core conventions and patterns for discord.js Bot commands and handlers.

---

## Code Conventions

- **`MessageFlags.Ephemeral`** instead of `{ ephemeral: true }`
  ```js
  await interaction.reply({ content: 'text', flags: MessageFlags.Ephemeral });
  ```

- **Thread parent channel** — always use `parentId`
  ```js
  const channelId = channel.isThread() ? (channel.parentId ?? channel.id) : channel.id
  ```

- **Discord mention syntax:**
  ```
  <#CHANNEL_ID>     channel mention
  <@USER_ID>        user mention
  <@&ROLE_ID>       role mention
  ```

- **Command names** use hyphens: `stat-server`, `panel-finance`, etc.

- **Command-first principle** — every GUI button must have a backing slash command

- **Always ask** default ephemeral or public, then add `public` Boolean option

- **`interaction.options.getChannel()`** returns partial object → must use `guild.channels.cache.get(id)` instead

- **`customId` limit 100 chars** — don't encode Thai text; use embed title instead

---

## Key Commands

| Command | File | Purpose |
|---|---|---|
| `/panel` | `commands/panel.js` | Main control panel |
| `/register` | `commands/register.js` | User registration |
| `/stat` / `/stat-*` | `commands/stat.js` | Activity statistics |
| `/user` | `commands/user.js` | User info |
| `/orgchart` | `commands/orgchart.js` | Organization chart |
| `/forum` | `commands/forum.js` | Forum search & management |
| `/rate` | `commands/rate.js` | User ratings |
| `/record` | `commands/record.js` | Activity recording |
| `/sticky` | `commands/sticky.js` | Pin/sticky messages |

---

## Key Handlers

| File | Triggered by | Purpose |
|---|---|---|
| `forumSearch.js` | `forum_search` button, modal, pagination | Search & display forum posts |
| `forumDashboard.js` | `forum_refresh_{channelId}` button | Refresh forum dashboard |
| `financeDashboard.js` | Finance buttons | Finance dashboard interactions |
| `openInterest.js` | `btn_open_interest` | Open interest panel |
| `openProvince.js` | `btn_open_province` | Open province panel |
| `rateStars.js` | Rate star buttons | Star rating submission |
| `ratingPage.js` | Rating pagination | Rating list pagination |
| `statHandler.js` | Stat pagination | Stats pagination |

---

## Role Hierarchy

### Role Structure

```
Admin                 → Full permissions
รองเลขาธิการ          → Central-level
ผู้ประสานงานภาค       → Regional-level
ผู้ประสานงานจังหวัด   → Province-level
กรรมการจังหวัด        → Province-level
เหรัญญิก              → Finance permissions (scoped by role)
```

Role maps: `PROVINCE_ROLES`, `SUB_REGION_ROLES`, `MAIN_REGION_ROLES` (see `config/roles.js`)

### Finance Access Control

```
เหรัญญิก + ทีมจังหวัด  → Edit all province accounts
เหรัญญิก + ทีมภาค     → Edit all regional accounts
เหรัญญิก + Admin      → Edit all accounts
private account       → Owner only
```

---

## Score Formula

```
score = messages × 10 + voiceSeconds + mentions × 30
```

(see `db/` functions for ranking)
