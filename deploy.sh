#!/bin/bash
# ./deploy.sh                                        → deploy local (GUILD_ID ใน .env)
# ./deploy.sh 'commit message'                       → git push + deploy local
# ./deploy.sh --guild <guildId>                      → deploy local ไป guild ที่ระบุ
# ./deploy.sh 'commit message' --guild <guildId>     → git push + deploy local ไป guild ที่ระบุ
# ./deploy.sh --production                           → deploy production (GUILD_ID ใน .env)
# ./deploy.sh --production --guild <guildId>         → deploy production ไป guild ที่ระบุ
# ./deploy.sh --production --bot-only                → deploy production เฉพาะ bot (ไม่ build web)
#
# Known Guild IDs:
#   อาสาประชาชน  : 1340903354037178410  (ค่า default ใน .env)
#   ราชบุรี      : 1111998833652678757

GUILD_ARG=""
COMMIT_MSG=""
IS_PRODUCTION=false
BOT_ONLY=false

for arg in "$@"; do
  if [ "$arg" = "--production" ]; then
    IS_PRODUCTION=true
  elif [ "$arg" = "--bot-only" ]; then
    BOT_ONLY=true
  elif [ "$arg" = "--guild" ]; then
    : # จะรับ value ใน loop ถัดไป
  elif [ -n "$PREV" ] && [ "$PREV" = "--guild" ]; then
    GUILD_ARG="--guild $arg"
  elif [ "$arg" != "--production" ]; then
    COMMIT_MSG="$arg"
  fi
  PREV="$arg"
done

if $IS_PRODUCTION; then
  if $BOT_ONLY; then
    echo "🚀 กำลัง deploy production (bot only)... ${GUILD_ARG:+($GUILD_ARG)}"
  else
    echo "🚀 กำลัง deploy production... ${GUILD_ARG:+($GUILD_ARG)}"
  fi
  sudo -u www bash -s -- "$GUILD_ARG" "$BOT_ONLY" << 'EOF'
GUILD_ARG=$1
BOT_ONLY=$2
export PATH=/www/server/nodejs/v24.14.0/bin:$PATH
cd /www/wwwroot/pple-volunteers
git checkout -- package.json package-lock.json
git fetch origin
git reset --hard origin/master
#git pull

# Bot
npm install --omit=dev
if [ -n "$GUILD_ARG" ]; then
  node deploy-commands.js $GUILD_ARG
else
  node deploy-commands.js --global
fi
pm2 restart pple-dcbot --time

if [ "$BOT_ONLY" = "false" ]; then
  # Web — หยุด web ก่อน build เพื่อคืน RAM
  #pm2 stop pple-web 2>/dev/null || true
  cd web
  npm install --omit=dev
  npm run build
  pm2 restart pple-web --time || pm2 start npm --name pple-web --time -- start
  pm2 save
fi

echo "✅ Deploy production เสร็จแล้ว"
EOF

else
  # ป้องกันรัน local mode บน production server
  if [ -d "/www/wwwroot" ]; then
    echo "⚠️  ดูเหมือนจะอยู่บน production server!"
    echo "    ถ้าต้องการ deploy production ให้ใช้: ./deploy.sh --production"
    read -p "    ยืนยันจะรัน local mode? (y/N) " confirm
    [ "$confirm" != "y" ] && exit 1
  fi

  if [ -n "$COMMIT_MSG" ]; then
    echo "🚀 กำลังดันโค้ดขึ้น Git..."
    git add .
    git commit -m "$COMMIT_MSG"
    git push origin master
    echo "✅ โค้ดขึ้น Git แล้ว"
  fi

  echo "🔄 กำลัง deploy local... ${GUILD_ARG:+($GUILD_ARG)}"
  git pull
  node deploy-commands.js $GUILD_ARG
  (cd web && npm run dev) &
  node index.js
fi