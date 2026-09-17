const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'autoreply-add',
  description: 'لاضافة رد تلقائي',
  aliases: ['اضف-رد'],
  data: new SlashCommandBuilder()
    .setName('autoreply-add')
    .setDescription('لاضافة رد تلقائي')
    .addStringOption(opt => opt.setName('word').setDescription('الكلمة المحفزة').setRequired(true))
    .addStringOption(opt => opt.setName('reply').setDescription('رد البوت').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const word = interaction.options.getString('word');
    const reply = interaction.options.getString('reply');
    db.addAutoResponder(interaction.guild.id, word, reply);
    return interaction.reply({ content: '✅ تم إضافة الرد التلقائي بنجاح على كلمة: ' + word });
  }
};
