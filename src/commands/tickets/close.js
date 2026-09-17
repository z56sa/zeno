const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'close',
  description: 'اغلاق التذكرة',
  aliases: ['اغلاق'],
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('اغلاق التذكرة الحالية'),

  async execute(interaction) {
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: '❌ هذا الأمر يعمل فقط داخل التذاكر.', flags: 64 });
    if (db.closeTicket) db.closeTicket(interaction.channel.id, interaction.user.id, 'تم الإغلاق');
    await interaction.reply({ content: '🔒 تم إغلاق التذكرة. سيتم حذف الروم قريباً...' });
    setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 4000);
  }
};
