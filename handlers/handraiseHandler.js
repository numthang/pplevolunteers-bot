// handlers/handraiseHandler.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { getSetting, setSetting, deleteSetting } = require('../db/settings');

const MAX_QUEUE = 50;

// key = `${guildId}:${vcId}`
const queues   = new Map(); // key → Set<userId>
const queueMeta = new Map(); // key → { message, channel, guildId }

function _key(guildId, vcId) { return `${guildId}:${vcId}`; }
function _stickyKey(channelId) { return `sticky_${channelId}`; }

function _buildEmbed(vcName, queue) {
  const lines = [];
  let i = 1;
  for (const userId of queue) { lines.push(`${i++}. <@${userId}>`); }
  return new EmbedBuilder()
    .setTitle(`✋ คิวขอพูด — ${vcName}`)
    .setDescription(queue.size === 0 ? '*ยังไม่มีคนในคิว*' : lines.join('\n'))
    .setColor(0xff6a13)
    .setFooter({ text: `${queue.size} คนในคิว` });
}

function _buildComponents(vcId, queue) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`handraise_raise:${vcId}`)
      .setLabel('✋ ยกมือ')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`handraise_call:${vcId}`)
      .setLabel('🎤 เรียกคิว')
      .setStyle(ButtonStyle.Success)
      .setDisabled(queue.size === 0),
    new ButtonBuilder()
      .setCustomId(`handraise_clear:${vcId}`)
      .setLabel('🗑️ ปิดคิว')
      .setStyle(ButtonStyle.Danger),
  )];
}

// อัพเดต embed + sync DB sticky
// msg = message ที่จะ edit (interaction.message หรือ meta.message)
async function _updateEmbed(key, vcId, vcName, queue, msg) {
  const meta = queueMeta.get(key);
  if (!meta) return;

  const embed = _buildEmbed(vcName, queue);
  const components = _buildComponents(vcId, queue);
  const payload = { embeds: [embed], components };

  // ถ้า msg ที่ส่งมาต่างจาก meta → อัพเดต ref ด้วย (กรณี sticky repost สร้าง msg ใหม่)
  const target = msg || meta.message;

  try {
    await target.edit(payload);
    meta.message = target;
  } catch (e) {
    if (e.code === 10008) {
      // Unknown Message — sticky handler repost แล้ว ดึง message ใหม่จาก DB
      const config = await getSetting(meta.guildId, _stickyKey(meta.channel.id)).catch(() => null);
      if (config?.message_id) {
        const newMsg = await meta.channel.messages.fetch(config.message_id).catch(() => null);
        if (newMsg) {
          await newMsg.edit(payload).catch(e2 => console.error('[handraise] retry edit:', e2.message));
          meta.message = newMsg;
        }
      }
    } else {
      console.error('[handraise] edit:', e.message);
      return;
    }
  }

  // Sync embed state → DB (sticky handler จะใช้ JSON นี้ตอน repost)
  await setSetting(meta.guildId, _stickyKey(meta.channel.id), {
    embeds:     [embed.toJSON()],
    components: components.map(r => r.toJSON()),
    message_id: meta.message.id,
    content:    null,
  }).catch(e => console.error('[handraise] setSetting:', e.message));
}

