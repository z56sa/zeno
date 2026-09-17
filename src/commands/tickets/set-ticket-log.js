const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-ticket-log',
  description: 'تحديد روم سجلات التذاكر',
  aliases: ['لوق-تذاكر'],
  data: new SlashCommandBuilder()
    .setName('set-ticket-log')
    .setDescription('تحديد روم سجلات التذاكر')
    .addChannelOption(opt => opt.setName('channel').setDescription('الروم').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }
    const ch = interaction.options.getChannel('channel');
    db.updateGuildSetting(interaction.guild.id, 'ticket_log_channel', ch.id);
    return interaction.reply({ content: '✅ تم تعيين روم سجلات التذاكر بنجاح!' });
  }
};
