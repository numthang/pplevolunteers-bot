# Database Schema — pple_volunteers

PostgreSQL รองรับ Discord bot + Web (Finance · Calling · Docs · Cases · Cooking)

**Host:** localhost · **User:** pple_dcbot · **Database:** pple_volunteers

> ⚠️ **ส่วน schema ในไฟล์นี้ generate จาก DB จริง** (ครั้งล่าสุด: 2026-07-21 · 58 ตาราง)
> ถ้าแก้ schema แล้วอยากอัปเดตไฟล์นี้ ให้ generate ใหม่ อย่าพิมพ์มือทีละบรรทัด
> เช็คของสดเสมอด้วย: `psql "$DATABASE_URL" -c "\d <table>"`

---

## Conventions

- **scope ของ tenant data = `org_id INTEGER`** (→ `orgs.id`) — finance · calling · docs · cases · audit_logs ใช้อันนี้
- **`guild_id VARCHAR(20)` = Discord server** เหลือไว้เฉพาะของที่เป็น artifact ของ Discord จริงๆ: `dc_*` ทั้งหมด · `finance_config` · `case_config` · `cases.discord_guild_id` · `cache_pple_event`
- **person-ref = `user_id INTEGER`** (→ `users.id`) — ไม่ใช่ discord snowflake อีกแล้ว · `discord_id VARCHAR(20)` เหลือสถานะ credential/display อยู่บน `users` แถวเดียว
- **identity แยก 2 ชั้น:** `users` = ตัวตน 1 แถว/คน · `org_members` = membership + profile ต่อ (org, guild)
- **Always check `db/` files first** before assuming column names
- Calling: `campaign_id = 0` = "Undefined" (log ที่ไม่ผูก campaign)

### ⚠️ Gotchas ที่กัดมาแล้ว

- **`contact_type` ต้องใส่เสมอ** — `calling_logs` · `calling_assignments` · `calling_member_tiers` · `calling_starred` ใช้ `member_id` ร่วมกันทั้ง member และ contact โดยที่ id คนละตารางทับกันเต็มๆ (`cache_pple_member.source_id` = 1–169505 · `calling_contacts.id` = 12–601) → ทุก JOIN/WHERE บนตาราง shared ต้องมี `AND contact_type = 'member'` หรือ `'contact'`
- **`txn_at` ห้ามแปลงผ่าน `new Date().toISOString()`** — ค่าจาก form เป็น local Thai time, server รันเป็น UTC → เวลาเพี้ยน +7 ชม. ทุกครั้งที่ save · ส่ง `txn_at || null` ให้ pg จัดการเอง
- **`_dc_members` คือตารางเก่าที่ archive ไว้** (ก่อน identity split) — โค้ดไม่ใช้แล้ว ยังไม่ drop เพราะเคยใช้กู้ข้อมูลที่ถูกล้าง

---

## ENUM types

```
act_event_cache_type              campaign | register | event
calling_*_contact_type            member | contact
calling_assignments_rsvp          yes | no | maybe
calling_logs_status               answered | no_answer | not_called | met | sms_sent | sms_delivered | sms_failed
calling_member_tiers_tier         A | B | C | D
calling_member_tiers_tier_source  auto | manual
dc_media_baskets_type             image | caption | video
dc_orgchart_config_channel_type   text | voice | forum
dc_orgchart_config_group_name     main | skill | region | province | district | other
dc_social_accounts_visibility     public | private
dc_user_reports_status            pending | investigating | closed
finance_accounts_visibility       private | internal | public
finance_incoming_log_source       sms | email
finance_transactions_type         income | expense
```

---
## Identity & Tenant

### users
```sql
id                       integer                       NOT NULL DEFAULT nextval('users_id_seq')
discord_id               character varying(20)         
email                    character varying(255)        
google_id                character varying(64)         
username                 character varying(255)        
phone                    character varying(32)         
phone_verified_at        timestamp with time zone      
line_id                  character varying(255)        
firstname                character varying(255)        
lastname                 character varying(255)        
created_at               timestamp with time zone      NOT NULL DEFAULT now()
updated_at               timestamp with time zone      NOT NULL DEFAULT now()
id_card_image            bytea                         
PRIMARY KEY (id)
UNIQUE INDEX (discord_id) WHERE (discord_id IS NOT NULL)
UNIQUE INDEX (email) WHERE (email IS NOT NULL)
```


