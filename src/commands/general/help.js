const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('../../config.json');

module.exports = {
  name: 'help',
  description: 'عرض قائمة الأوامر والمساعدة التفاعلية',
  aliases: ['h', 'اوامر', 'مساعدة'],
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('عرض قائمة الأوامر والمساعدة التفاعلية الخاصة بالبوت'),

  async execute(interaction, client) {
    const embed = this.getMainEmbed();
    const row = this.getSelectMenu();

    const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
    this.handleMenu(response, interaction.user.id, client);
  },

  async executePrefix(message, args, client) {
    const embed = this.getMainEmbed();
    const row = this.getSelectMenu();

    const response = await message.reply({ embeds: [embed], components: [row] });
    this.handleMenu(response, message.author.id, client);
  },

  getMainEmbed() {
    return new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📚 دليل أوامر البوت (ProBot System)')
      .setDescription('مرحباً بك! جميع الأوامر أدناه **قابلة للضغط المباشر** لتفعيلها فوراً.\nاختر الفئة من القائمة المنسدلة لعرض الأوامر الخاصة بها:')
      .addFields(
        { name: '🛡️ الإشراف والرقابة (Moderation)', value: 'أوامر إدارة السيرفر (Ban, Kick, Timeout, Clear, Lock...)' },
        { name: '💰 الكريدت والمستويات (Economy & XP)', value: 'نظام النقاط، البروفايل، الكريدت والمكافآت اليومية.' },
        { name: '🎫 التذاكر (Tickets)', value: 'إنشاء لوحة التذاكر وإدارتها.' },
        { name: '⚙️ الإعدادات والإدارة (Settings & Admin)', value: 'إعداد الترحيب، السجلات (Logs)، الرتب التلقائية والحماية.' },
        { name: '🌐 الأوامر العامة (General)', value: 'معلومات الحسابات والسيرفر والصور.' }
      )
      .setFooter({ text: 'اضغط على أي أمر لتفعيله مباشرة في الشات' })
      .setTimestamp();
  },

  getSelectMenu() {
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('اختر الفئة لعرض أوامرها...')
        .addOptions([
          { label: '🛡️ الإشراف والحماية', value: 'mod', description: 'أوامر الطرد، الحظر، الإسكات ومسح الرسائل' },
          { label: '💰 الكريدت والمستويات', value: 'eco', description: 'أوامر الرصيد، اليومية، التحويل وبطاقة المستوى' },
          { label: '🎫 نظام التذاكر', value: 'ticket', description: 'أوامر إنشاء وإعداد التذاكر' },
          { label: '⚙️ إعدادات السيرفر', value: 'admin', description: 'إعداد الترحيب، اللوق، الرتب التلقائية والحماية' },
          { label: '🌐 الأوامر العامة', value: 'gen', description: 'معلومات السيرفر، المستخدمين والأفاتار' }
        ])
    );
  },

  getMention(client, name, sub = null) {
    const id = client.slashCommandIds?.get(name) || '0';
    return sub ? `</${name} ${sub}:${id}>` : `</${name}:${id}>`;
  },

  handleMenu(message, userId, client) {
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.customId === 'help_category_select' && i.user.id === userId,
      time: 60000
    });

    collector.on('collect', async (i) => {
      const value = i.values[0];
      const categoryEmbed = new EmbedBuilder().setColor(config.colors.primary).setTimestamp();
      categoryEmbed.setFooter({ text: '💡 اضغط على الأمر لتشغيله وتعبئة بياناته فوراً' });

      if (value === 'mod') {
        const ban = this.getMention(client, 'ban');
        const unban = this.getMention(client, 'unban');
        const kick = this.getMention(client, 'kick');
        const timeout = this.getMention(client, 'timeout');
        const clear = this.getMention(client, 'clear');
        const lock = this.getMention(client, 'lock');
        const unlock = this.getMention(client, 'unlock');
        const hide = this.getMention(client, 'hide');
        const show = this.getMention(client, 'show');
        const role = this.getMention(client, 'role', 'add');
        const warn = this.getMention(client, 'warn', 'add');
        const slowmode = this.getMention(client, 'slowmode');

        categoryEmbed.setTitle('🛡️ أوامر الإشراف والرقابة')
          .setDescription([
            `• ${ban} - حظر عضو من السيرفر`,
            `• ${unban} - إلغاء حظر عضو بالأيدي`,
            `• ${kick} - طرد عضو من السيرفر`,
            `• ${timeout} - إسكات عضو مؤقتاً (Timeout)`,
            `• ${clear} - مسح عدد محدد من الرسائل`,
            `• ${lock} - قفل الروم الحالي`,
            `• ${unlock} - فتح الروم الحالي`,
            `• ${hide} - إخفاء الروم عن الأعضاء`,
            `• ${show} - إظهار الروم للأعضاء`,
            `• ${role} - إعطاء أو سحب رتبة من عضو`,
            `• ${warn} - تحذير عضو وإدارة سجل التحذيرات`,
            `• ${slowmode} - تحديد سرعة إرسال الرسائل (Slowmode)`
          ].join('\n\n'));
      } else if (value === 'eco') {
        const credits = this.getMention(client, 'credits');
        const daily = this.getMention(client, 'daily');
        const transfer = this.getMention(client, 'transfer');
        const rank = this.getMention(client, 'rank');
        const leaderboard = this.getMention(client, 'leaderboard');

        categoryEmbed.setTitle('💰 أوامر الكريدت والمستويات')
          .setDescription([
            `• ${credits} - عرض رصيدك أو رصيد عضو آخر`,
            `• ${daily} - استلام المكافأة اليومية من الكريدت`,
            `• ${transfer} - تحويل الكريدت إلى عضو آخر`,
            `• ${rank} - عرض بطاقة مستواك ورتبتك بالـ Canvas`,
            `• ${leaderboard} - قائمة المتصدرين في السيرفر`
          ].join('\n\n'));
      } else if (value === 'ticket') {
        const setup = this.getMention(client, 'ticket-setup');
        const close = this.getMention(client, 'ticket', 'close');
        const add = this.getMention(client, 'ticket', 'add');
        const remove = this.getMention(client, 'ticket', 'remove');

        categoryEmbed.setTitle('🎫 أوامر التذاكر')
          .setDescription([
            `• ${setup} - إرسال لوحة فتح التذاكر بروم محدد مع الأزرار`,
            `• ${close} - إغلاق وحذف التذكرة الحالية`,
            `• ${add} - إضافة عضو إلى التذكرة`,
            `• ${remove} - إزالة عضو من التذكرة`
          ].join('\n\n'));
      } else if (value === 'admin') {
        const welcome = this.getMention(client, 'set-welcome');
        const logs = this.getMention(client, 'set-logs');
        const autorole = this.getMention(client, 'set-autorole');
        const protection = this.getMention(client, 'set-protection');
        const antinuke = this.getMention(client, 'set-antinuke');
        const tempvoice = this.getMention(client, 'set-tempvoice');
        const autoresponder = this.getMention(client, 'auto-responder', 'add');
        const rr = this.getMention(client, 'reaction-role');
        const prefix = this.getMention(client, 'set-prefix');

        categoryEmbed.setTitle('⚙️ أوامر إعدادات السيرفر')
          .setDescription([
            `• ${welcome} - إعداد روم ورسالة وبطاقة الترحيب`,
            `• ${logs} - تحديد روم سجلات السيرفر الشاملة (Logs)`,
            `• ${autorole} - تحديد الرتبة التلقائية للأعضاء الجدد`,
            `• ${protection} - تفعيل أو تعطيل حماية الروابط والسبام`,
            `• ${antinuke} - نظام الحماية المتقدمة Anti-Nuke وسحب الرتب`,
            `• ${tempvoice} - تعيين روم الرومات الصوتية المؤقتة (Join to Create)`,
            `• ${autoresponder} - إضافة ردود تلقائية على كلمات محددة`,
            `• ${rr} - إنشاء رتبة تفاعلية بزر`,
            `• ${prefix} - تغيير برفكس البوت في السيرفر`
          ].join('\n\n'));
      } else if (value === 'gen') {
        const quran = this.getMention(client, 'quran');
        const radio = this.getMention(client, 'radio');
        const stop = this.getMention(client, 'stop');
        const giveaway = this.getMention(client, 'giveaway', 'start');
        const poll = this.getMention(client, 'poll');
        const embed = this.getMention(client, 'embed');
        const ping = this.getMention(client, 'ping');
        const user = this.getMention(client, 'user');
        const server = this.getMention(client, 'server');
        const avatar = this.getMention(client, 'avatar');
        const banner = this.getMention(client, 'banner');

        categoryEmbed.setTitle('🌐 الأوامر العامة والصوتية')
          .setDescription([
            `• ${quran} - تلاوات القرآن الكريم وإذاعات كبار القراء`,
            `• ${radio} - تشغيل إذاعة القرآن الكريم مباشرة 24/7`,
            `• ${stop} - إيقاف الصوت ومغادرة الروم الصوتي`,
            `• ${giveaway} - إنشاء وإدارة القيف أواي والسحوبات بالزر`,
            `• ${poll} - إنشاء تصويت واستطلاع تفاعلي بأزرار ونسب مئوية`,
            `• ${embed} - إرسال رسالة Embed منسقة واحترافية`,
            `• ${ping} - سرعة استجابة البوت`,
            `• ${user} - معلومات حسابك أو عضو آخر`,
            `• ${server} - معلومات وإحصائيات السيرفر`,
            `• ${avatar} - صورة حسابك أو عضو آخر`,
            `• ${banner} - بنر الحساب`
          ].join('\n\n'));
      }

      await i.update({ embeds: [categoryEmbed] });
    });
  }
};
