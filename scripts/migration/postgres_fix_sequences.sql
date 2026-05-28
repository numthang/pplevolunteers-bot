-- หลังรัน pgloader migrate ทุกครั้ง: pgloader ไม่ได้สร้าง sequence ให้ทุก table
-- ที่มี id integer NOT NULL (เฉพาะบาง table) — script นี้ scan แล้วสร้าง + ตั้งค่า
-- เริ่มต้นให้เป็น MAX(id)+1
--
-- รัน:
--   PGPASSWORD=xxx psql -h localhost -U pple_dcbot -d pple_volunteers -f scripts/migration/postgres_fix_sequences.sql

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
        RAISE NOTICE 'fixed: % (max_id=%)', t, max_id;
    END LOOP;
END $$;