### org_members
```sql
id                       bigint                        NOT NULL DEFAULT nextval('org_members_id_seq')
user_id                  integer                       NOT NULL
org_id                   integer                       
guild_id                 character varying(20)         
role                     character varying(40)         NOT NULL DEFAULT 'member'
status                   character varying(12)         NOT NULL DEFAULT 'active'
invited_by               integer                       
joined_at                timestamp with time zone      NOT NULL DEFAULT now()
registered_at            timestamp with time zone      
roles                    text                          
web_roles                text                          
roles_assigned_at        timestamp with time zone      
position                 character varying(255)        
member_id                integer                       
serial                   character varying(64)         
province                 text                          
region                   character varying(255)        
display_name             character varying(255)        
avatar                   text                          
nickname                 character varying(255)        
specialty                text                          
interests                text                          
referred_by              character varying(255)        
amphoe                   character varying(255)        
primary_province         character varying(255)        
bank_name                character varying(255)        
account_no               character varying(64)         
account_holder           character varying(255)        
created_at               timestamp with time zone      NOT NULL DEFAULT now()
FOREIGN KEY (invited_by) REFERENCES users(id)
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (id)
FOREIGN KEY (user_id) REFERENCES users(id)
UNIQUE INDEX (user_id, guild_id) WHERE (guild_id IS NOT NULL)
UNIQUE INDEX (user_id, org_id) WHERE (guild_id IS NULL)
```

> `display_name` sync อัตโนมัติเมื่อ `guildMemberAdd` / `guildMemberUpdate`
> sync ครั้งแรกด้วย `node scripts/calling/sync-discord-members.js`
> ⚠️ upsert ต้องเขียน **เฉพาะคอลัมน์ที่ caller ส่งมาจริง** — SET ทุกคอลัมน์รวดเคยล้าง `member_id` ทิ้ง (2026-07-21)


### orgs
```sql
id                       integer                       NOT NULL DEFAULT nextval('organizations_id_seq')
name                     character varying(120)        NOT NULL
slug                     character varying(60)         
created_at               timestamp with time zone       DEFAULT now()
icon                     text                          
PRIMARY KEY (id)
UNIQUE (slug)
```


### org_config
```sql
org_id                   integer                       NOT NULL
key                      character varying(60)         NOT NULL
value                    text                          
updated_at               timestamp with time zone       DEFAULT now()
FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
PRIMARY KEY (org_id, key)
```


### org_roles
```sql
key                      character varying(40)         NOT NULL
label_th                 character varying(100)        NOT NULL
label_en                 character varying(100)        
category                 character varying(30)         
description              text                          
sort_order               integer                       NOT NULL DEFAULT 100
is_active                boolean                       NOT NULL DEFAULT true
PRIMARY KEY (key)
```


### org_login_tokens
```sql
token                    character varying(64)         NOT NULL
email                    character varying(255)        NOT NULL
created_at               timestamp with time zone      NOT NULL DEFAULT now()
PRIMARY KEY (token)
```


### user_identities
```sql
id                       integer                       NOT NULL DEFAULT nextval('user_identities_id_seq')
discord_id               character varying(20)         
provider                 character varying(20)         NOT NULL
provider_id              text                          NOT NULL
credential               jsonb                         
created_at               timestamp with time zone      NOT NULL DEFAULT now()
user_id                  integer                       NOT NULL
PRIMARY KEY (id)
UNIQUE (provider, provider_id)
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```


---

## Discord (prefix `dc_`)

### dc_guilds
```sql
guild_id                 character varying(20)         NOT NULL
name                     character varying(100)        NOT NULL
icon_url                 character varying(500)        
updated_at               timestamp with time zone      NOT NULL
org_id                   integer                       
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (guild_id)
```


### dc_guild_config
```sql
guild_id                 character varying(20)         NOT NULL
key                      character varying(100)        NOT NULL
value                    json                          
updated_at               timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (guild_id, key)
```


### dc_guild_roles
```sql
guild_id                 character varying(20)         NOT NULL
role_id                  character varying(20)         NOT NULL
role_name                character varying(100)        NOT NULL
permission               character varying(40)         
scope_node               character varying(80)         
picker_group             character varying(40)         
picker_label             character varying(100)        
picker_emoji             character varying(40)         
picker_order             integer                       
updated_at               timestamp without time zone    DEFAULT CURRENT_TIMESTAMP
parent_role_id           character varying(20)         
is_managed               boolean                       NOT NULL DEFAULT false
PRIMARY KEY (guild_id, role_id)
FOREIGN KEY (permission) REFERENCES org_roles(key)
```


### dc_guild_role_groups
```sql
guild_id                 character varying(20)         NOT NULL
group_key                character varying(40)         NOT NULL
label                    character varying(100)        NOT NULL
kind                     character varying(20)         NOT NULL DEFAULT 'plain'
sort_order               integer                       NOT NULL DEFAULT 0
PRIMARY KEY (guild_id, group_key)
```


### dc_activity_daily
```sql
id                       bigint                        NOT NULL DEFAULT nextval('dc_activity_daily_id_seq')
guild_id                 character varying(20)         NOT NULL
user_id                  character varying(20)         NOT NULL
channel_id               character varying(20)         NOT NULL
date                     date                          NOT NULL
message_count            bigint                        NOT NULL DEFAULT '0'
voice_seconds            bigint                        NOT NULL DEFAULT '0'
PRIMARY KEY (id)
UNIQUE INDEX (guild_id, user_id, channel_id, date)
```


