const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'to-select',
  description: 'تحويل لقائمة منسدلة',
  aliases: ['قائمة-تذاكر'],
  data: new SlashCommandBuilder()
    .setName('to-select')
    .setDescription('إعداد قائمة اختيار التذاكر')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    return interaction.reply({ content: '💡 استخدم أمر /ticket-setup dropdown لإعداد قائمة منسدلة كاملة.', flags: 64 });
  }
};
