const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'setup-rating',
  description: 'تفعيل نظام التقييم في التذاكر',
  aliases: ['تقييم-تذاكر'],
  data: new SlashCommandBuilder()
    .setName('setup-rating')
    .setDescription('تفعيل نظام التقييم في التذاكر')
    .addBooleanOption(opt => opt.setName('enabled').setDescription('تفعيل أو تعطيل').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }
    const enabled = interaction.options.getBoolean('enabled');
    db.updateGuildSetting(interaction.guild.id, 'ticket_rating_enabled', enabled ? 1 : 0);
    return interaction.reply({ content: enabled ? '✅ تم تفعيل تقييم التذاكر.' : '❌ تم تعطيل تقييم التذاكر.' });
  }
};
