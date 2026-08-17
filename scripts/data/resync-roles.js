// scripts/data/resync-roles.js
// อัปเดต org_members.roles ให้ตรงกับยศจริงใน Discord
//
// ทำไมต้องมี: เว็บ (ผังทีม /team, สิทธิ์) อ่านรายชื่อยศจากสำเนาใน DB ไม่ได้ถาม Discord สดเหมือนบอท
// สำเนานี้อัปเดตเฉพาะตอนมีคนเข้าใหม่/ถูกแก้ยศทีละคนเท่านั้น — คนที่ import มาตั้งแต่แรกจึงค้างตลอด
// (วัดบน dev 2026-08-18: กิลด์ราชบุรี 347 แถว เคย sync จริงแค่ 5 แถว)
//
// ⚠️ ไม่ได้กระทบแค่ผังทีม — org_members.roles เป็นฐานคำนวณสิทธิ์ด้วย
// รันจริง = สิทธิ์ถูกคำนวณใหม่ตามยศจริงใน Discord (ยศที่ค้างเกินจริงจะถูกถอด)
// รัน --dry ดูก่อนเสมอ
//
// Usage:
//   node scripts/data/resync-roles.js --dry            → ดูว่าจะเปลี่ยนของใครบ้าง ไม่เขียน DB
//   node scripts/data/resync-roles.js                  → รันจริง ทุก guild ที่บอทอยู่
//   node scripts/data/resync-roles.js <guildId> --dry  → เฉพาะ guild เดียว
//
// PRODUCTION:
//   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/data/resync-roles.js --dry'

require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const pool = require('../../db/index');
const { upsertMemberFromDiscord } = require('../../db/members');

const DRY = process.argv.includes('--dry');
const onlyGuild = process.argv.find(a => /^\d{17,20}$/.test(a)) || null;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// กติกาเดียวกับ _deriveRoleFields ใน db/members.js — ยศทั้งหมดยกเว้น @everyone คั่นด้วย comma
function rolesOf(member) {
  return member.roles.cache
    .filter(r => r.name !== '@everyone')
    .map(r => r.name)
    .join(',') || null;
}

function diffRoles(before, after) {
  const a = new Set((before || '').split(',').map(s => s.trim()).filter(Boolean));
  const b = new Set((after || '').split(',').map(s => s.trim()).filter(Boolean));
  return {
    added: [...b].filter(x => !a.has(x)),
    removed: [...a].filter(x => !b.has(x)),
  };
}

async function resyncGuild(guild) {
  process.stdout.write(`\n[${guild.name}] fetching members...\n`);
  const members = await guild.members.fetch();
  const total = members.size;

  const { rows } = await pool.query(
    `SELECT u.discord_id, om.roles
       FROM org_members om JOIN users u ON u.id = om.user_id
      WHERE om.guild_id = $1 AND u.discord_id IS NOT NULL`,
    [guild.id]
  );
  const inDb = new Map(rows.map(r => [r.discord_id, r.roles]));
  console.log(`[${guild.name}] Fetched ${total} members (ในฐาน ${inDb.size}), comparing...`);

  let changed = 0, missing = 0, same = 0, errors = 0, done = 0;
  const samples = [];

  for (const member of members.values()) {
    done++;
    try {
      const after = rolesOf(member);
      const has = inDb.has(member.id);
      const before = has ? inDb.get(member.id) : null;

      if (has && before === after) { same++; }
      else {
        if (!has) missing++; else changed++;
        if (samples.length < 5) {
          const d = diffRoles(before, after);
          samples.push(`    ${member.displayName}${has ? '' : ' (ยังไม่มีในฐาน)'}` +
            (d.added.length ? ` +[${d.added.join(', ')}]` : '') +
            (d.removed.length ? ` -[${d.removed.join(', ')}]` : ''));
        }
        if (!DRY) await upsertMemberFromDiscord(member);
      }
    } catch (err) {
      errors++;
      if (errors <= 3) console.error(`\n  ! ${member.id}: ${err.message}`);
    }
    if (done % 50 === 0 || done === total) {
      process.stdout.write(`\r  ${done}/${total} (${changed + missing} ต้องอัปเดต, ${errors} errors)`);
    }
  }

  process.stdout.write('\n');
  if (samples.length) console.log('  ตัวอย่างที่จะเปลี่ยน:\n' + samples.join('\n'));
  console.log(`[${guild.name}] Done: ${changed} ยศไม่ตรง, ${missing} ยังไม่มีในฐาน, ` +
              `${same} ตรงอยู่แล้ว, ${errors} errors${DRY ? ' (DRY RUN)' : ''}`);
  return { changed, missing, errors };
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}${DRY ? ' — DRY RUN (ไม่เขียน DB)' : ''}`);

  const guilds = [...client.guilds.cache.values()].filter(g => !onlyGuild || g.id === onlyGuild);
  if (!guilds.length) {
    console.error(onlyGuild ? `ไม่พบ guild ${onlyGuild} (บอทไม่ได้อยู่ในเซิร์ฟเวอร์นี้)` : 'บอทไม่ได้อยู่ใน guild ไหนเลย');
    await client.destroy(); await pool.end(); process.exit(1);
  }

  let tc = 0, tm = 0, te = 0;
  for (const guild of guilds) {
    try {
      const r = await resyncGuild(guild);
      tc += r.changed; tm += r.missing; te += r.errors;
    } catch (err) {
      console.error(`\n[${guild.name}] ล้มเหลว: ${err.message}`);
      te++;
    }
  }

  console.log(`\n=== รวม ${guilds.length} guild: ${tc} ยศไม่ตรง, ${tm} ยังไม่มีในฐาน, ${te} errors ===`);
  if (DRY) console.log('DRY RUN — ยังไม่ได้เขียนอะไรลง DB · ตัด --dry ออกเพื่อรันจริง');
  await client.destroy();
  await pool.end();
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
