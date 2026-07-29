# Posts — API contract ก้อน 2a (สัญญาระหว่าง route กับ UI)

> **ข้อตกลงตายตัว** ของก้อน 2a — route และ UI เขียนตามนี้เท่านั้น
> ที่มาของการตัดสินใจอยู่ `md/posts/POSTS.md` (อ่านก่อนถ้าจะเปลี่ยนอะไร)
>
> ⛔ **2026-07-29 เย็น — ไม่มี `post_series` แล้ว** หน่วยเดียวคือ "โพสต์" (ตาราง `post_episodes`)
> จัดกลุ่มด้วยคอลัมน์ `category` (1 โพสต์ = 1 หมวด, NULL = ยังไม่จัดหมวด) · ไม่มีเลขลำดับตอน

## กติกากลาง

- ทุก route เริ่มด้วย `postsContext()` หรือ `postContext(id)` จาก `@/lib/postsGuard.js`
  แล้ว `if (ctx.error) return ctx.error` — **ห้าม query สิทธิ์เอง ห้ามเรียก getServerSession ตรงๆ**
- ตัดสินสิทธิ์ต่อด้วย `@/lib/postsAccess.js` เท่านั้น: `canReadPost` `canWritePost` `canEditPost` `canDeletePost` `canPublishPost` `canApprove` `canRequestChanges` `canPromoteToOrg` `canUseAi`
- อ่านไม่ได้ = **404** (ไม่ยืนยันว่ามีอยู่) · อ่านได้แต่เขียนไม่ได้ = **403**
- สำเร็จ: `{ success: true, data }` · พลาด: `{ error: '<ข้อความไทย>' }` + HTTP status
- ข้อความ error เป็นภาษาไทย (โมดูลนี้ยังไม่ผ่าน i18n — ตาม convention ไฟล์รอบข้าง)
- DB ทุกครั้งผ่าน `@/db/posts/episodes.js` · `@/db/posts/media.js` — **ห้ามเขียน SQL ใน route**
- Next.js 15: `params` เป็น Promise → `const { id } = await params`

## เอนทิตี

**post** = `{ id, org_id, owner_user_id, owner_name, visibility:'personal'|'org', category, title, body, bodies, format, source_idea, created_via, status:'draft'|'review'|'approved', approved_by, approved_by_name, approved_at, last_edited_by, archived_at, created_at, updated_at, lock_token, media_count, published_count, queued_count }`
→ `lock_token` = optimistic lock ของ autosave · UI เก็บไว้แล้วส่งกลับทุกครั้งที่เซฟ

**media** = `{ id, episode_id, kind:'upload'|'quote', path, sort_order, quote_text, quote_style, bg_path, created_at }`
→ UI **ห้ามใช้ `path` ทำ URL** (ไฟล์อยู่นอก `public/`) · รูปเรียกที่ `/api/posts/media/<id>` เสมอ
→ คอลัมน์ยังชื่อ `episode_id` ตามชื่อตาราง `post_episode_media` (ไม่ได้แปลว่ามี series)

---

## Posts

### `GET /api/posts?visibility=personal|org&category=<ชื่อ|__none__>&status=&archived=1`
`listPosts(orgId, userId, { visibility, category, status, includeArchived, includeAllPersonal: isAdmin(access) })`
- `category=__none__` → ส่ง `''` เข้า db layer (แปลว่า "ยังไม่จัดหมวด")
- กรองซ้ำด้วย `canReadPost` ก่อนตอบ (จำเป็นเมื่อ `policy.read === 'team'` — SQL กรองแค่ personal ของคนอื่น)
- → `{ success:true, data: post[] }`

### `POST /api/posts`
body `{ title?, body?, category?, visibility?='personal', format?, sourceIdea? }` → 201 `{ success:true, data: post }`
- `visibility` ต้องเป็น `personal`/`org` · สร้าง `org` ได้เมื่อ `canWritePost({ visibility:'org', owner_user_id:userId }, access, userId, policy)`
- title/body ว่างทั้งคู่ได้ (กด "เขียนโพสต์ใหม่" แล้วค่อยพิมพ์)

