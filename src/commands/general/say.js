const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'say',
  description: 'ارسال رسالة عن طريق البوت',
  aliases: ['قول'],
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('ارسال رسالة عن طريق البوت')
    .addStringOption(opt => opt.setName('message').setDescription('الرسالة').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة الرسائل.', flags: 64 });
    }
    const msg = interaction.options.getString('message');
    await interaction.reply({ content: '✅ تم الإرسال', flags: 64 });
    return interaction.channel.send({ content: msg });
  }
};
