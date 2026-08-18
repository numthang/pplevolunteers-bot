มี error log 2 ตัว ตัวนึงเมื่อวันที่ 14 ไม่แน่ใจว่าอะไร แต่วันที่ 17 ตอนสั่งรัน orgchart scan ส่วน emailPoller นี่ยังไงนะ ยังใช้ได้อยู่ไหม
0|pple-dcb | 2026-07-15T20:39:59: [2026-07-15 20:39:59] [ERROR] [emailPoller] error: Failed to establish connection in required time
0|pple-dcb | 2026-07-17T00:40:30: [2026-07-17 00:40:30] [ERROR] [emailPoller] imap error: Socket timeout
0|pple-dcb | 2026-07-17T00:40:30: [2026-07-17 00:40:30] [ERROR] [emailPoller] error: Unexpected close
0|pple-dcb | 2026-07-17T00:40:30: [2026-07-17 00:40:30] [ERROR] [emailPoller] imap error: Connection not available
0|pple-dcb | 2026-07-17T00:49:30: [2026-07-17 00:49:30] [ERROR] [emailPoller] imap error: Socket timeout
0|pple-dcb | 2026-07-17T00:49:30: [2026-07-17 00:49:30] [ERROR] [emailPoller] error: Unexpected close
0|pple-dcb | 2026-07-17T00:49:30: [2026-07-17 00:49:30] [ERROR] [emailPoller] imap error: Connection not available
0|pple-dcb | 2026-07-17T00:58:30: [2026-07-17 00:58:30] [ERROR] [emailPoller] imap error: Socket timeout
0|pple-dcb | 2026-07-17T00:58:30: [2026-07-17 00:58:30] [ERROR] [emailPoller] error: Unexpected close
0|pple-dcb | 2026-07-17T00:58:30: [2026-07-17 00:58:30] [ERROR] [emailPoller] imap error: Connection not available
0|pple-dcb | 2026-07-17T01:07:30: [2026-07-17 01:07:30] [ERROR] [emailPoller] imap error: Socket timeout
0|pple-dcb | 2026-07-17T01:07:30: [2026-07-17 01:07:30] [ERROR] [emailPoller] error: Unexpected close
0|pple-dcb | 2026-07-17T01:07:30: [2026-07-17 01:07:30] [ERROR] [emailPoller] imap error: Connection not available
0|pple-dcb | 2026-07-21T13:15:44: [Threads] carousel truncated: 26 → 20 images
0|pple-dcb | 2026-07-31T09:21:19: [caseImport] timeline date/time field value out of range: "2568-12-00T00:00:00+07:00"
0|pple-dcb | 2026-08-03T06:37:06: [2026-08-03 06:37:06] [ERROR] [emailPoller] error: Failed to receive greeting from server in required time
0|pple-dcb | 2026-08-03T06:37:09: [2026-08-03 06:37:09] [ERROR] [emailPoller] imap error: Already logged out
0|pple-dcb | 2026-08-03T13:06:25: [Threads API error] /v1.0/25380902714941643/threads {"status":500,"message":"An unknown error occurred","code":1}
0|pple-dcb | 2026-08-05T23:23:52: [2026-08-05 23:23:52] [ERROR] [smsWebhook] error: Unexpected token '<', "<soap:Enve"... is not valid JSON
0|pple-dcb | 2026-08-07T07:34:32: [caseImport] timeline date/time field value out of range: "2568-08-00T00:00:00+07:00"
0|pple-dcb | 2026-08-07T20:38:28: [2026-08-07 20:38:28] [ERROR] [emailPoller] error: getaddrinfo EAI_AGAIN imap.gmail.com
0|pple-dcb | 2026-08-08T13:36:59: [Threads API error] /v1.0/25380902714941643/threads {"status":400,"message":"Error validating access token: Session has expired on Thursday, 16-Jul-26 01:00:58 PDT. The current time is Saturday, 08-Aug-26 06:36:59 PDT.","type":"OAuthException","code":190,"error_subcode":0,"fbtrace_id":"AynI-VAdWljWSuz3bTbfCxX"}
0|pple-dcb | 2026-08-08T13:37:27: [Threads API error] /v1.0/25380902714941643/threads {"status":400,"message":"Error validating access token: Session has expired on Thursday, 16-Jul-26 01:00:58 PDT. The current time is Saturday, 08-Aug-26 06:37:27 PDT.","type":"OAuthException","code":190,"error_subcode":0,"fbtrace_id":"Alsye5fjPG1pk1C4l2CSy_9"}
0|pple-dcb | 2026-08-08T13:37:57: [Threads API error] /v1.0/25380902714941643/threads {"status":400,"message":"Error validating access token: Session has expired on Thursday, 16-Jul-26 01:00:58 PDT. The current time is Saturday, 08-Aug-26 06:37:56 PDT.","type":"OAuthException","code":190,"error_subcode":0,"fbtrace_id":"Ah3mBsSmeivq3wnfwWyZ5yv"}
0|pple-dcb | 2026-08-08T13:37:57: [publishWorker] job 87 (threads) ล้มถาวรหลัง 3 ครั้ง: Threads API: Error validating access token: Session has expired on Thursday, 16-Jul-26 01:00:58 PDT. The current time is Saturday, 08-Aug-26 06:37:56 PDT. (code 190)
0|pple-dcb | 2026-08-12T02:33:36: [2026-08-12 02:33:36] [ERROR] [emailPoller] error: Connection not available
0|pple-dcb | 2026-08-14T12:57:47: DiscordAPIError[10062]: Unknown interaction
0|pple-dcb | 2026-08-14T12:57:47:     at handleErrors (/www/wwwroot/pple-volunteers/node_modules/@discordjs/rest/dist/index.js:762:13)
0|pple-dcb | 2026-08-14T12:57:47:     at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
0|pple-dcb | 2026-08-14T12:57:47:     at async BurstHandler.runRequest (/www/wwwroot/pple-volunteers/node_modules/@discordjs/rest/dist/index.js:866:23)
0|pple-dcb | 2026-08-14T12:57:47:     at async _REST.request (/www/wwwroot/pple-volunteers/node_modules/@discordjs/rest/dist/index.js:1307:22)
0|pple-dcb | 2026-08-14T12:57:47:     at async ButtonInteraction.showModal (/www/wwwroot/pple-volunteers/node_modules/discord.js/src/structures/interfaces/InteractionResponses.js:399:22)
0|pple-dcb | 2026-08-14T12:57:47:     at async handleOpenRegisterModal (/www/wwwroot/pple-volunteers/handlers/registerHandler.js:327:3) {
0|pple-dcb | 2026-08-14T12:57:47:   requestBody: { files: undefined, json: { type: 9, data: [Object] } },
0|pple-dcb | 2026-08-14T12:57:47:   rawError: { message: 'Unknown interaction', code: 10062 },
0|pple-dcb | 2026-08-14T12:57:47:   code: 10062,
0|pple-dcb | 2026-08-14T12:57:47:   status: 404,
0|pple-dcb | 2026-08-14T12:57:47:   method: 'POST',
0|pple-dcb | 2026-08-14T12:57:47:   url: 'https://discord.com/api/v10/interactions/1537807428693925918/aW50ZXJhY3Rpb246MTUzNzgwNzQyODY5MzkyNTkxODpsZ0VuT0VMbU51Zm13Z0pGNzZFeEt4Y084anpGM3FDUWpZSWx0aW01dDJoeVJXUVduOG5QNWtyMkRmZ2o3NHBWZGZJMGdjVjJYU1NYdHZxR252cnBzWldXTnhSQ0prME9ua3NKZ2dUSmJGUDdjaGo2anF1Tnd2TjFtYmVhOFFrQg/callback?with_response=false'
0|pple-dcb | 2026-08-14T12:57:47: }
0|pple-dcb | 2026-08-17T19:24:47: error: null value in column "excluded" of relation "dc_orgchart_config" violates not-null constraint
0|pple-dcb | 2026-08-17T19:24:47:     at /www/wwwroot/pple-volunteers/node_modules/pg-pool/index.js:45:11
0|pple-dcb | 2026-08-17T19:24:47:     at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
0|pple-dcb | 2026-08-17T19:24:47:     at async upsertChannel (/www/wwwroot/pple-volunteers/db/orgchartConfig.js:8:3)
0|pple-dcb | 2026-08-17T19:24:47:     at async Object.execute (/www/wwwroot/pple-volunteers/commands/orgchart.js:243:36)
0|pple-dcb | 2026-08-17T19:24:47:     at async Client.<anonymous> (/www/wwwroot/pple-volunteers/index.js:153:7) {
0|pple-dcb | 2026-08-17T19:24:47:   length: 360,
0|pple-dcb | 2026-08-17T19:24:47:   severity: 'ERROR',
0|pple-dcb | 2026-08-17T19:24:47:   code: '23502',
0|pple-dcb | 2026-08-17T19:24:47:   detail: 'Failing row contains (1340903354037178410, 1511737004671373535, Youth worker, #9b59b6, 1517769642377084978, 🌳┆youth-worker-อีสาน, text, null, other).',
0|pple-dcb | 2026-08-17T19:24:47:   hint: undefined,
0|pple-dcb | 2026-08-17T19:24:47:   position: undefined,
0|pple-dcb | 2026-08-17T19:24:47:   internalPosition: undefined,
0|pple-dcb | 2026-08-17T19:24:47:   internalQuery: undefined,
0|pple-dcb | 2026-08-17T19:24:47:   where: undefined,
0|pple-dcb | 2026-08-17T19:24:47:   schema: 'public',
0|pple-dcb | 2026-08-17T19:24:47:   table: 'dc_orgchart_config',
0|pple-dcb | 2026-08-17T19:24:47:   column: 'excluded',
0|pple-dcb | 2026-08-17T19:24:47:   dataType: undefined,
0|pple-dcb | 2026-08-17T19:24:47:   constraint: undefined,
0|pple-dcb | 2026-08-17T19:24:47:   file: 'execMain.c',
0|pple-dcb | 2026-08-17T19:24:47:   line: '1907',
0|pple-dcb | 2026-08-17T19:24:47:   routine: 'ExecConstraints'
0|pple-dcb | 2026-08-17T19:24:47: }


