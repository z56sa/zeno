const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'applications',
  description: 'إدارة نظام التقديمات ونقاط المراجعين في السيرفر',
  aliases: ['تقديمات', 'تقديم'],
  data: new SlashCommandBuilder()
    .setName('applications')
    .setDescription('إدارة نظام التقديمات ومراجعة الطلبات')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('pending')
        .setDescription('عرض التقديمات والطلبات قيد الانتظار')
    )
    .addSubcommandGroup(group =>
      group
        .setName('points')
        .setDescription('إدارة نقاط مراجعي التقديمات')
        .addSubcommand(sub =>
          sub
            .setName('list')
            .setDescription('عرض نقاط التقديمات الخاصة بك أو الخاصة بعضو آخر')
            .addUserOption(opt => opt.setName('user').setDescription('العضو المراد فحص نقاطه').setRequired(false))
        )
        .addSubcommand(sub =>
          sub
            .setName('set')
            .setDescription('تعيين نقاط التقديمات لعضو معين')
            .addUserOption(opt => opt.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(opt => opt.setName('points').setDescription('عدد النقاط').setRequired(true).setMinValue(0))
        )
        .addSubcommand(sub =>
          sub
            .setName('reset_user')
            .setDescription('إعادة تعيين وتصفير نقاط التقديمات لعضو')
            .addUserOption(opt => opt.setName('user').setDescription('العضو').setRequired(true))
        )
        .addSubcommand(sub =>
          sub
            .setName('reset_server')
            .setDescription('إعادة تعيين وتصفير جميع نقاط التقديمات في السيرفر بالكامل')
        )
    ),

  async execute(interaction) {
    const subGroup = interaction.options.getSubcommandGroup(false);
    const subCmd = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // 1. عرض الطلبات المعلقة (applications pending)
    if (subCmd === 'pending') {
      const pendingList = db.getPendingSubmissions(guildId);
      if (!pendingList || pendingList.length === 0) {
        return interaction.reply({ content: '✅ لا توجد أي تقديمات معلقة قيد الانتظار حالياً.', flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('📋 التقديمات قيد الانتظار')
        .setDescription(`يوجد حالياً **${pendingList.length}** طلب تقديم بانتظار المراجعة:`)
        .setFooter({ text: 'يمكنك مراجعة وقبول أو رفض الطلبات عبر رسائل اللوق المخصصة.' })
        .setTimestamp();

      pendingList.slice(0, 10).forEach((sub, i) => {
        const app = db.getApplication(sub.app_id);
        embed.addFields({
          name: `${i + 1}. تقديم #${sub.id} - ${app ? app.title : 'نموذج تقديم'}`,
          value: `👤 **مقدم الطلب:** <@${sub.user_id}>\n📅 **الوقت:** <t:${sub.submitted_at}:R>`
        });
      });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // 2. إدارة النقاط (applications points)
    if (subGroup === 'points') {
      if (subCmd === 'list') {
        const target = interaction.options.getUser('user') || interaction.user;
        const points = db.getUserApplicationPoints(guildId, target.id);

        const embed = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('⭐ نقاط مراجعة التقديمات')
          .setDescription(`👤 **العضو:** ${target} (\`${target.tag}\`)\n🎯 **إجمالي النقاط:** \`${points}\` نقطة`)
          .setFooter({ text: 'تمنح النقاط تلقائياً عند مراجعة وقبول/رفض طلبات التقديم.' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      if (subCmd === 'set') {
        const target = interaction.options.getUser('user');
        const points = interaction.options.getInteger('points');
        db.setUserApplicationPoints(guildId, target.id, points);

        return interaction.reply({
          content: `✅ تم تعيين نقاط مراجعة التقديمات للعضو ${target} لتصبح **${points}** نقطة بنجاح.`
        });
      }

      if (subCmd === 'reset_user') {
        const target = interaction.options.getUser('user');
        db.resetApplicationPoints(guildId, target.id);

        return interaction.reply({
          content: `🔄 تم تصفير وإعادة تعيين نقاط مراجعة التقديمات للعضو ${target} بنجاح.`
        });
      }

      if (subCmd === 'reset_server') {
        db.resetApplicationPoints(guildId);

        return interaction.reply({
          content: `⚠️ تم تصفير وإعادة تعيين جميع نقاط مراجعة التقديمات لجميع الأعضاء في السيرفر بنجاح.`
        });
      }
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('❌ ليس لديك صلاحية لإدارة التقديمات.');
    }

    const sub = args[0]?.toLowerCase();
    if (sub === 'pending') {
      const pendingList = db.getPendingSubmissions(message.guild.id);
      return message.reply(`📋 يوجد حالياً **${pendingList ? pendingList.length : 0}** طلب تقديم قيد الانتظار.`);
    }

    message.reply('استخدم الأوامر التفاعلية: `/applications pending` أو `/applications points list`');
  }
};
