const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'close-apply',
  description: 'اغلاق التقديم',
  aliases: ['اغلاق-التقديم'],
  data: new SlashCommandBuilder()
    .setName('close-apply')
    .setDescription('إغلاق نموذج تقديم')
    .addIntegerOption(opt => opt.setName('id').setDescription('رقم التقديم').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const id = interaction.options.getInteger('id');
    if (db.closeApplication) db.closeApplication(id, interaction.guild.id);
    return interaction.reply({ content: '✅ تم إغلاق التقديم رقم ' + id + ' بنجاح.' });
  }
};
