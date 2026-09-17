const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-protect-logs',
  description: 'تعيين روم لسجلات الحماية والنوك',
  aliases: ['روم-سجلات-الحماية'],
  data: new SlashCommandBuilder()
    .setName('set-protect-logs')
    .setDescription('تعيين روم لسجلات الحماية والنوك')
    .addChannelOption(opt => opt.setName('channel').setDescription('روم السجلات').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }
    const ch = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'antinuke_log_channel', ch.id);
    return interaction.reply({ content: '✅ تم تعيين روم سجلات الحماية بنجاح!' });
  }
};
