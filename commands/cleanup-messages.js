const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('cleanup-messages')
		.setDescription('กวาดล้างข้อความในช่องนี้ (เฉพาะ Moderator)')
		.addIntegerOption(option => 
			option.setName('amount')
				.setDescription('จำนวนข้อความที่ต้องการลบ (1-100)')
				.setRequired(false))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

	async execute(interaction) {
		const amount = interaction.options.getInteger('amount') ?? 100;

		try {
			const deleted = await interaction.channel.bulkDelete(amount, true);

			const embed = new EmbedBuilder()
				.setColor('#ff4444')
				.setTitle('🧹 Cleanup Success')
				.setDescription(`กวาดล้างไปทั้งหมด **${deleted.size}** ข้อความ`)
				.setFooter({ text: `โดย: ${interaction.user.tag}` });

			return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
		} catch (error) {
			return interaction.reply({ 
				content: 'ลบไม่ได้ครับ! อาจเพราะข้อความเก่าเกิน 14 วัน หรือบอทไม่มีสิทธิ์', 
				flags: MessageFlags.Ephemeral 
			});
		}
	},
};