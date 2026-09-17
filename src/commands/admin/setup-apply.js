const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'setup-apply',
  description: 'اعداد نظام التقديمات',
  aliases: ['اعداد-التقديمات'],
  data: new SlashCommandBuilder()
    .setName('setup-apply')
    .setDescription('إعداد نظام التقديمات')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    return interaction.reply({ content: '💡 يرجى استخدام أمر /applications لإدارة كاملة لنظام التقديمات.', flags: 64 });
  }
};
