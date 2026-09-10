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

    const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
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
      .setColor(config.colors.primary || '#9333ea')
      .setTitle('📚 دليل أوامر بوت ZENO الشامل')
      .setDescription('مرحباً بك في قائمة المساعدة الشاملة! يمكنك الضغط على أي أمر لتنفيذه مباشرة أو اختيار الفئة من القائمة المنسدلة بالأسفل:')
      .addFields(
        { name: '🛡️ الإشراف والرقابة (Moderation)', value: 'أوامر إدارة وحماية السيرفر (Ban, Kick, Timeout, Warn, Clear, Lock...)' },
        { name: '⭐ الاقتصاد والنجوم (Economy & Star)', value: 'نظام النجوم Star، البنك، الوظائف، المراهنات، البروفايل والمتصدرين.' },
        { name: '🎫 نظام التذاكر (Tickets)', value: 'لوحات الدعم الفني، إدارة التذاكر وحفظ الترانسكريبت.' },
        { name: '⚙️ الإعدادات والإدارة (Settings & Admin)', value: 'الترحيب، الرقابة التلقائية (AutoMod)، الرتب التلقائية، التحقق والحماية.' },
        { name: '🌐 الأوامر العامة (General)', value: 'الجيف أواي، التصويت، ومعلومات الحسابات والسيرفر.' }
      )
      .setFooter({ text: '💡 اختر قسماً من القائمة بالأسفل لاستعراض كامل الأوامر' })
      .setTimestamp();
  },

  getSelectMenu() {
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('اختر الفئة لاستعراض أوامرها بالتفصيل...')
        .addOptions([
          { label: '🛡️ الإشراف والرقابة', value: 'mod', description: 'أوامر الطرد، الحظر، التحذيرات، الإسكات وقفل القنوات' },
          { label: '⭐ الاقتصاد والنجوم', value: 'eco', description: 'أوامر النجوم Star، البنك، العمل، الكازينو وبطاقة البروفايل' },
          { label: '🎫 نظام التذاكر', value: 'ticket', description: 'أوامر إنشاء وإعداد وإدارة تذاكر الدعم الفني' },
          { label: '⚙️ إعدادات وحماية السيرفر', value: 'admin', description: 'إعداد الترحيب، اللوق، الرقابة، التحقق والحماية Anti-Nuke' },
          { label: '🌐 الأوامر العامة', value: 'gen', description: 'الجيف أواي، التصويت ومعلومات السيرفر' }
        ])
    );
  },

  getMention(client, name, sub = null) {
    const id = client.slashCommandIds?.get(name) || '0';
    if (sub) return `</${name} ${sub}:${id}>`;
    return `</${name}:${id}>`;
  },

  handleMenu(response, userId, client) {
    const collector = response.createMessageComponentCollector({
      filter: (i) => i.customId === 'help_category_select' && i.user.id === userId,
      time: 120000
    });

    collector.on('collect', async (i) => {
      const value = i.values[0];
      const categoryEmbed = new EmbedBuilder()
        .setColor(config.colors.primary || '#9333ea')
        .setTimestamp();

      if (value === 'mod') {
        const ban = this.getMention(client, 'ban');
        const unban = this.getMention(client, 'unban');
        const kick = this.getMention(client, 'kick');
        const timeout = this.getMention(client, 'timeout');
        const untimeout = this.getMention(client, 'untimeout');
        const warn = this.getMention(client, 'warn');
        const warns = this.getMention(client, 'warns');
        const delwarn = this.getMention(client, 'delwarn');
        const clear = this.getMention(client, 'clear');
        const lock = this.getMention(client, 'lock');
        const unlock = this.getMention(client, 'unlock');

        categoryEmbed.setTitle('🛡️ أوامر الإشراف والرقابة (Moderation)')
          .setDescription([
            `• ${ban} - حظر عضو من السيرفر مع إمكانية تحديد سبب وحذف الرسائل`,
            `• ${unban} - فك الحظر عن عضو محظور باستخدام الآيدي الخاص به`,
            `• ${kick} - طرد عضو من السيرفر مع تسجيل السبب في السجلات`,
            `• ${timeout} - إعطاء تايم أوت (إسكات مؤقت) لعضو لمدة محددة`,
            `• ${untimeout} - إلغاء التايم أوت وفك الإسكات عن العضو فوراً`,
            `• ${warn} - إعطاء تحذير رسمي لعضو مع إرسال تفاصيل التحذير بالخاص`,
            `• ${warns} - استعراض قائمة وسجل تحذيرات عضو معين أو تفاصيل تحذير`,
            `• ${delwarn} - حذف تحذير معين أو مسح جميع تحذيرات العضو`,
            `• ${clear} - مسح عدد محدد من الرسائل من القناة (حتى 100 رسالة دفعة واحدة)`,
            `• ${lock} - قفل القناة الحالية ومنع الأعضاء من الكتابة فيها`,
            `• ${unlock} - فتح القناة والسماح للأعضاء بالكتابة مجدداً`
          ].join('\n\n'));
      } else if (value === 'eco') {
        const star = this.getMention(client, 'star');
        const daily = this.getMention(client, 'daily');
        const pay = this.getMention(client, 'pay');
        const bank = this.getMention(client, 'bank');
        const gamble = this.getMention(client, 'gamble');
        const work = this.getMention(client, 'work');
        const profile = this.getMention(client, 'profile');
        const rank = this.getMention(client, 'rank');
        const leaderboard = this.getMention(client, 'leaderboard');
        const setwallpaper = this.getMention(client, 'setwallpaper');

        categoryEmbed.setTitle('⭐ أوامر الاقتصاد والنجوم (Economy & Star System)')
          .setDescription([
            `• ${star} - استعراض رصيدك من نجوم Star ⭐ أو تحويلها للأعضاء`,
            `• ${daily} - استلام المكافأة اليومية مع مكافآت الستريك المتتالية (🔥 Streak)`,
            `• ${pay} - تحويل النجوم للأعضاء مع أزرار التأكيد والحماية من التحويل الخاطئ`,
            `• ${bank} - نظام البنك لحفظ وإيداع وسحب النجوم لحمايتها من الخسارة`,
            `• ${gamble} - المراهنة ومضاعفة النجوم في ألعاب الكازينو مع جوائز كبرى`,
            `• ${work} - العمل في وظائف متنوعة لكسب النجوم كل 4 ساعات`,
            `• ${profile} - عرض بطاقة الهوية والبروفايل الشخصي المصممة بالـ Canvas`,
            `• ${rank} - عرض بطاقة مستواك ونقاط الخبرة XP ونسبة التقدم`,
            `• ${leaderboard} - قائمة المتصدرين في النجوم ومستويات الخبرة XP مع أزرار الصفحات`,
            `• ${setwallpaper} - تغيير وتخصيص خلفية بطاقة البروفايل الخاصة بك`
          ].join('\n\n'));
      } else if (value === 'ticket') {
        const setup = this.getMention(client, 'ticket-setup');
        const ticket = this.getMention(client, 'ticket');

        categoryEmbed.setTitle('🎫 أوامر نظام التذاكر والدعم الفني (Tickets)')
          .setDescription([
            `• ${setup} - إنشاء لوحة فتح التذاكر المخصصة بروم الدعم مع الفئات والأزرار`,
            `• ${ticket} - إدارة التذكرة الحالية (إغلاق وحفظ الترانسكريبت، إضافة/إزالة عضو، إعادة تسمية، ونقل الملكية)`
          ].join('\n\n'));
      } else if (value === 'admin') {
        const automod = this.getMention(client, 'automod');
        const welcome = this.getMention(client, 'set-welcome');
        const logs = this.getMention(client, 'logs');
        const autorole = this.getMention(client, 'set-autorole');
        const protection = this.getMention(client, 'set-protection');
        const antinuke = this.getMention(client, 'set-antinuke');
        const tempvoice = this.getMention(client, 'set-tempvoice');
        const verification = this.getMention(client, 'set-verification');
        const autoresponder = this.getMention(client, 'auto-responder');
        const rr = this.getMention(client, 'reaction-role');
        const prefix = this.getMention(client, 'set-prefix');

        categoryEmbed.setTitle('⚙️ أوامر إدارة وحماية السيرفر (Settings & Protection)')
          .setDescription([
            `• ${automod} - منظومة الرقابة التلقائية الذكية (فلاتر السبام، الروابط، الحروف الكبيرة، والكلمات المسيئة)`,
            `• ${welcome} - إعداد روم ورسالة وبطاقة الترحيب ورسائل الخاص والوداع`,
            `• ${protection} - إعداد جدار الحماية (Anti-Link, Anti-Spam, Anti-Bot, Anti-Alt, Anti-Raid)`,
            `• ${antinuke} - نظام الحماية المتقدمة Anti-Nuke لحماية الرتب والقنوات والطرد الجماعي`,
            `• ${verification} - إعداد ونشر لوحة تفعيل وتحقق الأعضاء التفاعلية بالزر`,
            `• ${tempvoice} - تعيين روم الرومات الصوتية المؤقتة (Join to Create)`,
            `• ${logs} - نظام سجلات السيرفر الشاملة (إعداد قنوات تلقائي، تفعيل/تعطيل الأقسام، عرض الحالة، وسجل تجريبي — 105 سجل بـ 13 قسم)`,
            `• ${autorole} - تحديد الرتبة التلقائية للأعضاء الجدد والبوتات`,
            `• ${autoresponder} - إضافة وتعديل الردود التلقائية المتعددة على الكلمات المفتاحية`,
            `• ${rr} - إنشاء رسائل الرتب التفاعلية بأزرار ديسكورد`,
            `• ${prefix} - تخصيص رمز البرفكس الخاص بالسيرفر`
          ].join('\n\n'));
      } else if (value === 'gen') {
        const giveaway = this.getMention(client, 'giveaway');
        const poll = this.getMention(client, 'poll');
        const embed = this.getMention(client, 'embed');
        const ping = this.getMention(client, 'ping');
        const user = this.getMention(client, 'user');
        const server = this.getMention(client, 'server');
        const avatar = this.getMention(client, 'avatar');
        const banner = this.getMention(client, 'banner');

        categoryEmbed.setTitle('🌐 الأوامر العامة (General)')
          .setDescription([
            `• ${giveaway} - إنشاء وإدارة سحوبات الجيف أواي والمسابقات بالزر التفاعلي`,
            `• ${poll} - إنشاء تصويت واستطلاع رأي تفاعلي للأعضاء بنسب مئوية`,
            `• ${embed} - تصميم وإرسال رسائل الإيمبد المنسقة والمتقدمة`,
            `• ${ping} - فحص سرعة استجابة البوت وسيرفرات ديسكورد`,
            `• ${user} - عرض بطاقة معلومات الحساب وتاريخ الإنضمام والإنشاء`,
            `• ${server} - عرض إحصائيات ومعلومات ومستوى بوستات السيرفر`,
            `• ${avatar} - عرض وتحميل صورة حسابك أو حساب عضو آخر بجودة عالية`,
            `• ${banner} - استعراض بنر الحساب الشخصي أو بنر السيرفر`
          ].join('\n\n'));
      }

      await i.update({ embeds: [categoryEmbed] });
    });
  }
};
