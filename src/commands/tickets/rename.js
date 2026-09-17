const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'rename',
  description: 'اعادة تسمية التذكرة الحالية',
  aliases: ['تسمية-تذكرة'],
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('إعادة تسمية التذكرة')
    .addStringOption(opt => opt.setName('name').setDescription('الاسم الجديد').setRequired(true)),

  async execute(interaction) {
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: '❌ هذا الأمر يعمل فقط داخل التذاكر.', flags: 64 });
    const name = interaction.options.getString('name');
    await interaction.channel.setName(name);
    return interaction.reply({ content: '✅ تم تغيير اسم التذكرة إلى: ' + name });
  }
};
