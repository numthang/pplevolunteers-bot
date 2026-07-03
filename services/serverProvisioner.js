// services/serverProvisioner.js
// อ่าน server template (config/server-templates/*.json) แล้ว provision role/channel/permission/panel/config
// ให้ guild — idempotent (รันซ้ำได้): roles/channels = find-or-create, overwrites = set, config = upsert
// ไม่แตะ commands/panel.js — โพสต์ panel เอง (customId เดิม btn_open_register_modal / btn_open_interest)

const fs = require('fs');
const path = require('path');
const {
  ChannelType, PermissionFlagsBits,
  GuildFeature, GuildVerificationLevel, GuildExplicitContentFilter,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const pool = require('../db/index');
const { getSetting, setSetting } = require('../db/settings');
const { refreshSticky } = require('../handlers/stickyHandler');

const TEMPLATE_DIR = path.join(__dirname, '../config/server-templates');
const CREATE_DELAY_MS = 500; // เลี่ยง rate limit

const CHANNEL_TYPE = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement,
  stage: ChannelType.GuildStageVoice,
  forum: ChannelType.GuildForum,
};
const COMMUNITY_ONLY = new Set(['announcement', 'forum', 'stage']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadTemplate(templateId) {
  const file = path.join(TEMPLATE_DIR, `${templateId}.json`);
  if (!fs.existsSync(file)) throw new Error(`ไม่พบ template: ${templateId}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** แทนที่ {{org_name}} ใน string */
function sub(str, orgName) {
  return typeof str === 'string' ? str.replaceAll('{{org_name}}', orgName) : str;
}

/** ชื่อ permission (PascalCase) → array ของ bit สำหรับ discord.js · ข้ามชื่อที่ไม่รู้จัก */
function resolvePerms(names) {
  if (!Array.isArray(names)) return [];
  return names.map((n) => PermissionFlagsBits[n]).filter((b) => b !== undefined);
}

/** find-or-create role · คืน role · push log */
async function findOrCreateRole(guild, def, orgName, log) {
  const name = sub(def.default_name ?? def.label, orgName);
  const existing = guild.roles.cache.find((r) => r.name === name && r.name !== '@everyone');
  if (existing) { log.rolesSkipped.push(name); return existing; }
  try {
    const role = await guild.roles.create({
      name,
      color: def.color ?? undefined,
      hoist: def.hoist ?? false,
      mentionable: def.mentionable ?? false,
      permissions: resolvePerms(def.discord_permissions),
      reason: 'server setup',
    });
    log.rolesCreated.push(name);
    await sleep(CREATE_DELAY_MS);
    return role;
  } catch (e) {
    log.errors.push(`role "${name}": ${e.message}`);
    return null;
  }
}

/** find-or-create channel · match ชื่อ + parent · คืน channel */
async function findOrCreateChannel(guild, { name, type, parentId }, log) {
  const chType = CHANNEL_TYPE[type];
  const existing = guild.channels.cache.find(
    (c) => c.name === name && c.type === chType && (c.parentId ?? null) === (parentId ?? null),
  );
  if (existing) { log.channelsSkipped.push(name); return existing; }
  try {
    const ch = await guild.channels.create({ name, type: chType, parent: parentId ?? undefined, reason: 'server setup' });
    log.channelsCreated.push(name);
    await sleep(CREATE_DELAY_MS);
    return ch;
  } catch (e) {
    log.errors.push(`channel "${name}": ${e.message}`);
    return null;
  }
}

/** เปิด Community + ตั้ง rules/updates/safety channel · idempotent (รันซ้ำ set channel ซ้ำได้แม้เปิดอยู่แล้ว) */
async function ensureCommunity(guild, community, chMap, log) {
  if (!community?.enable) return;
  const rules   = chMap.get(community.rules_channel);
  const updates = chMap.get(community.public_updates_channel);
  const alreadyOn = guild.features.includes(GuildFeature.Community);
  if (!alreadyOn && (!rules || !updates)) {
    log.errors.push('เปิด Community ไม่ได้: ไม่พบ rules/updates channel');
    return;
  }
  try {
    const payload = { reason: 'server setup — community' };
    if (!alreadyOn) {
      payload.features = [...guild.features, GuildFeature.Community];
      payload.verificationLevel = GuildVerificationLevel[community.verification_level] ?? GuildVerificationLevel.Low;
      payload.explicitContentFilter = GuildExplicitContentFilter[community.explicit_content_filter] ?? GuildExplicitContentFilter.AllMembers;
    }
    if (rules)   payload.rulesChannel = rules.id;
    if (updates) {
      payload.publicUpdatesChannel = updates.id; // Community Updates Channel
      payload.safetyAlertsChannel  = updates.id; // Safety Notifications Channel
    }
    await guild.edit(payload);
    log.notes.push(alreadyOn ? 'Community เปิดอยู่แล้ว — อัปเดต updates/safety channel' : 'เปิด Community แล้ว');
    await sleep(CREATE_DELAY_MS);
  } catch (e) {
    log.errors.push(`community: ${e.message}`);
  }
}

/** ตั้ง permission_overwrites (set = replace ทั้งหมด, idempotent) */
async function applyOverwrites(guild, channel, rawOverwrites, roleMap, orgName, log) {
  if (rawOverwrites === 'inherit' || !Array.isArray(rawOverwrites)) return;
  const ows = [];
  for (const ow of rawOverwrites) {
    const roleName = sub(ow.role, orgName);
    const id = roleName === '@everyone' ? guild.roles.everyone.id : roleMap.get(roleName);
    if (!id) { log.errors.push(`overwrite "${channel.name}": ไม่พบ role "${roleName}"`); continue; }
    ows.push({ id, allow: resolvePerms(ow.allow), deny: resolvePerms(ow.deny) });
  }
  if (!ows.length) return;
  try {
    await channel.permissionOverwrites.set(ows, 'server setup');
    await sleep(200);
  } catch (e) {
    log.errors.push(`overwrite "${channel.name}": ${e.message}`);
  }
}

/** เช็คว่ามี panel (ปุ่ม customId นี้) อยู่ใน channel แล้วไหม — idempotent */
async function hasPanelButton(channel, customId) {
  try {
    const msgs = await channel.messages.fetch({ limit: 25 });
    return msgs.some((m) =>
      m.author.bot &&
      m.components?.some((row) => row.components?.some((c) => c.customId === customId)),
    );
  } catch { return false; }
}

async function postPanel(channel, { customId, buttonLabel, title, description, color }, log) {
  if (await hasPanelButton(channel, customId)) { log.notes.push(`panel มีอยู่แล้วใน #${channel.name} — ข้าม`); return; }
  try {
    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color ?? 0x5865f3);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(customId).setLabel(buttonLabel).setStyle(ButtonStyle.Primary),
    );
    await channel.send({ embeds: [embed], components: [row] });
    log.notes.push(`วาง panel ใน #${channel.name}`);
    await sleep(300);
  } catch (e) {
    log.errors.push(`panel "#${channel.name}": ${e.message}`);
  }
}

