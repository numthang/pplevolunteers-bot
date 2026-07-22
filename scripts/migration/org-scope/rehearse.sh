#!/usr/bin/env bash
#
# ซ้อม org-scope migration กับ dump ของ prod — CUTOVER §1.5
#
#   ./scripts/migration/org-scope/rehearse.sh <dump-file> [dbname]
#
# ทำงานกับ DB ซ้อมแยกเสมอ (default `pple_rehearsal`) และ **ปฏิเสธที่จะรันใส่
# pple_volunteers** — ซ้อมทับ DB ที่ใช้อยู่ = 01-identity-refactor.sql จะ DROP
# users/org_members ของจริงทิ้ง
#
# รันซ้ำได้ไม่จำกัด (drop/restore ใหม่ทุกรอบ) · ON_ERROR_STOP หยุดทันทีที่ขั้นไหนพัง
set -uo pipefail

DUMP="${1:-}"
DB="${2:-pple_rehearsal}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"

# ต่อ DB ด้วยค่าเดียวกับที่แอพใช้ — อ่านจาก .env ให้เอง ไม่ต้อง export เอง
# (psql/createdb/pg_restore กินตัวแปร PG* ไม่ใช่ DB_*)
if [[ -f "$ROOT/.env" ]]; then
  export PGHOST="${PGHOST:-$(grep -m1 '^DB_HOST=' "$ROOT/.env" | cut -d= -f2-)}"
  export PGUSER="${PGUSER:-$(grep -m1 '^DB_USER=' "$ROOT/.env" | cut -d= -f2-)}"
  export PGPASSWORD="${PGPASSWORD:-$(grep -m1 '^DB_PASS=' "$ROOT/.env" | cut -d= -f2-)}"
  _port=$(grep -m1 '^DB_PORT=' "$ROOT/.env" | cut -d= -f2-)
  [[ -n "${_port:-}" ]] && export PGPORT="${PGPORT:-$_port}"
fi

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "ใช้: $0 <dump-file> [dbname]" >&2
  echo "     dump มาจาก: sudo -u www bash -c 'pg_dump \"\$DATABASE_URL\" -Fc -f /www/backup/rehearsal_\$(date +%F).dump'" >&2
  exit 1
fi
if [[ "$DB" == "pple_volunteers" ]]; then
  echo "❌ ห้ามซ้อมใส่ pple_volunteers — 01-identity-refactor.sql จะ DROP users/org_members ของจริง" >&2
  exit 1
fi

step() { printf '\n\033[1;33m=== %s\033[0m\n' "$*"; }

# run <label> <sql-file>
#
# ไฟล์ที่ไม่มี BEGIN; ของตัวเอง ต้องรันด้วย -1 (single transaction)
# 01-identity-refactor.sql สร้าง `_idmap` เป็น TEMP TABLE ... ON COMMIT DROP —
# ถ้าไม่มี -1 psql autocommit ทีละ statement → temp table หายทันทีหลังสร้าง
# แล้วพังที่ `relation "_idmap" does not exist` (เจอตอนซ้อมจริง 2026-07-23)
# ส่วน 02–10/12 ห่อ BEGIN/COMMIT เองแล้ว ใส่ -1 ซ้ำจะได้ warning เปล่าๆ
#
# ไม่ใช้ array ตรงนี้โดยตั้งใจ — macOS มาพร้อม bash 3.2 ซึ่งกาง "${arr[@]}" ที่ว่าง
# ใต้ `set -u` แล้ว error `unbound variable` (แก้ใน bash 4.4) → แตกเป็น 2 บรรทัดแทน
run() {
  step "$1"
  local t0=$SECONDS
  if grep -q '^BEGIN;' "$2"; then
    psql -d "$DB" -v ON_ERROR_STOP=1 -q    -f "$2" || { echo "❌ พังที่ $1" >&2; exit 1; }
  else
    psql -d "$DB" -v ON_ERROR_STOP=1 -q -1 -f "$2" || { echo "❌ พังที่ $1" >&2; exit 1; }
  fi
  printf '   ⏱  %ss\n' "$((SECONDS - t0))"
}

step "เตรียม DB ซ้อม: $DB"

# ไล่ connection ค้างก่อน — ถ้าเปิด DBeaver/psql/`npm run dev` ชี้มาที่ DB ซ้อมอยู่
# dropdb จะล้มด้วย "is being accessed by other users"
psql -d postgres -q -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true