### dc_activity_mentions
```sql
id                       bigint                        NOT NULL DEFAULT nextval('dc_activity_mentions_id_seq')
guild_id                 character varying(20)         NOT NULL
user_id                  character varying(20)         NOT NULL
mentioned_by             character varying(20)         NOT NULL
channel_id               character varying(20)         NOT NULL
timestamp                timestamp with time zone      NOT NULL
replied_at               timestamp with time zone      
PRIMARY KEY (id)
```

> Score = `messages × 10 + voice_seconds + mentions × 30`


### dc_user_config
```sql
discord_id               character varying(20)         NOT NULL
key                      character varying(100)        NOT NULL
value                    json                          
updated_at               timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (discord_id, key)
```


### dc_user_ratings
```sql
id                       bigint                        NOT NULL DEFAULT nextval('dc_user_ratings_id_seq')
guild_id                 character varying(20)         NOT NULL DEFAULT ''
target_id                character varying(20)         NOT NULL
target_name              character varying(100)        NOT NULL
rater_id                 character varying(20)         NOT NULL
rater_name               character varying(100)        NOT NULL
stars                    smallint                      NOT NULL
comment                  character varying(300)        
created_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (id)
```


### dc_user_reports
```sql
id                       bigint                        NOT NULL DEFAULT nextval('dc_user_reports_id_seq')
guild_id                 character varying(20)         NOT NULL DEFAULT ''
target_id                character varying(20)         NOT NULL
target_name              character varying(100)        NOT NULL
reporter_id              character varying(20)         
reporter_name            character varying(100)        
category                 character varying(50)         NOT NULL
detail                   text                          NOT NULL
evidence                 character varying(500)        
is_anonymous             boolean                       NOT NULL DEFAULT false
status                   dc_user_reports_status        NOT NULL DEFAULT 'pending'
mod_note                 text                          
created_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (id)
```


### dc_forum_config
```sql
guild_id                 character varying(20)         NOT NULL
channel_id               character varying(20)         NOT NULL
dashboard_msg_id         character varying(20)         
items_per_page           integer                       NOT NULL DEFAULT 10
PRIMARY KEY (guild_id, channel_id)
```


### dc_forum_posts
```sql
id                       bigint                        NOT NULL DEFAULT nextval('dc_forum_posts_id_seq')
guild_id                 character varying(20)         NOT NULL
channel_id               character varying(20)         NOT NULL
post_id                  character varying(20)         NOT NULL
post_name                character varying(500)        NOT NULL
post_url                 character varying(200)        NOT NULL
author_id                character varying(20)         
created_at               timestamp with time zone      NOT NULL
indexed_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (id)
UNIQUE INDEX (post_id)
```


### dc_media_baskets
```sql
id                       integer                       NOT NULL DEFAULT nextval('dc_media_baskets_id_seq')
guild_id                 character varying(20)         NOT NULL
channel_id               character varying(20)         NOT NULL
added_by                 character varying(20)         NOT NULL
type                     dc_media_baskets_type         NOT NULL DEFAULT 'image'
image_url                text                          
caption                  text                          
message_id               character varying(20)         
added_at                 timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
sort_order               integer                       NOT NULL DEFAULT 0
channel_name             character varying(100)        
PRIMARY KEY (id)
```


### dc_media_history
```sql
id                       bigint                        NOT NULL DEFAULT nextval('dc_basket_history_id_seq')
guild_id                 character varying(20)         NOT NULL
channel_id               character varying(20)         NOT NULL
posted_by                character varying(20)         NOT NULL
platform                 character varying(100)        NOT NULL
image_count              smallint                      NOT NULL DEFAULT '0'
wm_type                  character varying(100)        
caption                  text                          
schedule_time            bigint                        
fb_url                   character varying(500)        
ig_url                   character varying(500)        
threads_url              character varying(500)        
x_url                    character varying(512)        
status                   character varying(20)         NOT NULL DEFAULT 'success'
created_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
video_count              integer                        DEFAULT 0
PRIMARY KEY (id)
```


### dc_social_accounts
```sql
id                       integer                       NOT NULL DEFAULT nextval('dc_social_accounts_id_seq')
user_discord_id          character varying(20)         
guild_id                 character varying(20)         
name                     character varying(100)        NOT NULL
group_name               character varying(100)        
platform                 character varying(20)         NOT NULL
social_id                character varying(50)         
access_token             text                          
user_token               text                          
user_token_expires_at    timestamp with time zone      
visibility               dc_social_accounts_visibility NOT NULL DEFAULT 'public'
created_at               timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
user_key                 character varying(20)         
PRIMARY KEY (id)
UNIQUE INDEX (user_key, guild_id, platform, social_id)
```


### dc_orgchart_config
```sql
guild_id                 character varying(20)         NOT NULL
role_id                  character varying(20)         NOT NULL
role_name                character varying(100)        NOT NULL
role_color               character varying(7)          
channel_id               character varying(20)         NOT NULL
channel_name             character varying(100)        NOT NULL
channel_type             dc_orgchart_config_channel_type NOT NULL
excluded                 boolean                       NOT NULL DEFAULT false
group_name               dc_orgchart_config_group_name NOT NULL DEFAULT 'other'
PRIMARY KEY (guild_id, role_id, channel_id)
```