/**
 * วาง sticky panel เหมือนอาสาประชาชน — seed sticky_${channelId} แล้ว refreshSticky (re-post ให้อยู่ล่างสุด)
 * idempotent: ถ้ามี sticky config อยู่แล้ว → คง message_id เดิม, แค่ update embeds/components แล้ว refresh
 */
async function postStickyPanel(guild, channel, { customId, buttonLabel, title, description, color }, log) {
  try {
    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color ?? 0x5865f3);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(customId).setLabel(buttonLabel).setStyle(ButtonStyle.Primary),
    );
    const key = `sticky_${channel.id}`;
    let cfg = await getSetting(guild.id, key);
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = null; } }
    cfg = cfg || {};
    cfg.embeds = [embed.toJSON()];
    cfg.components = [row.toJSON()];
    if (cfg.refresh_minutes == null) cfg.refresh_minutes = 1440;
    await setSetting(guild.id, key, cfg); // คง message_id เดิม (ถ้ามี) → refresh จะ delete+repost ไม่ซ้ำ
    await refreshSticky(channel);
    log.notes.push(`วาง sticky panel ใน #${channel.name}`);
    await sleep(500);
  } catch (e) {
    log.errors.push(`sticky panel "#${channel.name}": ${e.message}`);
  }
}

const POLICY_UPSERT = `
  INSERT INTO dc_guild_roles
    (guild_id, role_id, role_name, is_managed, permission, scope_node, picker_group, picker_label, picker_emoji, picker_order, parent_role_id)
  VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8,$9,$10)
  ON CONFLICT (guild_id, role_id) DO UPDATE SET
    role_name=EXCLUDED.role_name, permission=EXCLUDED.permission, scope_node=EXCLUDED.scope_node,
    picker_group=EXCLUDED.picker_group, picker_label=EXCLUDED.picker_label, picker_emoji=EXCLUDED.picker_emoji,
    picker_order=EXCLUDED.picker_order, parent_role_id=EXCLUDED.parent_role_id, updated_at=CURRENT_TIMESTAMP`;

