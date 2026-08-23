const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

module.exports = {
  name: 'user',
  description: 'عرض معلومات ومعرف العضو في السيرفر',
  aliases: ['userinfo', 'معلومات', 'عضو'],
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('عرض معلومات العضو')
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('العضو المراد عرض معلوماته (اختياري)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply().catch(() => { });

    const targetUser = interaction.options.getUser('target') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      return interaction.editReply({ content: '❌ لم يتم العثور على هذا العضو في السيرفر.' });
    }

    const roles = member.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => r)
      .join(', ') || 'لا توجد رتب';

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary || '#5865F2')
      .setTitle(`👤 معلومات العضو: ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
      .addFields(
        { name: '🆔 الأيدي (ID)', value: `\`${targetUser.id}\``, inline: true },
        { name: '🤖 بوت؟', value: targetUser.bot ? 'نعم' : 'لا', inline: true },
        { name: '📅 تاريخ الإنشاء', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '📥 تاريخ الانضمام للسيرفر', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'غير معروف', inline: true },
        { name: '🏷️ الرتب', value: roles.length > 1024 ? 'عدد الرتب كبير جداً للعرض' : roles, inline: false }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    const targetUser = message.mentions.users.first() ||
      (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) ||
      message.author;

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('❌ لم يتم العثور على هذا العضو.');

    const roles = member.roles.cache
      .filter(r => r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => r)
      .join(', ') || 'لا توجد رتب';

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary || '#5865F2')
      .setTitle(`👤 معلومات العضو: ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
      .addFields(
        { name: '🆔 الأيدي (ID)', value: `\`${targetUser.id}\``, inline: true },
        { name: '🤖 بوت؟', value: targetUser.bot ? 'نعم' : 'لا', inline: true },
        { name: '📅 تاريخ الإنشاء', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '📥 تاريخ الانضمام للسيرفر', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'غير معروف', inline: true },
        { name: '🏷️ الرتب', value: roles.length > 1024 ? 'عدد الرتب كبير جداً للعرض' : roles, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
};