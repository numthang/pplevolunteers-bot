-- Up Migration
-- No-op. Marks the switch to node-pg-migrate. Everything before this point
-- was already applied via scripts/migration/migration.sql (kept as archive).
-- Run with `npm run migrate up -- --fake` on any DB whose schema already
-- matches that file, so it's recorded without re-running anything.

-- Down Migration