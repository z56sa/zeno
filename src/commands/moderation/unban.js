const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const config = require('../../config.json');

module.exports = {
  name: 'unban',
  description: 'إلغاء حظر عضو من السيرفر',
  aliases: ['انبان'],
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('إلغاء حظر عضو من السيرفر')
    .addStringOption(opt => opt.setName('userid').setDescription('أيدي العضو المحظور').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: '❌ لا تملك صلاحية إلغاء حظر الأعضاء.', flags: 64 });
    }

    const userId = interaction.options.getString('userid');
    try {
      await interaction.guild.bans.remove(userId, `إلغاء حظر بواسطة ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🔓 تم إلغاء حظر العضو بنجاح')
        .setDescription(`تم إلغاء حظر المستخدم صاحب الأيدي: \`${userId}\``)
        .setFooter({ text: `بواسطة: ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch {
      await interaction.reply({ content: '❌ لم يتم العثور على حظر لهذا الأيدي أو الأيدي غير صحيح.', flags: 64 });
    }
  },

  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ لا تملك صلاحية إلغاء الحظر.');
    }

    const userId = args[0];
    if (!userId) return message.reply('❌ يرجى كتابة أيدي العضو المحظور.');

    try {
      await message.guild.bans.remove(userId, `إلغاء حظر بواسطة ${message.author.tag}`);
      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🔓 تم إلغاء حظر العضو بنجاح')
        .setDescription(`تم إلغاء حظر المستخدم صاحب الأيدي: \`${userId}\``)
        .setFooter({ text: `بواسطة: ${message.author.tag}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch {
      message.reply('❌ لم يتم العثور على حظر لهذا الأيدي.');
    }
  }
};