### `GET /api/posts/[id]`
→ `{ success:true, data: { post, media, can: { edit, delete, publish, approve, requestChanges, promote } } }`
- `promote` = `canPromoteToOrg(post, access, userId, await getPostUsage(id))`
- `can` ใช้ซ่อน/โชว์ปุ่มเท่านั้น ไม่ใช่ด่านจริง

### `PATCH /api/posts/[id]` — **autosave**
body `{ lockToken, title?, body?, bodies?, format?, category? }`
- ต้อง `canEditPost` (approved = ล็อก → 403 `'โพสต์นี้อนุมัติแล้ว ต้องกด "ขอแก้" ก่อน'`)
- `lockToken` ไม่ตรง → **409** `{ error:'คนอื่นแก้โพสต์นี้ไปแล้ว', conflict:true, data:{ post } }` (post = ฉบับจริงใน DB)
- สำเร็จ → `{ success:true, data:{ post } }` (มี `lock_token` ใหม่ให้ UI เก็บต่อ)

### `POST /api/posts/[id]/status`
body `{ status:'draft'|'review'|'approved' }`
- `approved` ต้อง `canApprove(access)` · ออกจาก approved ต้อง `canRequestChanges` · อื่นๆ ต้อง `canWritePost`

### `POST /api/posts/[id]/promote` — เปิดร่างส่วนตัวให้ทีมเห็น (ทางเดียว)
- ต้อง `canPromoteToOrg(...)` ไม่ผ่าน → **409** พร้อมบอกเหตุ (มีคอมเมนต์/อนุมัติ/งานโพสต์แล้ว)

### `POST /api/posts/[id]/revision` — "เก็บฉบับของฉัน" ตอนชน 409
body `{ title?, body? }` → `saveRevisionOnly(...)` · ต้อง `canWritePost`

### `GET /api/posts/[id]/revisions` → `{ success:true, data: revision[] }`

### `DELETE /api/posts/[id]?permanent=1`
- default = archive (ต้อง `canWritePost`) · `permanent=1` ต้อง `canDeletePost` + ไม่มี `hasPendingJobs` (มี → **409**)

### `GET /api/posts/categories` → `{ success:true, data: [{ category, post_count, last_used_at }] }`
### `PATCH /api/posts/categories` — เปลี่ยนชื่อหมวดทั้งกอง
body `{ from, to }` → `renameCategory(orgId, from, to)` · ต้อง `isMediaTeam`-ระดับ (ใช้ `canApprove(access)` เป็นเกณฑ์) → คืน `{ updated: <จำนวนแถว> }`

---

## Media

### `GET /api/posts/[id]/media` → `{ success:true, data: media[] }`

### `POST /api/posts/[id]/media` — อัปโหลด (multipart/form-data, field `files`, หลายไฟล์ได้)
- ต้อง `canEditPost`
- ตรวจทีละไฟล์ด้วย `isAllowedMime` + `MAX_FILE_SIZE` จาก `@/lib/postsStorage.js` · เกิน `MAX_MEDIA_PER_EPISODE` (นับของเดิมด้วย `countMedia`) → 400
- เขียนไฟล์ด้วย `savePostFile(buffer, mime)` แล้ว `addMedia({ episodeId:id, kind:'upload', path, addedBy:userId })`
- → 201 `{ success:true, data: media[] }` (เฉพาะที่เพิ่งเพิ่ม เรียงตามที่อัป)

### `PATCH /api/posts/[id]/media` — ลากเรียงใหม่
body `{ orderedIds:number[] }` → `reorderMedia(id, orderedIds)` · ต้อง `canEditPost`

### `GET /api/posts/media/[id]` — เสิร์ฟไฟล์
- `getMediaWithPost(id)` → เช็ค `org_id === ctx.orgId` **และ** `canReadPost(row, ...)` ก่อน stream (ไม่ผ่าน = 404)
- อ่านไฟล์ด้วย `absPath(row.path)` (กัน traversal ในตัว) · header `Content-Type` จาก `mimeOfPath`, `Cache-Control: private, max-age=3600` · ENOENT → 404

