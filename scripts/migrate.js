#!/usr/bin/env node
// Wrapper around node-pg-migrate that reuses this project's DB_* env vars
// (see db/index.js) instead of requiring a DATABASE_URL.
//
// Usage:
//   node scripts/migrate.js create <name>   # scaffold a new migration (no DB needed)
//   node scripts/migrate.js up              # run all pending migrations
//   node scripts/migrate.js up <n>          # run n pending migrations
//   node scripts/migrate.js down            # roll back the last migration
//   node scripts/migrate.js redo            # down 1 then up 1
//
// Production: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/migrate.js up'
require('dotenv').config();
const path = require('path');
const { spawnSync } = require('child_process');
const { runner } = require('node-pg-migrate');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATIONS_TABLE = 'pgmigrations';

const [, , command, ...rest] = process.argv;

async function runMigration(direction, extraArgs) {
  const options = {
    databaseUrl: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    },
    dir: MIGRATIONS_DIR,
    migrationsTable: MIGRATIONS_TABLE,
    direction,
    fake: extraArgs.includes('--fake'),
    count: direction === 'down' && !extraArgs.includes('--fake') ? 1 : Infinity,
  };

  const numArg = extraArgs.find((a) => /^\d+$/.test(a));
  if (numArg) options.count = Number(numArg);

  const applied = await runner(options);
  if (applied.length === 0) {
    console.log('No migrations to run.');
  } else {
    applied.forEach((m) => console.log(`${direction === 'up' ? 'Applied' : 'Reverted'}: ${m.name}`));
  }
}

async function main() {
  if (command === 'create') {
    const name = rest.join(' ').trim();
    if (!name) {
      console.error('Usage: node scripts/migrate.js create <name>');
      process.exit(1);
    }
    const bin = path.join(__dirname, '..', 'node_modules', '.bin', 'node-pg-migrate');
    const result = spawnSync(
      bin,
      ['create', name, '-j', 'sql', '-m', MIGRATIONS_DIR],
      { stdio: 'inherit' },
    );
    process.exit(result.status ?? 0);
  } else if (command === 'up') {
    await runMigration('up', rest);
  } else if (command === 'down') {
    await runMigration('down', rest);
  } else if (command === 'redo') {
    await runMigration('down', ['1']);
    await runMigration('up', ['1']);
  } else {
    console.error('Usage: node scripts/migrate.js [create <name>|up [n]|down [n]|redo] [--fake]');
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