### dc_orgchart_snapshot
```sql
guild_id                 character varying(20)         NOT NULL
role_id                  character varying(20)         NOT NULL
days                     integer                       NOT NULL
top_members              json                          NOT NULL
computed_at              timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (guild_id, role_id)
```


### dc_ai_modes
```sql
id                       integer                       NOT NULL DEFAULT nextval('dc_ai_modes_id_seq')
guild_id                 character varying(20)         NOT NULL DEFAULT 'global'
value                    character varying(50)         NOT NULL
label                    character varying(100)        NOT NULL
prompt                   text                          NOT NULL
sort_order               integer                       NOT NULL DEFAULT 0
enabled                  boolean                       NOT NULL DEFAULT true
updated_at               timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
UNIQUE (guild_id, value)
PRIMARY KEY (id)
```


### dc_gogo_entries
```sql
id                       bigint                        NOT NULL DEFAULT nextval('dc_gogo_entries_id_seq')
guild_id                 character varying(20)         NOT NULL
message_id               character varying(20)         NOT NULL
user_id                  character varying(20)         NOT NULL
name                     character varying(200)        NOT NULL DEFAULT ''
joined_at                timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
session_id               character varying(30)         
PRIMARY KEY (id)
```


---

## Finance (prefix `finance_`)

### finance_accounts
```sql
id                       integer                       NOT NULL DEFAULT nextval('finance_accounts_id_seq')
org_id                   integer                       NOT NULL
owner_id                 integer                       NOT NULL
name                     character varying(100)        NOT NULL
bank                     character varying(50)         
account_no               character varying(50)         
visibility               finance_accounts_visibility   NOT NULL DEFAULT 'private'
province                 character varying(50)         
notify_income            smallint                      NOT NULL DEFAULT '1'
notify_expense           smallint                      NOT NULL DEFAULT '1'
email_inbox              character varying(100)        
usage_count              integer                       NOT NULL DEFAULT 0
updated_by               integer                       
updated_at               timestamp with time zone      
created_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
archived                 smallint                      NOT NULL DEFAULT '0'
FOREIGN KEY (org_id) REFERENCES orgs(id)
FOREIGN KEY (owner_id) REFERENCES users(id)
FOREIGN KEY (updated_by) REFERENCES users(id)
PRIMARY KEY (id)
```


### finance_transactions
```sql
id                       integer                       NOT NULL DEFAULT nextval('finance_transactions_id_seq')
org_id                   integer                       NOT NULL
account_id               integer                       NOT NULL
type                     finance_transactions_type     NOT NULL
amount                   numeric(12,2)                 NOT NULL
description              text                          
category_id              integer                       
fund_id                  integer                       
counterpart_name         character varying(100)        
counterpart_account      character varying(50)         
counterpart_bank         character varying(50)         
fee                      numeric(8,2)                  
balance_after            numeric(12,2)                 
evidence_url             text                          
ref_id                   character varying(100)        
source                   character varying(255)        
discord_msg_id           character varying(20)         
txn_at                   timestamp without time zone    DEFAULT CURRENT_TIMESTAMP
updated_by               integer                       
updated_at               timestamp with time zone      
created_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (account_id) REFERENCES finance_accounts(id) ON DELETE CASCADE
FOREIGN KEY (category_id) REFERENCES finance_categories(id) ON DELETE SET NULL
FOREIGN KEY (org_id) REFERENCES orgs(id)
FOREIGN KEY (updated_by) REFERENCES users(id)
PRIMARY KEY (id)
UNIQUE INDEX (ref_id, account_id)
```


### finance_categories
```sql
id                       integer                       NOT NULL DEFAULT nextval('finance_categories_id_seq')
org_id                   integer                       
owner_id                 integer                       
name                     character varying(100)        NOT NULL
icon                     character varying(20)         
is_global                smallint                      NOT NULL DEFAULT '0'
usage_count              integer                       NOT NULL DEFAULT 0
created_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (org_id) REFERENCES orgs(id)
FOREIGN KEY (owner_id) REFERENCES users(id)
PRIMARY KEY (id)
```


### finance_account_rules
```sql
id                       integer                       NOT NULL DEFAULT nextval('finance_account_rules_id_seq')
account_id               integer                       NOT NULL
match_name               character varying(255)        NOT NULL
category_id              integer                       
usage_count              integer                       NOT NULL DEFAULT 0
updated_at               timestamp with time zone      
FOREIGN KEY (account_id) REFERENCES finance_accounts(id) ON DELETE CASCADE
FOREIGN KEY (category_id) REFERENCES finance_categories(id) ON DELETE SET NULL
PRIMARY KEY (id)
```


### finance_funds
```sql
id                       integer                       NOT NULL DEFAULT nextval('finance_funds_id_seq')
account_id               integer                       NOT NULL
name                     character varying(100)        NOT NULL
created_at               timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (id)
```


