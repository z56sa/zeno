const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'notify',
  description: 'إدارة وتخصيص تنبيهات YouTube / Twitch / TikTok التلقائية 📺',
  aliases: ['notifications', 'social-alerts', 'تنبيهات', 'يوتيوب', 'تويتش', 'تيك_توك'],
  data: new SlashCommandBuilder()
    .setName('notify')
    .setDescription('إدارة تنبيهات YouTube / Twitch / TikTok في السيرفر 📺')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // 1. إضافة تنبيه جديد
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('إضافة قناة أو حساب جديد للتنبيهات التلقائية')
        .addStringOption(opt =>
          opt.setName('platform')
            .setDescription('المنصة (YouTube / Twitch / TikTok)')
            .setRequired(true)
            .addChoices(
              { name: '📺 YouTube (يوتيوب)', value: 'youtube' },
              { name: '🔴 Twitch (تويتش)', value: 'twitch' },
              { name: '🎵 TikTok (تيك توك)', value: 'tiktok' }
            )
        )
        .addStringOption(opt =>
          opt.setName('account')
            .setDescription('اسم القناة أو المعرف (مثال: @MrBeast أو الرابط أو ID القناة)')
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('الروم الذي ستصل إليه التنبيهات')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('الرتبة التي سيتم عمل منشن لها عند نشر محتوى جديد (اختياري)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('رسالة مخصصة (المتغيرات: {channel}, {title}, {url})')
            .setRequired(false)
        )
    )
    // 2. عرض القائمة الحالية
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('عرض جميع الحسابات والقنوات المضافة للتنبيهات')
    )
    // 3. حذف تنبيه
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('حذف تنبيه حساب معين من السيرفر')
        .addIntegerOption(opt =>
          opt.setName('id')
            .setDescription('رقم التنبيه (معرف ID من قائمة /notify list)')
            .setRequired(true)
        )
    )
    // 4. إيقاف / تشغيل تنبيه مؤقتاً
    .addSubcommand(sub =>
      sub.setName('toggle')
        .setDescription('تشغيل أو إيقاف تنبيه حساب معين دون حذفه')
        .addIntegerOption(opt =>
          opt.setName('id')
            .setDescription('رقم التنبيه (معرف ID من قائمة /notify list)')
            .setRequired(true)
        )
    )
    // 5. فحص وتجربة إرسال تنبيه تجريبي
    .addSubcommand(sub =>
      sub.setName('test')
        .setDescription('إرسال تنبيه تجريبي فوري للتأكد من عمل القناة والإعدادات')
        .addIntegerOption(opt =>
          opt.setName('id')
            .setDescription('رقم التنبيه (معرف ID من قائمة /notify list)')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة فقط!', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // 1. إضافة تنبيه
    if (sub === 'add') {
      await interaction.deferReply();
      const platform = interaction.options.getString('platform');
      const rawAccount = interaction.options.getString('account').trim();
      const targetChannel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      const customMessage = interaction.options.getString('message');

      const cleanAccount = rawAccount.replace(/^@/, '');

      const feed = db.addSocialFeed(
        guildId,
        platform,
        cleanAccount,
        targetChannel.id,
        role ? role.id : null,
        customMessage
      );

      const platformLabels = {
        youtube: '📺 YouTube',
        twitch: '🔴 Twitch',
        tiktok: '🎵 TikTok'
      };

      const embed = new EmbedBuilder()
        .setColor('#2ed573')
        .setTitle('✅ تم إضافة تنبيه المحتوى بنجاح!')
        .setDescription(`سيقوم البوت الآن بمراقبة القناة تلقائياً ونشر أي محتوى جديد فور نزوله.`)
        .addFields(
          { name: '🌐 المنصة', value: platformLabels[platform] || platform, inline: true },
          { name: '👤 الحساب / القناة', value: `\`${cleanAccount}\``, inline: true },
          { name: '📢 روم التنبيهات', value: `<#${targetChannel.id}>`, inline: true },
          { name: '👥 المنشن', value: role ? `<@&${role.id}>` : 'بدون منشن', inline: true },
          { name: '🆔 رقم التنبيه (ID)', value: `\`#${feed.id}\``, inline: true },
          { name: '💬 رسالة مخصصة', value: customMessage ? `\`${customMessage}\`` : 'الافتراضية', inline: false }
        )
        .setFooter({ text: 'ZENO Social Notifier System' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // 2. عرض القائمة
    if (sub === 'list') {
      const feeds = db.getGuildSocialFeeds(guildId);
      if (!feeds || feeds.length === 0) {
        return interaction.reply({
          content: 'ℹ️ لا توجد أي قنوات أو حسابات مضافة للتنبيهات في هذا السيرفر حالياً.\nاستخدم `/notify add` أو لوحة التحكم لإضافة حساب!',
          ephemeral: true
        });
      }

      const platformIcons = { youtube: '📺 YouTube', twitch: '🔴 Twitch', tiktok: '🎵 TikTok' };

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📺 قائمة تنبيهات السوشيال ميديا الحالية')
        .setDescription(`إجمالي القنوات المراقبة: **${feeds.length}** حساب`)
        .setTimestamp();

      feeds.forEach(f => {
        const status = f.enabled ? '🟢 مفعّل' : '🔴 معطل';
        const mention = f.role_id ? (f.role_id === 'everyone' ? '@everyone' : `<@&${f.role_id}>`) : 'بدون منشن';
        embed.addFields({
          name: `${platformIcons[f.platform] || f.platform} — \`${f.account_id}\` (ID: #${f.id})`,
          value: `📢 الروم: <#${f.channel_id}> | 👥 المنشن: ${mention} | الحالة: **${status}**`,
          inline: false
        });
      });

      return interaction.reply({ embeds: [embed] });
    }

    // 3. حذف تنبيه
    if (sub === 'remove') {
      const id = interaction.options.getInteger('id');
      const feed = db.getSocialFeed(id);

      if (!feed || feed.guild_id !== guildId) {
        return interaction.reply({ content: `❌ لم يتم العثور على تنبيه برقم ID: \`#${id}\` في هذا السيرفر!`, ephemeral: true });
      }

      db.deleteSocialFeed(id, guildId);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('🗑️ تم حذف التنبيه بنجاح!')
            .setDescription(`تم إيقاف ومسح تنبيه حساب **${feed.account_id}** (${feed.platform}) نهائياً.`)
        ]
      });
    }

    // 4. تشغيل / إيقاف مؤقت
    if (sub === 'toggle') {
      const id = interaction.options.getInteger('id');
      const feed = db.getSocialFeed(id);

      if (!feed || feed.guild_id !== guildId) {
        return interaction.reply({ content: `❌ لم يتم العثور على تنبيه برقم ID: \`#${id}\` في هذا السيرفر!`, ephemeral: true });
      }

      const newStatus = feed.enabled === 1 ? 0 : 1;
      db.toggleSocialFeed(id, newStatus === 1);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(newStatus === 1 ? '#2ed573' : '#FEE75C')
            .setTitle(newStatus === 1 ? '🟢 تم تفعيل التنبيه!' : '🟡 تم إيقاف التنبيه مؤقتاً!')
            .setDescription(`تنبيه حساب **${feed.account_id}** أصبح الآن: **${newStatus === 1 ? 'مفعلاً ويعمل' : 'متوقفاً مؤقتاً'}**`)
        ]
      });
    }

    // 5. فحص وتجربة
    if (sub === 'test') {
      await interaction.deferReply();
      const id = interaction.options.getInteger('id');
      const feed = db.getSocialFeed(id);

      if (!feed || feed.guild_id !== guildId) {
        return interaction.editReply({ content: `❌ لم يتم العثور على تنبيه برقم ID: \`#${id}\` في هذا السيرفر!` });
      }

      const { processFeed } = require('../../utils/socialNotifier');
      // إنشاء كائن مؤقت لاختبار النشر الفوري
      const testFeed = { ...feed, last_video_id: 'force_test_trigger' };
      await processFeed(interaction.client, testFeed);

      return interaction.editReply({
        content: `✅ تم إرسال إشعار تجريبي في الروم <#${feed.channel_id}> بنجاح!`
      });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ هذا الأمر مخصص للإدارة فقط!');
    }

    const action = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    if (!action || action === 'list') {
      const feeds = db.getGuildSocialFeeds(guildId);
      if (!feeds || feeds.length === 0) {
        return message.reply('ℹ️ لا توجد أي تنبيهات مضافة. استخدم الأمر `/notify add` لإضافة حساب جديد!');
      }

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📺 قائمة تنبيهات السوشيال ميديا')
        .setDescription(`العدد: **${feeds.length}** حساب`);

      feeds.forEach(f => {
        embed.addFields({
          name: `[${f.platform.toUpperCase()}] ${f.account_id} (ID: #${f.id})`,
          value: `📢 الروم: <#${f.channel_id}> | الحالة: ${f.enabled ? '🟢 مفعّل' : '🔴 معطل'}`
        });
      });

      return message.reply({ embeds: [embed] });
    }

    if (action === 'add') {
      const platform = args[1]?.toLowerCase();
      const account = args[2];
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[3]);

      if (!platform || !account || !channel || !['youtube', 'twitch', 'tiktok'].includes(platform)) {
        return message.reply('❌ الاستخدام:\n`#notify add [youtube/twitch/tiktok] [اسم_الحساب] [#الروم]`');
      }

      const feed = db.addSocialFeed(guildId, platform, account.replace(/^@/, ''), channel.id);
      return message.reply(`✅ تم إضافة تنبيه **${platform}** لحساب \`${account}\` في الروم <#${channel.id}> (ID: #${feed.id})`);
    }

    if (action === 'remove' || action === 'delete') {
      const id = parseInt(args[1]);
      if (isNaN(id)) return message.reply('❌ يرجى تحديد رقم التنبيه: `#notify remove [ID]`');
      db.deleteSocialFeed(id, guildId);
      return message.reply(`🗑️ تم حذف التنبيه رقم #${id} بنجاح.`);
    }

    return message.reply('ℹ️ استخدم `/notify` للتحكم الكامل بالتنبيهات أو إدارة لوحة التحكم.');
  }
};