### `DELETE /api/posts/media/[id]`
- ต้อง `canEditPost` ของโพสต์เจ้าของสื่อชิ้นนั้น · ลบแถว (`deleteMedia` คืน `{path, bg_path}`) แล้วค่อย `deletePostFile` ทั้งสอง path (ลบไฟล์ล้มไม่ทำให้ request พัง)

---

## AI (grill ข้อ 13 — โควตาต่อคนต่อวัน)

ทั้ง 2 route: guard → เช็คสิทธิ์เขียน → `consumeAiQuota(userId)` **ก่อน** ยิง AI
เต็มโควตา → **429** `{ error:'ใช้ AI ครบโควตาวันนี้แล้ว (30 ครั้ง/วัน)' }` · `AiError` → **502** `{ error: err.message }`

### `POST /api/posts/ai/outline` — ประตูหลักเข้าโมดูล
body `{ idea, visibility='personal', category? }` (idea = ไอเดียสั้น **หรือ** บทความยาวที่วางมา)
- ต้องผ่าน `canWritePost({ visibility, owner_user_id:userId }, access, userId, policy)`
- `askAiJson(system, user)` → คาดหวัง `{ category, posts:[{ title, gist, format? }] }`
  - validate: `posts` เป็น array 1–12 ตัว · ตัวไหนไม่มี `title` ทิ้ง · รูปร่างไม่ผ่าน → 502 `{ error:'AI ตอบกลับมาไม่ตรงรูปแบบที่ต้องการ' }`
- สร้างโพสต์ทีละตัวด้วย `createPost({ ..., category: body.category || ai.category, body: gist, sourceIdea: idea, createdVia:'ai' })`
  → **ทุกโพสต์ในรอบนั้นได้ `category` เดียวกัน** = สิ่งที่มาแทน series
- → 201 `{ success:true, data:{ category, posts } }`
- **AI ล้มห้ามให้ idea หาย** — ตอบ error เฉยๆ (UI เก็บ idea ไว้ในช่องเดิม ไม่เคลียร์)

prompt: ผู้ช่วยบรรณาธิการงานสื่อการเมืองไทย · ภาษาไทย · แต่ละโพสต์ ~1 ประเด็น โพสต์โซเชียลได้จริง
· input สั้น = ขยายเป็นชุดโพสต์ · input ยาว = ซอยของที่มีอยู่ **ห้ามแต่งเนื้อหาใหม่** · เสนอชื่อหมวดสั้นๆ 1 ชื่อ

### `POST /api/posts/ai/draft` — ร่างโพสต์เดียว
body `{ postId }` → ต้อง `canEditPost`
- context ที่ส่งให้ AI: ชื่อโพสต์ + โครง (`body` ปัจจุบัน) + `source_idea` + **ชื่อโพสต์อื่นในหมวดเดียวกัน** (กันเขียนซ้ำ)
- `askAi(...)` คืนข้อความล้วน → `{ success:true, data:{ body } }`
- **ไม่เขียนลง DB** — คืนให้ UI ใส่ในช่องแล้วให้ autosave เซฟ (ไม่งั้นชนกับ lock ของตัวเอง)

---

## UI contract (ฝั่งหน้าเว็บ)

- `/posts` — แท็บ `ส่วนตัว | องค์กร` (จำค่าล่าสุดใน localStorage `posts_mode`) · กล่องโยนไอเดีย + ปุ่ม "ให้ AI จัดชุดโพสต์ →" + ปุ่ม "เขียนโพสต์ใหม่" · **แถบหมวด** (จาก `/api/posts/categories` + "ทั้งหมด"/"ยังไม่จัดหมวด") · การ์ดโพสต์เรียงตามแก้ล่าสุด
- `/posts/[id]` — 2 คอลัมน์: ซ้าย = ชื่อ + เนื้อหา (autosave debounce 800ms, ป้าย "บันทึกแล้ว/กำลังบันทึก/ชน") · ขวา = สื่อ (อัป/วางจาก clipboard/ลากเรียง/ลบ) + หมวด + สถานะ
- ชน 409 → กล่องถาม 2 ทาง: **โหลดใหม่** (ทิ้งของฉัน) / **เก็บฉบับของฉันเป็น revision** แล้วโหลดใหม่
