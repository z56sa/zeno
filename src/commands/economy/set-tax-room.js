const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-tax-room',
  description: 'تحديد روم يحسب فيه الضريبة تلقائيا',
  aliases: ['تحديد-روم-الضريبة'],
  data: new SlashCommandBuilder()
    .setName('set-tax-room')
    .setDescription('تحديد روم حساب الضريبة')
    .addChannelOption(opt => opt.setName('channel').setDescription('الروم').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إدارة السيرفر.', flags: 64 });
    }
    const channel = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'tax_channel', channel.id);
    return interaction.reply({ content: '✅ تم تعيين روم الضريبة بنجاح!' });
  }
};
