#!/bin/bash
# ./deploy.sh                                        → deploy local (GUILD_ID ใน .env)
# ./deploy.sh 'commit message'                       → git push + deploy local
# ./deploy.sh --guild <guildId>                      → deploy local ไป guild ที่ระบุ
# ./deploy.sh 'commit message' --guild <guildId>     → git push + deploy local ไป guild ที่ระบุ
# ./deploy.sh --production                           → deploy production (GUILD_ID ใน .env)
# ./deploy.sh --production --guild <guildId>         → deploy production ไป guild ที่ระบุ
#
# Known Guild IDs:
#   อาสาประชาชน  : 1340903354037178410  (ค่า default ใน .env)
#   ราชบุรี      : 1111998833652678757

GUILD_ARG=""
COMMIT_MSG=""
IS_PRODUCTION=false

for arg in "$@"; do
  if [ "$arg" = "--production" ]; then
    IS_PRODUCTION=true
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
  echo "🚀 กำลัง deploy production... ${GUILD_ARG:+($GUILD_ARG)}"
  sudo -u www bash << EOF
export PATH=/www/server/nodejs/v24.14.0/bin:\$PATH
cd /www/wwwroot/pple_dcbot
git checkout -- package.json package-lock.json
git fetch origin
git reset --hard origin/master
#git pull
node deploy-commands.js $GUILD_ARG
pm2 restart pple-dcbot
echo "✅ Deploy production เสร็จแล้ว"
EOF

else
  if [ -n "$COMMIT_MSG" ]; then
    echo "🚀 กำลังดันโค้ดขึ้น Git..."
    git add .
    git commit -m "$COMMIT_MSG"
    git push
    echo "✅ โค้ดขึ้น Git แล้ว"
  fi

  echo "🔄 กำลัง deploy local... ${GUILD_ARG:+($GUILD_ARG)}"
  node deploy-commands.js $GUILD_ARG
  node index.js
fi