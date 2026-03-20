#!/bin/bash
sudo -u www bash << 'EOF'
export PATH=/www/server/nodejs/v24.14.0/bin:$PATH
cd /www/wwwroot/pplevolunteers-bot
git pull
node deploy-commands.js
pm2 restart pplevolunteers-bot
echo "✅ Deploy เสร็จแล้ว"
EOF