const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set',
  description: 'أوامر ضبط وتخصيص البوت ولوحات الإدارة',
  aliases: ['ضبط', 'اعداد'],
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('إعدادات وتخصيص البوت ولوحات الإدارة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // 1. /set message
    .addSubcommand(sub =>
      sub.setName('message')
        .setDescription('إنشاء لوحة تسجيل الحضور والانصراف للإدارة (Login / Logout Panel)')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('القناة المراد إرسال لوحة التسجيل فيها')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt.setName('banner')
            .setDescription('إظهار البانر الجمالي للوحة الحضور؟')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('banner_url')
            .setDescription('رابط مخصص لصورة البانر (اختياري)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('title')
            .setDescription('عنوان اللوحة (افتراضي: لوحة تسجيل حضور وانصراف الإدارة)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('description')
            .setDescription('نص الوصف والتعليمات داخل اللوحة')
            .setRequired(false)
        )
    )
    // 2. /set name
    .addSubcommand(sub =>
      sub.setName('name')
        .setDescription('تغيير اسم البوت مباشرة في هذا السيرفر أو عالمياً')
        .addStringOption(opt =>
          opt.setName('new_name')
            .setDescription('الاسم الجديد للبوت')
            .setMinLength(2)
            .setMaxLength(32)
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt.setName('global')
            .setDescription('تغيير الاسم في الديسكورد بالكامل أم في هذا السيرفر فقط؟')
            .setRequired(false)
        )
    )
    // 3. /set avatar
    .addSubcommand(sub =>
      sub.setName('avatar')
        .setDescription('تغيير الصورة الشخصية أو شعار البوت')
        .addAttachmentOption(opt =>
          opt.setName('image_file')
            .setDescription('ارفع ملف الصورة الجديدة للبوت')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('image_url')
            .setDescription('أو ضع رابط صورة مباشر (URL)')
            .setRequired(false)
        )
    )
    // 4. /set state
    .addSubcommand(sub =>
      sub.setName('state')
        .setDescription('تغيير حالة التواجد والنشاط للبوت')
        .addStringOption(opt =>
          opt.setName('status')
            .setDescription('حالة التواجد (Online / Idle / DND / Invisible)')
            .setRequired(true)
            .addChoices(
              { name: '🟢 متصل (Online)', value: 'online' },
              { name: '🌙 خامل (Idle)', value: 'idle' },
              { name: '🔴 ممنوع الإزعاج (Do Not Disturb)', value: 'dnd' },
              { name: '⚪ مخفي (Invisible)', value: 'invisible' }
            )
        )
        .addStringOption(opt =>
          opt.setName('activity_text')
            .setDescription('النص الظاهر بجانب الحالة (مثال: حماية السيرفر وإدارة الدعم)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('activity_type')
            .setDescription('نوع النشاط')
            .setRequired(false)
            .addChoices(
              { name: '🎮 يلعب (Playing)', value: 'Playing' },
              { name: '👀 يشاهد (Watching)', value: 'Watching' },
              { name: '🎧 يستمع إلى (Listening)', value: 'Listening' },
              { name: '🏆 يتنافس في (Competing)', value: 'Competing' }
            )
        )
    ),

  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ هذا الأمر مخصص لمالكي ومسؤولي السيرفر فقط (Administrator).', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // 1. /set message
    if (sub === 'message') {
      const channel = interaction.options.getChannel('channel');
      const showBanner = interaction.options.getBoolean('banner') ?? true;
      const customBanner = interaction.options.getString('banner_url');
      const title = interaction.options.getString('title') || '📋 لوحة تسجيل حضور وانصراف الإدارة | Staff Shift';
      const desc = interaction.options.getString('description') || 
        'مرحباً بكم يا أعضاء طاقم الإدارة 🫡\n\n' +
        '• لبدء فترة عملك واستقبال تذاكر ورومات الدعم، اضغط على زر **تسجيل الدخول (Login)** 🟢\n' +
        '• عند انتهاء فترة دوامك، اضغط على زر **تسجيل الخروج (Logout)** 🔴 لحفظ ساعاتك ونقاطك بدقة.\n\n' +
        '⚠️ **ملاحظة:** يتم تسجيل خروجك تلقائياً إذا خرجت من الديسكورد لمنع الساعات الوهمية.';

      const settings = db.getGuildSettings(guildId);
      const bannerImg = customBanner || settings.staff_banner_url || interaction.guild.bannerURL({ size: 1024 }) || null;

      const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle(title)
        .setDescription(desc)
        .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
        .setTimestamp();

      if (showBanner && bannerImg) {
        embed.setImage(bannerImg);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('staff_login_btn')
          .setLabel('تسجيل الدخول | Login')
          .setEmoji('🟢')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('staff_logout_btn')
          .setLabel('تسجيل الخروج | Logout')
          .setEmoji('🔴')
          .setStyle(ButtonStyle.Danger)
      );

      try {
        const sentMsg = await channel.send({ embeds: [embed], components: [row] });
        db.updateGuildSettings(guildId, {
          staff_login_channel: channel.id,
          staff_banner_url: bannerImg || '',
          staff_banner_enabled: showBanner ? 1 : 0
        });

        return interaction.reply({
          content: `✅ **تم إنشاء وإرسال لوحة تسجيل الحضور والانصراف بنجاح في القناة:** <#${channel.id}>`,
          flags: 64
        });
      } catch (err) {
        return interaction.reply({ content: `❌ تعذر إرسال الرسالة في القناة: ${err.message}`, flags: 64 });
      }
    }

    // 2. /set name
    if (sub === 'name') {
      await interaction.deferReply({ flags: 64 });
      const newName = interaction.options.getString('new_name');
      const isGlobal = interaction.options.getBoolean('global') ?? false;

      if (isGlobal) {
        try {
          await client.user.setUsername(newName);
          return interaction.editReply({ content: `✅ تم تغيير اسم البوت في الديسكورد بالكامل إلى: **${newName}**` });
        } catch (err) {
          return interaction.editReply({ content: `❌ فشل تغيير اسم البوت عالمياً (قد يكون هناك حد يومي من ديسكورد): ${err.message}` });
        }
      } else {
        try {
          const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
          await me.setNickname(newName);
          db.updateGuildSettings(guildId, { bot_nickname: newName });
          return interaction.editReply({ content: `✅ تم تغيير اسم البوت في سيرفر **${interaction.guild.name}** إلى: **${newName}**` });
        } catch (err) {
          return interaction.editReply({ content: `❌ فشل تغيير اسم البوت في السيرفر: ${err.message}` });
        }
      }
    }

    // 3. /set avatar
    if (sub === 'avatar') {
      await interaction.deferReply({ flags: 64 });
      const attachment = interaction.options.getAttachment('image_file');
      const imgUrl = interaction.options.getString('image_url');
      const finalUrl = attachment ? attachment.url : imgUrl;

      if (!finalUrl) {
        return interaction.editReply({ content: '❌ يرجى رفع ملف صورة أو تزويد رابط مباشر للصورة.' });
      }

      try {
        await client.user.setAvatar(finalUrl);
        db.updateGuildSettings(guildId, { bot_avatar: finalUrl });
        return interaction.editReply({
          content: `✅ **تم تحديث الصورة الشخصية وشعار البوت بنجاح!**`,
          embeds: [new EmbedBuilder().setColor('#10b981').setImage(finalUrl)]
        });
      } catch (err) {
        return interaction.editReply({ content: `❌ فشل تغيير صورة البوت (تأكد من الرابط أو قد تجاوزت حد التغيير المؤقت بديسكورد): ${err.message}` });
      }
    }

    // 4. /set state
    if (sub === 'state') {
      await interaction.deferReply({ flags: 64 });
      const status = interaction.options.getString('status');
      const activityText = interaction.options.getString('activity_text');
      const activityType = interaction.options.getString('activity_type') || 'Watching';

      try {
        const { ActivityType } = require('discord.js');
        const typeMap = {
          Playing: ActivityType.Playing,
          Watching: ActivityType.Watching,
          Listening: ActivityType.Listening,
          Competing: ActivityType.Competing
        };

        const presenceOptions = { status };
        if (activityText) {
          presenceOptions.activities = [{
            name: activityText,
            type: typeMap[activityType] || ActivityType.Watching
          }];
        }

        client.user.setPresence(presenceOptions);
        return interaction.editReply({
          content: `✅ **تم تحديث حالة البوت بنجاح!**\n• الحالة: \`${status}\`\n• النشاط: \`${activityType} ${activityText || '(بدون نص)'}\``
        });
      } catch (err) {
        return interaction.editReply({ content: `❌ فشل تحديث حالة البوت: ${err.message}` });
      }
    }
  }
};
