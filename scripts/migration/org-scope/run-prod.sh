#!/usr/bin/env bash
#
# รัน org-scope migration กับ DB จริง (prod) — ตามลำดับ 00→12 · CUTOVER §2
#
#   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && ./scripts/migration/org-scope/run-prod.sh'
#
# ต่างจาก rehearse.sh: **ไม่ drop/create/restore** — ยิงใส่ DB ที่ .env ชี้อยู่ตรงๆ
# นี่คือ DESTRUCTIVE (01 ทำลาย dc_members) → ต้อง backup + stop bot ก่อน (ดู CUTOVER §1,§3)
#
# safety: ปฏิเสธถ้า (ก) ไม่มี dc_members [ไม่ใช่ prod ก่อน migrate] หรือ
#                    (ข) มี users แล้ว [เคย migrate ไปแล้ว รันซ้ำ 01 = ข้อมูลหาย]
# แล้วให้พิมพ์ 'yes' ยืนยันก่อนเริ่ม
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"

# ── โหลด DB_* จาก .env → PG* (แอปไม่มี DATABASE_URL) ──
if [[ ! -f "$ROOT/.env" ]]; then echo "❌ ไม่พบ .env ที่ $ROOT" >&2; exit 1; fi
set -a; . <(grep -E '^DB_(HOST|PORT|USER|PASS|NAME)=' "$ROOT/.env"); set +a
export PGHOST="$DB_HOST" PGPORT="${DB_PORT:-5432}" PGUSER="$DB_USER" PGPASSWORD="$DB_PASS" PGDATABASE="$DB_NAME"

echo "🎯 เป้าหมาย: DB '$PGDATABASE' @ $PGHOST (user $PGUSER)"

# ── safety guard ──
have() { psql -tAc "SELECT to_regclass('public.$1') IS NOT NULL"; }
if [[ "$(have dc_members)" != "t" ]]; then
  echo "❌ ไม่มี dc_members — DB นี้ไม่ใช่ prod ก่อน migrate · หยุด" >&2; exit 1
fi
if [[ "$(have users)" == "t" ]]; then
  echo "❌ มีตาราง users แล้ว = เคย migrate ไปบางส่วน · รันซ้ำ 01 จะลบข้อมูล · หยุด" >&2
  echo "   ถ้าตั้งใจรันใหม่ ต้อง restore backup ก่อน" >&2; exit 1
fi

read -rp "⚠️  DESTRUCTIVE — backup + stop bot แล้วใช่ไหม? พิมพ์ 'yes' เพื่อเริ่ม: " ok
[[ "$ok" == "yes" ]] || { echo "ยกเลิก"; exit 1; }

step() { printf '\n\033[1;33m=== %s\033[0m\n' "$*"; }
# ไฟล์ที่ไม่มี BEGIN; ของตัวเอง (00/01/11) ต้องรันด้วย -1 · ไม่ใช้ array (bash 3.2 macOS)
run() {
  step "$1"; local t0=$SECONDS
  if grep -q '^BEGIN;' "$2"; then
    psql -v ON_ERROR_STOP=1 -q    -f "$2" || { echo "❌ พังที่ $1 — DB ค้างกลางทาง ต้อง restore backup" >&2; exit 1; }
  else
    psql -v ON_ERROR_STOP=1 -q -1 -f "$2" || { echo "❌ พังที่ $1 — DB ค้างกลางทาง ต้อง restore backup" >&2; exit 1; }
  fi
  printf '   ⏱  %ss\n' "$((SECONDS - t0))"
}

TOTAL=$SECONDS
for f in "$DIR"/0[0-8]-*.sql; do run "$(basename "$f")" "$f"; done

# #09 — prod ใช้แค่บล็อก PROD (2 บรรทัด) ไม่ใช่ทั้งไฟล์ (ส่วนบน backfill hardcode localhost)
step "09 — cases.discord_guild_id (บล็อก PROD)"
psql -v ON_ERROR_STOP=1 -q -c "
  ALTER TABLE cases ADD COLUMN IF NOT EXISTS discord_guild_id VARCHAR(20);
  UPDATE cases SET discord_guild_id = guild_id WHERE discord_guild_id IS NULL;" \
  || { echo "❌ พังที่ 09 — DB ค้างกลางทาง ต้อง restore backup" >&2; exit 1; }

run "10-cases-org-scope.sql"    "$DIR/10-cases-org-scope.sql"
run "11-org-access-tables.sql"  "$DIR/11-org-access-tables.sql"
run "12-org-access-redesign.sql" "$DIR/12-org-access-redesign.sql"

printf '\n\033[1;32m✅ migration ครบทุกขั้น — รวม %ss\033[0m\n' "$((SECONDS - TOTAL))"

step "ตรวจของที่พังบ่อย — ทุกบรรทัดต้องได้ 0"
psql -c "
SELECT 'cases มี thread แต่ไม่รู้ guild' AS ตรวจ, count(*) AS ค่า FROM cases WHERE discord_thread_id IS NOT NULL AND discord_guild_id IS NULL
UNION ALL SELECT 'users ซ้ำ discord_id', count(*) FROM (SELECT discord_id FROM users WHERE discord_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) x
UNION ALL SELECT 'org_members กำพร้า',   count(*) FROM org_members om LEFT JOIN users u ON u.id=om.user_id WHERE u.id IS NULL
UNION ALL SELECT 'finance ไม่มี org',    count(*) FROM finance_transactions WHERE org_id IS NULL
UNION ALL SELECT 'calling ไม่มี org',    count(*) FROM calling_logs WHERE org_id IS NULL
UNION ALL SELECT 'cases ไม่มี org',      count(*) FROM cases WHERE org_id IS NULL;"

echo
echo "ขั้นต่อไป (CUTOVER §3): npm install → build → pm2 start web → pm2 start bot"
