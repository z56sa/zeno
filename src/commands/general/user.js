const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config.json');

module.exports = {
  name: 'user',
  description: 'عرض معلومات حساب المستخدم',
  aliases: ['userinfo', 'مستخدم'],
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('عرض معلومات حسابك أو حساب مستخدم آخر')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('المستخدم المراد عرض معلوماته')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('target') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const embed = this.buildEmbed(targetUser, member);
    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args) {
    const targetUser = message.mentions.users.first() ||
                       (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null) ||
                       message.author;

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    const embed = this.buildEmbed(targetUser, member);
    await message.reply({ embeds: [embed] });
  },

  buildEmbed(user, member) {
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`👤 معلومات المستخدم: ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🆔 الأيدي (ID)', value: `\`${user.id}\``, inline: true },
        { name: '🏷️ الاسم', value: `${user.tag}`, inline: true },
        { name: '🤖 هل هو بوت؟', value: user.bot ? 'نعم' : 'لا', inline: true },
        { name: '📅 تاريخ إنشاء الحساب', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`, inline: false }
      );

    if (member) {
      const roles = member.roles.cache
        .filter(r => r.id !== member.guild.id)
        .map(r => `<@&${r.id}>`)
        .slice(0, 15)
        .join(', ') || 'لا توجد رتب';

      embed.addFields(
        { name: '📥 تاريخ الانضمام للسيرفر', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`, inline: false },
        { name: `👑 الرتب (${member.roles.cache.size - 1})`, value: roles, inline: false }
      );
    }

    return embed;
  }
};
