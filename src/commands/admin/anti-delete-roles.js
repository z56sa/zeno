const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'anti-delete-roles',
  description: 'تسطيب نظام الحماية من حذف الرتب',
  aliases: ['انتي-حذف-رتب'],
  data: new SlashCommandBuilder()
    .setName('anti-delete-roles')
    .setDescription('تسطيب نظام الحماية من حذف الرتب')
    .addBooleanOption(opt => opt.setName('enabled').setDescription('تفعيل أو تعطيل').setRequired(true))
    .addIntegerOption(opt => opt.setName('limit').setDescription('الحد الأقصى في الدقيقة').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }
    const enabled = interaction.options.getBoolean('enabled');
    const limit = interaction.options.getInteger('limit') || 3;
    db.updateGuildSetting(interaction.guild.id, 'antinuke_enabled', enabled ? 1 : 0);
    db.updateGuildSetting(interaction.guild.id, 'antinuke_role_limit', limit);
    return interaction.reply({ content: enabled ? '✅ تم تفعيل حماية حذف الرتب.' : '❌ تم تعطيل حماية حذف الرتب.' });
  }
};
