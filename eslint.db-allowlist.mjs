// ⛔ Allowlist ไฟล์ที่ต่อ DB เองนอกโฟลเดอร์ db/ — ห้ามเพิ่ม ลบได้อย่างเดียว
//
// กติกา (CLAUDE.md §🗄️ Query ต้องอยู่ใน db/): SQL อยู่ใน db/ (บอท) หรือ web/db/ (เว็บ) เท่านั้น
// ไฟล์ข้างล่างคือของเดิมที่หลุดอยู่ ณ 2026-09-17 (web 65 · bot 18) — ยังไม่ย้าย แค่ล็อกไว้
// แก้ไฟล์ไหนในนี้ = ย้าย query ของไฟล์นั้นเข้า db ใน PR เดียวกัน แล้วลบชื่อออกจากที่นี่
//
// ใครบังคับ:
//   - ESLint ทั้ง root (eslint.config.mjs) และ web (web/eslint.config.mjs) — import pool/pg นอกนี้ = error
//   - lint พังถ้ามีชื่อค้างที่ไม่ได้ต่อ DB แล้ว (ย้ายเสร็จแต่ลืมลบชื่อ) — ดู assertAllowlistFresh
//   - .claude/hooks/block-direct-db.js — บล็อก Edit/Write ที่เพิ่ม import pool และบล็อกการเพิ่มชื่อในไฟล์นี้

import fs from 'node:fs'
import path from 'node:path'

// import/require ที่นับว่า "ต่อ DB เอง": pg, @/db, @/db/index(.js), ../db, ../db/index(.js)
// (import ฟังก์ชันจาก @/db/<module> หรือ ../db/<module> ไม่นับ — นั่นคือทางที่ถูก)
export const DB_MODULE_RE = /^(pg|(@\/|(\.{1,2}\/)+)db(\/index(\.js)?)?)$/
export const DB_IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"](pg|(?:@\/|(?:\.{1,2}\/)+)db(?:\/index(?:\.js)?)?)['"]/

export const DB_RULE_MESSAGE = 'เพิ่มฟังก์ชันใน db/ หรือ web/db/ แล้ว import ฟังก์ชันนั้นแทน (ดู eslint.db-allowlist.mjs)'

// path สัมพัทธ์กับ web/
export const WEB_DB_ALLOWLIST = [
  'app/api/bot/ai-config/route.js',
  'app/api/bot/ai-modes/route.js',
  'app/api/bot/features/route.js',
  'app/api/bot/orgchart/route.js',
  'app/api/bot/roles/route.js',
  'app/api/calling/campaigns/route.js',
  'app/api/calling/districts/route.js',
  'app/api/calling/sms/route.js',
  'app/api/calling/stats/route.js',
  'app/api/calling/users/route.js',
  'app/api/case/[ref]/letter/drafts/route.js',
  'app/api/case/[ref]/timeline/refresh/route.js',
  'app/api/cooking/gates-suggest/route.js',
  'app/api/cooking/import/route.js',
  'app/api/cooking/kitchens/member-search/route.js',
  'app/api/debug-role/search/route.js',
  'app/api/docs/entries/[id]/recipient-info/route.js',
  'app/api/docs/events/route.js',
  'app/api/docs/members/recent/route.js',
  'app/api/docs/members/route.js',
  'app/api/docs/ngs-search/route.js',
  'app/api/docs/sign/link-ngs/route.js',
  'app/api/docs/sign/self-info/route.js',
  'app/api/finance/payouts/events/route.js',
  'app/api/kanban/import/forum/route.js',
  'app/api/meta/oauth/callback/route.js',
  'app/api/org/appoint/route.js',
  'app/api/org/auth/magic/route.js',
  'app/api/org/orgs/[id]/appoint-policy/route.js',
  'app/api/org/orgs/[id]/brand/route.js',
  'app/api/org/orgs/[id]/members/[userId]/email/request/route.js',
  'app/api/org/orgs/[id]/members/[userId]/phone/request/route.js',
  'app/api/org/orgs/[id]/members/[userId]/phone/verify/route.js',
  'app/api/profile/quote/route.js',
  'app/api/profile/route.js',
  'app/api/social/accounts/[id]/route.js',
  'app/api/social/accounts/route.js',
  'app/api/social/groups/route.js',
  'app/api/social/guild-configs/route.js',
  'app/api/social/my-guilds/route.js',
  'app/api/threads/oauth/callback/route.js',
  'app/api/threads/oauth/deauthorize/route.js',
  'app/api/threads/oauth/delete/route.js',
  'app/api/unlink/route.js',
  'app/api/watermark/personal/route.js',
  'app/api/x/oauth/callback/route.js',
  'app/calling/page.js',
  'lib/aiCreds.js',
  'lib/auth-options.js',
  'lib/docsOcrQuota.js',
  'lib/forumImportCommit.js',
  'lib/getEffectiveRoles.js',
  'lib/orgAccess.js',
  'lib/org.js',
  'lib/phoneBindOtp.js',
  'lib/phoneLoginOtp.js',
  'lib/postsAiQuota.js',
  'lib/publishTargets.js',
  'lib/quoteAccent.js',
  'lib/resolveAccess.js',
  'lib/resolveAccessV2.js',
  'lib/socialAppCreds.js',
  'lib/watermarks.js',
]

// path สัมพัทธ์กับ root
export const BOT_DB_ALLOWLIST = [
  'commands/panel.js',
  'commands/user.js',
  'deploy-commands.js',
  'handlers/basketHandler.js',
  'handlers/emailBindHandler.js',
  'handlers/verifyHandler.js',
  'services/emailPoller.js',
  'services/financeOCR.js',
  'services/metaApi.js',
  'services/newsShare.js',
  'services/postsRetention.js',
  'services/publishPipeline.js',
  'services/publishWorker.js',
  'services/serverProvisioner.js',
  'services/smsWebhook.js',
  'services/watermarkPaths.js',
  'services/xApi.js',
  'undo-tmp.js',
]

// ชื่อไฟล์ Next มี [id] ซึ่ง glob อ่านเป็น character class — ต้อง escape ก่อนใส่ ignores
export const toGlobs = (list) => list.map((p) => p.replace(/[[\]()*?{}!]/g, '\\$&'))

// ชื่อค้าง (ไฟล์หายไป หรือไม่ได้ import pool แล้ว) = โยน error ให้ lint พัง → บังคับให้ลบชื่อ
export function assertAllowlistFresh(baseDir, list) {
  const stale = list.filter((rel) => {
    const file = path.join(baseDir, rel)
    return !fs.existsSync(file) || !DB_IMPORT_RE.test(fs.readFileSync(file, 'utf8'))
  })
  if (stale.length) {
    throw new Error(
      `eslint.db-allowlist.mjs มีชื่อที่ไม่ได้ต่อ DB แล้ว — ลบออกจาก allowlist:\n  ${stale.join('\n  ')}`
    )
  }
}