### finance_incoming_log
```sql
id                       integer                       NOT NULL DEFAULT nextval('finance_incoming_log_id_seq')
org_id                   integer                       
source                   finance_incoming_log_source   NOT NULL
raw_text                 text                          NOT NULL
parsed                   smallint                      NOT NULL DEFAULT '0'
transaction_id           integer                       
created_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (id)
```


### finance_config
```sql
guild_id                 character varying(20)         NOT NULL
channel_id               character varying(20)         
thread_id                character varying(20)         
account_ids              text                          
dashboard_msg_id         text                          
updated_at               timestamp with time zone      
PRIMARY KEY (guild_id)
```


---

## Calling (prefix `calling_`)

### cache_pple_member

ข้อมูลสมาชิกพรรค sync มาจาก NGS — **ห้ามแก้โดยตรง** sync ด้วย `node scripts/calling/import-member-csv.js <file.csv>`

**93 columns** (ส่วนใหญ่เป็น field ดิบจาก NGS: ที่อยู่ 2 ชุด, สถานะสมาชิก, การชำระเงิน, ข้อมูลอาชีพ) — ดูเต็มด้วย `\d cache_pple_member`

คอลัมน์ที่โค้ดใช้จริง:

```sql
source_id                integer                       PRIMARY KEY   -- = member_id ที่ calling_* ใช้ join
org_id                   integer                                     -- org-scope
serial                   character varying                           -- เลขสมาชิก
full_name                character varying
mobile_number            character varying                           -- PDPA: gate ด้วย canSeeContacts()
line_id                  character varying                           -- PDPA: gate เดียวกัน
home_province            character varying                           -- ใช้กรอง scope จังหวัด
province                 character varying
membership_type          character varying
latest_state             character varying
synced_at                timestamp with time zone
```

> ⚠️ `source_id` = 1–169505 ทับกับ `calling_contacts.id` (12–601) เต็มๆ → ดู gotcha `contact_type` ด้านบน

### cache_pple_event

Events/campaigns จาก ACT system (WordPress) — ใช้แทนตาราง `calling_campaigns` ที่ไม่มีแล้ว
**คง `guild_id` ไว้** (เป็น artifact ฝั่ง Discord/ACT ไม่ใช่ tenant data)

**34 columns** — ดูเต็มด้วย `\d cache_pple_event`

```sql
id                       integer                       PRIMARY KEY
parent_id                integer
guild_id                 character varying(20)
type                     act_event_cache_type          -- campaign | register | event
name                     character varying
province                 character varying
event_date               timestamp with time zone
event_end_date           timestamp with time zone
act_event_id             integer                       -- id ฝั่ง ACT (partial unique index, คนละตัวกับ id)
synced_at                timestamp with time zone
```

> `id = 0` = "Undefined" campaign (catch-all สำหรับ log ที่ไม่ผูก campaign)
> `calling_*.campaign_id` → ชี้ที่ `cache_pple_event.id` WHERE `type = 'campaign'`

### calling_contacts
```sql
id                       integer                       NOT NULL DEFAULT nextval('calling_contacts_id_seq')
org_id                   integer                       NOT NULL
first_name               character varying(100)        NOT NULL
last_name                character varying(100)        
phone                    character varying(20)         
email                    character varying(150)        
line_id                  character varying(100)        
category                 character varying(50)         
province                 character varying(100)        
amphoe                   character varying(100)        
tambon                   character varying(100)        
note                     text                          
specialty                text                          
created_by               integer                       
updated_by               integer                       
created_at               timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
updated_at               timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (created_by) REFERENCES users(id)
FOREIGN KEY (org_id) REFERENCES orgs(id)
FOREIGN KEY (updated_by) REFERENCES users(id)
PRIMARY KEY (id)
```

> Manual contacts (non-member) — ผู้บริจาค, คนสนใจ, อาสาสมัคร
> สร้าง/แก้ไข/ลบได้ ต่างจาก `cache_pple_member` ที่เป็น sync-only


### calling_assignments
```sql
id                       integer                       NOT NULL DEFAULT nextval('calling_assignments_id_seq')
campaign_id              integer                       
contact_type             calling_assignments_contact_type NOT NULL DEFAULT 'member'
member_id                character varying(20)         NOT NULL
assigned_to              integer                       NOT NULL
assigned_by              integer                       NOT NULL
rsvp                     calling_assignments_rsvp      
created_at               timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
org_id                   integer                       NOT NULL
FOREIGN KEY (assigned_by) REFERENCES users(id)
FOREIGN KEY (assigned_to) REFERENCES users(id)
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (id)
UNIQUE INDEX (campaign_id, member_id, contact_type)
```

> unique key = `(campaign_id, member_id, contact_type)` — แต่ละ campaign assign คนชุดเดิมได้อิสระ (ไม่ใช่ unique ทั้งระบบ)
> reassign ภายใน campaign เดิม → upsert เปลี่ยน `assigned_to` ได้เลย


