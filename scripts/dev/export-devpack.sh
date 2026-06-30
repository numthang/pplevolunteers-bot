#!/bin/bash
# export-devpack.sh — สร้างชุดไฟล์สำหรับ dev (dump ที่ anonymize แล้ว + .env.example)
# รัน: bash scripts/dev/export-devpack.sh
# ต้องมี psql และ pg_dump ใน PATH, และมีสิทธิ์ create/drop database

set -e

# อ่าน DB config จาก .env
if [ -f .env ]; then
  export $(grep -E '^DB_' .env | xargs)
fi

DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-pple_dcbot}"
DB_NAME="${DB_NAME:-pple_volunteers}"
TEMP_DB="${DB_NAME}_devexport_tmp"
OUT_DIR="./devpack"
DUMP_FILE="$OUT_DIR/devdata.sql"
ENV_FILE="$OUT_DIR/.env.example"

echo "=== PPLE Dev Pack Export ==="
echo "Source: $DB_NAME @ $DB_HOST"
echo "Temp DB: $TEMP_DB"
echo "Output: $OUT_DIR/"
echo ""

mkdir -p "$OUT_DIR"

# 1. Dump schema + data จาก prod
echo "[1/4] Dumping $DB_NAME..."
PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" \
  --no-owner --no-acl \
  -f /tmp/pple_raw_dump.sql
echo "      Done."

# 2. Import เข้า temp DB
echo "[2/4] Creating temp DB and importing..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $TEMP_DB;" postgres
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -c "CREATE DATABASE $TEMP_DB;" postgres
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEMP_DB" -f /tmp/pple_raw_dump.sql -q
echo "      Done."

# 3. Anonymize
echo "[3/4] Anonymizing PII and redacting tokens..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$TEMP_DB" -q << 'SQL'
-- Phone numbers
UPDATE ngs_member_cache SET phone = CONCAT('08', LPAD(id::text, 8, '0')) WHERE phone IS NOT NULL;
UPDATE calling_contacts  SET phone = CONCAT('09', LPAD(id::text, 8, '0')) WHERE phone IS NOT NULL;

-- Tokens ใน guild config
UPDATE dc_guild_config SET value = 'REDACTED'
WHERE key LIKE '%token%'
   OR key LIKE '%secret%'
   OR key LIKE '%key%'
   OR key LIKE '%password%';
SQL
echo "      Done."

# 4. Export temp DB → clean dump
echo "[4/4] Exporting clean dump..."
PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" -U "$DB_USER" "$TEMP_DB" \
  --no-owner --no-acl \
  -f "$DUMP_FILE"

# Cleanup temp DB
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -c "DROP DATABASE $TEMP_DB;" postgres
rm /tmp/pple_raw_dump.sql
echo "      Done."

# 5. สร้าง .env.example
# อ่าน GUILD_ID จาก .env (server ที่ใช้ทดสอบ — ไม่ sensitive)
_guild_id=$(grep '^GUILD_ID=' .env 2>/dev/null | cut -d= -f2-)

cat > "$ENV_FILE" << EOF
# =========================================================
# Dev Setup — Web เท่านั้น: รัน cd web && npm run dev
# ถ้าต้องการทดสอบ bot ด้วย ให้ขอ bot token แยกจากเจ้าของโปรเจกต์
# =========================================================

# Database (กรอกเอง)
DB_HOST=localhost
DB_USER=
DB_PASS=
DB_NAME=pple_volunteers

# Discord Bot — ขอ token จากเจ้าของโปรเจกต์ถ้าต้องทดสอบ bot
DISCORD_BOT_TOKEN=
DISCORD_BOT_CLIENT_ID=
DISCORD_BOT_INVITE_URL=
DISCORD_BOT_INVITE_URL_TESTER=
GUILD_ID=${_guild_id}
INTRO_CHANNEL_ID=
LOG_CHANNEL_ID=

# Discord OAuth (Web) — สร้าง OAuth app ใน Discord Dev Portal ของตัวเอง
# https://discord.com/developers/applications → New Application → OAuth2
DISCORD_OAUTH_CLIENT_ID=
DISCORD_OAUTH_CLIENT_SECRET=

# Next Auth — กรอกเอง
NEXTAUTH_SECRET=                # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NEXTAUTH_URL=http://localhost:3000

# Web
WEB_BASE_URL=http://localhost:3000
PPLEVOLUNTEERS_API_KEY=
DEV_DISCORD_IDS=               # Discord IDs ที่ได้ superadmin บน web (comma-separated)

# AI — กรอกเอง (ถ้าจะทดสอบฟีเจอร์ AI)
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
FAL_API_KEY=

# Search
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_KEY=

# Email (KBank SMS polling) — ไม่จำเป็นสำหรับ dev ทั่วไป
EMAIL_IMAP_USER=
EMAIL_IMAP_PASS=
EMAIL_IMAP_PORT=993
EMAIL_POLL_INTERVAL=60000

# SMS — ไม่จำเป็นสำหรับ dev ทั่วไป
THAIBULKSMS_API_KEY=
THAIBULKSMS_API_SECRET=
THAIBULKSMS_SENDER=
THAIBULKSMS_FORCE=false

# Google — ไม่จำเป็นสำหรับ dev ทั่วไป
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_OAUTH_KEY=
GOOGLE_OAUTH_TOKEN=
GOOGLE_SERVICE_ACCOUNT_KEY=

# LINE — ไม่จำเป็นสำหรับ dev ทั่วไป
LINE_CLIENT_ID=
LINE_CLIENT_SECRET=

# Webhook
SMS_WEBHOOK_SECRET=
EOF

echo ""
echo "=== Done ==="
echo "Output files:"
echo "  $DUMP_FILE"
echo "  $ENV_FILE"
echo ""
echo "Dev setup:"
echo "  psql -U <user> -c 'CREATE DATABASE pple_volunteers;'"
echo "  psql -U <user> pple_volunteers < $DUMP_FILE"
echo "  cp $ENV_FILE .env  # แล้วกรอกค่าที่จำเป็น"
