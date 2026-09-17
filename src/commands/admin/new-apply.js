const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'new-apply',
  description: 'انشاء تقديم جديد',
  aliases: ['تقديم-جديد'],
  data: new SlashCommandBuilder()
    .setName('new-apply')
    .setDescription('إنشاء تقديم جديد')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    return interaction.reply({ content: '💡 يرجى استخدام أمر /applications create لإنشاء نموذج تقديم كامل.', flags: 64 });
  }
};
