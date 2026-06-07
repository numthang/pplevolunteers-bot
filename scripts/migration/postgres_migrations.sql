-- PostgreSQL migrations — ใช้แทน migration.sql (MySQL) หลังจาก migrate มา PostgreSQL แล้ว
-- schema changes ทุกอย่างหลังจากนี้ให้เพิ่มที่นี่แทน
--
-- รัน:
--   PGPASSWORD=xxx psql -h localhost -U pple_dcbot -d pple_volunteers -f scripts/migration/postgres_migrations.sql

DO $$
DECLARE
    t text;
    max_id bigint;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE column_name = 'id'
          AND table_schema = 'public'
          AND column_default IS NULL
    LOOP
        EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', t || '_id_seq');
        EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT nextval(%L)', t, t || '_id_seq');
        EXECUTE format('ALTER SEQUENCE %I OWNED BY %I.id', t || '_id_seq', t);
        EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I', t) INTO max_id;
        EXECUTE format('SELECT setval(%L, %s)', t || '_id_seq', GREATEST(max_id, 1));
        RAISE NOTICE 'fixed sequence: % (max_id=%)', t, max_id;
    END LOOP;
END $$;

-- Restore DEFAULT NOW() for created_at / updated_at columns dropped by pgloader
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('created_at', 'updated_at', 'registered_at', 'added_at', 'joined_at', 'indexed_at')
          AND column_default IS NULL
          AND data_type IN ('timestamp with time zone', 'timestamp without time zone')
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT NOW()',
            r.table_name, r.column_name
        );
        RAISE NOTICE 'fixed default: %.%', r.table_name, r.column_name;
    END LOOP;
END $$;

-- 2026-06-01: Fix boolean columns left as smallint by pgloader
ALTER TABLE dc_orgchart_config
  ALTER COLUMN excluded DROP DEFAULT,
  ALTER COLUMN excluded TYPE boolean USING excluded != 0;

ALTER TABLE dc_user_reports
  ALTER COLUMN is_anonymous DROP DEFAULT,
  ALTER COLUMN is_anonymous TYPE boolean USING is_anonymous != 0,
  ALTER COLUMN is_anonymous SET DEFAULT FALSE;



-- 2026-06-02: Add member flag (green/yellow/red) to calling_member_tiers
ALTER TABLE calling_member_tiers
  ADD COLUMN IF NOT EXISTS flag VARCHAR(10) NULL CHECK (flag IN ('green', 'yellow', 'red'));

-- 2026-06-07: dc_basket_history.platform — ขยาย VARCHAR(10) → VARCHAR(100) รองรับหลาย platform เช่น fb,ig,threads,x
ALTER TABLE dc_basket_history
  ALTER COLUMN platform TYPE VARCHAR(100);
