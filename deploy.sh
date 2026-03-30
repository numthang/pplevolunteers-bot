#!/bin/bash
# ./deploy.sh                  → deploy local (guild)
# ./deploy.sh 'commit message' → git push + deploy local (guild)
# ./deploy.sh --production     → deploy production (VPS)

if [ "$1" = "--production" ]; then
  echo "🚀 กำลัง deploy production..."
  sudo -u www bash << 'EOF'
export PATH=/www/server/nodejs/v24.14.0/bin:$PATH
cd /www/wwwroot/pplevolunteers-bot
git pull
node deploy-commands.js
pm2 restart pplevolunteers-bot
echo "✅ Deploy production เสร็จแล้ว"
EOF

else
  if [ -n "$1" ]; then
    echo "🚀 กำลังดันโค้ดขึ้น Git..."
    git add .
    git commit -m "$1"
    git push
    echo "✅ โค้ดขึ้น Git แล้ว"
  fi

  echo "🔄 กำลัง deploy local..."
  node deploy-commands.js
  node index.js
fi
