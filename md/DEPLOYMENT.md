# Production Deployment — VPS Setup

Production VPS hosting both Discord Bot and Next.js Web app.

---

## VPS Info

- **Host:** Production VPS
- **Path:** `/www/wwwroot/pple-volunteers/`
- **Git branch:** `master` (not `main`)
- **User:** `www` (all commands use `sudo -u www`)

---

## Key Rules

🔴 **IMPORTANT: All commands must run as `www` user**

```bash
sudo -u www node scripts/xxx.js
sudo -u www npm run build
sudo -u www npm install
```

**Never run as root!**

---

## PM2 Management

### Discord Bot (pple-dcbot)

```bash
# View status
pm2 show pple-dcbot

# View logs (last 20 lines)
pm2 logs pple-dcbot --lines 20

# Restart
pm2 restart pple-dcbot

# Stop
pm2 stop pple-dcbot

# Start
pm2 start pple-dcbot
```

### Next.js Web (pple-web)

```bash
# View status
pm2 show pple-web

# View logs
pm2 logs pple-web --lines 20

# Restart
pm2 restart pple-web

# Stop
pm2 stop pple-web

# Start
pm2 start pple-web
```

### All Apps

```bash
# List all
pm2 list

# Restart all
pm2 restart all

# View all logs
pm2 monit
```

---

## Deploy Commands

### Full Deploy (Bot + Web)

```bash
# From repo root
./deploy.sh --production

# With guild ID
./deploy.sh --production --guild <guildId>
```

This:
1. Deploys slash commands
2. Rebuilds Next.js web app
3. Restarts PM2 processes

### Bot Only (Deploy Commands)

```bash
node deploy-commands.js
node deploy-commands.js --guild <guildId>
```

### Web Only

```bash
cd web
sudo -u www npm install --omit=dev
sudo -u www npm run build
pm2 restart pple-web
```

### Manual Full Deploy

```bash
# 1. Pull latest
git pull origin master

# 2. Deploy bot commands
node deploy-commands.js

# 3. Build & restart web
cd web
sudo -u www npm install --omit=dev
sudo -u www npm run build
pm2 restart pple-web

# 4. Restart bot
pm2 restart pple-dcbot
```

---

## Running Scripts

### One-off Scripts (nohup)

For long-running scripts that need to survive terminal disconnect:

```bash
sudo -u www bash -c 'nohup node scripts/backfill-forum.js > /www/wwwroot/pple-volunteers/logs/backfill.log 2>&1 &'
```

**Important:** Must use `bash -c '...'` so redirect works with `www` user.

### Direct Script Execution

```bash
sudo -u www node scripts/backfill-forum.js
sudo -u www node scripts/backfill-calling.js
```

---

## Environment Variables

Both bot and web read from `.env` in root and `web/` directories.

**Never commit `.env`** — set on VPS directly.

Common vars:
```
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DATABASE_URL=mysql://pple_dcbot:...@localhost/pple_volunteers
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://pplethai.org
MEILISEARCH_HOST=...
MEILISEARCH_KEY=...
```

---

## Logs

### Bot Logs

```bash
pm2 logs pple-dcbot --lines 50
tail -f /www/wwwroot/pple-volunteers/logs/app.log
```

### Web Logs

```bash
pm2 logs pple-web --lines 50
```

### Custom Scripts

```bash
tail -f /www/wwwroot/pple-volunteers/logs/backfill.log
tail -f /www/wwwroot/pple-volunteers/logs/calling.log
```

---

## Database

### Backup

```bash
# Manual backup
sudo -u www mysqldump -u pple_dcbot -p pple_volunteers > /www/wwwroot/pple-volunteers/backups/backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore

```bash
sudo -u www mysql -u pple_dcbot -p pple_volunteers < /www/wwwroot/pple-volunteers/backups/backup_20240101_000000.sql
```

---

## Meilisearch

### Status

```bash
ps aux | grep meilisearch
```

### Start

```bash
sudo /usr/local/bin/meilisearch --data-path /www/wwwroot/pple-volunteers/data.ms/
```

### Stop

```bash
sudo pkill -f meilisearch
```

---

## Monitoring

### System Resources

```bash
# Check CPU/memory
top
htop

# Check disk
df -h
```

### Process Status

```bash
pm2 list
pm2 show pple-dcbot
pm2 show pple-web
```

### Network (ports)

```bash
# Check if ports are listening
netstat -tuln | grep -E '3000|5432|9200'
lsof -i :3000  # Next.js
```

---

## Troubleshooting

### Bot not responding

```bash
pm2 logs pple-dcbot --lines 100
pm2 restart pple-dcbot
```

### Web app 500 error

```bash
pm2 logs pple-web --lines 100
# Check database connection
mysql -u pple_dcbot -p -e "USE pple_volunteers; SELECT COUNT(*) FROM dc_members LIMIT 1;"
```

### Database connection failed

```bash
# Test connection
mysql -u pple_dcbot -p pple_volunteers -e "SELECT 1"

# Check if MySQL running
ps aux | grep mysqld
```

### Meilisearch down

```bash
ps aux | grep meilisearch
# If down, forum search falls back to MySQL LIKE (works but slower)
```

---

## Git Workflow

```bash
# On local machine
git checkout -b feature/xxx
# ... make changes ...
git commit -m "..."
git push -u origin feature/xxx
# Create PR on GitHub

# After PR merge to main
git checkout master
git pull origin master

# On VPS (from repo root)
git pull origin master
./deploy.sh --production
```

---

## Security Notes

- **Never expose `.env`** values
- **Always use `sudo -u www`** for file/process ownership consistency
- **Check logs regularly** for errors, SQL issues, auth failures
- **Backup database** before major changes
- **Test on staging** before production deploy

---

## Contact

For VPS access issues or emergencies: [admin contact info]
