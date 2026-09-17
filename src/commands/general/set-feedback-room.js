const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-feedback-room',
  description: 'تحديد روم يتم فيه تحويل الرسائل لأراء',
  aliases: ['تحديد-روم-الاراء'],
  data: new SlashCommandBuilder()
    .setName('set-feedback-room')
    .setDescription('تحديد روم الآراء')
    .addChannelOption(opt => opt.setName('channel').setDescription('الروم').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const channel = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'feedback_channel', channel.id);
    return interaction.reply({ content: '✅ تم تعيين روم الآراء بنجاح!' });
  }
};