# PLATFOR{m}.ORG
- platfor.org
- ทำให้เว็บไซต์ หรือ sub-domain ภายนอกใช้ระบบเดียวกันได้แต่ใช้ชื่อของเขาเอง
- JotForm ลอกมาเลยครับ มีแบบให้ login และ public ลองดู spec ก่อน แต่ feature ยากไม่จำเป็น ตัดทิ้ง แต่ให้ถามก่อน
- Poll anonymous, semi-anon, public ลอก pollbotplus มาเลย แต่อาจจะอัพเกรดนิดหน่อย ลองดูว่าควรอัพเกรดอะไร อย่างน้อยผมว่า max 7 วันควรเพิ่มได้อีก

# Kanban
- ตรง user ควรเป็นลิงก์คลิกได้ คลิกไปไหนดียังไม่รู้ แต่ปกติควรไปที่หน้า profile ของ user นั้นไหม
- user ควรแสดง display name เป็นอะไรดี เรียงลำดับ ที่เรามี discord display name -> nickname -> firstname?
- mark30260 เหมือนจะผิดคน ของจริงคือ discord_id คือ 1227989001697493016 username undermek 
- แล้วก็แสดง progress checklist สำคัญมาก checklist เป็น field ถาวร 1 field ใช่ไหม หรือเราทำให้ custom form ได้เรื่อยๆ 
- มันควรมี repeat task ไหมหว่า ประจำเดือน ประจำสัปดาห์ ประมาณนี้
- ลิงก์ google calendar แสดง deadline 

