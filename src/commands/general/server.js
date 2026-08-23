const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../config.json');

module.exports = {
  name: 'server',
  description: 'عرض معلومات السيرفر وإحصائياته',
  aliases: ['serverinfo', 'سيرفر'],
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('عرض معلومات السيرفر وإحصائياته'),

  async execute(interaction) {
    const embed = await this.buildEmbed(interaction.guild);
    await interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message) {
    const embed = await this.buildEmbed(message.guild);
    await message.reply({ embeds: [embed] });
  },

  async buildEmbed(guild) {
    const owner = await guild.fetchOwner().catch(() => null);
    const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;

    return new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🏰 معلومات السيرفر: ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '🆔 أيدي السيرفر', value: `\`${guild.id}\``, inline: true },
        { name: '👑 مالك السيرفر', value: owner ? `<@${owner.id}>` : 'غير معروف', inline: true },
        { name: '📅 تاريخ الإنشاء', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: '👥 عدد الأعضاء', value: `\`${guild.memberCount}\` عضو`, inline: true },
        { name: '👑 عدد الرتب', value: `\`${guild.roles.cache.size}\` رتبة`, inline: true },
        { name: '🚀 مستوى التعزيز (Boost)', value: `المستوى ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} بوست)`, inline: true },
        { name: '💬 القنوات والرومات', value: `💬 كتابية: \`${textChannels}\` | 🔊 صوتية: \`${voiceChannels}\` | 📁 تصنيفات: \`${categories}\``, inline: false }
      )
      .setTimestamp();
  }
};
