#!/usr/bin/env node
// PreToolUse hook (Edit|Write|MultiEdit) — บังคับกฎ "query ต้องอยู่ใน db/ หรือ web/db/ เท่านั้น"
// (CLAUDE.md §🗄️) คู่กับ ESLint — ESLint จับได้ตอนมีคนรัน lint เท่านั้น ตัวนี้จับตั้งแต่ตอนเขียน
//
// บล็อก 2 กรณี:
//   1. เนื้อหาใหม่ import/require pool หรือ pg ในไฟล์นอก db/ ที่ไม่อยู่ใน allowlist
//   2. แก้ eslint.db-allowlist.mjs แล้วจำนวนชื่อเพิ่มขึ้น (allowlist ลบได้อย่างเดียว)
// ข้อจำกัด: แก้ผ่าน Bash (sed/heredoc) ไม่ผ่าน hook นี้ — ESLint เป็นด่านหลังบ้าน

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", async () => {
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    process.exit(0);
  }

  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const ti = input.tool_input || {};
  if (!ti.file_path) process.exit(0);
  const rel = path.relative(root, path.resolve(root, ti.file_path)).split(path.sep).join("/");
  if (rel.startsWith("..")) process.exit(0);

  const oldText = ti.old_string ?? (ti.edits || []).map((e) => e.old_string).join("\n");
  const newText = ti.content ?? ti.new_string ?? (ti.edits || []).map((e) => e.new_string).join("\n");

  let allow;
  try {
    allow = await import(pathToFileURL(path.join(root, "eslint.db-allowlist.mjs")).href);
  } catch {
    process.exit(0); // ไม่มีไฟล์ allowlist = ไม่มีกฎให้บังคับ
  }

  // ── กรณี 2: ห้ามเพิ่มชื่อใน allowlist ──
  if (rel === "eslint.db-allowlist.mjs") {
    const count = (s) => (s.match(/^\s*'[^']+',?\s*$/gm) || []).length;
    const before = ti.content != null
      ? count(fs.existsSync(ti.file_path) ? fs.readFileSync(ti.file_path, "utf8") : "")
      : count(oldText);
    if (count(newText) > before) {
      return deny("eslint.db-allowlist.mjs ลบได้อย่างเดียว ห้ามเพิ่มชื่อ — " + allow.DB_RULE_MESSAGE);
    }
    process.exit(0);
  }

  // ── กรณี 1: import pool/pg นอก db/ ──
  if (!/\.(js|jsx|mjs|cjs)$/.test(rel)) process.exit(0);
  if (/(^|\/)(__tests__|migrations)\//.test(rel) || /\.test\.[cm]?jsx?$/.test(rel)) process.exit(0);

  const isWeb = rel.startsWith("web/");
  const local = isWeb ? rel.slice(4) : rel;
  if (/^(db|scripts)\//.test(local)) process.exit(0);
  const list = isWeb ? allow.WEB_DB_ALLOWLIST : allow.BOT_DB_ALLOWLIST;
  if (list.includes(local)) process.exit(0);

  if (allow.DB_IMPORT_RE.test(newText)) {
    return deny(`${rel}: ห้าม import pool/pg นอก db/ — ${allow.DB_RULE_MESSAGE}`);
  }
  process.exit(0);

  function deny(reason) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      })
    );
    process.exit(0);
  }
});