const GROUP_UPSERT = `
  INSERT INTO dc_guild_role_groups (guild_id, group_key, label, kind, sort_order)
  VALUES ($1,$2,$3,$4,$5)
  ON CONFLICT (guild_id, group_key) DO UPDATE SET
    label=EXCLUDED.label, kind=EXCLUDED.kind, sort_order=EXCLUDED.sort_order`;

/**
 * provision guild ตาม template
 * @param {Guild} guild
 * @param {{ templateId:string, orgName:string, includeOptional?:boolean, onProgress?:(step:string)=>Promise<void> }} opts
 */
async function run(guild, { templateId, orgName, includeOptional = false, onProgress = async () => {} }) {
  const tpl = loadTemplate(templateId);
  const log = { rolesCreated: [], rolesSkipped: [], channelsCreated: [], channelsSkipped: [], notes: [], errors: [] };
  const roleMap = new Map(); // roleName → id

  await guild.roles.fetch();
  await guild.channels.fetch();

  // ---- 1. Roles: @everyone base → staff → org_role → picker parents → picker (interest/skill) ----
  await onProgress('สร้าง roles…');
  // @everyone base permission (คัดลอกจาก server ต้นแบบ) — gate community ทำที่ overwrite ไม่ใช่ที่นี่
  if (Array.isArray(tpl.roles.everyone_permissions)) {
    try {
      await guild.roles.everyone.edit({
        permissions: resolvePerms(tpl.roles.everyone_permissions),
        reason: 'server setup — @everyone base permission',
      });
      log.notes.push('ตั้ง @everyone base permission');
      await sleep(CREATE_DELAY_MS);
    } catch (e) {
      log.errors.push(`@everyone permission: ${e.message}`);
    }
  }
  for (const def of tpl.roles.staff ?? []) {
    const r = await findOrCreateRole(guild, def, orgName, log);
    if (r) roleMap.set(r.name, r.id);
  }
  if (tpl.roles.org_role) {
    const r = await findOrCreateRole(guild, tpl.roles.org_role, orgName, log);
    if (r) roleMap.set(r.name, r.id);
  }
  // picker parent roles (จาก skill.options[].parent) — สร้างก่อนลูก
  const pickers = tpl.roles.pickers ?? {};
  const parentNames = new Set();
  for (const grp of ['interest', 'skill']) {
    for (const o of pickers[grp]?.options ?? []) if (o.parent) parentNames.add(sub(o.parent, orgName));
  }
  for (const pname of parentNames) {
    const r = await findOrCreateRole(guild, { default_name: pname, mentionable: true }, orgName, log);
    if (r) roleMap.set(r.name, r.id);
  }
  // picker roles
  for (const grp of ['interest', 'skill']) {
    const opts = pickers[grp]?.options ?? [];
    for (const o of opts) {
      const r = await findOrCreateRole(guild, { default_name: o.label, mentionable: true }, orgName, log);
      if (r) roleMap.set(r.name, r.id);
    }
  }

  // ---- 2+4. Channels (categories ก่อน แล้ว children) · ข้าม community-only ก่อนเปิด Community ----
  await onProgress('สร้าง category + channel…');
  const chMap = new Map(); // channelName (แทน {{org_name}} แล้ว) → channel
  const pending = []; // { def, parentId } ที่ต้องรอ Community
  for (const cat of tpl.categories ?? []) {
    const catName = sub(cat.name, orgName);
    const category = await findOrCreateChannel(guild, { name: catName, type: 'category' }, log);
    if (!category) continue;
    chMap.set(catName, category);
    for (const ch of cat.channels ?? []) {
      if (ch.optional && !includeOptional) continue;
      const chName = sub(ch.name, orgName);
      if (COMMUNITY_ONLY.has(ch.type) && !guild.features.includes(GuildFeature.Community)) {
        pending.push({ ch, chName, parentId: category.id });
        continue;
      }
      const created = await findOrCreateChannel(guild, { name: chName, type: ch.type, parentId: category.id }, log);
      if (created) chMap.set(chName, created);
    }
  }

  // ---- 3. เปิด Community ----
  await onProgress('เปิด Community…');
  await ensureCommunity(guild, tpl.community, chMap, log);

  // ---- 3b. System Messages Channel (welcome) → follow-me ----
  const sysCh = tpl.community?.system_channel ? chMap.get(tpl.community.system_channel) : null;
  if (sysCh && guild.systemChannelId !== sysCh.id) {
    try {
      await guild.edit({ systemChannel: sysCh.id, reason: 'server setup — system messages channel' });
      log.notes.push(`ตั้ง system messages channel → #${sysCh.name}`);
    } catch (e) { log.errors.push(`system channel: ${e.message}`); }
  }

  // ---- 4b. สร้าง channel ที่รอ Community ----
  if (pending.length) {
    await onProgress('สร้าง forum/announcement/stage…');
    for (const p of pending) {
      const created = await findOrCreateChannel(guild, { name: p.chName, type: p.ch.type, parentId: p.parentId }, log);
      if (created) chMap.set(p.chName, created);
    }
  }

  // ---- 5. Permission overwrites (category ก่อน channel) ----
  await onProgress('ตั้ง permission…');
  for (const cat of tpl.categories ?? []) {
    const category = chMap.get(sub(cat.name, orgName));
    if (category) await applyOverwrites(guild, category, cat.permission_overwrites, roleMap, orgName, log);
    for (const ch of cat.channels ?? []) {
      if (ch.optional && !includeOptional) continue;
      const channel = chMap.get(sub(ch.name, orgName));
      if (!channel) continue;
      if (ch.permission_overwrites === 'inherit') {
        // sync กับ category (ห้อง inherit ต้อง lock ตาม parent — ไม่งั้นค้าง perm เปิดตอนสร้าง)
        if (category) {
          try {
            await channel.lockPermissions();
            log.notes.push(`sync #${channel.name} → ${category.name}`);
            await sleep(200);
          } catch (e) { log.errors.push(`sync "${channel.name}": ${e.message}`); }
        }
      } else {
        await applyOverwrites(guild, channel, ch.permission_overwrites, roleMap, orgName, log);
      }
    }
  }

  // ---- 6. Panels (register x?, interest) ----
  await onProgress('วาง panel…');
  for (const cat of tpl.categories ?? []) {
    for (const ch of cat.channels ?? []) {
      if (!ch.panel || (ch.optional && !includeOptional)) continue;
      const channel = chMap.get(sub(ch.name, orgName));
      if (!channel) continue;
      const p = ch.panel;
      // แปลง token {{ch:ชื่อห้อง}} → mention
      const desc = (p.description ?? '').replace(/\{\{ch:([^}]+)\}\}/g, (_, n) => {
        const c = chMap.get(sub(n, orgName));
        return c ? `<#${c.id}>` : `#${n}`;
      });
      if (p.type === 'register') {
        const regPanel = {
          customId: 'btn_open_register_modal',
          buttonLabel: '📋 แนะนำตัว',
          title: sub(p.title, orgName),
          description: sub(desc, orgName),
        };
        if (tpl.config?.sticky_register === true) await postStickyPanel(guild, channel, regPanel, log);
        else await postPanel(channel, regPanel, log);
      } else if (p.type === 'interest') {
        await postPanel(channel, {
          customId: 'btn_open_interest',
          buttonLabel: '🎯 เลือกความสนใจ / ความถนัด',
          title: sub(p.title, orgName) ?? `🎯 ความสนใจ & ความถนัด · ${orgName}`,
          description: sub(desc, orgName) || 'กดปุ่มด้านล่างเพื่อเลือกความสนใจและความถนัดของคุณ\nสามารถเพิ่มหรือถอดได้ตลอดเวลา',
          color: 0xf1c40f,
        }, log);
      }
    }
  }

  // ---- 8. sync role catalog + policy → dc_guild_roles / dc_guild_role_groups ----
  await onProgress('บันทึก role policy…');
  try {
    // groups
    await pool.query(GROUP_UPSERT, [guild.id, 'interest', pickers.interest?.group_label ?? 'ความสนใจ', 'plain', 1]);
    await pool.query(GROUP_UPSERT, [guild.id, 'skill', pickers.skill?.group_label ?? 'ความถนัด', 'plain', 2]);
    // staff policy
    for (const def of tpl.roles.staff ?? []) {
      const id = roleMap.get(sub(def.default_name, orgName));
      if (id) await pool.query(POLICY_UPSERT, [guild.id, id, sub(def.default_name, orgName), def.rbac_permission ?? null, null, null, null, null, null, null]);
    }
    // org_role policy (ไม่มี permission)
    const orgId = roleMap.get(orgName);
    if (orgId) await pool.query(POLICY_UPSERT, [guild.id, orgId, orgName, null, null, null, null, null, null, null]);
    // picker policy
    for (const grp of ['interest', 'skill']) {
      const opts = pickers[grp]?.options ?? [];
      for (let i = 0; i < opts.length; i++) {
        const o = opts[i];
        const label = sub(o.label, orgName);
        const id = roleMap.get(label);
        if (!id) continue;
        const parentId = o.parent ? roleMap.get(sub(o.parent, orgName)) ?? null : null;
        await pool.query(POLICY_UPSERT, [guild.id, id, label, null, null, grp, label, o.emoji ?? null, i, parentId]);
      }
    }
  } catch (e) {
    log.errors.push(`role policy: ${e.message}`);
  }

  // ---- 9. seed dc_guild_config ----
  await onProgress('seed config…');
  try {
    const introCh = chMap.get(sub('👋┆แนะนำตัว', orgName));
    const orgRoleId = roleMap.get(orgName);
    const reg = tpl.config?.register ?? {};
    // resolve register.log_channel ("self"/"👋┆แนะนำตัว"/moderator-only)
    let logChId = null;
    const lc = reg.log_channel;
    if (lc && lc !== 'self') logChId = chMap.get(sub(lc, orgName))?.id ?? null;
    if (!logChId) logChId = introCh?.id ?? null;
    await setSetting(guild.id, 'config_register', {
      log_channel_id: logChId,
      member_role_id: orgRoleId ?? null,
      interest_select: reg.interest_select !== false,
      province_select: reg.province_select === true,
    });
    if (tpl.features?.enabled_default) await setSetting(guild.id, 'enabled_features', tpl.features.enabled_default);
    if (tpl.config?.welcome_dm) await setSetting(guild.id, 'welcome_dm', sub(tpl.config.welcome_dm, orgName));
    if (tpl.config?.quote_default_template) await setSetting(guild.id, 'quote_default_template', tpl.config.quote_default_template);
    // ไม่ตั้ง autorole_id — ยศได้หลังแนะนำตัว
  } catch (e) {
    log.errors.push(`seed config: ${e.message}`);
  }

  return log;
}

/** นับ role/channel ในเทมเพลตสำหรับ confirm embed (ไม่เช็คของเดิม) */
function buildPlan(templateId, includeOptional = false) {
  const tpl = loadTemplate(templateId);
  let roleCount = (tpl.roles.staff?.length ?? 0) + (tpl.roles.org_role ? 1 : 0);
  const parents = new Set();
  for (const g of ['interest', 'skill']) {
    const opts = tpl.roles.pickers?.[g]?.options ?? [];
    roleCount += opts.length;
    for (const o of opts) if (o.parent) parents.add(o.parent);
  }
  roleCount += parents.size;
  let chCount = 0;
  for (const cat of tpl.categories ?? []) {
    chCount += 1; // category
    for (const ch of cat.channels ?? []) if (!(ch.optional && !includeOptional)) chCount += 1;
  }
  return { name: tpl.name, roleCount, chCount, community: !!tpl.community?.enable };
}

module.exports = { run, buildPlan, loadTemplate };
