const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'remove-user',
  description: 'إزالة عضو من التذكرة الحالية',
  aliases: ['ازالة-عضو'],
  data: new SlashCommandBuilder()
    .setName('remove-user')
    .setDescription('إزالة عضو من التذكرة')
    .addUserOption(opt => opt.setName('user').setDescription('العضو').setRequired(true)),

  async execute(interaction) {
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: '❌ هذا الأمر يعمل فقط داخل التذاكر.', flags: 64 });
    const user = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.delete(user.id);
    return interaction.reply({ content: '✅ تمت إزالة <@' + user.id + '> من التذكرة.' });
  }
};
