// handlers/handraiseHandler.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const MAX_QUEUE = 50;
const queues       = new Map(); // `${guildId}:${vcId}` → Set<userId>
const queueMessages = new Map(); // same key → Message

function _key(guildId, vcId) {
  return `${guildId}:${vcId}`;
}

function _buildEmbed(vcName, queue) {
  const lines = [];
  let i = 1;
  for (const userId of queue) {
    lines.push(`${i}. <@${userId}>`);
    i++;
  }
  return new EmbedBuilder()
    .setTitle(`✋ คิวขอพูด — ${vcName}`)
    .setDescription(queue.size === 0 ? '*ยังไม่มีคนในคิว*' : lines.join('\n'))
    .setColor(0xff6a13)
    .setFooter({ text: `${queue.size} คนในคิว` });
}

function _buildComponents(vcId, queue) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`handraise_raise:${vcId}`)
      .setLabel('✋ ยกมือขอพูด')
      .setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`handraise_call:${vcId}`)
      .setLabel('🎤 เรียกคนต่อไป')
      .setStyle(ButtonStyle.Success)
      .setDisabled(queue.size === 0),
    new ButtonBuilder()
      .setCustomId(`handraise_clear:${vcId}`)
      .setLabel('🗑️ ปิดคิว')
      .setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

async function _updateEmbed(key, vcId, vcName, queue) {
  const msg = queueMessages.get(key);
  if (!msg) return;
  await msg.edit({
    embeds: [_buildEmbed(vcName, queue)],
    components: _buildComponents(vcId, queue),
  }).catch(e => console.error('[handraise] edit:', e.message));
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
  if (queueMessages.has(key)) {
    return interaction.reply({
      content: '❌ มีคิวยกมืออยู่แล้วในห้องนี้ครับ',
      flags: MessageFlags.Ephemeral,
    });
  }

  const queue = new Set();
  queues.set(key, queue);

  const msg = await interaction.channel.send({
    embeds: [_buildEmbed(userVc.name, queue)],
    components: _buildComponents(userVc.id, queue),
  });
  queueMessages.set(key, msg);

  return interaction.reply({
    content: `✅ เปิดคิวขอพูดสำหรับ **${userVc.name}** แล้วครับ`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleHandraiseButton(interaction) {
  const colonIdx = interaction.customId.indexOf(':');
  const action   = interaction.customId.slice(0, colonIdx);
  const vcId     = interaction.customId.slice(colonIdx + 1);

  const key   = _key(interaction.guildId, vcId);
  const queue = queues.get(key);

  if (!queue || !queueMessages.has(key)) {
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
      await _updateEmbed(key, vcId, vcName, queue);
      return interaction.reply({ content: '✅ ลดมือแล้วครับ', flags: MessageFlags.Ephemeral });
    }

    if (queue.size >= MAX_QUEUE) {
      return interaction.reply({ content: '❌ คิวเต็มแล้วครับ', flags: MessageFlags.Ephemeral });
    }

    queue.add(interaction.user.id);
    const position = [...queue].indexOf(interaction.user.id) + 1;
    await _updateEmbed(key, vcId, vcName, queue);
    return interaction.reply({
      content: `✋ ยกมือแล้วครับ — ลำดับที่ **${position}** (กดอีกครั้งเพื่อลดมือ)`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 🎤 เรียกคนต่อไป
  if (action === 'handraise_call') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
      return interaction.reply({ content: '❌ คุณไม่มีสิทธิ์เรียกคิวครับ', flags: MessageFlags.Ephemeral });
    }
    if (queue.size === 0) {
      return interaction.reply({ content: '❌ ไม่มีคนในคิวครับ', flags: MessageFlags.Ephemeral });
    }

    const nextUserId = queue.values().next().value;
    queue.delete(nextUserId);
    await _updateEmbed(key, vcId, vcName, queue);
    return interaction.reply({ content: `🎤 <@${nextUserId}> — ถึงคิวคุณแล้ว!` });
  }

  // 🗑️ ปิดคิว
  if (action === 'handraise_clear') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
      return interaction.reply({ content: '❌ คุณไม่มีสิทธิ์ปิดคิวครับ', flags: MessageFlags.Ephemeral });
    }

    queue.clear();
    queues.delete(key);
    const msg = queueMessages.get(key);
    queueMessages.delete(key);

    await msg?.edit({
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
  await _updateEmbed(key, oldState.channelId, vc?.name ?? 'Voice Channel', queue);
}

module.exports = { handleHandraiseStart, handleHandraiseButton, handleHandraiseVoiceUpdate };
