#!/bin/bash
sudo -u www bash << 'EOF'
cd /www/wwwroot/pplevolunteers-bot
git pull
/www/server/nodejs/v24.14.0/bin/node deploy-commands.js
/www/server/nodejs/v24.14.0/bin/pm2 restart pplevolunteers-bot
echo "✅ Deploy เสร็จแล้ว"
EOF