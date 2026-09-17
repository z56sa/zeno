const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  name: 'send',
  description: 'ارسال رسالة لروم محدد عن طريق البوت',
  aliases: ['ارسل'],
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('ارسال رسالة لروم محدد')
    .addChannelOption(opt => opt.setName('channel').setDescription('الروم').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(opt => opt.setName('message').setDescription('الرسالة').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة الرسائل.', flags: 64 });
    }
    const ch = interaction.options.getChannel('channel');
    const msg = interaction.options.getString('message');
    await ch.send({ content: msg });
    return interaction.reply({ content: '✅ تم إرسال الرسالة بنجاح!', flags: 64 });
  }
};
