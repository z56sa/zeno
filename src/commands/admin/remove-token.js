const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'remove-token',
  description: 'ازالة توكن محدد',
  aliases: ['حذف-توكن'],
  data: new SlashCommandBuilder()
    .setName('remove-token')
    .setDescription('ازالة توكن أو برودكاست')
    .addIntegerOption(opt => opt.setName('id').setDescription('رقم الإعلان').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }
    const id = interaction.options.getInteger('id');
    if (db.deleteBroadcast) db.deleteBroadcast(interaction.guild.id, id);
    return interaction.reply({ content: '✅ تم حذف الإعلان رقم ' + id + ' بنجاح.' });
  }
};
