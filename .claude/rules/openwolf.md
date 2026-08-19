---
description: OpenWolf protocol enforcement — active on all files
globs: **/*
---

- CROSS-MACHINE (เคาะ 2026-08-19 — เปลี่ยนจาก manual inbox เป็น git sync): `.wolf/cerebrum.md` และ `.wolf/anatomy.md` ถูก **commit เข้า git ตรงๆ** เพื่อให้ทุกเครื่อง/ทุกคน (รวมเพื่อนร่วมงาน) เห็นความรู้เดียวกัน ไฟล์อื่นใน `.wolf/` (memory.md, buglog.json, token-ledger.json, designqc-captures/, hooks/ ฯลฯ) ยัง gitignore เหมือนเดิม เพราะเป็น log ที่โตทุก session
  - **ก่อนเริ่ม session** (หรือถ้ารู้ว่าเพื่อนเพิ่งทำงาน): `git pull` ก่อน เพื่อได้ cerebrum/anatomy ล่าสุด
  - **หลังอัพเดท** cerebrum.md หรือ anatomy.md อย่างมีนัย (เรียนรู้ preference ใหม่, แก้ Do-Not-Repeat, ไฟล์เปลี่ยนโครงสร้าง): commit แยกสั้นๆ เช่น `chore(wolf): sync brain` ไม่ต้องรอรวมกับ commit งานจริง
  - ถ้าเจอ merge conflict ใน cerebrum.md/anatomy.md (สอง session แก้พร้อมกัน) ให้อ่านทั้งสองฝั่งแล้ว merge เนื้อหาเอง อย่าเลือกทิ้งฝั่งใดฝั่งหนึ่งมั่ว
  - `md/WOLF-INBOX.md` ยังเก็บไว้เป็นทางเลือกสำรอง (เผื่อเครื่องที่ push ไม่ได้ชั่วคราว) แต่ไม่ใช่ flow หลักอีกต่อไป
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