# Posts
- ai suggestion ยังไม่มีโหมด บก ตรวจงาน ตาม redflag 
- Quote หัวข้อ ไอเดียภาพ hashtag ทำเป็น toggle, ชวนแชร์ ตัดทิ้ง
- posteditor บนมือถือ ตรงตั้งเวลาพอกดแล้ว ลบเวลาไม่ได้

# Web
- อยากได้หน้า dashboard ของ http://localhost:3000/bot/ ตอนนี้มันวิ่งไป http://localhost:3000/bot/platforms ดูแปลกๆ ไม่มี landing ทำแบบไหนดี ควรเปลี่ยนเป็น bot/settings ดีไหม และอาจะต้องย้ายหรือลบ setting ส่วน bot นี้ไปอยู่ใน org/settings/ เอาตรงๆ ยังงงๆ อยู่ แต่เห็นความซ้ำซ้อนและ ไม่เป็นที่เป็นทางบางอย่างอยู่ กับ https://localhost:3000/org/settings
- project หลังจากนี้ จะรู้ไหมว่าผมทำรองรับสองภาษาแล้วอ่ะ แล้วก็ไม่รู้ว่าเราต้อง cleaning memory.md, claude.md ที่บางอัน outdate อะไรบ้างไหม เพื่อลด context ตอนทำงาน
- อยากทำ Project ย้ายจาก LINE กลุ่มมาใช้ discord เพื่อองค์กรกันเถอะ รายละเอียดยังไม่ได้คิด
- ต้องทำให้รองรับ config WEB_BASE_URL ที่ไม่ได้มาจาก .env แล้ว แต่ต้องสะท้อน จาก guild_config
- dc_server_settings เราเลิกใช้แล้วใช่ไหม ถ้าใช่ลบทิ้งไปเลย
- ตอนนี้ถ้าจะดูว่าใครเป็น treasurer บนเว็บเพื่อมีสิทธแก้ไข finance ดูจากอะไร ค้นจาก dc_members.roles แล้วแมพ เหรัญญิก เพื่อหา treasurer เหรอ
- จัดระเบียบไฟล์ใน web/components หน่อย พวกของกลางใช้ร่วมกันคงไว้ได้
- จัดระเบียบ setting ดูว่าตอนนี้เรามีอะไรบ้าง จะรวมหรือจะแยก ยังไงดี /org/settings ตอนนี้ consistancy ดีแล้วใช่ไหม 
- ตอนนี้จะ config web_roles ให้สมาชิกยังไง แต่สำหรับ discord ตอนนี้ migrate มาก่อนได้
- ผมอาจจะเปลี่ยน /bot เป็น /dc แล้วก็ /dc/settings => มีพวก ai, watermark, platforms, quote, roles รวมอยู่ในนั้นอ่ะ ดีไหม
- icon องค์กรขอบมันแตกๆ ไม่ smooth
- menu ใน org switcher ทำ font ให้ใหญ่หน่อย เท่าใน hamburger ก็ได้ 
- http://localhost:3000/profile เปลี่ยน tab เป็น dropdown และน่าจะเปลี่ยนเป็น /user/profile /user/settings ไหม แต่เอาไว้ก่อน ยังไม่แน่ใจว่าจะ setting อะไร ตอนนี้ มีแต่พวก quote
- http://localhost:3000/profile ไม่แน่ใจว่าตอน switch org มันดึงข้อมูลถูก org 

