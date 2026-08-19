const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const logger = require('./logger');
const config = require('../config.json');

function startBroadcastScheduler(client) {
  logger.info('بدء خدمة الإعلانات والرسائل المجدولة (Broadcast Scheduler)...');

  setInterval(async () => {
    try {
      const activeBroadcasts = db.getAllActiveBroadcasts();
      const now = Date.now();

      for (const b of activeBroadcasts) {
        const intervalMs = (b.interval_minutes || 60) * 60 * 1000;
        const lastSent = b.last_sent || 0;

        if (now - lastSent >= intervalMs) {
          const guild = client.guilds.cache.get(b.guild_id);
          if (!guild) continue;

          const channel = guild.channels.cache.get(b.channel_id);
          if (!channel) continue;

          if (b.title) {
            const embed = new EmbedBuilder()
              .setColor(config.colors.primary)
              .setTitle(b.title)
              .setDescription(b.message.replace(/\\n/g, '\n'))
              .setFooter({ text: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
              .setTimestamp();

            await channel.send({ embeds: [embed] }).catch(() => {});
          } else {
            await channel.send({ content: b.message.replace(/\\n/g, '\n') }).catch(() => {});
          }

          db.updateBroadcastLastSent(b.id, now);
        }
      }
    } catch (err) {
      logger.error(`خطأ في مجدول الإعلانات: ${err.message}`);
    }
  }, 30000); // يفحص كل 30 ثانية
}

module.exports = { startBroadcastScheduler };
