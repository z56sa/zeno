const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'anti-ban',
  description: 'تسطيب نظام الحماية من الباند',
  aliases: ['انتي-باند'],
  data: new SlashCommandBuilder()
    .setName('anti-ban')
    .setDescription('تسطيب نظام الحماية من الباند')
    .addBooleanOption(opt => opt.setName('enabled').setDescription('تفعيل أو تعطيل').setRequired(true))
    .addIntegerOption(opt => opt.setName('limit').setDescription('الحد الأقصى').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', flags: 64 });
    }
    const enabled = interaction.options.getBoolean('enabled');
    const limit = interaction.options.getInteger('limit') || 3;
    db.updateGuildSetting(interaction.guild.id, 'antinuke_enabled', enabled ? 1 : 0);
    db.updateGuildSetting(interaction.guild.id, 'antinuke_ban_limit', limit);
    return interaction.reply({ content: enabled ? '✅ تم تفعيل حماية الباند.' : '❌ تم تعطيل حماية الباند.' });
  }
};