# Docs


# Bot 
- มีวิธีย้ายคนจาก stage ไปห้องประชุมธรรมดาทั้งหมดไหมครับ ผมอยากทำตอนปิดประชุม stage

# Cooking
- ย้าย cooking ออกจาก discord project- Update PENDING.md สิ่งที่อยากทำ สิ่งที่ทำไปแล้วลบทิ้งไหม, อ่านส่วนที่แก้ไขแล้วเอาขึ้น git พร้อมข้อความแก้ไข พร้อม bump version ใน package.json ให้ถูกต้อง (เช็ค git log ก่อนว่า version ล่าสุดคืออะไร ใช้ semver — patch สำหรับแก้เล็กน้อย, minor สำหรับฟีเจอร์ใหม่) tag เฉพาะ minor ขึ้นไป และ push ด้วย เถอะ ไปทำเป็น personal ที่แบบ login หรือไม่ login ก็ได้ ไป schema ใหม่ไปเลยดีมะ ส่วน username เราก็แยกออกไปจาก แอพองค์กรไปเลยเนอะ ดีมะอ่ะ รอให้มี domain ของตัวเองก่อน
- Cooking ตอนสร้าง ai เมนู ถ้ากดปิดเลย ไม่กดแก้ไขอะไรสักอย่างมันจะไม่บันทึก ควรมีปุ่มบันทึก เฉพาะเพิ่มเมนูใหม่ก็ได้ ตามพฤติกรรมใหม่ที่เพิ่งให้จด

# Calling

# Cases
- https://pplevolunteers.org/case/manage ทำ filter สถานะเรื่องร้องเรียนให้เลือกเป็น dropdown
- ดูเหมือน bot นำเข้าเคส จะยังไม่ได้ดึง attachment และหน้าเว็บยังไม่มีให้แนบไฟล์เพิ่ม
- เหมือนปี ร้องเรียนจะผิด https://pplevolunteers.org/case/manage/70-69-6D9F
- ผมอ่านแล้วสรุปไทมไลนไม่ค่อยละเอียดนะ ถ้ายาวควรทำเป็น toggle ไม่ใช่ตัดหายไปเฉยๆ อย่างกรณีนี้ทำให้มันสรุปใหม่ทำยังไง หรือลบไทมไลนทั้งหมดออกก่อน 

# Projects
- ทำระบบจัดการโครงการ project management อย่าง notion, trello, appflowy
- gogo panel อัพเกรด ให้กดลงชื่องานด้านต่างๆ แล้วลิงก์กับ project management