# ⚠️ ต้องเช็คว่า drop/create สำเร็จจริง — เดิมปล่อยผ่านแล้ววิ่งต่อ ทำให้ restore ทับ
#    DB ที่ migrate ไปแล้ว = ผลซ้อม "ผ่าน" แบบมั่วโดยไม่มีใครรู้ (เจอ 2026-07-23)
dropdb --if-exists "$DB" || { echo "❌ ลบ $DB ไม่ได้ — ปิดโปรแกรมที่ต่ออยู่ก่อน (DBeaver?)" >&2; exit 1; }
createdb "$DB"                || { echo "❌ สร้าง $DB ไม่ได้" >&2; exit 1; }

# ดูจากเนื้อไฟล์ ไม่ใช่นามสกุล — dump ของ prod ชื่อ .sql แต่เป็น custom format (ขึ้นต้น PGDMP)
if [[ "$(head -c 5 "$DUMP")" == "PGDMP" ]]; then
  echo "   (custom format → pg_restore)"
  pg_restore -d "$DB" --no-owner --no-privileges "$DUMP" 2>&1 | grep -v "^pg_restore: warning" || true
else
  echo "   (plain SQL → psql)"
  psql -d "$DB" -q -f "$DUMP" 2>&1 | grep -viE "^(NOTICE|SET|CREATE|ALTER|COPY|GRANT)" || true
fi

TOTAL=$SECONDS

for f in "$DIR"/0[0-8]-*.sql; do
  run "$(basename "$f")" "$f"
done

# 09 — prod ใช้แค่บล็อกท้ายไฟล์ ไม่ใช่ทั้งไฟล์
# ส่วนบนของ 09-cases-discord-guild-artifact.sql เป็น backfill ที่ hardcode ref 3 ใบของ localhost
# ซ้อมกับ data ของ prod จึงต้องใช้ 2 บรรทัดนี้แทน (คือสิ่งที่จะรันบน prod จริง)
step "09 — cases.discord_guild_id (บล็อก PROD)"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -c "
  ALTER TABLE cases ADD COLUMN IF NOT EXISTS discord_guild_id VARCHAR(20);
  UPDATE cases SET discord_guild_id = guild_id WHERE discord_guild_id IS NULL;" \
  || { echo "❌ พังที่ 09" >&2; exit 1; }

run "10-cases-org-scope.sql" "$DIR/10-cases-org-scope.sql"
run "11-org-access-tables.sql" "$DIR/11-org-access-tables.sql"
run "12-org-access-redesign.sql" "$DIR/12-org-access-redesign.sql"

printf '\n\033[1;32m✅ ครบทุกขั้น — รวม %ss (= downtime โดยประมาณ)\033[0m\n' "$((SECONDS - TOTAL))"

step "ตรวจของที่พังบ่อยบน data จริง — ทุกบรรทัดต้องได้ 0"
psql -d "$DB" -c "
SELECT 'cases มี thread แต่ไม่รู้ guild' AS ตรวจ, count(*) AS ค่า FROM cases WHERE discord_thread_id IS NOT NULL AND discord_guild_id IS NULL
UNION ALL SELECT 'users ซ้ำ discord_id', count(*) FROM (SELECT discord_id FROM users WHERE discord_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) x
UNION ALL SELECT 'org_members กำพร้า',   count(*) FROM org_members om LEFT JOIN users u ON u.id=om.user_id WHERE u.id IS NULL
UNION ALL SELECT 'finance ไม่มี org',    count(*) FROM finance_transactions WHERE org_id IS NULL
UNION ALL SELECT 'calling ไม่มี org',    count(*) FROM calling_logs WHERE org_id IS NULL
UNION ALL SELECT 'cases ไม่มี org',      count(*) FROM cases WHERE org_id IS NULL;"

step "สิทธิ์หลังย้ายเข้าโครงใหม่ — ต้องไม่ว่าง"
psql -d "$DB" -c "
SELECT source, count(*) FROM org_member_roles GROUP BY source
UNION ALL SELECT 'scope_nodes ที่มีแม่', count(*) FROM org_scope_nodes WHERE parent_id IS NOT NULL
UNION ALL SELECT 'scope_nodes ทั้งหมด',  count(*) FROM org_scope_nodes;"

cat <<EOF

ขั้นต่อไป: ชี้เว็บ dev มาที่ DB ซ้อมแล้วกดใช้จริง (login → finance/calling/docs/cases)
  cd web && DB_NAME=$DB npm run dev
เสร็จแล้วเก็บกวาด: dropdb $DB
EOF
