const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'add-user',
  description: 'Add a user to the current ticket channel',
  aliases: ['اضافة-عضو'],
  data: new SlashCommandBuilder()
    .setName('add-user')
    .setDescription('إضافة عضو للتذكرة')
    .addUserOption(opt => opt.setName('user').setDescription('العضو').setRequired(true)),

  async execute(interaction) {
    const ticket = db.getTicket ? db.getTicket(interaction.channel.id) : null;
    if (!ticket) return interaction.reply({ content: '❌ هذا الأمر يعمل فقط داخل التذاكر.', flags: 64 });
    const user = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.create(user.id, { ViewChannel: true, SendMessages: true });
    return interaction.reply({ content: '✅ تمت إضافة <@' + user.id + '> للتذكرة.' });
  }
};
