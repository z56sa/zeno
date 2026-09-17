const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-suggestions-room',
  description: 'تحديد روم يتم فيه تحويل الرسائل لاقتراحات',
  aliases: ['تحديد-روم-الاقتراحات'],
  data: new SlashCommandBuilder()
    .setName('set-suggestions-room')
    .setDescription('تحديد روم الاقتراحات')
    .addChannelOption(opt => opt.setName('channel').setDescription('الروم').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const channel = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'suggestions_channel', channel.id);
    db.updateGuildSetting(interaction.guild.id, 'suggestions_enabled', 1);
    return interaction.reply({ content: '✅ تم تعيين روم الاقتراحات بنجاح!' });
  }
};
