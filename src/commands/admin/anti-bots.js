const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'anti-bots',
  description: 'تسطيب نظام الحماية من البوتات',
  aliases: ['انتي-بوت'],
  data: new SlashCommandBuilder()
    .setName('anti-bots')
    .setDescription('تسطيب نظام الحماية من البوتات')
    .addBooleanOption(opt => opt.setName('enabled').setDescription('تفعيل أو تعطيل').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }
    const enabled = interaction.options.getBoolean('enabled');
    db.updateGuildSetting(interaction.guild.id, 'anti_bot', enabled ? 1 : 0);
    return interaction.reply({ content: enabled ? '✅ تم تفعيل حماية البوتات.' : '❌ تم تعطيل حماية البوتات.' });
  }
};
