// ESLint ฝั่งบอท (root) — จับ "ของที่ไม่มีจริง" อย่างเดียว
//
// ทำไมสำคัญกว่าฝั่งเว็บ: บอทไม่มี build step เลย → เรียกฟังก์ชันที่ลบไปแล้วจะเงียบสนิท
// จนกว่าจะมีคนกดคำสั่งนั้นในดิสฯ แล้ว interaction ค้าง
//
// ฝั่งเว็บมี config ของตัวเองที่ web/eslint.config.mjs (React/Next) — ที่นี่ไม่ยุ่ง
// รัน: npm run lint  ·  ทั้งโปรเจกต์ (บอท+เว็บ): npm run lint:all

import js from '@eslint/js'
import globals from 'globals'
import {
  BOT_DB_ALLOWLIST, DB_MODULE_RE, DB_RULE_MESSAGE, toGlobs, assertAllowlistFresh,
} from './eslint.db-allowlist.mjs'

assertAllowlistFresh(import.meta.dirname, BOT_DB_ALLOWLIST)

// esquery อ่าน "/" ใน regex ไม่ได้ → ใช้ \x2F แทน
const DB_REQUIRE_SELECTOR =
  `CallExpression[callee.name='require'][arguments.0.value=/${DB_MODULE_RE.source.replaceAll('\\/', '\\x2F')}/]`

export default [
  {
    ignores: [
      'node_modules/**',
      'web/**',          // มี eslint.config.mjs ของตัวเอง
      'data.ms/**',
      'logs/**',
      'backups/**',
      'dumps/**',
      'uploads/**',
      'storage/**',
      'tmp/**',
      'assets/**',
      'posts/**',
      '.wolf/**',
    ],
  },

  {
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },

  js.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      // Node 22+ ตรวจ ESM/CJS จากเนื้อไฟล์เองแล้ว (.js ในโปรเจกต์นี้มีทั้งสองแบบปนกัน)
      // 'module' อ่านได้ทั้งคู่ — ส่วน require/module/__dirname มาจาก globals.node
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',              // ตัวเอกของงานนี้
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],

      // ปิดเสียงรบกวนที่ไม่ใช่บั๊ก
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'no-prototype-builtins': 'off',
      'no-irregular-whitespace': 'off',
    },
  },

  // ── query ต้องอยู่ใน db/ เท่านั้น — นอกนั้นห้าม require/import pool/pg (allowlist = ของเดิม ห้ามเพิ่ม) ──
  {
    files: ['**/*.{js,mjs,cjs}'],
    ignores: [
      'db/**', 'scripts/**', 'migrations/**',
      '**/__tests__/**', '**/*.test.*',
      ...toGlobs(BOT_DB_ALLOWLIST),
    ],
    rules: {
      'no-restricted-syntax': ['error', { selector: DB_REQUIRE_SELECTOR, message: DB_RULE_MESSAGE }],
      'no-restricted-imports': ['error', {
        patterns: [{ regex: DB_MODULE_RE.source, message: DB_RULE_MESSAGE }],
      }],
    },
  },
]
