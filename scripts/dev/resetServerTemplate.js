// scripts/dev/resetServerTemplate.js
// ⚠️ DEV / TEST ONLY — ลบ role + channel ที่ตรงกับ template ออกจาก guild ที่ระบุ แล้ว (option) provision ใหม่
//
//   node scripts/dev/resetServerTemplate.js <guildId> <orgName> [--template th-civic-starter] [--provision] [--dry-run]
//
// guard 3 ชั้น:
//   1) ต้องพิมพ์ guildId + orgName เอง (ไม่มี default / ไม่ fallback env)
//   2) block guild เดียวกับ process.env.GUILD_ID (production) เสมอ
//   3) type-to-confirm — ต้องพิมพ์ชื่อ server ให้ตรงถึงจะลบ
// ลบเฉพาะ role/channel ที่ตรงชื่อ template (เก่า ∪ ใหม่) · skip managed / @everyone / bot role

require('dotenv').config();
const readline = require('readline');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const pool = require('../../db/index');
const { deleteSetting } = require('../../db/settings');
const { loadTemplate, run } = require('../../services/serverProvisioner');

const [, , guildId, orgName, ...rest] = process.argv;
const tplIdx      = rest.indexOf('--template');
const templateId  = tplIdx !== -1 ? rest[tplIdx + 1] : 'th-civic-starter';
const DO_PROVISION = rest.includes('--provision');
const DRY          = rest.includes('--dry-run');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!guildId || !orgName || guildId.startsWith('--') || orgName.startsWith('--')) {
  console.error('Usage: node scripts/dev/resetServerTemplate.js <guildId> <orgName> [--template id] [--provision] [--dry-run]');
  process.exit(1);
}
// guard 2 — ห้ามแตะ production guild เด็ดขาด
if (guildId === process.env.GUILD_ID) {
  console.error(`❌ ปฏิเสธ: ${guildId} คือ production guild (process.env.GUILD_ID) — script นี้ใช้กับ test server เท่านั้น`);
  process.exit(1);
}

// role เดิม (political) ที่ถูกตัด/เปลี่ยนชื่อออกจาก template — ให้ reset เก็บกวาดด้วย
const LEGACY_ROLE_NAMES = [
  'เลขาธิการ', 'ผู้ประสานงานภาค', 'รองเลขาธิการ', 'ผู้ประสานงานจังหวัด', 'กรรมการจังหวัด',
  'ทีมบรรณาธิการ', 'ทีมพื้นที่/ร้องเรียน',
  // interest เดิม
  'อาสาส้ม', 'อาสาสู้ภัยพิบัติ', 'ทีมสาธารณสุข', 'ปีกเยาวชน', 'ทีมเครือข่ายชาติพันธุ์',
  'ประชาชนคนเกษตร', 'ทีมเครือข่ายผู้ใช้แรงงาน', 'ก้าวเลิร์น (การศึกษา)', 'ปีกวัฒนธรรม',
  'ทีมงานสภา', 'ทีมผู้สมัครรับเลือกตั้ง', 'ทีมผู้ช่วยหาเสียง/เรื่องร้องเรียน',
  'ทีมตัวแทนสมาชิก', 'ทีมจังหวัด/สมาชิกสัมพันธ์', 'ทีมเจ้าหน้าที่/สตาฟ',
  // skill เดิม
  'ทีมกระบวนกร', 'ทีมตัดต่อ', 'ทีมช่างภาพ', 'ทีมนโยบาย', 'ทีมเทคโนโลยี', 'ทีมสื่อ',
];

const subOrg = (s) => (typeof s === 'string' ? s.replaceAll('{{org_name}}', orgName) : s);

