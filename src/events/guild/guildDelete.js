const { EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const config = require('../../config.json');

module.exports = {
  name: 'guildDelete',
  async execute(guild, client) {
    logger.info(`📤 تم إزالة البوت من سيرفر: ${guild.name} (${guild.id})`);

    try {
      const botClient = client || guild.client;
      if (!botClient) return;

      const ownerId = config.ownerId
        || process.env.OWNER_ID
        || process.env.BOT_OWNER_ID
        || botClient.application?.owner?.id
        || null;

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
          { name: '🏠 Server', value: `**${guild.name}**\n\`${guild.id}\``, inline: false },
          { name: '👥 Members', value: `${(guild.memberCount || 0).toLocaleString()}`, inline: false },
          { name: '👑 Owner', value: `<@${guild.ownerId}> (\`${guild.ownerId}\`)`, inline: false }
        )
        .setFooter({ text: `${botName} • Server tracking`, iconURL: botAvatar })
        .setTimestamp();

      await botOwner.send({ embeds: [embed] }).catch(() => null);
    } catch (e) {
      logger.error(`[guildDelete Notification Error]: ${e.stack || e.message}`);
    }
  }
};
