// ESLint — ตั้งใจให้จับ "บั๊กจริง" อย่างเดียว ไม่ใช่ตำรวจสไตล์
//
// ทำไมมี: next build จับ ReferenceError ตอน render ไม่ได้ (build แค่ transpile ไม่ตรวจว่าตัวแปรมีจริง)
// เคสจริง 2026-08-19 — ลบ searchPeople/commitHelpers พลาด build ผ่านฉลุย แต่เปิดหน้า modal จอขาว (253ea71)
//
// กติกา: rule ไหนไม่เคยจับบั๊กได้จริง = ปิด · เสียงรบกวนเยอะ = ไม่มีใครอ่าน = ไม่มีประโยชน์
// รัน: npm run lint  ·  แก้อัตโนมัติ: npm run lint:fix

import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import next from '@next/eslint-plugin-next'

export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '.next-build/**',
      '.next-test/**',
      'public/**',
      '.wolf/**',
    ],
  },

  {
    // มี eslint-disable ค้างจากยุคก่อนมี ESLint เยอะ (เช่น no-img-element ที่เราปิด) — ไม่ใช่บั๊ก ไม่ต้องฟ้อง
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // รวม browser + node เพราะ Next แยก client/server ด้วย 'use client' ไม่ใช่ path
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@next/next': next,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // ── ตัวหลักที่ตั้ง ESLint มาเพื่อสิ่งนี้ ────────────────────────────
      'no-undef': 'error',              // เรียกของที่ไม่มี → จอขาว
      'no-unused-vars': ['warn', {      // import/ตัวแปรตายค้าง — เตือนพอ ไม่บล็อก
        args: 'none',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],

      // ── React hooks: rules-of-hooks พังจริง / deps เป็นต้นเหตุ "กดแล้วไม่อัปเดต" ──
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── JSX ที่พังจริง ─────────────────────────────────────────────────
      'react/jsx-key': 'warn',                 // list ไม่มี key → React reuse ผิดใบ
      'react/jsx-no-undef': 'error',           // <Foo/> ที่ไม่ได้ import
      'react/jsx-uses-vars': 'error',          // กัน no-unused-vars ฟ้อง component ที่ใช้ใน JSX
      'react/jsx-uses-react': 'off',           // React 19 auto JSX runtime
      'react/react-in-jsx-scope': 'off',
      'react/no-children-prop': 'error',
      'react/no-direct-mutation-state': 'error',

      // ── Next: เฉพาะที่พังจริง ไม่เอาข้อจู้จี้ ────────────────────────────
      '@next/next/no-html-link-for-pages': 'off',   // ต้องรู้ pages dir, เราใช้ app router
      '@next/next/no-img-element': 'off',           // สไตล์ล้วน
      '@next/next/no-sync-scripts': 'error',
      '@next/next/no-assign-module-variable': 'error',

      // ── ปิดเสียงรบกวนจาก js:recommended ที่ไม่ใช่บั๊ก ─────────────────
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'no-prototype-builtins': 'off',
      'no-irregular-whitespace': 'off',   // ข้อความไทยมีวรรคแปลกได้
    },
  },

  // config ระดับโปรเจกต์ที่ยังเป็น CommonJS (vitest.*.config.js เป็น ESM — อย่าเหมารวมด้วย glob)
  {
    files: ['next.config.js', 'postcss.config.js', 'tailwind.config.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
]