# Rag-AI
Tester bot ยัง respond กับการเมนชัน @everyone อยู่เลย แต่เหมือน bot PPLE จะไม่มีปัญหา

# i18n
- ยังไม่หมด

End of the Day
วันที่ 7-9 ผมทำอะไรบ้าง ขอรายละเอียดแบบ non-technichal อ่านแล้วคนอื่นเข้าใจขอ format แบบนี้
- [วันที่] [เดือน] xxxxxxxxxxxxxxxxxxxxxxxxx, xxxx, xxxxx
- [วันที่] [เดือน] xxxxxxxxxxxxxxxxxxxxxxxxx, xxxx, xxxxx
- Update PENDING.md สิ่งที่อยากทำ สิ่งที่ทำไปแล้วลบทิ้งไหม, อ่านส่วนที่แก้ไขแล้วเอาขึ้น git พร้อมข้อความแก้ไข พร้อม bump version ใน package.json ให้ถูกต้อง (เช็ค git log ก่อนว่า version ล่าสุดคืออะไร ใช้ semver — patch สำหรับแก้เล็กน้อย, minor สำหรับฟีเจอร์ใหม่) tag เฉพาะ minor ขึ้นไป และ push ด้วย

===
BEGIN;

-- 1) ลบบัตรใหม่ (ระบุด้วย email)
DELETE FROM org_members
 WHERE user_id = (SELECT id FROM users WHERE email = '<อีเมล>' AND discord_id IS NULL);

DELETE FROM users
 WHERE email = '<อีเมล>' AND discord_id IS NULL;

-- 2) ใส่ email ลงบัตรเก่า
UPDATE users SET email = '<อีเมล>', updated_at = NOW()
 WHERE discord_id = '<discord_id>';

COMMIT;


Panel Forum: 
/panel forum channel:#💬┆กระทู้-ทั่วไป

Greeting:
/panel register title:ยินดีต้อนรับสู่ อาสาประชาชน! description:กดปุ่มด้านล่างเพื่อแนะนำตัวและ #🎖️┆ติดยศ ได้เลย province_select:True interest_select:True log_channel:#👋┆แนะนำตัว member_role:@อาสาประชาชน

