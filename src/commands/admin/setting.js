const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'setting',
  description: 'إعداد وتحديد رتبة وقنوات نظام حضور وانصراف الإدارة',
  aliases: ['اعدادات_الادارة', 'staff-setting'],
  data: new SlashCommandBuilder()
    .setName('setting')
    .setDescription('إعداد وتحديد رتبة وقنوات نظام حضور وانصراف الإدارة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(opt =>
      opt.setName('staff_role')
        .setDescription('رتبة الإدارة المخولة وحدها بالتفاعل مع أزرار التسجيل')
        .setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('log_channel')
        .setDescription('قناة إرسال سجلات الحضور والانصراف (Staff Shift Logs)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('login_channel')
        .setDescription('قناة لوحة تسجيل الحضور والانصراف الرئيسية')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('auto_logout')
        .setDescription('تفعيل تسجيل الخروج التلقائي عند الخمول أو الخروج من الديسكورد (افتراضي: مفعل)')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ هذا الأمر مخصص لمدراء السيرفر فقط (Administrator).', flags: 64 });
    }

    const guildId = interaction.guild.id;
    const staffRole = interaction.options.getRole('staff_role');
    const logChannel = interaction.options.getChannel('log_channel');
    const loginChannel = interaction.options.getChannel('login_channel');
    const autoLogout = interaction.options.getBoolean('auto_logout');

    const updates = {};
    if (staffRole) updates.staff_role = staffRole.id;
    if (logChannel) updates.staff_log_channel = logChannel.id;
    if (loginChannel) updates.staff_login_channel = loginChannel.id;
    if (autoLogout !== null && autoLogout !== undefined) updates.staff_auto_logout = autoLogout ? 1 : 0;

    if (Object.keys(updates).length === 0) {
      const current = db.getGuildSettings(guildId);
      const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle('⚙️ الإعدادات الحالية لنظام إدارة الطاقم (Staff Settings)')
        .addFields(
          { name: '🛡️ رتبة الإدارة المعتمدة', value: current.staff_role ? `<@&${current.staff_role}>` : '`غير محددة` (مفتوح للـ Manage Guild)', inline: true },
          { name: '📜 قناة السجلات (Logs)', value: current.staff_log_channel ? `<#${current.staff_log_channel}>` : '`غير محددة`', inline: true },
          { name: '🚪 قناة لوحة التسجيل', value: current.staff_login_channel ? `<#${current.staff_login_channel}>` : '`غير محددة`', inline: true },
          { name: '⚡ الخروج التلقائي (Auto Logout)', value: current.staff_auto_logout === 0 ? '❌ معطل' : '✅ مفعل (عند الخروج من الديسكورد)', inline: true }
        )
        .setFooter({ text: 'يمكنك تعديل أي خيار بإعادة كتابة الأمر واختيار الحقل المطلوب' });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    db.updateGuildSettings(guildId, updates);

    const updatedSettings = db.getGuildSettings(guildId);
    const successEmbed = new EmbedBuilder()
      .setColor('#10b981')
      .setTitle('✅ تم تحديث إعدادات نظام الإدارة بنجاح!')
      .setDescription('تم حفظ التغييرات وتطبيقها فوراً على البوت ولوحة التحكم.')
      .addFields(
        { name: '🛡️ رتبة الإدارة', value: updatedSettings.staff_role ? `<@&${updatedSettings.staff_role}>` : '`غير محددة`', inline: true },
        { name: '📜 قناة السجلات', value: updatedSettings.staff_log_channel ? `<#${updatedSettings.staff_log_channel}>` : '`غير محددة`', inline: true },
        { name: '🚪 قناة التسجيل', value: updatedSettings.staff_login_channel ? `<#${updatedSettings.staff_login_channel}>` : '`غير محددة`', inline: true },
        { name: '⚡ الخروج التلقائي', value: updatedSettings.staff_auto_logout === 0 ? '❌ معطل' : '✅ مفعل', inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [successEmbed], flags: 64 });
  }
};