function templateRoleNames(tpl) {
  const names = new Set(LEGACY_ROLE_NAMES);
  for (const r of tpl.roles.staff ?? []) names.add(subOrg(r.default_name));
  if (tpl.roles.org_role) names.add(subOrg(tpl.roles.org_role.default_name));
  for (const grp of ['interest', 'skill']) {
    for (const o of tpl.roles.pickers?.[grp]?.options ?? []) {
      names.add(subOrg(o.label));
      if (o.parent) names.add(subOrg(o.parent));
    }
  }
  return names;
}
function templateChannelNames(tpl) {
  const cats = new Set(), chans = new Set();
  for (const c of tpl.categories ?? []) {
    cats.add(subOrg(c.name));
    for (const ch of c.channels ?? []) chans.add(subOrg(ch.name));
  }
  return { cats, chans };
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  try {
    console.log(`✅ Logged in as ${client.user.tag}`);
    const tpl = loadTemplate(templateId);
    const guild = await client.guilds.fetch(guildId);
    await guild.roles.fetch();
    await guild.channels.fetch();

    const botTop = guild.members.me.roles.highest.position;
    const roleNames = templateRoleNames(tpl);
    const { cats, chans } = templateChannelNames(tpl);

    const rolesToDelete = [...guild.roles.cache.values()].filter(
      (r) => r.id !== guild.id && !r.managed && roleNames.has(r.name),
    );
    const chsToDelete = [...guild.channels.cache.values()].filter((c) =>
      c.type === ChannelType.GuildCategory ? cats.has(c.name) : chans.has(c.name),
    );

    console.log(`\n🗑️  RESET target: ${guild.name} (${guild.id})`);
    console.log(`   Roles ที่จะลบ    : ${rolesToDelete.length}`);
    rolesToDelete.forEach((r) => console.log(`     - ${r.name}${r.position >= botTop ? '  ⚠️ สูงกว่า bot (ลบไม่ได้)' : ''}`));
    console.log(`   Channels ที่จะลบ : ${chsToDelete.length}`);
    chsToDelete.forEach((c) => console.log(`     - ${c.name}`));

    if (DRY) { console.log('\n⚠️  DRY RUN — ไม่ลบจริง'); return finish(); }
    if (!rolesToDelete.length && !chsToDelete.length) { console.log('\nไม่มีอะไรต้องลบ'); return finish(); }

    const typed = await ask(`\n⚠️  พิมพ์ชื่อ server "${guild.name}" ให้ตรงเพื่อยืนยันการลบ: `);
    if (typed !== guild.name) { console.log('❌ ชื่อไม่ตรง — ยกเลิก'); return finish(1); }

    // ลบ channel (ห้องธรรมดาก่อน → category)
    const deletedChIds = [];
    const nonCat = chsToDelete.filter((c) => c.type !== ChannelType.GuildCategory);
    const catsOnly = chsToDelete.filter((c) => c.type === ChannelType.GuildCategory);
    for (const c of [...nonCat, ...catsOnly]) {
      try {
        deletedChIds.push(c.id);
        await c.delete('reset server template');
        console.log(`✅ ลบห้อง #${c.name}`);
        await sleep(400);
      } catch (e) { console.error(`❌ ห้อง #${c.name}: ${e.message}`); }
    }

    // ลบ role (เฉพาะที่ต่ำกว่า bot)
    const deletedRoleIds = [];
    for (const r of rolesToDelete) {
      if (r.position >= botTop) { console.error(`⏭️  ข้าม role "${r.name}" — สูงกว่า/เท่า bot (ลาก bot role ขึ้นบนก่อน)`); continue; }
      try {
        deletedRoleIds.push(r.id);
        await r.delete('reset server template');
        console.log(`✅ ลบ role ${r.name}`);
        await sleep(400);
      } catch (e) { console.error(`❌ role ${r.name}: ${e.message}`); }
    }

    // ล้าง orphan sticky config ของห้องที่ลบ
    for (const id of deletedChIds) await deleteSetting(guildId, `sticky_${id}`).catch(() => {});
    // ล้าง dc_guild_roles ของ role ที่ลบ (client นี้ไม่มี roleDelete listener ของบอทหลัก)
    if (deletedRoleIds.length) {
      await pool.query('DELETE FROM dc_guild_roles WHERE guild_id = $1 AND role_id = ANY($2)', [guildId, deletedRoleIds])
        .catch((e) => console.error('dc_guild_roles cleanup:', e.message));
    }
    console.log(`\n✅ Reset เสร็จ — ลบ ${deletedRoleIds.length} roles, ${deletedChIds.length} channels`);

    // provision ใหม่ (option)
    if (DO_PROVISION) {
      console.log(`\n🚀 Provision ใหม่ (${templateId}, org=${orgName})...`);
      const freshGuild = await client.guilds.fetch(guildId);
      const log = await run(freshGuild, { templateId, orgName, onProgress: async (s) => console.log('  ' + s) });
      console.log(`✅ Provision: สร้าง ${log.rolesCreated.length} roles, ${log.channelsCreated.length} channels · errors ${log.errors.length}`);
      if (log.errors.length) log.errors.slice(0, 10).forEach((e) => console.log('   ⚠️ ' + e));
    }

    return finish();
  } catch (e) {
    console.error('❌ ล้มเหลว:', e);
    return finish(1);
  }
});

async function finish(code = 0) {
  await pool.end().catch(() => {});
  client.destroy();
  process.exit(code);
}

client.login(process.env.DISCORD_BOT_TOKEN);
