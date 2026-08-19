const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'set-protection',
  description: 'إعداد وتفعيل نظام الحماية والأمان المتقدم (Anti-Spam, Anti-Link, Anti-Bot, Anti-Raid, Anti-Alt)',
  aliases: ['حماية', 'امان', 'أمان', 'protection', 'security'],
  data: new SlashCommandBuilder()
    .setName('set-protection')
    .setDescription('إعداد وتفعيل خيارات الحماية والأمان المتقدمة في السيرفر')
    .addBooleanOption(opt =>
      opt.setName('anti_link')
        .setDescription('منع نشر الروابط العامة في القنوات')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('anti_invites')
        .setDescription('منع نشر دعوات سيرفرات ديسكورد الأخرى (discord.gg)')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('anti_spam')
        .setDescription('منع السبام وتكرار الرسائل وإسكات المخالفين تلقائياً')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('anti_bot')
        .setDescription('منع وطرد البوتات غير الموثقة من الانضمام')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('anti_alt_days')
        .setDescription('منع الحسابات الوهمية والجديدة (حدد عمر الحساب بالأيام لمنعه من الدخول)')
        .addChoices(
          { name: 'تعطيل الحماية', value: 0 },
          { name: 'حسابات عمرها أقل من 3 أيام', value: 3 },
          { name: 'حسابات عمرها أقل من 7 أيام (أسبوع)', value: 7 },
          { name: 'حسابات عمرها أقل من 14 يوم (أسبوعين)', value: 14 },
          { name: 'حسابات عمرها أقل من 30 يوم (شهر)', value: 30 }
        )
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('anti_raid')
        .setDescription('تفعيل نظام كشف الهجمات والدخول الجماعي السريع (Anti-Raid)')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('anti_ghost_ping')
        .setDescription('كشف وتنبيه المشرفين عند حذف رسائل تحتوي على منشن (Ghost Ping)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', ephemeral: true });
    }

    const antiLink = interaction.options.getBoolean('anti_link');
    const antiInvites = interaction.options.getBoolean('anti_invites');
    const antiSpam = interaction.options.getBoolean('anti_spam');
    const antiBot = interaction.options.getBoolean('anti_bot');
    const antiAltDays = interaction.options.getInteger('anti_alt_days');
    const antiRaid = interaction.options.getBoolean('anti_raid');
    const antiGhostPing = interaction.options.getBoolean('anti_ghost_ping');

    if (antiLink !== null) db.updateGuildSetting(interaction.guild.id, 'anti_link', antiLink ? 1 : 0);
    if (antiInvites !== null) db.updateGuildSetting(interaction.guild.id, 'anti_invites', antiInvites ? 1 : 0);
    if (antiSpam !== null) db.updateGuildSetting(interaction.guild.id, 'anti_spam', antiSpam ? 1 : 0);
    if (antiBot !== null) db.updateGuildSetting(interaction.guild.id, 'anti_bot', antiBot ? 1 : 0);
    if (antiAltDays !== null) db.updateGuildSetting(interaction.guild.id, 'anti_alt_days', antiAltDays);
    if (antiRaid !== null) db.updateGuildSetting(interaction.guild.id, 'anti_raid', antiRaid ? 1 : 0);
    if (antiGhostPing !== null) db.updateGuildSetting(interaction.guild.id, 'anti_ghost_ping', antiGhostPing ? 1 : 0);

    const settings = db.getGuildSettings(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor('#2ed573')
      .setTitle('🛡️ حالة وتكوين نظام الأمان والحماية في السيرفر')
      .setDescription('تم تحديث إعدادات الأمان بنجاح. إليك التقرير الشامل لحالة درع الحماية:')
      .addFields(
        { name: '🔗 منع الروابط (Anti-Link)', value: settings.anti_link ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: '📨 منع الدعوات (Anti-Invites)', value: settings.anti_invites ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: '⚡ منع السبام (Anti-Spam)', value: settings.anti_spam ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: '🤖 حظر البوتات المشبوهة (Anti-Bot)', value: settings.anti_bot ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: '👥 منع الحسابات الوهمية (Anti-Alt)', value: settings.anti_alt_days > 0 ? `🟢 أقل من ${settings.anti_alt_days} أيام` : '🔴 معطل', inline: true },
        { name: '🚨 حماية الهجمات (Anti-Raid)', value: settings.anti_raid ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: '👻 كشف المنشن المخفي (Ghost Ping)', value: settings.anti_ghost_ping ? '🟢 مفعل' : '🔴 معطل', inline: true }
      )
      .setFooter({ text: 'المشرفين والإداريين مستثنون من قيود الحماية تلقائياً' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ لا تملك صلاحية الأدمن.');
    }

    const settings = db.getGuildSettings(message.guild.id);

    const embed = new EmbedBuilder()
      .setColor('#2ed573')
      .setTitle('🛡️ حالة وتكوين نظام الأمان والحماية في السيرفر')
      .setDescription('استخدم أمر السلاش `/set-protection` لضبط وتخصيص كافة خيارات الحماية بنقرة واحدة:')
      .addFields(
        { name: '🔗 منع الروابط (Anti-Link)', value: settings.anti_link ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: '📨 منع الدعوات (Anti-Invites)', value: settings.anti_invites ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: '⚡ منع السبام (Anti-Spam)', value: settings.anti_spam ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: '🤖 حظر البوتات (Anti-Bot)', value: settings.anti_bot ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: '👥 الحسابات الوهمية (Anti-Alt)', value: settings.anti_alt_days > 0 ? `🟢 أقل من ${settings.anti_alt_days} أيام` : '🔴 معطل', inline: true },
        { name: '🚨 حماية الهجمات (Anti-Raid)', value: settings.anti_raid ? '🟢 مفعل' : '🔴 معطل', inline: true },
        { name: '👻 كشف المنشن المخفي (Ghost Ping)', value: settings.anti_ghost_ping ? '🟢 مفعل' : '🔴 معطل', inline: true }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};
