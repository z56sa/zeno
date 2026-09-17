const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'setup-ticket',
  description: 'تسطيب التذاكر',
  aliases: ['تسطيب-تذاكر'],
  data: new SlashCommandBuilder()
    .setName('setup-ticket')
    .setDescription('تسطيب نظام التذاكر')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    return interaction.reply({ content: '💡 يرجى استخدام أمر /ticket-setup مع الخيارات المتاحة.', flags: 64 });
  }
};