Welcome DM
ยินดีต้อนรับสู่ อาสาประชาชน!
- [แนะนำตัว](https://discord.com/channels/1340903354037178410/1340903354871582756) — บอกให้ทีมรู้ว่าคุณคือใคร  \n
- [ติดยศ](https://discord.com/channels/1340903354037178410/1341436765533372489) — เลือกบทบาทเพื่อเข้าถึงห้องที่เกี่ยวข้อง  \n
- [สอบถามปัญหาการใช้งาน](https://discord.com/channels/1340903354037178410/1486026453974909010) — ติดปัญหาอะไรถามได้เลย

https://discord.com/invite/CjheHjvPVS
---

## อาสาประชาชน
/panel register title:ยินดีต้อนรับสู่ อาสาประชาชน! :tangerine: description:Step  :one: : แนะนำตัว → กดปุ่มแนะนำตัวด้านล่าง\n Step :two: : อ่านตรงนี้ก่อน → #📕┆ข้อตกลง \n Step :three:  : ติดยศ → #📕┆ติดยศ  log_channel:#👋┆แนะนำตัว

/panel register title:แนะนำตัวเองให้เพื่อนรู้จัก description:กดปุ่มแล้วระบบจะพาทำไปทีละขั้นตอน ดังนี้ :point_down:\n\n:pencil: กรอกข้อมูล → :map: เลือกจังหวัด → :dart: เลือกทีม

## ราชบุรี
/panel register title:แนะนำตัวทางนี้แล้วข้อมูลจะส่งไปยังห้องแนะนำตัว log_channel:#👋┆แนะนำตัว

/panel register title:ยินดีต้อนรับสู่ ประชาชนราชบุรี! :tangerine: description:Step  :one: : แนะนำตัว → กดปุ่มแนะนำตัวด้านล่าง\n Step :two: : อ่านตรงนี้ก่อน → #📕┆ข้อตกลง  log_channel:#👋｜แนะนำตัว

ข้อตกลงร่วม : 
1. ระมัดระวังการพาดพิงถึงบุคคลที่ 3 องค์กร หรือพรรคการเมืองอื่นๆ ซึ่งก่อให้เกิดความเสื่อมเสียชื่อเสียงต่อตัวบุคคล หรือองค์กรนั้นๆ และห้ามใช้คำพูดที่มีความรุนแรง ข่มขู่ ละเมิด ข่มเหง หรือกลั่นแกล้งผู้ใช้คนอื่น
2. ใช้คำพูดสุภาพในการสนทนา ให้เกียรติผู้อื่น ไม่ใช้คำหยาบคาย โจมตีตัวบุคคลและวาจาสร้างความเกลียดชังแตกแยก เช่น Cyber Bullying เหยียดเพศ อายุ วุฒิภาวะ ศาสนา
3. ห้ามสแปม หรือส่งข้อความซ้ำๆ เพื่อเป็นการก่อกวนผู้ใช้คนอื่น ส่งข้อความก่อกวนผู้ใช้รายอื่นๆ
4. ห้ามส่งรูปภาพ หรือข้อความลามก เข้าข่ายอนาจาร
5. ห้ามโฆษณาหรือติดต่อซื้อขาย สินค้า บริการ ดำเนินการใดๆ ในลักษณะที่เป็นการหารายได้
6. ห้ามตั้งชื่อ หรือใช้รูปภาพโปรไฟล์ที่ไม่เหมาะสม หรือเกิดความเข้าใจผิด
7. ห้ามพฤติกรรมที่ฝ่ายหนึ่งแสดงออกถึงนัยยะทางเพศ ทำให้เหยื่อรู้สึกไม่ดี ถูกคุกคาม ไม่ปลอดภัย หรือถูกลดทอนศักดิ์ศรีคุณค่าความเป็นมนุษย์
8. ห้ามแชร์ข้อมูลส่วนตัวของผู้ใช้คนอื่นโดยไม่ได้รับอนุญาต รวมถึงการละเมิดกฏหมาย PDPA
9. ห้ามส่งข้อความ เผยเเพร่ หรือเข้าร่วมกิจกรรมที่ผิดกฎหมายเเละสิ่งอบายมุกทุกประเภท เช่น เครื่องดื่มเเอลกอฮอล์ บุหรี่ บุหรี่ไฟฟ้า การพนัน ลงทุน แชร์ลูกโซ่ ฯลฯ  ชักชวนให้เข้าร่วมกิจกรรมที่ผิดกฏหมาย เช่น การพนัน หวยใต้ดิน แชร์ลูกโซ่
10. สงวนสิทธิ์การใช้งาน Discord สำหรับเยาวชนอายุต่ำกว่า 13 ปี ตามกฎของ Discord
11. พูดคุย แชท ในห้องหัวข้อที่ตรงกับเรื่องที่คุยทุกครั้ง
 12. สงวนสิทธิ์การใช้งาน เฉพาะคนที่ https://discord.com/channels/1340903354037178410/1340903354871582756/1341798496013127773 ในห้องแนะนำตัวแล้วเท่านั้น
13. สงวนสิทธิ์การใช้งานบางอย่างสำหรับผู้ที่ยังไม่ได้เป็นสมาชิกพรรค แนะนำให้ [สมัครสมาชิกพรรคประชาชน](https://accounts.peoplesparty.or.th/account/register) เพื่อช่วยเหลือพรรคการเมืองและเป็นเจ้าของพรรคร่วมกัน

หากจนท.ตักเตือนและท่านไม่ทำตาม เราจะลงโทษตามความรุนแรง เช่น Time out หรือ  Ban กรณีที่ท่านต้องการอุธรณ์หรือต้องการร้องเรียนสามารถแจ้งที่ https://discord.com/channels/1340903354037178410/1397146590694871100

Tech Stack
Framework	Next.js 15.5 (App Router)
UI	React 19 + JSX (ไม่มี TypeScript)
Styling	Tailwind CSS 3.4 + CSS
Runtime	Node.js — self-hosted VPS (next start ผ่าน sudo -u www)
Backend / Data	PostgreSQL ตรง ๆ ผ่าน pg (ไม่มี Supabase, ไม่มี RLS)
Auth	NextAuth v4 — Discord OAuth (ไม่ใช่ Google/email OTP)
i18n	next-intl
Testing	Vitest
Companion process	Discord bot (discord.js v14) รันแยกที่ root repo

Tech stack
Framework : Next.js 15.5
UI : React 18.3 + JSX (ไม่มี TypeScript)
Styling : CSS
Runtime : Node.js serverless
Backend / Data : Supabase (Postgres + Auth + Storage + RLS)
Supabase Auth: Google OAuth + email OTP
Vercel : Region: sin1 (สิงคโปร์)
