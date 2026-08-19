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
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية الأدمن.', ephemeral: true });
    }

    const newPrefix = interaction.options.getString('prefix');
    db.updateGuildSetting(interaction.guild.id, 'prefix', newPrefix);

    await interaction.reply(`✅ تم تغيير برفكس البوت في هذا السيرفر بنجاح إلى: \`${newPrefix}\``);
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ لا تملك صلاحية الأدمن.');
    }

    const newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 3) {
      return message.reply('❌ يرجى كتابة الرمز الجديد (بحد أقصى 3 أحرف/رموز). مثال: `#setprefix !`');
    }

    db.updateGuildSetting(message.guild.id, 'prefix', newPrefix);
    message.reply(`✅ تم تغيير برفكس البوت بنجاح إلى: \`${newPrefix}\``);
  }
};
