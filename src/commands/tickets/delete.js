const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'delete',
  description: 'حذف التذكرة بشكل نهائي',
  aliases: ['حذف-تذكرة'],
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('حذف التذكرة فوراً'),

  async execute(interaction) {
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: '❌ هذا الأمر يعمل فقط داخل التذاكر.', flags: 64 });
    await interaction.reply({ content: '🗑️ جاري حذف التذكرة...' });
    setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 2000);
  }
};