### calling_logs
```sql
id                       integer                       NOT NULL DEFAULT nextval('calling_logs_id_seq')
campaign_id              integer                       
contact_type             calling_logs_contact_type     NOT NULL DEFAULT 'member'
member_id                character varying(20)         NOT NULL
called_by                integer                       
caller_name              character varying(100)        
caller_image             text                          
called_at                timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
status                   calling_logs_status           NOT NULL
sig_overall              smallint                      
sig_location             smallint                      
sig_availability         smallint                      
sig_interest             smallint                      
sig_reachable            smallint                      
note                     text                          
extra                    text                          
created_at               timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
org_id                   integer                       NOT NULL
FOREIGN KEY (called_by) REFERENCES users(id)
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (id)
```

> `signals` กรอกเฉพาะตอน `status = 'answered'`


### calling_member_tiers
```sql
id                       integer                       NOT NULL DEFAULT nextval('calling_member_tiers_id_seq')
contact_type             calling_member_tiers_contact_type NOT NULL DEFAULT 'member'
member_id                character varying(20)         NOT NULL
tier                     calling_member_tiers_tier     NOT NULL
tier_source              calling_member_tiers_tier_source NOT NULL DEFAULT 'auto'
override_by              integer                       
override_reason          text                          
custom_fields            text                          
updated_at               timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
flag                     character varying(20)         
org_id                   integer                       NOT NULL
FOREIGN KEY (org_id) REFERENCES orgs(id)
FOREIGN KEY (override_by) REFERENCES users(id)
PRIMARY KEY (id)
UNIQUE INDEX (member_id, contact_type)
```

> tier คำนวณอัตโนมัติจาก avg signal ของทุก answered call (สูตรใน `md/calling/CALLING.md`)
> A ≥ 3.5 · B ≥ 2.5 · C ≥ 1.5 · D < 1.5


### calling_starred
```sql
id                       integer                       NOT NULL DEFAULT nextval('calling_starred_id_seq')
org_id                   integer                       NOT NULL
user_id                  integer                       NOT NULL
member_id                character varying(20)         NOT NULL
contact_type             calling_starred_contact_type  NOT NULL DEFAULT 'member'
note                     text                          
created_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (org_id) REFERENCES orgs(id)
FOREIGN KEY (user_id) REFERENCES users(id)
PRIMARY KEY (id)
UNIQUE INDEX (org_id, user_id, member_id, contact_type)
```


---

## Docs (prefix `docs_`)

### docs_projects
```sql
id                       integer                       NOT NULL DEFAULT nextval('docs_projects_id_seq')
org_id                   integer                       NOT NULL
cache_pple_event_id      integer                       NOT NULL
is_mobile                boolean                       NOT NULL DEFAULT false
participant_count        integer                       
budget                   numeric(12,2)                 
allowed_items            jsonb                         
status                   character varying(20)         NOT NULL DEFAULT 'draft'
created_by               integer                       
created_at               timestamp with time zone      NOT NULL DEFAULT now()
project_name             text                          
payer_user_id            integer                       
project_token            character varying(8)          
project_token_expires    timestamp without time zone   
FOREIGN KEY (cache_pple_event_id) REFERENCES cache_pple_event(id)
FOREIGN KEY (created_by) REFERENCES users(id)
FOREIGN KEY (org_id) REFERENCES orgs(id)
FOREIGN KEY (payer_user_id) REFERENCES users(id)
PRIMARY KEY (id)
UNIQUE INDEX (project_token) WHERE (project_token IS NOT NULL)
UNIQUE INDEX (org_id, cache_pple_event_id)
```


### docs_activity_entries
```sql
id                       integer                       NOT NULL DEFAULT nextval('docs_activity_entries_id_seq')
project_id               integer                       NOT NULL
member_user_id           integer                       
item_type                character varying(20)         NOT NULL
description              text                          
amount                   numeric(12,2)                 
override_data            jsonb                         
status                   character varying(20)         NOT NULL DEFAULT 'pending'
sign_token               uuid                          NOT NULL DEFAULT gen_random_uuid()
token_expires_at         timestamp with time zone      
signed_at                timestamp with time zone      
printed_at               timestamp with time zone      
pdf_url                  text                          
payer_user_id            integer                       
payer_sign_token         uuid                          
payer_token_expires_at   timestamp with time zone      
payer_signed_at          timestamp with time zone      
PRIMARY KEY (id)
FOREIGN KEY (project_id) REFERENCES docs_projects(id) ON DELETE CASCADE
FOREIGN KEY (member_user_id) REFERENCES users(id)
FOREIGN KEY (payer_user_id) REFERENCES users(id)
UNIQUE INDEX (sign_token)
```


### docs_payers
```sql
id                       integer                       NOT NULL DEFAULT nextval('docs_payers_id_seq')
org_id                   integer                       NOT NULL
user_id                  integer                       
display_name             text                          NOT NULL
position                 text                          NOT NULL
sort_order               integer                       NOT NULL DEFAULT 0
signature_base64         text                          
created_at               timestamp with time zone       DEFAULT now()
FOREIGN KEY (org_id) REFERENCES orgs(id)
UNIQUE (org_id, user_id)
PRIMARY KEY (id)
FOREIGN KEY (user_id) REFERENCES users(id)
```


