#!/bin/bash
# ./deploy.sh                                        → deploy local (GUILD_ID ใน .env)
# ./deploy.sh 'commit message'                       → git push + deploy local
# ./deploy.sh --guild <guildId>                      → deploy local ไป guild ที่ระบุ
# ./deploy.sh 'commit message' --guild <guildId>     → git push + deploy local ไป guild ที่ระบุ
# ./deploy.sh --production                           → deploy production (GUILD_ID ใน .env)
# ./deploy.sh --production --guild <guildId>         → deploy production ไป guild ที่ระบุ
# ./deploy.sh --production --bot-only                → deploy production เฉพาะ bot (ไม่ build web)
#
# โหมด --production รัน `npm run migrate up` ให้เองก่อน restart ทุกตัว (ล้ม = หยุด deploy)
# ไม่ต้องรัน migration แยกอีกแล้ว · โหมด local ไม่แตะ DB ให้ — รันเองเมื่อจำเป็น
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

# จับเวลาแต่ละขั้น — เครื่อง prod มี 2 core + RAM 4GB จะรู้ว่าขั้นไหนกินเวลาจริงต้องวัด
# ไม่ใช่เดาจาก spinner ที่เห็นค้าง: npm พิมพ์ warning ของ aaPanel (init.module) ก่อนทุกคำสั่ง
# รวม `npm run build` ด้วย ทำให้ดูเหมือนค้างที่ npm install ทั้งที่ตัวที่ช้าคือ next build ต่อจากนั้น
T_START=$(date +%s); T_LAST=$T_START
step() {
  local now=$(date +%s)
  echo "⏱  $1 — $((now-T_LAST))s (รวม $((now-T_START))s)"
  T_LAST=$now
}
git checkout -- package.json package-lock.json
git fetch origin
git reset --hard origin/master
#git pull
#git pull = fetch + merge → ถ้า prod มีแก้ค้าง (เช่น package.json) จะ conflict แล้วค้างกลางคัน
#git reset --hard = โยนของบน prod ทิ้ง บังคับให้ตรง origin/master เป๊ะ ไม่มี conflict
step "git pull"

# Bot
npm install --omit=dev --no-audit --no-fund
step "npm install (bot)"

# DB schema ต้องขึ้นก่อนโค้ดที่ใช้มันเสมอ — วางไว้ก่อน restart ทุกตัว
# ⛔ ล้ม = หยุด deploy ทั้งก้อน ห้าม build/restart ต่อ: โค้ดใหม่ทับ schema เก่า = พังเงียบ
#    (หาเหตุยากกว่า deploy ค้างกลางคันเยอะ) · ของเดิมยังรันอยู่ = ยังตรงกับ schema เดิม
# ℹ️ node-pg-migrate อยู่ใน dependencies (ไม่ใช่ devDependencies) จึงรอด --omit=dev ข้างบน
# ℹ️ ไม่มี migration ค้าง = ตอบ "No migrations to run!" แล้ว exit 0 ตามปกติ ไม่ต้องแยกเคส
echo "🗄️  migrate…"
if ! npm run migrate up; then
  echo "❌ migration ล้ม — หยุด deploy (บอท/เว็บยังเป็นตัวเก่าที่ตรงกับ schema เดิม)"
  exit 1
fi
step "migrate"

# guild-level เท่านั้น — ห้ามกลับไปใช้ --global
# global กับ guild-level อยู่คนละ scope Discord ไม่ merge ให้ ถ้ามีทั้งคู่ = เมนูเบิ้ลทุก client
# แถม global รอ propagate ถึง 1 ชม. ส่วน guild-level เปลี่ยนทันที
# guild ทั้งหมดมาจาก dc_guilds ซึ่ง upsertGuilds() ใน index.js sync ให้เองตอนบอท ready
node deploy-commands.js $GUILD_ARG
step "deploy-commands"
pm2 restart pple-dcbot --time
step "restart bot"

if [ "$BOT_ONLY" = "false" ]; then
  # Web — หยุด web ก่อน build เพื่อคืน RAM (กัน OOM: web เก่า + next build กิน RAM พร้อมกัน)
  pm2 stop pple-web 2>/dev/null || true
  cd web
  npm install --omit=dev --no-audit --no-fund
  step "npm install (web)"
  npm run build
  step "next build"
  pm2 restart pple-web --time || pm2 start npm --name pple-web --time -- start
  pm2 save
  step "restart web"
fi

echo "✅ Deploy production เสร็จแล้ว (รวม $(( $(date +%s) - T_START ))s)"
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