---
description: OpenWolf protocol enforcement — active on all files
globs: **/*
---

- CROSS-MACHINE: .wolf/ is gitignored so it does NOT travel between machines. The primary machine is the Linux dev box (/home/tee/VSites/node/pple-volunteers); the Mac is only used occasionally away from home.
  - On the PRIMARY machine: if md/WOLF-INBOX.md has any `###` section, merge each one into the .wolf/ file+section named in its heading, then DELETE the merged section from md/WOLF-INBOX.md and commit. The file is meant to sit empty.
  - On a SECONDARY machine: still update .wolf/ normally, but ALSO append anything durable to md/WOLF-INBOX.md under a `## <date> · จาก <machine>` heading, with `### → cerebrum.md §<section>` sub-headings so the merge needs no interpretation.
- Check .wolf/anatomy.md before reading any project file
- Check .wolf/cerebrum.md Do-Not-Repeat list before generating code
- After writing or editing files, update .wolf/anatomy.md and append to .wolf/memory.md
- After receiving a user correction, update .wolf/cerebrum.md immediately (Preferences, Learnings, or Do-Not-Repeat)
- LEARN from every interaction: if you discover a convention, user preference, or project pattern, add it to .wolf/cerebrum.md. Low threshold — when in doubt, log it.
- BEFORE fixing any bug or error: read .wolf/buglog.json for known fixes
- AFTER fixing any bug, error, failed test, failed build, or user-reported problem: ALWAYS log to .wolf/buglog.json with error_message, root_cause, fix, and tags
- If you edit a file more than twice in a session, that likely indicates a bug — log it to .wolf/buglog.json
- When the user asks to check/evaluate UI design: run `openwolf designqc` to capture screenshots, then read them from .wolf/designqc-captures/
- When the user asks to change/pick/migrate UI framework: read .wolf/reframe-frameworks.md, ask decision questions, recommend a framework, then execute with the framework's prompt
