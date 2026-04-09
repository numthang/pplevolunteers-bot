const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')
const { getAccountsSummary, getFinanceConfig } = require('../db/finance')

function buildAccountEmbed(account, isLast) {
  const fmt = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2 })
  const income  = Number(account.total_income)
  const expense = Number(account.total_expense)
  const balance = income - expense

  return new EmbedBuilder()
    .setTitle(`💳 ${account.name}${account.bank ? ` · ${account.bank}` : ''}`)
    .setColor(balance >= 0 ? 0x22c55e : 0xef4444)
    .addFields(
      { name: '📥 รายรับ',  value: `\`+${fmt(income)} ฿\``,  inline: true },
      { name: '📤 รายจ่าย', value: `\`-${fmt(expense)} ฿\``, inline: true },
      { name: '💼 คงเหลือ', value: `\`${balance >= 0 ? '+' : ''}${fmt(balance)} ฿\``, inline: true },
    )
    .setFooter({ text: account.account_no || '\u200b' })
    .setTimestamp()
}

const refreshRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('fin_refresh_dashboard')
    .setLabel('🔄 Refresh')
    .setStyle(ButtonStyle.Secondary)
)

async function sendDashboard(thread, guildId, accountIds) {
  const accounts = await getAccountsSummary(guildId, accountIds)
  const msgIds = {}

  for (let i = 0; i < accounts.length; i++) {
    const isLast = i === accounts.length - 1
    const msg = await thread.send({
      embeds: [buildAccountEmbed(accounts[i])],
      components: isLast ? [refreshRow] : [],
    })
    msgIds[accounts[i].id] = msg.id
  }

  return msgIds  // { accountId: messageId, ... }
}

async function refreshDashboard(thread, guildId, accountIds, msgIdsJson) {
  const accounts  = await getAccountsSummary(guildId, accountIds)
  const msgIds    = JSON.parse(msgIdsJson || '{}')
  const lastIdx   = accounts.length - 1

  for (let i = 0; i < accounts.length; i++) {
    const acc   = accounts[i]
    const msgId = msgIds[acc.id]
    if (!msgId) continue
    const msg = await thread.messages.fetch(msgId).catch(() => null)
    if (!msg) continue
    await msg.edit({
      embeds: [buildAccountEmbed(acc)],
      components: i === lastIdx ? [refreshRow] : [],
    })
  }
}

async function handleFinanceRefresh(interaction) {
  await interaction.deferUpdate()
  const config = await getFinanceConfig(interaction.guildId)
  if (!config?.thread_id) return

  const thread = await interaction.guild.channels.fetch(config.thread_id).catch(() => null)
  if (!thread) return

  const accountIds = config.account_ids ? config.account_ids.split(',').map(Number) : []
  await refreshDashboard(thread, interaction.guildId, accountIds, config.dashboard_msg_id)
}

module.exports = { sendDashboard, refreshDashboard, handleFinanceRefresh }
