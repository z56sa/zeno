const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'add-ticket-button',
  description: 'تثبيت التذكرة',
  aliases: ['زر-تذكرة'],
  data: new SlashCommandBuilder()
    .setName('add-ticket-button')
    .setDescription('إرسال زر التذكرة')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_open').setLabel('📩 فتح تذكرة').setStyle(ButtonStyle.Primary)
    );
    await interaction.channel.send({ content: '🎫 اضغط لفتح تذكرة:', components: [row] });
    return interaction.reply({ content: '✅ تم إرسال زر التذكرة!', flags: 64 });
  }
};
