const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  name: 'guildDelete',
  async execute(guild, client) {
    logger.info(`📤 تم إزالة البوت من سيرفر: ${guild.name} (${guild.id}) - عدد الأعضاء: ${guild.memberCount || 0}`);

    try {
      const botClient = client || guild.client;
      if (!botClient) return;

      let ownerId = process.env.OWNER_ID || process.env.BOT_OWNER_ID;
      if (!ownerId && botClient.application) {
        if (!botClient.application.owner) {
          await botClient.application.fetch().catch(() => null);
        }
        if (botClient.application.owner) {
          ownerId = botClient.application.owner.id || (botClient.application.owner.members ? botClient.application.owner.ownerId : null);
        }
      }

      if (!ownerId) return;

      const botOwner = await botClient.users.fetch(ownerId).catch(() => null);
      if (!botOwner) return;

      const botName = botClient.user.username || 'ZENO';
      const botAvatar = botClient.user.displayAvatarURL({ dynamic: true });
      const guildIcon = guild.iconURL({ dynamic: true, size: 256 }) || botAvatar;

      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle(`❌ ${botName} left a server`)
        .setDescription(`The bot has been removed from **${guild.name}**.`)
        .setThumbnail(guildIcon)
        .addFields(
          {
            name: '🏠 Server',
            value: `**${guild.name}**\n\`${guild.id}\``,
            inline: false
          },
          {
            name: '👥 Members',
            value: `${(guild.memberCount || 0).toLocaleString()}`,
            inline: false
          },
          {
            name: '👑 Owner',
            value: `<@${guild.ownerId}> (\`${guild.ownerId}\`)`,
            inline: false
          }
        )
        .setFooter({
          text: `${botName} • Server tracking`,
          iconURL: botAvatar
        })
        .setTimestamp();

      await botOwner.send({ embeds: [embed] }).catch(() => null);
    } catch (e) {
      logger.error(`[guildDelete Notification Error]: ${e.message}`);
    }
  }
};
