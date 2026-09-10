const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-jail',
  description: 'إعداد وتحديد رتبة وروم السجن (Jail Setup)',
  aliases: ['ضبط_السجن', 'اعداد_السجن'],
  data: new SlashCommandBuilder()
    .setName('set-jail')
    .setDescription('إعداد وتخصيص رتبة وروم السجن')
    .addRoleOption(opt => opt.setName('role').setDescription('رتبة السجن المخصصة (Jailed Role)').setRequired(false))
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('روم السجن المخصص للتحدث مع المسجونين')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ هذا الأمر مخصص لإداريي السيرفر فقط.', flags: 64 });
    }

    const role = interaction.options.getRole('role');
    const channel = interaction.options.getChannel('channel');

    if (!role && !channel) {
      return interaction.reply({ content: '❌ يرجى تحديد رتبة السجن أو قناة السجن على الأقل.', flags: 64 });
    }

    if (role) db.updateGuildSetting(interaction.guild.id, 'jail_role', role.id);
    if (channel) db.updateGuildSetting(interaction.guild.id, 'jail_channel', channel.id);

    const settings = db.getGuildSettings(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle('🔒 إعدادات نظام السجن (Jail Setup)')
      .setDescription('تم حفظ وتحديث إعدادات السجن بنجاح:')
      .addFields(
        { name: '🎭 رتبة السجن', value: settings.jail_role ? `<@&${settings.jail_role}>` : 'غير محددة', inline: true },
        { name: '📌 قناة السجن', value: settings.jail_channel ? `<#${settings.jail_channel}>` : 'غير محددة', inline: true }
      )
      .setFooter({ text: 'استخدم /jail add لسجن المخالفين بكل سهولة' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