### docs_signatures
```sql
id                       integer                       NOT NULL DEFAULT nextval('docs_signatures_id_seq')
entry_id                 integer                       NOT NULL
signature_base64         text                          NOT NULL
signed_by_user_id        integer                       
signed_ip                character varying(45)         
created_at               timestamp with time zone      NOT NULL DEFAULT now()
role                     character varying(20)         NOT NULL DEFAULT 'recipient'
FOREIGN KEY (entry_id) REFERENCES docs_activity_entries(id) ON DELETE CASCADE
PRIMARY KEY (id)
FOREIGN KEY (signed_by_user_id) REFERENCES users(id)
```


### docs_project_attachments
```sql
id                       integer                       NOT NULL DEFAULT nextval('docs_project_attachments_id_seq')
project_id               integer                       NOT NULL
org_id                   integer                       NOT NULL
original_name            text                          
file_path                text                          NOT NULL
sort_order               integer                       NOT NULL DEFAULT 0
created_at               timestamp with time zone       DEFAULT now()
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (id)
FOREIGN KEY (project_id) REFERENCES docs_projects(id) ON DELETE CASCADE
```


---

## Cases

### cases
```sql
id                       integer                       NOT NULL DEFAULT nextval('cases_id_seq')
org_id                   integer                       NOT NULL
ref                      character varying(20)         NOT NULL
province                 character varying(100)        NOT NULL
category                 character varying(50)         
status                   character varying(20)         NOT NULL DEFAULT 'open'
close_reason             character varying(40)         
source                   character varying(20)         NOT NULL DEFAULT 'web'
complainant_name         character varying(200)        NOT NULL
complainant_phone        character varying(30)         
complainant_line_id      character varying(100)        
consent_at               timestamp with time zone      
discord_thread_id        character varying(20)         
last_synced_message_id   character varying(20)         
ai_summary               text                          
ai_summary_updated_at    timestamp with time zone      
intake_ip                character varying(45)         
created_by               integer                       
created_at               timestamp with time zone      NOT NULL DEFAULT now()
updated_at               timestamp with time zone      NOT NULL DEFAULT now()
title                    character varying(300)        
detail                   text                          
letters                  jsonb                         NOT NULL DEFAULT '[]'
discord_guild_id         character varying(20)         
FOREIGN KEY (created_by) REFERENCES users(id)
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (id)
UNIQUE INDEX (ref)
```


### case_timeline
```sql
id                       integer                       NOT NULL DEFAULT nextval('case_timeline_id_seq')
case_id                  integer                       NOT NULL
org_id                   integer                       NOT NULL
discord_message_id       character varying(20)         
source                   character varying(20)         NOT NULL DEFAULT 'human'
body                     text                          NOT NULL
is_public                boolean                       NOT NULL DEFAULT false
occurred_at              timestamp with time zone      NOT NULL DEFAULT now()
created_at               timestamp with time zone      NOT NULL DEFAULT now()
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (id)
UNIQUE INDEX (case_id, discord_message_id) WHERE (discord_message_id IS NOT NULL)
```


### case_assignees
```sql
case_id                  integer                       NOT NULL
org_id                   integer                       NOT NULL
user_id                  integer                       NOT NULL
assigned_at              timestamp with time zone      NOT NULL DEFAULT now()
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (case_id, user_id)
FOREIGN KEY (user_id) REFERENCES users(id)
```


### case_attachments
```sql
id                       integer                       NOT NULL DEFAULT nextval('case_attachments_id_seq')
case_id                  integer                       NOT NULL
org_id                   integer                       NOT NULL
file_path                character varying(300)        NOT NULL
original_name            character varying(300)        
mime                     character varying(80)         NOT NULL
created_at               timestamp with time zone      NOT NULL DEFAULT now()
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (id)
```


### case_config
```sql
guild_id                 character varying(20)         NOT NULL
forum_channel_id         character varying(20)         
updated_at               timestamp with time zone      NOT NULL DEFAULT now()
PRIMARY KEY (guild_id)
```


### case_letter_config
```sql
id                       integer                       NOT NULL DEFAULT nextval('case_letter_config_id_seq')
org_id                   integer                       NOT NULL
province                 character varying(100)        NOT NULL
org_name                 character varying(200)        NOT NULL
address                  character varying(300)        NOT NULL
signer_name              character varying(100)        NOT NULL
signer_position          character varying(200)        NOT NULL
coordinator_name         character varying(100)        
coordinator_phone        character varying(30)         
updated_at               timestamp with time zone      NOT NULL DEFAULT now()
FOREIGN KEY (org_id) REFERENCES orgs(id)
UNIQUE (org_id, province)
PRIMARY KEY (id)
```


---

## Cooking (prefix `cooking_`)

