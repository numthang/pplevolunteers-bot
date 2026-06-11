/**
 * 2026-06-10: Seed guild role catalog + policy เข้า dc_guild_role_groups + dc_guild_roles (SPEC.md กอง A §10)
 *
 * แนวคิด — แยก 2 ชั้น (ดู §3):
 *   1. CATALOG (universal)  — role id↔name ทุก role "ดึงสดจาก Discord" (ground truth ไม่ drift)
 *                             ← นี่คือ logic เดียวกับ bot catalog sync (กอง B item 8) bootstrap มาก่อน
 *   2. POLICY (per-guild)   — ป้าย A picker + ป้าย B RBAC ของ "อาสาประชาชน" (ย้าย hardcode เดิมมา)
 *                             guild ใหม่ตั้ง policy ผ่าน UI (item 10) ไม่ต้องมี seed
 *
 * Identity resolution (จุดที่แก้ปัญหาไฟล์ drift):
 *   - policy ที่ config เก็บเป็น roleId (interest/skill/province/region) → match live ด้วย "id" → ได้ชื่อสด (rename หายเอง)
 *   - policy ที่เป็นชื่อล้วน (title → permission)                        → match live ด้วย "ชื่อ" → ได้ id จริง
 *   - หาไม่เจอ (role โดนลบ / ยังไม่สร้าง เช่น เลขาธิการ) → warn + skip (assign role ที่ไม่มีไม่ได้)
 *
 * Usage:
 *   PROD: sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/migration/seed-guild-roles.js'
 *   DEV:  node scripts/migration/seed-guild-roles.js
 *   DRY:  node scripts/migration/seed-guild-roles.js --dry   (ดึง Discord + print สรุป ไม่เขียน DB)
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const pool = require('../../db/index');
const {
  ROLES, INTEREST_CONFIG, SKILL_CONFIG,
  PROVINCE_ROLES, SUB_REGION_ROLES, MAIN_REGION_ROLES,
} = require('./_roles-archive');

const GUILD_ID = process.env.GUILD_ID;
const TOKEN    = process.env.DISCORD_BOT_TOKEN || process.env.TOKEN;
const DRY      = process.argv.includes('--dry');

// title role (ชื่อ) → permission (SPEC §5) — บรรณาธิการ ใช้ ทีมบรรณาธิการ, เลขาธิการ ยังไม่สร้าง
const PERMISSION_BY_ROLE = {
  'Admin':                'admin',
  'เลขาธิการ':            'secretary_general',    // ยังไม่มีในระบบ → จะ warn+skip จนกว่าจะสร้าง
  'ผู้ประสานงานภาค':      'regional_coordinator',
  'รองเลขาธิการ':         'regional_coordinator',
  'ผู้ประสานงานจังหวัด':  'province_coordinator',
  'กรรมการจังหวัด':       'district_coordinator',  // ตทอ. = กรรมการจังหวัด · ปัจจุบันสิทธิ์เท่า province_coordinator
  'เหรัญญิก':             'treasurer',
  'ทีมบรรณาธิการ':        'editor',
  'Moderator':            'moderator',
};

// กลุ่ม picker (dc_guild_role_groups)
const GROUPS = [
  { group_key: 'interest', label: 'ความสนใจ', kind: 'plain',    sort_order: 1 },
  { group_key: 'skill',    label: 'ความถนัด', kind: 'plain',    sort_order: 2 },
  { group_key: 'province', label: 'จังหวัด',  kind: 'province', sort_order: 3 },
];

function buildRows(idToNameLive, nameToIdLive) {
  const missingNames = []; // policy ชื่อล้วนที่ไม่มีใน guild (เช่น เลขาธิการ)
  const staleIds     = []; // policy roleId ที่ไม่มีใน guild (role โดนลบ / config เก่า)

  // rows keyed ด้วย role_id (= PK ของ catalog)
  const rows = new Map();
  const ensure = (id, name) => {
    let r = rows.get(id);
    if (!r) {
      r = { role_id: id, role_name: name, permission: null, scope_node: null,
            picker_group: null, picker_label: null, picker_emoji: null, picker_order: null };
      rows.set(id, r);
    }
    return r;
  };

  // ── 1. CATALOG: ทุก role ใน guild (ground truth) ──
  for (const [id, name] of idToNameLive) ensure(id, name);

  // resolve helpers
  const byName = (name) => {                       // policy ชื่อล้วน → live id
    const id = nameToIdLive.get(name);
    if (!id) { if (!missingNames.includes(name)) missingNames.push(name); return null; }
    return ensure(id, idToNameLive.get(id));
  };
  const byId = (id, label) => {                     // policy roleId จาก config → live name
    const name = idToNameLive.get(id);
    if (!name) { staleIds.push(label || id); return null; }
    return ensure(id, name);
  };

  // ── 2. POLICY ──
  // ป้าย B: title → permission
  for (const [name, permission] of Object.entries(PERMISSION_BY_ROLE)) {
    const r = byName(name); if (r) r.permission = permission;
  }

  // ป้าย B + ป้าย A: ทีมจังหวัด → scope_node='province:<จ>' + picker province
  let provOrder = 0;
  for (const [province, id] of Object.entries(PROVINCE_ROLES)) {
    const r = byId(id, `ทีม${province}`); if (!r) continue;
    r.scope_node   = `province:${province}`;
    r.picker_group = 'province';
    r.picker_label = province;
    r.picker_order = provOrder++;
  }

  // ป้าย B: ทีมภาค → subregion:/region:<role_name สด> (calling รู้จักแค่ subregion §7)
  const subRegionIds = new Set(Object.values(SUB_REGION_ROLES));
  const regionIds    = new Set([...subRegionIds, ...Object.values(MAIN_REGION_ROLES)]);
  for (const id of regionIds) {
    const r = byId(id); if (!r || r.scope_node) continue; // กันชนกับ province
    r.scope_node = subRegionIds.has(id) ? `subregion:${r.role_name}` : `region:${r.role_name}`;
  }

  // ป้าย A: interest picker
  let iOrder = 0;
  for (const item of INTEREST_CONFIG) {
    if (item.divider) continue;
    const r = byId(item.roleId, item.label); if (!r) continue;
    r.picker_group = 'interest';
    r.picker_label = item.label;
    r.picker_emoji = item.emoji;
    r.picker_order = iOrder++;
  }

  // ป้าย A: skill picker
  let sOrder = 0;
  for (const item of SKILL_CONFIG) {
    const r = byId(item.roleId, item.label); if (!r) continue;
    r.picker_group = 'skill';
    r.picker_label = item.label;
    r.picker_emoji = item.emoji;
    r.picker_order = sOrder++;
  }

  return { rows: [...rows.values()], missingNames, staleIds };
}

async function writeToDb({ rows, missingNames, staleIds }) {
  // 1. groups
  for (const g of GROUPS) {
    await pool.query(
      `INSERT INTO dc_guild_role_groups (guild_id, group_key, label, kind, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id, group_key) DO UPDATE
       SET label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order`,
      [GUILD_ID, g.group_key, g.label, g.kind, g.sort_order]
    );
  }
  console.log(`  ✓ ${GROUPS.length} groups`);

  // 2. roles (catalog + policy)
  let done = 0, errors = 0;
  for (const r of rows) {
    try {
      await pool.query(
        `INSERT INTO dc_guild_roles
           (guild_id, role_id, role_name, permission, scope_node, picker_group, picker_label, picker_emoji, picker_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (guild_id, role_id) DO UPDATE SET
           role_name = EXCLUDED.role_name, permission = EXCLUDED.permission, scope_node = EXCLUDED.scope_node,
           picker_group = EXCLUDED.picker_group, picker_label = EXCLUDED.picker_label,
           picker_emoji = EXCLUDED.picker_emoji, picker_order = EXCLUDED.picker_order,
           updated_at = CURRENT_TIMESTAMP`,
        [GUILD_ID, r.role_id, r.role_name, r.permission, r.scope_node,
         r.picker_group, r.picker_label, r.picker_emoji, r.picker_order]
      );
    } catch (e) {
      errors++;
      console.error(`\n  ✗ ${r.role_name}: ${e.message}`);
    }
    done++;
    process.stdout.write(`\r  ${done}/${rows.length} roles (${errors} errors)`);
  }
  process.stdout.write('\n');
  console.log(`\nDone: ${done - errors} upserted, ${errors} errors`);
}

function printSummary({ rows, missingNames, staleIds }) {
  const perm = rows.filter(r => r.permission).length;
  const scope = rows.filter(r => r.scope_node).length;
  const pick = rows.filter(r => r.picker_group).length;
  console.log(`สรุป: ${rows.length} roles (catalog) · ${perm} permission · ${scope} scope · ${pick} picker`);
  if (missingNames.length)
    console.warn(`⚠️  policy ชื่อล้วนที่ยังไม่มีใน guild (skip): ${missingNames.join(', ')}`);
  if (staleIds.length)
    console.warn(`⚠️  policy roleId ที่ไม่มีใน guild แล้ว (config เก่า/role ถูกลบ, skip): ${staleIds.join(', ')}`);
}

async function main() {
  if (!GUILD_ID) { console.error('❌ env GUILD_ID ว่าง'); process.exit(1); }
  if (!TOKEN)    { console.error('❌ env DISCORD_BOT_TOKEN (หรือ TOKEN) ว่าง'); process.exit(1); }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', async () => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const liveRoles = (await guild.roles.fetch()).filter(r => r.name !== '@everyone');
      const idToNameLive = new Map();
      const nameToIdLive = new Map();
      liveRoles.forEach(r => { idToNameLive.set(r.id, r.name); nameToIdLive.set(r.name, r.id); });
      console.log(`Fetched ${idToNameLive.size} roles สดจาก guild ${GUILD_ID}`);

      const built = buildRows(idToNameLive, nameToIdLive);
      printSummary(built);

      if (DRY) {
        console.log('\n[--dry] ไม่เขียน DB');
      } else {
        await writeToDb(built);
      }
    } catch (e) {
      console.error(e);
      process.exitCode = 1;
    } finally {
      await client.destroy();
      if (!DRY) await pool.end();
      process.exit(process.exitCode || 0);
    }
  });

  client.login(TOKEN);
}

main();
