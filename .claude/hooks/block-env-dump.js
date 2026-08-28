#!/usr/bin/env node
// PreToolUse hook (Bash matcher) — technical enforcement of the written
// ".env — ห้ามอ่านหรือแสดงค่า" rule in CLAUDE.md §⛔ Off-limits.
// Blocks commands that would print the contents of a real .env file into
// the transcript. Ported 2026-08-28 from civicflow's civicflow/.claude/hooks/
// after a `tail -3 .env.local` there leaked a live service-role key —
// a written-only rule doesn't catch a command aimed at an unrelated line
// that happens to sweep up a secret line too; this does, since it checks
// the actual command text instead of relying on Claude noticing.
// `.env.example` is a template with placeholders only and is never matched.

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    process.exit(0);
  }

  const command = (input.tool_input && input.tool_input.command) || "";
  if (!command) process.exit(0);

  // Matches .env, .env.local, .env.production, etc. — but NOT .env.example
  // (doesn't end in a non-"example" segment) or unrelated words like
  // "environment"/"$ENV" (requires a literal ".env" file-ish token).
  const envFileRe =
    /(^|[\s"'/=])\.env(\.[A-Za-z0-9_-]+)*(?<!\.example)(?=$|[\s"'/])/;
  if (!envFileRe.test(command)) process.exit(0);

  const grepRe = /\bgrep\b/;
  const isGrep = grepRe.test(command);
  // Per CLAUDE.md §⛔ Off-limits: DB_-prefixed keys are the allowed
  // exception (DB_HOST, DB_USER, DB_PASS, DB_NAME) for local debug.
  const isDbOnlyGrep = isGrep && /\bDB_/.test(command);

  if (isGrep && !isDbOnlyGrep) {
    return deny(
      "grep on an .env file must be scoped to DB_ keys only (e.g. `grep DB_ .env`), per CLAUDE.md §⛔ Off-limits — other keys (DISCORD_BOT_TOKEN, API keys, etc) are secret. To confirm a var is set, check presence/length, not the raw value."
    );
  }

  // Direct-dump utilities, `sed`/`awk` used to print (not in-place edit),
  // and shell redirection that pulls the file into stdout.
  const dumpRe =
    /\b(cat|tail|head|less|more|strings|xxd|od|hexdump|bat|nl|pr)\b|\bawk\b|(\bsed\b)(?!.*(-i|--in-place))|<\s*['"]?\.?env|\$\(\s*cat\b|`cat\b/;
  if (dumpRe.test(command)) {
    return deny(
      "This command would print the contents of an .env file into the conversation transcript, risking a live secret leak (DISCORD_BOT_TOKEN, DISCORD_CLIENT_SECRET, API keys, etc — see CLAUDE.md §⛔ Off-limits). Blocked. To verify a value is set, write a check that reports presence/length only — never print the raw value."
    );
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