### cooking_menus
```sql
id                       character varying(80)         NOT NULL
owner                    character varying(64)         
name                     text                          NOT NULL
food_groups              jsonb                         NOT NULL DEFAULT '[]'
protein                  jsonb                         NOT NULL DEFAULT '[]'
method                   text                          
cuisine                  text                          
flavor                   jsonb                         NOT NULL DEFAULT '[]'
carb_in_dish             boolean                       NOT NULL DEFAULT false
ingredients              jsonb                         NOT NULL DEFAULT '{"core": [], "optional": []}'
staples_used             jsonb                         NOT NULL DEFAULT '[]'
steps                    jsonb                         NOT NULL DEFAULT '[]'
gates                    jsonb                         NOT NULL DEFAULT '{"key": [], "protein": []}'
image_emoji              text                          
image_url                text                          
source                   character varying(2)          
created_at               timestamp with time zone      NOT NULL DEFAULT now()
PRIMARY KEY (id)
```


### cooking_ingredients
```sql
id                       integer                       NOT NULL DEFAULT nextval('cooking_ingredients_id_seq')
owner                    character varying(64)         NOT NULL
token                    character varying(80)         NOT NULL
label                    character varying(80)         NOT NULL
grp                      character varying(16)         NOT NULL
tier                     character varying(16)         NOT NULL DEFAULT 'regular'
created_at               timestamp with time zone      NOT NULL DEFAULT now()
PRIMARY KEY (id)
UNIQUE (token)
```


### cooking_pantry
```sql
ingredient               character varying(80)         NOT NULL
status                   character varying(8)          NOT NULL DEFAULT 'have'
updated_at               timestamp with time zone      NOT NULL DEFAULT now()
kitchen_id               integer                       NOT NULL
FOREIGN KEY (kitchen_id) REFERENCES cooking_kitchens(id)
PRIMARY KEY (kitchen_id, ingredient)
```


### cooking_kitchens
```sql
id                       integer                       NOT NULL DEFAULT nextval('cooking_kitchens_id_seq')
name                     character varying(80)         NOT NULL
owner                    character varying(64)         NOT NULL
created_at               timestamp with time zone      NOT NULL DEFAULT now()
PRIMARY KEY (id)
```


### cooking_kitchen_members
```sql
kitchen_id               integer                       NOT NULL
member                   character varying(64)         NOT NULL
added_at                 timestamp with time zone      NOT NULL DEFAULT now()
FOREIGN KEY (kitchen_id) REFERENCES cooking_kitchens(id) ON DELETE CASCADE
PRIMARY KEY (kitchen_id, member)
```


### cooking_history
```sql
id                       integer                       NOT NULL DEFAULT nextval('cooking_history_id_seq')
menu_id                  character varying(80)         NOT NULL
cooked_at                timestamp with time zone      NOT NULL DEFAULT now()
kitchen_id               integer                       NOT NULL
FOREIGN KEY (kitchen_id) REFERENCES cooking_kitchens(id)
PRIMARY KEY (id)
```


---

## Audit

### audit_logs
```sql
id                       bigint                        NOT NULL DEFAULT nextval('audit_logs_id_seq')
org_id                   integer                       NOT NULL
app                      character varying(20)         NOT NULL
action                   character varying(60)         NOT NULL
actor_id                 integer                       
target_id                character varying(50)         
meta                     jsonb                         
created_at               timestamp with time zone      NOT NULL DEFAULT now()
FOREIGN KEY (actor_id) REFERENCES users(id)
FOREIGN KEY (org_id) REFERENCES orgs(id)
PRIMARY KEY (id)
```


---

## Archive (ไม่ใช้แล้ว รอ drop)

### _dc_members
```sql
id                       integer                       NOT NULL DEFAULT nextval('dc_members_id_seq')
guild_id                 character varying(20)          DEFAULT ''
discord_id               character varying(20)         
phone                    character varying(20)         
line_id                  character varying(100)        
google_id                character varying(100)        
username                 character varying(100)        
display_name             character varying(100)        
avatar                   text                          
nickname                 character varying(100)        
firstname                character varying(100)        
lastname                 character varying(100)        
amphoe                   character varying(100)        
serial                   character varying(50)         
member_id                integer                       
specialty                text                          
province                 text                          
primary_province         character varying(100)        
bank_name                character varying(50)         
account_no               character varying(50)         
account_holder           character varying(100)        
region                   character varying(100)        
roles                    text                          
registered_at            timestamp with time zone       DEFAULT CURRENT_TIMESTAMP
updated_at               timestamp with time zone      NOT NULL DEFAULT CURRENT_TIMESTAMP
referred_by              character varying(255)        
interests                text                          
roles_assigned_at        timestamp with time zone      
position                 character varying(100)        
id_card_image            bytea                         
phone_verified_at        timestamp with time zone      
email                    character varying(255)        
web_roles                text                          
PRIMARY KEY (id)
UNIQUE INDEX (guild_id, discord_id)
UNIQUE INDEX (guild_id, member_id) WHERE (member_id IS NOT NULL)
UNIQUE INDEX (email) WHERE (email IS NOT NULL)
```


---

## Backups

Backups อยู่ที่ `backups/` · production ทำอัตโนมัติผ่าน cron (ดู `md/DEPLOYMENT.md`)