async function handleHandraiseStart(interaction) {
  const userVc = interaction.member.voice.channel;
  if (!userVc) {
    return interaction.reply({
      content: '❌ คุณต้องอยู่ใน Voice Channel ก่อนนะครับ',
      flags: MessageFlags.Ephemeral,
    });
  }

  const key = _key(interaction.guildId, userVc.id);
  if (queueMeta.has(key)) {
    return interaction.reply({
      content: '❌ มีคิวยกมืออยู่แล้วในห้องนี้ครับ',
      flags: MessageFlags.Ephemeral,
    });
  }

  const queue = new Set();
  queues.set(key, queue);

  const embed = _buildEmbed(userVc.name, queue);
  const components = _buildComponents(userVc.id, queue);

  const msg = await interaction.channel.send({ embeds: [embed], components });

  queueMeta.set(key, {
    message:  msg,
    channel:  interaction.channel,
    guildId:  interaction.guildId,
  });

  // บันทึก sticky ให้ embed นี้ลอยขึ้นมาล่างสุดเสมอเมื่อมีข้อความใหม่
  await setSetting(interaction.guildId, _stickyKey(interaction.channelId), {
    embeds:     [embed.toJSON()],
    components: components.map(r => r.toJSON()),
    message_id: msg.id,
    content:    null,
  }).catch(e => console.error('[handraise] init sticky:', e.message));

  return interaction.reply({
    content: `✅ เปิดคิวขอพูดสำหรับ **${userVc.name}** แล้วครับ (sticky ✅)`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleHandraiseButton(interaction) {
  const colonIdx = interaction.customId.indexOf(':');
  const action   = interaction.customId.slice(0, colonIdx);
  const vcId     = interaction.customId.slice(colonIdx + 1);

  const key   = _key(interaction.guildId, vcId);
  const queue = queues.get(key);

  if (!queue || !queueMeta.has(key)) {
    return interaction.reply({
      content: '❌ เซสชันนี้หมดอายุแล้วครับ กรุณาเปิดคิวใหม่ด้วย `/panel handraise`',
      flags: MessageFlags.Ephemeral,
    });
  }

  const vc     = interaction.guild.channels.cache.get(vcId);
  const vcName = vc?.name ?? 'Voice Channel';

  // ✋ ยกมือ / ลดมือ (toggle)
  if (action === 'handraise_raise') {
    const userVc = interaction.member.voice.channel;
    if (!userVc || userVc.id !== vcId) {
      return interaction.reply({
        content: '❌ คุณต้องอยู่ใน Voice Channel นี้ก่อนนะครับ',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (queue.has(interaction.user.id)) {
      queue.delete(interaction.user.id);
      await _updateEmbed(key, vcId, vcName, queue, interaction.message);
      return interaction.reply({ content: '✅ ลดมือแล้วครับ', flags: MessageFlags.Ephemeral });
    }

    if (queue.size >= MAX_QUEUE) {
      return interaction.reply({ content: '❌ คิวเต็มแล้วครับ', flags: MessageFlags.Ephemeral });
    }

    queue.add(interaction.user.id);
    const position = [...queue].indexOf(interaction.user.id) + 1;
    await _updateEmbed(key, vcId, vcName, queue, interaction.message);
    return interaction.reply({
      content: `✋ ยกมือแล้วครับ — ลำดับที่ **${position}** (กดอีกครั้งเพื่อลดมือ)`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 🎤 เรียกคิว
  if (action === 'handraise_call') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
      return interaction.reply({ content: '❌ คุณไม่มีสิทธิ์เรียกคิวครับ', flags: MessageFlags.Ephemeral });
    }
    if (queue.size === 0) {
      return interaction.reply({ content: '❌ ไม่มีคนในคิวครับ', flags: MessageFlags.Ephemeral });
    }

    const nextUserId = queue.values().next().value;
    queue.delete(nextUserId);
    await _updateEmbed(key, vcId, vcName, queue, interaction.message);
    return interaction.reply({ content: `🎤 <@${nextUserId}> — ถึงคิวคุณแล้ว!` });
  }

  // 🗑️ ปิดคิว
  if (action === 'handraise_clear') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
      return interaction.reply({ content: '❌ คุณไม่มีสิทธิ์ปิดคิวครับ', flags: MessageFlags.Ephemeral });
    }

    queue.clear();
    queues.delete(key);
    const meta = queueMeta.get(key);
    queueMeta.delete(key);

    // ลบ sticky setting ก่อน (ป้องกัน handler repost หลังจากปิด)
    await deleteSetting(meta.guildId, _stickyKey(meta.channel.id))
      .catch(e => console.error('[handraise] deleteSetting:', e.message));

    await interaction.message.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle(`✋ คิวขอพูด — ${vcName}`)
          .setDescription('*เซสชันปิดแล้ว*')
          .setColor(0x808080),
      ],
      components: [],
    }).catch(() => {});

    return interaction.reply({ content: '✅ ปิดคิวแล้วครับ', flags: MessageFlags.Ephemeral });
  }
}

// เรียกเมื่อ user ออกจาก VC → auto-remove จากคิว
async function handleHandraiseVoiceUpdate(oldState, newState) {
  if (!oldState.channelId) return;
  const member = oldState.member;
  if (!member || member.user.bot) return;

  const key = _key(member.guild.id, oldState.channelId);
  const queue = queues.get(key);
  if (!queue || !queue.has(member.id)) return;

  queue.delete(member.id);
  const vc = member.guild.channels.cache.get(oldState.channelId);
  await _updateEmbed(key, oldState.channelId, vc?.name ?? 'Voice Channel', queue, null);
}

module.exports = { handleHandraiseStart, handleHandraiseButton, handleHandraiseVoiceUpdate };
