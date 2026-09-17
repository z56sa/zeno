const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'send-broadcast-panel',
  description: 'ارسال لوحة الاعلانات',
  aliases: ['لوحة-الاعلانات'],
  data: new SlashCommandBuilder()
    .setName('send-broadcast-panel')
    .setDescription('إرسال لوحة الإعلانات')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    return interaction.reply({ content: '💡 يرجى استخدام أمر /broadcast لإدارة وإرسال الإعلانات.', flags: 64 });
  }
};
