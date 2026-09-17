const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'autoreply-remove',
  description: 'لازالة رد تلقائي',
  aliases: ['حذف-رد'],
  data: new SlashCommandBuilder()
    .setName('autoreply-remove')
    .setDescription('لازالة رد تلقائي')
    .addIntegerOption(opt => opt.setName('id').setDescription('رقم الرد').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const id = interaction.options.getInteger('id');
    db.deleteAutoResponder(id, interaction.guild.id);
    return interaction.reply({ content: '✅ تم حذف الرد التلقائي رقم #' + id + ' بنجاح.' });
  }
};
