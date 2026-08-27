const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');

module.exports = {
  name: 'set-prefix',
  description: 'تغيير برفكس الأوامر النصية في السيرفر',
  aliases: ['setprefix', 'برفكس'],
  data: new SlashCommandBuilder()
    .setName('set-prefix')
    .setDescription('تغيير رمز البرفكس الخاص بالسيرفر')
    .addStringOption(opt =>
      opt.setName('prefix')
        .setDescription('الرمز الجديد (مثال: !, #, $, .)')
        .setMaxLength(3)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // 1. الاستجابة الفورية لمنع انتهاء المهلة (3 ثواني)
    await interaction.deferReply({ flags: 64 });

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: '❌ لا تملك صلاحية الأدمن.' });
    }

    const newPrefix = interaction.options.getString('prefix');

    try {
      // 2. استخدام الدالة الصحيحة المتوافقة مع قاعدة البيانات لديك
      if (typeof db.setGuildSetting === 'function') {
        db.setGuildSetting(interaction.guild.id, 'prefix', newPrefix);
      } else if (typeof db.setGuildPrefix === 'function') {
        db.setGuildPrefix(interaction.guild.id, newPrefix);
      } else {
        db.updateGuildSetting(interaction.guild.id, 'prefix', newPrefix);
      }

      await interaction.editReply({ content: `✅ تم تغيير برفكس البوت في هذا السيرفر بنجاح إلى: \`${newPrefix}\`` });
    } catch (err) {
      console.error('خطأ في حفظ البرفكس:', err);
      await interaction.editReply({ content: '❌ حدث خطأ أثناء محاولة حفظ البرفكس في قاعدة البيانات.' });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ لا تملك صلاحية الأدمن.');
    }

    const newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 3) {
      return message.reply('❌ يرجى كتابة الرمز الجديد (بحد أقصى 3 أحرف/رموز). مثال: `#setprefix !`');
    }

    try {
      if (typeof db.setGuildSetting === 'function') {
        db.setGuildSetting(message.guild.id, 'prefix', newPrefix);
      } else if (typeof db.setGuildPrefix === 'function') {
        db.setGuildPrefix(message.guild.id, newPrefix);
      } else {
        db.updateGuildSetting(message.guild.id, 'prefix', newPrefix);
      }

      message.reply(`✅ تم تغيير برفكس البوت بنجاح إلى: \`${newPrefix}\``);
    } catch (err) {
      console.error('خطأ في حفظ البرفكس:', err);
      message.reply('❌ حدث خطأ أثناء حفظ البرفكس.');
    }
  }
};