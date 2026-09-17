const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'remove-all-tokens',
  description: 'ازالة جميع التوكنات',
  aliases: ['حذف-كل-التوكنات'],
  data: new SlashCommandBuilder()
    .setName('remove-all-tokens')
    .setDescription('ازالة جميع التوكنات والإعلانات')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }
    if (db.deleteAllBroadcasts) db.deleteAllBroadcasts(interaction.guild.id);
    return interaction.reply({ content: '✅ تم مسح جميع الإعلانات بنجاح.' });
  }
};
