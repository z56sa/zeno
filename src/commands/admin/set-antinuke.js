const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'set-antinuke',
  description: 'إعداد نظام الحماية المتقدمة من التخريب وسحب الرتب (Anti-Nuke)',
  aliases: ['انتي_نوك', 'حماية_متقدمة'],
  data: new SlashCommandBuilder()
    .setName('set-antinuke')
    .setDescription('إعداد نظام الحماية المتقدمة Anti-Nuke')
    .addBooleanOption(opt => opt.setName('enabled').setDescription('تفعيل أو تعطيل نظام Anti-Nuke').setRequired(true))
    .addIntegerOption(opt => opt.setName('channel_limit').setDescription('الحد الأقصى لحذف الرومات خلال دقيقة (افتراضي: 3)').setMinValue(1).setMaxValue(20).setRequired(false))
    .addIntegerOption(opt => opt.setName('role_limit').setDescription('الحد الأقصى لحذف الرتب خلال دقيقة (افتراضي: 3)').setMinValue(1).setMaxValue(20).setRequired(false))
    .addIntegerOption(opt => opt.setName('ban_limit').setDescription('الحد الأقصى للحظر الجماعي خلال دقيقة (افتراضي: 3)').setMinValue(1).setMaxValue(20).setRequired(false))
    .addIntegerOption(opt => opt.setName('kick_limit').setDescription('الحد الأقصى للطرد الجماعي خلال دقيقة (افتراضي: 3)').setMinValue(1).setMaxValue(20).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ هذا الأمر مخصص لمالك وإداريي السيرفر فقط.', flags: 64 });
    }

    const enabled = interaction.options.getBoolean('enabled');
    const channelLimit = interaction.options.getInteger('channel_limit');
    const roleLimit = interaction.options.getInteger('role_limit');
    const banLimit = interaction.options.getInteger('ban_limit');
    const kickLimit = interaction.options.getInteger('kick_limit');

    db.updateGuildSetting(interaction.guild.id, 'antinuke_enabled', enabled ? 1 : 0);
    if (channelLimit) db.updateGuildSetting(interaction.guild.id, 'antinuke_channel_limit', channelLimit);
    if (roleLimit) db.updateGuildSetting(interaction.guild.id, 'antinuke_role_limit', roleLimit);
    if (banLimit) db.updateGuildSetting(interaction.guild.id, 'antinuke_ban_limit', banLimit);
    if (kickLimit) db.updateGuildSetting(interaction.guild.id, 'antinuke_kick_limit', kickLimit);

    const settings = db.getGuildSettings(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(enabled ? config.colors.success : config.colors.danger)
      .setTitle('🛡️ نظام الحماية المتقدمة Anti-Nuke')
      .setDescription(enabled ? '✅ **تم تفعيل نظام Anti-Nuke بنجاح!**\nسيقوم البوت بمراقبة أي إجراءات تخريبية وسحب الرتب فوراً من أي مشرف يحاول تخريب السيرفر.' : '❌ **تم تعطيل نظام Anti-Nuke.**')
      .addFields(
        { name: '🗑️ حد حذف الرومات', value: `\`${settings.antinuke_channel_limit || 3}\` في الدقيقة`, inline: true },
        { name: '👑 حد حذف الرتب', value: `\`${settings.antinuke_role_limit || 3}\` في الدقيقة`, inline: true },
        { name: '🔨 حد الحظر الجماعي', value: `\`${settings.antinuke_ban_limit || 3}\` في الدقيقة`, inline: true },
        { name: '👢 حد الطرد الجماعي', value: `\`${settings.antinuke_kick_limit || 3}\` في الدقيقة`, inline: true }
      )
      .setFooter({ text: 'لحماية السيرفر ضع رتبة البوت في أعلى قائمة الرتب' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
