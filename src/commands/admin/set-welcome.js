const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-welcome',
  description: 'إعداد نظام الترحيب بالأعضاء الجدد (روم، رسالة، بطاقة صورة)',
  aliases: ['ترحيب'],
  data: new SlashCommandBuilder()
    .setName('set-welcome')
    .setDescription('إعداد نظام الترحيب')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('روم إرسال الترحيب')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('رسالة الترحيب المخصصة ({user}, {server}, {memberCount})')
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('image')
        .setDescription('تفعيل أو تعطيل بطاقة الصورة المصممة (Canvas)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // 1. التأجيل الفوري لمنع خطأ انتهاء المهلة (3 ثواني)
    await interaction.deferReply({ flags: 64 });

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: '❌ لا تملك صلاحية الأدمن.' });
    }

    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    const image = interaction.options.getBoolean('image');

    try {
      // 2. تحديث قاعدة البيانات بالطريقة الآمنة
      const updateSetting = (key, val) => {
        if (typeof db.setGuildSetting === 'function') {
          db.setGuildSetting(interaction.guild.id, key, val);
        } else if (typeof db.updateGuildSetting === 'function') {
          db.updateGuildSetting(interaction.guild.id, key, val);
        }
      };

      updateSetting('welcome_channel', channel.id);
      if (message !== null) {
        updateSetting('welcome_message', message);
      }
      if (image !== null) {
        updateSetting('welcome_image', image ? 1 : 0);
      }

      // 3. الرد النهائي الآمن
      await interaction.editReply({
        content: `✅ تم تحديث إعدادات الترحيب بنجاح!\n📍 الروم: <#${channel.id}>\n🖼️ بطاقة الترحيب المصممة: **${image === false ? 'معطلة' : 'مفعلة'}**`
      });
    } catch (err) {
      console.error('خطأ في إعدادات الترحيب:', err);
      await interaction.editReply({ content: '❌ حدث خطأ أثناء حفظ إعدادات الترحيب في قاعدة البيانات.' });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ لا تملك صلاحية الأدمن.');
    }

    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('❌ يرجى منشن الروم. مثال: `#set-welcome #welcome`');

    try {
      if (typeof db.setGuildSetting === 'function') {
        db.setGuildSetting(message.guild.id, 'welcome_channel', channel.id);
      } else if (typeof db.updateGuildSetting === 'function') {
        db.updateGuildSetting(message.guild.id, 'welcome_channel', channel.id);
      }
      message.reply(`✅ تم تعيين روم الترحيب: <#${channel.id}>`);
    } catch (err) {
      console.error('خطأ في إعدادات الترحيب (Prefix):', err);
      message.reply('❌ حدث خطأ أثناء حفظ روم الترحيب.');
    }
  }
};