---
description: OpenWolf protocol enforcement, active on all files
globs: **/*
---

- To locate a symbol or file, run `openwolf find <name>` first (ranked shortlist, under 1k tokens). For one file's description and symbol ranges: `openwolf find --file <path>`. Never read .wolf/anatomy.md whole; it is an index.
- **ห้าม Read เต็มไฟล์เด็ดขาด — grep/offset เท่านั้น** (เพิ่ม 2026-08-31): `cerebrum.md` (~88K tok), `memory.md` (~40K), `buglog.json` (~78K), `anatomy.md` (~34K), `anatomy-index.json`, `token-ledger.json` · อ่านเต็มไฟล์เดียว = กิน context ทั้ง session ทิ้ง · ไฟล์เดียวใน .wolf/ ที่อ่านเต็มได้คือ `STATUS.md` กับ `OPENWOLF.md`
- Check .wolf/cerebrum.md Do-Not-Repeat list before generating code; after a user correction, update cerebrum.md immediately.
- **วิธี consult cerebrum ที่ถูก (แก้ 2026-08-31):** grep ด้วย**คำค้นของงานที่ทำอยู่** (ชื่อไฟล์/โมดูล/ฟังก์ชัน เช่น `grep -in "autosave\|txn_at\|contact_type" .wolf/cerebrum.md`) แล้วอ่านเฉพาะบรรทัดที่ hit · **ห้าม grep หัวข้อ `## Do-Not-Repeat` แล้วอ่านทั้ง section** — section เดียว 695 บรรทัด ≈ 33K token · โตขึ้นเรื่อยๆ เป็นเรื่องปกติของไฟล์นี้ ไม่ต้องตัด แค่อย่าอ่านเป็นก้อน
- Do NOT manually update .wolf/anatomy.md or .wolf/memory.md; the OpenWolf hooks maintain them.
- BEFORE fixing any bug: run `openwolf bug search "<error>"` or grep .wolf/buglog.json. AFTER fixing one: log it there (error_message, root_cause, fix, tags).
- When resuming a session, read .wolf/STATUS.md first; regenerate it with /handoff when a quest finishes.
