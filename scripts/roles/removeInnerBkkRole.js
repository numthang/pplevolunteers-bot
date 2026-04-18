// scripts/removeInnerBkkRole.js //ใช้ลบกรุงเทพชั้นในที่อนุมานผิดใน intro_normalize ใช้ครั้งเดียว
require('dotenv').config();
const {Client, GatewayIntentBits} = require('discord.js');
const {ROLES} = require('../../config/roles');

const GUILD_ID = process.env.GUILD_ID;
const DELAY_MS = 500;
const DRY_RUN = process.argv.includes('--dry-run');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// discord_id ของคนที่พิมพ์ กรุงเทพ เฉยๆ
const TARGET_IDS = new Set(require('../bkk_ids.json'));

const ROLE_TO_REMOVE = ROLES['ทีมกรุงเทพชั้นใน'];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  if (DRY_RUN) console.log(`⚠️  DRY RUN mode\n`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();

  let removed = 0;
  let skipped = 0;
  let notFound = 0;

  for (const discord_id of TARGET_IDS) {
    const member = guild.members.cache.get(discord_id);

    if (!member) {
      console.log(`⚠️  ไม่พบใน server: ${discord_id}`);
      notFound++;
      continue;
    }

    if (!member.roles.cache.has(ROLE_TO_REMOVE)) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[DRY RUN] จะถอด ทีมกรุงเทพชั้นใน จาก ${member.user.username}`);
    } else {
      try {
        await member.roles.remove(ROLE_TO_REMOVE);
        console.log(`✅ ถอด ทีมกรุงเทพชั้นใน จาก ${member.user.username}`);
        removed++;
      } catch (err) {
        console.error(`❌ ${discord_id} — ${err.message}`);
      }
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n🎉 เสร็จสิ้น: removed ${removed} | skipped ${skipped} | notFound ${notFound}`);
  process.exit(0);
});

client.login(process.env.TOKEN);
