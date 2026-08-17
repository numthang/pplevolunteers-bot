// scripts/data/backfill-avatars.js
// เติม org_members.avatar จาก Discord — ผังทีมบนเว็บ (/bot/orgchart) ใช้รูปนี้แสดงโหนดคน
//
// ทำไมต้องมี: avatar ถูกเขียนเฉพาะตอนสมัครผ่าน registerHandler เท่านั้น
// สมาชิกที่เข้ามาก่อนหน้า/ไม่ได้สมัครผ่านฟอร์มจึงว่างทั้งหมด (วัดจริง 2026-08-17: มี 3 จาก 5,550)
//
// Usage:
//   node scripts/data/backfill-avatars.js                 → ทุก guild ที่บอทอยู่
//   node scripts/data/backfill-avatars.js <guildId>       → เฉพาะ guild เดียว
//   node scripts/data/backfill-avatars.js --dry           → ดูว่าจะอัปเดตกี่แถว ไม่เขียนจริง
//
// PRODUCTION:
//   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && node scripts/data/backfill-avatars.js'

require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const pool = require('../../db/index');

const DRY = process.argv.includes('--dry');
const onlyGuild = process.argv.find(a => /^\d{17,20}$/.test(a)) || null;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

async function backfillGuild(guild) {
  process.stdout.write(`\n[${guild.name}] fetching members...\n`);
  const members = await guild.members.fetch();
  const total = members.size;
  console.log(`[${guild.name}] Fetched ${total} members, upserting...`);

  let updated = 0, skipped = 0, errors = 0, done = 0;

  for (const member of members.values()) {
    done++;
    try {
      // displayAvatarURL คืน default avatar ให้คนที่ไม่ได้ตั้งรูปด้วย — เก็บเฉพาะรูปที่ตั้งเองจริง
      // (default avatar ไม่มีประโยชน์: หน้าเว็บวาด placeholder สวยกว่าอยู่แล้ว)
      const url = member.user.avatar
        ? member.user.displayAvatarURL({ extension: 'webp', size: 256 })
        : null;

      if (!url) { skipped++; }
      else if (DRY) { updated++; }
      else {
        const { rowCount } = await pool.query(
          `UPDATE org_members om
              SET avatar = $1
             FROM users u
            WHERE u.id = om.user_id
              AND u.discord_id = $2
              AND om.guild_id = $3
              AND om.avatar IS DISTINCT FROM $1`,
          [url, member.id, guild.id]
        );
        if (rowCount > 0) updated++; else skipped++;
      }
    } catch (err) {
      errors++;
      if (errors <= 3) console.error(`\n  ! ${member.id}: ${err.message}`);
    }
    if (done % 50 === 0 || done === total) {
      process.stdout.write(`\r  ${done}/${total} (${updated} updated, ${errors} errors)`);
    }
  }

  process.stdout.write('\n');
  console.log(`[${guild.name}] Done: ${updated} updated, ${skipped} skipped, ${errors} errors${DRY ? ' (DRY RUN)' : ''}`);
  return { updated, skipped, errors };
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}${DRY ? ' — DRY RUN (ไม่เขียน DB)' : ''}`);

  const guilds = [...client.guilds.cache.values()]
    .filter(g => !onlyGuild || g.id === onlyGuild);

  if (!guilds.length) {
    console.error(onlyGuild ? `ไม่พบ guild ${onlyGuild} (บอทไม่ได้อยู่ในเซิร์ฟเวอร์นี้)` : 'บอทไม่ได้อยู่ใน guild ไหนเลย');
    await client.destroy(); await pool.end(); process.exit(1);
  }

  let tu = 0, ts = 0, te = 0;
  for (const guild of guilds) {
    try {
      const r = await backfillGuild(guild);
      tu += r.updated; ts += r.skipped; te += r.errors;
    } catch (err) {
      console.error(`\n[${guild.name}] ล้มเหลว: ${err.message}`);
      te++;
    }
  }

  console.log(`\n=== รวม ${guilds.length} guild: ${tu} updated, ${ts} skipped, ${te} errors ===`);
  await client.destroy();
  await pool.end();
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
